# Builds branded, captioned Chrome Web Store marketing images:
#   - 4 screenshots (1280x800)
#   - marquee promo tile (1400x560)
#   - small promo tile (440x280)
# All 24-bit PNG (no alpha). Source captures are pulled from ..\docs\assets\img.
# Output -> store-assets\marketing\
#
# Usage: powershell -ExecutionPolicy Bypass -File store-assets\make-marketing.ps1

Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Split-Path -Parent $here
$imgDir = Join-Path $proj 'docs\assets\img'
$iconPath = Join-Path $proj 'icons\icon128.png'
$shots = Join-Path $here 'screenshots'
$tiles = $here
New-Item -ItemType Directory -Force -Path $shots | Out-Null

# ---------- palette ----------
function C([int]$r,[int]$g,[int]$b,[int]$a=255){ [System.Drawing.Color]::FromArgb($a,$r,$g,$b) }
$cWhite  = C 240 243 248
$cMuted  = C 150 160 176
$cAccent = C 120 150 255      # text accent (lighter for dark bg)
$cAccentStrong = C 64 110 245 # rings / checks
$bgTop = C 15 18 26
$bgBot = C 8 10 15

# ---------- helpers ----------
function New-RoundedPath($x,$y,$w,$h,$r){
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single]($r*2)
  $p.AddArc([single]$x,[single]$y,$d,$d,180,90)
  $p.AddArc([single]($x+$w-$d),[single]$y,$d,$d,270,90)
  $p.AddArc([single]($x+$w-$d),[single]($y+$h-$d),$d,$d,0,90)
  $p.AddArc([single]$x,[single]($y+$h-$d),$d,$d,90,90)
  $p.CloseFigure()
  return $p
}

function Fill-Background($g,$W,$H,[single]$glowCx,[single]$glowCy){
  $rect = New-Object System.Drawing.Rectangle 0,0,$W,$H
  $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,$bgTop,$bgBot,([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($lg,$rect); $lg.Dispose()
  # accent radial glow
  $gw = [single]($W*1.15); $gh = [single]($H*1.1)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse([single]($glowCx-$gw/2),[single]($glowCy-$gh/2),$gw,$gh)
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $pgb.CenterPoint = New-Object System.Drawing.PointF([single]$glowCx,[single]$glowCy)
  $pgb.CenterColor = C 64 110 245 52
  $pgb.SurroundColors = @((C 64 110 245 0))
  $g.FillPath($pgb,$path); $pgb.Dispose(); $path.Dispose()
}

function Draw-Shadow($g,$x,$y,$w,$h,$r){
  for($i=14;$i -ge 1;$i--){
    $grow = $i*1.4
    $path = New-RoundedPath ($x-$grow) ($y-$grow+10) ($w+2*$grow) ($h+2*$grow) ($r+$grow)
    $b = New-Object System.Drawing.SolidBrush (C 0 0 0 5)
    $g.FillPath($b,$path); $b.Dispose(); $path.Dispose()
  }
}

function Draw-FramedImage($g,$img,$x,$y,$w,$h,$r){
  Draw-Shadow $g $x $y $w $h $r
  $path = New-RoundedPath $x $y $w $h $r
  $st = $g.Save()
  $g.SetClip($path)
  $g.DrawImage($img,[single]$x,[single]$y,[single]$w,[single]$h)
  $g.Restore($st)
  $pen = New-Object System.Drawing.Pen ((C 255 255 255 60)),([single]1)
  $g.DrawPath($pen,$path); $pen.Dispose(); $path.Dispose()
}

function Crop-Image($img,$cx,$cy,$cw,$ch){
  $bmp = New-Object System.Drawing.Bitmap ([int]$cw),([int]$ch)
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $dst = New-Object System.Drawing.Rectangle 0,0,([int]$cw),([int]$ch)
  $gg.DrawImage($img,$dst,[int]$cx,[int]$cy,[int]$cw,[int]$ch,[System.Drawing.GraphicsUnit]::Pixel)
  $gg.Dispose()
  return $bmp
}

function Stamp-Icon($img,$x,$y,$w,$h){
  $g=[System.Drawing.Graphics]::FromImage($img)
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($icon,[single]$x,[single]$y,[single]$w,[single]$h)
  $g.Dispose()
}
function Text-W($g,$text,$font){ return $g.MeasureString($text,$font).Width }
function Draw-Text($g,$text,$font,$color,$x,$y){
  $b = New-Object System.Drawing.SolidBrush $color
  $g.DrawString($text,$font,$b,[single]$x,[single]$y); $b.Dispose()
}
function Draw-Centered($g,$text,$font,$color,$cx,$y){
  $w = Text-W $g $text $font
  Draw-Text $g $text $font $color ($cx-$w/2) $y
}

function New-Graphics($bmp){
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  return $g
}

# ---------- fonts ----------
$PX = [System.Drawing.GraphicsUnit]::Pixel
$B  = [System.Drawing.FontStyle]::Bold
$R  = [System.Drawing.FontStyle]::Regular
$fEyebrow = New-Object System.Drawing.Font "Segoe UI",15,$B,$PX
$fHead    = New-Object System.Drawing.Font "Segoe UI Semibold",37,$B,$PX
$fSub     = New-Object System.Drawing.Font "Segoe UI",21,$R,$PX
$fTitle   = New-Object System.Drawing.Font "Segoe UI Semibold",50,$B,$PX
$fTag     = New-Object System.Drawing.Font "Segoe UI",21,$R,$PX
$fBullet  = New-Object System.Drawing.Font "Segoe UI",20,$R,$PX
$fSmallT  = New-Object System.Drawing.Font "Segoe UI Semibold",27,$B,$PX
$fSmallTag= New-Object System.Drawing.Font "Segoe UI",14,$R,$PX

$icon = [System.Drawing.Image]::FromFile($iconPath)

# ============================================================
#  SCREENSHOT - top caption layout
# ============================================================
function Save-Png($bmp,$file){
  $clone = New-Object System.Drawing.Bitmap ($bmp.Width),($bmp.Height),([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $gg = [System.Drawing.Graphics]::FromImage($clone)
  $gg.DrawImage($bmp,0,0,$bmp.Width,$bmp.Height); $gg.Dispose()
  $clone.Save($file,[System.Drawing.Imaging.ImageFormat]::Png); $clone.Dispose()
}

function Render-TopShot($file,$img,$eyebrow,$headline,$sub,$highlight){
  $W=1280;$H=800
  $bmp = New-Object System.Drawing.Bitmap $W,$H
  $g = New-Graphics $bmp
  Fill-Background $g $W $H ($W/2) 90
  $cx=$W/2
  Draw-Centered $g $eyebrow $fEyebrow $cAccent $cx 48
  Draw-Centered $g $headline $fHead $cWhite $cx 74
  if($sub){ Draw-Centered $g $sub $fSub $cMuted $cx 128 }
  $boxTop=186;$boxBottom=772;$boxW=1170
  $availH=$boxBottom-$boxTop
  $scale=[Math]::Min($boxW/$img.Width,$availH/$img.Height)
  if($scale -gt 1.35){$scale=1.35}
  $dw=$img.Width*$scale;$dh=$img.Height*$scale
  $ix=$cx-$dw/2;$iy=$boxTop+($availH-$dh)/2
  Draw-FramedImage $g $img $ix $iy $dw $dh 14
  if($highlight){
    $hx=$ix+$highlight[0]*$scale; $hy=$iy+$highlight[1]*$scale
    $hw=$highlight[2]*$scale; $hh=$highlight[3]*$scale
    for($k=3;$k -ge 0;$k--){
      $gr=$k*3
      $pen=New-Object System.Drawing.Pen ((C 64 110 245 ([int](40-$k*8)))),([single](2+$gr))
      $rp=New-RoundedPath ($hx-$gr) ($hy-$gr) ($hw+2*$gr) ($hh+2*$gr) (6+$gr)
      $g.DrawPath($pen,$rp);$pen.Dispose();$rp.Dispose()
    }
    $pen=New-Object System.Drawing.Pen ((C 90 130 255 255)),([single]2.5)
    $rp=New-RoundedPath $hx $hy $hw $hh 6
    $g.DrawPath($pen,$rp);$pen.Dispose();$rp.Dispose()
  }
  $g.Dispose()
  Save-Png $bmp $file; $bmp.Dispose()
  Write-Host "Wrote $file"
}

function Render-LeftShot($file,$img,$eyebrow,$headLines,$subLines,$maxW,$maxH){
  $W=1280;$H=800
  $bmp = New-Object System.Drawing.Bitmap $W,$H
  $g = New-Graphics $bmp
  Fill-Background $g $W $H 340 140
  # right image (contain-fit within maxW x maxH, right aligned, vertically centered)
  $scale=[Math]::Min($maxW/$img.Width,$maxH/$img.Height)
  $dw=$img.Width*$scale;$dh=$img.Height*$scale
  $ix=$W-110-$dw;$iy=($H-$dh)/2
  Draw-FramedImage $g $img $ix $iy $dw $dh 16
  # left text
  $lx=96
  $y=232
  Draw-Text $g $eyebrow $fEyebrow $cAccent $lx $y; $y+=34
  foreach($line in $headLines){ Draw-Text $g $line $fHead $cWhite $lx $y; $y+=48 }
  $y+=14
  foreach($line in $subLines){ Draw-Text $g $line $fSub $cMuted $lx $y; $y+=34 }
  $g.Dispose()
  Save-Png $bmp $file; $bmp.Dispose()
  Write-Host "Wrote $file"
}

# ---------- load sources ----------
$hero   = [System.Drawing.Image]::FromFile((Join-Path $imgDir 'hero-chart-panel.png'))
$wl     = [System.Drawing.Image]::FromFile((Join-Path $imgDir 'panel-watchlists-light.png'))
$dlg    = [System.Drawing.Image]::FromFile((Join-Path $imgDir 'add-to-watchlist-dialog.png'))
$chart  = [System.Drawing.Image]::FromFile((Join-Path $imgDir 'chartink-screener.png'))

# stamp the new app icon over the old side-panel header icon in the captures
Stamp-Icon $hero 1467 67 27 27
Stamp-Icon $wl   13  10 25 25

# crop the watchlists panel to just the populated rows (drop the big empty area + footer)
$wlCrop = Crop-Image $wl 0 0 $wl.Width ([int]($wl.Height*0.345))

# 1. hero
Render-TopShot (Join-Path $shots 'screenshot-01.png') $hero `
  "WATCHLISTS + CHARTS" "Unlimited watchlists, right beside your chart" `
  "Open any symbol's chart on TradingView in one click." $null

# 2. watchlists overview (tall panel -> left layout)
Render-LeftShot (Join-Path $shots 'screenshot-02.png') $wlCrop `
  "ORGANIZE" @("As many watchlists","as you need") `
  @("Create, rename and reorder freely.","Re-sync Chartink lists in one click.") 560 600

# 3. add from tradingview
Render-TopShot (Join-Path $shots 'screenshot-03.png') $dlg `
  "ONE-CLICK" "Save any symbol from TradingView" `
  "A floating Add button on every chart page." $null

# 4. chartink import (highlight the Import button)
Render-TopShot (Join-Path $shots 'screenshot-04.png') $chart `
  "IMPORT" "Bring in any Chartink screener" `
  "Turn a scan into a watchlist with one button." @(385,174,148,32)

# ============================================================
#  MARQUEE PROMO TILE 1400x560
# ============================================================
$W=1400;$H=560
$bmp = New-Object System.Drawing.Bitmap $W,$H
$g = New-Graphics $bmp
Fill-Background $g $W $H 1000 200
# left text
$lx=80
$g.DrawImage($icon,[single]$lx,[single]64,[single]92,[single]92)
Draw-Text $g "Unlimited Watchlists" $fTitle $cWhite $lx 188
Draw-Text $g "for TradingView" $fTitle $cAccent $lx 248
Draw-Text $g "Unlimited watchlists in your browser side panel." $fTag $cMuted $lx 322
$by=372
foreach($t in @("One-click charts on TradingView","Bulk import from CSV","Import any Chartink screener")){
  $b=New-Object System.Drawing.SolidBrush $cAccentStrong
  $g.DrawString([char]0x2713,$fBullet,$b,[single]$lx,[single]$by);$b.Dispose()
  Draw-Text $g $t $fBullet $cWhite ($lx+30) $by
  $by+=34
}
# right screenshot (hero)
$bw=648;$bh=[int]($hero.Height*($bw/$hero.Width))
$bx=$W-72-$bw;$byi=($H-$bh)/2
Draw-FramedImage $g $hero $bx $byi $bw $bh 14
$g.Dispose()
Save-Png $bmp (Join-Path $tiles 'promo-marquee-1400x560.png'); $bmp.Dispose()
Write-Host "Wrote marquee"

# ============================================================
#  SMALL PROMO TILE 440x280
# ============================================================
$W=440;$H=280
$bmp = New-Object System.Drawing.Bitmap $W,$H
$g = New-Graphics $bmp
Fill-Background $g $W $H ($W/2) 70
$cx=$W/2
$g.DrawImage($icon,[single]($cx-32),[single]40,[single]64,[single]64)
Draw-Centered $g "Unlimited Watchlists" $fSmallT $cWhite $cx 120
Draw-Centered $g "for TradingView" $fSmallT $cAccent $cx 152
Draw-Centered $g "CSV & Chartink import - One-click charts" $fSmallTag $cMuted $cx 200
$g.Dispose()
Save-Png $bmp (Join-Path $tiles 'promo-small-440x280.png'); $bmp.Dispose()
Write-Host "Wrote small tile"

Write-Host "Done -> screenshots in $shots ; tiles in $tiles"
