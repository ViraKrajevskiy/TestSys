window.App = window.App || {};

(function () {
  let pendingDelete = null;

  App.getResponseEntities = function (tab) {
    if (!tab.response || !tab.response.ok) return null;
    const data = App.tryParseJson(tab.response.text);
    if (data === null) return null;
    if (Array.isArray(data)) return data.length ? data : null;
    if (typeof data === "object" && data !== null && "id" in data) return [data];
    return null;
  };

  App.getEntityBaseUrl = function (tab) {
    if (tab.crudEntity === "user") {
      return App.resolveVariables("{{baseUrl}}/users");
    }
    try {
      const u = new URL(tab.url);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 1) {
        parts.pop();
        return u.origin + (parts.length ? "/" + parts.join("/") : "");
      }
      return u.origin + u.pathname.replace(/\/[^/]+$/, "");
    } catch {
      return App.resolveVariables("{{baseUrl}}/users");
    }
  };

  App.openEntityModal = function (mode, entity, baseUrl, sourceTabId) {
    const modal = document.getElementById("entity-modal");
    const title = document.getElementById("entity-modal-title");
    const fieldsRoot = document.getElementById("entity-form-fields");
    const saveBtn = document.getElementById("entity-save-btn");

    title.textContent = mode === "create" ? "Create User" : "Edit User";
    saveBtn.textContent = mode === "create" ? "Create" : "Update";

    fieldsRoot.innerHTML = "";
    App.USER_FIELDS.forEach((field) => {
      const group = document.createElement("div");
      group.className = "mb-3";
      group.innerHTML =
        '<label class="form-label">' + field.label + (field.required ? " *" : "") + "</label>" +
        '<input type="' + (field.type || "text") + '" class="form-control entity-field" data-field="' +
        field.key +
        '" value="' +
        App.escapeAttr(entity ? entity[field.key] || "" : "") +
        '">';
      fieldsRoot.appendChild(group);
    });

    modal.dataset.mode = mode;
    modal.dataset.entityId = entity ? String(entity.id) : "";
    modal.dataset.baseUrl = baseUrl;
    modal.dataset.sourceTabId = sourceTabId || "";

    bootstrap.Modal.getOrCreateInstance(modal).show();
  };

  App.collectEntityFormData = function () {
    const data = {};
    document.querySelectorAll("#entity-form-fields .entity-field").forEach((input) => {
      const val = input.value.trim();
      if (val) data[input.dataset.field] = val;
    });
    return data;
  };

  App.handleEntitySave = function () {
    const modal = document.getElementById("entity-modal");
    const mode = modal.dataset.mode;
    const baseUrl = modal.dataset.baseUrl;
    const entityId = modal.dataset.entityId;
    const sourceTabId = modal.dataset.sourceTabId;
    const body = JSON.stringify(App.collectEntityFormData(), null, 2);

    bootstrap.Modal.getInstance(modal).hide();

    if (sourceTabId) {
      const tab = App.state.tabs.find((t) => t.id === parseInt(sourceTabId, 10));
      if (tab) {
        tab.body = body;
        App.renderTabContent();
        return;
      }
    }

    if (mode === "create") {
      App.addTab({
        method: "POST",
        url: baseUrl,
        body,
        headers: [{ key: "Content-Type", value: "application/json" }],
        activeSubTab: "body",
        crudEntity: "user",
        crudAction: "create",
      });
      return;
    }

    App.addTab({
      method: "PUT",
      url: baseUrl + "/" + entityId,
      body,
      headers: [{ key: "Content-Type", value: "application/json" }],
      activeSubTab: "body",
      crudEntity: "user",
      crudAction: "update",
    });
  };

  App.confirmDeleteEntity = function (entity, baseUrl) {
    pendingDelete = { entity, baseUrl };
    document.getElementById("delete-confirm-text").textContent =
      'Delete user "' + (entity.name || entity.id) + '" (ID: ' + entity.id + ")?";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("delete-modal")).show();
  };

  App.handleDeleteConfirm = function () {
    if (!pendingDelete) return;
    const { entity, baseUrl } = pendingDelete;
    pendingDelete = null;
    bootstrap.Modal.getInstance(document.getElementById("delete-modal")).hide();

    App.addTab({
      method: "DELETE",
      url: baseUrl + "/" + entity.id,
      headers: [{ key: "Content-Type", value: "application/json" }],
      crudEntity: "user",
      crudAction: "delete",
    });
  };

  App.renderEntityTable = function (entities, tab) {
    const baseUrl = App.getEntityBaseUrl(tab);
    const cols = ["id", "name", "username", "email", "phone"];

    let html = '<div class="crud-table-toolbar">';
    html += '<span class="text-secondary">' + entities.length + " record(s)</span>";
    html += '<button class="btn btn-sm send-btn" id="crud-create-btn"><i class="bi bi-plus-lg"></i> Create</button>';
    html += "</div>";
    html += '<div class="table-responsive"><table class="table table-sm crud-table"><thead><tr>';
    cols.forEach((c) => { html += "<th>" + c + "</th>"; });
    html += "<th class=\"crud-actions-col\">Actions</th></tr></thead><tbody>";

    entities.forEach((entity) => {
      html += "<tr>";
      cols.forEach((c) => {
        html += "<td>" + App.escapeHtml(entity[c] != null ? String(entity[c]) : "—") + "</td>";
      });
      html += '<td class="crud-actions-col">' +
        '<button class="btn btn-sm btn-outline-primary crud-edit-btn" data-id="' + entity.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ' +
        '<button class="btn btn-sm btn-outline-danger crud-delete-btn" data-id="' + entity.id + '" title="Delete"><i class="bi bi-trash3"></i></button>' +
        "</td></tr>";
    });

    html += "</tbody></table></div>";

    const container = document.createElement("div");
    container.innerHTML = html;
    container.className = "crud-table-wrap";

    const entityMap = {};
    entities.forEach((e) => { entityMap[e.id] = e; });

    container.querySelector("#crud-create-btn").addEventListener("click", () => {
      App.openEntityModal("create", null, baseUrl);
    });

    container.querySelectorAll(".crud-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entity = entityMap[btn.dataset.id];
        if (entity) App.openEntityModal("edit", entity, baseUrl);
      });
    });

    container.querySelectorAll(".crud-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entity = entityMap[btn.dataset.id];
        if (entity) App.confirmDeleteEntity(entity, baseUrl);
      });
    });

    return container;
  };

  App.initCrud = function () {
    document.getElementById("entity-save-btn").addEventListener("click", App.handleEntitySave);
    document.getElementById("delete-confirm-btn").addEventListener("click", App.handleDeleteConfirm);
  };
})();
