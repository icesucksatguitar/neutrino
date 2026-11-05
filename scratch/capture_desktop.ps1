Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$width = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$height = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$outPath = 'C:\Users\simpl\.gemini\antigravity\brain\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c\desktop_current_view.png'
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Desktop captured to $outPath"

