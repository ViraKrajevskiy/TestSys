window.App = window.App || {};

(function () {
  let hoverTimer = null;

  App.scheduleHoverPreview = function (anchorEl, html, delay = 350) {
    App.clearHoverPreview();
    hoverTimer = setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      App.showHoverPreviewAt(rect.left, rect.bottom + 6, html);
    }, delay);
  };

  App.clearHoverPreview = function () {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    const el = document.getElementById("hover-preview");
    if (el) el.style.display = "none";
  };

  App.showHoverPreviewAt = function (x, y, html) {
    const el = document.getElementById("hover-preview");
    if (!el) return;
    el.innerHTML = html;
    el.style.display = "block";
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 12;
    const maxY = window.innerHeight - rect.height - 12;
    el.style.left = Math.min(x, maxX) + "px";
    el.style.top = Math.min(y, maxY) + "px";
  };

  App.previewHtml = function (method, url, statusInfo) {
    const colorVar = App.METHOD_COLOR_VAR[method] || "--text-dim";
    let html = '<span class="hp-method" style="color:var(' + colorVar + ');border:1px solid var(' + colorVar + ')">' + method + '</span>';
    html += '<div class="hp-url">' + App.escapeHtml(url) + '</div>';
    if (statusInfo) html += statusInfo;
    return html;
  };

  App.tabPreviewHtml = function (tab) {
    let statusInfo = "";
    if (tab.response) {
      if (tab.response.ok) {
        const cls = App.statusClass(tab.response.status_code);
        statusInfo = '<div class="hp-status ' + cls + '">Status: ' + tab.response.status_code + ' ' + tab.response.reason + ' · ' + tab.response.elapsed_ms + ' ms</div>';
      } else {
        statusInfo = '<div class="hp-status status-err">Error</div>';
      }
    }
    return App.previewHtml(tab.method, tab.url || "(пустой URL)", statusInfo);
  };

  App.statusClass = function (code) {
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 400 && code < 500) return "status-4xx";
    return "status-5xx";
  };
})();
