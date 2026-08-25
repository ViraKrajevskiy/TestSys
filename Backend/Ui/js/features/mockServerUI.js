/**
 * mockServerUI.js — интерфейс управления встроенным Mock-сервером.
 *
 * Кнопка в navbar → модальное окно:
 *   • Порт (по умолчанию 9099)
 *   • Таблица маршрутов: Method | Path | Status | Body | Delay (ms)
 *   • Кнопки: Добавить / Удалить / Сохранить список / Загрузить список
 *   • Кнопка Start / Stop
 *   • Live-лог последних запросов (обновляется раз в 2 сек пока сервер запущен)
 */
window.App = window.App || {};

(function () {
  const MODAL_ID  = "mock-server-modal";
  const DEFAULT_PORT = 9099;

  let _pollTimer  = null;
  let _routes     = [];   // [{method, path, status, body, delay, enabled}]
  let _running    = false;
  let _port       = DEFAULT_PORT;

  // ──────────────────────────────────────────────────────────────
  // Публичный вход
  // ──────────────────────────────────────────────────────────────

  App.showMockServer = function () {
    _ensureModal();
    const el = document.getElementById(MODAL_ID);
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
    _refreshStatus();
  };

  // ──────────────────────────────────────────────────────────────
  // Создание модального окна (один раз)
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
      <h5 class="modal-title"><i class="bi bi-hdd-rack me-2"></i>Mock Server</h5>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3" style="min-height:520px;">

      <!-- Статус + управление -->
      <div class="d-flex align-items-center gap-3 flex-wrap">
        <div class="d-flex align-items-center gap-2">
          <label class="form-label mb-0 text-nowrap">Порт:</label>
          <input id="mock-port-input" type="number" min="1024" max="65535"
                 class="form-control form-control-sm" style="width:90px;" value="${DEFAULT_PORT}">
        </div>
        <button id="mock-toggle-btn" class="btn btn-sm btn-success">
          <i class="bi bi-play-fill me-1"></i>Запустить
        </button>
        <span id="mock-status-badge" class="badge bg-secondary">остановлен</span>
        <div class="ms-auto d-flex gap-2">
          <button id="mock-save-btn"  class="btn btn-sm btn-outline-secondary" title="Сохранить маршруты в файл">
            <i class="bi bi-floppy me-1"></i>Сохранить
          </button>
          <button id="mock-load-btn"  class="btn btn-sm btn-outline-secondary" title="Загрузить маршруты из файла">
            <i class="bi bi-folder2-open me-1"></i>Загрузить
          </button>
        </div>
      </div>

      <!-- Таблица маршрутов -->
      <div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="fw-semibold" style="font-size:.85rem;">Маршруты</span>
          <button id="mock-add-route-btn" class="btn btn-sm btn-outline-accent">
            <i class="bi bi-plus-lg me-1"></i>Добавить
          </button>
        </div>
        <div id="mock-routes-table" class="mock-routes-wrap">
          <div class="mock-routes-head mock-routes-row">
            <span></span>
            <span>Method</span>
            <span>Path</span>
            <span>Status</span>
            <span>Body / Ответ</span>
            <span>Delay ms</span>
            <span></span>
          </div>
          <div id="mock-routes-body"></div>
        </div>
      </div>

      <!-- Лог запросов -->
      <div class="flex-grow-1 d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="fw-semibold" style="font-size:.85rem;">Лог входящих запросов</span>
          <button id="mock-clear-log-btn" class="btn btn-sm btn-outline-secondary btn-xs">
            <i class="bi bi-trash3 me-1"></i>Очистить
          </button>
        </div>
        <div id="mock-log" class="mock-log flex-grow-1"></div>
      </div>

    </div>
  </div>
</div>`;
    document.body.appendChild(el);

    // Кнопки
    el.querySelector("#mock-toggle-btn").addEventListener("click", _onToggle);
    el.querySelector("#mock-add-route-btn").addEventListener("click", () => {
      _routes.push({ method: "GET", path: "/api/example", status: 200, body: '{"ok":true}', delay: 0, enabled: true });
      _renderRoutes();
    });
    el.querySelector("#mock-save-btn").addEventListener("click", _onSave);
    el.querySelector("#mock-load-btn").addEventListener("click", _onLoad);
    el.querySelector("#mock-clear-log-btn").addEventListener("click", () => {
      document.getElementById("mock-log").innerHTML = "";
    });

    el.addEventListener("hidden.bs.modal", () => {
      clearInterval(_pollTimer);
      _pollTimer = null;
    });
    el.addEventListener("shown.bs.modal", () => {
      if (_running) _startPoll();
    });

    _renderRoutes();
  }

  // ──────────────────────────────────────────────────────────────
  // Рендер таблицы маршрутов
  // ──────────────────────────────────────────────────────────────

  function _renderRoutes() {
    const body = document.getElementById("mock-routes-body");
    if (!body) return;
    body.innerHTML = "";

    _routes.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "mock-routes-row mock-route-data-row";
      row.innerHTML = `
        <input type="checkbox" class="mock-route-enabled form-check-input" ${r.enabled !== false ? "checked" : ""} title="Включён">
        <select class="form-select form-select-sm mock-route-method">
          ${["GET","POST","PUT","PATCH","DELETE","ANY"].map(m =>
            `<option ${r.method === m ? "selected" : ""}>${m}</option>`).join("")}
        </select>
        <input type="text" class="form-control form-control-sm mock-route-path" value="${App.escapeHtml ? App.escapeHtml(r.path) : r.path}" placeholder="/api/path">
        <input type="number" class="form-control form-control-sm mock-route-status" value="${r.status || 200}" min="100" max="599" style="width:70px;">
        <textarea class="form-control form-control-sm mock-route-body" rows="1" style="resize:vertical;min-height:32px;">${r.body || ""}</textarea>
        <input type="number" class="form-control form-control-sm mock-route-delay" value="${r.delay || 0}" min="0" style="width:70px;">
        <button class="btn btn-sm btn-outline-danger mock-route-del" title="Удалить"><i class="bi bi-trash3"></i></button>`;
      body.appendChild(row);

      row.querySelector(".mock-route-enabled").addEventListener("change", e => { r.enabled = e.target.checked; });
      row.querySelector(".mock-route-method").addEventListener("change",  e => { r.method  = e.target.value; });
      row.querySelector(".mock-route-path").addEventListener("input",     e => { r.path    = e.target.value; });
      row.querySelector(".mock-route-status").addEventListener("input",   e => { r.status  = parseInt(e.target.value) || 200; });
      row.querySelector(".mock-route-body").addEventListener("input",     e => { r.body    = e.target.value; });
      row.querySelector(".mock-route-delay").addEventListener("input",    e => { r.delay   = parseInt(e.target.value) || 0; });
      row.querySelector(".mock-route-del").addEventListener("click", () => {
        _routes.splice(i, 1);
        _renderRoutes();
      });
    });

    if (!_routes.length) {
      body.innerHTML = `<div class="text-center text-muted py-3" style="font-size:.82rem;">
        Маршрутов нет — нажмите «Добавить» чтобы создать первый</div>`;
    }
  }

  function _collectRoutes() {
    // Синхронизируем _routes из DOM (на случай если кто-то редактировал текст без событий)
    const rows = document.querySelectorAll(".mock-route-data-row");
    rows.forEach((row, i) => {
      if (!_routes[i]) return;
      _routes[i].enabled = row.querySelector(".mock-route-enabled").checked;
      _routes[i].method  = row.querySelector(".mock-route-method").value;
      _routes[i].path    = row.querySelector(".mock-route-path").value;
      _routes[i].status  = parseInt(row.querySelector(".mock-route-status").value) || 200;
      _routes[i].body    = row.querySelector(".mock-route-body").value;
      _routes[i].delay   = parseInt(row.querySelector(".mock-route-delay").value) || 0;
    });
    // Фильтруем только включённые для отправки серверу
    return _routes.filter(r => r.enabled !== false).map(r => ({
      method: r.method,
      path:   r.path,
      status: r.status,
      body:   _tryParse(r.body),
      delay:  r.delay,
    }));
  }

  function _tryParse(s) {
    try { return JSON.parse(s); } catch { return s; }
  }

  // ──────────────────────────────────────────────────────────────
  // Start / Stop
  // ──────────────────────────────────────────────────────────────

  async function _onToggle() {
    const api = window.pywebview && window.pywebview.api;
    if (_running) {
      // Стоп
      if (api && api.stop_mock_server) {
        const r = JSON.parse(await api.stop_mock_server());
        if (!r.ok) { App.showAlert && App.showAlert("Ошибка остановки: " + r.error); return; }
      }
      _running = false;
      clearInterval(_pollTimer);
      _pollTimer = null;
      _updateStatusUI();
    } else {
      // Старт
      _collectRoutes();
      const portInput = document.getElementById("mock-port-input");
      _port = parseInt(portInput && portInput.value) || DEFAULT_PORT;
      const routes = _collectRoutes();
      if (api && api.start_mock_server) {
        const r = JSON.parse(await api.start_mock_server(String(_port), JSON.stringify(routes)));
        if (!r.ok) { App.showAlert && App.showAlert("Ошибка запуска: " + r.error); return; }
      } else {
        App.showAlert && App.showAlert("pywebview API недоступен — запуск mock-сервера возможен только в desktop-режиме");
        return;
      }
      _running = true;
      _updateStatusUI();
      _startPoll();
    }
  }

  function _updateStatusUI() {
    const btn   = document.getElementById("mock-toggle-btn");
    const badge = document.getElementById("mock-status-badge");
    const portInput = document.getElementById("mock-port-input");
    if (!btn) return;
    if (_running) {
      btn.innerHTML   = '<i class="bi bi-stop-fill me-1"></i>Остановить';
      btn.className   = "btn btn-sm btn-danger";
      badge.textContent = `запущен :${_port}`;
      badge.className = "badge bg-success";
      if (portInput) portInput.disabled = true;
    } else {
      btn.innerHTML   = '<i class="bi bi-play-fill me-1"></i>Запустить';
      btn.className   = "btn btn-sm btn-success";
      badge.textContent = "остановлен";
      badge.className = "badge bg-secondary";
      if (portInput) portInput.disabled = false;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Поллинг лога
  // ──────────────────────────────────────────────────────────────

  function _startPoll() {
    clearInterval(_pollTimer);
    _pollTimer = setInterval(_pollLog, 2000);
  }

  async function _pollLog() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.get_mock_server_status) return;
    try {
      const r = JSON.parse(await api.get_mock_server_status());
      if (!r.running) {
        _running = false;
        clearInterval(_pollTimer);
        _pollTimer = null;
        _updateStatusUI();
        return;
      }
      _appendLog(r.log || []);
    } catch (e) { /* игнорируем сетевые сбои */ }
  }

  let _loggedCount = 0;
  function _appendLog(entries) {
    if (!entries.length) return;
    const logEl = document.getElementById("mock-log");
    if (!logEl) return;
    // Добавляем только новые записи
    const fresh = entries.slice(_loggedCount);
    _loggedCount = entries.length;
    if (!fresh.length) return;
    fresh.forEach(e => {
      const line = document.createElement("div");
      line.className = "mock-log-line";
      const statusCls = e.status < 300 ? "text-success" : e.status < 400 ? "text-warning" : "text-danger";
      line.innerHTML = `<span class="mock-log-time">${e.time}</span>`
        + ` <span class="mock-log-method">${e.method}</span>`
        + ` <span class="mock-log-path">${App.escapeHtml ? App.escapeHtml(e.path) : e.path}</span>`
        + ` <span class="${statusCls}">${e.status}</span>`
        + (e.note ? ` <span class="mock-log-note text-muted">${e.note}</span>` : "");
      logEl.appendChild(line);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ──────────────────────────────────────────────────────────────
  // Сохранить / Загрузить маршруты
  // ──────────────────────────────────────────────────────────────

  async function _onSave() {
    _collectRoutes();
    const api = window.pywebview && window.pywebview.api;
    if (api && api.save_mock_routes) {
      const r = JSON.parse(await api.save_mock_routes("mock_routes.json", JSON.stringify(_routes)));
      if (r.ok) App.showAlert && App.showAlert("✓ Маршруты сохранены: " + (r.path || ""));
      else if (!r.cancelled) App.showAlert && App.showAlert("Ошибка: " + r.error);
    } else {
      // Веб-фоллбэк
      const blob = new Blob([JSON.stringify({ mock_routes: _routes }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mock_routes.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function _onLoad() {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.load_mock_routes) {
      const r = JSON.parse(await api.load_mock_routes());
      if (r.cancelled) return;
      if (!r.ok) { App.showAlert && App.showAlert("Ошибка: " + r.error); return; }
      _routes = r.routes || [];
    } else {
      // Веб-фоллбэк
      const raw = await _pickFile();
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        _routes = data.mock_routes || (Array.isArray(data) ? data : []);
      } catch { App.showAlert && App.showAlert("Неверный JSON файл"); return; }
    }
    _loggedCount = 0;
    _renderRoutes();
    App.showAlert && App.showAlert(`✓ Загружено маршрутов: ${_routes.length}`);
  }

  function _pickFile() {
    return new Promise(resolve => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".json";
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) { resolve(null); return; }
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => resolve(null);
        r.readAsText(f, "utf-8");
      };
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Начальный запрос статуса (открыли модалку)
  // ──────────────────────────────────────────────────────────────

  async function _refreshStatus() {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.get_mock_server_status) return;
    try {
      const r = JSON.parse(await api.get_mock_server_status());
      _running = r.running || false;
      if (_running) _port = r.port || DEFAULT_PORT;
      const portInput = document.getElementById("mock-port-input");
      if (portInput && _running) portInput.value = _port;
      _loggedCount = 0;
      _updateStatusUI();
      if (r.log && r.log.length) _appendLog(r.log);
      if (_running) _startPoll();
    } catch (e) { /* нет API */ }
  }

  // ──────────────────────────────────────────────────────────────
  // Инициализация кнопки в navbar
  // ──────────────────────────────────────────────────────────────

  App.initMockServer = function () {
    const btn = document.getElementById("mock-server-btn");
    if (btn) btn.addEventListener("click", () => App.showMockServer());
  };
})();
