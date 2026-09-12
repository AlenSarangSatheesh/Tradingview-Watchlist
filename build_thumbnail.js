const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fileToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function main() {
  let fontsCss = '';
  if (fs.existsSync('store-assets/thumbnail_template.html')) {
    const prevHtml = fs.readFileSync('store-assets/thumbnail_template.html', 'utf8');
    const styleMatch = prevHtml.match(/<style>([\s\S]*?)\* \{/);
    if (styleMatch) {
      fontsCss = styleMatch[1].trim();
    }
  }

  const posterB64 = fileToBase64(path.resolve('media/tutorial-poster.jpg'));
  const iconB64 = fileToBase64(path.resolve('icons/icon128.png'));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${fontsCss}

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    :root {
      --ink: #070505;
      --ink-soft: #0e0a0a;
      --ink-card: #140f0f;
      --ink-card-inner: #1a1313;
      --paper-light: #f6efe2;
      --paper-muted: rgba(246, 239, 226, 0.76);
      --paper-faint: rgba(246, 239, 226, 0.38);
      --oxblood: #7c1026;
      --oxblood-bright: #98142f;
      --brass: #c6a568;
      --brass-bright: #e5c58a;
      --brass-soft: rgba(198, 165, 104, 0.22);
      --line-brass: rgba(198, 165, 104, 0.35);
      --serif: "Cormorant Garamond", Georgia, serif;
      --sans: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    }

    body {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: var(--ink);
      color: var(--paper-light);
      font-family: var(--sans);
      position: relative;
      display: flex;
    }

    /* FULL BACKGROUND: TRADINGVIEW CANDLESTICK CHART */
    .bg-layer {
      position: absolute;
      inset: 0;
      background-image: url('${posterB64}');
      background-size: cover;
      background-position: center right;
      opacity: 0.25;
      filter: contrast(1.25) brightness(0.8);
      z-index: 1;
    }

    /* EDITORIAL GRADIENT SCRIM */
    .scrim-layer {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 65% 85% at 16% 28%, rgba(124, 16, 38, 0.42) 0%, transparent 68%),
        radial-gradient(circle at 86% 82%, rgba(198, 165, 104, 0.16) 0%, transparent 55%),
        linear-gradient(90deg, #070505 0%, #070505 44%, rgba(7, 5, 5, 0.94) 58%, rgba(7, 5, 5, 0.45) 84%, rgba(7, 5, 5, 0.85) 100%);
      z-index: 2;
    }

    /* EDITORIAL MUSEUM INSET FRAME */
    .frame-border {
      position: absolute;
      inset: 14px;
      border: 1px solid rgba(198, 165, 104, 0.28);
      pointer-events: none;
      z-index: 30;
    }

    .corner-tick {
      position: absolute;
      width: 12px;
      height: 12px;
      z-index: 31;
    }
    .corner-tl { top: 10px; left: 10px; border-top: 2px solid var(--brass-bright); border-left: 2px solid var(--brass-bright); }
    .corner-tr { top: 10px; right: 10px; border-top: 2px solid var(--brass-bright); border-right: 2px solid var(--brass-bright); }
    .corner-bl { bottom: 10px; left: 10px; border-bottom: 2px solid var(--brass-bright); border-left: 2px solid var(--brass-bright); }
    .corner-br { bottom: 10px; right: 10px; border-bottom: 2px solid var(--brass-bright); border-right: 2px solid var(--brass-bright); }

    /* CONTENT GRID */
    .content-grid {
      position: relative;
      z-index: 10;
      width: 100%;
      height: 100%;
      padding: 40px 52px;
      display: grid;
      grid-template-columns: 1.12fr 0.88fr;
      align-items: center;
      gap: 34px;
    }

    /* LEFT EDITORIAL COLUMN */
    .left-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 16px;
    }

    /* TOP PILL BADGE */
    .brand-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 16px;
      background: linear-gradient(135deg, var(--oxblood-bright) 0%, var(--oxblood) 100%);
      border: 1px solid var(--brass);
      border-radius: 999px;
      align-self: flex-start;
      box-shadow: 0 4px 18px rgba(124, 16, 38, 0.5);
    }
    .brand-eyebrow img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
    .brand-eyebrow span {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .brand-eyebrow .highlight {
      color: var(--brass-bright);
    }

    /* SERIF HEADLINE */
    .main-title {
      font-family: var(--serif);
      font-size: 73px;
      line-height: 0.98;
      font-weight: 700;
      color: var(--paper-light);
      letter-spacing: -0.025em;
    }
    .main-title em {
      font-style: italic;
      font-weight: 600;
      color: var(--brass-bright);
    }
    .main-title .break {
      display: block;
    }

    /* SUBTITLE */
    .editorial-subtitle {
      font-size: 16.5px;
      line-height: 1.5;
      color: var(--paper-muted);
      font-weight: 400;
      max-width: 520px;
    }

    /* FEATURE PILLARS */
    .feature-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 14px;
      margin-top: 2px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(22, 17, 17, 0.85);
      border: 1px solid rgba(198, 165, 104, 0.28);
      border-radius: 6px;
      padding: 9px 14px;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .feature-item .bullet-star {
      color: var(--brass-bright);
      font-size: 13px;
      line-height: 1;
    }
    .feature-item span {
      font-size: 13px;
      font-weight: 600;
      color: var(--paper-light);
      letter-spacing: 0.01em;
    }

    /* CTA / FOOTER ROW */
    .cta-row {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-top: 6px;
    }

    .oxblood-cta {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 12px 22px;
      background: linear-gradient(135deg, var(--oxblood-bright) 0%, var(--oxblood) 100%);
      border: 1px solid var(--brass);
      border-radius: 5px;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      box-shadow: 0 8px 24px rgba(124, 16, 38, 0.5), inset 0 1px 0 rgba(255,255,255,0.25);
    }
    .oxblood-cta .play-icon-tri {
      width: 0;
      height: 0;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 10px solid #ffffff;
    }

    .secondary-tag {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--brass-bright);
      border-bottom: 1px solid var(--line-brass);
      padding-bottom: 2px;
    }

    /* RIGHT COLUMN: SHOWCASE CARD MATCHING WEBSITE DESIGN */
    .right-col {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }

    .card-deck {
      position: relative;
      width: 505px;
    }

    /* FLOATING METADATA BADGES - CLEAN ELEVATION */
    .floating-pill {
      position: absolute;
      background: #191212;
      border: 1px solid var(--brass);
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--paper-light);
      box-shadow: 0 12px 28px rgba(0,0,0,0.88);
      z-index: 25;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .floating-pill .gold-icon {
      color: var(--brass-bright);
    }

    .pill-top-right {
      top: -20px;
      right: 12px;
      background: linear-gradient(135deg, #281418 0%, #1a0f12 100%);
      border-color: var(--brass-bright);
    }

    .pill-bottom-left {
      bottom: -18px;
      left: 12px;
      background: linear-gradient(135deg, #1c1515 0%, #120e0e 100%);
    }

    /* MAIN DOCKED INTERFACE FRAME */
    .ui-showcase-frame {
      position: relative;
      background: #100b0b;
      border: 1px solid rgba(198, 165, 104, 0.45);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.95), 0 0 50px rgba(124, 16, 38, 0.35);
    }

    /* WINDOW TITLE BAR */
    .ui-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #191212;
      border-bottom: 1px solid rgba(198, 165, 104, 0.25);
    }
    .ui-top-bar .title {
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--brass-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ui-top-bar .title img {
      width: 18px;
      height: 18px;
      border-radius: 3px;
    }
    .ui-top-bar .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      font-weight: 600;
      color: #4ade80;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.25);
      border-radius: 4px;
      padding: 2px 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .ui-top-bar .status-badge::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ade80;
    }

    /* STAGE WITH CHART ON LEFT & WATCHLIST PANEL ON RIGHT */
    .mockup-stage {
      display: grid;
      grid-template-columns: 0.95fr 1.05fr;
      height: 350px;
      position: relative;
      background: #090707;
    }

    /* LEFT CHART AREA */
    .mockup-chart-area {
      position: relative;
      overflow: hidden;
      border-right: 1px solid rgba(198, 165, 104, 0.2);
      background-image: url('${posterB64}');
      background-size: 320%;
      background-position: 42% 52%;
      filter: contrast(1.2) brightness(0.9);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mockup-chart-scrim {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, rgba(124, 16, 38, 0.2) 0%, rgba(8, 6, 6, 0.55) 100%);
    }

    /* CENTER PLAY BUTTON IN CHART AREA (Matching website design) */
    .video-play-center {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .play-circle-btn {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: linear-gradient(135deg, #98142f 0%, #680c1d 100%);
      border: 2px solid rgba(245, 237, 224, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.85), 0 0 30px rgba(124, 16, 38, 0.8);
    }
    .play-circle-btn svg {
      width: 28px;
      height: 28px;
      fill: #ffffff;
      margin-left: 4px;
    }

    .play-label-text {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--brass-bright);
      background: rgba(8, 6, 6, 0.92);
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid rgba(198, 165, 104, 0.4);
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,0.7);
    }

    /* RIGHT DOCKED WATCHLIST PANEL */
    .mockup-panel-area {
      background: #130e0e;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .panel-subhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 7px;
      border-bottom: 1px solid rgba(245, 237, 224, 0.08);
    }
    .panel-subhead h3 {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--paper-light);
      letter-spacing: 0.02em;
    }
    .panel-actions {
      display: flex;
      gap: 6px;
    }
    .panel-btn {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      background: rgba(245, 237, 224, 0.06);
      border: 1px solid rgba(198, 165, 104, 0.25);
      color: var(--brass-bright);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .panel-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
    }
    .panel-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px;
      background: rgba(24, 18, 18, 0.75);
      border: 1px solid rgba(245, 237, 224, 0.08);
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--paper-light);
    }
    .panel-row.active {
      background: rgba(124, 16, 38, 0.35);
      border-color: var(--brass);
    }
    .panel-row .row-left {
      display: flex;
      align-items: center;
      gap: 7px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .panel-row .tag-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .tag-blue { background: #38bdf8; }
    .tag-green { background: #4ade80; }
    .tag-gold { background: var(--brass-bright); }
    .tag-purple { background: #c084fc; }

    .panel-row .count-pill {
      font-size: 10px;
      font-weight: 600;
      color: var(--paper-muted);
      background: rgba(245, 237, 224, 0.08);
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      margin-left: 6px;
    }
    .panel-row.active .count-pill {
      color: var(--brass-bright);
      background: rgba(198, 165, 104, 0.2);
    }

    .panel-search {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 10px;
      background: rgba(9, 6, 6, 0.9);
      border: 1px solid rgba(198, 165, 104, 0.25);
      border-radius: 4px;
      font-size: 10.5px;
      color: var(--paper-faint);
    }
    .panel-search .search-icon {
      color: var(--brass);
      font-size: 11px;
    }
    .panel-search .limit-tag {
      margin-left: auto;
      font-size: 9.5px;
      font-weight: 700;
      color: #4ade80;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
  </style>
</head>
<body>

  <!-- Background Candlestick Chart -->
  <div class="bg-layer"></div>
  <div class="scrim-layer"></div>

  <!-- Editorial Museum Frame -->
  <div class="frame-border"></div>
  <div class="corner-tick corner-tl"></div>
  <div class="corner-tick corner-tr"></div>
  <div class="corner-tick corner-bl"></div>
  <div class="corner-tick corner-br"></div>

  <!-- Content Grid -->
  <div class="content-grid">

    <!-- LEFT EDITORIAL COLUMN -->
    <div class="left-col">
      <div class="brand-eyebrow">
        <img src="${iconB64}" alt="Icon">
        <span>100% Free Forever • <span class="highlight">No TV Pro Needed</span></span>
      </div>

      <h1 class="main-title">
        Unlimited Watchlists
        <span class="break">for <em>TradingView.</em></span>
      </h1>

      <p class="editorial-subtitle">
        Break TradingView's single watchlist cap. Create unlimited custom lists, sync Chartink screeners, and manage 10,000+ stocks directly on the chart.
      </p>

      <div class="feature-list">
        <div class="feature-item">
          <span class="bullet-star">✦</span>
          <span>Unlimited Watchlists &amp; Tabs</span>
        </div>
        <div class="feature-item">
          <span class="bullet-star">✦</span>
          <span>1-Click Chartink Screener Sync</span>
        </div>
        <div class="feature-item">
          <span class="bullet-star">✦</span>
          <span>Instant CSV &amp; Excel Import</span>
        </div>
        <div class="feature-item">
          <span class="bullet-star">✦</span>
          <span>10,000+ Stocks &amp; Color Tags</span>
        </div>
      </div>

      <div class="cta-row">
        <div class="oxblood-cta">
          <div class="play-icon-tri"></div>
          <span>Watch Full Tutorial</span>
        </div>
        <div class="secondary-tag">
          Zero Subscription • Lifetime Free
        </div>
      </div>
    </div>

    <!-- RIGHT SHOWCASE COLUMN: SPLIT CHART + DOCKED PANEL WITH CENTER PLAY BUTTON -->
    <div class="right-col">
      <div class="card-deck">
        
        <!-- Floating Pill 1 (Top) -->
        <div class="floating-pill pill-top-right">
          <span class="gold-icon">⚡</span>
          <span>1-Click Chartink Screener Sync</span>
        </div>

        <!-- Main Docked Interface Frame -->
        <div class="ui-showcase-frame">
          <div class="ui-top-bar">
            <div class="title">
              <img src="${iconB64}" alt="Icon">
              <span>TradingView Extension</span>
            </div>
            <div class="status-badge">Docked Live</div>
          </div>

          <!-- Stage: Candlestick Chart (Left) + Watchlist Panel (Right) -->
          <div class="mockup-stage">
            
            <!-- Left Chart Area with the iconic play button from website -->
            <div class="mockup-chart-area">
              <div class="mockup-chart-scrim"></div>
              <div class="video-play-center">
                <div class="play-circle-btn">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="play-label-text">
                  PLAY DEMO • 1:58 ↗
                </div>
              </div>
            </div>

            <!-- Right Docked Watchlist Panel -->
            <div class="mockup-panel-area">
              <div class="panel-subhead">
                <h3>Watchlists</h3>
                <div class="panel-actions">
                  <div class="panel-btn">＋</div>
                  <div class="panel-btn">↓</div>
                  <div class="panel-btn">⚙</div>
                </div>
              </div>

              <div class="panel-list">
                <div class="panel-row active">
                  <div class="row-left">
                    <span class="tag-dot tag-green"></span>
                    <span>Positional Trades</span>
                  </div>
                  <span class="count-pill">48 stocks</span>
                </div>

                <div class="panel-row">
                  <div class="row-left">
                    <span class="tag-dot tag-blue"></span>
                    <span>Nifty 50 Momentum</span>
                  </div>
                  <span class="count-pill">50 stocks</span>
                </div>

                <div class="panel-row">
                  <div class="row-left">
                    <span class="tag-dot tag-gold"></span>
                    <span>Chartink Screener</span>
                  </div>
                  <span class="count-pill">↺ Sync</span>
                </div>

                <div class="panel-row">
                  <div class="row-left">
                    <span class="tag-dot tag-purple"></span>
                    <span>Breakout Swings</span>
                  </div>
                  <span class="count-pill">124 stocks</span>
                </div>
              </div>

              <div class="panel-search">
                <span class="search-icon">🔍</span>
                <span>Search 10,000+ Symbols...</span>
                <span class="limit-tag">No Limits</span>
              </div>
            </div>

          </div>
        </div>

        <!-- Floating Pill 2 (Bottom) -->
        <div class="floating-pill pill-bottom-left">
          <span class="gold-icon">✦</span>
          <span>1,800+ Stocks per List</span>
        </div>

      </div>
    </div>

  </div>

</body>
</html>`;

  const templatePath = path.resolve('store-assets/thumbnail_template.html');
  fs.writeFileSync(templatePath, html);

  const outPng = path.resolve('store-assets/youtube_thumbnail.png');
  const outPng1080 = path.resolve('store-assets/thumbnail.png');
  const chrome = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
  const fileUrl = `file:///${templatePath.replace(/\\/g, '/')}`;
  
  // 1280x720 YouTube Thumbnail
  const cmd720 = `${chrome} --headless --no-sandbox --disable-gpu --screenshot="${outPng}" --window-size=1280,720 --hide-scrollbars "${fileUrl}"`;
  console.log('Rendering refined youtube_thumbnail.png (1280x720)...');
  execSync(cmd720, { stdio: 'inherit' });
  console.log('Done! Generated youtube_thumbnail.png, size:', fs.statSync(outPng).size);

  // 1920x1080 HD Thumbnail
  const cmd1080 = `${chrome} --headless --no-sandbox --disable-gpu --screenshot="${outPng1080}" --window-size=1280,720 --force-device-scale-factor=1.5 --hide-scrollbars "${fileUrl}"`;
  console.log('Rendering refined thumbnail.png (1920x1080)...');
  execSync(cmd1080, { stdio: 'inherit' });
  console.log('Done! Generated thumbnail.png, size:', fs.statSync(outPng1080).size);
}

main().catch(console.error);
