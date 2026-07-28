window.App = window.App || {};

(function () {
  const { state } = App;

  App.createTab = function (overrides) {
    const tab = {
      id: state.nextId++,
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/users",
      params: [],
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: "",
      activeSubTab: "params",
      responseViewMode: "body",
      sending: false,
      response: null,
      crudEntity: null,
      crudAction: null,
    };
    Object.assign(tab, overrides || {});
    return tab;
  };

  App.getActiveTab = function () {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  };

  App.addTab = function (overrides) {
    const tab = App.createTab(overrides);
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    App.renderAll();
    return tab;
  };

  App.selectTab = function (id) {
    state.activeTabId = id;
    App.renderAll();
  };

  App.closeTab = function (id) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = state.activeTabId === id;
    state.tabs.splice(idx, 1);

    if (state.tabs.length === 0) {
      if (!state.isDetachedWindow) {
        App.addTab();
        return;
      }
      state.activeTabId = null;
      App.renderAll();
      return;
    }

    if (wasActive) {
      const nextIdx = Math.min(idx, state.tabs.length - 1);
      state.activeTabId = state.tabs[nextIdx].id;
      App.renderAll();
    } else {
      App.renderTabBar();
    }
  };

  App.closeOtherTabs = function (keepId) {
    state.tabs = state.tabs.filter((t) => t.id === keepId);
    state.activeTabId = keepId;
    App.renderAll();
  };

  App.closeAllTabs = function () {
    state.tabs = [];
    if (!state.isDetachedWindow) {
      App.addTab();
    } else {
      state.activeTabId = null;
      App.renderAll();
    }
  };

  App.tabTitle = function (tab) {
    if (tab.method === "USERS") {
      return tab.title || "👥 Users";
    }
    if (tab.crudAction) {
      const labels = { list: "Users", read: "User", create: "Create", update: "Update", delete: "Delete" };
      if (labels[tab.crudAction]) return labels[tab.crudAction];
    }
    try {
      const u = new URL(tab.url);
      return u.pathname === "/" ? u.hostname : u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    } catch {
      return tab.url || "Request";
    }
  };

  App.syncTabOrderFromDom = function () {
    const container = document.getElementById("tabs-container");
    const orderedIds = Array.from(container.children).map(el => parseInt(el.dataset.tabId, 10));
    state.tabs.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  };
})();