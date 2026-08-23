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
    const menuEl = document.getElementById("tab-context-menu");

    // Закрываем меню при клике ВНЕ него. Слушаем в фазе перехвата (capture):
    // обработчики на вкладках и кнопках нередко вызывают stopPropagation,
    // и клик не всплывал до document — меню «прилипало» и закрывалось
    // только при клике по самой вкладке. В capture это не помеха.
    document.addEventListener("click", (e) => {
      if (menuEl.contains(e.target)) return;  // по пункту меню — обработает его же слушатель
      App.hideTabContextMenu();
    }, true);

    // Прокрутка, ресайз окна, потеря фокуса и Esc тоже убирают меню —
    // иначе оно повиснет в старых координатах и обрежется у края экрана.
    window.addEventListener("resize", App.hideTabContextMenu);
    window.addEventListener("blur", App.hideTabContextMenu);
    document.addEventListener("scroll", App.hideTabContextMenu, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") App.hideTabContextMenu();
    });

    menuEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || contextMenuTabId === null) return;
      const action = btn.dataset.action;
      const id = contextMenuTabId;
      App.hideTabContextMenu();

      if (action === "close") App.closeTab(id);
      else if (action === "close-others") App.closeOtherTabs(id);
      else if (action === "close-all") App.closeAllTabs();
      else if (action === "detach") App.detachTab(id);
      else if (action === "rename") App.startRenamingTab(id);
      else if (action === "copy-curl") App.copyActiveTabAsCurl && App.copyActiveTabAsCurl();
    });

    // F2 переименовывает активную вкладку — только если фокус не в поле ввода
    document.addEventListener("keydown", (e) => {
      if (e.key !== "F2") return;
      const t = e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (App.state.activeTabId != null) {
        e.preventDefault();
        App.startRenamingTab(App.state.activeTabId);
      }
    });
  };
})();
