/**
 * authTab.js — Auth-таб для запросов.
 *
 * Типы: None / Bearer Token / Basic Auth / API Key
 *
 * Данные хранятся в tab.auth:
 *   {
 *     type: "none" | "bearer" | "basic" | "apikey",
 *     bearer: { token: "" },
 *     basic:  { username: "", password: "", showPwd: false },
 *     apikey: { key: "X-API-Key", value: "", addTo: "header" }
 *   }
 *
 * Применение происходит в request.js через App.applyAuthToRequest(tab, headersObj, paramsObj).
 */
window.App = window.App || {};

(function () {

  // ── Дефолтная структура ──────────────────────────────────────────────────

  function _defaultAuth() {
    return {
      type:   "none",
      bearer: { token: "" },
      basic:  { username: "", password: "", showPwd: false },
      apikey: { key: "X-API-Key", value: "", addTo: "header" },
    };
  }

  function _ensureAuth(tab) {
    if (!tab.auth || typeof tab.auth !== "object") tab.auth = _defaultAuth();
    if (!tab.auth.bearer) tab.auth.bearer = { token: "" };
    if (!tab.auth.basic)  tab.auth.basic  = { username: "", password: "", showPwd: false };
    if (!tab.auth.apikey) tab.auth.apikey = { key: "X-API-Key", value: "", addTo: "header" };
    return tab.auth;
  }

  // ── Проверка: есть ли реальная авторизация ───────────────────────────────

  App.authHasBadge = function (tab) {
    const a = tab && tab.auth;
    if (!a || a.type === "none" || !a.type) return false;
    if (a.type === "bearer") return !!(a.bearer && a.bearer.token);
    if (a.type === "basic")  return !!(a.basic  && (a.basic.username || a.basic.password));
    if (a.type === "apikey") return !!(a.apikey && a.apikey.value);
    return false;
  };

  // ── Применение к запросу ─────────────────────────────────────────────────

  /**
   * Добавляет заголовки / параметры на основе tab.auth.
   * Вызывается из request.js перед отправкой.
   * resolve — функция резолва переменных.
   */
  App.applyAuthToRequest = function (tab, headersObj, paramsObj, resolve) {
    const auth = tab && tab.auth;
    if (!auth || auth.type === "none" || !auth.type) return;

    const r = resolve || (s => s);

    if (auth.type === "bearer" && auth.bearer) {
      const token = r(auth.bearer.token || "").trim();
      if (token) headersObj["Authorization"] = "Bearer " + token;
    }

    if (auth.type === "basic" && auth.basic) {
      const u = r(auth.basic.username || "").trim();
      const p = r(auth.basic.password || "");
      if (u || p) {
        headersObj["Authorization"] = "Basic " + btoa(u + ":" + p);
      }
    }

    if (auth.type === "apikey" && auth.apikey) {
      const k = r(auth.apikey.key   || "X-API-Key").trim();
      const v = r(auth.apikey.value || "").trim();
      if (k && v) {
        const addTo = auth.apikey.addTo || "header";
        if (addTo === "query") {
          paramsObj[k] = v;
        } else {
          headersObj[k] = v;
        }
      }
    }
  };

  // ── UI ───────────────────────────────────────────────────────────────────

  App.renderAuthTab = function (container, tab) {
    const auth = _ensureAuth(tab);

    container.innerHTML = `
      <div class="auth-tab-wrap">
        <div class="auth-type-row">
          <label class="auth-type-label">Тип авторизации</label>
          <select class="form-select form-select-sm auth-type-select" id="auth-type-select">
            <option value="none"   ${auth.type === "none"   ? "selected" : ""}>No Auth</option>
            <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>Bearer Token</option>
            <option value="basic"  ${auth.type === "basic"  ? "selected" : ""}>Basic Auth</option>
            <option value="apikey" ${auth.type === "apikey" ? "selected" : ""}>API Key</option>
          </select>
        </div>
        <div id="auth-fields"></div>
        <div class="auth-hint" id="auth-hint" style="display:none;"></div>
      </div>`;

    const typeSelect = container.querySelector("#auth-type-select");
    typeSelect.addEventListener("change", () => {
      auth.type = typeSelect.value;
      _renderFields(container, tab, auth);
    });

    _renderFields(container, tab, auth);
  };

  function _renderFields(container, tab, auth) {
    const box  = container.querySelector("#auth-fields");
    const hint = container.querySelector("#auth-hint");

    box.innerHTML  = "";
    hint.style.display = "none";

    if (auth.type === "none") {
      hint.style.display = "";
      hint.textContent = "Запрос отправляется без авторизации.";
      return;
    }

    if (auth.type === "bearer") {
      box.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Token</label>
          <div class="auth-field-row">
            <input type="text" id="auth-bearer-token" class="form-control form-control-sm auth-field-input"
                   placeholder="{{token}} или eyJhbGci…"
                   value="${_esc(auth.bearer.token)}">
          </div>
        </div>`;

      box.querySelector("#auth-bearer-token").addEventListener("input", e => {
        auth.bearer.token = e.target.value;
      });

      hint.style.display = "";
      hint.innerHTML = `Добавляет заголовок: <code>Authorization: Bearer &lt;token&gt;</code>`;
      return;
    }

    if (auth.type === "basic") {
      box.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Username</label>
          <input type="text" id="auth-basic-user" class="form-control form-control-sm auth-field-input"
                 placeholder="{{username}}" value="${_esc(auth.basic.username)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Password</label>
          <div class="auth-field-row">
            <input type="${auth.basic.showPwd ? "text" : "password"}"
                   id="auth-basic-pwd" class="form-control form-control-sm auth-field-input"
                   placeholder="{{password}}" value="${_esc(auth.basic.password)}">
            <button type="button" class="btn btn-sm btn-outline-secondary auth-eye-btn" id="auth-pwd-toggle"
                    title="${auth.basic.showPwd ? "Скрыть" : "Показать"}">
              <i class="bi bi-eye${auth.basic.showPwd ? "-slash" : ""}"></i>
            </button>
          </div>
        </div>`;

      box.querySelector("#auth-basic-user").addEventListener("input", e => {
        auth.basic.username = e.target.value;
      });
      box.querySelector("#auth-basic-pwd").addEventListener("input", e => {
        auth.basic.password = e.target.value;
      });
      box.querySelector("#auth-pwd-toggle").addEventListener("click", () => {
        auth.basic.showPwd = !auth.basic.showPwd;
        _renderFields(container, tab, auth);
      });

      hint.style.display = "";
      hint.innerHTML = `Добавляет заголовок: <code>Authorization: Basic base64(user:pass)</code>`;
      return;
    }

    if (auth.type === "apikey") {
      box.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Key</label>
          <input type="text" id="auth-apikey-key" class="form-control form-control-sm auth-field-input"
                 placeholder="X-API-Key" value="${_esc(auth.apikey.key)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Value</label>
          <input type="text" id="auth-apikey-val" class="form-control form-control-sm auth-field-input"
                 placeholder="{{apiKey}}" value="${_esc(auth.apikey.value)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Добавить в</label>
          <select class="form-select form-select-sm auth-field-input" id="auth-apikey-addto">
            <option value="header" ${auth.apikey.addTo === "header" ? "selected" : ""}>Header</option>
            <option value="query"  ${auth.apikey.addTo === "query"  ? "selected" : ""}>Query Params</option>
          </select>
        </div>`;

      box.querySelector("#auth-apikey-key").addEventListener("input", e => {
        auth.apikey.key = e.target.value;
      });
      box.querySelector("#auth-apikey-val").addEventListener("input", e => {
        auth.apikey.value = e.target.value;
      });
      box.querySelector("#auth-apikey-addto").addEventListener("change", e => {
        auth.apikey.addTo = e.target.value;
      });

      const addTo = auth.apikey.addTo || "header";
      hint.style.display = "";
      hint.innerHTML = addTo === "query"
        ? `Добавляет query-параметр: <code>?${_esc(auth.apikey.key || "key")}=…</code>`
        : `Добавляет заголовок: <code>${_esc(auth.apikey.key || "key")}: …</code>`;
      return;
    }
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

})();
