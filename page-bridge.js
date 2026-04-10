(() => {
  if (window.__tiktokCsvBridgeInstalled) return;
  window.__tiktokCsvBridgeInstalled = true;

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = response.url || String(args[0] || '');
      if (url.includes('/api/post/item_list')) {
        const cloned = response.clone();
        cloned.json().then((data) => {
          window.postMessage({
            source: 'tiktok-csv-bridge',
            kind: 'item_list',
            url,
            payload: data
          }, '*');
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__tiktokCsvUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const url = this.__tiktokCsvUrl || this.responseURL || '';
        if (url.includes('/api/post/item_list') && typeof this.responseText === 'string') {
          const data = JSON.parse(this.responseText);
          window.postMessage({
            source: 'tiktok-csv-bridge',
            kind: 'item_list',
            url,
            payload: data
          }, '*');
        }
      } catch (_) {}
    });
    return originalSend.apply(this, args);
  };
})();
