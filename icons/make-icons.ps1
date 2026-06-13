# Regenerates icon16/32/48/128.png from Icon.png.
# Detects the rounded-square artwork inside the white canvas, then outputs
# each size as 32-bit PNG with transparent corners (so no white box in the toolbar).
# Existing icons are backed up to icons\_backup first.
#
# Usage: powershell -ExecutionPolicy Bypass -File icons\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $dir 'Icon.png'

# back up current icons
$bak = Join-Path $dir '_backup'
New-Item -ItemType Directory -Force -Path $bak | Out-Null
foreach($s in 16,32,48,128){
  $f = Join-Path $dir "icon$s.png"
  if(Test-Path -LiteralPath $f){ Copy-Item -LiteralPath $f -Destination (Join-Path $bak "icon$s.png") -Force }
}

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap $img
$W=$bmp.Width; $H=$bmp.Height
function IsDark($c){ return (($c.R + $c.G + $c.B) -lt 650) }

$midY=[int]($H/2); $midX=[int]($W/2)
$x0=0;     for($x=0;$x -lt $W;$x++){     if(IsDark $bmp.GetPixel($x,$midY)){$x0=$x;break} }
$x1=$W-1;  for($x=$W-1;$x -ge 0;$x--){   if(IsDark $bmp.GetPixel($x,$midY)){$x1=$x;break} }
$y0=0;     for($y=0;$y -lt $H;$y++){     if(IsDark $bmp.GetPixel($midX,$y)){$y0=$y;break} }
$y1=$H-1;  for($y=$H-1;$y -ge 0;$y--){   if(IsDark $bmp.GetPixel($midX,$y)){$y1=$y;break} }

# corner radius: walk in from the top-left along a row just inside the top edge
$ey=$y0+3; $xL=$x0
for($x=$x0;$x -lt $midX;$x++){ if(IsDark $bmp.GetPixel($x,$ey)){$xL=$x;break} }
$r = $xL - $x0
if($r -lt 4){ $r = [int](($x1-$x0)*0.14) }
$bw=$x1-$x0+1; $bh=$y1-$y0+1
Write-Host "Detected artwork bbox: x=$x0..$x1 y=$y0..$y1 (size ${bw}x${bh}), corner r=$r"
$bmp.Dispose()

foreach($sz in 16,32,48,128){
  $out = New-Object System.Drawing.Bitmap $sz,$sz,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($out)
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rr=[single]($r * $sz / $bw); $d=[single]($rr*2)
  $path=New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0,0,$d,$d,180,90)
  $path.AddArc($sz-$d,0,$d,$d,270,90)
  $path.AddArc($sz-$d,$sz-$d,$d,$d,0,90)
  $path.AddArc(0,$sz-$d,$d,$d,90,90)
  $path.CloseFigure()
  $g.SetClip($path)
  $dst=New-Object System.Drawing.Rectangle 0,0,$sz,$sz
  $g.DrawImage($img,$dst,$x0,$y0,$bw,$bh,[System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $out.Save((Join-Path $dir "icon$sz.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  Write-Host "Wrote icon$sz.png"
}
$img.Dispose()
Write-Host "Done. Old icons backed up in $bak"
