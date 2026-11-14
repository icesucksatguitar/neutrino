Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class Win32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBmp, uint nFlags);

    public static List<IntPtr> GetProcessWindows(uint pid) {
        List<IntPtr> windows = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            uint procId;
            GetWindowThreadProcessId(hWnd, out procId);
            if (procId == pid && IsWindowVisible(hWnd)) {
                RECT r;
                GetWindowRect(hWnd, out r);
                if (r.Right - r.Left > 200 && r.Bottom - r.Top > 200) {
                    windows.Add(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
        return windows;
    }
}
"@
Add-Type -TypeDefinition $code

$env:PATH = "C:\Users\simpl\OneDrive\Desktop\neutrino\rust\src-tauri\.tools;" + $env:PATH
$exe = (Resolve-Path "rust/src-tauri/target/debug/neutrino-rust.exe").Path
$proc = Start-Process -FilePath $exe -PassThru

Write-Output "Launched process $($proc.Id), waiting 6s for UI to render..."
Start-Sleep -Seconds 6

$windows = [Win32]::GetProcessWindows([uint32]$proc.Id)
if ($windows.Count -eq 0) {
    # Check if WebView2 spawned child processes
    $childProcs = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $proc.Id }
    foreach ($cp in $childProcs) {
        $cw = [Win32]::GetProcessWindows([uint32]$cp.ProcessId)
        if ($cw.Count -gt 0) {
            $windows = $cw
            break
        }
    }
}

Write-Output "Found $($windows.Count) window(s)"

if ($windows.Count -gt 0) {
    $hwnd = $windows[0]
    [Win32]::ShowWindow($hwnd, 9)
    [Win32]::SetForegroundWindow($hwnd)
    Start-Sleep -Milliseconds 1000

    $rect = New-Object Win32+RECT
    [Win32]::GetWindowRect($hwnd, [ref]$rect)
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top

    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $hdc = $g.GetHdc()
    $res = [Win32]::PrintWindow($hwnd, $hdc, 2)
    $g.ReleaseHdc($hdc)

    if (-not $res) {
        # Fallback to 0 flag
        $hdc = $g.GetHdc()
        [Win32]::PrintWindow($hwnd, $hdc, 0)
        $g.ReleaseHdc($hdc)
    }
    
    $outPath1 = (Resolve-Path "docs/parity").Path + "\tauri_homescreen.png"
    $bmp.Save($outPath1, [System.Drawing.Imaging.ImageFormat]::Png)

    $artifactDir = "C:\Users\simpl\.gemini\antigravity\brain\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c"
    if (Test-Path $artifactDir) {
        $bmp.Save("$artifactDir\tauri_homescreen.png", [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Successfully captured Tauri homescreen to $outPath1 ($w x $h)"
}

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
