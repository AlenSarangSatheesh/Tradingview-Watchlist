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

const backupDataBtn = document.getElementById("backupDataBtn");
const restoreDataBtn = document.getElementById("restoreDataBtn");
const restoreFileInput = document.getElementById("restoreFileInput");

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

const ctxMenu = document.getElementById('stockContextMenu');
const ctxMenuTitle = document.getElementById('ctxMenuTitle');
const ctxColorDots = document.querySelectorAll('.color-dot');
const ctxNoteInput = document.getElementById('ctxNoteInput');
const ctxClearBtn = document.getElementById('ctxClearBtn');
const ctxSaveBtn = document.getElementById('ctxSaveBtn');
let ctxTargetStock = null;
let ctxSelectedColor = "";

let selectedIndex = null;
let currentWatchlistIndex = null;
let tradingviewTabId = null;
let allStocks = [];
let draggedElement = null;
let draggedIndex = null;
let dragOverElement = null;
let draggedType = null;

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
    if (currentHeight > 0) {
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
          reapplySearch();
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
  container.addEventListener('dragover', (e) => handleDragOver(e, container));
  container.addEventListener('drop', (e) => handleDrop(e, 'watchlist'));
  
  stocksContainer.addEventListener('dragover', (e) => handleDragOver(e, stocksContainer));
  stocksContainer.addEventListener('drop', (e) => handleDrop(e, 'stock'));
}

function handleDragStart(e, index, type = 'watchlist') {
  draggedElement = e.target; draggedIndex = index; draggedType = type;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', index);
}

function handleDragEnd(e, parentContainer) {
  e.target.classList.remove('dragging');
  if (!parentContainer) parentContainer = draggedType === 'stock' ? stocksContainer : container;
  parentContainer.querySelectorAll('li').forEach(item => item.classList.remove('drag-over'));
  draggedElement = null; draggedIndex = null; dragOverElement = null; draggedType = null;
}

function handleDragOver(e, parentContainer) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.target.closest('li');
  if (target && target !== draggedElement && target.parentElement === parentContainer) {
    parentContainer.querySelectorAll('li').forEach(item => { if (item !== target) item.classList.remove('drag-over'); });
    target.classList.add('drag-over'); dragOverElement = target;
  }
  return false;
}

function handleDragEnter(e, parentContainer) {
  const target = e.target.closest('li');
  if (target && target !== draggedElement && target.parentElement === parentContainer) { target.classList.add('drag-over'); dragOverElement = target; }
}

function handleDragLeave(e, parentContainer) {
  const target = e.target.closest('li');
  if (target && e.relatedTarget && !target.contains(e.relatedTarget) && target.parentElement === parentContainer) { target.classList.remove('drag-over'); }
}

function handleDrop(e, type) {
  if (e.stopPropagation) e.stopPropagation();
  if (e.preventDefault) e.preventDefault();
  
  const parentContainer = type === 'stock' ? stocksContainer : container;
  parentContainer.querySelectorAll('li').forEach(item => item.classList.remove('drag-over'));

  if (!draggedElement || !dragOverElement || draggedElement === dragOverElement || draggedType !== type) {
    draggedElement = null; draggedIndex = null; dragOverElement = null; draggedType = null; return false;
  }

  const draggedIdx = parseInt(draggedElement.dataset.index);
  const targetIdx = parseInt(dragOverElement.dataset.index);

  if (isNaN(draggedIdx) || isNaN(targetIdx)) return false;

  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    if (type === 'watchlist') {
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
    } else if (type === 'stock') {
      const wl = watchlists[currentWatchlistIndex];
      const reordered = [...wl.stocks];
      const [item] = reordered.splice(draggedIdx, 1);
      reordered.splice(targetIdx, 0, item);
      wl.stocks = reordered;
      allStocks = [...reordered];
      chrome.storage.local.set({ watchlists }, async () => {
        await renderStocks(wl.stocks, wl.lastSelected);
        reapplySearch();
        showToast('Stock reordered', 1000);
      });
    }
  });

  draggedElement = null; draggedIndex = null; dragOverElement = null; draggedType = null;
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

function reapplySearch() {
  if (stockSearchInput && stockSearchInput.value.trim() !== '') {
    filterStocks(stockSearchInput.value.toLowerCase().trim());
  }
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
      reapplySearch();
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

    li.addEventListener('dragstart', (e) => handleDragStart(e, i, 'watchlist'));
    li.addEventListener('dragend', (e) => handleDragEnd(e, container));
    li.addEventListener('dragenter', (e) => handleDragEnter(e, container));
    li.addEventListener('dragleave', (e) => handleDragLeave(e, container));
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
    currentWatchlistIndex = index; watchlistTitle.textContent = wl.name; watchlistTitle.title = wl.name; allStocks = [...(wl.stocks || [])];

    let needsResolution = false;
    const resolvePromises = (wl.stocks || []).map(async (stock, i) => {
      const match = stock.match(/^(NSE|BSE):(.*)/i);
      const sym = match ? match[2] : stock;
      if (/^\d+$/.test(sym)) {
        needsResolution = true;
        const tvSymbol = await getTradingViewSymbol(stock);
        return { i, old: stock, tvSymbol };
      }
      return null;
    });

    if (needsResolution) {
      watchlistTitle.textContent = wl.name + ' (Resolving BSE...)';
      Promise.all(resolvePromises).then(results => {
        let updated = false;
        results.forEach(res => {
          if (res && res.tvSymbol !== res.old) {
            wl.stocks[res.i] = res.tvSymbol;
            if (wl.lastSelected === res.old) wl.lastSelected = res.tvSymbol;
            updated = true;
          }
        });
        if (updated) {
          chrome.storage.local.set({ watchlists }, () => {
            if (currentWatchlistIndex === index) {
              watchlistTitle.textContent = wl.name;
              allStocks = [...wl.stocks];
              renderStocks(wl.stocks, wl.lastSelected);
            }
          });
        } else {
          if (currentWatchlistIndex === index) watchlistTitle.textContent = wl.name;
        }
      });
    }

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
  const currentScroll = stocksContainer.scrollTop;
  stocksContainer.innerHTML = "";
  const display = (stocks && stocks.length > 0) ? 'flex' : 'none';
  sortBtn.style.display = display; clearAllBtn.style.display = display;

  if (!stocks.length) { stocksContainer.innerHTML = '<li class="empty-message" style="text-align:center;color:#888;font-style:italic;">No stocks in this watchlist</li>'; return; }

  // We use a Promise so we can know when rendering is totally done
  return new Promise((resolve) => {
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      const wl = watchlists && watchlists[currentWatchlistIndex];
      const notes = (wl && wl.stockNotes) ? wl.stockNotes : {};

      stocks.forEach((stock, index) => {
        const li = document.createElement("li");
        li.draggable = true; li.dataset.index = index;
        li.addEventListener('dragstart', (e) => handleDragStart(e, index, 'stock'));
        li.addEventListener('dragend', (e) => handleDragEnd(e, stocksContainer));
        li.addEventListener('dragenter', (e) => handleDragEnter(e, stocksContainer));
        li.addEventListener('dragleave', (e) => handleDragLeave(e, stocksContainer));
        li.addEventListener('contextmenu', (e) => openContextMenu(e, stock));
        const div = document.createElement("div"); div.className = "stock-main-content";
        let innerHTML = `<span class="stock-name">${stock}</span>`;
        if (notes[stock]) {
          if (notes[stock].color) {
            innerHTML = `<span class="stock-tag-dot" style="background-color: ${notes[stock].color};"></span>` + innerHTML;
          }
          if (notes[stock].text) {
            // Note: Make sure to escape HTML if note contains tags. We use textContent later or sanitize here.
            // For simplicity and safety, we will append it as a text node instead of innerHTML later if needed,
            // but we can just use a span and set textContent.
            const textSpan = document.createElement('span');
            textSpan.className = 'stock-note-text';
            textSpan.textContent = notes[stock].text;
            innerHTML += textSpan.outerHTML;
          }
        }
        div.innerHTML = innerHTML;

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
      stocksContainer.scrollTop = currentScroll;
      resolve();
    });
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
    if (wl.stocks[index] === stock) {
      wl.stocks.splice(index, 1);
    } else {
      const actualIndex = wl.stocks.indexOf(stock);
      if (actualIndex > -1) {
        wl.stocks.splice(actualIndex, 1);
      }
    }
    allStocks = [...wl.stocks];
    if (wl.lastSelected === stock) wl.lastSelected = wl.stocks[0] || null;

    chrome.storage.local.set({ watchlists }, async () => {
      await renderStocks(wl.stocks, wl.lastSelected);

      // 3. Restore scroll position
      stocksContainer.scrollTop = scrollPosition;

      // 4. Unlock height
      if (stocksContainer) { stocksContainer.style.minHeight = ''; }

      reapplySearch();
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
async function getTradingViewSymbol(stock) {
  let exchange = 'NSE';
  let sym = stock;
  const match = stock.match(/^(NSE|BSE):(.*)/i);
  if (match) {
    exchange = match[1].toUpperCase();
    sym = match[2];
  } else if (/^\d+$/.test(stock)) {
    exchange = 'BSE';
  }

  if (exchange === 'BSE' && /^\d+$/.test(sym)) {
    const cacheKey = `bse_cache_${sym}`;
    const cache = await chrome.storage.local.get(cacheKey);
    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    let companyName = null;
    const nameMapRes = await chrome.storage.local.get('bse_name_map');
    const nameMap = nameMapRes.bse_name_map || {};
    companyName = nameMap[sym];

    if (!companyName) {
      try {
        const res = await fetch(`https://www.screener.in/company/${sym}/`);
        if (res.ok) {
          const html = await res.text();
          const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          if (h1Match) {
            companyName = h1Match[1].replace(/Ltd\.?|Limited|Inc\.?|Corp\.?|Company/ig, '').trim();
          }
        }
      } catch (e) {
        console.error('Failed to resolve BSE symbol from screener', e);
      }
    }

    if (companyName) {
      // In the Webstore version, we don't use external APIs due to CORS and permission restrictions.
      // Instead, we just save the company name as the symbol.
      // The UI will display this name nicely, and when clicked, our content.js script 
      // will type "BSE:Company Name" into TradingView's search box. TradingView's 
      // fuzzy search will automatically select the correct ticker symbol!
      const cleanName = companyName.replace(/<[^>]*>?/gm, '').trim();
      const finalSym = `BSE:${cleanName}`;
      chrome.storage.local.set({ [cacheKey]: finalSym });
      return finalSym;
    }
  }

  const sanitizedStock = sym.includes('_') ? sym : sym.replace(/-/g, '_').replace(/&/g, '_');
  return `${exchange}:${sanitizedStock}`;
}

function activateTab(tab) {
  chrome.tabs.update(tab.id, { active: true }, () => {
    if (tab.windowId) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
}

async function openTradingView(stock) {
  const tvSymbol = await getTradingViewSymbol(stock);


  chrome.tabs.query({ url: ["*://*.tradingview.com/*"] }, (tabs) => {
    const activeTvTab = tabs.find(t => t.url.includes('/chart/')) || tabs[0];
    if (activeTvTab) {
      if (!activeTvTab.url.includes('/chart/')) {
        const url = `https://www.tradingview.com/chart/?symbol=${tvSymbol}`;
        chrome.tabs.update(activeTvTab.id, { url, active: true }, () => {
          chrome.windows.update(activeTvTab.windowId, { focused: true });
        });
        tradingviewTabId = activeTvTab.id;
        return;
      }

      const sendMessage = () => {
        chrome.tabs.sendMessage(activeTvTab.id, { action: "changeSymbol", symbol: tvSymbol }, (response) => {
          if (chrome.runtime.lastError) {
            const url = `https://www.tradingview.com/chart/?symbol=${tvSymbol}`;
            chrome.tabs.update(activeTvTab.id, { url });
          }
        });
      };
      
      activateTab(activeTvTab);
      sendMessage();
      tradingviewTabId = activeTvTab.id;
    } else { createTradingViewTabWithSymbol(tvSymbol); }
  });
}

function createTradingViewTabWithSymbol(tvSymbol) {
  const url = `https://www.tradingview.com/chart/?symbol=${tvSymbol}`;
  chrome.tabs.create({ url }, (tab) => { tradingviewTabId = tab.id; });
}

async function createTradingViewTab(stock) {
  const tvSymbol = await getTradingViewSymbol(stock);
  createTradingViewTabWithSymbol(tvSymbol);
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
      applySymbolsToCurrentWatchlist(res.symbols, res.name, trimmed);
    } else {
      showToast(`${res.count} stocks imported into "${res.name}"`);
    }
  });
}

// Replace the open watchlist's stocks with an imported symbol list.
function applySymbolsToCurrentWatchlist(symbols, sourceName, chartinkUrl) {
  if (currentWatchlistIndex === null) { showToast("Open a watchlist first"); return; }
  symbols = Array.from(new Set((symbols || []).filter(Boolean)));
  if (!symbols.length) { showToast("No stocks found to import"); return; }
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const wl = watchlists[currentWatchlistIndex];
    if (!wl) return;
    wl.stocks = symbols;
    wl.lastSelected = symbols[0] || null;
    if (chartinkUrl) wl.chartinkUrl = chartinkUrl;
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
  chrome.storage.local.set({ theme }, () => applyTheme(theme));
}

// ----------------- CONTEXT MENU FOR TAGS & NOTES -----------------

function openContextMenu(e, stock) {
  try {
    e.preventDefault();
    console.log("Right click intercepted for:", stock);
    ctxTargetStock = stock;
    ctxMenuTitle.textContent = stock;
    
    // Capture coordinates synchronously
    let x = e.clientX;
    let y = e.clientY;
    console.log("Coordinates:", x, y);
    
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      try {
        console.log("Storage fetched.");
        const wl = watchlists[currentWatchlistIndex];
        if (wl && wl.stockNotes && wl.stockNotes[stock]) {
          const data = wl.stockNotes[stock];
          ctxSelectedColor = data.color || "";
          ctxNoteInput.value = data.text || "";
        } else {
          ctxSelectedColor = "";
          ctxNoteInput.value = "";
        }
        
        ctxColorDots.forEach(dot => {
          dot.classList.toggle('selected', dot.dataset.color === ctxSelectedColor);
        });

        ctxMenu.classList.add('show');
        
        const rect = ctxMenu.getBoundingClientRect();
        console.log("Menu rect:", rect);
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;
        
        ctxMenu.style.left = `${x}px`;
        ctxMenu.style.top = `${y}px`;
        ctxNoteInput.focus();
        console.log("Menu positioned at:", x, y);
      } catch (innerErr) {
        console.error("Inner menu error:", innerErr);
        alert("Inner menu error: " + innerErr.message);
      }
    });
  } catch (err) {
    console.error("Error opening menu:", err);
    alert("Error opening menu: " + err.message);
  }
}

function closeContextMenu() {
  ctxMenu.classList.remove('show');
  ctxMenu.style.display = '';
  ctxTargetStock = null;
}

document.addEventListener('mousedown', (e) => {
  if (e.button !== 2 && ctxMenu.classList.contains('show') && !ctxMenu.contains(e.target)) {
    closeContextMenu();
  }
});

ctxColorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    ctxSelectedColor = dot.dataset.color;
    ctxColorDots.forEach(d => d.classList.toggle('selected', d.dataset.color === ctxSelectedColor));
  });
});

function saveContextNote() {
  if (!ctxTargetStock) return;
  const color = ctxSelectedColor;
  const text = ctxNoteInput.value.trim();
  
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    if (!watchlists || !watchlists[currentWatchlistIndex]) return;
    const wl = watchlists[currentWatchlistIndex];
    if (!wl.stockNotes) wl.stockNotes = {};
    
    if (!color && !text) {
      delete wl.stockNotes[ctxTargetStock];
    } else {
      wl.stockNotes[ctxTargetStock] = { color, text };
    }
    
    chrome.storage.local.set({ watchlists }, () => {
      closeContextMenu();
      renderStocks(wl.stocks, wl.lastSelected).then(() => {
        reapplySearch();
      });
    });
  });
}

ctxSaveBtn.addEventListener('click', saveContextNote);
ctxNoteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveContextNote(); });

ctxClearBtn.addEventListener('click', () => {
  ctxSelectedColor = "";
  ctxNoteInput.value = "";
  saveContextNote();
});

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

// ----------------- BACKUP & RESTORE -----------------
if (backupDataBtn) {
  backupDataBtn.addEventListener('click', () => {
    chrome.storage.local.get(null, (data) => {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `TradingView_Watchlists_Backup_${dateStr}.json`;
      
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      showToast("Backup downloaded successfully!", 3000);
    });
  });
}

if (restoreDataBtn && restoreFileInput) {
  restoreDataBtn.addEventListener('click', () => {
    restoreFileInput.click();
  });
  
  restoreFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsedData = JSON.parse(ev.target.result);
        if (typeof parsedData !== 'object' || parsedData === null) throw new Error("Invalid backup format");
        
        // Wipe and replace strategy
        chrome.storage.local.clear(() => {
          chrome.storage.local.set(parsedData, () => {
            showToast("Restore complete! Reloading...", 3000);
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          });
        });
      } catch (err) {
        showToast("Restore failed: " + err.message, 4000);
      }
      restoreFileInput.value = ""; // reset input
    };
    reader.readAsText(file);
  });
}
