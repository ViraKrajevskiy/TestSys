window.App = window.App || {};

(function () {
  const { state } = App;

  App.createTab = function (overrides) {
    // Первая (стартовая) вкладка получает демо-URL — чтобы пользователь
    // сразу видел, как выглядит запрос. Все последующие — пустые,
    // как в Postman/Insomnia: иначе одинаковый URL в двух вкладках
    // выглядит как «одна и та же вкладка».
    const isFirstTab = state.tabs.length === 0;
    const tab = {
      id: state.nextId++,
      method: "GET",
      url: isFirstTab ? "https://jsonplaceholder.typicode.com/users" : "",
      params: [],
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: "",
      activeSubTab: "params",
      responseViewMode: "body",
      sending: false,
      response: null,
      userAgent: "",
      preScript: "",       // выполняется перед отправкой
      testScript: "",      // выполняется после ответа
      lastTests: null,     // результаты последнего запуска pm.test
      crudEntity: null,
      crudAction: null,
      // Multipart-загрузка: если files непустой, запрос уходит как
      // multipart/form-data (JSON body игнорируется).
      files: [],           // [{field, path, name, size}]
      formFields: [],      // [{key, value, enabled}] — текстовые поля формы
    };
    Object.assign(tab, overrides || {});
    return tab;
  };

  App.getActiveTab = function () {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  };

  App.addTab = function (overrides) {
    if (state.tabs.length >= App.LIMITS.MAX_TABS) {
      App.showAlert(`${App.t("maxTabsReached")} ${App.LIMITS.MAX_TABS}`);
      return null;
    }
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

  /**
   * Автозаголовок — если пользователь сам не задал имя вкладки.
   * tab.title имеет приоритет: пользовательское имя не должно
   * перезаписываться при изменении URL.
   */
  App.tabTitle = function (tab) {
    if (tab.title && tab.title.trim()) return tab.title;

    if (tab.method === "RANDOMIZER") return "🎲 Randomizer";
    if (tab.method === "USERS")      return "👥 Users";

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

  /**
   * Переименовать вкладку. Пустое имя — сбросить на автозаголовок.
   */
  App.renameTab = function (tabId, newTitle) {
    const tab = App.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const name = (newTitle || "").trim();
    tab.title = name || "";     // "" = использовать автозаголовок
    App.renderTabBar();
  };

  App.syncTabOrderFromDom = function () {
    const container = document.getElementById("tabs-container");
    const orderedIds = Array.from(container.children).map(el => parseInt(el.dataset.tabId, 10));
    state.tabs.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  };
})();