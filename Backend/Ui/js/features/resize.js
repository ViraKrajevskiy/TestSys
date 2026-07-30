window.App = window.App || {};

(function () {
  // ============================================================
  // SIDEBAR RESIZE
  // ============================================================
  App.initResizable = function () {
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebar-resize-handle");
    if (!sidebar || !handle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener("mousedown", (e) => {
      if (document.getElementById("app-root").classList.contains("sidebar-collapsed")) return;
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      handle.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(500, startWidth + dx));
      sidebar.style.width = newWidth + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Save sidebar width
      _saveSidebarWidth(sidebar.offsetWidth);
    });

    // Load saved width
    _loadSidebarWidth(sidebar);
  };

  // ============================================================
  // RESPONSE PANEL RESIZE (vertical)
  // ============================================================
  App.initResponseResize = function (container) {
    // Called when tab content renders a response section
    const handle = container.querySelector(".response-resize-handle");
    const responsePanel = container.querySelector(".response-panel");
    if (!handle || !responsePanel) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isResizing = true;
      startY = e.clientY;
      startHeight = responsePanel.offsetHeight;
      handle.classList.add("active");
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dy = startY - e.clientY; // upward = bigger
      const newHeight = Math.max(100, Math.min(800, startHeight + dy));
      responsePanel.style.height = newHeight + "px";
      responsePanel.style.minHeight = newHeight + "px";
      responsePanel.style.maxHeight = newHeight + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  };

  // ============================================================
  // PERSISTENCE
  // ============================================================
  async function _saveSidebarWidth(w) {
    if (window.pywebview && window.pywebview.api) {
      try {
        await window.pywebview.api.save_settings(
          JSON.stringify(Object.assign({}, App.getSettings(), { sidebarWidth: w }))
        );
      } catch (_) {}
    }
  }

  function _loadSidebarWidth(sidebar) {
    const s = App.getSettings();
    if (s.sidebarWidth && s.sidebarWidth >= 120 && s.sidebarWidth <= 500) {
      sidebar.style.width = s.sidebarWidth + "px";
    }
  }
})();
