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
    if (tab.activeSubTab === "body") {
      container.innerHTML =
        '<div class="body-editor-wrap">' +
        '<div class="body-editor-toolbar">' +
        '<span class="text-secondary">JSON Body</span>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<button class="dynvar-btn" id="body-dynvar-btn" title="' + App.t("dynamicVars") + '">{$}</button>' +
        (tab.crudEntity === "user"
          ? '<button class="btn btn-sm btn-outline-secondary" id="body-form-btn"><i class="bi bi-ui-checks"></i> Form</button>'
          : "") +
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
          const entity = App.tryParseJson(tab.body) || {};
          App.openEntityModal(
            tab.method === "POST" ? "create" : "edit",
            entity,
            App.getEntityBaseUrl(tab),
            tab.id
          );
        });
      }
      return;
    }

    // ---- Таблица key-value в стиле Postman ----
    const listKey = tab.activeSubTab;
    const rows = tab[listKey];
    const limit = listKey === "params" ? App.LIMITS.MAX_PARAMS : App.LIMITS.MAX_HEADERS;

    // В конце всегда одна пустая строка — как в Postman: начал печатать,
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

      // Чекбокс включения строки (как в Postman)
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