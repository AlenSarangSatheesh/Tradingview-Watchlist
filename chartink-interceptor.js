// chartink-interceptor.js
// Runs in the MAIN world at document_start. Chartink fetches screener results via fetch/XHR
// and returns JSON `data[]` (each row has nsecode/bsecode) containing the FULL result set
// (the table paginates client-side). We wrap fetch + XHR to:
//   (1) capture the actual response and stash the complete symbol list, and
//   (2) capture the request's scan_clause as a fallback for replaying the scan.
// The isolated content script (chartink.js) reads these back via DOM dataset attributes.
(function () {
  'use strict';
  if (window.__ctkInterceptorLoaded) return;
  window.__ctkInterceptorLoaded = true;

  function stashClause(clause) {
    if (clause && document.documentElement) {
      try { document.documentElement.dataset.ctkScanClause = clause; } catch (e) {}
    }
  }

  // From a screener JSON response, extract every nsecode (fallback bsecode) and stash it.
  function stashSymbols(json) {
    try {
      if (!json || !Array.isArray(json.data) || !json.data.length) return;
      const first = json.data[0];
      if (!first || (!('nsecode' in first) && !('bsecode' in first))) return;
      const syms = json.data
        .map((r) => (r.nsecode || r.bsecode || '').toString().trim().toUpperCase())
        .filter(Boolean);
      if (syms.length && document.documentElement) {
        document.documentElement.dataset.ctkSymbols = JSON.stringify(syms);
      }
    } catch (e) {}
  }

  // The scan_clause may arrive urlencoded, as URLSearchParams/FormData, or inside a JSON body.
  function clauseFromBody(body) {
    if (!body) return null;
    try {
      if (typeof body === 'string') {
        const enc = new URLSearchParams(body).get('scan_clause');
        if (enc) return enc;
        if (body.charAt(0) === '{') {
          const j = JSON.parse(body);
          if (j && j.scan_clause) return j.scan_clause;
        }
        return null;
      }
      if (body instanceof URLSearchParams) return body.get('scan_clause');
      if (typeof FormData !== 'undefined' && body instanceof FormData) return body.get('scan_clause');
    } catch (e) {}
    return null;
  }

  function isScreenerUrl(url) {
    url = String(url || '');
    return url.indexOf('/screener') !== -1 || url.indexOf('process') !== -1;
  }

  // --- Wrap fetch ---
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      let url;
      try { url = typeof input === 'string' ? input : (input && input.url); } catch (e) {}
      try { if (isScreenerUrl(url)) stashClause(clauseFromBody(init && init.body)); } catch (e) {}
      const p = origFetch.apply(this, arguments);
      try {
        if (isScreenerUrl(url)) {
          p.then((resp) => {
            try { resp.clone().json().then(stashSymbols).catch(() => {}); } catch (e) {}
          }).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
  }

  // --- Wrap XMLHttpRequest ---
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ctkUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (isScreenerUrl(this.__ctkUrl)) {
        stashClause(clauseFromBody(body));
        this.addEventListener('load', function () {
          try {
            const ct = this.getResponseHeader('content-type') || '';
            const txt = this.responseText;
            if (txt && (ct.indexOf('json') !== -1 || txt.charAt(0) === '{')) {
              stashSymbols(JSON.parse(txt));
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return origSend.apply(this, arguments);
  };
})();
