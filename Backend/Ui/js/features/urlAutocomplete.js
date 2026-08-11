/**
 * urlAutocomplete.js — Автокомплит URL из истории запросов и коллекций
 */
window.App = window.App || {};

(function () {

  /** Собрать все уникальные URL из коллекций */
  function _collectUrls() {
    const urls = new Set();
    (App.state.collections || []).forEach(col => {
      (col.requests || []).forEach(r => { if (r.url) urls.add(r.url); });
      (col.folders || []).forEach(f => {
        (f.requests || []).forEach(r => { if (r.url) urls.add(r.url); });
      });
    });
    // Also from all tabs history
    (App.state.tabs || []).forEach(tab => {
      if (tab.url) urls.add(tab.url);
      (tab.responseHistory || []).forEach(h => {
        if (h.url) urls.add(h.url);
      });
    });
    return [...urls];
  }

  let _dropdown = null;
  let _selectedIdx = -1;

  App.initUrlAutocomplete = function (input) {
    if (!input) return;

    input.addEventListener("input", () => _show(input));
    input.addEventListener("focus", () => {
      if (input.value.length >= 2) _show(input);
    });
    input.addEventListener("blur", () => {
      setTimeout(() => _hide(), 150);
    });
    input.addEventListener("keydown", (e) => {
      if (!_dropdown || _dropdown.style.display === "none") return;
      const items = _dropdown.querySelectorAll(".ac-item");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
        _highlightItem(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        _selectedIdx = Math.max(_selectedIdx - 1, 0);
        _highlightItem(items);
      } else if (e.key === "Enter" && _selectedIdx >= 0 && items[_selectedIdx]) {
        e.preventDefault();
        _pick(input, items[_selectedIdx].dataset.url);
      } else if (e.key === "Escape") {
        _hide();
      }
    });
  };

  function _show(input) {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { _hide(); return; }

    const allUrls = _collectUrls();
    const matches = allUrls
      .filter(u => u.toLowerCase().includes(q) && u !== input.value)
      .slice(0, 8);

    if (!matches.length) { _hide(); return; }

    if (!_dropdown) {
      _dropdown = document.createElement("div");
      _dropdown.className = "url-ac-dropdown";
      document.body.appendChild(_dropdown);
    }

    _selectedIdx = -1;
    _dropdown.innerHTML = matches.map((url, i) => {
      // Highlight matching portion
      const li = url.toLowerCase();
      const idx = li.indexOf(q);
      let html;
      if (idx >= 0) {
        html = App.escapeHtml(url.substring(0, idx)) +
          '<mark style="background:var(--accent-soft);color:var(--accent);padding:0;">' +
          App.escapeHtml(url.substring(idx, idx + q.length)) + '</mark>' +
          App.escapeHtml(url.substring(idx + q.length));
      } else {
        html = App.escapeHtml(url);
      }
      return `<div class="ac-item" data-url="${App.escapeAttr(url)}" data-idx="${i}">${html}</div>`;
    }).join("");

    // Position
    const r = input.getBoundingClientRect();
    _dropdown.style.cssText = `
      position:fixed;z-index:9999;
      top:${r.bottom + 2}px;left:${r.left}px;width:${r.width}px;
      display:block;
      max-height:240px;overflow-y:auto;
      background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius);
      box-shadow:0 4px 12px rgba(0,0,0,.25);
    `;

    _dropdown.querySelectorAll(".ac-item").forEach(item => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        _pick(input, item.dataset.url);
      });
    });
  }

  function _pick(input, url) {
    input.value = url;
    const tab = App.getActiveTab();
    if (tab) tab.url = url;
    _hide();
    input.focus();
  }

  function _hide() {
    if (_dropdown) _dropdown.style.display = "none";
  }

  function _highlightItem(items) {
    items.forEach((it, i) => {
      it.style.background = i === _selectedIdx ? "var(--accent-soft)" : "";
    });
  }

})();
