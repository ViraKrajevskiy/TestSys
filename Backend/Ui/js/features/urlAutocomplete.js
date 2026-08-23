/**
 * urlAutocomplete.js — подсказки URL при вводе.
 *
 * Источник — реально отправленные запросы (App.metricsHistory, уже
 * персистится на диск как метрики) плюс URL из коллекций. Отдельного
 * хранилища не заводим: подсказываем то, что пользователь уже слал.
 *
 * Работает как выпадающий список под полем URL: фильтр по подстроке,
 * навигация стрелками, Enter/клик — подставить, Esc — закрыть.
 */
window.App = window.App || {};

(function () {
  let _box = null;        // контейнер выпадашки
  let _items = [];        // текущие подсказки
  let _active = -1;       // индекс подсвеченной
  let _input = null;      // поле, к которому привязаны

  /** Собрать уникальные URL: сначала из истории (свежие), потом из коллекций. */
  function _collectUrls() {
    const seen = new Set();
    const out = [];

    // История метрик — с конца (свежие сверху)
    const hist = App.metricsHistory || [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const u = hist[i] && hist[i].url;
      if (u && !seen.has(u)) { seen.add(u); out.push(u); }
    }
    // URL из коллекций (шаблоны с {{переменными}})
    (App.COLLECTIONS || []).forEach(c =>
      (c.folders || []).forEach(f =>
        (f.items || []).forEach(it => {
          if (it.url && !seen.has(it.url)) { seen.add(it.url); out.push(it.url); }
        })));
    return out;
  }

  function _match(query) {
    const q = (query || "").trim().toLowerCase();
    const all = _collectUrls();
    if (!q) return all.slice(0, 8);
    return all.filter(u => u.toLowerCase().includes(q)).slice(0, 8);
  }

  function _close() {
    if (_box) { _box.remove(); _box = null; }
    _items = []; _active = -1;
  }

  function _highlight(text, q) {
    const esc = App.escapeHtml ? App.escapeHtml(text) : text;
    if (!q) return esc;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc;
    const e = App.escapeHtml || (x => x);
    return e(text.slice(0, i)) + "<mark>" + e(text.slice(i, i + q.length)) + "</mark>" + e(text.slice(i + q.length));
  }

  function _render(query) {
    _items = _match(query);
    if (!_items.length) { _close(); return; }
    if (!_box) {
      _box = document.createElement("div");
      _box.className = "url-ac-box";
      document.body.appendChild(_box);
    }
    _box.innerHTML = _items.map((u, i) =>
      `<div class="url-ac-item${i === _active ? " active" : ""}" data-i="${i}">${_highlight(u, query)}</div>`
    ).join("");

    const r = _input.getBoundingClientRect();
    _box.style.cssText = `position:fixed;z-index:10000;left:${r.left}px;top:${r.bottom + 2}px;width:${r.width}px;`;

    _box.querySelectorAll(".url-ac-item").forEach(el => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();          // не терять фокус до подстановки
        _apply(_items[+el.dataset.i]);
      });
    });
  }

  function _apply(url) {
    if (!_input || !url) return;
    _input.value = url;
    _input.dispatchEvent(new Event("input", { bubbles: true }));
    _input.dispatchEvent(new Event("change", { bubbles: true }));
    _close();
    _input.focus();
  }

  /** Подключить автодополнение к полю URL. Вызывается из tabContent при рендере. */
  App.attachUrlAutocomplete = function (input) {
    if (!input || input._acAttached) return;
    input._acAttached = true;
    _input = input;

    input.addEventListener("input", () => { _input = input; _active = -1; _render(input.value); });
    input.addEventListener("focus", () => { _input = input; if (input.value !== undefined) _render(input.value); });
    input.addEventListener("blur", () => setTimeout(_close, 120));

    input.addEventListener("keydown", (e) => {
      if (!_box || !_items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault(); _active = (_active + 1) % _items.length; _render(input.value);
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); _active = (_active - 1 + _items.length) % _items.length; _render(input.value);
      } else if (e.key === "Enter" && _active >= 0) {
        e.preventDefault(); _apply(_items[_active]);
      } else if (e.key === "Escape") {
        _close();
      }
    });
  };
})();
