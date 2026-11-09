# Generate letter N icons (assets/icon.png and assets/icon.ico)
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path assets | Out-Null
Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBytesList = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Pure minimal black background matching Neutrino aesthetic
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 10, 11))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
    $bgBrush.Dispose()

    # Crisp white capital letter N - pure typography, no effects
    # Use Arial / Segoe UI / Trebuchet MS for clean modern geometric strokes
    $fontSize = [float]($size * 0.64)
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $rect = New-Object System.Drawing.RectangleF(0, [float]($size * 0.02), [float]$size, [float]$size)
    $g.DrawString('N', $font, $textBrush, $rect, $stringFormat)

    $textBrush.Dispose()
    $font.Dispose()
    $stringFormat.Dispose()
    $g.Dispose()

    if ($size -eq 256) {
        $bmp.Save('assets/icon.png', [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytesList += ,$ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()
}

# Construct standard multi-size Windows ICO file
$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoMs)

# ICONDIR header (6 bytes)
$bw.Write([uint16]0)            # Reserved must be 0
$bw.Write([uint16]1)            # Resource type: 1 = icon
$bw.Write([uint16]$sizes.Count) # Number of images

$offset = 6 + (16 * $sizes.Count)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $w = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $h = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bytes = $pngBytesList[$i]

    # ICONDIRENTRY (16 bytes)
    $bw.Write($w)                    # Width
    $bw.Write($h)                    # Height
    $bw.Write([byte]0)               # Color count (0 = >=8bpp)
    $bw.Write([byte]0)               # Reserved
    $bw.Write([uint16]1)             # Color planes
    $bw.Write([uint16]32)            # Bits per pixel
    $bw.Write([uint32]$bytes.Length) # Image size in bytes
    $bw.Write([uint32]$offset)       # Image offset in file

    $offset += $bytes.Length
}

# Image data (PNG blocks)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bw.Write($pngBytesList[$i])
}

$bw.Flush()
[System.IO.File]::WriteAllBytes('assets/icon.ico', $icoMs.ToArray())
$bw.Dispose()
$icoMs.Dispose()

Write-Output "Generated assets/icon.png and assets/icon.ico successfully!"

