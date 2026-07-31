/**
 * hotkeys.js — центральный реестр горячих клавиш.
 *
 * До этого шорткаты были размазаны по main.js / scriptConsole.js / и т.д.
 * Такой подход не давал ни списка «что вообще есть», ни возможности
 * пользователю их поменять. Теперь у нас:
 *
 *   1. Реестр всех команд с дефолтными сочетаниями и человеческими описаниями.
 *   2. Один глобальный слушатель keydown — читает реестр, вызывает действие.
 *   3. Пользовательские переопределения хранятся в localStorage.
 *   4. UI настроек рендерит таблицу и позволяет переназначить или сбросить.
 *
 * Формат сочетания — строка вида "Ctrl+T", "Ctrl+Shift+Tab", "F5", "`", "Ctrl+`".
 * Пробелы игнорируются. Порядок модификаторов не важен при разборе,
 * но при отображении нормализуется как "Ctrl+Shift+Alt+<key>".
 */
window.App = window.App || {};

(function () {
  const STORAGE_KEY = "hotkeys.overrides";

  /**
   * Реестр команд. Порядок влияет только на порядок в UI настроек.
   * key   — id команды, стабилен (не менять — по нему хранится override)
   * label — что показать пользователю (без i18n здесь: возьмём App.t на рендере)
   * group — раздел в таблице настроек
   * default — дефолтное сочетание клавиш
   * action — функция, что делать при срабатывании
   * whenInput — можно ли срабатывать, когда фокус в input/textarea
   *             (по умолчанию false — иначе Ctrl+T ломает набор в URL)
   */
  const REGISTRY = [
    // --- ВКЛАДКИ ---
    { key: "tab.new", group: "tabs", i18n: "hkNewTab", default: "Ctrl+T", whenInput: true,
      action: () => App.addTab && App.addTab() },
    { key: "tab.close", group: "tabs", i18n: "hkCloseTab", default: "Ctrl+W", whenInput: true,
      action: () => {
        if (App.state && App.state.activeTabId !== null) App.closeTab(App.state.activeTabId);
      } },
    { key: "tab.next", group: "tabs", i18n: "hkNextTab", default: "Ctrl+Tab", whenInput: true,
      action: () => _cycleTab(+1) },
    { key: "tab.prev", group: "tabs", i18n: "hkPrevTab", default: "Ctrl+Shift+Tab", whenInput: true,
      action: () => _cycleTab(-1) },

    // --- ЗАПРОС ---
    { key: "request.send", group: "request", i18n: "hkSendRequest", default: "Ctrl+Enter", whenInput: true,
      action: () => {
        if (App.state && App.state.activeTabId !== null) App.sendRequest(App.state.activeTabId);
      } },

    // --- КОНСОЛЬ ---
    { key: "console.toggle", group: "console", i18n: "hkToggleConsole", default: "Ctrl+`", whenInput: true,
      action: () => App.toggleScriptConsole && App.toggleScriptConsole() },
    { key: "console.clear", group: "console", i18n: "hkClearConsole", default: "Ctrl+L", whenInput: false,
      action: () => App.scriptConsole && App.scriptConsole.clear() },
    { key: "console.popout", group: "console", i18n: "hkPopoutConsole", default: "Ctrl+Shift+`", whenInput: true,
      action: () => App.popOutScriptConsole && App.popOutScriptConsole() },

    // --- ИНТЕРФЕЙС ---
    { key: "ui.sidebar", group: "ui", i18n: "hkToggleSidebar", default: "Ctrl+B", whenInput: false,
      action: () => document.getElementById("app-root")?.classList.toggle("sidebar-collapsed") },
    { key: "ui.settings", group: "ui", i18n: "hkOpenSettings", default: "Ctrl+,", whenInput: false,
      action: () => document.getElementById("settings-btn")?.click() },
    { key: "ui.updates", group: "ui", i18n: "hkOpenUpdates", default: "Ctrl+U", whenInput: false,
      action: () => App.showUpdater && App.showUpdater() },
  ];

  // Активные сочетания: { "ctrl+t": {key,action,whenInput}, ... }
  let _active = new Map();

  // ============================================================
  // ПАРСИНГ И НОРМАЛИЗАЦИЯ
  // ============================================================
  /** "Ctrl + Shift + T" -> "ctrl+shift+t" (стабильный ключ мапы) */
  function _canon(combo) {
    if (!combo) return "";
    const parts = combo.split("+").map(p => p.trim().toLowerCase()).filter(Boolean);
    const mods = new Set();
    let key = "";
    for (const p of parts) {
      if (p === "ctrl" || p === "control") mods.add("ctrl");
      else if (p === "shift") mods.add("shift");
      else if (p === "alt") mods.add("alt");
      else if (p === "meta" || p === "cmd" || p === "win") mods.add("meta");
      else key = p;   // последний немодификатор считаем клавишей
    }
    if (!key) return "";
    const order = ["ctrl", "shift", "alt", "meta"];
    return [...order.filter(m => mods.has(m)), key].join("+");
  }

  /** Красивое отображение: "Ctrl+Shift+T" */
  App.hotkeyPretty = function (combo) {
    const c = _canon(combo);
    if (!c) return "—";
    return c.split("+").map(p => {
      if (p === "ctrl") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "alt") return "Alt";
      if (p === "meta") return "Meta";
      if (p.length === 1) return p.toUpperCase();
      // ArrowUp / Tab / Enter / F5 и т.п. — оставляем как есть
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join("+");
  };

  /** Собрать canonical-строку из KeyboardEvent */
  function _eventCombo(e) {
    const mods = [];
    if (e.ctrlKey)  mods.push("ctrl");
    if (e.shiftKey) mods.push("shift");
    if (e.altKey)   mods.push("alt");
    if (e.metaKey)  mods.push("meta");

    let k = e.key;
    if (!k) return "";
    if (k === " ") k = "space";
    // Не считаем сами модификаторы клавишей
    if (["Control", "Shift", "Alt", "Meta"].includes(k)) return "";
    k = k.length === 1 ? k.toLowerCase() : k;
    return [...mods, k].join("+");
  }

  // ============================================================
  // ХРАНИЛИЩЕ
  // ============================================================
  function _loadOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }
  function _saveOverrides(o) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch (_) {}
  }

  // ============================================================
  // API
  // ============================================================
  /** Список команд для рендера в настройках. */
  App.getHotkeys = function () {
    const over = _loadOverrides();
    return REGISTRY.map(c => ({
      key: c.key,
      i18n: c.i18n,
      group: c.group,
      default: c.default,
      combo: over[c.key] != null ? over[c.key] : c.default,   // "" — «выключено»
      isCustom: over[c.key] != null,
    }));
  };

  /** Установить сочетание для команды. `combo` может быть пустой строкой — отключить. */
  App.setHotkey = function (cmdKey, combo) {
    const item = REGISTRY.find(c => c.key === cmdKey);
    if (!item) return { ok: false, error: "unknown command" };
    const canon = combo === "" ? "" : _canon(combo);
    if (combo && !canon) return { ok: false, error: "bad combo" };

    // Проверка конфликта: то же сочетание уже назначено другой команде?
    if (canon) {
      const clash = App.getHotkeys().find(h => h.key !== cmdKey && _canon(h.combo) === canon);
      if (clash) return { ok: false, error: "clash", with: clash.key };
    }

    const over = _loadOverrides();
    if (canon === item.default) delete over[cmdKey];   // такой же как дефолт — не храним
    else over[cmdKey] = canon;
    _saveOverrides(over);
    _rebuild();
    return { ok: true };
  };

  /** Сбросить одну команду к дефолту. */
  App.resetHotkey = function (cmdKey) {
    const over = _loadOverrides();
    delete over[cmdKey];
    _saveOverrides(over);
    _rebuild();
  };

  /** Сбросить всё. */
  App.resetAllHotkeys = function () {
    _saveOverrides({});
    _rebuild();
  };

  /** Прочитать canonical-сочетание из KeyboardEvent — используется UI-перехватом. */
  App.readHotkeyFromEvent = function (e) { return _eventCombo(e); };

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ И ДИСПЕТЧЕР
  // ============================================================
  function _rebuild() {
    _active = new Map();
    App.getHotkeys().forEach(h => {
      const c = _canon(h.combo);
      if (!c) return;   // отключено
      const item = REGISTRY.find(r => r.key === h.key);
      if (!item) return;
      _active.set(c, item);
    });
  }

  function _isInInput(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  App.initHotkeys = function () {
    _rebuild();
    document.addEventListener("keydown", (e) => {
      // Пока пользователь пишет захват в UI настроек — не срабатываем
      if (window._captureHotkeyForKey) return;

      const combo = _eventCombo(e);
      if (!combo) return;
      const item = _active.get(combo);
      if (!item) return;
      if (!item.whenInput && _isInInput(e.target)) return;

      try {
        e.preventDefault();
        item.action();
      } catch (err) {
        App.logError && App.logError("Hotkey", `${item.key}: ${err && err.message || err}`);
      }
    });
  };

  function _cycleTab(dir) {
    const tabs = App.state && App.state.tabs;
    if (!tabs || tabs.length < 2) return;
    const idx = tabs.findIndex(t => t.id === App.state.activeTabId);
    const next = (idx + dir + tabs.length) % tabs.length;
    App.selectTab(tabs[next].id);
  }
})();
