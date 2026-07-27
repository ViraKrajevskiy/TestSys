window.App = window.App || {};

App.renderAll = function () {
  App.renderTabBar();
  App.renderTabContent();
};

App.init = function () {
  App.renderCollections();
  App.initContextMenu();
  App.initThemeSettings();
  App.initTabBarDrag();
  App.loadAndApplySavedTheme();

  document.getElementById("add-tab-btn").addEventListener("click", () => App.addTab());
  document.getElementById("close-all-btn").addEventListener("click", () => App.closeAllTabs());
  document.getElementById("sidebar-toggle-btn").addEventListener("click", () => {
    document.getElementById("app-root").classList.toggle("sidebar-collapsed");
  });

  const returnBtn = document.getElementById("return-to-main-btn");
  if (returnBtn) {
    returnBtn.addEventListener("click", async () => {
      if (window.pywebview) {
        await window.pywebview.api.return_to_parent();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      App.addTab();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "w" && App.state.activeTabId !== null) {
      e.preventDefault();
      App.closeTab(App.state.activeTabId);
      return;
    }
    if (e.ctrlKey && e.key === "Tab") {
      const tabs = App.state.tabs;
      if (tabs.length < 2) return;
      e.preventDefault();
      const idx = tabs.findIndex((t) => t.id === App.state.activeTabId);
      const next = e.shiftKey
        ? (idx - 1 + tabs.length) % tabs.length
        : (idx + 1) % tabs.length;
      App.selectTab(tabs[next].id);
    }
  });

  if (App.state.tabs.length === 0) {
    App.addTab();
  }
};

document.addEventListener("DOMContentLoaded", App.init);
