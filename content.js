// Content script for TradingView integration
(function() {
  'use strict';

  if (window.tradingViewWatchlistExtensionLoaded) return;
  window.tradingViewWatchlistExtensionLoaded = true;



  let buttonContainer = null;
  let watchlistButton = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let containerPosition = { x: 20, y: 100 };
  let wasJustDragged = false;

  // --- GLOBAL TOAST FUNCTION ---
  function showGlobalToast(message, type = "info", duration = 4000) {
    const existing = document.querySelector('.global-extension-toast');
    if (existing) existing.remove();
    const colors = { info: '#2962FF', alert: '#FF9800', error: '#F44336' };
    const accentColor = colors[type] || colors.info;
    const icon = type === 'alert' ? '🔔' : (type === 'error' ? '⚠️' : '✅');
    const toast = document.createElement('div');
    toast.className = 'global-extension-toast';
    // High z-index to ensure visibility on all sites
    toast.style.cssText = `position: fixed; top: 24px; right: 24px; background: #1E222D; color: #E0E3EB; padding: 14px 20px; border-radius: 8px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.4); opacity: 0; transform: translateY(-30px) scale(0.95); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); border-left: 4px solid ${accentColor}; display: flex; align-items: center; gap: 12px; pointer-events: none;`;
    toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0) scale(1)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px) scale(0.95)'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // --- MESSAGE LISTENER ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === "changeSymbol") {
        performSeamlessSwitch(request.symbol);
      } else if (request.action === "toggleInPageSidepanel") {
        if (window.self === window.top) {
          toggleSidepanel();
        }
      } else if (request.action === "openInPageSidepanel") {
        if (window.self === window.top) {
          setSidepanelOpen(true);
        }
      }
    } catch(e) { console.error(e); }
    sendResponse({ success: true });
  });

  // --- WINDOW POSTMESSAGE LISTENER (for in-page iframe) ---
  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.action === "changeSymbol" && e.data.symbol) {
      performSeamlessSwitch(e.data.symbol);
    } else if (e.data.action === "closeInPageSidepanel") {
      setSidepanelOpen(false);
    }
  });

  // --- GLOBAL KEYBOARD SHORTCUTS ---
  document.addEventListener('keydown', (e) => {
    // 1. Ignore if user is typing in a text box
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    // 2. Intercept Space Key (only on chart pages)
    if (e.code === 'Space' && window.location.pathname.includes('/chart/')) {
      // Stop TradingView's default behavior (which cycles their own watchlist)
      e.preventDefault();
      e.stopPropagation();

      // Forward to the sidepanel via ONE path only.  When the in-page iframe
      // exists, use postMessage (instant, same event-loop).  Fall back to
      // runtime messaging only when no iframe is present (e.g. the panel is
      // closed).  Using BOTH caused selectNextStock() to fire twice — once
      // from postMessage, once from runtime.onMessage — skipping a stock
      // whenever the first call's async DOM update completed before the
      // second call read the DOM.
      if (sidepanelIframe && sidepanelIframe.contentWindow) {
        sidepanelIframe.contentWindow.postMessage({ action: "triggerSelectNextStock" }, "*");
      } else if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ action: "triggerSelectNextStock" }).catch(() => {
          // Ignore error if side panel is closed
        });
      }
    }
  }, true); // "true" uses Capture Phase to intercept before TradingView sees it


  // --- HELPER FUNCTIONS ---
  const normalizeSymbol = (s) => s.toUpperCase().replace(/_/g, '-');
  // Comparison-only form: unifies the notations the different sources store for the same
  // stock ("M&M" from Chartink, "M_M"/"M-M" from TradingView, "NSE:X" from CSV uploads).
  // Any exchange prefix (NSE:, NASDAQ:, LSE:, BINANCE:, …) is stripped so "AAPL" and
  // "NASDAQ:AAPL" compare equal. Never stored — stored strings keep their original notation.
  const canonicalSymbol = (s) => String(s).trim().toUpperCase().replace(/^[^:]+:/, '').replace(/[&_]/g, '-');

  // --- GHOST MODE CSS ---
  const GHOST_STYLE_ID = 'tv-ghost-mode-style';
  const SWITCHING_CLASS = 'tv-symbol-switching';

  function setupGhostMode() {
    if (document.getElementById(GHOST_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = GHOST_STYLE_ID;
    style.textContent = `
      body.${SWITCHING_CLASS} div[data-name="symbol-search-dialog-content"],
      body.${SWITCHING_CLASS} div[class*="dialog-"],
      body.${SWITCHING_CLASS} div[data-dialog-name="Symbol Search"],
      body.${SWITCHING_CLASS} .tv-dialog,
      body.${SWITCHING_CLASS} .tv-dialog__modal-wrap {
        opacity: 0 !important;
        visibility: visible !important;
        transition: none !important;
        animation: none !important;
        pointer-events: auto !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }
  setupGhostMode();

  // --- FINDERS & SWITCHING ---
  function findSearchInput() {
    const selectors = [
      '[data-role="search"]',
      '[data-name="symbol-search-dialog-content"] input',
      '.tv-dialog__modal-wrap input[type="text"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.tagName === 'INPUT' && el.getBoundingClientRect().width > 0) {
          return el;
        }
      }
    }
    
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') {
      return document.activeElement;
    }
    
    return null;
  }
  function waitForSearchInput() {
    return new Promise(resolve => {
      const existing = findSearchInput();
      if (existing) return resolve(existing);
      const start = Date.now();
      const interval = setInterval(() => {
        const found = findSearchInput();
        if (found) { clearInterval(interval); resolve(found); }
        if (Date.now() - start > 3000) { clearInterval(interval); resolve(null); }
      }, 5);
    });
  }

  // Fast path: ask the MAIN-world bridge (tv-symbol-bridge.js) to change the symbol via
  // TradingView's own charting API (activeChart().setSymbol) — instant, no search dialog.
  // The bridge acks whether the API was available; resolves true if it handled the switch,
  // false (so we fall back to the search box) if the API isn't present or no bridge answered.
  function requestApiSymbolChange(symbol) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(v);
      };
      const onMsg = (e) => {
        if (e.source === window && e.data && e.data.__tvwlAck) finish(!!e.data.available);
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ __tvwl: 'setSymbol', symbol }, '*');
      const timer = setTimeout(() => finish(false), 600); // no bridge/ack -> fall back
    });
  }

  // Once the bridge confirms TradingView's charting API is present, keep using the fast path
  // for the rest of the session and never wait on an ack again — so a busy main thread during
  // a data-load spike can't trip the 600ms timeout and drop us onto the slow search-box method.
  let tvApiConfirmed = false;

  async function performSeamlessSwitch(symbol) {
    // If the symbol has no exchange prefix (bare symbol, e.g. "Auto" default market),
    // TradingView's charting API setSymbol() cannot fuzzy-resolve it and will say "This symbol doesn't exist".
    // Use the search-box method so TradingView's native search picks the primary listing.
    if (!symbol.includes(':')) {
      await performSearchBoxSwitch(symbol);
      return;
    }

    if (tvApiConfirmed) {
      window.postMessage({ __tvwl: 'setSymbol', symbol }, '*');
      return;
    }
    // Prefer the instant charting-API path; fall back to the search-box method if it can't run.
    if (await requestApiSymbolChange(symbol)) { tvApiConfirmed = true; return; }
    await performSearchBoxSwitch(symbol);
  }

  async function performSearchBoxSwitch(symbol) {
    document.body.classList.add(SWITCHING_CLASS);
    try {
      let input = findSearchInput();
      if (!input) {
        const searchBtn = document.querySelector('[data-name="header-toolbar-symbol-search"]') || document.querySelector('[id="header-toolbar-symbol-search"]');
        if (searchBtn) searchBtn.click();
        else {
          const char = symbol.charAt(0);
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: `Key${char}`, bubbles: true, cancelable: true, keyCode: char.charCodeAt(0) }));
        }
      }
      input = await waitForSearchInput();
      if (!input) { document.body.classList.remove(SWITCHING_CLASS); return; }

      // Crucial: Focus the input so TradingView accepts the Enter key
      // especially if the user clicked the side panel and the iframe lost focus.
      input.focus();

      // The side panel builds the fully-qualified symbol (via getTradingViewSymbol) before
      // sending it here, so pass it through verbatim. A bare symbol (e.g. "Auto" default
      // market) is handed to TradingView as-is and its fuzzy search picks the primary listing.
      const searchString = symbol;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      
      // Wait a tiny bit for the input to be fully ready
      await new Promise(r => setTimeout(r, 100));

      // We use a safe retry loop. We press Enter, then wait up to 2 seconds for the dialog to close.
      // We do NOT spam Enter, as that causes TradingView to leak WebSocket quote subscriptions.
      for (let i = 0; i < 3; i++) {
        if (!document.body.contains(input) || input.getBoundingClientRect().width === 0) break;
        
        // Ensure the value is set correctly
        if (input.value !== searchString) {
          if (setter) setter.call(input, searchString);
          else input.value = searchString;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Dispatch Enter just ONCE per retry attempt
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        
        // Wait up to 2 seconds for the dialog to close before trying again
        let closed = false;
        for (let w = 0; w < 20; w++) {
          await new Promise(r => setTimeout(r, 100));
          if (!document.body.contains(input) || input.getBoundingClientRect().width === 0) {
            closed = true;
            break;
          }
        }
        if (closed) break;
      }

    } catch (e) { console.warn("Switch issue:", e); } finally {
      document.body.classList.remove(SWITCHING_CLASS);
    }
  }

  // --- EXTRACTION ---
  function extractCurrentSymbol() {
    // Primary source: the MAIN-world bridge (tv-symbol-bridge.js) mirrors TradingView's
    // charting API — activeChart().symbol() — into this dataset attribute. It is the exact,
    // fully-qualified current symbol WITH its exchange (e.g. "NASDAQ:AAPL", "NSE:RELIANCE"),
    // so clicking the saved stock reopens the exact same chart for any market/country.
    const bridged = document.documentElement.dataset.tvActiveSymbol;
    if (bridged && bridged.includes(':')) {
      return bridged.toUpperCase();
    }

    // Fallbacks (used only if the bridge hasn't published yet): the page title gives the
    // bare ticker; keep the URL's exchange prefix only when its base symbol matches the title.
    let titleSymbol = 'UNKNOWN';
    const titleMatch = document.title.match(/^([A-Z0-9&\-._]+)\s/);
    if (titleMatch) titleSymbol = titleMatch[1].toUpperCase();

    const urlMatch = location.href.match(/symbol=([^&]+)/i);
    if (urlMatch) {
      const decoded = decodeURIComponent(urlMatch[1]);
      if (decoded.includes(':')) {
        const urlBaseSym = decoded.split(':')[1].toUpperCase();
        if (urlBaseSym === titleSymbol) {
            return decoded.toUpperCase();
        }
      }
    }

    return titleSymbol;
  }

  // --- IN-PAGE ADJUSTABLE SIDEPANEL ---
  let sidepanelDock = null;
  let sidepanelIframe = null;
  let sidepanelResizer = null;
  let sidepanelToggleTab = null;
  let isPanelOpen = false;
  let panelWidth = 240;
  let isResizing = false;

  function setupDockStyles() {
    if (document.getElementById('tv-wl-dock-style')) return;
    const style = document.createElement('style');
    style.id = 'tv-wl-dock-style';
    style.textContent = `
      :root {
        --tv-wl-dock-width: 240px;
      }
      html.tv-wl-docked, body.tv-wl-docked {
        width: calc(100vw - var(--tv-wl-dock-width, 240px)) !important;
        margin-right: var(--tv-wl-dock-width, 240px) !important;
        box-sizing: border-box !important;
      }
      :root {
        --tv-wl-dock-border: #2b3e49;
      }
      html.theme-light, html[data-theme="light"], body.theme-light {
        --tv-wl-dock-border: #d1d5db;
      }
      #tv-wl-sidepanel-dock {
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        z-index: 2147483640;
        display: flex;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
        background: #111;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        border-top-left-radius: 12px;
        border-bottom-left-radius: 12px;
        border: 1px solid var(--tv-wl-dock-border, #2b3e49);
        border-right: none;
      }
      #tv-wl-sidepanel-dock.resizing {
        transition: none !important;
        border-left-color: #2962FF;
      }
      #tv-wl-resizer {
        position: absolute;
        top: 0;
        left: -5px;
        width: 10px;
        height: 100%;
        cursor: col-resize;
        z-index: 1000;
        background: transparent;
        transition: background 0.15s ease;
      }
      #tv-wl-resizer:hover, #tv-wl-resizer.active {
        background: rgba(41, 98, 255, 0.35);
      }
      #tv-wl-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #111;
        border-top-left-radius: 11px;
        border-bottom-left-radius: 11px;
      }
      #tv-ext-watchlist-toolbar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 38px;
        min-height: 36px;
        max-width: 44px;
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        margin: 4px auto;
        padding: 0;
        transition: background 0.15s ease, box-shadow 0.15s ease;
        position: relative;
        box-sizing: border-box;
        flex-shrink: 0;
        z-index: 10;
      }
      #tv-ext-watchlist-toolbar-btn:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      html.theme-light #tv-ext-watchlist-toolbar-btn:hover,
      html[data-theme="light"] #tv-ext-watchlist-toolbar-btn:hover,
      body.theme-light #tv-ext-watchlist-toolbar-btn:hover {
        background: rgba(0, 0, 0, 0.06);
      }
      #tv-ext-watchlist-toolbar-btn.active {
        background: rgba(0, 180, 216, 0.2) !important;
        box-shadow: inset 3px 0 0 #00B4D8 !important;
      }
      #tv-ext-watchlist-toolbar-btn img {
        width: 22px;
        height: 22px;
        border-radius: 4px;
        display: block;
        pointer-events: none;
        transition: transform 0.15s ease;
      }
      #tv-ext-watchlist-toolbar-btn:hover img {
        transform: scale(1.1);
      }
    `;
    document.head.appendChild(style);
  }

  function loadPanelSettings() {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) return resolve();
      chrome.storage.local.get(['customSidepanelWidth', 'autoOpenOnNextLoad'], (res) => {
        if (res.customSidepanelWidth && res.customSidepanelWidth >= 140) {
          panelWidth = res.customSidepanelWidth;
        }
        if (res.autoOpenOnNextLoad) {
          chrome.storage.local.remove('autoOpenOnNextLoad');
          isPanelOpen = true;
        } else {
          isPanelOpen = false;
        }
        resolve();
      });
    });
  }

  function updateLayoutForPanel(open, width) {
    const currentW = open ? width : 0;
    document.documentElement.style.setProperty('--tv-wl-dock-width', `${currentW}px`);
    if (open) {
      document.documentElement.classList.add('tv-wl-docked');
      document.body.classList.add('tv-wl-docked');
    } else {
      document.documentElement.classList.remove('tv-wl-docked');
      document.body.classList.remove('tv-wl-docked');
    }
    window.dispatchEvent(new Event('resize'));
  }

  function createSidepanelDock() {
    const existing = document.getElementById('tv-wl-sidepanel-dock');
    if (existing) {
      sidepanelDock = existing;
      sidepanelResizer = document.getElementById('tv-wl-resizer');
      sidepanelIframe = document.getElementById('tv-wl-iframe');
      setupResizerEvents();
      return;
    }
    if (!document.body) return;
    setupDockStyles();

    sidepanelDock = document.createElement('div');
    sidepanelDock.id = 'tv-wl-sidepanel-dock';
    sidepanelDock.style.width = `${panelWidth}px`;
    sidepanelDock.style.transform = isPanelOpen ? 'translateX(0)' : `translateX(${panelWidth + 30}px)`;

    sidepanelResizer = document.createElement('div');
    sidepanelResizer.id = 'tv-wl-resizer';
    sidepanelResizer.title = 'Drag to resize sidepanel (down to 140px)';

    sidepanelIframe = document.createElement('iframe');
    sidepanelIframe.id = 'tv-wl-iframe';
    sidepanelIframe.src = chrome.runtime.getURL('sidepanel.html');

    sidepanelDock.appendChild(sidepanelResizer);
    sidepanelDock.appendChild(sidepanelIframe);
    document.body.appendChild(sidepanelDock);

    setupResizerEvents();

    if (isPanelOpen) {
      updateLayoutForPanel(true, panelWidth);
    }
  }

  function setupResizerEvents() {
    if (!sidepanelResizer) return;
    let startX = 0;
    let startWidth = 0;

    sidepanelResizer.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startWidth = panelWidth;
      sidepanelDock.classList.add('resizing');
      sidepanelResizer.classList.add('active');
      if (sidepanelIframe) sidepanelIframe.style.pointerEvents = 'none';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const delta = startX - e.clientX;
      const minW = 140;
      const maxW = Math.round(window.innerWidth * 0.7);
      const newWidth = Math.round(Math.max(minW, Math.min(startWidth + delta, maxW)));
      panelWidth = newWidth;
      sidepanelDock.style.width = `${newWidth}px`;
      updateLayoutForPanel(true, newWidth);
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      sidepanelDock.classList.remove('resizing');
      sidepanelResizer.classList.remove('active');
      if (sidepanelIframe) sidepanelIframe.style.pointerEvents = 'auto';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ customSidepanelWidth: panelWidth });
      }
      window.dispatchEvent(new Event('resize'));
    });
  }

  function setSidepanelOpen(open) {
    isPanelOpen = open;
    if (!sidepanelDock) createSidepanelDock();
    if (!sidepanelDock) return;
    if (open) {
      sidepanelDock.style.width = `${panelWidth}px`;
      sidepanelDock.style.transform = 'translateX(0)';
      updateLayoutForPanel(true, panelWidth);
    } else {
      sidepanelDock.style.transform = `translateX(${panelWidth + 30}px)`;
      updateLayoutForPanel(false, 0);
    }
    updateToolbarButtonState();
  }

  function toggleSidepanel() {
    setSidepanelOpen(!isPanelOpen);
  }

  // --- TRADINGVIEW RIGHT TOOLBAR BUTTON ---
  const TOOLBAR_BTN_ID = 'tv-ext-watchlist-toolbar-btn';

  function updateToolbarButtonState() {
    const btn = document.getElementById(TOOLBAR_BTN_ID);
    if (btn) {
      btn.classList.toggle('active', isPanelOpen);
    }
  }

  function injectRightToolbarButton() {
    if (document.getElementById(TOOLBAR_BTN_ID)) {
      updateToolbarButtonState();
      return;
    }

    setupDockStyles();

    // 1. Try to find TradingView's right toolbar container
    const containerSelectors = [
      '.layout__area--right [class*="widgetbar-tabs"]',
      '.layout__area--right .widgetbar-tabs',
      '.layout__area--right [class*="tabs-"]',
      '.layout__area--right [role="tablist"]',
      '.widgetbar-tabs',
      '[class*="widgetbar-tabs"]',
      '.layout__area--right'
    ];

    let targetContainer = null;
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetHeight > 50) {
        targetContainer = el;
        break;
      }
    }

    let insertBeforeEl = null;

    if (targetContainer) {
      const btns = Array.from(targetContainer.querySelectorAll('button, div[role="button"], div[role="tab"]'))
        .filter(b => b.id !== TOOLBAR_BTN_ID && b.offsetParent !== null);
      if (btns.length > 0) {
        btns.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        insertBeforeEl = btns[0]; // First button in the toolbar
      }
    } else {
      // 2. Position-based fallback to find the right-edge buttons
      const currentPanelOffset = isPanelOpen ? panelWidth : 0;
      const rightEdge = window.innerWidth - currentPanelOffset;
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], div[role="tab"]'));
      const rightBtns = allButtons.filter(b => {
        if (b.id === TOOLBAR_BTN_ID || !b.offsetParent) return false;
        const r = b.getBoundingClientRect();
        return r.width >= 20 && r.width <= 65 &&
               r.height >= 20 && r.height <= 65 &&
               r.right >= rightEdge - 65 &&
               r.top >= 10 && r.top < window.innerHeight * 0.55;
      });

      if (rightBtns.length > 0) {
        rightBtns.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        insertBeforeEl = rightBtns[0]; // First button
        targetContainer = insertBeforeEl.parentElement;
      }
    }

    if (!insertBeforeEl && !targetContainer) {
      return; // Toolbar not loaded yet
    }

    let btn = document.getElementById(TOOLBAR_BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = TOOLBAR_BTN_ID;
      btn.type = 'button';
      btn.title = 'Unlimited Watchlists';
      btn.setAttribute('aria-label', 'Unlimited Watchlists');
      btn.setAttribute('data-tooltip', 'Unlimited Watchlists');

      const iconImg = document.createElement('img');
      iconImg.src = chrome.runtime.getURL('icons/icon32.png');
      iconImg.alt = 'Watchlists';

      btn.appendChild(iconImg);

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSidepanel();
      };
    }

    // Insert at the very first position
    if (insertBeforeEl && insertBeforeEl.parentElement) {
      if (btn.nextElementSibling !== insertBeforeEl) {
        insertBeforeEl.insertAdjacentElement('beforebegin', btn);
      }
    } else if (targetContainer) {
      if (targetContainer.firstElementChild !== btn) {
        targetContainer.prepend(btn);
      }
    }

    updateToolbarButtonState();
  }

  // --- FLOATING BUTTON (Pro UI) ---
  function loadContainerPosition() {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) return resolve({ x: 20, y: 100 });
      chrome.storage.local.get('buttonContainerPosition', ({ buttonContainerPosition: saved }) => {
        if (saved) containerPosition = { ...containerPosition, ...saved };
        resolve(containerPosition);
      });
    });
  }

  function saveContainerPosition() {
    if (!chrome.runtime?.id) return;
    chrome.storage.local.set({ buttonContainerPosition: containerPosition });
  }

  async function addButtons() {
    setTimeout(async () => {
      if (!chrome.runtime?.id) return;
      if (buttonContainer) return;
      await loadContainerPosition();

      buttonContainer = document.createElement('div');
      buttonContainer.id = 'tradingview-button-container';

      buttonContainer.style.cssText = `
        position: fixed; top: ${containerPosition.y}px; left: ${containerPosition.x}px;
        display: flex; flex-direction: column; gap: 6px; z-index: 999999; cursor: grab;
        padding: 8px; background: rgba(30, 34, 45, 0.95); backdrop-filter: blur(8px);
        border: 1px solid #2A2E39; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        user-select: none; width: auto;
      `;

      watchlistButton = createButton('Add', 'Add to Watchlist', '#00B4D8', '#0096C7', '#FFFFFF', '+');
      watchlistButton.addEventListener('click', (e) => handleButtonClick(e));

      buttonContainer.appendChild(watchlistButton);

      setupDragEvents();
      document.body.appendChild(buttonContainer);
    }, 1000);
  }

  function createButton(text, title, bg, hoverBg, textColor, iconChar) {
    const btn = document.createElement('button');
    btn.title = title;
    btn.style.cssText = `
      background: ${bg}; color: ${textColor}; border: none; border-radius: 4px;
      padding: 0 20px; cursor: pointer; font-size: 13px; font-weight: 600;
      height: 32px; display: flex; align-items: center; justify-content: center;
      gap: 7px; transition: all 0.15s ease; min-width: 88px; width: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 2px 6px rgba(0, 180, 216, 0.35);
    `;
    btn.innerHTML = `<span style="font-size:14px; font-weight:700; line-height:1;">${iconChar}</span> <span>${text}</span>`;
    btn.onmouseenter = () => {
      if(!isDragging) {
        btn.style.background = hoverBg;
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 3px 8px rgba(0, 180, 216, 0.5)';
      }
    };
    btn.onmouseleave = () => {
      if(!isDragging) {
        btn.style.background = bg;
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 2px 6px rgba(0, 180, 216, 0.35)';
      }
    };
    return btn;
  }

  let dragListenersAdded = false;
  function setupDragEvents() {
    buttonContainer.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      isDragging = true; wasJustDragged = false;
      const rect = buttonContainer.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      buttonContainer.style.cursor = 'grabbing';
      buttonContainer.style.opacity = '0.9';
    };

    if (!dragListenersAdded) {
      dragListenersAdded = true;
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        wasJustDragged = true;
        e.preventDefault();
        const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - buttonContainer.offsetWidth));
        const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - buttonContainer.offsetHeight));
        buttonContainer.style.left = x + 'px';
        buttonContainer.style.top = y + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        buttonContainer.style.cursor = 'grab';
        buttonContainer.style.opacity = '1';
        containerPosition = { x: parseInt(buttonContainer.style.left), y: parseInt(buttonContainer.style.top) };
        saveContainerPosition();
        setTimeout(() => wasJustDragged = false, 50);
      });
    }
  }

  function handleButtonClick(e) {
    if (isDragging || wasJustDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    showWatchlistDialog();
  }

  // --- DIALOG ---
  function showWatchlistDialog() { createWatchlistDialog(extractCurrentSymbol()); }

  function createWatchlistDialog(symbol) {
    // Only one instance: a stacked second dialog would duplicate checkbox ids
    document.getElementById('tv-ext-watchlist-dialog')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'tv-ext-watchlist-dialog';
    backdrop.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); z-index: 9999999; display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif;`;
    const dialog = document.createElement('div');
    dialog.style.cssText = `background: #1e1e1e; color: #eee; padding: 24px; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); width: 360px; max-width: 90vw; max-height: 540px; border: 1px solid #333; display: flex; flex-direction: column; box-sizing: border-box;`;
    dialog.innerHTML = `
      <style>
        .tv-ext-wl-item:hover { background: #2f2f2f !important; }
        #tv-ext-new-wl-add-btn:hover { filter: brightness(1.1); }
        #tv-ext-new-wl-cancel-btn:hover { color: #fff !important; }
        #watchlist-close:hover { color: #fff !important; }
        #watchlist-cancel:hover { background: #555 !important; }
        #watchlist-save:hover:not(:disabled) { background: #43a047 !important; }
        #watchlist-save:disabled { opacity: 0.6; cursor: not-allowed; }
        #watchlist-checkboxes::-webkit-scrollbar { width: 6px; }
        #watchlist-checkboxes::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
        #watchlist-checkboxes::-webkit-scrollbar-thumb:hover { background: #555; }
      </style>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;">
        <h3 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">Add to Watchlist</h3>
        <button id="watchlist-close" style="background: none; border: none; color: #999; font-size: 22px; cursor: pointer; padding: 0; width: 24px; height: 24px; line-height: 1; display: flex; align-items: center; justify-content: center;">&times;</button>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: #ccc; font-size: 13px; font-weight: 500;">Symbol:</label>
        <input type="text" id="watchlist-symbol" value="${symbol}" readonly style="width: 100%; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none;" />
      </div>
      <div style="margin-bottom: 20px; display: flex; flex-direction: column;">
        <label style="display: block; margin-bottom: 10px; color: #ccc; font-size: 13px; font-weight: 500;">Select Watchlists:</label>
        <div id="watchlist-checkboxes" style="max-height: 240px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; background: #2a2a2a; padding: 6px; display: flex; flex-direction: column;">
          <div style="text-align: center; color: #888; padding: 20px; font-size: 13px;">Loading watchlists...</div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: auto;">
        <button id="watchlist-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #eee; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
        <button id="watchlist-save" style="padding: 8px 18px; background: #4caf50; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Update</button>
      </div>
    `;
    backdrop.appendChild(dialog);

    const closeBtn = dialog.querySelector('#watchlist-close');
    const cancelBtn = dialog.querySelector('#watchlist-cancel');
    const saveBtn = dialog.querySelector('#watchlist-save');
    const checkboxContainer = dialog.querySelector('#watchlist-checkboxes');

    let dialogWatchlists = [];

    const closeDialog = () => { if(document.body.contains(backdrop)) document.body.removeChild(backdrop); };
    closeBtn.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;
    backdrop.onclick = (e) => { if(e.target === backdrop) closeDialog(); };

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderWatchlistItems(highlightName = null) {
      const canonical = canonicalSymbol(symbol);

      // Preserve current user-selected checkbox states before re-rendering
      const checkedMap = new Map();
      checkboxContainer.querySelectorAll('.tv-ext-wl-item').forEach(item => {
        const name = item.getAttribute('data-wl-name');
        const chk = item.querySelector('input[type="checkbox"]');
        if (name && chk) checkedMap.set(decodeURIComponent(name).toLowerCase(), chk.checked);
      });

      const bottomActionHtml = `
        <div id="tv-ext-bottom-container" style="position: sticky; bottom: 0; background: #2a2a2a; padding: 6px 4px 2px; border-top: 1px solid #383838; margin-top: auto;">
          <div id="tv-ext-bottom-new-wl" style="display: flex; align-items: center; gap: 6px; padding: 6px 8px; color: #00B4D8; font-size: 13px; font-weight: 500; cursor: pointer; border-radius: 4px; user-select: none; transition: background 0.15s;">
            <span style="font-size: 15px; font-weight: 700; line-height: 1;">+</span>
            <span>Create new watchlist</span>
          </div>
          <div id="tv-ext-bottom-input-row" style="display: none; gap: 6px; align-items: center; padding: 2px 0;">
            <input type="text" id="tv-ext-new-wl-input" placeholder="New watchlist name..." style="flex: 1; min-width: 0; padding: 6px 10px; background: #1a1a1a; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 13px; outline: none; box-sizing: border-box;" />
            <button id="tv-ext-new-wl-add-btn" type="button" style="padding: 6px 14px; background: #00B4D8; border: none; border-radius: 4px; color: #0f172a; font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap; transition: filter 0.15s;">Add</button>
            <button id="tv-ext-new-wl-cancel-btn" type="button" style="background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;" title="Cancel">&times;</button>
          </div>
        </div>
      `;

      if (!dialogWatchlists.length) {
        checkboxContainer.innerHTML = `
          <div style="text-align: center; color: #888; padding: 18px 12px; font-size: 13px;">
            <div>No watchlists found.</div>
          </div>
          ${bottomActionHtml}
        `;
        saveBtn.disabled = true;
      } else {
        saveBtn.disabled = false;
        const itemsHtml = dialogWatchlists.map((wl, i) => {
          const lowerName = wl.name.toLowerCase();
          let checked = false;
          if (checkedMap.has(lowerName)) {
            checked = checkedMap.get(lowerName);
          } else if (wl.isNew) {
            checked = true;
          } else {
            checked = wl.stocks && wl.stocks.some(s => canonicalSymbol(s) === canonical);
          }

          const encodedName = encodeURIComponent(wl.name);
          const chkId = `tv-ext-chk-${i}`;
          const isHighlight = highlightName && highlightName.toLowerCase() === lowerName;

          return `
            <div class="tv-ext-wl-item" data-wl-name="${encodedName}" style="display: flex; align-items: center; padding: 7px 8px; border-radius: 4px; transition: background 0.2s; ${isHighlight ? 'background: rgba(0, 180, 216, 0.25);' : ''}">
              <input type="checkbox" id="${chkId}" ${checked ? 'checked' : ''} style="margin-right: 10px; transform: scale(1.15); accent-color: #4caf50; cursor: pointer;">
              <label for="${chkId}" style="color: #eee; font-size: 14px; cursor: pointer; flex: 1; user-select: none; word-break: break-word; display: flex; align-items: center;">
                <span>${escapeHtml(wl.name)}</span>
                ${wl.isNew ? '<span style="font-size: 10px; font-weight: 600; color: #00B4D8; background: rgba(0, 180, 216, 0.15); padding: 1px 6px; border-radius: 3px; margin-left: 8px; text-transform: uppercase;">New</span>' : ''}
              </label>
            </div>
          `;
        }).join('');

        checkboxContainer.innerHTML = `<div style="flex: 1;">${itemsHtml}</div>` + bottomActionHtml;
      }

      // Wire up inline creation at bottom
      const bottomTrigger = checkboxContainer.querySelector('#tv-ext-bottom-new-wl');
      const bottomInputRow = checkboxContainer.querySelector('#tv-ext-bottom-input-row');
      const bottomInput = checkboxContainer.querySelector('#tv-ext-new-wl-input');
      const bottomAddBtn = checkboxContainer.querySelector('#tv-ext-new-wl-add-btn');
      const bottomCancelBtn = checkboxContainer.querySelector('#tv-ext-new-wl-cancel-btn');

      function openInput() {
        if (!bottomTrigger || !bottomInputRow) return;
        bottomTrigger.style.display = 'none';
        bottomInputRow.style.display = 'flex';
        if (bottomInput) {
          bottomInput.focus();
        }
      }

      function closeInput() {
        if (!bottomTrigger || !bottomInputRow) return;
        bottomTrigger.style.display = 'flex';
        bottomInputRow.style.display = 'none';
        if (bottomInput) {
          bottomInput.value = '';
          bottomInput.style.borderColor = '#444';
        }
      }

      if (bottomTrigger) {
        bottomTrigger.onclick = openInput;
        bottomTrigger.onmouseenter = () => { bottomTrigger.style.background = 'rgba(0, 180, 216, 0.1)'; };
        bottomTrigger.onmouseleave = () => { bottomTrigger.style.background = 'none'; };
      }

      if (bottomCancelBtn) bottomCancelBtn.onclick = closeInput;

      function submitNewWatchlist() {
        const name = bottomInput ? bottomInput.value.trim() : '';
        if (!name) {
          if (bottomInput) {
            bottomInput.style.borderColor = '#ff4d4f';
            bottomInput.focus();
          }
          return;
        }

        const existingIdx = dialogWatchlists.findIndex(w => w.name.trim().toLowerCase() === name.toLowerCase());
        if (existingIdx !== -1) {
          const existingWl = dialogWatchlists[existingIdx];
          closeInput();
          renderWatchlistItems(existingWl.name);
          return;
        }

        const newWl = {
          name: name,
          stocks: [],
          lastSelected: null,
          isNew: true
        };
        dialogWatchlists.unshift(newWl);
        renderWatchlistItems(name);
        checkboxContainer.scrollTop = 0;
      }

      if (bottomAddBtn) bottomAddBtn.onclick = submitNewWatchlist;
      if (bottomInput) {
        bottomInput.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitNewWatchlist();
          } else if (e.key === 'Escape') {
            closeInput();
          } else {
            bottomInput.style.borderColor = '#444';
          }
        };
      }

      if (highlightName) {
        const highlightedEl = checkboxContainer.querySelector(`[data-wl-name="${encodeURIComponent(highlightName)}"]`);
        if (highlightedEl) {
          highlightedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setTimeout(() => { if (highlightedEl) highlightedEl.style.background = ''; }, 1500);
        }
      }
    }

    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ action: "getWatchlists" }, (res) => {
        dialogWatchlists = (res.watchlists || []).map(wl => ({
          ...wl,
          stocks: wl.stocks ? [...wl.stocks] : []
        }));
        renderWatchlistItems();
      });
    }

    saveBtn.onclick = () => {
      if (!chrome.runtime?.id) return;
      saveBtn.disabled = true; // prevent duplicate clicks

      // If user typed a name into the bottom input field but didn't click "Add", include it automatically
      const pendingInput = dialog.querySelector('#tv-ext-new-wl-input');
      const inputRow = dialog.querySelector('#tv-ext-bottom-input-row');
      const pendingName = pendingInput ? pendingInput.value.trim() : '';
      if (pendingName && inputRow && inputRow.style.display !== 'none') {
        const exists = dialogWatchlists.some(w => w.name.trim().toLowerCase() === pendingName.toLowerCase());
        if (!exists) {
          dialogWatchlists.unshift({
            name: pendingName,
            stocks: [],
            lastSelected: null,
            isNew: true
          });
          renderWatchlistItems(pendingName);
        }
      }

      const s = normalizeSymbol(dialog.querySelector('#watchlist-symbol').value.trim());
      const target = canonicalSymbol(s);

      chrome.runtime.sendMessage({ action: "getWatchlists" }, (res) => {
        let storedWatchlists = res.watchlists || [];
        let change = false;

        // 1. Merge any new watchlists from dialogWatchlists into storedWatchlists
        dialogWatchlists.forEach(dwl => {
          const exists = storedWatchlists.some(swl => swl.name.trim().toLowerCase() === dwl.name.trim().toLowerCase());
          if (!exists) {
            storedWatchlists.push({
              name: dwl.name,
              stocks: [],
              lastSelected: null
            });
            change = true;
          }
        });

        // 2. Read checkboxes from dialog and update stock membership
        storedWatchlists.forEach(wl => {
          const encoded = encodeURIComponent(wl.name);
          let itemEl = checkboxContainer.querySelector(`.tv-ext-wl-item[data-wl-name="${encoded}"]`);
          if (!itemEl) {
            const items = Array.from(checkboxContainer.querySelectorAll('.tv-ext-wl-item'));
            itemEl = items.find(el => decodeURIComponent(el.getAttribute('data-wl-name') || '').toLowerCase() === wl.name.trim().toLowerCase());
          }
          const chk = itemEl?.querySelector('input[type="checkbox"]');
          if (!chk) return;

          const idx = wl.stocks ? wl.stocks.findIndex(x => canonicalSymbol(x) === target) : -1;
          if (chk.checked && idx === -1) {
            if (!wl.stocks) wl.stocks = [];
            wl.stocks.push(s);
            change = true;
          }
          if (!chk.checked && idx !== -1) {
            const removed = wl.stocks[idx];
            wl.stocks.splice(idx, 1);
            if (wl.stockNotes) {
              delete wl.stockNotes[removed];
              const rc = canonicalSymbol(removed);
              for (const k of Object.keys(wl.stockNotes)) {
                if (canonicalSymbol(k) === rc) delete wl.stockNotes[k];
              }
            }
            change = true;
          }
        });

        closeDialog();
        if (change) {
          chrome.runtime.sendMessage({ action: "updateWatchlists", watchlists: storedWatchlists }, () => {
            showGlobalToast("Watchlists updated", "info");
          });
        }
      });
    };
    document.body.appendChild(backdrop);
  }

  if (window.self === window.top) {
    loadPanelSettings().then(() => {
      createSidepanelDock();
    });
    addButtons();
    injectRightToolbarButton();

    let toolbarTries = 0;
    const toolbarTimer = setInterval(() => {
      toolbarTries++;
      if (!document.getElementById(TOOLBAR_BTN_ID)) {
        injectRightToolbarButton();
      }
      if (toolbarTries > 30 && document.getElementById(TOOLBAR_BTN_ID)) {
        clearInterval(toolbarTimer);
      }
    }, 500);

    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          if (!document.getElementById('tradingview-button-container')) addButtons();
          if (!document.getElementById(TOOLBAR_BTN_ID)) injectRightToolbarButton();
        }, 1500);
      } else {
        if (!document.getElementById(TOOLBAR_BTN_ID)) {
          injectRightToolbarButton();
        }
      }
    }).observe(document.body || document.documentElement, { subtree: true, childList: true });
  }

})();
