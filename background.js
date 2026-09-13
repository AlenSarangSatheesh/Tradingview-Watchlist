// background.js

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Unlimited Watchlists for TradingView Installed');
  initializeExtension();
  // Open the getting-started page only on a fresh install (not on updates/Chrome updates).
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  initializeExtension();
});

function initializeExtension() {
  chrome.storage.local.get(["watchlists", "defaultExchange"], ({ watchlists, defaultExchange }) => {
    if (!watchlists) chrome.storage.local.set({ watchlists: [] });
    if (!defaultExchange) chrome.storage.local.set({ defaultExchange: 'NSE' });
  });
}

// --- WATCHLIST DEDUPE ---
// Comparison-only form, kept in sync with canonicalSymbol in content.js: the same stock can
// arrive as "M&M" (Chartink), "M_M"/"M-M" (TradingView) or "NSE:X" (CSV upload). Any
// exchange prefix (NSE:, NASDAQ:, LSE:, BINANCE:, …) is stripped so "AAPL" and "NASDAQ:AAPL"
// are treated as the same stock.
const canonicalSymbol = (s) => String(s).trim().toUpperCase().replace(/^[^:]+:/, '').replace(/[&_]/g, '-');

// Drops canonical duplicates from every watchlist, keeping the first occurrence so the
// stored notation (which the chart links rely on) is preserved.
function dedupeWatchlists(watchlists) {
  (watchlists || []).forEach((wl) => {
    if (!Array.isArray(wl.stocks)) return;
    const seen = new Set();
    wl.stocks = wl.stocks.filter((s) => {
      const c = canonicalSymbol(s);
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });
  });
  return watchlists;
}

// --- MESSAGE LISTENERS ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "saveBseNameMap") {
      if (request.nameMap) {
        chrome.storage.local.get("bse_name_map", ({ bse_name_map }) => {
          const currentMap = bse_name_map || {};
          const newMap = { ...currentMap, ...request.nameMap };
          chrome.storage.local.set({ bse_name_map: newMap }, () => {
            sendResponse({ success: true });
          });
        });
        return true;
      } else {
        sendResponse({ success: false });
      }
    }
    else if (request.action === "getWatchlists") {
      chrome.storage.local.get("watchlists", ({ watchlists }) => sendResponse({ watchlists: watchlists || [] }));
      return true;
    }
    else if (request.action === "updateWatchlists") {
      chrome.storage.local.set({ watchlists: dedupeWatchlists(request.watchlists) }, () => {
        // Broadcast to the side panel; ignore "no receiver" when the panel is closed.
        chrome.runtime.sendMessage({ action: "refreshWatchlistUI" }).catch(() => { });
        sendResponse({ success: true });
      });
      return true;
    }
    else if (request.action === "importFromChartinkUrl") {
      handleChartinkImport(request.url, request.mode).then(sendResponse);
      return true;
    }
    else if (request.action === "changeSymbol") {
      chrome.tabs.query({ url: ["*://*.tradingview.com/*"] }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        const activeTvChartTab = tabs.find(t => t.active && t.url && t.url.includes('/chart/'));
        const anyTvChartTab = tabs.find(t => t.url && t.url.includes('/chart/'));
        const targetTvTab = activeTvChartTab || anyTvChartTab || tabs.find(t => t.active) || tabs[0];
        if (targetTvTab) {
          chrome.tabs.sendMessage(targetTvTab.id, { action: "changeSymbol", symbol: request.symbol }, () => {
            if (chrome.runtime.lastError) {
              const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(request.symbol)}`;
              chrome.tabs.update(targetTvTab.id, { url });
            }
          });
        }
      });
      sendResponse({ success: true });
      return true;
    }

  } catch (e) { console.error(e); }
});

// --- CHARTINK IMPORT (side-panel entry) ---
// Locate or open the screener tab, wait for it to load, then ask its content script to
// extract the screener and build the watchlist; relay the result back to the side panel.
async function handleChartinkImport(url, mode) {
  const isResync = (mode === 'resync');
  let tab = null;
  let shouldClose = false;

  try {
    if (!/^https?:\/\/(www\.)?chartink\.com\/screener\/.+/i.test(url || "")) {
      return { success: false, error: "Invalid Chartink screener URL" };
    }

    if (isResync) {
      // Clean up any existing Chartink tab for this screener so we start fresh
      const tabs = await chrome.tabs.query({
        url: ["*://chartink.com/screener/*", "*://www.chartink.com/screener/*"]
      });
      const existing = tabs.find((t) => t.url && samePath(t.url, url));
      if (existing) {
        chrome.tabs.remove(existing.id).catch(() => {});
      }

      // Open new tab strictly in background so user focus is never stolen from TradingView
      tab = await chrome.tabs.create({ url, active: false });
      shouldClose = true;
    } else {
      const tabs = await chrome.tabs.query({
        url: ["*://chartink.com/screener/*", "*://www.chartink.com/screener/*"]
      });
      tab = tabs.find((t) => t.url && samePath(t.url, url));

      if (!tab) {
        tab = await chrome.tabs.create({ url, active: true });
      } else {
        await chrome.tabs.update(tab.id, { url, active: true });
      }
    }

    await waitForTabComplete(tab.id);

    const result = await sendImportMessage(tab.id, mode);
    return result;
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
  } finally {
    if (shouldClose && tab?.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

function samePath(a, b) {
  try {
    return new URL(a).pathname.replace(/\/$/, "") === new URL(b).pathname.replace(/\/$/, "");
  } catch (e) {
    return false;
  }
}

function waitForTabComplete(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (t) => {
      if (!chrome.runtime.lastError && t && t.status === "complete") finish();
    });
    setTimeout(finish, timeout);
  });
}

function sendImportMessage(tabId, mode, attempts = 15) {
  return new Promise((resolve) => {
    const tryOnce = (n) => {
      chrome.tabs.sendMessage(tabId, { action: "importScreener", mode }, (response) => {
        if (chrome.runtime.lastError) {
          if (n <= 0) return resolve({ success: false, error: "Could not reach the Chartink page. Open the screener and try again." });
          setTimeout(() => tryOnce(n - 1), 700);
        } else {
          resolve(response || { success: false, error: "No response from the Chartink page." });
        }
      });
    };
    tryOnce(attempts);
  });
}

// --- UI INTERACTIONS ---
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  const sendToggleToTab = (tabId) => {
    chrome.tabs.sendMessage(tabId, { action: "toggleInPageSidepanel" }, () => {
      if (chrome.runtime.lastError) {
        if (chrome.scripting) {
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: "openInPageSidepanel" }).catch(() => { });
            }, 100);
          }).catch(() => { });
        }
      }
    });
  };

  let isTv = false;
  const currentUrl = tab.url || (await chrome.tabs.get(tab.id).catch(() => null))?.url || '';
  if (/tradingview\.com/i.test(currentUrl)) {
    isTv = true;
  }

  if (isTv) {
    sendToggleToTab(tab.id);
  } else {
    chrome.tabs.query({ url: ["*://*.tradingview.com/*"] }, (tabs) => {
      const tvTab = tabs && (tabs.find(t => t.url && t.url.includes('/chart/')) || tabs[0]);
      if (tvTab) {
        chrome.tabs.update(tvTab.id, { active: true }, () => {
          if (tvTab.windowId) chrome.windows.update(tvTab.windowId, { focused: true });
          setTimeout(() => sendToggleToTab(tvTab.id), 200);
        });
      } else {
        chrome.storage.local.set({ autoOpenOnNextLoad: true }, () => {
          chrome.tabs.create({ url: "https://www.tradingview.com/chart/" });
        });
      }
    });
  }
});
