// background.js

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('TradingView Watchlist Extension Installed');
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  initializeExtension();
});

function initializeExtension() {
  chrome.storage.local.get(["watchlists", "alarmCheckingEnabled"], ({ watchlists, alarmCheckingEnabled }) => {
    if (!watchlists) chrome.storage.local.set({ watchlists: [] });
    
    const isEnabled = alarmCheckingEnabled !== undefined ? alarmCheckingEnabled : true;
    if (alarmCheckingEnabled === undefined) chrome.storage.local.set({ alarmCheckingEnabled: true });

    if (isEnabled) {
      setupOffscreenDocument();
    } else {
      closeOffscreenDocument();
    }
  });

  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) return; 
    chrome.contextMenus.create({
      id: "alarm-context-menu",
      title: "Set Price Alert (Manual)",
      contexts: ["page"],
      documentUrlPatterns: ["https://*.tradingview.com/*"]
    });
    chrome.contextMenus.create({
      id: "alarm-cross-price",
      title: "Add alert @ cross price",
      contexts: ["page"],
      documentUrlPatterns: ["https://*.tradingview.com/*"]
    });
  });
}

// --- OFFSCREEN LIFECYCLE (Audio + Timer) ---
async function setupOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'], 
      justification: 'Play alert sound and keep worker alive'
    });
    console.log('Monitoring & Audio System started.');
  } catch (err) {
    console.warn('Offscreen setup warning:', err);
  }
}

async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log('Monitoring stopped.');
    }
  } catch (err) {
    console.warn('Offscreen closure warning:', err);
  }
}

// --- MESSAGE LISTENERS ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Heartbeat from offscreen.js
  if (request.action === 'keepAliveTick') {
    checkAlarms();
    return true;
  }

  // 2. Standard messages
  try {
    if (request.action === "openSidePanel") {
      if (sender.tab?.id) chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      sendResponse({ success: true });
    } 
    else if (request.action === "getWatchlists") {
      chrome.storage.local.get("watchlists", ({ watchlists }) => sendResponse({ watchlists: watchlists || [] }));
      return true; 
    } 
    else if (request.action === "updateWatchlists") {
      chrome.storage.local.set({ watchlists: request.watchlists }, () => {
        chrome.runtime.sendMessage({ action: "refreshWatchlistUI" });
        sendResponse({ success: true });
      });
      return true;
    } 
    else if (request.action === "setAlarmChecking") {
      chrome.storage.local.set({ alarmCheckingEnabled: request.enabled }, () => {
        if (request.enabled) setupOffscreenDocument(); 
        else closeOffscreenDocument();
        sendResponse({ success: true });
      });
      return true;
    } 
    else if (request.action === "getAlarmCheckingStatus") {
      chrome.storage.local.get("alarmCheckingEnabled", ({ alarmCheckingEnabled }) => {
        sendResponse({ enabled: alarmCheckingEnabled !== false });
      });
      return true;
    }
  } catch (e) { console.error(e); }
});

// --- UI INTERACTIONS ---
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {}); 
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "alarm-context-menu") {
    chrome.tabs.sendMessage(tab.id, { action: "showAlarmDialog" }).catch(() => {});
  } else if (info.menuItemId === "alarm-cross-price") {
    chrome.tabs.sendMessage(tab.id, { action: "addAlertAtCross" }).catch(() => {});
  }
});

// --- PRICE LOGIC ---
async function fetchStockPrice(symbol) {
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    const result = data.chart.result[0];
    if (!result?.meta) throw new Error('Invalid');
    
    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice || meta.previousClose;
    
    return { symbol: symbol, price: currentPrice.toFixed(2), timestamp: Date.now() };
  } catch (error) { return { symbol: symbol, price: '--', error: true }; }
}

async function fetchMultipleStockPrices(symbols) {
  const promises = symbols.map(symbol => fetchStockPrice(symbol));
  const results = await Promise.allSettled(promises);
  const priceData = {};
  results.forEach((result, index) => {
    priceData[symbols[index]] = result.status === 'fulfilled' ? result.value : { symbol: symbols[index], price: '--', error: true };
  });
  return priceData;
}

// --- ALARM CHECKER ---
async function checkAlarms() {
  const { alarms, alarmCheckingEnabled } = await chrome.storage.local.get(['alarms', 'alarmCheckingEnabled']);

  if (alarmCheckingEnabled === false) { closeOffscreenDocument(); return; }
  if (!alarms || alarms.length === 0) return;
  
  const symbols = [...new Set(alarms.map(a => a.symbol))];
  const priceData = await fetchMultipleStockPrices(symbols);
  
  const triggeredAlarms = [];
  const remainingAlarms = [];
  
  alarms.forEach((alarm) => {
    const info = priceData[alarm.symbol];
    if (!info || info.error) { remainingAlarms.push(alarm); return; }
    
    const current = parseFloat(info.price);
    const target = parseFloat(alarm.price);
    if (isNaN(current) || current <= 0) { remainingAlarms.push(alarm); return; }
    
    const tolerance = Math.max(target * 0.001, 0.01);
    if (Math.abs(current - target) <= tolerance) {
      triggeredAlarms.push({ ...alarm, currentPrice: current, triggeredAt: Date.now() });
    } else {
      remainingAlarms.push(alarm);
    }
  });
  
  if (triggeredAlarms.length > 0) {
    await chrome.storage.local.set({ alarms: remainingAlarms });
    const { triggeredAlarms: oldTriggered } = await chrome.storage.local.get('triggeredAlarms');
    await chrome.storage.local.set({ triggeredAlarms: [...(oldTriggered || []), ...triggeredAlarms] });
    
    for (const alarm of triggeredAlarms) {
      const message = `${alarm.symbol} hit target ₹${alarm.price}`;
      
      // 1. System Notification
      chrome.notifications.create({
        type: 'basic', iconUrl: 'Images/alarm.png', title: 'Price Alert',
        message: message, priority: 2, requireInteraction: true
      });

      // 2. Play Sound (via Offscreen - FIXES AUDIO CONTEXT ERROR)
      chrome.runtime.sendMessage({ action: "playAudioFromOffscreen" });

      // 3. Show Toast ONLY on Active Tabs
      const tabs = await chrome.tabs.query({ active: true });
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
           chrome.tabs.sendMessage(tab.id, { 
             action: "showGlobalToast", // Send toast command only
             message: message, 
             type: 'alert' 
           }).catch(() => {});
        }
      }
    }
  }
}