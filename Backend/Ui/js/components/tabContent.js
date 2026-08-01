window.App = window.App || {};

(function () {
  App.renderTabContent = function () {
    const root = document.getElementById("tab-content");
    const tab = App.getActiveTab();

    if (!tab) {
      root.innerHTML = '<div class="text-secondary p-4">' + App.t("noTabs") + '</div>';
      return;
    }

    // Специальный режим: рандомайзер как вкладка
    if (tab.method === "RANDOMIZER") {
      root.innerHTML = "";
      UnifiedRandomizer.mountInTab(root);
      return;
    }

    // Специальный режим для управления пользователями
    if (tab.method === "USERS") {
      root.innerHTML = App.renderUsersPanel(tab);
      return;
    }

    const sub = (name) => tab.activeSubTab === name ? "active" : "";
    const hasBodyMethod = ["POST", "PUT", "PATCH"].includes(tab.method);

    root.innerHTML = `
      <div class="request-line">
        <select class="form-select method-select method-${tab.method}" id="method-select"></select>
        <input type="text" class="form-control url-input" id="url-input"
               placeholder="https://api.example.com/endpoint" value="${App.escapeAttr(tab.url)}">
        <button class="dynvar-btn" id="url-dynvar-btn" title="${App.t("dynamicVars")}">{$}</button>
        <button class="btn send-btn" id="send-btn" ${tab.sending ? "disabled" : ""}>
          ${tab.sending ? '<span class="spinner-border spinner-border-sm"></span>' : App.t("send")}
        </button>
      </div>
      <ul class="nav sub-nav mb-2">
        <li class="nav-item"><button class="nav-link ${sub("params")}" data-sub="params">${App.t("params")}</button></li>
        <li class="nav-item"><button class="nav-link ${sub("headers")}" data-sub="headers">${App.t("headers")}</button></li>
        ${hasBodyMethod ? '<li class="nav-item"><button class="nav-link ' + sub("body") + '" data-sub="body">' + App.t("body") + '</button></li>' : ""}
        <li class="nav-item"><button class="nav-link ${sub("pre")}" data-sub="pre">
          ${App.t("preRequest")}${tab.preScript ? ' <span class="sub-dot">●</span>' : ""}
        </button></li>
        <li class="nav-item"><button class="nav-link ${sub("tests")}" data-sub="tests">
          ${App.t("tests")}${_testsBadge(tab)}
        </button></li>
      </ul>
      <div class="ua-row mb-2" style="display:flex;gap:6px;align-items:center;">
        <label style="font-size:11px;color:var(--text-dim);white-space:nowrap;flex-shrink:0;">User-Agent:</label>
        <select class="form-select form-select-sm" id="ua-select" style="flex:1;font-size:11px;max-width:200px;"></select>
        <input type="text" class="form-control form-control-sm" id="ua-custom" placeholder="Custom UA..." style="flex:2;font-size:11px;display:none;">
      </div>
      <div id="sub-tab-content"></div>
      <div class="response-resize-handle" title="${App.t("resizeHint")}"></div>
      <div class="response-panel${tab.responseCollapsed ? " collapsed" : ""}">
        <div class="response-panel-header">
          <div id="response-status" class="response-status text-secondary">
            <span class="status-dot" style="background:var(--text-dim)"></span> ${App.t("status")}: —
          </div>
          <div class="d-flex align-items-center gap-2">
            <ul class="nav response-view-nav" id="response-view-nav"></ul>
            <div class="response-actions">
              <button class="response-action-btn" id="response-copy-btn" title="${App.t("copyResponse")}">
                <i class="bi bi-clipboard"></i>
              </button>
              <button class="response-action-btn" id="response-collapse-btn"
                      title="${tab.responseCollapsed ? App.t("expandResponse") : App.t("collapseResponse")}">
                <i class="bi bi-chevron-${tab.responseCollapsed ? "down" : "up"}"></i>
              </button>
            </div>
          </div>
        </div>
        <div id="response-body"></div>
      </div>
    `;

    const methodSelect = document.getElementById("method-select");
    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === tab.method) opt.selected = true;
      methodSelect.appendChild(opt);
    });
    methodSelect.addEventListener("change", (e) => {
      tab.method = e.target.value;
      methodSelect.className = "form-select method-select method-" + tab.method;
      App.renderTabBar();
      App.renderTabContent();
    });

    const urlInput = document.getElementById("url-input");
    urlInput.maxLength = App.LIMITS.MAX_URL_LENGTH;
    urlInput.addEventListener("input", (e) => { tab.url = e.target.value; });
    urlInput.addEventListener("change", () => App.renderTabBar());
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") App.sendRequest(tab.id);
    });

    document.getElementById("send-btn").addEventListener("click", () => App.sendRequest(tab.id));

    // Справочник динамических переменных для URL
    document.getElementById("url-dynvar-btn")?.addEventListener("click", () => {
      App.showDynamicVars(document.getElementById("url-input"));
    });

    // --- User-Agent select ---
    const uaSelect = document.getElementById("ua-select");
    const uaCustom = document.getElementById("ua-custom");
    App.USER_AGENTS.forEach(ua => {
      const opt = document.createElement("option");
      opt.value = ua.value;
      opt.textContent = ua.label;
      if (ua.value === (tab.userAgent || "")) opt.selected = true;
      uaSelect.appendChild(opt);
    });
    // Add "Custom..." option
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = "Custom...";
    if (tab.userAgent && !App.USER_AGENTS.some(u => u.value === tab.userAgent)) {
      customOpt.selected = true;
      uaCustom.style.display = "";
      uaCustom.value = tab.userAgent;
    }
    uaSelect.appendChild(customOpt);

    uaSelect.addEventListener("change", (e) => {
      if (e.target.value === "__custom__") {
        uaCustom.style.display = "";
        uaCustom.focus();
        tab.userAgent = uaCustom.value;
      } else {
        uaCustom.style.display = "none";
        tab.userAgent = e.target.value;
      }
    });
    uaCustom.addEventListener("input", (e) => { tab.userAgent = e.target.value; });

    root.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab.activeSubTab = btn.dataset.sub;
        App.renderTabContent();
      });
    });

    if (!hasBodyMethod && tab.activeSubTab === "body") {
      tab.activeSubTab = "params";
    }

    // --- Кнопки панели ответа ---
    document.getElementById("response-collapse-btn")?.addEventListener("click", () => {
      tab.responseCollapsed = !tab.responseCollapsed;
      App.renderTabContent();
    });

    document.getElementById("response-copy-btn")?.addEventListener("click", () => {
      const text = App.getResponseTextForCopy(tab);
      if (!text) return;
      navigator.clipboard.writeText(text);
      const btn = document.getElementById("response-copy-btn");
      const old = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-check-lg"></i>';
      btn.style.color = "#28a745";
      setTimeout(() => { btn.innerHTML = old; btn.style.color = ""; }, 1200);
    });

    App.renderSubTabContent(tab);
    App.renderResponse(tab);

    // Init response panel resize
    if (App.initResponseResize) App.initResponseResize(root);
  };

  /** Текст ответа для копирования */
  App.getResponseTextForCopy = function (tab) {
    if (!tab.response) return "";
    if (!tab.response.ok) return tab.response.error || "";
    if (tab.responseViewMode === "headers") {
      return Object.entries(tab.response.headers || {})
        .map(([k, v]) => `${k}: ${v}`).join("\n");
    }
    return App.formatJson(tab.response.text || "");
  };

  App.renderSubTabContent = function (tab) {
    const container = document.getElementById("sub-tab-content");

    // ---- Pre-request / Tests: редакторы скриптов ----
    if (tab.activeSubTab === "pre" || tab.activeSubTab === "tests") {
      _renderScriptEditor(container, tab, tab.activeSubTab);
      return;
    }

    if (tab.activeSubTab === "body") {
      container.innerHTML =
        '<div class="body-editor-wrap">' +
        '<div class="body-editor-toolbar">' +
        '<span class="text-secondary">JSON Body</span>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<button class="dynvar-btn" id="body-dynvar-btn" title="' + App.t("dynamicVars") + '">{$}</button>' +
        // Кнопка Form раскрывает JSON тела в форму с полями — работает
        // с любым JSON-объектом, а не только с users. Поля определяются
        // автоматически из содержимого body.
        '<button class="btn btn-sm btn-outline-secondary" id="body-form-btn" title="' + App.t("editAsForm") + '"><i class="bi bi-ui-checks"></i> Form</button>' +
        "</div></div>" +
        '<textarea class="form-control body-textarea" id="body-textarea" rows="10" placeholder=\'{"key": "value"}\'>' +
        App.escapeHtml(tab.body) +
        "</textarea>" +
        '<div id="body-dynvar-preview" class="body-dynvar-preview"></div>' +
        "</div>";

      const bodyTextarea = document.getElementById("body-textarea");
      bodyTextarea.addEventListener("input", (e) => {
        if (e.target.value.length > App.LIMITS.MAX_BODY_LENGTH) {
          e.target.value = e.target.value.substring(0, App.LIMITS.MAX_BODY_LENGTH);
          App.showAlert(`${App.t("bodyTruncated")} ${(App.LIMITS.MAX_BODY_LENGTH / 1000).toFixed(0)} ${App.t("kb")}`);
        }
        tab.body = e.target.value;
        _updateBodyDynPreview(tab);
      });

      document.getElementById("body-dynvar-btn")?.addEventListener("click", () => {
        App.showDynamicVars(bodyTextarea);
      });

      _updateBodyDynPreview(tab);

      const formBtn = document.getElementById("body-form-btn");
      if (formBtn) {
        formBtn.addEventListener("click", () => {
          const parsed = App.tryParseJson(tab.body);
          if (parsed === null && (tab.body || "").trim()) {
            App.showAlert(App.t("errInvalidJsonBody"));
            return;
          }
          const entity = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            ? parsed : {};
          App.openEntityModal(
            tab.method === "POST" ? "create" : "edit",
            entity,
            App.getEntityBaseUrl(tab),
            tab.id,
            tab,   // передаём вкладку — из неё возьмётся Swagger-схема, если есть
          );
        });
      }
      return;
    }

    // ---- Таблица key-value ----
    const listKey = tab.activeSubTab;
    const rows = tab[listKey];
    const limit = listKey === "params" ? App.LIMITS.MAX_PARAMS : App.LIMITS.MAX_HEADERS;

    // В конце всегда одна пустая строка: начал печатать,
    // снизу тут же появилась следующая. Кнопка "Add" больше не нужна.
    if (rows.length === 0 || _rowFilled(rows[rows.length - 1])) {
      if (rows.length < limit) rows.push({ key: "", value: "", enabled: true });
    }

    container.innerHTML = `
      <div class="kv-table">
        <div class="kv-head">
          <span class="kv-col-check"></span>
          <span class="kv-col-key">${App.t("key")}</span>
          <span class="kv-col-val">${App.t("value")}</span>
          <span class="kv-col-act"></span>
        </div>
        <div id="kv-rows"></div>
      </div>
      <div class="kv-hint">${App.t("kvHint")}</div>`;

    const rowsContainer = container.querySelector("#kv-rows");
    const template = document.getElementById("kv-row-template");

    rows.forEach((row, idx) => {
      if (row.enabled === undefined) row.enabled = true;
      const isLast = idx === rows.length - 1;

      const node = template.content.firstElementChild.cloneNode(true);
      node.classList.add("kv-row-grid");
      if (!row.enabled) node.classList.add("kv-disabled");

      const keyInput = node.querySelector(".kv-key");
      const valInput = node.querySelector(".kv-value");
      const removeBtn = node.querySelector(".kv-remove");

      keyInput.value = row.key;
      valInput.value = row.value;
      keyInput.placeholder = App.t("key");
      valInput.placeholder = App.t("value");

      // Чекбокс включения строки
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "kv-enabled";
      check.checked = row.enabled;
      check.title = App.t("enableRow");
      check.addEventListener("change", (e) => {
        row.enabled = e.target.checked;
        node.classList.toggle("kv-disabled", !row.enabled);
      });
      // Последняя пустая строка — чекбокс не активен, пока не начали писать
      if (isLast && !_rowFilled(row)) check.style.visibility = "hidden";
      node.insertBefore(check, keyInput);

      // Ввод в последнюю строку — добавляем следующую, не теряя фокус
      const onInput = (which) => (e) => {
        row[which] = e.target.value;
        if (isLast && _rowFilled(row) && rows.length < limit) {
          rows.push({ key: "", value: "", enabled: true });
          const pos = e.target.selectionStart;
          App.renderSubTabContent(tab);
          // Возвращаем фокус в ту же ячейку
          const sel = which === "key" ? ".kv-key" : ".kv-value";
          const again = document.querySelectorAll("#kv-rows .kv-row")[idx];
          const inp = again && again.querySelector(sel);
          if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
        }
      };
      keyInput.addEventListener("input", onInput("key"));
      valInput.addEventListener("input", onInput("value"));

      // Enter в значении — переход на следующую строку
      valInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const next = document.querySelectorAll("#kv-rows .kv-row")[idx + 1];
          const nextKey = next && next.querySelector(".kv-key");
          if (nextKey) nextKey.focus();
        }
      });

      // Удаление строки
      removeBtn.title = App.t("delete");
      if (isLast && !_rowFilled(row)) {
        removeBtn.style.visibility = "hidden";   // нечего удалять
      }
      removeBtn.addEventListener("click", () => {
        rows.splice(idx, 1);
        App.renderSubTabContent(tab);
      });

      rowsContainer.appendChild(node);
    });
  };

  // ============================================================
  // РЕДАКТОР СКРИПТОВ (Pre-request / Tests)
  // ============================================================
  const PRE_SNIPPETS = [
    { label: "Set variable",  code: 'pm.variables.set("myVar", "value");' },
    { label: "Random data",   code: 'pm.variables.set("nonce", Date.now());\npm.request.body = JSON.stringify({ id: Date.now() });' },
    { label: "Bearer token",  code: 'pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));' },
    { label: "Timestamp header", code: 'pm.request.headers.set("X-Timestamp", new Date().toISOString());' },
  ];

  const TEST_SNIPPETS = [
    { label: "Status 200",    code: 'pm.test("статус 200", () => pm.response.to.have.status(200));' },
    { label: "JSON body",     code: 'pm.test("тело — JSON", () => {\n  const data = pm.response.json();\n  expect(data).toBeDefined();\n});' },
    { label: "Save token",    code: 'pm.test("токен получен", () => {\n  const t = pm.response.json().access_token;\n  expect(t).toBeDefined();\n  pm.variables.set("token", t);\n});' },
    { label: "Save id",       code: 'const data = pm.response.json();\npm.variables.set("lastId", data.id);' },
    { label: "Response time", code: 'pm.test("отвечает быстро", () => {\n  expect(pm.response.responseTime).toBeLessThan(500);\n});' },
    { label: "Has header",    code: 'pm.test("есть Content-Type", () => pm.response.to.have.header("Content-Type"));' },
  ];

  function _renderScriptEditor(container, tab, kind) {
    const isPre = kind === "pre";
    const field = isPre ? "preScript" : "testScript";
    const title = isPre ? App.t("preRequestTitle") : App.t("testsTitle");
    const hint  = isPre ? App.t("preRequestHint")  : App.t("testsHint");
    const snippets = isPre ? PRE_SNIPPETS : TEST_SNIPPETS;

    container.innerHTML = `
      <div class="script-editor">
        <div class="script-head">
          <div class="script-title">
            <i class="bi bi-${isPre ? "lightning" : "check2-circle"}"></i>
            ${App.escapeHtml(title)}
          </div>
          <div class="script-hint">${App.escapeHtml(hint)}</div>
        </div>

        <div class="script-toolbar">
          <button class="script-btn" id="script-run"><i class="bi bi-play-fill"></i> ${App.t("runNow")}</button>
          <button class="script-btn" id="script-clear"><i class="bi bi-trash3"></i> ${App.t("clear")}</button>
          <span class="script-snippets-label">${App.t("snippets")}:</span>
          <select id="script-snippets" class="script-snippets">
            <option value="">${App.t("pickSnippet")}</option>
            ${snippets.map((s, i) => `<option value="${i}">${App.escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>

        <textarea id="script-code" class="script-code" spellcheck="false"
                  placeholder="${App.escapeAttr(isPre ? PRE_EXAMPLE : TEST_EXAMPLE)}">${App.escapeHtml(tab[field] || "")}</textarea>

        <div id="script-result" class="script-result" style="display:none;"></div>
      </div>`;

    const ta = document.getElementById("script-code");
    ta.addEventListener("input", (e) => { tab[field] = e.target.value; });
    // Tab внутри редактора вставляет отступ, а не переключает фокус
    ta.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + 2;
      tab[field] = ta.value;
    });

    document.getElementById("script-snippets").addEventListener("change", (e) => {
      const i = +e.target.value;
      if (isNaN(i)) return;
      const snippet = snippets[i];
      if (!snippet) return;
      const insert = (ta.value.trim() ? "\n\n" : "") + snippet.code;
      ta.value += insert;
      tab[field] = ta.value;
      e.target.value = "";
    });

    document.getElementById("script-run").addEventListener("click", () => {
      _runScriptFromEditor(tab, kind);
    });

    document.getElementById("script-clear").addEventListener("click", () => {
      ta.value = "";
      tab[field] = "";
      document.getElementById("script-result").style.display = "none";
    });

    // Показать результаты последних тестов, если они есть
    if (kind === "tests" && tab.lastTests) _showScriptResult(tab.lastTests);
  }

  const PRE_EXAMPLE = `// Выполняется перед отправкой запроса
// Примеры:
//   pm.variables.set("token", "abc123");
//   pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));
//   pm.request.body = JSON.stringify({ id: Date.now() });`;

  const TEST_EXAMPLE = `// Выполняется после получения ответа
// Примеры:
//   pm.test("статус 200", () => pm.response.to.have.status(200));
//   pm.test("есть id", () => {
//     expect(pm.response.json().id).toBeDefined();
//   });
//   pm.variables.set("lastId", pm.response.json().id);`;

  function _runScriptFromEditor(tab, kind) {
    const code = kind === "pre" ? tab.preScript : tab.testScript;
    if (!code.trim()) return;

    const opts = { source: kind === "pre" ? "pre" : "test", tab };
    if (kind === "tests" && tab.response && tab.response.ok) {
      opts.response = tab.response;
    }
    const res = App.runScript(code, opts);
    _showScriptResult(res);
    if (kind === "tests") tab.lastTests = res;
  }

  function _showScriptResult(res) {
    const box = document.getElementById("script-result");
    if (!box) return;
    box.style.display = "";

    let html = "";
    if (!res.ok && res.error) {
      html += `<div class="script-err"><i class="bi bi-x-circle"></i> ${App.escapeHtml(res.error)}</div>`;
    }
    if (res.tests && res.tests.length) {
      const pass = res.tests.filter(t => t.ok).length;
      const fail = res.tests.length - pass;
      html += `<div class="script-summary">`;
      html += `<span style="color:#22c55e;">✓ ${pass}</span>`;
      if (fail) html += ` · <span style="color:#dc3545;">✗ ${fail}</span>`;
      html += ` · ${res.elapsed} ms</div>`;
      html += "<ul class=\"script-tests\">" + res.tests.map(t =>
        `<li class="${t.ok ? "ok" : "fail"}">
          <i class="bi bi-${t.ok ? "check-lg" : "x-lg"}"></i>
          ${App.escapeHtml(t.name)}
          ${t.error ? '<span class="script-err-msg">' + App.escapeHtml(t.error) + '</span>' : ""}
        </li>`).join("") + "</ul>";
    } else if (res.ok) {
      html += `<div class="script-ok">${App.t("scriptOkNoTests")} (${res.elapsed} ms)</div>`;
    }
    box.innerHTML = html;
  }

  /** Бейдж у названия вкладки Tests: ✓ 3 / 5 */
  function _testsBadge(tab) {
    if (!tab.lastTests || !tab.lastTests.tests || !tab.lastTests.tests.length) return "";
    const t = tab.lastTests.tests;
    const pass = t.filter(x => x.ok).length;
    const fail = t.length - pass;
    if (fail === 0) return ` <span class="sub-badge sub-ok">${pass}</span>`;
    return ` <span class="sub-badge sub-fail">${pass}/${t.length}</span>`;
  }

  /**
   * Предпросмотр подстановки динамических переменных под телом запроса.
   * Показывается только когда они реально есть — иначе не мозолит глаза.
   */
  function _updateBodyDynPreview(tab) {
    const box = document.getElementById("body-dynvar-preview");
    if (!box) return;

    if (!App.hasDynamic || !App.hasDynamic(tab.body)) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    const unknown = App.findUnknownDynamic(tab.body);
    const preview = App.previewDynamic(tab.body);

    box.style.display = "";
    box.innerHTML =
      '<div class="bdp-head">' +
        '<i class="bi bi-braces"></i> ' + App.t("willBeSent") +
        '<button class="bdp-refresh" title="' + App.t("regenerate") + '"><i class="bi bi-arrow-clockwise"></i></button>' +
      '</div>' +
      '<pre class="bdp-body">' + App.escapeHtml(preview) + '</pre>' +
      (unknown.length
        ? '<div class="bdp-warn">' + App.t("unknownVars") + ": " +
          unknown.map(u => "{{$" + App.escapeHtml(u) + "}}").join(", ") + '</div>'
        : "");

    box.querySelector(".bdp-refresh").addEventListener("click", () => _updateBodyDynPreview(tab));
  }

  /** Строка считается заполненной, если есть ключ или значение */
  function _rowFilled(r) {
    return !!(r && ((r.key || "").trim() || (r.value || "").trim()));
  }

  /** Только включённые и непустые строки идут в запрос */
  App.activeRows = function (rows) {
    return (rows || []).filter(r => r.enabled !== false && (r.key || "").trim());
  };

  App.renderResponse = function (tab) {
    const statusEl = document.getElementById("response-status");
    const bodyEl = document.getElementById("response-body");
    const navEl = document.getElementById("response-view-nav");

    if (!tab.response) {
      statusEl.className = "response-status text-secondary";
      statusEl.innerHTML = `<span class="status-dot" style="background:var(--text-dim)"></span> ${App.t("status")}: —`;
      navEl.innerHTML = "";
      bodyEl.innerHTML = `<pre class="response-pre">${App.t("pressSend")}</pre>`;
      return;
    }

    if (!tab.response.ok) {
      statusEl.className = "response-status status-err";
      statusEl.innerHTML = `<span class="status-dot"></span> ${App.t("error")}`;
      navEl.innerHTML = "";
      bodyEl.innerHTML = `<pre class="response-pre">${App.t("requestFailed")}:\n` + App.escapeHtml(tab.response.error) + "</pre>";
      return;
    }

    const code = tab.response.status_code;
    const cls = App.statusClass(code);
    const meaning = App.statusMeaning(code);
    statusEl.className = "response-status " + cls;
    statusEl.innerHTML =
      '<span class="status-dot"></span> ' + App.t("status") + ": " + code + " " + tab.response.reason +
      "  |  " + tab.response.elapsed_ms + " ms" +
      (meaning ? `<span class="status-meaning">— ${App.escapeHtml(meaning)}</span>` : "");

    const entities = App.getResponseEntities(tab);
    const views = [{ id: "body", label: App.t("body") }];
    if (entities) views.push({ id: "table", label: App.t("table") });
    views.push({ id: "headers", label: App.t("headers") });

    if (!views.find((v) => v.id === tab.responseViewMode)) {
      tab.responseViewMode = entities && tab.crudEntity ? "table" : "body";
    }

    navEl.innerHTML = views.map((v) =>
      '<li class="nav-item"><button class="nav-link' + (tab.responseViewMode === v.id ? " active" : "") +
      '" data-view="' + v.id + '">' + v.label + "</button></li>"
    ).join("");

    navEl.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab.responseViewMode = btn.dataset.view;
        App.renderResponse(tab);
      });
    });

    bodyEl.innerHTML = "";
    if (tab.responseViewMode === "table" && entities) {
      bodyEl.appendChild(App.renderEntityTable(entities, tab));
    } else if (tab.responseViewMode === "headers") {
      const pre = document.createElement("pre");
      pre.className = "response-pre";
      pre.textContent = JSON.stringify(tab.response.headers, null, 2);
      bodyEl.appendChild(pre);
    } else {
      const pre = document.createElement("pre");
      pre.className = "response-pre";
      let responseText = tab.response.text || "";
      if (responseText.length > App.LIMITS.MAX_RESPONSE_DISPLAY) {
        responseText = responseText.substring(0, App.LIMITS.MAX_RESPONSE_DISPLAY);
        pre.textContent = App.formatJson(responseText) + "\n\n... [обрезано: ответ больше " + (App.LIMITS.MAX_RESPONSE_DISPLAY / 1000000).toFixed(0) + " МБ]";
      } else {
        pre.textContent = App.formatJson(responseText);
      }
      bodyEl.appendChild(pre);
    }
  };
})();