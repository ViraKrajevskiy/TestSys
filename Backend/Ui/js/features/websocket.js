/**
 * websocket.js — WebSocket-клиент.
 *
 * Модалка: URL (ws:// или wss://), кнопка Connect, поле ввода сообщения,
 * лог входящих/исходящих. Использует нативный browser WebSocket — pywebview
 * даёт полный доступ к нему (это же WebView2 = Chromium).
 *
 * Ограничения:
 *   - Одна открытая сессия на модалку (простой сценарий: смотрю что летит).
 *     Для «нагрузки WebSocket-сервера» — отдельная фича; пока не нужна.
 *   - Не sync — нет автопереподключения (можно нажать Connect заново).
 *   - Bin frames — не поддерживаем (только текст, для JSON API этого хватает).
 */
window.App = window.App || {};

(function () {
  let _ws = null;
  let _log = [];      // {ts, dir: "in"|"out"|"info"|"error", text}

  App.showWebSocket = function () {
    if (!document.getElementById("ws-modal")) {
      document.body.insertAdjacentHTML("beforeend", _html());
      _wire();
    }
    _render();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("ws-modal")).show();
  };

  function _wire() {
    document.getElementById("ws-connect").addEventListener("click", _connect);
    document.getElementById("ws-disconnect").addEventListener("click", _disconnect);
    document.getElementById("ws-send").addEventListener("click", _send);
    document.getElementById("ws-clear").addEventListener("click", () => { _log = []; _render(); });
    document.getElementById("ws-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _send(); }
    });
  }

  function _connect() {
    if (_ws && _ws.readyState !== WebSocket.CLOSED) {
      _add("info", App.t("wsAlreadyOpen") || "Уже открыто соединение. Закройте текущее и попробуйте снова.");
      return;
    }
    const url = document.getElementById("ws-url").value.trim();
    if (!/^wss?:\/\//.test(url)) { App.showAlert(App.t("wsBadUrl") || "URL должен начинаться с ws:// или wss://"); return; }
    try {
      _ws = new WebSocket(url);
    } catch (e) {
      _add("error", (App.t("wsCreateFail") || "Не удалось создать соединение") + ": " + e.message);
      return;
    }
    _add("info", (App.t("wsOpening") || "Открываю соединение с") + " " + url + " …");
    _updateStatus("connecting");
    _ws.onopen    = () => { _add("info", "✓ " + (App.t("wsOpened") || "Соединение установлено")); _updateStatus("open"); };
    _ws.onmessage = (e) => _add("in", typeof e.data === "string" ? e.data : "[binary " + e.data.size + " bytes]");
    _ws.onerror   = (e) => _add("error", App.t("wsError") || "Ошибка соединения");
    _ws.onclose   = (e) => {
      _add("info", `${App.t("wsClosed") || "Соединение закрыто"} (code ${e.code}${e.reason ? " · " + e.reason : ""})`);
      _updateStatus("closed");
    };
  }

  function _disconnect() {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.close(1000, "user");
    }
  }

  function _send() {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) { App.showAlert(App.t("wsNoConn") || "Нет активного соединения"); return; }
    const inp = document.getElementById("ws-input");
    const text = inp.value;
    if (!text) return;
    try {
      _ws.send(text);
      _add("out", text);
      inp.value = "";
    } catch (e) {
      _add("error", "Не удалось отправить: " + e.message);
    }
  }

  function _add(dir, text) {
    _log.push({ ts: Date.now(), dir, text: String(text) });
    if (_log.length > 500) _log.splice(0, _log.length - 500);
    _render();
  }

  function _updateStatus(state) {
    const el = document.getElementById("ws-status");
    if (!el) return;
    const map = {
      "connecting": { text: "⏳ Подключение…", color: "var(--warn)" },
      "open":       { text: "● Открыто",       color: "var(--success)" },
      "closed":     { text: "○ Закрыто",       color: "var(--text-dim)" },
    };
    const s = map[state] || map.closed;
    el.textContent = s.text;
    el.style.color = s.color;

    document.getElementById("ws-connect").disabled    = state === "connecting" || state === "open";
    document.getElementById("ws-disconnect").disabled = state !== "open";
    document.getElementById("ws-send").disabled       = state !== "open";
  }

  function _render() {
    const box = document.getElementById("ws-log");
    if (!box) return;
    box.innerHTML = _log.map(e => {
      const time = new Date(e.ts).toLocaleTimeString();
      const icon = e.dir === "in"    ? '<i class="bi bi-arrow-down-circle" style="color:var(--success);"></i>'
                 : e.dir === "out"   ? '<i class="bi bi-arrow-up-circle"   style="color:var(--accent);"></i>'
                 : e.dir === "error" ? '<i class="bi bi-x-circle"           style="color:var(--danger);"></i>'
                 :                     '<i class="bi bi-info-circle"        style="color:var(--text-dim);"></i>';
      return `<div class="ws-log-row ws-log-${e.dir}">
        <span class="ws-log-time">${time}</span>${icon}
        <pre class="ws-log-text">${_esc(e.text)}</pre>
      </div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function _html() {
    return `
    <div class="modal fade" id="ws-modal" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-broadcast-pin me-2"></i>WebSocket</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex gap-2 mb-2">
              <input type="text" id="ws-url" class="form-control form-control-sm"
                     placeholder="wss://echo.websocket.org" value="wss://echo.websocket.org">
              <button class="btn btn-sm send-btn" id="ws-connect"><i class="bi bi-plug"></i> Connect</button>
              <button class="btn btn-sm btn-outline-danger" id="ws-disconnect" disabled><i class="bi bi-plug-fill"></i> Disconnect</button>
              <span id="ws-status" style="align-self:center;font-size:12px;color:var(--text-dim);">○ Закрыто</span>
            </div>
            <div class="ws-log-wrap" id="ws-log" style="height:280px;overflow-y:auto;background:var(--bg-app);border:1px solid var(--border-color);border-radius:var(--radius);padding:8px;font-size:12px;"></div>
            <div class="d-flex gap-2 mt-2 align-items-start">
              <textarea id="ws-input" class="form-control form-control-sm" rows="2" placeholder='{"type":"ping"} — Ctrl+Enter отправит' style="font-family:'Consolas',monospace;font-size:12px;"></textarea>
              <button class="btn btn-sm send-btn" id="ws-send" disabled><i class="bi bi-send"></i> Send</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" id="ws-clear"><i class="bi bi-trash3 me-1"></i>Очистить лог</button>
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
