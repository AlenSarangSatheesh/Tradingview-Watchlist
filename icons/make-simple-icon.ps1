# Renders a clean, trademark-safe "watchlist" mark for the small toolbar sizes
# (icon16/32/48) plus a 256px master (icon-mark-256.png) used by the promo tiles.
# The detailed icon128.png (store icon) is left untouched.
#
# Usage: powershell -ExecutionPolicy Bypass -File icons\make-simple-icon.ps1

Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Rounded($x,$y,$w,$h,$r){
  $p=New-Object System.Drawing.Drawing2D.GraphicsPath
  $d=[single]($r*2)
  $p.AddArc([single]$x,[single]$y,$d,$d,180,90)
  $p.AddArc([single]($x+$w-$d),[single]$y,$d,$d,270,90)
  $p.AddArc([single]($x+$w-$d),[single]($y+$h-$d),$d,$d,0,90)
  $p.AddArc([single]$x,[single]($y+$h-$d),$d,$d,90,90)
  $p.CloseFigure(); return $p
}

function Render-Mark([int]$S,$file){
  $bmp=New-Object System.Drawing.Bitmap $S,$S,([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  # rounded-square body with blue -> violet diagonal gradient
  $body=Rounded 0 0 $S $S ($S*0.225)
  $rect=New-Object System.Drawing.Rectangle 0,0,$S,$S
  $c1=[System.Drawing.Color]::FromArgb(255,63,107,255)
  $c2=[System.Drawing.Color]::FromArgb(255,138,92,255)
  $lg=New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,$c1,$c2,([System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
  $g.FillPath($lg,$body); $lg.Dispose(); $body.Dispose()
  # three white watchlist rows: square bullet + bar
  $white=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $rowH=$S*0.135; $gap=$S*0.085
  $totalH=3*$rowH+2*$gap; $startY=($S-$totalH)/2
  $leftX=$S*0.215; $bullet=$rowH
  $barX=$leftX+$bullet+$S*0.085; $barRight=$S*0.80; $barW=$barRight-$barX
  for($i=0;$i -lt 3;$i++){
    $y=$startY+$i*($rowH+$gap)
    $bp=Rounded $leftX $y $bullet $bullet ($bullet*0.30)
    $g.FillPath($white,$bp); $bp.Dispose()
    $barH=$rowH*0.80; $barY=$y+($rowH-$barH)/2
    $barp=Rounded $barX $barY $barW $barH ($barH/2)
    $g.FillPath($white,$barp); $barp.Dispose()
  }
  $white.Dispose(); $g.Dispose()
  $bmp.Save($file,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  Write-Host "Wrote $(Split-Path $file -Leaf)"
}

Render-Mark 16  (Join-Path $dir 'icon16.png')
Render-Mark 32  (Join-Path $dir 'icon32.png')
Render-Mark 48  (Join-Path $dir 'icon48.png')
Render-Mark 256 (Join-Path $dir 'icon-mark-256.png')
Write-Host "Done. icon128.png (detailed store icon) left unchanged."
