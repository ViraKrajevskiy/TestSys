/**
 * scripting.js — исполнение пользовательских скриптов
 *
 * Три вида скриптов:
 *   - pre-request: перед отправкой (генерация данных, авторизация)
 *   - test:        после ответа (проверки, извлечение токенов)
 *   - repl:        интерактивные команды в консоли
 *
 * Sandbox без изоляции процесса — скрипты пишет сам пользователь для
 * своих запросов, как в Postman. Но окружение чистое: ни window, ни
 * document, ни pywebview. Только pm-объект и стандартные функции JS.
 *
 * Всё синхронное — Function() без async, чтобы результат был предсказуем
 * до отправки запроса. Для сложных случаев есть pm.sendRequest (async).
 */
window.App = window.App || {};

(function () {
  const CONSOLE_MAX = 500;
  const _console = [];       // логи из скриптов, показываются в консоли
  const _consoleListeners = [];

  function _log(kind, source, args) {
    const entry = {
      ts: Date.now(),
      kind: kind,          // log | warn | error | test-pass | test-fail | request | response
      source: source,      // pre | test | repl | app
      text: args.map(_fmt).join(" "),
      raw: args,
    };
    _console.push(entry);
    if (_console.length > CONSOLE_MAX) _console.shift();
    _consoleListeners.forEach(fn => { try { fn(entry); } catch (_) {} });
    return entry;
  }

  function _fmt(v) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (v instanceof Error) return v.stack || v.message;
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  }

  App.scriptConsole = {
    get: () => _console.slice(),
    clear: () => { _console.length = 0; _consoleListeners.forEach(fn => fn(null)); },
    onLog: (fn) => { _consoleListeners.push(fn); },
    write: _log,
  };

  // ============================================================
  // ПРОСТОЙ ASSERT
  // ============================================================
  function _expect(actual) {
    const check = (cond, msg) => {
      if (!cond) throw new Error(msg);
      return chain;
    };
    const chain = {
      toBe:            (exp) => check(actual === exp,            `ожидалось ${_fmt(exp)}, получено ${_fmt(actual)}`),
      toEqual:         (exp) => check(_deep(actual, exp),        `значения не равны:\n  ожидалось: ${_fmt(exp)}\n  получено:  ${_fmt(actual)}`),
      toBeTruthy:      ()    => check(!!actual,                  `ожидалось истинное, получено ${_fmt(actual)}`),
      toBeFalsy:       ()    => check(!actual,                   `ожидалось ложное, получено ${_fmt(actual)}`),
      toBeNull:        ()    => check(actual === null,           `ожидалось null, получено ${_fmt(actual)}`),
      toBeDefined:     ()    => check(actual !== undefined,      `значение не определено`),
      toBeUndefined:   ()    => check(actual === undefined,      `ожидалось undefined, получено ${_fmt(actual)}`),
      toContain:       (exp) => check(_contains(actual, exp),    `${_fmt(actual)} не содержит ${_fmt(exp)}`),
      toMatch:         (re)  => check((re instanceof RegExp ? re : new RegExp(re)).test(String(actual)),
                                       `${_fmt(actual)} не подходит под ${re}`),
      toHaveProperty:  (key) => check(actual != null && key in actual,
                                       `нет свойства ${_fmt(key)}`),
      toBeGreaterThan: (n)   => check(actual > n,                `${actual} не больше ${n}`),
      toBeLessThan:    (n)   => check(actual < n,                `${actual} не меньше ${n}`),
      toHaveLength:    (n)   => check(actual != null && actual.length === n,
                                       `длина ${actual != null ? actual.length : "?"} ≠ ${n}`),
      not: null,   // заполнится ниже
    };
    // Инвертированные проверки: expect(x).not.toBe(y)
    const notChain = {};
    Object.keys(chain).forEach(k => {
      if (k === "not") return;
      notChain[k] = (...a) => {
        try { chain[k](...a); }
        catch { return chain; }
        throw new Error(`проверка не должна была пройти: .${k}(${a.map(_fmt).join(", ")})`);
      };
    });
    chain.not = notChain;
    return chain;
  }

  function _deep(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      return a.every((x, i) => _deep(x, b[i]));
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => _deep(a[k], b[k]));
  }

  function _contains(hay, needle) {
    if (hay == null) return false;
    if (typeof hay === "string") return hay.indexOf(String(needle)) !== -1;
    if (Array.isArray(hay)) return hay.some(x => _deep(x, needle));
    if (typeof hay === "object") return needle in hay;
    return false;
  }

  // ============================================================
  // PM-ОБЪЕКТ
  // ============================================================
  /**
   * @param opts {
   *   source: "pre" | "test" | "repl",
   *   tab: активная вкладка (мутируется в pre-скриптах),
   *   response: {status_code, text, headers} — только для test,
   *   tests: массив, куда пишем результаты pm.test,
   * }
   */
  function _makePm(opts) {
    const source = opts.source;
    const tab = opts.tab;
    const response = opts.response;
    const tests = opts.tests || [];

    // ----- ОТВЕТ -----
    let _cachedBody = null;
    const responseApi = response ? {
      code: response.status_code || 0,
      status: response.status_code || 0,
      reason: response.reason || "",
      responseTime: response.elapsed_ms || 0,
      responseSize: (response.text || "").length,
      headers: Object.assign({}, response.headers || {}),

      text: () => response.text || "",
      json: () => {
        if (_cachedBody !== null) return _cachedBody;
        try { _cachedBody = JSON.parse(response.text || "null"); }
        catch (e) { throw new Error("Ответ не является JSON: " + e.message); }
        return _cachedBody;
      },
      to: {
        have: {
          status: (code) => {
            if (response.status_code !== code) {
              throw new Error(`ожидался статус ${code}, получен ${response.status_code}`);
            }
          },
          header: (name) => {
            const key = Object.keys(response.headers || {})
              .find(k => k.toLowerCase() === String(name).toLowerCase());
            if (!key) throw new Error(`нет заголовка ${name}`);
          },
        },
      },
    } : null;

    // ----- ЗАПРОС (только для pre-скрипта можно менять) -----
    const requestApi = {
      get url() { return tab ? tab.url : ""; },
      set url(v) { if (tab) tab.url = String(v); },
      get method() { return tab ? tab.method : "GET"; },
      set method(v) { if (tab) tab.method = String(v).toUpperCase(); },
      get body() { return tab ? tab.body : ""; },
      set body(v) { if (tab) tab.body = typeof v === "string" ? v : JSON.stringify(v); },
      headers: {
        get: (name) => _findRow(tab && tab.headers, name),
        set: (name, value) => _setRow(tab && tab.headers, name, value),
        remove: (name) => _removeRow(tab && tab.headers, name),
        all: () => (tab && tab.headers || []).slice(),
      },
      params: {
        get: (name) => _findRow(tab && tab.params, name),
        set: (name, value) => _setRow(tab && tab.params, name, value),
        remove: (name) => _removeRow(tab && tab.params, name),
        all: () => (tab && tab.params || []).slice(),
      },
    };

    // ----- ПЕРЕМЕННЫЕ -----
    const varsApi = {
      get: (name) => App.VARIABLES[name],
      set: (name, value) => {
        App.VARIABLES[name] = String(value);
        if (App.saveCollections) App.saveCollections();
      },
      unset: (name) => {
        delete App.VARIABLES[name];
        if (App.saveCollections) App.saveCollections();
      },
      has: (name) => name in App.VARIABLES,
      all: () => Object.assign({}, App.VARIABLES),
    };

    // ----- pm.test — assertion, попадает в отчёт -----
    const testFn = (name, fn) => {
      try {
        fn();
        tests.push({ name, ok: true });
        _log("test-pass", source, ["✓ " + name]);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        tests.push({ name, ok: false, error: msg });
        _log("test-fail", source, ["✗ " + name + " — " + msg]);
      }
    };

    // ----- CONSOLE -----
    const consoleApi = {
      log:   (...a) => _log("log",   source, a),
      warn:  (...a) => _log("warn",  source, a),
      error: (...a) => _log("error", source, a),
      info:  (...a) => _log("log",   source, a),
      clear: () => App.scriptConsole.clear(),
    };

    return {
      request: requestApi,
      response: responseApi,
      variables: varsApi,
      environment: varsApi,   // алиас для совместимости с Postman-стилем
      globals: varsApi,       // тоже алиас
      test: testFn,
      expect: _expect,
      console: consoleApi,

      // Утилиты
      setVariable: varsApi.set,
      getVariable: varsApi.get,
      unsetVariable: varsApi.unset,
    };
  }

  function _findRow(rows, name) {
    if (!Array.isArray(rows)) return "";
    const low = String(name).toLowerCase();
    const row = rows.find(r => (r.key || "").toLowerCase() === low && r.enabled !== false);
    return row ? row.value : "";
  }

  function _setRow(rows, name, value) {
    if (!Array.isArray(rows)) return;
    const low = String(name).toLowerCase();
    const idx = rows.findIndex(r => (r.key || "").toLowerCase() === low);
    if (idx >= 0) rows[idx].value = String(value);
    else rows.push({ key: name, value: String(value), enabled: true });
  }

  function _removeRow(rows, name) {
    if (!Array.isArray(rows)) return;
    const low = String(name).toLowerCase();
    const idx = rows.findIndex(r => (r.key || "").toLowerCase() === low);
    if (idx >= 0) rows.splice(idx, 1);
  }

  // ============================================================
  // ИСПОЛНЕНИЕ
  // ============================================================
  /**
   * Запустить скрипт в изолированном окружении.
   * @returns {ok, error, tests, elapsed}
   */
  App.runScript = function (code, opts) {
    if (!code || !code.trim()) return { ok: true, tests: [], elapsed: 0 };

    const tests = [];
    const pm = _makePm(Object.assign({ tests }, opts || {}));
    const started = performance.now();

    try {
      // Function() создаёт функцию в глобальной области — window/document
      // видны по умолчанию. Затеняем их undefined-параметрами, чтобы скрипт
      // не мог по ошибке трогать реальный DOM/pywebview.
      const fn = new Function(
        "pm", "console", "expect",
        "window", "document", "pywebview", "App",
        "\"use strict\";\n" + code
      );
      fn(pm, pm.console, pm.expect, undefined, undefined, undefined, undefined);
      return {
        ok: true, tests,
        elapsed: Math.round(performance.now() - started),
      };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      _log("error", (opts && opts.source) || "script", [msg]);
      return {
        ok: false, tests, error: msg,
        stack: e && e.stack || "",
        elapsed: Math.round(performance.now() - started),
      };
    }
  };

  /**
   * Выполнить строку в REPL. Возвращает распечатанный результат.
   * Умеет выражения (последняя строка = результат) и операторы.
   */
  App.runRepl = function (code, opts) {
    if (!code || !code.trim()) return { ok: true, out: "" };

    const pm = _makePm(Object.assign({ source: "repl" }, opts || {}));

    // Логируем ввод
    _log("log", "repl", ["> " + code]);

    // Пробуем выполнить как выражение — вернуть значение
    try {
      const fn = new Function("pm", "console", "expect",
        "window", "document", "pywebview", "App",
        "\"use strict\"; return (" + code + ");");
      const result = fn(pm, pm.console, pm.expect, undefined, undefined, undefined, undefined);
      if (result !== undefined) {
        const out = _fmt(result);
        _log("log", "repl", ["← " + out]);
        return { ok: true, out };
      }
      return { ok: true, out: "" };
    } catch (_) {
      // Не выражение — пробуем как операторы
    }

    try {
      const fn = new Function("pm", "console", "expect",
        "window", "document", "pywebview", "App",
        "\"use strict\";\n" + code);
      fn(pm, pm.console, pm.expect, undefined, undefined, undefined, undefined);
      return { ok: true, out: "" };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      _log("error", "repl", [msg]);
      return { ok: false, error: msg };
    }
  };
})();
