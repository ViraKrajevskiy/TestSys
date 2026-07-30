/**
 * dialogs.js — Темизированные диалоги вместо системных prompt/confirm
 */
window.App = window.App || {};

(function () {
  let _initialized = false;
  let _resolve = null;

  function _ensure() {
    if (_initialized) return;
    _initialized = true;

    document.body.insertAdjacentHTML("beforeend", `
    <!-- PROMPT -->
    <div class="modal fade" id="app-prompt-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="app-prompt-title"></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <label class="form-label" style="font-size:12px;" id="app-prompt-label"></label>
            <input type="text" class="form-control form-control-sm" id="app-prompt-input">
            <div id="app-prompt-hint" class="form-text" style="font-size:10px;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="app-prompt-ok" data-i18n="ok">OK</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CONFIRM -->
    <div class="modal fade" id="app-confirm-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="app-confirm-title"></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0" id="app-confirm-text" style="font-size:13px;white-space:pre-line;"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" id="app-confirm-cancel" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn btn-sm" id="app-confirm-ok"></button>
          </div>
        </div>
      </div>
    </div>

    <!-- REQUEST EDITOR -->
    <div class="modal fade" id="app-request-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="app-request-title"></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 mb-2">
              <div class="col-4">
                <label class="form-label" style="font-size:12px;" data-i18n="method">Метод</label>
                <select class="form-select form-select-sm" id="app-req-method">
                  <option>GET</option><option>POST</option><option>PUT</option>
                  <option>PATCH</option><option>DELETE</option>
                </select>
              </div>
              <div class="col-8">
                <label class="form-label" style="font-size:12px;" data-i18n="requestName">Название</label>
                <input type="text" class="form-control form-control-sm" id="app-req-name">
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label" style="font-size:12px;">URL</label>
              <input type="text" class="form-control form-control-sm" id="app-req-url" placeholder="{{baseUrl}}/users">
              <div class="form-text" style="font-size:10px;" data-i18n="varsHint">Можно использовать переменные: {{baseUrl}}, {{userId}}</div>
            </div>
            <div class="mb-2" id="app-req-body-wrap">
              <label class="form-label" style="font-size:12px;">Body (JSON)</label>
              <textarea class="form-control form-control-sm" id="app-req-body" rows="7"
                        style="font-family:'Courier New',monospace;font-size:12px;"></textarea>
              <div id="app-req-body-err" style="font-size:11px;color:#dc3545;margin-top:3px;"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="app-req-save" data-i18n="save">Сохранить</button>
          </div>
        </div>
      </div>
    </div>`);

    // --- PROMPT wiring ---
    const pModal = document.getElementById("app-prompt-modal");
    const pInput = document.getElementById("app-prompt-input");
    document.getElementById("app-prompt-ok").addEventListener("click", () => {
      const v = pInput.value.trim();
      bootstrap.Modal.getInstance(pModal).hide();
      _finish(v || null);
    });
    pInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("app-prompt-ok").click(); }
    });
    pModal.addEventListener("hidden.bs.modal", () => _finish(null));
    pModal.addEventListener("shown.bs.modal", () => { pInput.focus(); pInput.select(); });

    // --- CONFIRM wiring ---
    const cModal = document.getElementById("app-confirm-modal");
    document.getElementById("app-confirm-ok").addEventListener("click", () => {
      bootstrap.Modal.getInstance(cModal).hide();
      _finish(true);
    });
    cModal.addEventListener("hidden.bs.modal", () => _finish(false));

    // --- REQUEST EDITOR wiring ---
    const rModal = document.getElementById("app-request-modal");
    const rMethod = document.getElementById("app-req-method");
    rMethod.addEventListener("change", _toggleBodyField);
    document.getElementById("app-req-save").addEventListener("click", () => {
      const method = rMethod.value;
      const name = document.getElementById("app-req-name").value.trim();
      const url = document.getElementById("app-req-url").value.trim();
      const body = document.getElementById("app-req-body").value.trim();
      const errEl = document.getElementById("app-req-body-err");

      if (!name) { errEl.textContent = App.t("errNameRequired"); return; }
      if (!url) { errEl.textContent = App.t("errUrlRequired"); return; }
      if (body && ["POST","PUT","PATCH"].includes(method)) {
        try { JSON.parse(body); }
        catch (e) { errEl.textContent = App.t("errBadJson") + " " + e.message; return; }
      }
      errEl.textContent = "";
      bootstrap.Modal.getInstance(rModal).hide();
      _finish({ method, name, url, body: body || undefined });
    });
    rModal.addEventListener("hidden.bs.modal", () => _finish(null));

    // Диалоги создаются лениво — переводим сразу после вставки
    if (App.applyTranslations) App.applyTranslations();
  }

  function _toggleBodyField() {
    const m = document.getElementById("app-req-method").value;
    document.getElementById("app-req-body-wrap").style.display =
      ["POST","PUT","PATCH"].includes(m) ? "" : "none";
  }

  function _finish(val) {
    if (_resolve) { const r = _resolve; _resolve = null; r(val); }
  }

  // ============================================================
  // PUBLIC
  // ============================================================
  App.showPrompt = function (opts) {
    _ensure();
    opts = opts || {};
    return new Promise((resolve) => {
      _resolve = resolve;
      document.getElementById("app-prompt-title").textContent = opts.title || App.t("input");
      document.getElementById("app-prompt-label").textContent = opts.label || "";
      document.getElementById("app-prompt-hint").textContent = opts.hint || "";
      const inp = document.getElementById("app-prompt-input");
      inp.value = opts.value || "";
      inp.placeholder = opts.placeholder || "";
      bootstrap.Modal.getOrCreateInstance(document.getElementById("app-prompt-modal")).show();
    });
  };

  App.showConfirm = function (opts) {
    _ensure();
    opts = opts || {};
    return new Promise((resolve) => {
      _resolve = resolve;
      document.getElementById("app-confirm-title").textContent = opts.title || App.t("confirm");
      document.getElementById("app-confirm-text").textContent = opts.message || "";
      const ok = document.getElementById("app-confirm-ok");
      ok.textContent = opts.okText || App.t("ok");
      ok.className = "btn btn-sm " + (opts.danger ? "btn-danger" : "send-btn");
      bootstrap.Modal.getOrCreateInstance(document.getElementById("app-confirm-modal")).show();
    });
  };

  /** Редактор запроса. entry = существующий или null */
  App.showRequestEditor = function (entry) {
    _ensure();
    return new Promise((resolve) => {
      _resolve = resolve;
      document.getElementById("app-request-title").textContent =
        entry ? App.t("editRequest") : App.t("newRequest");
      document.getElementById("app-req-method").value = entry ? entry.method : "GET";
      document.getElementById("app-req-name").value = entry ? entry.name : "";
      document.getElementById("app-req-url").value = entry ? entry.url : "{{baseUrl}}/";
      document.getElementById("app-req-body").value = entry && entry.body ? entry.body : "";
      document.getElementById("app-req-body-err").textContent = "";
      _toggleBodyField();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("app-request-modal")).show();
    });
  };

  /** Красивая замена alert */
  App.showAlert = function (message, title) {
    _ensure();
    return new Promise((resolve) => {
      _resolve = resolve;
      document.getElementById("app-confirm-title").textContent = title || App.t("message");
      document.getElementById("app-confirm-text").textContent = message;
      const ok = document.getElementById("app-confirm-ok");
      ok.textContent = App.t("ok");
      ok.className = "btn btn-sm send-btn";
      document.getElementById("app-confirm-cancel").style.display = "none";
      const m = document.getElementById("app-confirm-modal");
      m.addEventListener("hidden.bs.modal", function restore() {
        document.getElementById("app-confirm-cancel").style.display = "";
        m.removeEventListener("hidden.bs.modal", restore);
      });
      bootstrap.Modal.getOrCreateInstance(m).show();
    });
  };
})();
