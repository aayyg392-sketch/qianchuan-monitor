// 在 XHS 页面的主世界中运行，拦截 fetch 获取笔记数据
(function () {
  if (window.__snefeInjected) return;
  window.__snefeInjected = true;

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      // 笔记详情 API
      if (url.includes('/api/sns/web/v1/feed') || url.includes('/api/sns/web/v2/note/feed') || url.includes('/api/sns/web/v1/note')) {
        p.then(r => r.clone().json().catch(() => null).then(data => {
          if (data) window.postMessage({ type: '__SNEFE_XHS_DATA__', data, url }, '*');
        }));
      }
    } catch (e) {}
    return p;
  };

  // 拦截 XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._snefeUrl = url || '';
    return origOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._snefeUrl && (this._snefeUrl.includes('/api/sns/web/v1/feed') || this._snefeUrl.includes('/api/sns/web/v1/note'))) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          window.postMessage({ type: '__SNEFE_XHS_DATA__', data, url: this._snefeUrl }, '*');
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
