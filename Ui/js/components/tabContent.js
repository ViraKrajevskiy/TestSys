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

    root.innerHTML = `
      <div class="request-line">
        <select class="form-select method-select method-${tab.method}" id="method-select"></select>
        <input type="text" class="form-control url-input" id="url-input"
               placeholder="https://api.example.com/endpoint" value="${App.escapeAttr(tab.url)}">
        <button class="btn send-btn" id="send-btn" ${tab.sending ? "disabled" : ""}>
          ${tab.sending ? "..." : "Send"}
        </button>
      </div>
      <ul class="nav sub-nav mb-3">
        <li class="nav-item"><button class="nav-link ${sub("params")}" data-sub="params">Params</button></li>
        <li class="nav-item"><button class="nav-link ${sub("headers")}" data-sub="headers">Headers</button></li>
        <li class="nav-item"><button class="nav-link ${sub("body")}" data-sub="body">Body</button></li>
      </ul>
      <div id="sub-tab-content"></div>
      <div class="response-panel">
        <div id="response-status" class="response-status text-secondary">
          <span class="status-dot" style="background:var(--text-dim)"></span> Status: —
        </div>
        <pre class="response-pre" id="response-pre">Нажмите Send</pre>
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
      methodSelect.className = 'form-select method-select method-' + tab.method;
      App.renderTabBar();
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

    App.renderSubTabContent(tab);
    App.renderResponse(tab);
  };

  App.renderSubTabContent = function (tab) {
    const container = document.getElementById("sub-tab-content");
    if (tab.activeSubTab === "body") {
      container.innerHTML = '<textarea class="form-control body-textarea" id="body-textarea" rows="10" placeholder=\'{"key": "value"}\'>' + App.escapeHtml(tab.body) + '</textarea>';
      document.getElementById("body-textarea").addEventListener("input", (e) => { tab.body = e.target.value; });
      return;
    }

    const listKey = tab.activeSubTab;
    const rows = tab[listKey];
    container.innerHTML = '<div id="kv-rows"></div><button class="btn btn-sm btn-outline-secondary" id="add-kv-row"><i class="bi bi-plus-lg"></i> Add ' + (listKey === "params" ? "param" : "header") + '</button>';

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
    const preEl = document.getElementById("response-pre");
    if (!tab.response) {
      statusEl.className = "response-status text-secondary";
      statusEl.innerHTML = '<span class="status-dot" style="background:var(--text-dim)"></span> Status: —';
      preEl.textContent = "Нажмите Send";
      return;
    }
    if (!tab.response.ok) {
      statusEl.className = "response-status status-err";
      statusEl.innerHTML = '<span class="status-dot"></span> Error';
      preEl.textContent = "Request failed:\n" + tab.response.error;
      return;
    }
    const cls = App.statusClass(tab.response.status_code);
    statusEl.className = "response-status " + cls;
    statusEl.innerHTML = '<span class="status-dot"></span> Status: ' + tab.response.status_code + ' ' + tab.response.reason + '  |  ' + tab.response.elapsed_ms + ' ms';
    let formatted = tab.response.text;
    try {
      formatted = JSON.stringify(JSON.parse(tab.response.text), null, 2);
    } catch {}
    preEl.textContent = formatted;
  };
})();
