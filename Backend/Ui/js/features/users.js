window.App = window.App || {};

(function () {
  const USERS_TAB_METHOD = "USERS";

  function findUsersTab() {
    return App.state.tabs.find((t) => t.method === USERS_TAB_METHOD) || null;
  }

  App.openUsersTab = function () {
    const existing = findUsersTab();
    if (existing) {
      App.selectTab(existing.id);
      return;
    }
    App.addTab({
      method: USERS_TAB_METHOD,
      url: "",
      title: "👥 Users",
      crudEntity: "user",
      crudAction: "list",
      activeSubTab: "params",
      usersState: { rows: [], loading: false, error: null },
    });
  };

  App.renderUsersPanel = function (tab) {
    if (!tab.usersState) {
      tab.usersState = { rows: [], loading: false, error: null };
    }
    setTimeout(() => bindUsersPanel(tab), 0);
    return usersPanelHtml(tab);
  };

  function usersPanelHtml(tab) {
    const s = tab.usersState;
    const rows = s.rows || [];

    let body = "";
    if (s.loading) {
      body = '<div class="text-secondary p-3"><span class="spinner-border spinner-border-sm me-2"></span>' + (App.t("loading") || "Загрузка...") + '</div>';
    } else if (s.error) {
      body = '<div class="alert alert-danger m-2">' + App.escapeHtml(s.error) + "</div>";
    } else if (!rows.length) {
      body = '<div class="text-secondary p-3">' + (App.t("noUsersHint") || 'Нет пользователей. Нажмите "Загрузить" или "Создать".') + '</div>';
    } else {
      const cols = ["id", "name", "email", "phone", "company", "website"];
      let table = '<div class="table-responsive"><table class="table table-sm crud-table"><thead><tr>';
      cols.forEach((c) => { table += "<th>" + c + "</th>"; });
      table += '<th class="crud-actions-col">Actions</th></tr></thead><tbody>';
      rows.forEach((u) => {
        table += "<tr>";
        cols.forEach((c) => {
          table += "<td>" + App.escapeHtml(u[c] != null ? String(u[c]) : "—") + "</td>";
        });
        table += '<td class="crud-actions-col">' +
          '<button class="btn btn-sm btn-outline-primary users-edit-btn" data-id="' + u.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ' +
          '<button class="btn btn-sm btn-outline-danger users-delete-btn" data-id="' + u.id + '" title="Delete"><i class="bi bi-trash3"></i></button>' +
          "</td></tr>";
      });
      table += "</tbody></table></div>";
      body = table;
    }

    return (
      '<div class="users-panel p-2">' +
        '<div class="crud-table-toolbar d-flex align-items-center gap-2 mb-2">' +
          '<h5 class="mb-0 me-auto"><i class="bi bi-people me-2"></i>' + (App.t("users") || "Пользователи") + '</h5>' +
          '<button class="btn btn-sm btn-outline-secondary" id="users-reload-btn"><i class="bi bi-arrow-clockwise"></i> ' + (App.t("load") || "Загрузить") + '</button>' +
          '<button class="btn btn-sm send-btn" id="users-create-btn"><i class="bi bi-plus-lg"></i> ' + (App.t("create") || "Создать") + '</button>' +
        "</div>" +
        '<div id="users-panel-body">' + body + "</div>" +
      "</div>"
    );
  }

  function bindUsersPanel(tab) {
    const reloadBtn = document.getElementById("users-reload-btn");
    const createBtn = document.getElementById("users-create-btn");
    if (!reloadBtn || !createBtn) return;

    reloadBtn.addEventListener("click", () => loadUsers(tab));
    createBtn.addEventListener("click", () => {
      const baseUrl = App.resolveVariables("{{baseUrl}}/users");
      App.openEntityModal("create", null, baseUrl);
    });

    document.querySelectorAll(".users-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        const entity = (tab.usersState.rows || []).find((u) => u.id === id);
        if (entity) {
          const baseUrl = App.resolveVariables("{{baseUrl}}/users");
          App.openEntityModal("edit", entity, baseUrl);
        }
      });
    });

    document.querySelectorAll(".users-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        const entity = (tab.usersState.rows || []).find((u) => u.id === id);
        if (!entity) return;
        const baseUrl = App.resolveVariables("{{baseUrl}}/users");
        App.confirmDeleteEntity(entity, baseUrl);
      });
    });

    // Автозагрузка при первом открытии
    if (!tab.usersState.loaded && !tab.usersState.loading) {
      loadUsers(tab);
    }
  }

  async function loadUsers(tab) {
    tab.usersState = tab.usersState || {};
    tab.usersState.loading = true;
    tab.usersState.error = null;
    App.renderTabContent();

    try {
      let result;
      if (window.pywebview && window.pywebview.api && window.pywebview.api.get_users) {
        result = await window.pywebview.api.get_users(0, 100);
      } else {
        const url = App.resolveVariables("{{baseUrl}}/users?skip=0&limit=100");
        const resp = await fetch(url);
        result = await resp.json();
      }

      if (result && result.error) {
        tab.usersState.error = String(result.error);
        tab.usersState.rows = [];
      } else if (Array.isArray(result)) {
        tab.usersState.rows = result;
      } else {
        tab.usersState.rows = [];
      }
      tab.usersState.loaded = true;
    } catch (e) {
      tab.usersState.error = (App.t("usersLoadFail") || "Не удалось загрузить пользователей") + ": " + (e && e.message ? e.message : e);
      tab.usersState.rows = [];
    } finally {
      tab.usersState.loading = false;
      App.renderTabContent();
    }
  }
})();
