# Converts every image in .\source into Chrome Web Store-compliant screenshots:
#   1280 x 800, 24-bit PNG (no alpha).
# Each source image is scaled to fit (contain) and centered on a dark background.
# Output is written to .\screenshots as screenshot-01.png, screenshot-02.png, ...
#
# Usage: put your captures (PNG/JPG) into store-assets\source\, then run:
#   powershell -ExecutionPolicy Bypass -File store-assets\make-screenshots.ps1

Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'source'
$dst  = Join-Path $here 'screenshots'
New-Item -ItemType Directory -Force -Path $src | Out-Null
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$W = 1280; $H = 800
$bg = [System.Drawing.Color]::FromArgb(255, 13, 16, 24)

$images = Get-ChildItem $src -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg)$' }
if (-not $images) { Write-Host "No images found in $src - drop your screenshots there first."; return }

$n = 0
foreach ($img in $images) {
  $n++
  $srcImg = [System.Drawing.Image]::FromFile($img.FullName)
  $scale = [Math]::Min($W / $srcImg.Width, $H / $srcImg.Height)
  $dw = [int]($srcImg.Width * $scale)
  $dh = [int]($srcImg.Height * $scale)
  $ox = [int](($W - $dw) / 2)
  $oy = [int](($H - $dh) / 2)

  $canvas = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear($bg)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($srcImg, $ox, $oy, $dw, $dh)
  $g.Dispose()

  $outFile = Join-Path $dst ("screenshot-{0:D2}.png" -f $n)
  $canvas.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  $srcImg.Dispose()
  Write-Host ("Wrote {0}  ({1}x{2} image centered on 1280x800)" -f $outFile, $dw, $dh)
}
Write-Host "Done - $n screenshot(s) ready in $dst"
