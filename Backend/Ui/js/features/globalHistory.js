/**
 * globalHistory.js — глобальная история запросов по всем вкладкам.
 *
 * Кнопка в navbar → модальная таблица:
 *   Время | Метод | URL | Статус | Вкладка | Длительность
 * Фильтр: текстовый поиск по URL / методу / статусу.
 * Клик по строке → открывает запрос в новой вкладке.
 * Сортировка по любому столбцу.
 */
window.App = window.App || {};

(function () {
  const MODAL_ID = "global-history-modal";

  let _sortCol = "ts";
  let _sortAsc = false;
  let _query   = "";

  App.showGlobalHistory = function () {
    _ensureModal();
    const el = document.getElementById(MODAL_ID);
    bootstrap.Modal.getOrCreateInstance(el).show();
    _render();
  };

  // ──────────────────────────────────────────────────────────────
  // Создание модалки (один раз)
  // ──────────────────────────────────────────────────────────────

  function _ensureModal() {
    if (document.getElementById(MODAL_ID)) return;

    const el = document.createElement("div");
    el.className = "modal fade";
    el.id = MODAL_ID;
    el.tabIndex = -1;
    el.innerHTML = `
<div class="modal-dialog modal-xl modal-dialog-scrollable">
  <div class="modal-content theme-modal-content">
    <div class="modal-header">
      <h5 class="modal-title"><i class="bi bi-clock-history me-2"></i>История запросов</h5>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3" style="min-height:520px;">

      <!-- Поиск + счётчик -->
      <div class="d-flex gap-3 align-items-center">
        <div class="gh-search-wrap flex-grow-1">
          <i class="bi bi-search"></i>
          <input id="gh-search" class="form-control form-control-sm gh-search"
                 placeholder="Поиск по URL, методу, статусу…" autocomplete="off">
        </div>
        <span id="gh-count" class="text-muted" style="font-size:.82rem;white-space:nowrap;"></span>
        <button id="gh-clear-btn" class="btn btn-sm btn-outline-danger" title="Очистить историю всех вкладок">
          <i class="bi bi-trash3 me-1"></i>Очистить всё
        </button>
      </div>

      <!-- Таблица -->
      <div class="gh-scroll flex-grow-1">
        <table class="gh-table">
          <thead>
            <tr>
              <th data-col="ts">Время <i class="bi bi-arrow-down-up" style="font-size:9px;opacity:.5;"></i></th>
              <th data-col="method">Метод</th>
              <th data-col="url" style="width:40%;">URL</th>
              <th data-col="status">Статус</th>
              <th data-col="elapsed_ms">Время (ms)</th>
              <th data-col="tabTitle">Вкладка</th>
            </tr>
          </thead>
          <tbody id="gh-tbody"></tbody>
        </table>
      </div>

      <div class="text-muted" style="font-size:.76rem;">
        Клик по строке → открыть запрос в новой вкладке&ensp;·&ensp;История хранится только до перезапуска
      </div>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    document.getElementById("gh-search").addEventListener("input", e => {
      _query = e.target.value;
      _render();
    });
    el.querySelector("#gh-clear-btn").addEventListener("click", () => {
      if (!confirm("Очистить историю запросов для всех вкладок?")) return;
      (App.state && App.state.tabs || []).forEach(t => { t.responseHistory = []; });
      _render();
    });
    el.querySelector("thead").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (!th) return;
      const col = th.dataset.col;
      if (_sortCol === col) _sortAsc = !_sortAsc;
      else { _sortCol = col; _sortAsc = col !== "ts"; }
      _render();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Рендер
  // ──────────────────────────────────────────────────────────────

  function _render() {
    const tbody = document.getElementById("gh-tbody");
    if (!tbody) return;

    const entries = _collect();
    const q = _query.trim().toLowerCase();
    const filtered = q
      ? entries.filter(e =>
          (e.url     || "").toLowerCase().includes(q) ||
          (e.method  || "").toLowerCase().includes(q) ||
          String(e.status || "").includes(q)
        )
      : entries;

    // Сортировка
    filtered.sort((a, b) => {
      let va = a[_sortCol], vb = b[_sortCol];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return _sortAsc ? -1 : 1;
      if (va > vb) return _sortAsc ?  1 : -1;
      return 0;
    });

    const countEl = document.getElementById("gh-count");
    if (countEl) countEl.textContent = `${filtered.length} запрос${_plural(filtered.length)}`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="gh-empty">
        ${_query ? "Ничего не найдено" : "История пуста — отправьте хоть один запрос"}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((e, i) => {
      const statusCls = e.status >= 500 ? "text-danger"
                      : e.status >= 400 ? "text-warning"
                      : e.status >= 200 ? "text-success"
                      : "text-muted";
      const methodCls = { GET: "text-success", POST: "text-primary", PUT: "text-warning",
                           PATCH: "text-warning", DELETE: "text-danger" }[e.method] || "";
      const ts = new Date(e.ts);
      const time = ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const url = App.escapeHtml ? App.escapeHtml(e.url || "") : (e.url || "");
      const tabTitle = App.escapeHtml ? App.escapeHtml(e.tabTitle || "") : (e.tabTitle || "");
      return `<tr data-idx="${i}" title="Открыть запрос в новой вкладке">
        <td style="color:var(--text-dim);font-size:.78rem;">${time}</td>
        <td class="${methodCls}" style="font-weight:600;">${e.method || "?"}</td>
        <td style="max-width:300px;" title="${url}">${url}</td>
        <td class="${statusCls}">${e.status || "–"}</td>
        <td>${e.elapsed_ms != null ? e.elapsed_ms + " ms" : "–"}</td>
        <td style="color:var(--text-dim);font-size:.78rem;">${tabTitle}</td>
      </tr>`;
    }).join("");

    tbody.addEventListener("click", e => {
      const tr = e.target.closest("tr[data-idx]");
      if (!tr) return;
      const idx = parseInt(tr.dataset.idx, 10);
      const entry = filtered[idx];
      if (!entry) return;
      _openInNewTab(entry);
    }, { once: true });
    // Re-bind after each render
    _rebindRowClick(tbody, filtered);
  }

  function _rebindRowClick(tbody, filtered) {
    tbody.onclick = (e) => {
      const tr = e.target.closest("tr[data-idx]");
      if (!tr) return;
      const idx = parseInt(tr.dataset.idx, 10);
      const entry = filtered[idx];
      if (!entry) return;
      _openInNewTab(entry);
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Собрать все записи истории со всех вкладок
  // ──────────────────────────────────────────────────────────────

  function _collect() {
    const result = [];
    const tabs = (App.state && App.state.tabs) || [];
    tabs.forEach(tab => {
      const title = App.tabTitle ? App.tabTitle(tab) : (tab.title || tab.url || "Tab");
      (tab.responseHistory || []).forEach(h => {
        result.push({
          ts:        h.ts,
          method:    h.method  || tab.method || "GET",
          url:       h.url     || tab.url    || "",
          status:    h.response ? h.response.status_code : null,
          elapsed_ms: h.response ? h.response.elapsed_ms : null,
          tabTitle:  title,
          tabId:     tab.id,
          // Сохраняем полный снимок для воспроизведения
          _tab: {
            method:  h.method  || tab.method || "GET",
            url:     h.url     || tab.url    || "",
            headers: JSON.parse(JSON.stringify(tab.headers || [])),
            params:  JSON.parse(JSON.stringify(tab.params  || [])),
            body:    tab.body || "",
          },
        });
      });
    });
    return result;
  }

  // ──────────────────────────────────────────────────────────────
  // Открыть запрос из истории в новой вкладке
  // ──────────────────────────────────────────────────────────────

  function _openInNewTab(entry) {
    const t = entry._tab || {};
    const newTab = App.addTab && App.addTab({
      method:   t.method  || "GET",
      url:      t.url     || "",
      headers:  t.headers || [],
      params:   t.params  || [],
      body:     t.body    || "",
      title:    "",
    });
    if (!newTab) return;
    // Закрываем модалку
    const el = document.getElementById(MODAL_ID);
    if (el) bootstrap.Modal.getInstance(el) && bootstrap.Modal.getInstance(el).hide();
  }

  // ──────────────────────────────────────────────────────────────
  // Утилиты
  // ──────────────────────────────────────────────────────────────

  function _plural(n) {
    if (n % 10 === 1 && n % 100 !== 11) return "";
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return "а";
    return "ов";
  }

  // ──────────────────────────────────────────────────────────────
  // Инициализация кнопки в navbar
  // ──────────────────────────────────────────────────────────────

  App.initGlobalHistory = function () {
    const btn = document.getElementById("global-history-btn");
    if (btn) btn.addEventListener("click", () => App.showGlobalHistory());
  };
})();
