// MAIN-world bridge: mirrors TradingView's active chart symbol into a DOM dataset
// attribute so the isolated-world content script (content.js) can read the exact,
// fully-qualified current symbol (e.g. "NASDAQ:AAPL", "NSE:RELIANCE", "BINANCE:BTCUSDT").
//
// TradingViewApi is a page (MAIN-world) global that the isolated content world cannot
// touch, so we publish it here. This is the same cross-world pattern chartink-interceptor.js
// uses (stash on document.documentElement.dataset, read from the isolated world).
(function () {
  'use strict';

  const ATTR = 'tvActiveSymbol';

  // TradingView appends "-DLY" to the exchange when showing delayed (non-realtime) data,
  // e.g. "TSX-DLY:SHOP". Store the canonical exchange ("TSX:SHOP") — it still opens the same
  // chart and shows delayed data if that's the user's access level. Only the exchange part
  // (before the colon) is touched; the ticker may legitimately contain hyphens.
  function cleanFeedSuffix(sym) {
    const i = sym.indexOf(':');
    if (i < 0) return sym;
    return sym.slice(0, i).replace(/-DLY$/i, '') + sym.slice(i);
  }

  function currentSymbol() {
    try {
      const api = window.TradingViewApi;
      if (api && typeof api.activeChart === 'function') {
        const chart = api.activeChart();
        if (chart && typeof chart.symbol === 'function') {
          const sym = chart.symbol();
          if (sym && typeof sym === 'string') return cleanFeedSuffix(sym);
        }
      }
    } catch (e) { /* API not ready yet or its shape changed — ignore */ }
    return null;
  }

  function publish() {
    const sym = currentSymbol();
    if (sym) document.documentElement.dataset[ATTR] = sym;
  }

  let subscribed = false;
  function trySubscribe() {
    if (subscribed) return true;
    try {
      const chart = window.TradingViewApi.activeChart();
      if (chart && typeof chart.onSymbolChanged === 'function') {
        chart.onSymbolChanged().subscribe(null, publish);
        subscribed = true;
        publish();
        return true;
      }
    } catch (e) { /* charting library not ready yet */ }
    return false;
  }

  // Poll until the charting API is ready, then subscribe to symbol changes.
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (trySubscribe() || tries > 120) clearInterval(poll); // give up after ~60s
  }, 500);

  // Safety net: re-publish periodically so switching the active pane in a multi-chart
  // layout (a different activeChart instance the subscription above didn't cover) is
  // still reflected before the user clicks "Add".
  setInterval(publish, 2000);

  // Fast symbol switching: the isolated content script asks us to change the chart symbol
  // via TradingView's own charting API (instant, no search dialog). We ack whether the API
  // was available so the content script can fall back to its search-box method if not.
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__tvwl !== 'setSymbol') return;
    let available = false;
    try {
      const api = window.TradingViewApi;
      if (api && typeof api.activeChart === 'function' && typeof e.data.symbol === 'string') {
        api.activeChart().setSymbol(e.data.symbol);
        available = true;
        publish();
      }
    } catch (err) { available = false; }
    window.postMessage({ __tvwlAck: true, available }, '*');
  });
})();
