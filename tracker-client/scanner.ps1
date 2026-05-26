# Baby Steps - Memory Scanner (ASCII only)
# Run this ONCE to find the height memory address. Saves result to addr.json.

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;

public class MemScanner {
    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(int access, bool inherit, int pid);

    [DllImport("kernel32.dll")]
    public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr addr,
        byte[] buf, int size, out int read);

    [DllImport("kernel32.dll")]
    public static extern bool VirtualQueryEx(IntPtr hProcess, IntPtr addr,
        out MBI mbi, int size);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    public struct MBI {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint   AllocationProtect;
        public IntPtr RegionSize;
        public uint   State;
        public uint   Protect;
        public uint   Type;
    }

    public static IntPtr Open() {
        foreach (var p in Process.GetProcessesByName("BabySteps"))
            return OpenProcess(0x1F0FFF, false, p.Id);
        return IntPtr.Zero;
    }

    public static List<long> ScanAll(IntPtr h, float minV, float maxV) {
        var hits = new List<long>();
        long addr = 0x10000;
        MBI mbi;
        int mbiSize = Marshal.SizeOf(typeof(MBI));
        int rd;

        while (VirtualQueryEx(h, (IntPtr)addr, out mbi, mbiSize)) {
            long sz = mbi.RegionSize.ToInt64();
            if (mbi.State == 0x1000 && (mbi.Protect == 4 || mbi.Protect == 8) && sz < 64*1024*1024) {
                byte[] buf = new byte[sz];
                if (ReadProcessMemory(h, mbi.BaseAddress, buf, (int)sz, out rd) && rd > 3) {
                    for (int i = 0; i < rd - 3; i += 4) {
                        float v = BitConverter.ToSingle(buf, i);
                        if (v >= minV && v <= maxV && !float.IsNaN(v) && !float.IsInfinity(v))
                            hits.Add(mbi.BaseAddress.ToInt64() + i);
                    }
                }
            }
            long next = mbi.BaseAddress.ToInt64() + sz;
            if (next <= addr) break;
            addr = next;
        }
        return hits;
    }

    public static List<long> FilterChanged(IntPtr h, List<long> candidates,
                                           float[] oldVals, int direction, float minDelta) {
        var kept = new List<long>();
        var tmp = new byte[4];
        int rd;
        for (int i = 0; i < candidates.Count; i++) {
            ReadProcessMemory(h, (IntPtr)candidates[i], tmp, 4, out rd);
            if (rd < 4) continue;
            float newV = BitConverter.ToSingle(tmp, 0);
            float delta = newV - oldVals[i];
            if (direction == 1  && delta >=  minDelta) kept.Add(candidates[i]);
            if (direction == -1 && delta <= -minDelta) kept.Add(candidates[i]);
        }
        return kept;
    }

    public static float ReadFloat(IntPtr h, long addr) {
        var buf = new byte[4]; int rd;
        ReadProcessMemory(h, (IntPtr)addr, buf, 4, out rd);
        return rd == 4 ? BitConverter.ToSingle(buf, 0) : float.NaN;
    }

    public static float[] Snapshot(IntPtr h, List<long> candidates) {
        var vals = new float[candidates.Count];
        var buf = new byte[4]; int rd;
        for (int i = 0; i < candidates.Count; i++) {
            ReadProcessMemory(h, (IntPtr)candidates[i], buf, 4, out rd);
            vals[i] = rd == 4 ? BitConverter.ToSingle(buf, 0) : float.NaN;
        }
        return vals;
    }
}
"@

function Write-Color($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }

function Pause-AndWait($msg) {
    Write-Color "`n$msg" "Yellow"
    Write-Color "Appuie sur ENTREE quand c'est fait..." "DarkGray"
    $null = Read-Host
}

Write-Color "`n==========================================" "Cyan"
Write-Color "  Baby Steps - Scanner adresse memoire  " "Cyan"
Write-Color "==========================================`n" "Cyan"

Write-Color "Recherche BabySteps.exe..." "Gray"
$handle = [MemScanner]::Open()
if ($handle -eq [IntPtr]::Zero) {
    Write-Color "ERREUR : BabySteps.exe non trouve. Lance le jeu d'abord !" "Red"
    exit 1
}
Write-Color "Jeu trouve !`n" "Green"

Pause-AndWait "ETAPE 1 : Mets-toi au BAS de la montagne. Ne bouge pas."

Write-Color "Scan en cours (10-20 secondes)..." "Gray"
$candidates = [MemScanner]::ScanAll($handle, 0.0, 5000.0)
Write-Color "$($candidates.Count) adresses trouvees.`n" "Green"

if ($candidates.Count -eq 0) {
    Write-Color "Aucune adresse. Le jeu est bien en cours de jeu ?" "Red"
    exit 1
}

$round = 1
while ($candidates.Count -gt 5 -and $round -le 8) {
    Write-Color "--- Round $round --- ($($candidates.Count) candidats)" "Cyan"

    $before = [MemScanner]::Snapshot($handle, $candidates)
    Pause-AndWait "MONTE le plus haut possible, puis reviens ici."
    $candidates = [MemScanner]::FilterChanged($handle, $candidates, $before, 1, 0.5)
    Write-Color "$($candidates.Count) candidats apres montee.`n" "Yellow"

    if ($candidates.Count -le 5) { break }

    $before = [MemScanner]::Snapshot($handle, $candidates)
    Pause-AndWait "TOMBE / redescends, puis reviens ici."
    $candidates = [MemScanner]::FilterChanged($handle, $candidates, $before, -1, 0.5)
    Write-Color "$($candidates.Count) candidats apres descente.`n" "Yellow"

    $round++
}

if ($candidates.Count -eq 0) {
    Write-Color "Aucune adresse isolee. Relance le scanner avec des mouvements plus amples." "Red"
    exit 1
}

Write-Color "`n=== ADRESSES CANDIDATES ===" "Green"
$best = $null
$bestVal = -1
foreach ($addr in $candidates) {
    $v = [MemScanner]::ReadFloat($handle, $addr)
    Write-Color ("  0x{0:X} => {1:F2}" -f $addr, $v) "White"
    if ($v -gt $bestVal) { $bestVal = $v; $best = $addr }
}

Write-Color "`nSurveillance live (bouge dans le jeu pour confirmer)..." "Cyan"
$lastVal = [MemScanner]::ReadFloat($handle, $best)
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $v = [MemScanner]::ReadFloat($handle, $best)
    $arrow = if ($v -gt $lastVal) { "^" } elseif ($v -lt $lastVal) { "v" } else { "-" }
    Write-Host ("`r  Valeur : {0:F3}  {1}   " -f $v, $arrow) -NoNewline
    $lastVal = $v
}
Write-Host ""

$out = @{ address = $best; lastValue = $lastVal } | ConvertTo-Json
$outPath = Join-Path $PSScriptRoot "addr.json"
$out | Out-File -FilePath $outPath -Encoding utf8
Write-Color "`nAdresse sauvegardee : 0x$($best.ToString('X'))" "Green"
Write-Color "Lance maintenant : node auto-tracker.js playerA`n" "Cyan"

[MemScanner]::CloseHandle($handle) | Out-Null
