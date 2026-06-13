// Content script for TradingView integration
(function() {
  'use strict';

  if (window.tradingViewWatchlistExtensionLoaded) return;
  window.tradingViewWatchlistExtensionLoaded = true;

  console.log(`Unlimited Watchlists for TradingView loaded on ${location.hostname}`);

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
      }
    } catch(e) { console.error(e); }
    sendResponse({ success: true });
  });

  // --- GLOBAL KEYBOARD SHORTCUTS ---
  document.addEventListener('keydown', (e) => {
    // 1. Ignore if user is typing in a text box
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    // 2. Intercept Space Key
    if (e.code === 'Space') {
      // Stop TradingView's default behavior (which cycles their own watchlist)
      e.preventDefault();
      e.stopPropagation();

      // Send signal to Side Panel to switch stock
      if (chrome.runtime?.id) {
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
  // Never stored — stored strings keep their original notation.
  const canonicalSymbol = (s) => String(s).trim().toUpperCase().replace(/^(NSE|BSE):/, '').replace(/[&_]/g, '-');

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
    let input = document.querySelector('[data-role="search"]');
    if (input) return input;
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') return document.activeElement;
    const dialog = document.querySelector('[data-name="symbol-search-dialog-content"]');
    if (dialog) return dialog.querySelector('input');
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

  async function performSeamlessSwitch(symbol) {
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

      const searchString = `NSE:${symbol}`;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, searchString);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

      const checkResults = setInterval(() => {
        const item = document.querySelector('[data-role="list-item"]');
        if (item) { item.click(); clearInterval(checkResults); }
      }, 10);
      setTimeout(() => clearInterval(checkResults), 1000);
    } catch (e) { console.warn("Switch issue:", e); } finally {
      setTimeout(() => document.body.classList.remove(SWITCHING_CLASS), 150);
    }
  }

  // --- EXTRACTION ---
  function extractCurrentSymbol() {
    const titleMatch = document.title.match(/^([A-Z0-9&\-._]+)\s/);
    if (titleMatch) return titleMatch[1];
    const urlMatch = location.href.match(/symbol=(?:NSE|BSE)%3A([A-Z0-9&%\-._]+)/i);
    if (urlMatch) return decodeURIComponent(urlMatch[1]).replace(/%26/g, '&');
    return 'UNKNOWN';
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
        display: flex; flex-direction: column; gap: 8px; z-index: 999999; cursor: grab;
        padding: 8px; background: #1E222D; border: 1px solid #2A2E39;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        user-select: none; width: 110px;
      `;

      watchlistButton = createButton('Add', 'Add to Watchlist', '#2962FF', '#1E88E5', '#FFFFFF', '📋');
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
      padding: 0 12px; cursor: pointer; font-size: 13px; font-weight: 700;
      height: 34px; display: flex; align-items: center; justify-content: flex-start;
      gap: 10px; transition: all 0.2s ease; width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    btn.innerHTML = `<span style="font-size:15px; opacity:0.9;">${iconChar}</span> <span>${text}</span>`;
    btn.onmouseenter = () => {
      if(!isDragging) {
        btn.style.background = hoverBg;
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 3px 6px rgba(0,0,0,0.2)';
      }
    };
    btn.onmouseleave = () => {
      if(!isDragging) {
        btn.style.background = bg;
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }
    };
    return btn;
  }

  function setupDragEvents() {
    buttonContainer.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      isDragging = true; wasJustDragged = false;
      const rect = buttonContainer.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      buttonContainer.style.cursor = 'grabbing';
      buttonContainer.style.opacity = '0.9';
    };

    document.onmousemove = (e) => {
      if (!isDragging) return;
      wasJustDragged = true;
      e.preventDefault();
      const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - buttonContainer.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - buttonContainer.offsetHeight));
      buttonContainer.style.left = x + 'px';
      buttonContainer.style.top = y + 'px';
    };

    document.onmouseup = () => {
      if (!isDragging) return;
      isDragging = false;
      buttonContainer.style.cursor = 'grab';
      buttonContainer.style.opacity = '1';
      containerPosition = { x: parseInt(buttonContainer.style.left), y: parseInt(buttonContainer.style.top) };
      saveContainerPosition();
      setTimeout(() => wasJustDragged = false, 50);
    };
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
    // Only one instance: a stacked second dialog would duplicate the wl-N checkbox ids,
    // making label clicks toggle the hidden dialog's checkboxes.
    document.getElementById('tv-ext-watchlist-dialog')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'tv-ext-watchlist-dialog';
    backdrop.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); z-index: 9999999; display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif;`;
    const dialog = document.createElement('div');
    dialog.style.cssText = `background: #1e1e1e; color: #eee; padding: 24px; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); min-width: 300px; max-width: 400px; max-height: 500px; border: 1px solid #333; display: flex; flex-direction: column;`;
    dialog.innerHTML = `
      <style>
        .tv-ext-wl-item:hover { background: #333 !important; }
      </style>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #fff; font-size: 18px;">Add to Watchlist</h3>
        <button id="watchlist-close" style="background: none; border: none; color: #999; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">&times;</button>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; color: #ccc; font-size: 14px;">Symbol:</label>
        <input type="text" id="watchlist-symbol" value="${symbol}" readonly style="width: 100%; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 14px; box-sizing: border-box;" />
      </div>
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 12px; color: #ccc; font-size: 14px;">Select Watchlists:</label>
        <div id="watchlist-checkboxes" style="max-height: 250px; overflow-y: auto; border: 1px solid #444; border-radius: 4px; background: #2a2a2a; padding: 8px;">
          <div style="text-align: center; color: #888; padding: 20px;">Loading watchlists...</div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="watchlist-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #eee; cursor: pointer; font-size: 14px;">Cancel</button>
        <button id="watchlist-save" style="padding: 8px 16px; background: #4caf50; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 14px;">Update</button>
      </div>
    `;
    backdrop.appendChild(dialog);
    const closeBtn = dialog.querySelector('#watchlist-close');
    const cancelBtn = dialog.querySelector('#watchlist-cancel');
    const saveBtn = dialog.querySelector('#watchlist-save');
    const checkboxContainer = dialog.querySelector('#watchlist-checkboxes');

    const closeDialog = () => { if(document.body.contains(backdrop)) document.body.removeChild(backdrop); };
    closeBtn.onclick = closeDialog;
    cancelBtn.onclick = closeDialog;
    backdrop.onclick = (e) => { if(e.target === backdrop) closeDialog(); };

    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ action: "getWatchlists" }, (res) => {
        const list = res.watchlists || [];
        if(!list.length) { checkboxContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No watchlists found.</div>'; saveBtn.disabled = true; return; }
        const canonical = canonicalSymbol(symbol);
        checkboxContainer.innerHTML = list.map((wl, i) => {
          const checked = wl.stocks && wl.stocks.some(s => canonicalSymbol(s) === canonical);
          return `
            <div class="tv-ext-wl-item" style="display: flex; align-items: center; padding: 8px; border-radius: 4px; transition: background 0.2s;">
              <input type="checkbox" id="wl-${i}" ${checked ? 'checked' : ''} style="margin-right: 10px; transform: scale(1.2); accent-color: #4caf50;">
              <label for="wl-${i}" style="color: #eee; font-size: 14px; cursor: pointer; flex: 1; user-select: none;">${wl.name}</label>
            </div>
          `;
        }).join('');
      });
    }

    saveBtn.onclick = () => {
      if (!chrome.runtime?.id) return;
      saveBtn.disabled = true; // a second click would race a second read-modify-write
      const s = normalizeSymbol(dialog.querySelector('#watchlist-symbol').value.trim());
      const target = canonicalSymbol(s);
      chrome.runtime.sendMessage({ action: "getWatchlists" }, (res) => {
        let change = false;
        res.watchlists.forEach((wl, i) => {
          const chk = dialog.querySelector(`#wl-${i}`);
          if(!chk) return;
          const idx = wl.stocks ? wl.stocks.findIndex(x => canonicalSymbol(x) === target) : -1;
          if(chk.checked && idx === -1) { if(!wl.stocks) wl.stocks=[]; wl.stocks.push(s); change=true; }
          if(!chk.checked && idx !== -1) { wl.stocks.splice(idx, 1); change=true; }
        });
        closeDialog();
        if(change) chrome.runtime.sendMessage({ action: "updateWatchlists", watchlists: res.watchlists }, () => showGlobalToast("Watchlists updated", "info"));
      });
    };
    document.body.appendChild(backdrop);
  }

  addButtons();
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => { if (!document.getElementById('tradingview-button-container')) addButtons(); }, 2000);
    }
  }).observe(document, { subtree: true, childList: true });

})();
