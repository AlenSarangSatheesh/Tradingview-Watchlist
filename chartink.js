// chartink.js
// Isolated-world content script on chartink.com/screener/* pages.
// Extracts every stock from the current screener and creates/overwrites a watchlist named
// after the screener, via the extension's existing getWatchlists / updateWatchlists messaging.
// Invoked two ways: the injected floating button, or an "importScreener" runtime message
// sent by the side panel (background.js opens/locates the Chartink tab first).
(function () {
  'use strict';
  if (window.__ctkContentLoaded) return;
  window.__ctkContentLoaded = true;

  // ----------------- HELPERS -----------------
  // Full symbol list captured from the screener's JSON response by chartink-interceptor.js.
  function getStashedSymbols() {
    try {
      const raw = document.documentElement.dataset.ctkSymbols;
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function getScanClause() {
    return document.documentElement.dataset.ctkScanClause || null;
  }

  function getCsrf() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : null;
  }

  function getScreenerName() {
    let t = (document.title || '').replace(/,\s*Technical.*$/i, '').trim();
    if (t && t.toLowerCase() !== 'chartink') return t;
    const h = document.querySelector('h1, h2');
    if (h && h.textContent.trim()) return h.textContent.trim();
    return 'Chartink Screener';
  }

  function hasResults() {
    return getStashedSymbols().length > 0 || !!document.querySelector('table tbody tr td');
  }

  function waitFor(pred, timeout, interval) {
    return new Promise((resolve) => {
      if (pred()) return resolve(true);
      const start = Date.now();
      const t = setInterval(() => {
        if (pred() || Date.now() - start > timeout) { clearInterval(t); resolve(pred()); }
      }, interval);
    });
  }

  // ----------------- SYMBOL EXTRACTION -----------------
  // Fallback 1: replay the page's own scan request (same-origin) -> full JSON list.
  async function fetchSymbolsViaReplay() {
    const clause = getScanClause();
    const csrf = getCsrf();
    if (!clause || !csrf) return null;
    try {
      const body = new URLSearchParams();
      body.set('scan_clause', clause);
      const res = await fetch('/screener/process', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf,
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: body.toString(),
        credentials: 'same-origin'
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json || !Array.isArray(json.data)) return null;
      return json.data
        .map((r) => (r.nsecode || r.bsecode || '').toString().trim().toUpperCase())
        .filter(Boolean);
    } catch (e) {
      return null;
    }
  }

  // Fallback 2: read the rendered table's "Symbol" column (visible rows only).
  function fetchSymbolsViaDom() {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td'));
    const symIdx = headers.findIndex((h) => /^\s*symbol\s*$/i.test(h.textContent.trim()));

    const symbols = new Set();
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      let val = '';
      if (symIdx >= 0 && cells[symIdx]) val = cells[symIdx].textContent.trim();
      if (!val) {
        const a = tr.querySelector('a[href*="/stocks/"]');
        if (a) {
          const m = (a.getAttribute('href') || '').match(/\/stocks\/([A-Za-z0-9&._-]+)\.html/i);
          val = m ? m[1] : a.textContent.trim();
        }
      }
      if (val) symbols.add(val.toUpperCase());
    });
    return Array.from(symbols);
  }

  // ----------------- SAVE -----------------
  // Resolves { ok, savedName } — savedName may differ from the screener name when the user
  // renamed a previously imported watchlist (matched by its stored chartinkUrl).
  function saveToWatchlist(name, symbols) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) return resolve({ ok: false });
      const pageUrl = location.origin + location.pathname;
      chrome.runtime.sendMessage({ action: 'getWatchlists' }, (res) => {
        if (chrome.runtime.lastError || !res) return resolve({ ok: false });
        const watchlists = res.watchlists || [];
        // Match by screener URL first (survives renames), then by name.
        const existing = watchlists.find((w) => w.chartinkUrl === pageUrl) ||
                         watchlists.find((w) => w.name === name);
        let savedName = name;
        if (existing) {
          existing.stocks = symbols;            // overwrite contents
          existing.lastSelected = symbols[0] || null;
          existing.chartinkUrl = pageUrl;
          savedName = existing.name;
        } else {
          watchlists.push({ name, stocks: symbols, lastSelected: symbols[0] || null, chartinkUrl: pageUrl });
        }
        chrome.runtime.sendMessage({ action: 'updateWatchlists', watchlists }, () => {
          resolve({ ok: !chrome.runtime.lastError, savedName });
        });
      });
    });
  }

  // ----------------- IMPORT CORE -----------------
  async function importScreener(opts = {}) {
    await waitFor(hasResults, opts.waitForData ? 12000 : 4000, 250);

    const name = getScreenerName();

    // Prefer the full list captured from the screener's response; then replay; then DOM.
    let symbols = getStashedSymbols();
    if (!symbols.length) { const r = await fetchSymbolsViaReplay(); if (r) symbols = r; }
    if (!symbols.length) symbols = fetchSymbolsViaDom();
    symbols = Array.from(new Set((symbols || []).map((s) => s.trim().toUpperCase()).filter(Boolean)));

    if (!symbols.length) {
      showToast('No stocks found. Make sure the screener results have loaded, then retry.', 'error');
      return { success: false, error: 'no-data' };
    }

    // mode 'symbols': just hand the list back (caller decides where to put it).
    if (opts.mode === 'symbols') {
      showToast(`${symbols.length} stocks read from "${name}"`, 'success');
      return { success: true, name, symbols, count: symbols.length };
    }

    const saved = await saveToWatchlist(name, symbols);
    if (!saved.ok) {
      showToast('Could not save the watchlist.', 'error');
      return { success: false, error: 'save-failed' };
    }

    showToast(`${symbols.length} stocks imported into "${saved.savedName}"`, 'success');
    return { success: true, name: saved.savedName, symbols, count: symbols.length };
  }

  // ----------------- TOAST -----------------
  function showToast(message, type = 'info', duration = 4000) {
    const existing = document.querySelector('.ctk-ext-toast');
    if (existing) existing.remove();
    const colors = { info: '#2962FF', success: '#4caf50', error: '#F44336' };
    const accent = colors[type] || colors.info;
    const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
    const toast = document.createElement('div');
    toast.className = 'ctk-ext-toast';
    toast.style.cssText = `position: fixed; top: 24px; right: 24px; background:#1E222D; color:#E0E3EB; padding:14px 20px; border-radius:8px; z-index:2147483647; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:500; box-shadow:0 8px 24px rgba(0,0,0,0.4); border-left:4px solid ${accent}; display:flex; align-items:center; gap:12px; max-width:340px;`;
    toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, duration);
  }

  // ----------------- IMPORT BUTTON -----------------
  const BTN_LABEL = 'Import to Watchlist';

  async function runImport(btn) {
    btn.disabled = true;
    btn.textContent = 'Importing…';
    try { await importScreener(); } finally { btn.textContent = BTN_LABEL; btn.disabled = false; }
  }

  function getToolbarButtonByText(text) {
    const t = text.toLowerCase();
    return Array.from(document.querySelectorAll('button, a'))
      .find((c) => c.textContent.trim().toLowerCase() === t && c.offsetParent !== null) || null;
  }

  function lowestCommonAncestor(a, b) {
    const set = new Set();
    for (let n = a; n; n = n.parentElement) set.add(n);
    for (let n = b; n; n = n.parentElement) if (set.has(n)) return n;
    return null;
  }

  function directChildContaining(row, el) {
    let n = el;
    while (n && n.parentElement !== row) n = n.parentElement;
    return n;
  }

  // Returns { anchor, row, slot }: anchor = button whose styling we copy; row = the toolbar
  // container; slot = the row's direct child wrapping the anchor (we insert right after it).
  // Inserting at the row level — rather than next to the Excel <button> which may be nested in
  // its own wrapper — is what makes our button a proper sibling with real spacing.
  function findToolbarDock() {
    const labels = ['excel', 'csv', 'copy', 'customize columns'];
    let anchor = null;
    for (const l of labels) { anchor = getToolbarButtonByText(l); if (anchor) break; }
    if (!anchor) return null;

    let ref = null;
    for (const l of labels) { const el = getToolbarButtonByText(l); if (el && el !== anchor) { ref = el; break; } }

    let row = null;
    let slot = null;
    if (ref) {
      row = lowestCommonAncestor(anchor, ref);
      slot = row ? directChildContaining(row, anchor) : null;
    }
    if (!row || !slot) { row = anchor.parentElement; slot = anchor; }
    return { anchor, row, slot };
  }

  // Dock into the toolbar, matching the neighbouring button by copying its *computed* styles.
  // We deliberately do NOT copy Chartink's classes — those carry the CSV/Excel export
  // click-handlers (by class), which would make our button also trigger a spreadsheet download.
  function injectIntoToolbar(dock) {
    const anchor = dock.anchor;
    const row = dock.row;
    const slot = dock.slot;

    const btn = document.createElement('button');
    btn.id = 'ctk-import-btn';
    btn.type = 'button';
    btn.textContent = BTN_LABEL;

    try {
      const cs = getComputedStyle(anchor);
      const copy = [
        'boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
        'letterSpacing', 'textTransform', 'color', 'backgroundColor', 'backgroundImage',
        'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'height', 'minHeight', 'boxShadow'
      ];
      copy.forEach((p) => { try { if (cs[p]) btn.style[p] = cs[p]; } catch (e) {} });
    } catch (e) {}

    // The visual button styling (background, padding, pill radius) may sit on the button OR
    // an ancestor wrapper (the element we copied from can be transparent and padding-less).
    // Walk up to find the element with the real background and copy its look wholesale.
    try {
      let bgFound = false;
      for (let el = anchor, i = 0; el && i < 4; el = el.parentElement, i++) {
        const bcs = getComputedStyle(el);
        const bc = bcs.backgroundColor;
        const hasColor = bc && bc !== 'transparent' && bc !== 'rgba(0, 0, 0, 0)';
        const hasImage = bcs.backgroundImage && bcs.backgroundImage !== 'none';
        if (hasColor || hasImage) {
          if (hasColor) btn.style.backgroundColor = bc;
          if (hasImage) btn.style.backgroundImage = bcs.backgroundImage;
          ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
           'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'
          ].forEach((p) => { try { if (bcs[p]) btn.style[p] = bcs[p]; } catch (e2) {} });
          if (bcs.color && bcs.color !== 'rgba(0, 0, 0, 0)') btn.style.color = bcs.color;
          bgFound = true;
          break;
        }
      }
      if (!bgFound) btn.style.backgroundColor = '#2563eb';
    } catch (e) { btn.style.backgroundColor = '#2563eb'; }

    // Minimums so the label never hugs the edges, whatever Chartink's markup looks like.
    if ((parseFloat(btn.style.paddingLeft) || 0) < 10) btn.style.padding = '5px 14px';
    if ((parseFloat(btn.style.borderTopLeftRadius) || 0) < 4) btn.style.borderRadius = '6px';
    if (!btn.style.color || btn.style.color === 'rgba(0, 0, 0, 0)') btn.style.color = '#fff';

    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.whiteSpace = 'nowrap';
    btn.style.verticalAlign = 'middle';
    btn.style.cursor = 'pointer';

    // Add our own left gap unless the toolbar already spaces its children via flex/grid gap.
    try {
      const rcs = getComputedStyle(row);
      const gapVal = parseFloat(rcs.columnGap) || parseFloat(rcs.gap) || 0;
      const spacedByGap = /flex|grid/.test(rcs.display) && gapVal > 0;
      if (!spacedByGap) btn.style.setProperty('margin-left', '10px', 'important');
    } catch (e) { btn.style.setProperty('margin-left', '10px', 'important'); }

    btn.onmouseenter = () => { btn.style.filter = 'brightness(1.1)'; };
    btn.onmouseleave = () => { btn.style.filter = 'none'; };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      runImport(btn);
    });

    row.insertBefore(btn, slot ? slot.nextSibling : null);
  }

  // Fallback when no toolbar is present (e.g. results not rendered): a fixed floating button.
  function injectFloatingButton() {
    if (document.getElementById('ctk-import-btn') || !document.body) return;
    const btn = document.createElement('button');
    btn.id = 'ctk-import-btn';
    btn.type = 'button';
    btn.textContent = BTN_LABEL;
    btn.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 2147483646; background:#2962FF; color:#fff; border:none; border-radius:8px; padding:12px 16px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;`;
    btn.onmouseenter = () => { btn.style.background = '#1E88E5'; };
    btn.onmouseleave = () => { btn.style.background = '#2962FF'; };
    btn.addEventListener('click', (e) => { e.preventDefault(); runImport(btn); });
    document.body.appendChild(btn);
  }

  function tryInjectButton() {
    if (document.getElementById('ctk-import-btn')) return true;
    const dock = findToolbarDock();
    if (dock && dock.row) { injectIntoToolbar(dock); return true; }
    return false;
  }

  // Dock into the toolbar once it renders; fall back to a floating button if it never appears.
  function ensureButton() {
    if (tryInjectButton()) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (tryInjectButton()) { clearInterval(iv); return; }
      if (tries >= 30) { clearInterval(iv); injectFloatingButton(); }
    }, 500);
  }

  // ----------------- MESSAGE LISTENER (side-panel entry) -----------------
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'importScreener') {
      importScreener({ waitForData: true, mode: request.mode }).then(sendResponse);
      return true; // async response
    }
  });

  // ----------------- INIT -----------------
  ensureButton();
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(ensureButton, 1000);
    } else if (!document.getElementById('ctk-import-btn')) {
      // Toolbar re-rendered (pagination/search) and dropped our button — re-dock it.
      tryInjectButton();
    }
  }).observe(document, { subtree: true, childList: true });
})();
