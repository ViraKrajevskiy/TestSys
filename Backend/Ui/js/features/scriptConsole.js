/**
 * scriptConsole.js — Консоль скриптов и терминал
 *
 * Нижняя выдвижная панель:
 *   - список запросов и вывод console.log из скриптов
 *   - строка ввода для интерактивных команд (REPL)
 *   - тот же pm, что в pre/test — поэтому пригодна для отладки
 */
window.App = window.App || {};

(function () {
  let _open = false;
  let _history = [];        // история команд REPL — стрелки вверх/вниз
  let _histIdx = -1;

  const HEIGHT_KEY = "scriptConsole.height";
  const MIN_H = 140;
  const MAX_H_RATIO = 0.85; // не даём перекрывать больше 85% высоты окна

  App.initScriptConsole = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _wire();
    _restoreHeight();

    // Подписываемся на новые записи в консоли
    App.scriptConsole.onLog((entry) => {
      if (entry === null) { _renderAll(); return; }   // clear
      _appendLine(entry);
      if (_open) _scrollToEnd();
    });

    // Кнопка терминала в навбаре
    document.addEventListener("click", (e) => {
      if (e.target.closest("#terminal-btn")) {
        e.preventDefault();
        App.toggleScriptConsole();
      }
    });

    // Ctrl+` и остальные шорткаты регистрируются в реестре (см. hotkeys.js)

    // При каждом запросе пишем в консоль — видно поток
    _hookRequests();
  };

  App.toggleScriptConsole = function () {
    _open = !_open;
    const panel = document.getElementById("script-console");
    panel.classList.toggle("open", _open);
    if (_open) {
      _renderAll();
      setTimeout(() => document.getElementById("repl-input")?.focus(), 100);
    }
  };

  /**
   * Открыть консоль в отдельном окне ОС.
   *
   * Не держим локальный флаг «уже открыто» — Python сам знает, есть ли
   * окно (open_console_window идемпотентна: если оно уже открыто, просто
   * поднимает его). Флаг вызывал баг: after crash он оставался в true,
   * и pop-out переставал работать до перезагрузки страницы.
   */
  App.popOutScriptConsole = async function () {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api.open_console_window) {
      App.showAlert && App.showAlert(App.t("apiUnavailable"));
      return;
    }
    try {
      await api.open_console_window();
      // Локальную панель закрываем — держать одновременно и панель, и окно
      // не имеет смысла, будет только путать
      _open = false;
      document.getElementById("script-console")?.classList.remove("open");
    } catch (e) {
      App.logError && App.logError("ConsolePopOut", String(e));
    }
  };

  // ============================================================
  // ПОКАЗ
  // ============================================================
  function _renderAll() {
    const out = document.getElementById("console-output");
    if (!out) return;
    out.innerHTML = "";
    App.scriptConsole.get().forEach(_appendLine);
    _scrollToEnd();
  }

  function _appendLine(entry) {
    const out = document.getElementById("console-output");
    if (!out) return;
    const el = document.createElement("div");
    el.className = "console-line kind-" + entry.kind;
    const time = new Date(entry.ts).toLocaleTimeString();
    el.innerHTML =
      `<span class="ln-time">${time}</span>` +
      `<span class="ln-source ln-${entry.source}">${App.escapeHtml(entry.source)}</span>` +
      `<span class="ln-icon">${_icon(entry.kind)}</span>` +
      `<span class="ln-text">${App.escapeHtml(entry.text)}</span>`;
    out.appendChild(el);
  }

  function _icon(kind) {
    switch (kind) {
      case "error":     return '<i class="bi bi-x-circle" style="color:#dc3545;"></i>';
      case "warn":      return '<i class="bi bi-exclamation-triangle" style="color:#ffc107;"></i>';
      case "test-pass": return '<i class="bi bi-check-lg" style="color:#22c55e;"></i>';
      case "test-fail": return '<i class="bi bi-x-lg" style="color:#dc3545;"></i>';
      case "request":   return '<i class="bi bi-arrow-up-circle" style="color:var(--accent);"></i>';
      case "response":  return '<i class="bi bi-arrow-down-circle" style="color:#22c55e;"></i>';
      default:          return '<i class="bi bi-terminal" style="color:var(--text-dim);"></i>';
    }
  }

  function _scrollToEnd() {
    const out = document.getElementById("console-output");
    if (out) out.scrollTop = out.scrollHeight;
  }

  // ============================================================
  // ПЕРЕХВАТ ЗАПРОСОВ
  // ============================================================
  function _hookRequests() {
    if (!App.sendRequest || App.sendRequest._consoleHooked) return;
    const orig = App.sendRequest;
    App.sendRequest = async function (tabId) {
      const tab = App.state.tabs.find(t => t.id === tabId);
      if (tab) App.scriptConsole.write("request", "app", [`${tab.method} ${tab.url}`]);

      const started = Date.now();
      const result = await orig.call(App, tabId);

      if (tab && tab.response) {
        const r = tab.response;
        if (r.ok) {
          const cls = r.status_code >= 400 ? "warn" : "response";
          App.scriptConsole.write(cls, "app",
            [`← ${r.status_code} ${r.reason || ""}  ${r.elapsed_ms || (Date.now()-started)}ms`]);
        } else {
          App.scriptConsole.write("error", "app", [`✗ ${r.error}`]);
        }
      }
      return result;
    };
    App.sendRequest._consoleHooked = true;
  }

  // ============================================================
  // СОБЫТИЯ
  // ============================================================
  function _wire() {
    document.getElementById("console-clear").addEventListener("click", () => {
      App.scriptConsole.clear();
    });
    document.getElementById("console-close").addEventListener("click", App.toggleScriptConsole);
    document.getElementById("console-popout")?.addEventListener("click", App.popOutScriptConsole);

    _wireResize();

    const input = document.getElementById("repl-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _runRepl(input.value);
        input.value = "";
      } else if (e.key === "ArrowUp" && !input.value) {
        if (_history.length && _histIdx > 0) _histIdx--;
        else if (_history.length && _histIdx === -1) _histIdx = _history.length - 1;
        if (_history[_histIdx]) input.value = _history[_histIdx];
      } else if (e.key === "ArrowDown") {
        if (_histIdx >= 0 && _histIdx < _history.length - 1) {
          _histIdx++;
          input.value = _history[_histIdx];
        } else {
          _histIdx = -1;
          input.value = "";
        }
      }
      // Ctrl+L раньше висел здесь — теперь глобальный шорткат из hotkeys.js
    });
  }

  // ============================================================
  // РЕСАЙЗ ПАНЕЛИ
  // ============================================================
  function _wireResize() {
    const handle = document.getElementById("console-resize");
    if (!handle) return;

    let startY = 0, startH = 0, dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const dy = startY - e.clientY;   // тянем вверх → высота растёт
      const maxH = Math.floor(window.innerHeight * MAX_H_RATIO);
      const h = Math.max(MIN_H, Math.min(maxH, startH + dy));
      _applyHeight(h);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Сохраняем в localStorage — переживёт перезапуск
      const h = document.getElementById("script-console")?.offsetHeight || 0;
      if (h >= MIN_H) localStorage.setItem(HEIGHT_KEY, String(h));
    };

    handle.addEventListener("mousedown", (e) => {
      if (!_open) return;    // ресайзить закрытую панель бессмысленно
      dragging = true;
      startY = e.clientY;
      startH = document.getElementById("script-console").offsetHeight;
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  function _restoreHeight() {
    const saved = parseInt(localStorage.getItem(HEIGHT_KEY) || "0", 10);
    if (saved >= MIN_H) _applyHeight(saved);
  }

  function _applyHeight(h) {
    // Ставим на CSS-переменную — .script-console.open её читает.
    // Так .open остаётся простым классом-переключателем, а размер задаётся
    // отдельно и не сбрасывается при закрытии/открытии.
    document.documentElement.style.setProperty("--console-h", h + "px");
  }

  function _runRepl(code) {
    const trimmed = code.trim();
    if (!trimmed) return;
    _history.push(trimmed);
    if (_history.length > 100) _history.shift();
    _histIdx = -1;

    const activeTab = App.getActiveTab();
    App.runRepl(trimmed, { tab: activeTab, response: activeTab && activeTab.response });
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div id="script-console" class="script-console">
      <div id="console-resize" class="console-resize" data-i18n-title="resize" title="${App.t("resize") || "Ресайз"}"></div>
      <div class="console-head">
        <div class="console-title">
          <i class="bi bi-terminal me-2"></i><span data-i18n="console">${App.t("console")}</span>
        </div>
        <div class="console-actions">
          <button id="console-popout" data-i18n-title="popOut" title="${App.t("popOut") || "В отдельное окно"}">
            <i class="bi bi-box-arrow-up-right"></i>
          </button>
          <button id="console-clear" title="Ctrl+L"><i class="bi bi-trash3"></i></button>
          <button id="console-close" title="Ctrl+\`"><i class="bi bi-x"></i></button>
        </div>
      </div>
      <div id="console-output" class="console-output"></div>
      <div class="repl-line">
        <span class="repl-prompt">›</span>
        <input type="text" id="repl-input" class="repl-input" spellcheck="false"
               data-i18n-ph="replPlaceholder"
               placeholder="${App.t("replPlaceholder")}">
      </div>
    </div>`;
  }
})();

// ============================================================
// РЕЖИМ ОТДЕЛЬНОГО ОКНА
//
// Когда пользователь жмёт «pop-out», Python открывает новое webview-окно
// с тем же index.html и window_kind="console". Ниже — то, что этому окну
// нужно сделать при загрузке: спрятать всё лишнее, развернуть консоль на
// весь экран и начать тянуть записи из общего буфера в Python.
// ============================================================
window.loadConsoleWindow = function () {
  if (window._consoleWindowReady) return;
  window._consoleWindowReady = true;

  App.WINDOW_KIND = "console";
  App.state = App.state || {};
  App.state.isDetachedWindow = true;

  // Убираем всё, кроме самой консоли
  document.getElementById("app-root")?.classList.add("sidebar-collapsed");
  ["app-navbar", "tab-bar", "sidebar", "sidebar-resize-handle", "update-banner"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  // Разворачиваем консоль на всё окно и открываем
  const panel = document.getElementById("script-console");
  if (panel) {
    panel.classList.add("open", "console-standalone");
    // Кнопка «закрыть» в standalone-режиме закрывает всё окно, а не панель
    const closeBtn = document.getElementById("console-close");
    if (closeBtn) {
      closeBtn.replaceWith(closeBtn.cloneNode(true));   // сбрасываем прежний listener
      document.getElementById("console-close").addEventListener("click", () => {
        try { window.close(); } catch (_) {}
      });
    }
    // Кнопка pop-out не нужна — мы уже в отдельном окне
    const popBtn = document.getElementById("console-popout");
    if (popBtn) popBtn.style.display = "none";
  }

  // Опрос общего буфера
  let lastTs = 0;
  const seen = new Set();   // защита от дублей на границе ts
  async function pull() {
    try {
      const api = window.pywebview && window.pywebview.api;
      if (!api || !api.read_console_entries) return;
      const entries = await api.read_console_entries(lastTs);
      if (Array.isArray(entries) && entries.length) {
        for (const e of entries) {
          const key = e.ts + "|" + e.text;
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > 1500) {
            // Периодически подчищаем кеш ключей — не даём расти вечно
            const arr = Array.from(seen); seen.clear();
            arr.slice(-500).forEach(k => seen.add(k));
          }
          if (e.ts > lastTs) lastTs = e.ts;
          App.scriptConsole._ingest(e);
        }
      }
    } catch (_) { /* окно закрывается — ок */ }
  }
  setInterval(pull, 400);
  // Первую подтяжку делаем сразу — не ждать 400 мс
  setTimeout(pull, 60);
};
