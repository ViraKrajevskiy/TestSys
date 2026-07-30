/**
 * logger.js — Перехват и запись ошибок
 *
 * Ловит:
 *   - необработанные JS-ошибки (window.onerror)
 *   - отклонённые промисы (unhandledrejection)
 *   - вызовы console.error / console.warn
 *   - ошибки HTTP-запросов (через App.logError из request.js)
 *
 * Хранит кольцевой буфер в памяти + дублирует в файл через pywebview.
 */
window.App = window.App || {};

(function () {
  let MAX_ENTRIES = 500;      // настраивается из настроек
  const _buffer = [];

  /** Ограничить число записей в памяти — чтобы буфер не рос бесконечно */
  App.setLogMaxEntries = function (n) {
    MAX_ENTRIES = Math.max(50, Math.min(10000, +n || 500));
    while (_buffer.length > MAX_ENTRIES) _buffer.shift();
  };
  let _installed = false;
  let _silenced = false;      // глушить вывод в консоль (но не запись в лог)
  let _level = "info";        // debug | info | warn | error | off
  const _orig = {};           // оригинальные console-методы

  const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3, off: 99 };

  /** Писать ли запись такого уровня в лог */
  function _shouldRecord(level) {
    if (_level === "off") return level === "ERROR";  // ошибки пишем всегда
    const rank = { INFO: 1, WARN: 2, ERROR: 3 }[level] ?? 1;
    return rank >= (LEVEL_RANK[_level] ?? 1);
  }

  App.setConsoleSilenced = function (v) { _silenced = !!v; };
  App.setLogLevel = function (lvl) { if (lvl) _level = lvl; };

  // ============================================================
  // ЗАПИСЬ
  // ============================================================
  function _add(level, source, message, stack) {
    if (!_shouldRecord(level)) return null;

    const entry = {
      ts: Date.now(),
      level: level,             // ERROR | WARN | INFO
      source: source || "UI",   // откуда: UI, Request, Sync, Randomizer...
      message: String(message || ""),
      stack: stack || "",
    };

    _buffer.push(entry);
    if (_buffer.length > MAX_ENTRIES) _buffer.shift();

    // Дублируем в файл (не ждём ответа)
    if (window.pywebview && window.pywebview.api && window.pywebview.api.log_client_error) {
      try {
        window.pywebview.api.log_client_error(JSON.stringify(entry));
      } catch (_) { /* тихо — иначе рекурсия */ }
    }

    // Обновить бейдж на кнопке настроек, если есть ошибки
    if (level === "ERROR") _bumpErrorBadge();

    return entry;
  }

  // ============================================================
  // ПУБЛИЧНОЕ API
  // ============================================================
  App.logError = function (source, message, stack) { return _add("ERROR", source, message, stack); };
  App.logWarn  = function (source, message)        { return _add("WARN",  source, message); };
  App.logInfo  = function (source, message)        { return _add("INFO",  source, message); };

  App.getLogBuffer = function () { return _buffer.slice(); };
  App.clearLogBuffer = function () { _buffer.length = 0; _errorCount = 0; _updateBadge(); };

  App.getErrorCount = function () { return _errorCount; };

  // ============================================================
  // БЕЙДЖ КОЛИЧЕСТВА ОШИБОК
  // ============================================================
  let _errorCount = 0;

  function _bumpErrorBadge() {
    _errorCount++;
    _updateBadge();
  }

  function _updateBadge() {
    const btn = document.getElementById("settings-btn");
    if (!btn) return;
    let badge = btn.querySelector(".error-badge");
    if (_errorCount === 0) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "error-badge";
      btn.style.position = "relative";
      btn.appendChild(badge);
    }
    badge.textContent = _errorCount > 99 ? "99+" : String(_errorCount);
  }
  App.updateErrorBadge = _updateBadge;

  // ============================================================
  // УСТАНОВКА ПЕРЕХВАТЧИКОВ
  // ============================================================
  App.installErrorHandlers = function () {
    if (_installed) return;
    _installed = true;

    // 1. Необработанные ошибки
    window.addEventListener("error", (e) => {
      if (!e.message) return;

      // Кросс-доменная ошибка: браузер отдаёт только "Script error." без деталей.
      // Признак — нет filename и lineno === 0. Помечаем явно, чтобы не пугать
      // бесполезной записью и было понятно, куда смотреть.
      const opaque = (!e.filename || e.lineno === 0) && /^script error/i.test(e.message);
      if (opaque) {
        _add("WARN", "JS",
          "Ошибка во внешнем скрипте (CDN). Детали скрыты браузером из-за политики " +
          "разных источников. Проверьте подключение к интернету и консоль DevTools.");
        return;
      }

      const where = e.filename ? `${_shortFile(e.filename)}:${e.lineno}:${e.colno}` : "";
      _add("ERROR", "JS", e.message + (where ? `  (${where})` : ""),
           e.error && e.error.stack ? e.error.stack : "");
    });

    // 2. Ошибки загрузки ресурсов (script/img/link)
    window.addEventListener("error", (e) => {
      const t = e.target;
      if (t && t !== window && (t.src || t.href)) {
        _add("ERROR", "Resource", `Не загружен: ${t.src || t.href}`);
      }
    }, true);

    // 3. Отклонённые промисы
    window.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : String(r);
      _add("ERROR", "Promise", msg, r instanceof Error ? r.stack : "");
    });

    // 4. Перехват console — запись в лог всегда, вывод по настройке
    ["error", "warn", "log", "info", "debug"].forEach((m) => {
      _orig[m] = console[m] ? console[m].bind(console) : function () {};
    });

    console.error = function (...args) {
      _add("ERROR", "console", args.map(_fmt).join(" "),
           _stackOf(args));
      if (!_silenced) _orig.error(...args);   // ошибки в консоль — если не заглушено
    };
    console.warn = function (...args) {
      _add("WARN", "console", args.map(_fmt).join(" "));
      if (!_silenced) _orig.warn(...args);
    };
    console.log = function (...args) { if (!_silenced) _orig.log(...args); };
    console.info = function (...args) { if (!_silenced) _orig.info(...args); };
    console.debug = function (...args) { if (!_silenced) _orig.debug(...args); };

    _add("INFO", "App", "TestSys запущен");
  };

  function _fmt(a) {
    if (a instanceof Error) return a.message;
    if (typeof a === "object") {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }

  function _shortFile(url) {
    try { return url.split("/").pop(); } catch { return url; }
  }

  /** Достать stack из аргументов console.error, если там есть Error */
  function _stackOf(args) {
    for (const a of args) {
      if (a instanceof Error && a.stack) return a.stack;
    }
    return "";
  }
})();
