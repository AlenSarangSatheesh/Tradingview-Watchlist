const container = document.getElementById("watchlistContainer");
const newBtn = document.getElementById("newBtn");
const importBtn = document.getElementById("importBtn");
const renameBtn = document.getElementById("renameBtn");
const deleteBtn = document.getElementById("deleteBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const themeDark = document.getElementById("themeDark");
const themeLight = document.getElementById("themeLight");

const watchlistView = document.getElementById("watchlistView");
const stocksView = document.getElementById("stocksView");
const backBtn = document.getElementById("backBtn");
const watchlistTitle = document.getElementById("watchlistTitle");
const csvInput = document.getElementById("csvInput");
const importCsvInput = document.getElementById("importCsvInput");
const importStocksBtn = document.getElementById("importStocksBtn");
const sortBtn = document.getElementById("sortBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const stocksContainer = document.getElementById("stocksContainer");

const stockSearchInput = document.getElementById("stockSearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");

let selectedIndex = null;
let currentWatchlistIndex = null;
let tradingviewTabId = null;
let allStocks = [];
let draggedElement = null;
let draggedIndex = null;
let dragOverElement = null;

// ----------------- MESSAGE LISTENER (For Global Shortcuts & Sync) -----------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "triggerSelectNextStock") {
    if (stocksView.style.display !== 'none') {
      selectNextStock();
    }
  } else if (request.action === "refreshWatchlistUI") {
    // --- LOCK HEIGHT TO PREVENT SCROLL JUMP ---

    // 1. Capture current scroll & height
    const previousScroll = stocksContainer.scrollTop;
    const currentHeight = stocksContainer.getBoundingClientRect().height;

    // 2. Lock the height so the scrollbar doesn't collapse to 0
    if(currentHeight > 0) {
      stocksContainer.style.minHeight = currentHeight + 'px';
    }

    chrome.storage.local.get("watchlists", (result) => {
      const watchlists = result.watchlists;

      // If viewing a specific watchlist, re-render safely
      if (currentWatchlistIndex !== null && watchlists && watchlists[currentWatchlistIndex]) {
         const wl = watchlists[currentWatchlistIndex];
         allStocks = [...(wl.stocks || [])];

         // 3. Re-render list
         renderStocks(wl.stocks || [], wl.lastSelected).then(() => {
           // 4. Restore scroll position
           stocksContainer.scrollTop = previousScroll;

           // 5. Unlock height (allow it to grow/shrink naturally again)
           stocksContainer.style.minHeight = '';
         });
      }
      else {
         renderWatchlists(watchlists || []);
         // If we are in watchlist view, we don't need the height lock anymore
         stocksContainer.style.minHeight = '';
      }
    });
  }
});

// ----------------- KEYBOARD SHORTCUTS -----------------
document.addEventListener('keydown', (e) => {
  if (stocksView.style.display === 'none') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (e.code === 'Space') { e.preventDefault(); selectNextStock(); }
});

function selectNextStock() {
  const visibleItems = Array.from(stocksContainer.querySelectorAll('li:not(.empty-message):not(.search-empty-message):not(.hidden)'));
  if (visibleItems.length === 0) return;
  const activeIndex = visibleItems.findIndex(item => item.classList.contains('active'));
  let nextIndex = 0;
  if (activeIndex !== -1) { nextIndex = (activeIndex + 1) % visibleItems.length; }
  const nextItem = visibleItems[nextIndex];
  if (nextItem) {
    const stockName = nextItem.querySelector('.stock-name');
    if (stockName) {
      const symbol = stockName.textContent.trim();
      setActiveStock(symbol);
      openTradingView(symbol);
      nextItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ----------------- DRAG AND DROP -----------------
function initializeDragAndDrop() {
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);
}

function handleDragStart(e, index) {
  draggedElement = e.target; draggedIndex = index;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', index);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  container.querySelectorAll('li').forEach(item => item.classList.remove('drag-over'));
  draggedElement = null; draggedIndex = null; dragOverElement = null;
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.target.closest('li');
  if (target && target !== draggedElement) {
    container.querySelectorAll('li').forEach(item => { if (item !== target) item.classList.remove('drag-over'); });
    target.classList.add('drag-over'); dragOverElement = target;
  }
  return false;
}

function handleDragEnter(e) {
  const target = e.target.closest('li');
  if (target && target !== draggedElement) { target.classList.add('drag-over'); dragOverElement = target; }
}

function handleDragLeave(e) {
  const target = e.target.closest('li');
  if (target && e.relatedTarget && !target.contains(e.relatedTarget)) { target.classList.remove('drag-over'); }
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  if (e.preventDefault) e.preventDefault();
  container.querySelectorAll('li').forEach(item => item.classList.remove('drag-over'));

  if (!draggedElement || !dragOverElement || draggedElement === dragOverElement) {
    draggedElement = null; draggedIndex = null; dragOverElement = null; return false;
  }

  const draggedIdx = parseInt(draggedElement.dataset.index);
  const targetIdx = parseInt(dragOverElement.dataset.index);

  if (isNaN(draggedIdx) || isNaN(targetIdx)) return false;

  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const reordered = [...watchlists];
    const [item] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIdx, 0, item);

    if (selectedIndex !== null) {
      if (selectedIndex === draggedIdx) selectedIndex = targetIdx;
      else if (draggedIdx < selectedIndex && targetIdx >= selectedIndex) selectedIndex--;
      else if (draggedIdx > selectedIndex && targetIdx <= selectedIndex) selectedIndex++;
      saveLastSelectedWatchlist(selectedIndex);
    }

    chrome.storage.local.set({ watchlists: reordered }, () => {
      renderWatchlists(reordered);
      showToast('Watchlist reordered', 1000);
    });
  });

  draggedElement = null; draggedIndex = null; dragOverElement = null;
  return false;
}

// ----------------- SEARCH -----------------
function initializeSearch() {
  stockSearchInput.addEventListener('input', handleSearchInput);
  clearSearchBtn.addEventListener('click', clearSearch);
  stockSearchInput.value = ''; clearSearchBtn.style.display = 'none';
}

function handleSearchInput(e) {
  const term = e.target.value.toLowerCase().trim();
  if (term === '') { clearSearchBtn.style.display = 'none'; showAllStocks(); }
  else { clearSearchBtn.style.display = 'block'; filterStocks(term); }
}

function clearSearch() {
  stockSearchInput.value = ''; clearSearchBtn.style.display = 'none'; showAllStocks();
}

function filterStocks(term) {
  let visible = false;
  stocksContainer.querySelectorAll('li:not(.empty-message)').forEach(item => {
    const name = item.querySelector('.stock-name')?.textContent.toLowerCase() || '';
    if (name.includes(term)) { item.classList.remove('hidden'); visible = true; }
    else item.classList.add('hidden');
  });

  let msg = stocksContainer.querySelector('.search-empty-message');
  if (!visible && term !== '') {
    if (!msg) {
      msg = document.createElement('li'); msg.className = 'search-empty-message';
      msg.textContent = `No stocks found matching "${stockSearchInput.value}"`;
      msg.style.textAlign = 'center'; msg.style.color = '#888'; msg.style.padding = '20px';
      stocksContainer.appendChild(msg);
    }
  } else if (msg) msg.remove();
}

function showAllStocks() {
  stocksContainer.querySelectorAll('li:not(.empty-message):not(.search-empty-message)').forEach(item => item.classList.remove('hidden'));
  const msg = stocksContainer.querySelector('.search-empty-message');
  if (msg) msg.remove();
}

// ----------------- STATE & NOTIFS -----------------
function saveLastSelectedWatchlist(index) { chrome.storage.local.set({ lastSelectedWatchlistIndex: index }); }
function loadLastSelectedWatchlist(cb) { chrome.storage.local.get('lastSelectedWatchlistIndex', ({ lastSelectedWatchlistIndex }) => cb(lastSelectedWatchlistIndex)); }

function showToast(message, duration = 2000) {
  const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
  }, duration);
}

// ----------------- SORT -----------------
function sortStocksAlphabetically() {
  if (currentWatchlistIndex === null) return;
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const wl = watchlists[currentWatchlistIndex];
    if (!wl || !wl.stocks.length) return;

    wl.stocks.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    allStocks = [...wl.stocks];

    chrome.storage.local.set({ watchlists }, async () => {
      await renderStocks(wl.stocks, wl.lastSelected);
      showToast('Sorted A–Z', 1000);
    });
  });
}

// ----------------- RENDER -----------------
function renderWatchlists(list) {
  container.innerHTML = "";
  list.forEach((wl, i) => {
    const li = document.createElement("li"); li.draggable = true; li.dataset.index = i;
    if (i === selectedIndex) li.classList.add("selected");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = wl.name;
    li.appendChild(nameSpan);

    // Watchlists imported from Chartink carry their screener URL — offer one-click re-sync.
    if (wl.chartinkUrl) {
      const sync = document.createElement("button");
      sync.className = "resync-btn";
      sync.title = "Re-sync from Chartink";
      sync.innerHTML = '<img src="Images/Refresh.png" alt="Re-sync" class="icon">';
      sync.addEventListener('click', (e) => {
        e.stopPropagation();
        resyncWatchlistFromChartink(wl, sync);
      });
      li.appendChild(sync);
    }

    li.addEventListener("click", () => { selectedIndex = i; saveLastSelectedWatchlist(i); renderWatchlists(list); updateActionButtons(); });
    li.addEventListener("dblclick", () => { selectedIndex = i; saveLastSelectedWatchlist(i); openStocksView(i); });

    li.addEventListener('dragstart', (e) => handleDragStart(e, i));
    li.addEventListener('dragend', handleDragEnd);
    li.addEventListener('dragenter', handleDragEnter);
    li.addEventListener('dragleave', handleDragLeave);
    container.appendChild(li);
  });
  updateActionButtons();
}

function resyncWatchlistFromChartink(wl, btn) {
  if (btn) btn.classList.add('syncing');
  showToast(`Re-syncing "${wl.name}" from Chartink…`, 3000);
  chrome.runtime.sendMessage({ action: "importFromChartinkUrl", url: wl.chartinkUrl }, (res) => {
    if (btn) btn.classList.remove('syncing');
    if (chrome.runtime.lastError) { showToast("Re-sync failed: " + chrome.runtime.lastError.message); return; }
    if (res && res.success) {
      showToast(`${res.count} stocks synced into "${res.name}"`);
      chrome.storage.local.get("watchlists", ({ watchlists }) => renderWatchlists(watchlists || []));
    } else {
      showToast("Re-sync failed: " + ((res && res.error) || "unknown error"));
    }
  });
}

function updateActionButtons() {
  newBtn.style.display = 'flex'; importBtn.style.display = 'flex'; settingsBtn.style.display = 'flex';
  const show = selectedIndex !== null ? 'flex' : 'none';
  renameBtn.style.display = show; deleteBtn.style.display = show;
}

function openStocksView(index) {
  chrome.storage.local.get("watchlists", async ({ watchlists }) => {
    const wl = watchlists[index]; if (!wl) return;
    currentWatchlistIndex = index; watchlistTitle.textContent = wl.name; allStocks = [...(wl.stocks || [])];

    const display = (wl.stocks && wl.stocks.length > 0) ? 'flex' : 'none';
    sortBtn.style.display = display; clearAllBtn.style.display = display;

    initializeSearch();
    await renderStocks(wl.stocks || [], wl.lastSelected);

    if (wl.lastSelected) setTimeout(() => scrollToActiveStock(), 100);
    watchlistView.style.display = "none"; stocksView.style.display = "block";
  });
}

function scrollToActiveStock() {
  const el = stocksContainer.querySelector('.active'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scrollToSelected() {
  const selectedEl = container.querySelector('.selected'); if (selectedEl) selectedEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function renderStocks(stocks, lastSelected) {
  stocksContainer.innerHTML = "";
  const display = (stocks && stocks.length > 0) ? 'flex' : 'none';
  sortBtn.style.display = display; clearAllBtn.style.display = display;

  if (!stocks.length) { stocksContainer.innerHTML = '<li class="empty-message" style="text-align:center;color:#888;font-style:italic;">No stocks in this watchlist</li>'; return; }

  // We use a Promise so we can know when rendering is totally done
  return new Promise((resolve) => {
    stocks.forEach((stock, index) => {
      const li = document.createElement("li");
      const div = document.createElement("div"); div.className = "stock-main-content";
      div.innerHTML = `<span class="stock-name">${stock}</span>`;

      const grp = document.createElement("div"); grp.className = "stock-buttons-group";

      const del = document.createElement("button");
      del.className = "delete-btn delete-btn-right"; del.title = "Remove";
      del.innerHTML = '<img src="Images/delete.png" class="icon small">';
      // Use the loop index, not indexOf — with duplicates the latter always hits the first row.
      del.onclick = (e) => { e.stopPropagation(); removeStockFromWatchlist(stock, index); };
      grp.appendChild(del);

      li.appendChild(div); li.appendChild(grp);
      if (stock === lastSelected) li.classList.add("active");

      li.onclick = () => { setActiveStock(stock); openTradingView(stock); };
      stocksContainer.appendChild(li);
    });
    resolve();
  });
}

function removeStockFromWatchlist(stock, index) {
  // 1. Capture current scroll position and Height
  const scrollPosition = stocksContainer.scrollTop;
  const currentHeight = stocksContainer.getBoundingClientRect().height;

  // 2. Lock height
  if (stocksContainer && currentHeight > 0) {
    stocksContainer.style.minHeight = `${currentHeight}px`;
  }

  chrome.storage.local.get("watchlists", (result) => {
    const watchlists = result.watchlists;

    if (!watchlists || !watchlists[currentWatchlistIndex]) return;

    const wl = watchlists[currentWatchlistIndex];
    wl.stocks.splice(index, 1);
    allStocks = [...wl.stocks];
    if (wl.lastSelected === stock) wl.lastSelected = wl.stocks[0] || null;

    chrome.storage.local.set({ watchlists }, async () => {
      await renderStocks(wl.stocks, wl.lastSelected);

      // 3. Restore scroll position
      stocksContainer.scrollTop = scrollPosition;

      // 4. Unlock height
      if (stocksContainer) { stocksContainer.style.minHeight = ''; }

      showToast(`${stock} removed`);
      if (!wl.stocks.length) clearSearch();
    });
  });
}

function clearAllStocks() {
  if (!confirm('Clear all stocks?')) return;
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    watchlists[currentWatchlistIndex].stocks = [];
    watchlists[currentWatchlistIndex].lastSelected = null;
    allStocks = [];
    chrome.storage.local.set({ watchlists }, () => {
      renderStocks([], null); showToast('All stocks cleared'); clearSearch();
    });
  });
}

function setActiveStock(stock) {
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    watchlists[currentWatchlistIndex].lastSelected = stock;
    chrome.storage.local.set({ watchlists }, () => {
      stocksContainer.querySelectorAll('li').forEach(item => {
        item.classList.toggle('active', item.querySelector('.stock-name')?.textContent.trim() === stock);
      });
    });
  });
}

// ----------------- TRADINGVIEW TAB LOGIC -----------------
function openTradingView(stock) {
  const sanitizedStock = stock.replace(/-/g, '_').replace(/&/g, '_');
  chrome.tabs.query({ url: ["*://*.tradingview.com/*"] }, (tabs) => {
    const activeTvTab = tabs.find(t => t.url.includes('/chart/')) || tabs[0];
    if (activeTvTab) {
      const sendMessage = () => {
        chrome.tabs.sendMessage(activeTvTab.id, { action: "changeSymbol", symbol: sanitizedStock }, (response) => {
          if (chrome.runtime.lastError) {
             const url = `https://www.tradingview.com/chart/?symbol=NSE:${sanitizedStock}`;
             chrome.tabs.update(activeTvTab.id, { url });
          }
        });
      };
      if (activeTvTab.active) { sendMessage(); } else {
        chrome.tabs.update(activeTvTab.id, { active: true }, () => {
          if (chrome.runtime.lastError) createTradingViewTab(sanitizedStock);
          else sendMessage();
        });
      }
      tradingviewTabId = activeTvTab.id;
    } else { createTradingViewTab(sanitizedStock); }
  });
}

function createTradingViewTab(stock) {
  const sanitizedStock = stock.includes('_') ? stock : stock.replace(/-/g, '_').replace(/&/g, '_');
  const url = `https://www.tradingview.com/chart/?symbol=NSE:${sanitizedStock}`;
  chrome.tabs.create({ url }, (tab) => { tradingviewTabId = tab.id; });
}

// ----------------- INIT -----------------
chrome.storage.local.get("watchlists", ({ watchlists }) => {
  loadLastSelectedWatchlist((idx) => {
    if (idx !== undefined && watchlists && idx < watchlists.length) selectedIndex = idx;
    renderWatchlists(watchlists || []);
    initializeDragAndDrop();
    setTimeout(scrollToSelected, 100);
  });
});

newBtn.onclick = () => {
  const name = prompt("Watchlist name:");
  if (name) {
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      watchlists.push({ name, stocks: [], lastSelected: null });
      chrome.storage.local.set({ watchlists }, () => renderWatchlists(watchlists));
    });
  }
};

// ----------------- IMPORT MENU (CSV / Chartink) -----------------
// target 'new'     → create/overwrite a watchlist named after the source (watchlist list view)
// target 'current' → fill the currently open watchlist (stocks view)
importBtn.onclick = (e) => { e.stopPropagation(); showImportMenu(importBtn, 'new'); };
if (importStocksBtn) importStocksBtn.onclick = (e) => { e.stopPropagation(); showImportMenu(importStocksBtn, 'current'); };

let importMenuEl = null;
let importMenuAnchor = null;

function closeImportMenu() {
  if (importMenuEl) {
    importMenuEl.remove();
    importMenuEl = null;
    importMenuAnchor = null;
    document.removeEventListener('click', onDocClickForImportMenu, true);
  }
}

function onDocClickForImportMenu(e) {
  if (importMenuEl && !importMenuEl.contains(e.target) && importMenuAnchor && !importMenuAnchor.contains(e.target)) closeImportMenu();
}

function showImportMenu(anchorBtn, target) {
  if (importMenuEl) { closeImportMenu(); return; }
  const menu = document.createElement('div');
  menu.className = 'import-menu';
  menu.innerHTML = `
    <div class="import-menu-item" data-act="csv">Import from CSV</div>
    <div class="import-menu-item" data-act="chartink">Import from Chartink</div>`;
  document.body.appendChild(menu);
  importMenuEl = menu;
  importMenuAnchor = anchorBtn;

  const r = anchorBtn.getBoundingClientRect();
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';

  menu.querySelectorAll('.import-menu-item').forEach((item) => {
    item.onclick = () => {
      const act = item.dataset.act;
      closeImportMenu();
      if (act === 'csv') importFromCsv(target);
      else importFromChartink(target);
    };
  });

  setTimeout(() => document.addEventListener('click', onDocClickForImportMenu, true), 0);
}

function importFromCsv(target) {
  if (target === 'current') csvInput.click();   // fills the open watchlist
  else importCsvInput.click();                   // creates a watchlist named after the file
}

function importFromChartink(target) {
  const url = prompt("Paste the Chartink screener URL:\n(e.g. https://chartink.com/screener/short-term-breakouts)");
  if (!url) return;
  const trimmed = url.trim();
  if (!/^https?:\/\/(www\.)?chartink\.com\/screener\/.+/i.test(trimmed)) {
    alert("Please enter a valid Chartink screener URL (https://chartink.com/screener/...).");
    return;
  }
  showToast("Importing from Chartink…", 3000);
  const mode = target === 'current' ? 'symbols' : 'create';
  chrome.runtime.sendMessage({ action: "importFromChartinkUrl", url: trimmed, mode }, (res) => {
    if (chrome.runtime.lastError) { showToast("Import failed: " + chrome.runtime.lastError.message); return; }
    if (!res || !res.success) { showToast("Import failed: " + ((res && res.error) || "unknown error")); return; }
    if (target === 'current') {
      applySymbolsToCurrentWatchlist(res.symbols, res.name);
    } else {
      showToast(`${res.count} stocks imported into "${res.name}"`);
      chrome.storage.local.get("watchlists", ({ watchlists }) => renderWatchlists(watchlists || []));
    }
  });
}

// Replace the open watchlist's stocks with an imported symbol list.
function applySymbolsToCurrentWatchlist(symbols, sourceName) {
  if (currentWatchlistIndex === null) { showToast("Open a watchlist first"); return; }
  symbols = Array.from(new Set((symbols || []).filter(Boolean)));
  if (!symbols.length) { showToast("No stocks found to import"); return; }
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const wl = watchlists[currentWatchlistIndex];
    if (!wl) return;
    wl.stocks = symbols;
    wl.lastSelected = symbols[0] || null;
    allStocks = [...symbols];
    chrome.storage.local.set({ watchlists }, () => {
      openStocksView(currentWatchlistIndex);
      showToast(`${symbols.length} stocks imported into "${wl.name}"`);
    });
  });
}

function parseCsvSymbols(text) {
  let syms = text.split(/\r?\n/)
    .map((l) => (l.split(',')[0] || '').trim().replace(/^["']|["']$/g, '').toUpperCase())
    .filter(Boolean);
  if (syms.length && /^(SYMBOL|SYMBOLS|TICKER)$/.test(syms[0])) syms = syms.slice(1);
  return Array.from(new Set(syms));
}

// Menu CSV import → create/overwrite a watchlist named after the file.
importCsvInput.onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const baseName = (file.name.replace(/\.csv$/i, '').trim()) || 'Imported';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const symbols = parseCsvSymbols(ev.target.result);
    importCsvInput.value = "";
    if (!symbols.length) { showToast('No symbols found in the CSV'); return; }
    chrome.storage.local.get("watchlists", (data) => {
      const watchlists = data.watchlists || [];
      const existing = watchlists.find((w) => w.name === baseName);
      if (existing) { existing.stocks = symbols; existing.lastSelected = symbols[0] || null; }
      else watchlists.push({ name: baseName, stocks: symbols, lastSelected: symbols[0] || null });
      chrome.storage.local.set({ watchlists }, () => {
        renderWatchlists(watchlists);
        showToast(`${symbols.length} stocks imported into "${baseName}"`);
      });
    });
  };
  reader.readAsText(file);
};

// ----------------- SETTINGS & THEME -----------------
function applyTheme(theme) {
  const light = theme === 'light';
  document.body.classList.toggle('light', light);
  if (themeDark) themeDark.classList.toggle('active', !light);
  if (themeLight) themeLight.classList.toggle('active', light);
}

function setTheme(theme) {
  chrome.storage.local.set({ theme });
  applyTheme(theme);
}

chrome.storage.local.get('theme', ({ theme }) => applyTheme(theme === 'light' ? 'light' : 'dark'));

settingsBtn.onclick = () => { settingsModal.style.display = 'flex'; };
closeSettings.onclick = () => { settingsModal.style.display = 'none'; };
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; };
themeDark.onclick = () => setTheme('dark');
themeLight.onclick = () => setTheme('light');

renameBtn.onclick = () => {
  if (selectedIndex === null) return alert("Select watchlist");
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const name = prompt("New name:", watchlists[selectedIndex].name);
    if (name) { watchlists[selectedIndex].name = name; chrome.storage.local.set({ watchlists }, () => renderWatchlists(watchlists)); }
  });
};

deleteBtn.onclick = () => {
  if (selectedIndex === null) return alert("Select watchlist");
  if (confirm("Delete watchlist?")) {
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      watchlists.splice(selectedIndex, 1); selectedIndex = null;
      saveLastSelectedWatchlist(null);
      chrome.storage.local.set({ watchlists }, () => renderWatchlists(watchlists));
    });
  }
};

backBtn.onclick = () => {
  stocksView.style.display = "none"; watchlistView.style.display = "block";
  currentWatchlistIndex = null; allStocks = [];
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    renderWatchlists(watchlists);
    setTimeout(scrollToSelected, 50);
  });
};

sortBtn.onclick = () => sortStocksAlphabetically();
clearAllBtn.onclick = () => clearAllStocks();

// Stocks-view CSV import → fills the currently open watchlist.
csvInput.onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const symbols = parseCsvSymbols(ev.target.result);
    csvInput.value = "";
    if (!symbols.length) { showToast('No symbols found in the CSV'); return; }
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      if (!watchlists[currentWatchlistIndex]) return;
      watchlists[currentWatchlistIndex].stocks = symbols; allStocks = [...symbols];
      chrome.storage.local.set({ watchlists }, () => {
        openStocksView(currentWatchlistIndex);
        showToast(`${symbols.length} stocks imported`);
      });
    });
  };
  reader.readAsText(file);
};
