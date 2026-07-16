// background.js

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('Unlimited Watchlists for TradingView Installed');
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
  initializeExtension();
});

function initializeExtension() {
  chrome.storage.local.get("watchlists", ({ watchlists }) => {
    if (!watchlists) chrome.storage.local.set({ watchlists: [] });
  });
}

// --- WATCHLIST DEDUPE ---
// Comparison-only form, kept in sync with canonicalSymbol in content.js: the same stock can
// arrive as "M&M" (Chartink), "M_M"/"M-M" (TradingView) or "NSE:X" (CSV upload).
const canonicalSymbol = (s) => String(s).trim().toUpperCase().replace(/^(NSE|BSE):/, '').replace(/[&_]/g, '-');

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
    if (request.action === "openSidePanel") {
      if (sender.tab?.id) chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => { });
      sendResponse({ success: true });
    }
    else if (request.action === "saveBseNameMap") {
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

  } catch (e) { console.error(e); }
});

// --- CHARTINK IMPORT (side-panel entry) ---
// Locate or open the screener tab, wait for it to load, then ask its content script to
// extract the screener and build the watchlist; relay the result back to the side panel.
async function handleChartinkImport(url, mode) {
  try {
    if (!/^https?:\/\/(www\.)?chartink\.com\/screener\/.+/i.test(url || "")) {
      return { success: false, error: "Invalid Chartink screener URL" };
    }

    const tabs = await chrome.tabs.query({
      url: ["*://chartink.com/screener/*", "*://www.chartink.com/screener/*"]
    });
    let tab = tabs.find((t) => t.url && samePath(t.url, url));

    if (!tab) {
      tab = await chrome.tabs.create({ url, active: true });
      await waitForTabComplete(tab.id);
    } else {
      await chrome.tabs.update(tab.id, { url, active: true });
      await waitForTabComplete(tab.id);
    }

    return await sendImportMessage(tab.id, mode);
  } catch (e) {
    return { success: false, error: String((e && e.message) || e) };
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

function sendImportMessage(tabId, mode, attempts = 8) {
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
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => { });
});
