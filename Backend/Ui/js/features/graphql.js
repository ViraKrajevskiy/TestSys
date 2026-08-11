/**
 * graphql.js — GraphQL-режим запроса
 *
 * Когда tab.graphql === true, вместо обычного body показываем:
 * - Query editor (textarea)
 * - Variables editor (textarea, JSON)
 * - Отправка POST с body: { query, variables }
 *
 * Автодетект: если URL содержит "graphql", предлагаем включить режим.
 */
window.App = window.App || {};

(function () {

  /** Проверяем, похож ли URL на GraphQL-эндпоинт */
  App.isGraphqlUrl = function (url) {
    return /graphql/i.test(url || "");
  };

  /** Рендерим GraphQL-панель вместо body sub-tab */
  App.renderGraphqlPanel = function (container, tab) {
    const query = tab.gqlQuery || "";
    const vars  = tab.gqlVariables || "";

    container.innerHTML = `
      <div class="gql-panel" style="display:flex;flex-direction:column;gap:8px;">
        <div class="gql-section">
          <div class="gql-label">
            <span style="font-weight:600;">Query</span>
            <button id="gql-prettify" class="btn btn-sm" style="font-size:10px;padding:1px 8px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-dim);border-radius:var(--radius);">Prettify</button>
          </div>
          <textarea id="gql-query" class="gql-editor" placeholder="query {
  users {
    id
    name
    email
  }
}" spellcheck="false">${App.escapeHtml(query)}</textarea>
        </div>
        <div class="gql-section">
          <div class="gql-label"><span style="font-weight:600;">Variables</span> <span style="color:var(--text-dim);font-size:11px;">(JSON)</span></div>
          <textarea id="gql-variables" class="gql-editor gql-vars-editor" placeholder='{ "id": 1 }' spellcheck="false">${App.escapeHtml(vars)}</textarea>
        </div>
      </div>`;

    const queryEl = container.querySelector("#gql-query");
    const varsEl  = container.querySelector("#gql-variables");

    queryEl.addEventListener("input", () => { tab.gqlQuery = queryEl.value; _syncBody(tab); });
    varsEl.addEventListener("input", () => { tab.gqlVariables = varsEl.value; _syncBody(tab); });

    // Tab key inserts spaces in query
    queryEl.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = queryEl.selectionStart;
        queryEl.value = queryEl.value.substring(0, s) + "  " + queryEl.value.substring(queryEl.selectionEnd);
        queryEl.selectionStart = queryEl.selectionEnd = s + 2;
        tab.gqlQuery = queryEl.value;
        _syncBody(tab);
      }
    });

    // Prettify button
    container.querySelector("#gql-prettify")?.addEventListener("click", () => {
      queryEl.value = _prettifyGql(queryEl.value);
      tab.gqlQuery = queryEl.value;
      _syncBody(tab);
      // Also prettify vars
      try {
        const parsed = JSON.parse(varsEl.value);
        varsEl.value = JSON.stringify(parsed, null, 2);
        tab.gqlVariables = varsEl.value;
      } catch {}
    });

    // Initial sync
    _syncBody(tab);
  };

  /** Синхронизируем tab.body с GraphQL query+variables */
  function _syncBody(tab) {
    const body = { query: tab.gqlQuery || "" };
    if (tab.gqlVariables && tab.gqlVariables.trim()) {
      try {
        body.variables = JSON.parse(tab.gqlVariables);
      } catch {
        body.variables = tab.gqlVariables;
      }
    }
    tab.body = JSON.stringify(body, null, 2);
    // Force POST + Content-Type
    if (tab.method !== "POST") {
      tab.method = "POST";
    }
    // Ensure Content-Type header
    tab.headers = tab.headers || [];
    const ctHeader = tab.headers.find(h => (h.key || "").toLowerCase() === "content-type");
    if (!ctHeader) {
      tab.headers.push({ key: "Content-Type", value: "application/json", enabled: true });
    } else if (ctHeader.value !== "application/json") {
      ctHeader.value = "application/json";
    }
  }

  /** Simple GQL prettifier — basic indentation */
  function _prettifyGql(q) {
    if (!q || !q.trim()) return q;
    // Normalize whitespace
    let s = q.replace(/\r\n/g, "\n").trim();
    // Re-indent based on braces
    const lines = s.split("\n").map(l => l.trim()).filter(l => l);
    let indent = 0;
    const result = [];
    for (const line of lines) {
      // Closing brace at start
      const closingFirst = /^\}/.test(line);
      if (closingFirst) indent = Math.max(0, indent - 1);

      result.push("  ".repeat(indent) + line);

      const opens  = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      indent += opens - closes;
      if (closingFirst) indent += 0; // already decremented
      indent = Math.max(0, indent);
    }
    return result.join("\n");
  }

  /** Toggle GraphQL mode on/off */
  App.toggleGraphql = function (tab) {
    if (!tab) return;
    tab.graphql = !tab.graphql;
    if (tab.graphql) {
      tab.activeSubTab = "body";
      // Parse existing body if it looks like GraphQL
      if (tab.body) {
        try {
          const parsed = JSON.parse(tab.body);
          if (parsed.query) {
            tab.gqlQuery = parsed.query;
            tab.gqlVariables = parsed.variables ? JSON.stringify(parsed.variables, null, 2) : "";
          }
        } catch {}
      }
    }
    App.renderTabContent();
  };

})();
