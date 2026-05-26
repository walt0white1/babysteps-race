// file-tracker.js
// Surveille path0_0.sav et envoie la progression au serveur automatiquement.
// Usage : node file-tracker.js playerA
//         node file-tracker.js playerB

const fs    = require('fs');
const http  = require('http');
const https = require('https');

const PLAYER_ID  = process.argv[2] || 'playerA';

// Accepte soit SERVER_URL (URL complete, ex: https://babysteps-race.onrender.com)
// soit SERVER + PORT (localhost)
const SERVER_URL = process.env.SERVER_URL || null;
const SERVER     = process.env.SERVER || 'localhost';
const PORT       = process.env.PORT   || 3001;

// Chemin vers le fichier de sauvegarde — détecte automatiquement le SteamID
function findSavePath() {
  if (process.env.SAVE_PATH) return process.env.SAVE_PATH;
  const base = `C:\\Users\\${process.env.USERNAME}\\AppData\\LocalLow\\DefaultCompany\\Babysteps`;
  try {
    const dirs = require('fs').readdirSync(base).filter(d => /^\d+$/.test(d));
    if (dirs.length > 0) return `${base}\\${dirs[0]}\\save\\path0_0.sav`;
  } catch(e) {}
  return null;
}
const SAVE_PATH = findSavePath();

const BASE_URL = SERVER_URL || `http://${SERVER}:${PORT}`;

console.log(`[Tracker] Joueur : ${PLAYER_ID}`);
console.log(`[Tracker] Fichier : ${SAVE_PATH}`);
console.log(`[Tracker] Serveur : ${BASE_URL}\n`);

// Verifie que le fichier existe
if (!fs.existsSync(SAVE_PATH)) {
  console.error('[ERREUR] Fichier introuvable. Lance Baby Steps au moins une fois.');
  process.exit(1);
}

// ─── Parsing du fichier ────────────────────────────────────────────────────
// path0_0.sav stocke des paires de coordonnees int16 (X, Y) par point.
// Le Y le plus grand = point le plus haut atteint.

let baseline = null;   // Y au debut (premier point du fichier)
let lastSent  = -1;

function parseFile(buf) {
  let maxY    = null;
  let firstY  = null;
  let lastY   = null;

  for (let i = 0; i + 3 < buf.length; i += 4) {
    const x = buf.readInt16LE(i);
    const y = buf.readInt16LE(i + 2);

    if (x === 0 && y === 0) break;

    if (firstY === null) firstY = y;
    if (maxY === null || y > maxY) maxY = y;
    lastY = y;
  }

  return { firstY, maxY, lastY };
}

function computeHeight(buf) {
  const { firstY, maxY, lastY } = parseFile(buf);
  if (firstY === null) return null;

  if (baseline === null) {
    baseline = firstY;
    console.log(`[Tracker] Baseline Y = ${baseline}`);
  }

  // height = position actuelle (derniere coord = peut descendre)
  // maxHeight = record (plus haut jamais atteint)
  const height    = Math.max(0, lastY - baseline);
  const maxHeight = Math.max(0, maxY  - baseline);
  return { height, maxHeight };
}

// ─── Envoi au serveur (HTTP simple, pas de dependances) ────────────────────

function sendHeight(height, maxHeight) {
  const body = JSON.stringify({ playerId: PLAYER_ID, height, maxHeight });

  if (SERVER_URL) {
    // URL complete (ex: https://babysteps-race.onrender.com)
    const url      = new URL('/api/update', SERVER_URL);
    const lib      = url.protocol === 'https:' ? https : http;
    const port     = url.port || (url.protocol === 'https:' ? 443 : 80);
    const req = lib.request({
      hostname: url.hostname,
      port,
      path:     '/api/update',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } else {
    const req = http.request({
      hostname: SERVER,
      port:     PORT,
      path:     '/api/update',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  }
}

// ─── Watcher ──────────────────────────────────────────────────────────────

function onFileChange() {
  try {
    const buf    = fs.readFileSync(SAVE_PATH);
    const result = computeHeight(buf);
    if (result === null) return;

    const { height, maxHeight } = result;

    if (Math.abs(height - lastSent) >= 1) {
      lastSent = height;
      sendHeight(height, maxHeight);
      process.stdout.write(`\r[Tracker] ${PLAYER_ID} => pos: ${height} | record: ${maxHeight}   `);
    }
  } catch (e) {}
}

// Lecture initiale au demarrage
onFileChange();

// Surveille le fichier
fs.watch(SAVE_PATH, { persistent: true }, (event) => {
  if (event === 'change') onFileChange();
});

console.log('[Tracker] Surveillance active. Joue et regarde la progression !');
console.log('(Ctrl+C pour arreter)\n');
