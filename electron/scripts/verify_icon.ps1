Add-Type -AssemblyName System.Drawing
$exePath = (Resolve-Path 'release\Neutrino-win32-x64\Neutrino.exe').Path
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
if ($icon -ne $null) {
    Write-Output "Successfully verified icon inside Neutrino.exe: Size=$($icon.Width)x$($icon.Height)"
    $bmp = $icon.ToBitmap()
    $bmp.Save('assets/extracted_exe_icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $icon.Dispose()
    Write-Output "Saved assets/extracted_exe_icon.png"
} else {
    Write-Error "Could not extract icon from Neutrino.exe"
}

