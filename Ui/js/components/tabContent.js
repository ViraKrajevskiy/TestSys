window.App = window.App || {};

(function () {
  App.renderTabContent = function () {
    const root = document.getElementById("tab-content");
    const tab = App.getActiveTab();

    if (!tab) {
      root.innerHTML = '<div class="text-secondary p-4">Нет открытых вкладок</div>';
      return;
    }

    const sub = (name) => tab.activeSubTab === name ? "active" : "";
    const hasBodyMethod = ["POST", "PUT", "PATCH"].includes(tab.method);

    root.innerHTML = `
      <div class="request-line">
        <select class="form-select method-select method-${tab.method}" id="method-select"></select>
        <input type="text" class="form-control url-input" id="url-input"
               placeholder="https://api.example.com/endpoint" value="${App.escapeAttr(tab.url)}">
        <button class="btn send-btn" id="send-btn" ${tab.sending ? "disabled" : ""}>
          ${tab.sending ? '<span class="spinner-border spinner-border-sm"></span>' : "Send"}
        </button>
      </div>
      <ul class="nav sub-nav mb-3">
        <li class="nav-item"><button class="nav-link ${sub("params")}" data-sub="params">Params</button></li>
        <li class="nav-item"><button class="nav-link ${sub("headers")}" data-sub="headers">Headers</button></li>
        ${hasBodyMethod ? '<li class="nav-item"><button class="nav-link ' + sub("body") + '" data-sub="body">Body</button></li>' : ""}
      </ul>
      <div id="sub-tab-content"></div>
      <div class="response-panel">
        <div class="response-panel-header">
          <div id="response-status" class="response-status text-secondary">
            <span class="status-dot" style="background:var(--text-dim)"></span> Status: —
          </div>
          <ul class="nav response-view-nav" id="response-view-nav"></ul>
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
    urlInput.addEventListener("input", (e) => { tab.url = e.target.value; });
    urlInput.addEventListener("change", () => App.renderTabBar());
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") App.sendRequest(tab.id);
    });

    document.getElementById("send-btn").addEventListener("click", () => App.sendRequest(tab.id));

    root.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab.activeSubTab = btn.dataset.sub;
        App.renderTabContent();
      });
    });

    if (!hasBodyMethod && tab.activeSubTab === "body") {
      tab.activeSubTab = "params";
    }

    App.renderSubTabContent(tab);
    App.renderResponse(tab);
  };

  App.renderSubTabContent = function (tab) {
    const container = document.getElementById("sub-tab-content");
    if (tab.activeSubTab === "body") {
      container.innerHTML =
        '<div class="body-editor-wrap">' +
        '<div class="body-editor-toolbar">' +
        '<span class="text-secondary">JSON Body</span>' +
        (tab.crudEntity === "user"
          ? '<button class="btn btn-sm btn-outline-secondary" id="body-form-btn"><i class="bi bi-ui-checks"></i> Form</button>'
          : "") +
        "</div>" +
        '<textarea class="form-control body-textarea" id="body-textarea" rows="10" placeholder=\'{"key": "value"}\'>' +
        App.escapeHtml(tab.body) +
        "</textarea></div>";

      document.getElementById("body-textarea").addEventListener("input", (e) => { tab.body = e.target.value; });

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

    const listKey = tab.activeSubTab;
    const rows = tab[listKey];
    container.innerHTML =
      '<div id="kv-rows"></div>' +
      '<button class="btn btn-sm btn-outline-secondary" id="add-kv-row">' +
      '<i class="bi bi-plus-lg"></i> Add ' + (listKey === "params" ? "param" : "header") +
      "</button>";

    const rowsContainer = container.querySelector("#kv-rows");
    const template = document.getElementById("kv-row-template");
    rows.forEach((row, idx) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const keyInput = node.querySelector(".kv-key");
      const valInput = node.querySelector(".kv-value");
      keyInput.value = row.key;
      valInput.value = row.value;
      keyInput.addEventListener("input", (e) => (rows[idx].key = e.target.value));
      valInput.addEventListener("input", (e) => (rows[idx].value = e.target.value));
      node.querySelector(".kv-remove").addEventListener("click", () => {
        rows.splice(idx, 1);
        App.renderSubTabContent(tab);
      });
      rowsContainer.appendChild(node);
    });

    container.querySelector("#add-kv-row").addEventListener("click", () => {
      rows.push({ key: "", value: "" });
      App.renderSubTabContent(tab);
    });
  };

  App.renderResponse = function (tab) {
    const statusEl = document.getElementById("response-status");
    const bodyEl = document.getElementById("response-body");
    const navEl = document.getElementById("response-view-nav");

    if (!tab.response) {
      statusEl.className = "response-status text-secondary";
      statusEl.innerHTML = '<span class="status-dot" style="background:var(--text-dim)"></span> Status: —';
      navEl.innerHTML = "";
      bodyEl.innerHTML = '<pre class="response-pre">Нажмите Send</pre>';
      return;
    }

    if (!tab.response.ok) {
      statusEl.className = "response-status status-err";
      statusEl.innerHTML = '<span class="status-dot"></span> Error';
      navEl.innerHTML = "";
      bodyEl.innerHTML = '<pre class="response-pre">Request failed:\n' + App.escapeHtml(tab.response.error) + "</pre>";
      return;
    }

    const cls = App.statusClass(tab.response.status_code);
    statusEl.className = "response-status " + cls;
    statusEl.innerHTML =
      '<span class="status-dot"></span> Status: ' + tab.response.status_code + " " + tab.response.reason +
      "  |  " + tab.response.elapsed_ms + " ms";

    const entities = App.getResponseEntities(tab);
    const views = [{ id: "body", label: "Body" }];
    if (entities) views.push({ id: "table", label: "Table" });
    views.push({ id: "headers", label: "Headers" });

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
      pre.textContent = App.formatJson(tab.response.text);
      bodyEl.appendChild(pre);
    }
  };
})();
