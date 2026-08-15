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
        <button class="dynvar-btn" id="codegen-btn" title="Генерация кода" style="font-size:12px;font-weight:600;">&lt;/&gt;</button>
        <button class="btn send-btn" id="send-btn" ${tab.sending ? "disabled" : ""}>
          ${tab.sending ? '<span class="spinner-border spinner-border-sm"></span>' : App.t("send")}
        </button>
      </div>
      <ul class="nav sub-nav mb-2">
        <li class="nav-item"><button class="nav-link ${sub("params")}" data-sub="params">${App.t("params")}</button></li>
        <li class="nav-item"><button class="nav-link ${sub("headers")}" data-sub="headers">${App.t("headers")}</button></li>
        ${hasBodyMethod ? '<li class="nav-item"><button class="nav-link ' + sub("body") + '" data-sub="body">' + App.t("body") + '</button></li>' : ""}
        ${hasBodyMethod ? '<li class="nav-item"><button class="nav-link ' + sub("files") + '" data-sub="files">' + App.t("files") + ((tab.files && tab.files.length) ? ' <span class="sub-dot">●</span>' : "") + '</button></li>' : ""}
        <li class="nav-item"><button class="nav-link ${sub("auth")}" data-sub="auth">
          Auth${App.authHasBadge && App.authHasBadge(tab) ? ' <span class="sub-dot">●</span>' : ""}
        </button></li>
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
    urlInput.addEventListener("input", (e) => { tab.url = e.target.value; App.saveSession && App.saveSession(); });
    urlInput.addEventListener("change", () => App.renderTabBar());
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") App.sendRequest(tab.id);
    });

    document.getElementById("send-btn").addEventListener("click", () => App.sendRequest(tab.id));
    document.getElementById("codegen-btn")?.addEventListener("click", () => App.showCodeGen && App.showCodeGen());

    // Справочник динамических переменных для URL
    document.getElementById("url-dynvar-btn")?.addEventListener("click", () => {
      App.showDynamicVars(document.getElementById("url-input"));
    });

    // --- User-Agent toggle ---
    document.getElementById("ua-toggle-btn")?.addEventListener("click", () => {
      const fields  = document.getElementById("ua-fields");
      const chevron = document.getElementById("ua-chevron");
      const open = fields.style.display === "none";
      fields.style.display  = open ? "" : "none";
      chevron.className = open ? "bi bi-chevron-down" : "bi bi-chevron-right";
      if (open) fields.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:4px;";
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
    uaCustom.addEventListener("input", (e) => { tab.userAgent = e.target.value; App.saveSession && App.saveSession(); });

    root.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab.activeSubTab = btn.dataset.sub;
        App.renderTabContent();
      });
    });

    if (!hasBodyMethod && (tab.activeSubTab === "body" || tab.activeSubTab === "files")) {
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

    // ---- Auth ----
    if (tab.activeSubTab === "auth") {
      if (App.renderAuthTab) App.renderAuthTab(container, tab);
      return;
    }

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
        App.saveSession && App.saveSession();
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

    if (tab.activeSubTab === "files") {
      _renderFilesTab(container, tab);
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
      // Последняя пустая строка — «черновая»: серее, без hover-подсветки.
      if (isLast && !_rowFilled(row)) node.classList.add("kv-row-empty");

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

      // Кнопка ⚡ — генерация значения по имени ключа
      const genBtn = document.createElement("button");
      genBtn.className = "kv-gen-btn";
      genBtn.title = App.t("kvGenerate") || "Сгенерировать значение";
      genBtn.innerHTML = "⚡";
      if (isLast && !_rowFilled(row)) genBtn.style.visibility = "hidden";
      genBtn.addEventListener("click", () => {
        const key = row.key.trim();
        if (!key) return;
        const val = _smartGenerate(key);
        row.value = val;
        valInput.value = val;
        valInput.dispatchEvent(new Event("input"));
      });
      // Вставляем ⚡ перед кнопкой удаления
      removeBtn.parentNode.insertBefore(genBtn, removeBtn);

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
  // УМНАЯ ГЕНЕРАЦИЯ ЗНАЧЕНИЯ ПО ИМЕНИ КЛЮЧА
  // ============================================================
  /**
   * По имени ключа (param или header) подбирает подходящее значение.
   * Приоритет: известные заголовки → динамические переменные → смарт-фил.
   */
  function _smartGenerate(key) {
    const k = key.toLowerCase().replace(/[-_\s]/g, "");

    // ── Специальные HTTP-заголовки ─────────────────────────────
    if (k === "authorization" || k === "authorization")
      return "Bearer {{$randomPassword}}";
    if (k === "contenttype")      return "application/json";
    if (k === "accept")           return "application/json";
    if (k === "acceptlanguage")   return "ru-RU,ru;q=0.9,en;q=0.8";
    if (k === "cachecontrol")     return "no-cache";
    if (k === "xrequestid" || k === "requestid" || k === "correlationid" || k === "traceid")
      return _gen("randomUUID");
    if (k === "xtimestamp" || k === "timestamp")
      return _gen("isoTimestamp");
    if (k === "xapikey" || k === "apikey" || k === "apikeyid")
      return _gen("randomUUID");
    if (k === "xforwardedfor" || k === "clientip" || k === "realip")
      return _gen("randomIP");
    if (k === "useragent")        return _gen("randomUserAgent");
    if (k === "referer" || k === "origin")
      return _gen("randomUrl");

    // ── По смыслу имени ────────────────────────────────────────
    if (/email/.test(k))          return _gen("randomEmail");
    if (/phone|tel/.test(k))      return _gen("randomPhone");
    if (/password|passwd|secret/.test(k)) return _gen("randomPassword");
    if (/uuid|guid/.test(k))      return _gen("randomUUID");
    if (/objectid|mongoid/.test(k)) return _gen("randomObjectId");
    if (/username|login/.test(k)) return _gen("randomUserName");
    if (/firstname|fname/.test(k)) return _gen("randomFirstName");
    if (/lastname|lname|surname/.test(k)) return _gen("randomLastName");
    if (/fullname|name/.test(k))  return _gen("randomFullName");
    if (/company|org/.test(k))    return _gen("randomCompany");
    if (/city/.test(k))           return _gen("randomCity");
    if (/country/.test(k))        return _gen("randomCountry");
    if (/street|address/.test(k)) return _gen("randomStreet");
    if (/zip|postal/.test(k))     return _gen("randomZipCode");
    if (/url|website|link/.test(k)) return _gen("randomUrl");
    if (/domain/.test(k))         return _gen("randomDomain");
    if (/ip$|ipaddr/.test(k))     return _gen("randomIP");
    if (/status|state/.test(k))   return _gen("randomStatus");
    if (/date/.test(k))           return _gen("randomDate");
    if (/price|amount|cost|total/.test(k)) return _gen("randomPrice");
    if (/age|count|limit|size|page|offset|skip|id$|^id/.test(k))
      return _gen("randomInt");
    if (/token|key$|secret/.test(k)) return _gen("randomPassword");
    if (/color|colour/.test(k))   return ["red","green","blue","black","white"][Math.floor(Math.random()*5)];
    if (/lang|language|locale/.test(k)) return ["ru","en","de","fr","es"][Math.floor(Math.random()*5)];
    if (/currency/.test(k))       return _gen("randomCurrency");
    if (/bool|flag|active|enabled|verified/.test(k)) return Math.random() > 0.5 ? "true" : "false";
    if (/text|comment|description|message|body|content|note/.test(k))
      return _gen("randomSentence");
    if (/tag|label|category/.test(k)) return _gen("randomWord");

    // ── Fallback: генерим случайную строку ─────────────────────
    return _gen("randomWord");
  }

  /** Вызвать генератор из App.GENERATORS если доступен, иначе eval через App.resolveAll */
  function _gen(name) {
    try {
      if (App.GENERATORS && App.GENERATORS[name]) return String(App.GENERATORS[name].fn());
    } catch (_) {}
    return `{{$${name}}}`;   // fallback — вставляем переменную, она раскроется при отправке
  }

  // ============================================================
  // РЕДАКТОР СКРИПТОВ (Pre-request / Tests)
  // ============================================================
  // ── Сниппеты Pre-request ─────────────────────────────────────────
  const PRE_SNIPPETS = [
    // Авторизация
    { group: "🔐 Авторизация", label: "Bearer токен из переменной",
      code: 'pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));' },
    { group: "🔐 Авторизация", label: "Basic Auth",
      code: 'const creds = btoa(pm.variables.get("username") + ":" + pm.variables.get("password"));\npm.request.headers.set("Authorization", "Basic " + creds);' },
    { group: "🔐 Авторизация", label: "API Key заголовок",
      code: 'pm.request.headers.set("X-API-Key", pm.variables.get("apiKey"));' },
    // Заголовки
    { group: "📋 Заголовки", label: "Content-Type JSON",
      code: 'pm.request.headers.set("Content-Type", "application/json");' },
    { group: "📋 Заголовки", label: "X-Timestamp",
      code: 'pm.request.headers.set("X-Timestamp", new Date().toISOString());' },
    { group: "📋 Заголовки", label: "X-Request-ID (uuid)",
      code: 'const uid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,\n  c => { const r=Math.random()*16|0; return (c==="x"?r:(r&0x3|0x8)).toString(16); });\npm.request.headers.set("X-Request-ID", uid);' },
    // Данные
    { group: "📦 Данные", label: "Установить переменную",
      code: 'pm.variables.set("myVar", "value");' },
    { group: "📦 Данные", label: "Случайный timestamp в body",
      code: 'const body = JSON.parse(pm.request.body || "{}");\nbody.timestamp = Date.now();\npm.request.body = JSON.stringify(body);' },
    { group: "📦 Данные", label: "Случайное число в body",
      code: 'const body = JSON.parse(pm.request.body || "{}");\nbody.nonce = Math.floor(Math.random() * 1e9);\npm.request.body = JSON.stringify(body);' },
    { group: "📦 Данные", label: "Подставить lastId в URL",
      code: 'pm.request.url = pm.request.url.replace("{id}", pm.variables.get("lastId"));' },
    // Логирование
    { group: "🛠 Отладка", label: "Вывести переменные",
      code: 'pm.console.log("Variables:", pm.variables.all());' },
    { group: "🛠 Отладка", label: "Вывести URL и метод",
      code: 'pm.console.log(pm.request.method, pm.request.url);' },
  ];

  // ── Сниппеты Tests ────────────────────────────────────────────
  const TEST_SNIPPETS = [
    // Статус
    { group: "✅ Статус", label: "Статус 200",
      code: 'pm.test("статус 200", () => pm.response.to.have.status(200));' },
    { group: "✅ Статус", label: "Статус 201 (создано)",
      code: 'pm.test("статус 201", () => pm.response.to.have.status(201));' },
    { group: "✅ Статус", label: "Статус 2xx (любой успех)",
      code: 'pm.test("успешный статус", () => {\n  expect(pm.response.code).toBeGreaterThan(199);\n  expect(pm.response.code).toBeLessThan(300);\n});' },
    { group: "✅ Статус", label: "Статус 400 (ошибка клиента)",
      code: 'pm.test("статус 400", () => pm.response.to.have.status(400));' },
    // Тело ответа
    { group: "📄 Тело", label: "Ответ — валидный JSON",
      code: 'pm.test("тело — JSON", () => {\n  const data = pm.response.json();\n  expect(data).toBeDefined();\n});' },
    { group: "📄 Тело", label: "Поле id существует",
      code: 'pm.test("есть id", () => {\n  const data = pm.response.json();\n  expect(data).toHaveProperty("id");\n  expect(data.id).toBeDefined();\n});' },
    { group: "📄 Тело", label: "Список не пустой",
      code: 'pm.test("список не пуст", () => {\n  const data = pm.response.json();\n  expect(Array.isArray(data)).toBeTruthy();\n  expect(data.length).toBeGreaterThan(0);\n});' },
    { group: "📄 Тело", label: "Поле равно значению",
      code: 'pm.test("поле status === active", () => {\n  expect(pm.response.json().status).toBe("active");\n});' },
    { group: "📄 Тело", label: "Тело содержит строку",
      code: 'pm.test("тело содержит слово", () => {\n  expect(pm.response.text()).toContain("success");\n});' },
    // Заголовки
    { group: "📋 Заголовки", label: "Content-Type: application/json",
      code: 'pm.test("Content-Type JSON", () => pm.response.to.have.header("Content-Type"));' },
    // Производительность
    { group: "⚡ Производительность", label: "Ответ < 500 мс",
      code: 'pm.test("отвечает быстро (< 500 мс)", () => {\n  expect(pm.response.responseTime).toBeLessThan(500);\n});' },
    { group: "⚡ Производительность", label: "Ответ < 2000 мс",
      code: 'pm.test("ответ < 2 сек", () => {\n  expect(pm.response.responseTime).toBeLessThan(2000);\n});' },
    // Сохранение данных
    { group: "💾 Сохранить", label: "Сохранить access_token",
      code: 'pm.test("токен получен", () => {\n  const t = pm.response.json().access_token;\n  expect(t).toBeDefined();\n  pm.variables.set("token", t);\n  pm.console.log("token:", t);\n});' },
    { group: "💾 Сохранить", label: "Сохранить refresh_token",
      code: 'const data = pm.response.json();\npm.variables.set("refreshToken", data.refresh_token);' },
    { group: "💾 Сохранить", label: "Сохранить id созданного объекта",
      code: 'const data = pm.response.json();\npm.variables.set("lastId", data.id);\npm.console.log("saved id:", data.id);' },
    { group: "💾 Сохранить", label: "Сохранить поле из списка",
      code: 'const list = pm.response.json();\nif (list.length) pm.variables.set("firstId", list[0].id);' },
    // Отладка
    { group: "🛠 Отладка", label: "Вывести тело ответа",
      code: 'pm.console.log("Response:", pm.response.json());' },
    { group: "🛠 Отладка", label: "Вывести статус и время",
      code: 'pm.console.log("Status:", pm.response.code, "| Time:", pm.response.responseTime + "ms");' },
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
          <button class="script-btn" id="script-run" title="Ctrl+Enter"><i class="bi bi-play-fill"></i> ${App.t("runNow")}</button>
          <button class="script-btn" id="script-clear"><i class="bi bi-trash3"></i> ${App.t("clear")}</button>
          <span class="script-snippets-label">${App.t("snippets")}:</span>
          <select id="script-snippets" class="script-snippets">
            <option value="">${App.t("pickSnippet")}</option>
            ${(() => {
              const groups = [];
              const seen = {};
              snippets.forEach((s, i) => {
                const g = s.group || "";
                if (!seen[g]) { seen[g] = []; groups.push(g); }
                seen[g].push({ s, i });
              });
              return groups.map(g => {
                const opts = seen[g].map(({ s, i }) =>
                  `<option value="${i}">${App.escapeHtml(s.label)}</option>`).join("");
                return g
                  ? `<optgroup label="${App.escapeAttr(g)}">${opts}</optgroup>`
                  : opts;
              }).join("");
            })()}
          </select>
          <span style="flex:1"></span>
          <button class="script-btn" id="script-popout" title="Открыть в отдельном окне" style="margin-left:auto;gap:4px;">
            <i class="bi bi-box-arrow-up-right"></i> Открыть отдельно
          </button>
        </div>

        <textarea id="script-code" class="script-code" spellcheck="false"
                  placeholder="${App.escapeAttr(isPre ? PRE_EXAMPLE : TEST_EXAMPLE)}">${App.escapeHtml(tab[field] || "")}</textarea>

        <div id="script-result" class="script-result" style="display:none;"></div>
      </div>`;

    const ta = document.getElementById("script-code");
    ta.addEventListener("input", (e) => { tab[field] = e.target.value; App.saveSession && App.saveSession(); });
    // Горячие клавиши редактора
    ta.addEventListener("keydown", (e) => {
      // Ctrl+Enter / Cmd+Enter — запустить скрипт
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        _runScriptFromEditor(tab, kind);
        return;
      }
      // Tab — вставить отступ, не переключать фокус
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
      // Вставляем по позиции курсора, не в конец
      const start = ta.selectionStart ?? ta.value.length;
      const end   = ta.selectionEnd   ?? start;
      const before = ta.value.slice(0, start);
      const after  = ta.value.slice(end);
      const prefix = before.trimEnd().length ? "\n\n" : "";
      const suffix = after.trimStart().length ? "\n\n" : "";
      ta.value = before.trimEnd() + prefix + snippet.code + suffix + after.trimStart();
      const cur = before.trimEnd().length + prefix.length + snippet.code.length;
      ta.selectionStart = ta.selectionEnd = cur;
      ta.focus();
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

    // Кнопка «Открыть отдельно»
    document.getElementById("script-popout")?.addEventListener("click", () => {
      if (!window.pywebview?.api?.open_script_editor_window) {
        App.showAlert("Редактор в отдельном окне доступен только в desktop-приложении.");
        return;
      }
      const tabTitle = tab.url ? tab.url.replace(/^https?:\/\//, "").slice(0, 40) : "";
      window.pywebview.api.open_script_editor_window(tab.id, kind, tab[field] || "", tabTitle);
    });

    // Показать результаты последних тестов, если они есть
    if (kind === "tests" && tab.lastTests) _showScriptResult(tab.lastTests);
  }

  // ── Получить обновлённый скрипт из окна редактора ──────────────
  window.receiveScriptFromEditor = function({ tabId, kind, script }) {
    const tab = App.state.tabs.find(t => t.id === tabId);
    if (!tab) return;
    const field = kind === "pre" ? "preScript" : "testScript";
    tab[field] = script;
    // Перерисовать суб-таб только если он сейчас активен
    const activeTab = App.getActiveTab();
    if (activeTab && activeTab.id === tabId &&
        ((kind === "pre" && activeTab.activeSubTab === "pre") ||
         (kind === "tests" && activeTab.activeSubTab === "tests"))) {
      App.renderSubTabContent(tab);
    }
    App.renderTabBar(); // обновить значок ●
  };

  // ── Запустить скрипт из окна редактора и вернуть результат ─────
  window.runScriptFromEditor = function({ tabId, kind, script }) {
    const tab = App.state.tabs.find(t => t.id === tabId);
    const field = kind === "pre" ? "preScript" : "testScript";
    if (tab) tab[field] = script; // синхронизируем перед запуском

    const opts = { source: kind === "pre" ? "pre" : "test", tab: tab || {} };
    if (kind === "tests" && tab?.response?.ok) opts.response = tab.response;
    const res = App.runScript(script, opts);
    if (kind === "tests" && tab) tab.lastTests = res;

    // Возвращаем результат в окно редактора через Python-мост
    const resJson = JSON.stringify(res || []);
    // Найти дочернее окно редактора через api (pywebview не даёт прямого JS-доступа)
    if (window.pywebview?.api?.script_editor_result) {
      window.pywebview.api.script_editor_result(resJson);
    }
  };

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

  // -------- multipart: файлы + текстовые поля формы --------
  function _fmtBytes(n) {
    if (n == null) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function _renderFilesTab(container, tab) {
    if (!Array.isArray(tab.files)) tab.files = [];
    if (!Array.isArray(tab.formFields)) tab.formFields = [];

    // Верхняя карточка: инфа + кнопка добавить
    // Список файлов — компактные карточки с иконкой, полем "имя поля",
    // именем/размером файла и кнопкой удаления.
    const filesListHtml = tab.files.length
      ? tab.files.map((f, i) => `
          <div class="fu-row" data-idx="${i}">
            <i class="bi bi-file-earmark fu-icon"></i>
            <input type="text" class="form-control form-control-sm fu-field"
                   placeholder="${App.t("fieldName")}"
                   value="${App.escapeAttr(f.field || "")}">
            <div class="fu-info" title="${App.escapeAttr(f.path || "")}">
              <div class="fu-name">${App.escapeHtml(f.name || "")}</div>
              <div class="fu-meta">${_fmtBytes(f.size)}</div>
            </div>
            <input type="text" class="form-control form-control-sm fu-ctype"
                   placeholder="${App.t("contentType")} (${App.t("contentTypeAuto")})"
                   title="${App.t("contentType")}"
                   value="${App.escapeAttr(f.content_type || "")}">
            <button class="fu-remove" title="${App.t("removeFile")}">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>`).join("")
      : `<div class="fu-empty">
           <i class="bi bi-cloud-arrow-up"></i>
           <span>${App.t("noFilesYet")}</span>
         </div>`;

    // Текстовые поля формы: kv-таблица, как params/headers.
    const ff = tab.formFields;
    if (ff.length === 0 || _rowFilled(ff[ff.length - 1])) {
      ff.push({ key: "", value: "", enabled: true });
    }
    const fieldsHtml = ff.map((r, i) => {
      const isLast = i === ff.length - 1;
      const empty = isLast && !_rowFilled(r);
      const disabled = r.enabled === false ? "kv-disabled" : "";
      const emptyCls = empty ? "kv-row-empty" : "";
      return `
        <div class="kv-row kv-row-grid ${disabled} ${emptyCls}" data-idx="${i}">
          <input type="checkbox" class="kv-enabled" ${r.enabled !== false ? "checked" : ""}
                 title="${App.t("enableRow")}" ${empty ? 'style="visibility:hidden"' : ""}>
          <input type="text" class="kv-key" placeholder="${App.t("key")}"
                 value="${App.escapeAttr(r.key || "")}">
          <input type="text" class="kv-value" placeholder="${App.t("value")}"
                 value="${App.escapeAttr(r.value || "")}">
          <button class="kv-remove" title="${App.t("removeFile")}"
                  ${empty ? 'style="visibility:hidden"' : ""}>
            <i class="bi bi-trash3"></i>
          </button>
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="fu-wrap">
        <div class="fu-hint">
          <i class="bi bi-info-circle"></i>
          <span>${App.t("filesInfo")}</span>
          <button class="btn btn-sm btn-primary fu-add-btn" id="files-add-btn">
            <i class="bi bi-paperclip"></i> ${App.t("addFile")}
          </button>
        </div>
        <div class="fu-list">${filesListHtml}</div>
        <div class="fu-section-title">${App.t("textFields")}</div>
        <div class="kv-table">
          <div class="kv-head">
            <span class="kv-col-check"></span>
            <span class="kv-col-key">${App.t("key")}</span>
            <span class="kv-col-val">${App.t("value")}</span>
            <span class="kv-col-act"></span>
          </div>
          <div id="ff-rows">${fieldsHtml}</div>
        </div>
      </div>`;

    document.getElementById("files-add-btn").addEventListener("click", async () => {
      const api = window.pywebview && window.pywebview.api;
      if (!api || !api.pick_files) {
        App.showAlert && App.showAlert(App.t("pickFilesFailed"));
        return;
      }
      let res;
      try {
        res = await api.pick_files(true);
      } catch (e) {
        App.showAlert && App.showAlert(App.t("pickFilesFailed") + ": " + e);
        return;
      }
      if (!res || res.cancelled) return;
      if (!res.ok) {
        App.showAlert && App.showAlert(res.error || App.t("pickFilesFailed"));
        return;
      }
      (res.files || []).forEach(f => {
        const n = tab.files.length + 1;
        tab.files.push({
          field: n === 1 ? "file" : "file" + n,
          path: f.path, name: f.name, size: f.size,
        });
      });
      App.renderTabContent();
    });

    container.querySelectorAll(".fu-row").forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelector(".fu-field").addEventListener("input", (e) => {
        tab.files[idx].field = e.target.value;
      });
      row.querySelector(".fu-ctype").addEventListener("input", (e) => {
        tab.files[idx].content_type = e.target.value.trim();
      });
      row.querySelector(".fu-remove").addEventListener("click", () => {
        tab.files.splice(idx, 1);
        App.renderTabContent();
      });
    });

    container.querySelectorAll("#ff-rows .kv-row").forEach((row) => {
      const idx = Number(row.dataset.idx);
      // При заполнении последней строки перерисовываем sub-tab, чтобы снизу
      // появилась новая пустая. Возвращаем курсор туда же — иначе фокус
      // теряется на каждом первом символе.
      const rerenderKeepFocus = (which, e) => {
        if (idx !== tab.formFields.length - 1) return;
        if (!_rowFilled(tab.formFields[idx])) return;
        const pos = e.target.selectionStart;
        App.renderSubTabContent(tab);
        const again = document.querySelectorAll("#ff-rows .kv-row")[idx];
        const inp = again && again.querySelector(which === "key" ? ".kv-key" : ".kv-value");
        if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
      };
      row.querySelector(".kv-enabled").addEventListener("change", (e) => {
        tab.formFields[idx].enabled = e.target.checked;
        row.classList.toggle("kv-disabled", !e.target.checked);
      });
      row.querySelector(".kv-key").addEventListener("input", (e) => {
        tab.formFields[idx].key = e.target.value;
        rerenderKeepFocus("key", e);
      });
      row.querySelector(".kv-value").addEventListener("input", (e) => {
        tab.formFields[idx].value = e.target.value;
        rerenderKeepFocus("value", e);
      });
      row.querySelector(".kv-remove").addEventListener("click", () => {
        tab.formFields.splice(idx, 1);
        App.renderSubTabContent(tab);
      });
    });
  }

  /** Только включённые и непустые строки идут в запрос */
  App.activeRows = function (rows) {
    return (rows || []).filter(r => r.enabled !== false && (r.key || "").trim());
  };

  // ────────────────────────────────────────────────────────────────
  // Кликабельный JSON-ответ: клик по значению (или ключу) копирует
  // его в буфер. Строки копируются БЕЗ кавычек — токен можно сразу
  // вставлять в поле Bearer.
  // ────────────────────────────────────────────────────────────────

  // На гигантских ответах DOM из тысяч спанов тормозит — выше лимита
  // показываем обычный текст.
  const JSON_INTERACTIVE_MAX = 500 * 1024;

  App.copyText = function (text) {
    const s = String(text);
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ничего */ }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).catch(fallback);
    }
    fallback();
    return Promise.resolve();
  };

  function _copyFlash(x, y, el) {
    if (el) {
      el.classList.add("jv-copied");
      setTimeout(() => el.classList.remove("jv-copied"), 600);
    }
    const b = document.createElement("div");
    b.className = "copy-flash";
    b.textContent = App.t ? App.t("copied") : "Скопировано!";
    b.style.left = x + "px";
    b.style.top = (y - 30) + "px";
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 900);
  }

  function _plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function _jsonLeaf(parent, v, path) {
    const span = document.createElement("span");
    if (typeof v === "string") {
      span.className = "jv jv-str";
      span.textContent = JSON.stringify(v);
      span.dataset.copy = v; // строка — без кавычек
    } else if (typeof v === "number") {
      span.className = "jv jv-num";
      span.textContent = String(v);
      span.dataset.copy = String(v);
    } else if (typeof v === "boolean") {
      span.className = "jv jv-bool";
      span.textContent = String(v);
      span.dataset.copy = String(v);
    } else { // null
      span.className = "jv jv-null";
      span.textContent = "null";
      span.dataset.copy = "null";
    }
    if (path) span.dataset.path = path;
    span.title = (App.t ? App.t("copy") : "Копировать") + " · ПКМ — ещё действия";
    parent.appendChild(span);
  }

  /**
   * Сворачиваемый узел (объект или массив).
   * В свёрнутом виде показывает, сколько внутри элементов — иначе по
   * большому ответу непонятно, что прячется за «…».
   */
  function _jsonContainer(parent, v, indent, path) {
    const isArr = Array.isArray(v);
    const keys = isArr ? v.map((_, i) => i) : Object.keys(v);
    const open = isArr ? "[" : "{";
    const close = isArr ? "]" : "}";
    const pad = "  ".repeat(indent);
    const padIn = "  ".repeat(indent + 1);

    if (!keys.length) { parent.append(open + close); return; }

    const node = document.createElement("span");
    node.className = "jnode";

    const toggle = document.createElement("span");
    toggle.className = "jtoggle";
    toggle.textContent = "▾";
    toggle.title = "Свернуть / развернуть";
    node.appendChild(toggle);
    node.append(open);

    const summary = document.createElement("span");
    summary.className = "jsummary";
    summary.textContent = isArr
      ? ` … ${keys.length} ${_plural(keys.length, ["элемент", "элемента", "элементов"])} `
      : ` … ${keys.length} ${_plural(keys.length, ["поле", "поля", "полей"])} `;
    summary.style.display = "none";
    node.appendChild(summary);

    const body = document.createElement("span");
    body.className = "jbody";
    body.append("\n");
    keys.forEach((k, i) => {
      body.append(padIn);
      const childPath = isArr
        ? `${path || ""}[${k}]`
        : (path ? `${path}.${k}` : String(k));
      if (!isArr) {
        const ks = document.createElement("span");
        ks.className = "jv jk";
        ks.textContent = JSON.stringify(k);
        ks.dataset.copy = k;             // клик по ключу — копирует имя ключа
        ks.dataset.path = childPath;
        ks.title = "Копировать имя поля";
        body.appendChild(ks);
        body.append(": ");
      }
      _jsonDom(body, v[k], indent + 1, childPath);
      body.append((i < keys.length - 1 ? "," : "") + "\n");
    });
    body.append(pad);
    node.appendChild(body);
    node.append(close);
    parent.appendChild(node);

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      _setCollapsed(node, body.style.display !== "none");
    });
  }

  function _setCollapsed(node, collapse) {
    const body = node.querySelector(":scope > .jbody");
    const summary = node.querySelector(":scope > .jsummary");
    const toggle = node.querySelector(":scope > .jtoggle");
    if (!body) return;
    body.style.display = collapse ? "none" : "";
    if (summary) summary.style.display = collapse ? "" : "none";
    if (toggle) toggle.textContent = collapse ? "▸" : "▾";
  }

  function _jsonDom(parent, v, indent, path) {
    if (v !== null && typeof v === "object") {
      _jsonContainer(parent, v, indent, path);
      return;
    }
    _jsonLeaf(parent, v, path);
  }

  // ── Контекстное меню значения ────────────────────────────────────

  function _closeJsonMenu() {
    document.querySelectorAll(".json-ctx-menu").forEach(m => m.remove());
  }

  function _openJsonMenu(x, y, target) {
    _closeJsonMenu();
    const value = target.dataset.copy !== undefined ? target.dataset.copy : target.textContent;
    const path  = target.dataset.path || "";

    const items = [
      { icon: "bi-clipboard", label: "Копировать значение",
        on: () => App.copyText(value) },
    ];
    if (path) {
      items.push({ icon: "bi-signpost-split", label: `Копировать путь · ${path}`,
        on: () => App.copyText(path) });
    }
    items.push({ icon: "bi-braces", label: "Сохранить в переменную…",
      on: () => _saveToVariable(value, path) });

    const menu = document.createElement("div");
    menu.className = "json-ctx-menu sb-pos-menu";
    items.forEach(it => {
      const b = document.createElement("button");
      b.className = "sb-pos-item";
      b.innerHTML = `<i class="bi ${it.icon}"></i><span>${App.escapeHtml(it.label)}</span>`;
      b.addEventListener("click", () => { _closeJsonMenu(); it.on(); });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);

    const mw = 260;
    menu.style.cssText = `position:fixed;z-index:10000;width:${mw}px;visibility:hidden;top:0;left:-9999px;`;
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight || 120;
      let top = y, left = Math.min(x, window.innerWidth - mw - 6);
      if (top + mh + 6 > window.innerHeight) top = Math.max(6, y - mh);
      menu.style.cssText = `position:fixed;z-index:10000;width:${mw}px;top:${top}px;left:${left}px;`;
    });

    requestAnimationFrame(() => {
      const off = (ev) => {
        if (!menu.contains(ev.target)) { _closeJsonMenu(); document.removeEventListener("mousedown", off, true); }
      };
      document.addEventListener("mousedown", off, true);
    });
  }

  /** Кладёт значение из ответа в переменную — {{token}} и подобные. */
  async function _saveToVariable(value, path) {
    // Имя по умолчанию — последний сегмент пути: user.email → email
    const guess = (path || "").split(/[.\[\]]+/).filter(Boolean).pop() || "value";
    const name = await App.showPrompt({
      title: "Сохранить в переменную",
      label: "Имя переменной",
      value: guess,
      hint: "Использовать потом как {{" + guess + "}}",
    });
    if (!name) return;
    App.VARIABLES[name] = String(value);
    App.saveCollections && App.saveCollections();
    App.renderCollections && App.renderCollections();
    App.showAlert && App.showAlert(`✓ {{${name}}} = ${String(value).slice(0, 40)}${String(value).length > 40 ? "…" : ""}`);
  }

  // ── Поиск по ответу (Ctrl+F) ─────────────────────────────────────

  let _searchHits = [];
  let _searchIdx = -1;

  function _clearSearch(root) {
    root.querySelectorAll("mark.jhit").forEach(m => {
      const t = document.createTextNode(m.textContent);
      m.replaceWith(t);
    });
    root.normalize();
    _searchHits = [];
    _searchIdx = -1;
  }

  function _runSearch(root, query) {
    _clearSearch(root);
    if (!query) return 0;
    const q = query.toLowerCase();

    // Собираем текстовые узлы заранее: правка DOM во время обхода
    // ломает TreeWalker.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);

    nodes.forEach(node => {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      if (!lower.includes(q)) return;
      const frag = document.createDocumentFragment();
      let pos = 0, i;
      while ((i = lower.indexOf(q, pos)) !== -1) {
        if (i > pos) frag.append(text.slice(pos, i));
        const mark = document.createElement("mark");
        mark.className = "jhit";
        mark.textContent = text.slice(i, i + q.length);
        frag.appendChild(mark);
        pos = i + q.length;
      }
      if (pos < text.length) frag.append(text.slice(pos));
      node.replaceWith(frag);
    });

    _searchHits = Array.from(root.querySelectorAll("mark.jhit"));
    // Совпадение может лежать в свёрнутом узле — раскрываем предков
    _searchHits.forEach(h => {
      let p = h.parentElement;
      while (p && p !== root) {
        if (p.classList.contains("jbody") && p.style.display === "none") {
          _setCollapsed(p.parentElement, false);
        }
        p = p.parentElement;
      }
    });
    if (_searchHits.length) _gotoHit(0);
    return _searchHits.length;
  }

  function _gotoHit(i) {
    if (!_searchHits.length) return;
    _searchHits.forEach(h => h.classList.remove("jhit-active"));
    _searchIdx = (i + _searchHits.length) % _searchHits.length;
    const el = _searchHits[_searchIdx];
    el.classList.add("jhit-active");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** Панель поиска над телом ответа. */
  function _buildSearchBar(bodyEl) {
    const bar = document.createElement("div");
    bar.className = "resp-search";
    bar.innerHTML = `
      <i class="bi bi-search"></i>
      <input type="text" class="resp-search-input" placeholder="Поиск в ответе…">
      <span class="resp-search-count">0/0</span>
      <button class="resp-search-btn" data-nav="prev" title="Предыдущее (Shift+Enter)">‹</button>
      <button class="resp-search-btn" data-nav="next" title="Следующее (Enter)">›</button>
      <button class="resp-search-btn" data-nav="close" title="Закрыть (Esc)">✕</button>`;

    const input = bar.querySelector(".resp-search-input");
    const count = bar.querySelector(".resp-search-count");

    const update = () => {
      const total = _runSearch(bodyEl, input.value);
      count.textContent = `${total ? _searchIdx + 1 : 0}/${total}`;
      bar.classList.toggle("resp-search-empty", !!input.value && !total);
    };

    let debounce = null;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(update, 150);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        _gotoHit(_searchIdx + (e.shiftKey ? -1 : 1));
        count.textContent = `${_searchHits.length ? _searchIdx + 1 : 0}/${_searchHits.length}`;
      } else if (e.key === "Escape") {
        e.preventDefault();
        App.closeResponseSearch();
      }
    });
    bar.querySelector('[data-nav="prev"]').addEventListener("click", () => {
      _gotoHit(_searchIdx - 1);
      count.textContent = `${_searchHits.length ? _searchIdx + 1 : 0}/${_searchHits.length}`;
    });
    bar.querySelector('[data-nav="next"]').addEventListener("click", () => {
      _gotoHit(_searchIdx + 1);
      count.textContent = `${_searchHits.length ? _searchIdx + 1 : 0}/${_searchHits.length}`;
    });
    bar.querySelector('[data-nav="close"]').addEventListener("click", () => App.closeResponseSearch());

    return bar;
  }

  App.toggleResponseSearch = function () {
    const panel = document.querySelector(".response-panel");
    const bodyEl = document.getElementById("response-body");
    if (!panel || !bodyEl) return;

    const existing = panel.querySelector(".resp-search");
    if (existing) {
      existing.querySelector(".resp-search-input").focus();
      existing.querySelector(".resp-search-input").select();
      return;
    }
    const bar = _buildSearchBar(bodyEl);
    panel.insertBefore(bar, bodyEl);
    bar.querySelector(".resp-search-input").focus();
  };

  App.closeResponseSearch = function () {
    const bodyEl = document.getElementById("response-body");
    if (bodyEl) _clearSearch(bodyEl);
    document.querySelectorAll(".resp-search").forEach(b => b.remove());
  };

  App.renderCopyableJson = function (parsed) {
    const pre = document.createElement("pre");
    pre.className = "response-pre json-clickable";
    _jsonDom(pre, parsed, 0, "");

    // Обычное выделение мышкой должно работать как везде: выделил
    // несколько полей → Ctrl+C (или правая кнопка → Копировать).
    // Поэтому клик-копирование срабатывает ТОЛЬКО если это был именно
    // клик, а не протяжка, и в документе нет выделенного текста.
    let downX = 0, downY = 0;
    pre.addEventListener("mousedown", (e) => { downX = e.clientX; downY = e.clientY; });

    pre.addEventListener("click", (e) => {
      if (e.target.closest(".jtoggle")) return;           // это сворачивание
      const sel = window.getSelection();
      if (sel && String(sel).trim().length > 0) return;   // идёт выделение — не мешаем
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return; // протяжка
      const t = e.target.closest(".jv");
      if (!t) return;
      App.copyText(t.dataset.copy !== undefined ? t.dataset.copy : t.textContent);
      _copyFlash(e.clientX, e.clientY, t);
    });

    // Двойной клик по значению выделяет его целиком — чтобы работал
    // привычный Ctrl+C. Иначе браузер рвёт JWT по точкам и дефисам.
    pre.addEventListener("dblclick", (e) => {
      const t = e.target.closest(".jv");
      if (!t) return;
      const range = document.createRange();
      range.selectNodeContents(t);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // ПКМ — копировать значение / путь / сохранить в переменную
    pre.addEventListener("contextmenu", (e) => {
      const t = e.target.closest(".jv");
      if (!t) return;
      e.preventDefault();
      _openJsonMenu(e.clientX, e.clientY, t);
    });

    return pre;
  };

  /** Какой заголовок/параметр авторизации реально ушёл в последнем запросе. */
  function _authHeaderSent(tab) {
    const sentH = (tab.lastSent && tab.lastSent.headers) || {};
    const sentP = (tab.lastSent && tab.lastSent.params) || {};
    const short = (v) => {
      v = String(v || "");
      return v.length > 28 ? v.slice(0, 18) + "…" : v;
    };
    const authKey = Object.keys(sentH).find(k => k.toLowerCase() === "authorization");
    if (authKey) return `${authKey}: ${short(sentH[authKey])}`;

    // API Key мог уйти произвольным заголовком или query-параметром
    const eff = App.resolveEffectiveAuth && App.resolveEffectiveAuth(tab);
    const ak = eff && eff.auth && eff.auth.type === "apikey" && eff.auth.apikey;
    if (ak && ak.key) {
      if (sentH[ak.key] !== undefined) return `${ak.key}: ${short(sentH[ak.key])}`;
      if (sentP[ak.key] !== undefined) return `?${ak.key}=${short(sentP[ak.key])}`;
    }
    return null;
  }

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

    // 401/403 чаще всего означают не «неверный токен», а «токен вообще не
    // ушёл»: в поле стоит {{token}}, а переменная пустая. По ответу сервера
    // это неотличимо, поэтому объясняем прямо здесь.
    if ((code === 401 || code === 403) && App.authDiagnose) {
      const problem = App.authDiagnose(tab);
      const box = document.createElement("div");
      box.className = "auth-warn-box";

      if (problem) {
        box.innerHTML = `
          <div class="auth-warn-title"><i class="bi bi-shield-exclamation"></i> ${App.escapeHtml(problem.title)}</div>
          <div class="auth-warn-hint">${App.escapeHtml(problem.hint)}</div>`;
        bodyEl.appendChild(box);
      } else {
        // Заголовок авторизации ушёл, но сервер его не принял. Показываем,
        // ЧТО именно было отправлено: чаще всего оказывается, что выбран
        // не тот тип (например API Key вместо Bearer) и уходит заголовок,
        // о котором сервер ничего не знает.
        const sent = _authHeaderSent(tab);
        if (sent) {
          box.innerHTML = `
            <div class="auth-warn-title"><i class="bi bi-shield-exclamation"></i> Сервер не принял отправленную авторизацию</div>
            <div class="auth-warn-hint">Ушёл заголовок <code>${App.escapeHtml(sent)}</code>.
              Если сервер ждёт другой — поменяйте тип во вкладке Auth
              (для JWT это <code>Authorization: Bearer &lt;token&gt;</code>).</div>`;
          bodyEl.appendChild(box);
        }
      }
    }

    if (tab.responseViewMode === "table" && entities) {
      bodyEl.appendChild(App.renderEntityTable(entities, tab));
    } else if (tab.responseViewMode === "headers") {
      // Заголовки — тот же кликабельный рендер, что и тело:
      // клик копирует одно значение, выделение мышкой работает как обычно.
      bodyEl.appendChild(App.renderCopyableJson(tab.response.headers || {}));
    } else {
      let responseText = tab.response.text || "";

      // HTML-страница вместо API-ответа — почти всегда значит, что запрос
      // ушёл не туда (не тот порт/путь). Простыня HTML это скрывает,
      // поэтому показываем краткую суть, а сырой HTML прячем под спойлер.
      const htmlInfo = _sniffHtmlError(responseText, tab.response);
      if (htmlInfo) {
        const box = document.createElement("div");
        box.className = "resp-html-hint";
        box.innerHTML = `
          <div class="rhh-title"><i class="bi bi-exclamation-triangle"></i> ${App.escapeHtml(htmlInfo.title)}</div>
          <div class="rhh-desc">${App.escapeHtml(htmlInfo.hint)}</div>
          <button class="rhh-toggle" type="button">
            <i class="bi bi-chevron-down"></i> ${App.t("showRawHtml") || "Показать HTML-ответ"}
          </button>
          <pre class="response-pre rhh-raw" style="display:none;margin-top:8px;"></pre>`;
        const raw = box.querySelector(".rhh-raw");
        raw.textContent = responseText.length > App.LIMITS.MAX_RESPONSE_DISPLAY
          ? responseText.substring(0, App.LIMITS.MAX_RESPONSE_DISPLAY) + "\n\n... [обрезано]"
          : responseText;
        const btn = box.querySelector(".rhh-toggle");
        btn.addEventListener("click", () => {
          const open = raw.style.display !== "none";
          raw.style.display = open ? "none" : "";
          btn.innerHTML = `<i class="bi bi-chevron-${open ? "down" : "up"}"></i> ` +
            (open ? (App.t("showRawHtml") || "Показать HTML-ответ")
                  : (App.t("hideRawHtml") || "Скрыть HTML-ответ"));
        });
        bodyEl.appendChild(box);
        return;
      }

      if (responseText.length > App.LIMITS.MAX_RESPONSE_DISPLAY) {
        const pre = document.createElement("pre");
        pre.className = "response-pre";
        responseText = responseText.substring(0, App.LIMITS.MAX_RESPONSE_DISPLAY);
        pre.textContent = App.formatJson(responseText) + "\n\n... [обрезано: ответ больше " + (App.LIMITS.MAX_RESPONSE_DISPLAY / 1000000).toFixed(0) + " МБ]";
        bodyEl.appendChild(pre);
      } else {
        // Валидный JSON рендерим кликабельным: клик по значению копирует его
        const parsed = responseText.length <= JSON_INTERACTIVE_MAX
          ? App.tryParseJson(responseText)
          : null;
        if (parsed !== null && typeof parsed === "object") {
          bodyEl.appendChild(App.renderCopyableJson(parsed));
        } else {
          const pre = document.createElement("pre");
          pre.className = "response-pre";
          pre.textContent = App.formatJson(responseText);
          bodyEl.appendChild(pre);
        }
      }
    }
  };

  /**
   * Ответ — HTML-страница, а не API-данные? Достаём <title> и объясняем,
   * что скорее всего пошло не так. null — если это нормальный ответ.
   */
  function _sniffHtmlError(text, response) {
    const s = (text || "").trimStart();
    if (!/^<(!doctype|html)/i.test(s)) return null;

    const code = response.status_code;
    const m = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = m ? m[1].replace(/\s+/g, " ").trim() : "";

    let hint;
    if (code === 404) {
      hint = "Сервер ответил HTML-страницей 404 — такого пути на нём нет. " +
             "Проверьте порт и путь в URL: обычно это не тот сервер " +
             "(например, фронтенд вместо API) или опечатка в эндпоинте.";
    } else if (code >= 500) {
      hint = "Сервер вернул HTML-страницу с ошибкой. Подробности — в HTML ниже " +
             "или в логах самого сервера.";
    } else if (code === 401 || code === 403) {
      hint = "Сервер вернул HTML-страницу входа вместо данных. " +
             "Скорее всего не передан токен или он истёк.";
    } else {
      hint = "Сервер вернул HTML вместо JSON. Убедитесь, что URL указывает " +
             "на API-эндпоинт, а не на веб-страницу.";
    }
    return { title: title || `HTML-ответ (${code})`, hint };
  }

  // Drag & drop файлов из ОС. Пути приходят из pywebview
  // (main.py → window.evaluate_js), потому что в JS у File.path нет
  // (браузерная безопасность). Здесь только UX и роутинг:
  // добавляем в активную вкладку, если открыта под-вкладка Files.
  window.addEventListener("pywebview:files-dropped", (e) => {
    const infos = e.detail || [];
    if (!infos.length) return;
    const tab = App.getActiveTab && App.getActiveTab();
    if (!tab) return;
    // Multipart имеет смысл только для методов с телом. Иначе просто
    // подсказываем пользователю переключить метод.
    if (!["POST", "PUT", "PATCH"].includes(tab.method)) {
      App.showAlert && App.showAlert("Drag&drop файлов работает для POST/PUT/PATCH");
      return;
    }
    if (!Array.isArray(tab.files)) tab.files = [];
    infos.forEach(f => {
      const n = tab.files.length + 1;
      tab.files.push({
        field: n === 1 ? "file" : "file" + n,
        path: f.path, name: f.name, size: f.size,
      });
    });
    // Открыть под-вкладку Files, чтобы пользователь сразу увидел результат.
    tab.activeSubTab = "files";
    App.renderTabContent();
  });

  // Подсветка drop-зоны, пока пользователь тащит файл над окном.
  // Сам drop-эвент не даёт нам путей — работает только для визуала.
  let _dragCounter = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
    _dragCounter++;
    document.body.classList.add("fu-dragging");
  });
  window.addEventListener("dragleave", () => {
    _dragCounter = Math.max(0, _dragCounter - 1);
    if (_dragCounter === 0) document.body.classList.remove("fu-dragging");
  });
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
      e.preventDefault();
    }
  });
  window.addEventListener("drop", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
      e.preventDefault();
    }
    _dragCounter = 0;
    document.body.classList.remove("fu-dragging");
  });
})();