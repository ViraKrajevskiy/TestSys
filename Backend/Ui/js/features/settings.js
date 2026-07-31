window.App = window.App || {};

(function () {
  // ============================================================
  // DEFAULT SETTINGS
  // ============================================================
  const DEFAULTS = {
    // Язык интерфейса
    language: "ru",

    // Обновления
    autoCheckUpdates: true,
    skippedVersion: "",

    // Подключение
    apiBaseUrl: "http://127.0.0.1:8000",

    // Логирование
    loggingEnabled: true,
    logLevel: "info",       // "debug" | "info" | "warn" | "error" | "off"
    maxLogFileMB: 5,        // размер файла до ротации
    logBackupCount: 3,      // сколько архивов хранить
    maxLogEntries: 500,     // записей в памяти
    maxMetrics: 500,        // записей истории метрик

    // Лимиты
    maxTabs: 20,
    maxParams: 50,
    maxHeaders: 50,
    maxBodyKB: 500,         // КБ
    maxUrlLength: 2048,
    maxResponseDisplayKB: 1000,  // КБ — обрезка в UI
    requestTimeoutSec: 30,
    sidebarWidth: 240,

    // Рандомайзер: "floating" — панель внутри окна, "window" — отдельное окно ОС
    randomizerMode: "floating",

    // Синхронизация коллекций: local | folder | host | client
    syncMode: "local",
    syncClientName: "",
    syncFolderPath: "",
    syncHostPort: 8777,
    syncHostToken: "",
    syncRemoteUrl: "",
    syncRemoteToken: "",
  };

  let _settings = Object.assign({}, DEFAULTS);

  // ============================================================
  // APPLY — синхронизировать настройки с App.LIMITS и другими модулями
  // ============================================================
  function applySettings(s) {
    _settings = Object.assign({}, DEFAULTS, s);

    // Язык интерфейса.
    // Сравниваем с РЕАЛЬНО применённым языком (App.getLang()), а не с прошлым
    // значением _settings — readForm() пишет туда новый язык до вызова сюда,
    // из-за чего сравнение всегда давало «не изменилось».
    if (App.setLang && App.getLang && App.getLang() !== _settings.language) {
      App.setLang(_settings.language);
    }

    // Обновить лимиты
    App.LIMITS.MAX_TABS             = _settings.maxTabs;
    App.LIMITS.MAX_PARAMS           = _settings.maxParams;
    App.LIMITS.MAX_HEADERS          = _settings.maxHeaders;
    App.LIMITS.MAX_BODY_LENGTH      = _settings.maxBodyKB * 1024;
    App.LIMITS.MAX_URL_LENGTH       = _settings.maxUrlLength;
    App.LIMITS.MAX_RESPONSE_DISPLAY = _settings.maxResponseDisplayKB * 1024;

    // Обновить API_BASE в state
    App.VARIABLES.baseUrl = _settings.apiBaseUrl;

    // Логирование: глушим только ВЫВОД в консоль.
    // Запись ошибок в лог продолжается всегда — иначе нечего будет показать
    // в просмотрщике, когда что-то сломается.
    const silenced = !_settings.loggingEnabled || _settings.logLevel === "off";
    App.setConsoleSilenced && App.setConsoleSilenced(silenced);
    App.setLogLevel && App.setLogLevel(_settings.logLevel);

    // Лимиты хранения: буфер в памяти, история метрик и ротация файла
    App.setLogMaxEntries && App.setLogMaxEntries(_settings.maxLogEntries);
    App.METRICS_MAX = _settings.maxMetrics;
    if (App.metricsHistory && App.metricsHistory.length > App.METRICS_MAX) {
      App.metricsHistory = App.metricsHistory.slice(-App.METRICS_MAX);
    }
    if (window.pywebview?.api?.configure_log_rotation) {
      window.pywebview.api.configure_log_rotation(
        _settings.maxLogFileMB, _settings.logBackupCount
      ).catch(() => {});
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

  /** Публичный метод: сохранить произвольный объект настроек (для sync-модуля) */
  App.saveSettingsObject = async function (obj) {
    _settings = Object.assign({}, _settings, obj || {});
    await saveSettings();
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
            <h5 class="modal-title"><i class="bi bi-gear me-2"></i><span data-i18n="settings">Настройки проекта</span></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">

            <!-- LANGUAGE -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-translate me-1"></i> <span data-i18n="language">Язык</span>
              </h6>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;" data-i18n="interfaceLanguage">Язык интерфейса</label>
                <select class="form-select form-select-sm" id="set-language">
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- UPDATES -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-arrow-up-circle me-1"></i> <span data-i18n="updates">Обновления</span>
              </h6>
              <div class="d-flex gap-2 align-items-center">
                <button type="button" class="btn btn-sm btn-outline-secondary flex-grow-1" id="check-updates-btn" style="font-size:12px;">
                  <i class="bi bi-arrow-clockwise me-1"></i><span data-i18n="checkUpdates">Проверить обновления</span>
                  <span id="settings-version" style="color:var(--text-dim);margin-left:6px;"></span>
                </button>
              </div>
              <div class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="set-auto-updates">
                <label class="form-check-label" for="set-auto-updates" style="font-size:12px;" data-i18n="autoCheckUpdates">
                  Проверять при запуске
                </label>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- CONNECTION -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-globe me-1"></i> <span data-i18n="connection">Подключение</span>
              </h6>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;">API Base URL</label>
                <input type="text" class="form-control form-control-sm" id="set-api-url"
                  placeholder="http://127.0.0.1:8000">
                <div class="form-text" style="font-size:10px;" data-i18n="apiUrlHint">Адрес FastAPI бэкенда. По умолчанию localhost:8000</div>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- LOGGING -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-journal-text me-1"></i> <span data-i18n="logging">Логирование</span>
              </h6>
              <div class="d-flex align-items-center gap-3 mb-2">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="set-logging-enabled">
                  <label class="form-check-label" for="set-logging-enabled" style="font-size:12px;" data-i18n="enableLogging">Включить логирование</label>
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;" data-i18n="logLevel">Уровень логов</label>
                <select class="form-select form-select-sm" id="set-log-level">
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-secondary flex-grow-1" id="open-log-viewer" style="font-size:12px;">
                  <i class="bi bi-card-list me-1"></i><span data-i18n="viewLogs">Просмотреть логи и ошибки</span>
                  <span id="settings-error-hint" style="color:#dc3545;margin-left:6px;"></span>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" id="settings-clear-log" style="font-size:12px;white-space:nowrap;">
                  <i class="bi bi-trash3 me-1"></i><span data-i18n="clearLogs">Очистить логи</span>
                </button>
              </div>
              <div id="settings-log-size" style="font-size:10px;color:var(--text-dim);margin-top:4px;"></div>

              <div class="row g-2 mt-1">
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxLogFile">Размер файла (МБ)</label>
                  <input type="number" class="form-control form-control-sm" id="set-log-mb" min="1" max="200">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="logBackups">Архивов</label>
                  <input type="number" class="form-control form-control-sm" id="set-log-backups" min="0" max="20">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxLogEntries">Записей в памяти</label>
                  <input type="number" class="form-control form-control-sm" id="set-log-entries" min="50" max="10000">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxMetrics">История метрик</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-metrics" min="50" max="10000">
                </div>
              </div>
              <div class="form-text" style="font-size:10px;" data-i18n="logLimitsHint">
                Файл лога обрезается автоматически: при достижении размера старое уходит в архив.
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- RANDOMIZER -->
            <div class="mb-4">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-dice-5 me-1"></i> <span data-i18n="randomizerSection">Рандомайзер</span>
              </h6>
              <div class="mb-2">
                <label class="form-label" style="font-size:12px;" data-i18n="randomizerMode">Режим открытия</label>
                <select class="form-select form-select-sm" id="set-randomizer-mode">
                  <option value="floating" data-i18n="modeFloating">Панель внутри окна (плавающая)</option>
                  <option value="window" data-i18n="modeWindow">Отдельное окно ОС</option>
                </select>
                <div class="form-text" style="font-size:10px;" data-i18n="randomizerModeHint">В плавающей панели есть кнопка ↗ для выноса в отдельное окно.</div>
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- LIMITS -->
            <div class="mb-3">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                <i class="bi bi-speedometer me-1"></i> <span data-i18n="limits">Лимиты</span>
              </h6>

              <div class="row g-2">
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxTabs">Макс. вкладок</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-tabs" min="1" max="100">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxParams">Макс. параметров</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-params" min="1" max="200">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxHeaders">Макс. заголовков</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-headers" min="1" max="200">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxBody">Макс. тело (КБ)</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-body" min="1" max="10000">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxUrl">Макс. URL</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-url" min="256" max="65536">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="maxResponse">Макс. ответ (КБ)</label>
                  <input type="number" class="form-control form-control-sm" id="set-max-resp" min="100" max="50000">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label" style="font-size:11px;" data-i18n="timeout">Таймаут (сек)</label>
                  <input type="number" class="form-control form-control-sm" id="set-timeout" min="1" max="300">
                </div>
              </div>
              <div class="form-text" style="font-size:10px;margin-top:6px;" data-i18n="limitsHint">
                Увеличивайте осторожно — высокие значения могут перегрузить приложение.
              </div>
            </div>

            <hr style="border-color:var(--border-color);">

            <!-- HOTKEYS -->
            <div class="mb-3">
              <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
                <span><i class="bi bi-keyboard me-1"></i> <span data-i18n="hotkeys">Горячие клавиши</span></span>
                <button type="button" class="btn btn-sm btn-link p-0" id="hotkeys-reset-all" style="font-size:11px;">
                  <span data-i18n="resetAll">Сбросить все</span>
                </button>
              </h6>
              <div id="hotkeys-list"></div>
              <div class="form-text" style="font-size:10px;margin-top:6px;" data-i18n="hotkeysHint">
                Нажмите на клавишу справа от команды, чтобы задать своё сочетание. Escape отменяет ввод, Backspace — сбрасывает к умолчанию.
              </div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="set-reset-btn">
              <i class="bi bi-arrow-counterclockwise me-1"></i><span data-i18n="defaults">По умолчанию</span>
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="set-save-btn">
              <i class="bi bi-check-lg me-1"></i><span data-i18n="save">Сохранить</span>
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
      // Подсказка о количестве ошибок
      const hint = document.getElementById("settings-error-hint");
      if (hint && App.getErrorCount) {
        const n = App.getErrorCount();
        hint.textContent = n > 0 ? `(${n})` : "";
      }
      _refreshLogSize();
      _showVersion();
      _renderHotkeys();
      modal.show();
    });

    // Сброс всех горячих клавиш
    document.getElementById("hotkeys-reset-all")?.addEventListener("click", async () => {
      const ok = await App.showConfirm({
        title: App.t("resetAll") || "Сбросить все",
        message: App.t("hotkeysResetConfirm") || "Все горячие клавиши вернутся к значениям по умолчанию. Продолжить?",
        okText: App.t("reset") || "Сбросить", danger: true,
      });
      if (!ok) return;
      App.resetAllHotkeys();
      _renderHotkeys();
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

    // Очистка логов прямо из настроек
    document.getElementById("settings-clear-log").addEventListener("click", async () => {
      const ok = await App.showConfirm({
        title: App.t("clearLogs"),
        message: App.t("clearLogConfirm"),
        okText: App.t("clear"), danger: true,
      });
      if (!ok) return;

      App.clearLogBuffer && App.clearLogBuffer();
      if (window.pywebview?.api?.clear_log) {
        const res = await window.pywebview.api.clear_log(true);
        if (!res.ok) { App.showAlert(App.t("error") + ": " + res.error); return; }
      }
      await _refreshLogSize();
      const hint = document.getElementById("settings-error-hint");
      if (hint) hint.textContent = "";
      App.syncToast && App.syncToast(App.t("logsCleared"));
    });
  };

  // ============================================================
  // ГОРЯЧИЕ КЛАВИШИ
  // ============================================================
  const HK_GROUPS = ["tabs", "request", "console", "ui"];

  function _renderHotkeys() {
    const box = document.getElementById("hotkeys-list");
    if (!box || !App.getHotkeys) return;

    const items = App.getHotkeys();
    const byGroup = {};
    items.forEach(it => { (byGroup[it.group] = byGroup[it.group] || []).push(it); });

    box.innerHTML = HK_GROUPS.filter(g => byGroup[g]).map(g => `
      <div class="hk-group">
        <div class="hk-group-title">${App.t("hkGroup_" + g) || g}</div>
        ${byGroup[g].map(it => `
          <div class="hk-row" data-key="${it.key}">
            <div class="hk-label">${App.t(it.i18n) || it.key}</div>
            <button type="button" class="hk-combo${it.isCustom ? " hk-custom" : ""}"
                    data-action="capture" title="${App.t("hkChangeHint") || "Кликните и нажмите нужное сочетание"}">
              ${it.combo ? App.hotkeyPretty(it.combo) : "—"}
            </button>
            <button type="button" class="hk-reset" data-action="reset" title="${App.t("resetToDefault") || "Сбросить"}"
                    ${it.isCustom ? "" : "disabled"}>
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        `).join("")}
      </div>`).join("");

    // Клики по кнопкам
    box.querySelectorAll("[data-action='reset']").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".hk-row");
        App.resetHotkey(row.dataset.key);
        _renderHotkeys();
      });
    });
    box.querySelectorAll("[data-action='capture']").forEach(btn => {
      btn.addEventListener("click", () => _startCapture(btn));
    });
  }

  /**
   * Захват нажатия клавиши для кнопки-сочетания.
   * ESC — отмена (оставляем как было).
   * Backspace — сбросить к дефолту.
   * Любое другое сочетание — применить.
   */
  function _startCapture(btn) {
    const row = btn.closest(".hk-row");
    const cmdKey = row.dataset.key;
    const original = btn.textContent.trim();
    btn.textContent = App.t("hkPressKeys") || "Нажмите клавиши…";
    btn.classList.add("hk-capturing");
    window._captureHotkeyForKey = cmdKey;   // hotkeys.js увидит и не сработает

    const finish = (restore) => {
      window._captureHotkeyForKey = null;
      btn.classList.remove("hk-capturing");
      document.removeEventListener("keydown", onKey, true);
      if (restore) btn.textContent = original;
    };

    const onKey = (e) => {
      // ESC — отмена без изменений
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        finish(true);
        return;
      }
      // Backspace — вернуть к умолчанию
      if (e.key === "Backspace") {
        e.preventDefault(); e.stopPropagation();
        App.resetHotkey(cmdKey);
        finish(false);
        _renderHotkeys();
        return;
      }
      // Ждём именно сочетание — модификатор в одиночку не считаем
      const combo = App.readHotkeyFromEvent(e);
      if (!combo) return;
      e.preventDefault(); e.stopPropagation();

      const res = App.setHotkey(cmdKey, combo);
      if (!res.ok) {
        if (res.error === "clash") {
          App.showAlert(App.t("hkClash") ? App.t("hkClash").replace("{key}", res.with) : `Уже занято: ${res.with}`);
        } else {
          App.showAlert(App.t("error") + ": " + (res.error || ""));
        }
        finish(true);
        return;
      }
      finish(false);
      _renderHotkeys();
    };
    document.addEventListener("keydown", onKey, true);
  }

  /** Версия приложения рядом с кнопкой проверки обновлений */
  async function _showVersion() {
    const el = document.getElementById("settings-version");
    if (!el || !window.pywebview?.api?.get_app_version) return;
    try {
      const v = await window.pywebview.api.get_app_version();
      el.textContent = "v" + (v.version || "?");
    } catch (_) {}
  }

  /** Показать размер файла лога под кнопками */
  async function _refreshLogSize() {
    const el = document.getElementById("settings-log-size");
    if (!el || !window.pywebview?.api?.get_log_stats) return;
    try {
      const s = await window.pywebview.api.get_log_stats();
      if (!s.ok) { el.textContent = ""; return; }
      const kb = s.size < 1024 ? s.size + " B"
               : s.size < 1048576 ? (s.size / 1024).toFixed(1) + " KB"
               : (s.size / 1048576).toFixed(2) + " MB";
      el.textContent = `${App.t("logFile")}: ${kb}` +
        (s.backups ? ` · ${App.t("archives")}: ${s.backups}` : "") +
        ` · ${s.path}`;
    } catch (_) { el.textContent = ""; }
  }

  // ============================================================
  // FORM ↔ SETTINGS
  // ============================================================
  function fillForm(s) {
    document.getElementById("set-language").value          = s.language || "ru";
    document.getElementById("set-auto-updates").checked    = s.autoCheckUpdates !== false;
    document.getElementById("set-api-url").value          = s.apiBaseUrl;
    document.getElementById("set-logging-enabled").checked = s.loggingEnabled;
    document.getElementById("set-log-level").value         = s.logLevel;
    document.getElementById("set-log-mb").value            = s.maxLogFileMB;
    document.getElementById("set-log-backups").value       = s.logBackupCount;
    document.getElementById("set-log-entries").value       = s.maxLogEntries;
    document.getElementById("set-max-metrics").value       = s.maxMetrics;
    document.getElementById("set-randomizer-mode").value   = s.randomizerMode || "floating";
    document.getElementById("set-max-tabs").value          = s.maxTabs;
    document.getElementById("set-max-params").value        = s.maxParams;
    document.getElementById("set-max-headers").value       = s.maxHeaders;
    document.getElementById("set-max-body").value          = s.maxBodyKB;
    document.getElementById("set-max-url").value           = s.maxUrlLength;
    document.getElementById("set-max-resp").value          = s.maxResponseDisplayKB;
    document.getElementById("set-timeout").value           = s.requestTimeoutSec;
  }

  function readForm() {
    _settings.language             = document.getElementById("set-language").value;
    _settings.autoCheckUpdates     = document.getElementById("set-auto-updates").checked;
    _settings.apiBaseUrl           = document.getElementById("set-api-url").value.trim() || DEFAULTS.apiBaseUrl;
    _settings.loggingEnabled       = document.getElementById("set-logging-enabled").checked;
    _settings.logLevel             = document.getElementById("set-log-level").value;
    _settings.maxLogFileMB         = clamp(+document.getElementById("set-log-mb").value, 1, 200);
    _settings.logBackupCount       = clamp(+document.getElementById("set-log-backups").value, 0, 20);
    _settings.maxLogEntries        = clamp(+document.getElementById("set-log-entries").value, 50, 10000);
    _settings.maxMetrics           = clamp(+document.getElementById("set-max-metrics").value, 50, 10000);
    _settings.randomizerMode       = document.getElementById("set-randomizer-mode").value;
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
