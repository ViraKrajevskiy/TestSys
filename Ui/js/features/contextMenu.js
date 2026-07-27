window.App = window.App || {};

(function () {
  let contextMenuTabId = null;

  App.showTabContextMenu = function (x, y, tabId) {
    contextMenuTabId = tabId;
    const menu = document.getElementById("tab-context-menu");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "block";
  };

  App.hideTabContextMenu = function () {
    document.getElementById("tab-context-menu").style.display = "none";
    contextMenuTabId = null;
  };

  App.initContextMenu = function () {
    document.addEventListener("click", App.hideTabContextMenu);
    document.getElementById("tab-context-menu").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || contextMenuTabId === null) return;
      const action = btn.dataset.action;
      const id = contextMenuTabId;
      App.hideTabContextMenu();

      if (action === "close") App.closeTab(id);
      else if (action === "close-others") App.closeOtherTabs(id);
      else if (action === "close-all") App.closeAllTabs();
      else if (action === "detach") App.detachTab(id);
    });
  };
})();
