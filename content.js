// Content script for TradingView integration
(function() {
  'use strict';

  if (window.tradingViewAlarmExtensionLoaded) return;
  window.tradingViewAlarmExtensionLoaded = true;

  // Detect if we are on a TradingView site for specific features
  const isTradingView = location.hostname.includes('tradingview.com');

  console.log(`TradingView Alarm Extension Loaded on ${location.hostname} (Global Toast Enabled)`);

  let buttonContainer = null;
  let alarmButton = null;
  let watchlistButton = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let containerPosition = { x: 20, y: 100 };
  let wasJustDragged = false;
  let audioContext = null;

  // ==========================================================
  // 1. GLOBAL FEATURES (TOASTS, AUDIO, MESSAGE LISTENER)
  //    These run on ANY website.
  // ==========================================================

  // --- AUDIO INIT ---
  function initAudioContext() {
    if (!audioContext) { try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  }
  async function ensureAudioContextRunning() {
    if (!audioContext) initAudioContext();
    if (audioContext && audioContext.state === 'suspended') { try { await audioContext.resume(); } catch (e) {} }
  }
  document.addEventListener('click', initAudioContext, { once: true });
  document.addEventListener('keydown', initAudioContext, { once: true });

  // --- SOUND PLAY FUNCTION (LENGTHY SIREN ~4s) ---
  function playAlertSound() {
    if (!audioContext) initAudioContext();
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    
    if (!audioContext) return; 

    try {
      const t = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 'sawtooth' is sharper and naturally louder than 'sine'
      oscillator.type = 'sawtooth'; 

      // Duration of the siren (3 seconds)
      const duration = 2.0;
      
      // Volume: Start loud, stay loud, fade out at very end
      gainNode.gain.setValueAtTime(0.2, t); 
      gainNode.gain.setValueAtTime(0.2, t + duration - 0.2); 
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + duration);

      // Frequency Pattern: Emergency Siren (2 loops of High -> Low)
      const cycles = 2; 
      const step = duration / cycles;
      
      for (let i = 0; i < cycles; i++) {
        const start = t + (i * step);
        // Start High (1500Hz)
        oscillator.frequency.setValueAtTime(1500, start); 
        // Slide Low (800Hz)
        oscillator.frequency.exponentialRampToValueAtTime(800, start + step); 
      }

      oscillator.start(t);
      oscillator.stop(t + duration);
    } catch (e) {
      console.warn("Audio play failed", e);
    }
  }

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
      if (request.action === "showAlarmDialog") {
        if(isTradingView) showAlarmDialog();
      } 
      else if (request.action === "addAlertAtCross") {
        if(isTradingView) {
          const symbol = extractCurrentSymbol();
          const crossPrice = extractCrossHairPriceFromMenu(document.body) || extractCurrentPrice();
          saveDirectAlert(symbol, crossPrice);
        }
      } 
      else if (request.action === "showGlobalToast") {
        showGlobalToast(request.message, request.type || "info", request.duration);
      }
      else if (request.action === "playAlarmSound") {
        playAlertSound();
        // Use the duration passed from background (8000ms), or default to 4000
        if (request.message) showGlobalToast(request.message, "alert", request.duration || 4000);
      }
      else if (request.action === "changeSymbol") {
        if(isTradingView) performSeamlessSwitch(request.symbol);
      }
    } catch(e) { console.error(e); }
    sendResponse({ success: true });
  });


  // ==========================================================
  // 2. TRADINGVIEW SPECIFIC FEATURES
  //    These only run if we are on TradingView.
  // ==========================================================
  
  if (!isTradingView) return; // STOP HERE if not on TradingView

  // --- GLOBAL KEYBOARD SHORTCUTS (TV Only) ---
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
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // --- DIRECT SAVE FUNCTION ---
  function saveDirectAlert(symbol, price) {
    if (!chrome.runtime?.id) return;

    if (!symbol || !price || isNaN(price) || price <= 0) {
      showGlobalToast("Error: Could not detect valid price", "error");
      return;
    }
    const s = normalizeSymbol(symbol);
    const p = parseFloat(price);
    chrome.storage.local.get('alarms', ({ alarms }) => {
      if (!chrome.runtime?.id) return;
      const arr = alarms || [];
      arr.push({ symbol: s, type: 'touch', price: p, timestamp: Date.now() });
      chrome.storage.local.set({ alarms: arr }, () => {
        showGlobalToast(`Alert set for ${s} at ${p}`, "alert");
      });
    });
  }

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

  // --- MENU INJECTION LOGIC ---
  function injectMenuItem(menuNode) {
    if (menuNode.querySelector('#tv-custom-alert-item')) return;

    const item = document.createElement('div');
    item.id = 'tv-custom-alert-item';
    item.setAttribute('data-role', 'menu-item');
    item.style.cssText = `
      cursor: pointer; 
      padding: 8px 16px; 
      color: #c0c0c0; 
      font-size: 13px; 
      display: flex; 
      align-items: center; 
      transition: background 0.1s; 
      user-select: none; 
      box-sizing: border-box; 
      width: 100%;
      border-bottom: 1px solid #333;
    `;
    
    item.innerHTML = `
      <div style="flex:1; font-weight:400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Add alert @ cross price</div>
      <div style="width: 14px; text-align:center; font-size: 14px; opacity: 0.8;">🔔</div>
    `;
    
    item.onmouseenter = () => { item.style.background = '#2a2e39'; item.style.color = '#fff'; };
    item.onmouseleave = () => { item.style.background = 'transparent'; item.style.color = '#c0c0c0'; };
    
    item.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const symbol = extractCurrentSymbol();
      const crossPrice = extractCrossHairPriceFromMenu(menuNode) || extractCurrentPrice();
      
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
      
      saveDirectAlert(symbol, crossPrice);
    };

    if (menuNode.firstChild) {
      menuNode.insertBefore(item, menuNode.firstChild);
    } else {
      menuNode.appendChild(item);
    }
  }

  // --- OBSERVER ---
  const menuObserver = new MutationObserver((mutations) => {
    if (!chrome.runtime?.id) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) { 
          const text = node.innerText || "";
          if (text.includes("Reset chart view") && text.includes("Copy price")) {
             let inner = node.querySelector('[data-name="menu-inner"]');
             if (!inner) inner = node.querySelector('.scroll-wrap') || node.querySelector('.scrollable-content');
             if (!inner && node.tagName === 'DIV' && node.textContent.includes('Reset')) inner = node;
             if (inner) injectMenuItem(inner);
          }
        }
      }
    }
  });
  
  menuObserver.observe(document.body, { childList: true, subtree: true });

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

  function extractCrossHairPriceFromMenu(scopeElement) {
    const text = scopeElement.innerText || "";
    const match = text.match(/Copy price\s+([0-9,.]+)/i);
    if (match) return parseFloat(match[1].replace(/,/g, ''));
    return null;
  }

  function extractCurrentPrice() {
    const titleMatch = document.title.match(/^[A-Z0-9&\-._]+\s+([\d.,]+)/);
    if (titleMatch) return parseFloat(titleMatch[1].replace(/,/g, ''));
    const activeValues = document.querySelectorAll('[data-name="legend-last-value"]');
    if (activeValues.length > 0) return parseFloat(activeValues[0].textContent.trim().replace(/,/g, ''));
    return '';
  }

  // --- FLOATING BUTTONS (Pro UI) ---
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

      alarmButton = createButton('Alert', 'Set Price Alert', '#FF9800', '#F57C00', '#000000', '🔔');
      watchlistButton = createButton('Add', 'Add to Watchlist', '#2962FF', '#1E88E5', '#FFFFFF', '📋');

      alarmButton.addEventListener('click', (e) => handleButtonClick(e, 'alarm'));
      watchlistButton.addEventListener('click', (e) => handleButtonClick(e, 'watchlist'));

      buttonContainer.appendChild(alarmButton);
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

  function handleButtonClick(e, type) {
    if (isDragging || wasJustDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'alarm') showAlarmDialog();
    if (type === 'watchlist') showWatchlistDialog();
  }

  // --- DIALOGS ---
  function showAlarmDialog() { createAlarmDialog(extractCurrentSymbol(), extractCurrentPrice()); }
  function showWatchlistDialog() { createWatchlistDialog(extractCurrentSymbol()); }

  function createWatchlistDialog(symbol) {
    const backdrop = document.createElement('div');
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
        const normalized = normalizeSymbol(symbol);
        checkboxContainer.innerHTML = list.map((wl, i) => {
          const checked = wl.stocks && wl.stocks.some(s => normalizeSymbol(s) === normalized);
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
      const s = normalizeSymbol(dialog.querySelector('#watchlist-symbol').value.trim());
      chrome.runtime.sendMessage({ action: "getWatchlists" }, (res) => {
        let change = false;
        res.watchlists.forEach((wl, i) => {
          const chk = dialog.querySelector(`#wl-${i}`);
          if(!chk) return;
          const idx = wl.stocks ? wl.stocks.findIndex(x => normalizeSymbol(x) === s) : -1;
          if(chk.checked && idx === -1) { if(!wl.stocks) wl.stocks=[]; wl.stocks.push(s); change=true; }
          if(!chk.checked && idx !== -1) { wl.stocks.splice(idx, 1); change=true; }
        });
        closeDialog();
        if(change) chrome.runtime.sendMessage({ action: "updateWatchlists", watchlists: res.watchlists }, () => showGlobalToast("Watchlists updated", "info"));
      });
    };
    document.body.appendChild(backdrop);
  }

  function createAlarmDialog(symbol, defaultPrice = '') {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.7); z-index: 9999999; display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif;`;
    const dialog = document.createElement('div');
    dialog.style.cssText = `background: #1e1e1e; color: #eee; padding: 24px; border-radius: 8px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); min-width: 300px; max-width: 400px; border: 1px solid #333;`;
    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;"><h3 style="margin: 0; color: #fff; font-size: 18px;">Set Price Alert</h3><button id="alarm-close" style="background: none; border: none; color: #999; font-size: 20px; cursor: pointer; padding: 0;">&times;</button></div>
      <div style="margin-bottom: 16px;"><label style="display: block; margin-bottom: 8px; color: #ccc; font-size: 14px;">Symbol:</label><input type="text" id="alarm-symbol" value="${symbol}" style="width: 100%; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 14px; box-sizing: border-box;" /></div>
      <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 8px; color: #ccc; font-size: 14px;">Target Price:</label><input type="number" id="alarm-price" step="0.01" min="0" placeholder="Enter price" value="${defaultPrice}" style="width: 100%; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 14px; box-sizing: border-box;" /></div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;"><button id="alarm-cancel" style="padding: 8px 16px; background: #444; border: none; border-radius: 4px; color: #eee; cursor: pointer;">Cancel</button><button id="alarm-save" style="padding: 8px 16px; background: #0057ff; border: none; border-radius: 4px; color: white; cursor: pointer;">Set Alert</button></div>`;
    backdrop.appendChild(dialog);
    
    const closeDialog = () => { if(document.body.contains(backdrop)) document.body.removeChild(backdrop); };
    dialog.querySelector('#alarm-close').onclick = closeDialog;
    dialog.querySelector('#alarm-cancel').onclick = closeDialog;
    backdrop.onclick = (e) => { if(e.target === backdrop) closeDialog(); };
    
    dialog.querySelector('#alarm-save').onclick = () => {
      try {
        if (!chrome.runtime?.id) return;
        const s = normalizeSymbol(dialog.querySelector('#alarm-symbol').value.trim());
        const p = parseFloat(dialog.querySelector('#alarm-price').value);
        if(!s || !p || p<=0) return alert('Invalid input');
        
        chrome.storage.local.get('alarms', ({ alarms }) => {
          const arr = alarms || [];
          arr.push({ symbol: s, type: 'touch', price: p, timestamp: Date.now() });
          chrome.storage.local.set({ alarms: arr }, () => { 
            closeDialog(); 
            showGlobalToast(`Alert set for ${s}`, "alert"); 
          });
        });
      } catch (e) {
        console.error("Error saving alarm:", e);
        closeDialog(); 
      }
    };
    
    const pInput = dialog.querySelector('#alarm-price');
    pInput.onkeypress = (e) => { if(e.key === 'Enter') dialog.querySelector('#alarm-save').click(); };
    setTimeout(() => { pInput.focus(); pInput.select(); }, 100);
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