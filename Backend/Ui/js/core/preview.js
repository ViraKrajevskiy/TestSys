window.App = window.App || {};

(function () {
  let hoverTimer = null;
  let currentAnchor = null;

  App.scheduleHoverPreview = function (anchorEl, html, delay = 350) {
    App.clearHoverPreview();
    currentAnchor = anchorEl;
    hoverTimer = setTimeout(() => {
      if (!currentAnchor || !currentAnchor.isConnected) {
        currentAnchor = null;
        return;
      }
      const rect = currentAnchor.getBoundingClientRect();
      App.showHoverPreviewAt(rect.left, rect.bottom + 6, html);
    }, delay);
  };

  App.clearHoverPreview = function () {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    currentAnchor = null;
    const el = document.getElementById("hover-preview");
    if (el) el.style.display = "none";
  };

  // Страховка от «залипшего» превью: если якорь исчез из DOM
  // (частый случай — renderAll во время hover) или курсор ушёл
  // с якоря без mouseleave — прячем.
  document.addEventListener("mousemove", (e) => {
    if (!currentAnchor) return;
    if (!currentAnchor.isConnected) { App.clearHoverPreview(); return; }
    const r = currentAnchor.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top  || e.clientY > r.bottom) {
      App.clearHoverPreview();
    }
  }, true);

  // Клик в любом месте — сразу гасим (открытие вкладки, detach и т.п.
  // обычно приводят к renderAll под курсором, а mousemove после клика
  // может не прийти).
  document.addEventListener("mousedown", App.clearHoverPreview, true);

  // Окно потеряло фокус (открылось detached, alt-tab, клик по другому окну) —
  // mousemove сюда больше не придёт, поэтому чистим руками.
  window.addEventListener("blur", App.clearHoverPreview);

  // Курсор вышел за пределы документа.
  document.addEventListener("mouseleave", App.clearHoverPreview);

  // Скролл/ресайз — якорь мог уехать, позиция превью станет неактуальной.
  window.addEventListener("scroll", App.clearHoverPreview, true);
  window.addEventListener("resize", App.clearHoverPreview);

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

  App.previewHtml = function (method, url, statusInfo, description) {
    const colorVar = App.METHOD_COLOR_VAR[method] || "--text-dim";
    let html = '<span class="hp-method" style="color:var(' + colorVar + ');border:1px solid var(' + colorVar + ')">' + method + '</span>';
    html += '<div class="hp-url">' + App.escapeHtml(url) + '</div>';
    if (statusInfo) html += statusInfo;
    // Описание запроса (Notes) — заметка для команды, если задана.
    if (description && description.trim()) {
      html += '<div class="hp-desc">' + App.escapeHtml(description.trim()) + '</div>';
    }
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
