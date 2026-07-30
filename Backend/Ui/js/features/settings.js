window.App = window.App || {};

(function () {
  // ============================================================
  // DEFAULT SETTINGS
  // ============================================================
  const DEFAULTS = {
    // Подключение
    apiBaseUrl: "http://127.0.0.1:8000",

    // Логирование
    loggingEnabled: true,
    logLevel: "info",       // "debug" | "info" | "warn" | "error" | "off"

    // Лимиты
    maxTabs: 20,
    maxParams: 50,
    maxHeaders: 50,
    maxBodyKB: 500,         // КБ
    maxUrlLength: 2048,
    maxResponseDisplayKB: 1000,  // КБ — обрезка в UI
    requestTimeoutSec: 30,
    sidebarWidth: 240,
  };

  let _settings = Object.assign({}, DEFAULTS);

  // ============================================================
  // APPLY — синхронизировать настройки с App.LIMITS и другими модулями
  // ============================================================
  function applySettings(s) {
    _settings = Object.assign({}, DEFAULTS, s);

    // Обновить лимиты
    App.LIMITS.MAX_TABS             = _settings.maxTabs;
    App.LIMITS.MAX_PARAMS           = _settings.maxParams;
    App.LIMITS.MAX_HEADERS          = _settings.maxHeaders;
    App.LIMITS.MAX_BODY_LENGTH      = _settings.maxBodyKB * 1024;
    App.LIMITS.MAX_URL_LENGTH       = _settings.maxUrlLength;
    App.LIMITS.MAX_RESPONSE_DISPLAY = _settings.maxResponseDisplayKB * 1024;

    // Обновить API_BASE в state
    App.VARIABLES.baseUrl = _settings.apiBaseUrl;

    // Логирование: переопределяем console если выключено
    if (!_settings.loggingEnabled || _settings.logLevel === "off") {
      window._originalConsole = window._originalConsole || {
        log: console.log, warn: console.warn, debug: console.debug, info: console.info
      };
      console.log = console.debug = console.info = console.warn = function () {};
    } else if (window._originalConsole) {
      console.log = window._originalConsole.log;
      console.warn = window._originalConsole.warn;
      console.debug = window._originalConsole.debug;
      console.info = window._originalConsole.info;
    }
  }

  // ============================================================
  // GETTERS
  // ============================================================
  App.getSettings = function () { return Object.assign({}, _settings); };
  App.getSetting = function (key) { return _settings[key]; };

  // ============================================================
  // LOAD / SAVE
  // ============================================================
  App.loadSettings = async function () {
    const api = await _waitForPywebview(3000);
    if (!api) return;
    try {
      const raw = await api.load_settings();
      if (raw) {
        const saved = JSON.parse(raw);
        applySettings(saved);
      }
    } catch (e) {
      console.warn("[Settings] load error:", e);
    }
  };

  async function saveSettings() {
    applySettings(_settings);
    if (window.pywebview && window.pywebview.api) {
      try {
        await window.pywebview.api.save_settings(JSON.stringify(_settings));
      } catch (e) {
        console.warn("[Settings] save error:", e);
      }
    }
  }

  function _waitForPywebview(timeout) {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.pywebview && window.pywebview.api) { clearInterval(iv); resolve(window.pywebview.api); }
        else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  // ============================================================
  // MODAL UI
  // ============================================================
  App.initSettingsModal = function () {
    // Inject modal HTML
    const modalHtml = `
    <div class="modal fade" id="settings-modal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-gear me-2"></i>Настройки проекта</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">

            <!-- CONNECTION -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-globe me-1"></i> Подключение
              </h6>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;">API Base URL</label>
                <input type="text" class="form-control form-control-sm" id="set-api-url"
                  placeholder="http://127.0.0.1:8000">
                <div class="form-text" style="font-size:10px;">Адрес FastAPI бэкенда. По умолчанию localhost:8000</div>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- LOGGING -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-journal-text me-1"></i> Логирование
              </h6>
              <div class="d-flex align-items-center gap-3 mb-2">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="set-logging-enabled">
                  <label class="form-check-label" for="set-logging-enabled" style="font-size:12px;">Включить логирование</label>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;">Уровень логов</label>
                <select class="form-select form-select-sm" id="set-log-level">
                  <option value="debug">Debug (всё)</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error (только ошибки)</option>
                  <option value="off">Выключено</option>
                </select>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- LIMITS -->
            <div class="mb-3">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-speedometer me-1"></i> Лимиты
              </h6>

              <div class="row g-2">
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. вкладок</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-tabs" min="1" max="100">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. params</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-params" min="1" max="200">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. headers</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-headers" min="1" max="200">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. body (КБ)</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-body" min="1" max="10000">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. URL</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-url" min="256" max="65536">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Макс. ответ (КБ)</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-resp" min="100" max="50000">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;">Таймаут (сек)</label>
                  <input type="number" class="form-control form-control-sm" id="set-timeout" min="1" max="300">
                </div>
              </div>
              <div class="form-text" style="font-size:10px;margin-top:6px;">
                Увеличивайте осторожно — высокие значения могут перегрузить приложение.
              </div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="set-reset-btn">
              <i class="bi bi-arrow-counterclockwise me-1"></i>По умолчанию
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="set-save-btn">
              <i class="bi bi-check-lg me-1"></i>Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const modalEl = document.getElementById("settings-modal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Open button
    document.getElementById("settings-btn")?.addEventListener("click", () => {
      fillForm(_settings);
      modal.show();
    });

    // Save
    document.getElementById("set-save-btn").addEventListener("click", async () => {
      readForm();
      await saveSettings();
      modal.hide();
    });

    // Reset
    document.getElementById("set-reset-btn").addEventListener("click", () => {
      fillForm(DEFAULTS);
    });
  };

  // ============================================================
  // FORM ↔ SETTINGS
  // ============================================================
  function fillForm(s) {
    document.getElementById("set-api-url").value          = s.apiBaseUrl;
    document.getElementById("set-logging-enabled").checked = s.loggingEnabled;
    document.getElementById("set-log-level").value         = s.logLevel;
    document.getElementById("set-max-tabs").value          = s.maxTabs;
    document.getElementById("set-max-params").value        = s.maxParams;
    document.getElementById("set-max-headers").value       = s.maxHeaders;
    document.getElementById("set-max-body").value          = s.maxBodyKB;
    document.getElementById("set-max-url").value           = s.maxUrlLength;
    document.getElementById("set-max-resp").value          = s.maxResponseDisplayKB;
    document.getElementById("set-timeout").value           = s.requestTimeoutSec;
  }

  function readForm() {
    _settings.apiBaseUrl           = document.getElementById("set-api-url").value.trim() || DEFAULTS.apiBaseUrl;
    _settings.loggingEnabled       = document.getElementById("set-logging-enabled").checked;
    _settings.logLevel             = document.getElementById("set-log-level").value;
    _settings.maxTabs              = clamp(+document.getElementById("set-max-tabs").value, 1, 100);
    _settings.maxParams            = clamp(+document.getElementById("set-max-params").value, 1, 200);
    _settings.maxHeaders           = clamp(+document.getElementById("set-max-headers").value, 1, 200);
    _settings.maxBodyKB            = clamp(+document.getElementById("set-max-body").value, 1, 10000);
    _settings.maxUrlLength         = clamp(+document.getElementById("set-max-url").value, 256, 65536);
    _settings.maxResponseDisplayKB = clamp(+document.getElementById("set-max-resp").value, 100, 50000);
    _settings.requestTimeoutSec    = clamp(+document.getElementById("set-timeout").value, 1, 300);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v || min)); }
})();
