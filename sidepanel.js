const container = document.getElementById("watchlistContainer");
const newBtn = document.getElementById("newBtn");
const alarmBtn = document.getElementById("alarmBtn");
const renameBtn = document.getElementById("renameBtn");
const deleteBtn = document.getElementById("deleteBtn");

const watchlistView = document.getElementById("watchlistView");
const stocksView = document.getElementById("stocksView");
const backBtn = document.getElementById("backBtn");
const watchlistTitle = document.getElementById("watchlistTitle");
const csvInput = document.getElementById("csvInput");
const uploadBtn = document.getElementById("uploadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const sortBtn = document.getElementById("sortBtn");
const clearAllBtn = document.getElementById("clearAllBtn");
const stocksContainer = document.getElementById("stocksContainer");

const stockSearchInput = document.getElementById("stockSearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");

const alarmModal = document.getElementById("alarmModal");
const closeAlarmModal = document.getElementById("closeAlarmModal");
const scrollToTriggeredBtn = document.getElementById("scrollToTriggeredBtn");
const activeAlarmsSection = document.getElementById("activeAlarmsSection");
const triggeredAlarmsSection = document.getElementById("triggeredAlarmsSection");
const activeAlarmsList = document.getElementById("activeAlarmsList");
const triggeredAlarmsList = document.getElementById("triggeredAlarmsList");
const noAlarmsMessage = document.getElementById("noAlarmsMessage");
const deleteAllActiveBtn = document.getElementById("deleteAllActiveBtn");
const deleteAllTriggeredBtn = document.getElementById("deleteAllTriggeredBtn");
const alertToggleSwitch = document.getElementById("alertToggleSwitch");

let selectedIndex = null;
let currentWatchlistIndex = null;
let tradingviewTabId = null;
let allStocks = [];
let currentFilterSymbol = null;
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
    // --- NEW LOGIC: LOCK HEIGHT TO PREVENT SCROLL JUMP ---
    
    // 1. Capture current scroll & height
    const previousScroll = stocksContainer.scrollTop; 
    const currentHeight = stocksContainer.getBoundingClientRect().height;
    
    // 2. Lock the height so the scrollbar doesn't collapse to 0
    if(currentHeight > 0) {
      stocksContainer.style.minHeight = currentHeight + 'px';
    }

    chrome.storage.local.get(["watchlists", `cachedPrices_${currentWatchlistIndex}`], (result) => {
      const watchlists = result.watchlists;
      const cachedPrices = result[`cachedPrices_${currentWatchlistIndex}`];

      // If viewing a specific watchlist, re-render safely
      if (currentWatchlistIndex !== null && watchlists && watchlists[currentWatchlistIndex]) {
         const wl = watchlists[currentWatchlistIndex];
         allStocks = [...(wl.stocks || [])];
         
         // 3. Re-render list
         renderStocks(wl.stocks || [], wl.lastSelected).then(() => {
           // 4. Immediately restore prices if available
           if (cachedPrices) {
             updateStockPricesInUI(cachedPrices);
           }
           
           // 5. Restore scroll position
           stocksContainer.scrollTop = previousScroll;
           
           // 6. Unlock height (allow it to grow/shrink naturally again)
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

// ----------------- ALERT TOGGLE -----------------
function initializeAlertToggle() {
  chrome.runtime.sendMessage({ action: "getAlarmCheckingStatus" }, (res) => {
    if (res && res.enabled !== undefined) updateToggleSwitchUI(res.enabled);
  });
  alertToggleSwitch.addEventListener('click', toggleAlertChecking);
}

function toggleAlertChecking() {
  const newState = !alertToggleSwitch.classList.contains('enabled');
  chrome.runtime.sendMessage({ action: "setAlarmChecking", enabled: newState }, (res) => {
    if (res && res.success) updateToggleSwitchUI(newState);
  });
}

function updateToggleSwitchUI(enabled) {
  if (enabled) alertToggleSwitch.classList.add('enabled');
  else alertToggleSwitch.classList.remove('enabled');
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

// ----------------- ALARMS & MODAL -----------------
function showAlarmModal(filterSymbol = null) {
  currentFilterSymbol = filterSymbol;
  alarmModal.style.display = 'flex'; initializeAlertToggle(); loadAlarms();
}

function hideAlarmModal() {
  alarmModal.style.display = 'none'; currentFilterSymbol = null;
}

function scrollToTriggeredAlerts() {
  const sec = document.getElementById('triggeredAlarmsSection');
  if (sec && sec.style.display !== 'none') sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadAlarms() {
  chrome.storage.local.get(['alarms', 'triggeredAlarms'], ({ alarms, triggeredAlarms }) => {
    let active = alarms || []; let triggered = triggeredAlarms || [];
    
    if (currentFilterSymbol) {
      active = active.filter(a => a.symbol === currentFilterSymbol);
      triggered = triggered.filter(a => a.symbol === currentFilterSymbol);
    }
    
    if (active.length + triggered.length === 0) {
      activeAlarmsSection.style.display = 'none'; triggeredAlarmsSection.style.display = 'none';
      noAlarmsMessage.innerHTML = currentFilterSymbol ? `<p>No alerts for ${currentFilterSymbol}</p>` : '<p>No active alerts</p>';
      noAlarmsMessage.style.display = 'block'; scrollToTriggeredBtn.style.display = 'none';
      return;
    }
    
    noAlarmsMessage.style.display = 'none';
    scrollToTriggeredBtn.style.display = triggered.length > 0 ? 'flex' : 'none';
    
    chrome.storage.local.get(['alarms', 'triggeredAlarms'], ({ alarms: allA, triggeredAlarms: allT }) => {
      const allActive = allA || []; const allTriggered = allT || [];
      
      if (active.length > 0) {
        activeAlarmsSection.style.display = 'block';
        let html = '';
        active.sort((a, b) => b.timestamp - a.timestamp).forEach(a => {
          const idx = allActive.findIndex(x => x.timestamp === a.timestamp && x.symbol === a.symbol);
          const highlight = currentFilterSymbol && a.symbol === currentFilterSymbol ? 'highlighted-alarm' : '';
          html += `
            <li class="alarm-item ${highlight}">
              <div class="alarm-main-content">
                <span class="alarm-stock-name clickable-stock" data-symbol="${a.symbol}">${a.symbol}</span>
                <div class="alarm-price-info">
                  <span class="alarm-target">Target ${parseFloat(a.price).toFixed(2)}</span>
                  <span class="alarm-date">${new Date(a.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
              <button class="delete-alarm-btn" data-type="active" data-index="${idx}">
                <img src="Images/delete.png" alt="Delete" class="icon small">
              </button>
            </li>`;
        });
        activeAlarmsList.innerHTML = html;
      } else { activeAlarmsSection.style.display = 'none'; }
      
      if (triggered.length > 0) {
        triggeredAlarmsSection.style.display = 'block';
        let html = '';
        triggered.sort((a, b) => b.triggeredAt - a.triggeredAt).forEach(a => {
          const idx = allTriggered.findIndex(x => x.triggeredAt === a.triggeredAt && x.symbol === a.symbol);
          const time = new Date(a.triggeredAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
          const highlight = currentFilterSymbol && a.symbol === currentFilterSymbol ? 'highlighted-alarm' : '';
          html += `
            <li class="alarm-item triggered-alarm ${highlight}">
              <div class="alarm-main-content">
                <span class="alarm-stock-name clickable-stock" data-symbol="${a.symbol}">${a.symbol}</span>
                <div class="alarm-price-info triggered">
                  <span class="alarm-target">Hit:${parseFloat(a.currentPrice).toFixed(2)}</span>
                  <span class="alarm-date">${time}</span>
                </div>
              </div>
              <button class="delete-alarm-btn" data-type="triggered" data-index="${idx}">
                <img src="Images/delete.png" alt="Delete" class="icon small">
              </button>
            </li>`;
        });
        triggeredAlarmsList.innerHTML = html;
      } else { triggeredAlarmsSection.style.display = 'none'; }
      
      document.querySelectorAll('.delete-alarm-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteAlarm(parseInt(e.currentTarget.dataset.index), e.currentTarget.dataset.type); });
      });
      document.querySelectorAll('.clickable-stock').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); openTradingView(e.currentTarget.dataset.symbol); });
      });
      if (currentFilterSymbol && active.length > 0) {
        setTimeout(() => {
          const hl = document.querySelector('.highlighted-alarm'); if (hl) hl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });
  });
}

function deleteAlarm(index, type = 'active') {
  const key = type === 'triggered' ? 'triggeredAlarms' : 'alarms';
  chrome.storage.local.get(key, (data) => {
    const list = data[key];
    if (list && list[index]) {
      list.splice(index, 1);
      chrome.storage.local.set({ [key]: list }, () => {
        loadAlarms(); showToast(type === 'triggered' ? 'Triggered alert deleted' : 'Alarm deleted');
        if (currentWatchlistIndex !== null) refreshStockAlarmIndicators();
      });
    }
  });
}

function deleteAllActiveAlarms() {
  if (confirm('Delete all active alerts?')) {
    chrome.storage.local.set({ alarms: [] }, () => { loadAlarms(); showToast('All active alerts deleted'); if (currentWatchlistIndex !== null) refreshStockAlarmIndicators(); });
  }
}

function deleteAllTriggeredAlarms() {
  if (confirm('Delete all triggered alerts?')) {
    chrome.storage.local.set({ triggeredAlarms: [] }, () => { loadAlarms(); showToast('All triggered alerts deleted'); if (currentWatchlistIndex !== null) refreshStockAlarmIndicators(); });
  }
}

function getAlarmCountForStock(symbol) {
  return new Promise((resolve) => {
    chrome.storage.local.get('alarms', ({ alarms }) => { resolve((alarms || []).filter(a => a.symbol === symbol).length); });
  });
}

async function refreshStockAlarmIndicators() {
  const items = stocksContainer.querySelectorAll('li:not(.empty-message):not(.search-empty-message)');
  for (const item of items) {
    const name = item.querySelector('.stock-name'); if (!name) continue;
    const symbol = name.textContent.trim();
    const count = await getAlarmCountForStock(symbol);
    const existing = item.querySelector('.stock-alarm-btn'); if (existing) existing.remove();
    if (count > 0) {
      const group = item.querySelector('.stock-buttons-group') || createButtonsGroup(item);
      group.insertBefore(createStockAlarmButton(symbol, count), group.firstChild);
    }
  }
}

function createButtonsGroup(item) {
  const existing = item.querySelector('.stock-buttons-group'); if (existing) return existing;
  const group = document.createElement('div'); group.className = 'stock-buttons-group';
  const del = item.querySelector('.delete-btn-right'); if (del) { item.removeChild(del); group.appendChild(del); }
  item.appendChild(group); return group;
}

function createStockAlarmButton(symbol, count) {
  const btn = document.createElement('button'); btn.className = 'stock-alarm-btn';
  btn.title = `${count} active alert${count > 1 ? 's' : ''}`;
  btn.innerHTML = `<img src="Images/alarm.png" alt="Alarm" class="icon"><span class="alarm-count-badge">${count}</span>`;
  btn.addEventListener('click', (e) => { e.stopPropagation(); showAlarmModal(symbol); });
  return btn;
}

// ----------------- PRICES -----------------
async function fetchStockPrice(symbol) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice || meta.previousClose;
    const prev = meta.previousClose;
    return {
      symbol, price: price.toFixed(2), change: (price - prev).toFixed(2), changePercent: ((price - prev) / prev * 100).toFixed(2), error: false
    };
  } catch (e) { return { symbol, price: '--', change: '--', changePercent: '--', error: true }; }
}

async function fetchMultipleStockPrices(symbols) {
  const results = await Promise.allSettled(symbols.map(s => fetchStockPrice(s)));
  const data = {};
  results.forEach((r, i) => { data[symbols[i]] = r.status === 'fulfilled' ? r.value : { symbol: symbols[i], price: '--', error: true }; });
  return data;
}

async function refreshStockPrices() {
  if (currentWatchlistIndex === null) return;
  refreshBtn.classList.add('refreshing'); refreshBtn.disabled = true;
  
  chrome.storage.local.get("watchlists", async ({ watchlists }) => {
    const wl = watchlists[currentWatchlistIndex];
    if (!wl || !wl.stocks.length) { refreshBtn.classList.remove('refreshing'); refreshBtn.disabled = false; return; }
    
    const data = await fetchMultipleStockPrices(wl.stocks);
    await chrome.storage.local.set({ [`cachedPrices_${currentWatchlistIndex}`]: data });
    updateStockPricesInUI(data);
    refreshBtn.classList.remove('refreshing'); refreshBtn.disabled = false;
    showToast('Prices updated', 1000);
  });
}

function updateStockPricesInUI(data) {
  stocksContainer.querySelectorAll('li:not(.empty-message):not(.search-empty-message)').forEach(item => {
    const sym = item.querySelector('.stock-name')?.textContent.trim();
    const d = data[sym]; if (!d) return;
    
    let info = item.querySelector('.price-info'); if (info) info.remove();
    info = document.createElement('div'); info.className = 'price-info';
    info.setAttribute('data-change-percent', d.changePercent || '0');
    
    if (d.error) { info.innerHTML = `<span class="price">--</span><span class="change neutral">--%</span>`; }
    else {
      const cls = parseFloat(d.changePercent) >= 0 ? 'positive' : 'negative';
      info.innerHTML = `<span class="price">${d.price}</span><span class="change ${cls}">${d.changePercent}%</span>`;
    }
    item.querySelector('.stock-main-content').appendChild(info);
  });
}

function sortStocksByPercentChange() {
  if (currentWatchlistIndex === null) return;
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    const wl = watchlists[currentWatchlistIndex]; if (!wl || !wl.stocks.length) return;
    
    const items = Array.from(stocksContainer.querySelectorAll('li:not(.empty-message):not(.search-empty-message)'));
    const data = items.map(item => {
      const name = item.querySelector('.stock-name').textContent.trim();
      const pct = parseFloat(item.querySelector('.price-info')?.getAttribute('data-change-percent')) || 0;
      return { name, pct };
    });
    
    data.sort((a, b) => b.pct - a.pct);
    wl.stocks = data.map(x => x.name); allStocks = [...wl.stocks];
    
    chrome.storage.local.set({ watchlists }, async () => {
      await renderStocks(wl.stocks, wl.lastSelected);
      chrome.storage.local.get(`cachedPrices_${currentWatchlistIndex}`, (r) => {
        if (r[`cachedPrices_${currentWatchlistIndex}`]) updateStockPricesInUI(r[`cachedPrices_${currentWatchlistIndex}`]);
      });
    });
  });
}

// ----------------- RENDER -----------------
function renderWatchlists(list) {
  container.innerHTML = "";
  list.forEach((wl, i) => {
    const li = document.createElement("li"); li.textContent = wl.name; li.draggable = true; li.dataset.index = i;
    if (i === selectedIndex) li.classList.add("selected");
    
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

function updateActionButtons() {
  newBtn.style.display = 'flex'; alarmBtn.style.display = 'flex';
  const show = selectedIndex !== null ? 'flex' : 'none';
  renameBtn.style.display = show; deleteBtn.style.display = show;
}

function openStocksView(index) {
  chrome.storage.local.get("watchlists", async ({ watchlists }) => {
    const wl = watchlists[index]; if (!wl) return;
    currentWatchlistIndex = index; watchlistTitle.textContent = wl.name; allStocks = [...(wl.stocks || [])];
    
    const display = (wl.stocks && wl.stocks.length > 0) ? 'flex' : 'none';
    refreshBtn.style.display = display; sortBtn.style.display = display; clearAllBtn.style.display = display;
    
    initializeSearch();
    await renderStocks(wl.stocks || [], wl.lastSelected);
    
    chrome.storage.local.get(`cachedPrices_${index}`, (r) => {
      if (r[`cachedPrices_${index}`]) updateStockPricesInUI(r[`cachedPrices_${index}`]);
    });
    
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
  refreshBtn.style.display = display; sortBtn.style.display = display; clearAllBtn.style.display = display;
  
  if (!stocks.length) { stocksContainer.innerHTML = '<li class="empty-message" style="text-align:center;color:#888;font-style:italic;">No stocks in this watchlist</li>'; return; }
  
  // We use a Promise so we can know when rendering is totally done
  return new Promise(async (resolve) => {
    for (const stock of stocks) {
      const li = document.createElement("li");
      const div = document.createElement("div"); div.className = "stock-main-content";
      div.innerHTML = `<span class="stock-name">${stock}</span><div class="price-info" data-change-percent="0"><span class="price">--</span><span class="change neutral">--%</span></div>`;
      
      const grp = document.createElement("div"); grp.className = "stock-buttons-group";
      const count = await getAlarmCountForStock(stock);
      if (count > 0) grp.appendChild(createStockAlarmButton(stock, count));
      
      const del = document.createElement("button");
      del.className = "delete-btn delete-btn-right"; del.title = "Remove";
      del.innerHTML = '<img src="Images/delete.png" class="icon small">';
      del.onclick = (e) => { e.stopPropagation(); removeStockFromWatchlist(stock, stocks.indexOf(stock)); };
      grp.appendChild(del);
      
      li.appendChild(div); li.appendChild(grp);
      if (stock === lastSelected) li.classList.add("active");
      
      li.onclick = () => { setActiveStock(stock); openTradingView(stock); };
      stocksContainer.appendChild(li);
    }
    resolve();
  });
}

function removeStockFromWatchlist(stock, index) {
  const cacheKey = `cachedPrices_${currentWatchlistIndex}`;
  
  // 1. Capture current scroll position and Height
  const scrollPosition = stocksContainer.scrollTop; 
  const currentHeight = stocksContainer.getBoundingClientRect().height;

  // 2. Lock height
  if (stocksContainer && currentHeight > 0) { 
    stocksContainer.style.minHeight = `${currentHeight}px`; 
  }

  chrome.storage.local.get(["watchlists", cacheKey], (result) => {
    const watchlists = result.watchlists;
    const cachedData = result[cacheKey];

    if (!watchlists || !watchlists[currentWatchlistIndex]) return;

    const wl = watchlists[currentWatchlistIndex];
    wl.stocks.splice(index, 1);
    allStocks = [...wl.stocks];
    if (wl.lastSelected === stock) wl.lastSelected = wl.stocks[0] || null;
    
    chrome.storage.local.set({ watchlists }, async () => {
      await renderStocks(wl.stocks, wl.lastSelected);
      if (cachedData) { updateStockPricesInUI(cachedData); }
      
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

alarmBtn.onclick = () => showAlarmModal();
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

uploadBtn.onclick = () => csvInput.click();
refreshBtn.onclick = () => refreshStockPrices();
sortBtn.onclick = () => sortStocksByPercentChange();
clearAllBtn.onclick = () => clearAllStocks();
closeAlarmModal.onclick = () => hideAlarmModal();
scrollToTriggeredBtn.onclick = () => scrollToTriggeredAlerts();
alarmModal.onclick = (e) => { if (e.target === alarmModal) hideAlarmModal(); };
deleteAllActiveBtn.onclick = () => deleteAllActiveAlarms();
deleteAllTriggeredBtn.onclick = () => deleteAllTriggeredAlarms();

csvInput.onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const lines = ev.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    chrome.storage.local.get("watchlists", ({ watchlists }) => {
      watchlists[currentWatchlistIndex].stocks = lines; allStocks = [...lines];
      chrome.storage.local.set({ watchlists }, () => openStocksView(currentWatchlistIndex));
    });
  };
  reader.readAsText(file); csvInput.value = "";
};