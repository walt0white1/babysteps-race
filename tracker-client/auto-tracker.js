// auto-tracker.js — Lit la hauteur depuis la mémoire du jeu et l'envoie au serveur
// Nécessite addr.json (généré par scanner.ps1)

const { execSync, spawn } = require('child_process');
const { io }              = require('socket.io-client');
const fs                  = require('fs');
const path                = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const SERVER_URL  = process.env.SERVER_URL  || 'http://localhost:3001';
const PLAYER_ID   = process.env.PLAYER_ID   || process.argv[2] || 'playerA';
const POLL_MS     = parseInt(process.env.POLL_MS || '150');  // lecture toutes les 150ms
const FALL_DELTA  = parseFloat(process.env.FALL_DELTA || '3'); // chute si drop > 3 unités

// ─── Charger l'adresse ───────────────────────────────────────────────────────

const addrFile = path.join(__dirname, 'addr.json');
if (!fs.existsSync(addrFile)) {
  console.error('[ERREUR] addr.json introuvable. Lance d\'abord : scanner.ps1');
  process.exit(1);
}
const { address } = JSON.parse(fs.readFileSync(addrFile, 'utf8'));
console.log(`[Tracker] Adresse mémoire : 0x${address.toString(16).toUpperCase()}`);

// ─── Script PowerShell inline pour lire un float ─────────────────────────────
// On lance PowerShell avec le code C# embarqué pour lire la mémoire.

const PS_READER = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
public class R {
  [DllImport("kernel32.dll")]
  public static extern IntPtr OpenProcess(int a,bool b,int pid);
  [DllImport("kernel32.dll")]
  public static extern bool ReadProcessMemory(IntPtr h,IntPtr addr,byte[] buf,int sz,out int rd);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr h);
  public static float Read(long address) {
    foreach(var p in Process.GetProcessesByName("BabySteps")) {
      var h = OpenProcess(0x10, false, p.Id);
      var buf = new byte[4]; int rd;
      ReadProcessMemory(h,(IntPtr)address,buf,4,out rd);
      CloseHandle(h);
      if(rd==4) return BitConverter.ToSingle(buf,0);
    }
    return float.NaN;
  }
}
"@
$v = [R]::Read(${address}L)
Write-Output $v
`;

// Cache le type C# compilé entre les lectures en utilisant un process PS persistant
let psProcess = null;
let readQueue = [];
let readBuffer = '';

function startPSProcess() {
  psProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Charger le type C# une seule fois au démarrage
  const init = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
public class FastReader {
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(int a,bool b,int pid);
  [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr h,IntPtr a,byte[] buf,int sz,out int rd);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  static IntPtr _h = IntPtr.Zero;
  public static void Init() {
    foreach(var p in Process.GetProcessesByName("BabySteps")) {
      _h = OpenProcess(0x10, false, p.Id); break;
    }
  }
  public static string Read(long addr) {
    if(_h==IntPtr.Zero) Init();
    var buf=new byte[4]; int rd;
    if(!ReadProcessMemory(_h,(IntPtr)addr,buf,4,out rd)||rd!=4) { Init(); return "NaN"; }
    return BitConverter.ToSingle(buf,0).ToString("F4",System.Globalization.CultureInfo.InvariantCulture);
  }
}
"@
[FastReader]::Init()
Write-Output "READY"
`;

  psProcess.stdin.write(init + '\n');

  psProcess.stdout.on('data', (data) => {
    readBuffer += data.toString();
    const lines = readBuffer.split('\n');
    readBuffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'READY') continue;
      const cb = readQueue.shift();
      if (cb) cb(parseFloat(trimmed));
    }
  });

  psProcess.on('exit', () => {
    console.log('[PS] Process terminé, redémarrage...');
    psProcess = null;
    setTimeout(startPSProcess, 1000);
  });
}

function readHeight() {
  return new Promise((resolve) => {
    if (!psProcess) return resolve(NaN);
    readQueue.push(resolve);
    psProcess.stdin.write(`[FastReader]::Read(${address}L)\n`);
    // Timeout de sécurité
    setTimeout(() => {
      const idx = readQueue.indexOf(resolve);
      if (idx !== -1) { readQueue.splice(idx, 1); resolve(NaN); }
    }, 500);
  });
}

// ─── Socket ──────────────────────────────────────────────────────────────────

const socket = io(SERVER_URL, { reconnection: true });

socket.on('connect',    () => console.log(`[WS] Connecté → ${SERVER_URL} (${PLAYER_ID})`));
socket.on('disconnect', () => console.log('[WS] Déconnecté, reconnexion...'));

// ─── Boucle principale ───────────────────────────────────────────────────────

let lastHeight  = null;
let lastSent    = null;
let rawBaseline = null; // valeur brute en unités Unity au sol
let rawToMeters = null; // facteur de conversion (calibré manuellement ou déduit)

startPSProcess();

// Attendre que PS soit prêt
setTimeout(async () => {
  console.log(`[Tracker] Démarrage — lecture toutes les ${POLL_MS}ms`);

  setInterval(async () => {
    const raw = await readHeight();
    if (isNaN(raw)) return;

    // Initialise la baseline au premier read
    if (rawBaseline === null) {
      rawBaseline = raw;
      console.log(`[Tracker] Baseline Unity = ${raw.toFixed(2)}`);
    }

    // Conversion en "mètres de jeu" : différence par rapport au sol
    // Le facteur 1.0 = 1 unité Unity ≈ 1 mètre (à ajuster si besoin)
    const height = Math.max(0, raw - rawBaseline);

    // Détecte une chute (drop brutal)
    const isFall = lastHeight !== null && (height - lastHeight) < -FALL_DELTA;
    if (isFall) {
      console.log(`[Tracker] CHUTE détectée ! ${lastHeight?.toFixed(1)} → ${height.toFixed(1)}`);
      socket.emit('fall', { playerId: PLAYER_ID });
    }

    // N'envoie que si changement significatif (évite le spam)
    if (lastSent === null || Math.abs(height - lastSent) >= 0.3) {
      socket.emit('update_player', { playerId: PLAYER_ID, height });
      lastSent = height;
      process.stdout.write(`\r[Tracker] ${PLAYER_ID} — ${height.toFixed(1)}m (raw: ${raw.toFixed(2)})   `);
    }

    lastHeight = height;
  }, POLL_MS);

}, 3000); // 3s pour que PS charge le type C#
