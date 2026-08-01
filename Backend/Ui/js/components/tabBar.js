window.App = window.App || {};

(function () {
  const DRAG_THRESHOLD = 8;
  let drag = null;
  let suppressClick = false;

  function resetDragStyles(el) {
    if (!el) return;
    el.classList.remove("is-dragging");
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.zIndex = "";
    el.style.pointerEvents = "";
  }

  function tabElements(container, exclude) {
    return Array.from(container.querySelectorAll(":scope > .tab-pill")).filter((el) => el !== exclude);
  }

  function insertTarget(container, clientX, skip) {
    for (const tab of tabElements(container, skip)) {
      const rect = tab.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return tab;
    }
    return null;
  }

  function placePlaceholder(container, placeholder, clientX) {
    const target = insertTarget(container, clientX, placeholder);
    if (target) container.insertBefore(placeholder, target);
    else container.appendChild(placeholder);
  }

  function chromeTopRect() {
    const navbar = document.getElementById("app-navbar");
    const tabBar = document.getElementById("tab-bar");
    if (!navbar || !tabBar) return tabBar?.getBoundingClientRect();
    const n = navbar.getBoundingClientRect();
    const t = tabBar.getBoundingClientRect();
    return {
      left: Math.min(n.left, t.left),
      right: Math.max(n.right, t.right),
      bottom: t.bottom,
    };
  }

  function isOutsideTabBar(clientX, clientY) {
    const rect = chromeTopRect();
    if (!rect) return false;
    return clientX < rect.left || clientX > rect.right || clientY > rect.bottom + 24;
  }

  function tabIdFromPill(pill) {
    return parseInt(pill.dataset.tabId, 10);
  }

  function isActionTarget(target) {
    return target.closest(".tab-close-btn") || target.closest(".tab-detach-btn");
  }

  App.initTabBarDrag = function () {
    const container = document.getElementById("tabs-container");
    if (!container || container._dragInit) return;
    container._dragInit = true;

    container.addEventListener("mousedown", (e) => {
      const pill = e.target.closest(".tab-pill");
      if (!pill || isActionTarget(e.target) || e.button !== 0) return;

      const rect = pill.getBoundingClientRect();
      drag = {
        el: pill,
        container,
        tabId: tabIdFromPill(pill),
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        active: false,
        placeholder: null,
      };
    });

    container.addEventListener("click", (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    document.addEventListener("mousemove", (e) => {
      if (!drag) return;

      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.active = true;
        suppressClick = true;
        App.clearHoverPreview();

        const ph = document.createElement("div");
        ph.className = "tab-pill-placeholder";
        ph.style.width = drag.width + "px";
        ph.style.height = drag.height + "px";
        drag.el.before(ph);
        drag.placeholder = ph;

        drag.el.classList.add("is-dragging");
        drag.el.style.width = drag.width + "px";
        drag.el.style.position = "fixed";
        drag.el.style.zIndex = "1000";
        drag.el.style.pointerEvents = "none";
        drag.el.style.left = (e.clientX - drag.offsetX) + "px";
        drag.el.style.top = (e.clientY - drag.offsetY) + "px";
      }

      drag.el.style.left = (e.clientX - drag.offsetX) + "px";
      drag.el.style.top = (e.clientY - drag.offsetY) + "px";
      placePlaceholder(drag.container, drag.placeholder, e.clientX);
    });

    document.addEventListener("mouseup", (e) => {
      if (!drag) return;

      const d = drag;
      drag = null;

      if (d.active) {
        const detach = isOutsideTabBar(e.clientX, e.clientY) && !App.state.isDetachedWindow;
        d.placeholder.replaceWith(d.el);
        resetDragStyles(d.el);

        if (detach) {
          App.detachTab(d.tabId);
        } else {
          App.syncTabOrderFromDom();
        }
        setTimeout(() => { suppressClick = false; }, 0);
      } else if (!isActionTarget(e.target)) {
        App.selectTab(d.tabId);
      }
    });
  };

  /**
   * Inline-переименование вкладки. Пустое значение сбрасывает
   * на автозаголовок из URL.
   */
  App.startRenamingTab = function (tabId) {
    const pill = document.querySelector(`.tab-pill[data-tab-id="${tabId}"]`);
    if (!pill) return;
    const span = pill.querySelector(".tab-title");
    if (!span || span.dataset.editing === "1") return;

    const tab = App.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    span.dataset.editing = "1";
    const original = App.tabTitle(tab);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tab-title tab-title-edit";
    input.value = tab.title || original;
    input.placeholder = original;
    input.maxLength = 60;

    span.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) App.renameTab(tabId, input.value);
      else App.renderTabBar();   // просто перерисовать — вернуть исходный вид
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    // Клик по инпуту не должен уходить в переключение вкладки
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("mousedown", (e) => e.stopPropagation());
  };

  App.renderTabBar = function () {
    const container = document.getElementById("tabs-container");
    const template = document.getElementById("tab-pill-template");
    container.innerHTML = "";

    // Update add-tab button title with count
    const addBtn = document.getElementById("add-tab-btn");
    if (addBtn) {
      addBtn.title = `Новая вкладка (${App.state.tabs.length}/${App.LIMITS.MAX_TABS})`;
    }

    App.state.tabs.forEach((tab) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.tabId = tab.id;
      if (tab.id === App.state.activeTabId) node.classList.add("active");

      const dot = node.querySelector(".method-dot");
      const colorVar = App.METHOD_COLOR_VAR[tab.method] || "--text-dim";
      dot.style.background = "var(" + colorVar + ")";

      const title = node.querySelector(".tab-title");
      title.textContent = App.tabTitle(tab);
      title.title = tab.url || App.tabTitle(tab);

      // Двойной клик по заголовку — переименовать.
      title.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        App.startRenamingTab(tab.id);
      });

      const detachBtn = node.querySelector(".tab-detach-btn");
      if (App.state.isDetachedWindow) {
        detachBtn.style.display = "none";
      } else {
        detachBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          App.detachTab(tab.id);
        });
      }

      node.querySelector(".tab-close-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        App.closeTab(tab.id);
      });
      node.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          App.closeTab(tab.id);
        }
      });
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        App.showTabContextMenu(e.clientX, e.clientY, tab.id);
      });
      node.addEventListener("mouseenter", () => App.scheduleHoverPreview(node, App.tabPreviewHtml(tab)));
      node.addEventListener("mouseleave", App.clearHoverPreview);

      container.appendChild(node);
    });
  };
})();
