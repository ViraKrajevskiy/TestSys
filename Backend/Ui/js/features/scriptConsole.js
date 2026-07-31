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

  App.initScriptConsole = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _wire();

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

    // Ctrl+` — открыть/закрыть, как в VS Code
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        App.toggleScriptConsole();
      }
    });

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
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        App.scriptConsole.clear();
      }
    });
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
      <div class="console-head">
        <div class="console-title">
          <i class="bi bi-terminal me-2"></i>${App.t("console")}
        </div>
        <div class="console-actions">
          <button id="console-clear" title="Ctrl+L"><i class="bi bi-trash3"></i></button>
          <button id="console-close" title="Ctrl+\`"><i class="bi bi-x"></i></button>
        </div>
      </div>
      <div id="console-output" class="console-output"></div>
      <div class="repl-line">
        <span class="repl-prompt">›</span>
        <input type="text" id="repl-input" class="repl-input" spellcheck="false"
               placeholder="${App.t("replPlaceholder")}">
      </div>
    </div>`;
  }
})();
