/* app.js — вся логика интерфейса PyPostman.
 * Работает без сборщиков и фреймворков — чистый JS + Bootstrap classes,
 * чтобы можно было верстать/менять всё привычным способом (HTML/CSS). */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // Состояние приложения
  // ---------------------------------------------------------------------
  const state = {
    tabs: [],
    activeTabId: null,
    nextId: 1,
    isDetachedWindow: false, // true для дочерних окон, открытых через "открепить"
  };

  const DEMO_COLLECTION = [
    { method: "GET", name: "Users", url: "https://jsonplaceholder.typicode.com/users" },
    { method: "POST", name: "Create User", url: "https://jsonplaceholder.typicode.com/users" },
    { method: "PUT", name: "Update User", url: "https://jsonplaceholder.typicode.com/users/1" },
    { method: "DELETE", name: "Delete User", url: "https://jsonplaceholder.typicode.com/users/1" },
  ];

  const METHOD_COLOR_VAR = {
    GET: "--method-get",
    POST: "--method-post",
    PUT: "--method-put",
    PATCH: "--method-patch",
    DELETE: "--method-delete",
  };

  // ---------------------------------------------------------------------
  // Фабрика новой вкладки
  // ---------------------------------------------------------------------
  function createTab(overrides) {
    const tab = {
      id: state.nextId++,
      method: "GET",
      url: "https://jsonplaceholder.typicode.com/users",
      params: [],
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: "",
      activeSubTab: "params", // 'params' | 'headers' | 'body'
      sending: false,
      response: null, // { ok, status_code, reason, text, elapsed_ms } | { ok:false, error }
    };
    Object.assign(tab, overrides || {});
    return tab;
  }

  function getActiveTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  // ---------------------------------------------------------------------
  // Вкладки: добавление / закрытие / переключение
  // ---------------------------------------------------------------------
  function addTab(overrides) {
    const tab = createTab(overrides);
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    renderAll();
    return tab;
  }

  function selectTab(id) {
    state.activeTabId = id;
    renderAll();
  }

  function closeTab(id) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    state.tabs.splice(idx, 1);

    if (state.tabs.length === 0) {
      if (!state.isDetachedWindow) {
        addTab();
        return;
      }
    } else if (state.activeTabId === id) {
      const nextIdx = Math.min(idx, state.tabs.length - 1);
      state.activeTabId = state.tabs[nextIdx].id;
    }
    renderAll();
  }

  function closeOtherTabs(keepId) {
    state.tabs = state.tabs.filter((t) => t.id === keepId);
    state.activeTabId = keepId;
    renderAll();
  }

  function closeAllTabs() {
    state.tabs = [];
    if (!state.isDetachedWindow) {
      addTab();
    } else {
      state.activeTabId = null;
      renderAll();
    }
  }

  // ---------------------------------------------------------------------
  // Рендер полосы вкладок
  // ---------------------------------------------------------------------
  function renderTabBar() {
    const container = document.getElementById("tabs-container");
    const template = document.getElementById("tab-pill-template");
    container.innerHTML = "";

    state.tabs.forEach((tab) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.tabId = tab.id;
      if (tab.id === state.activeTabId) node.classList.add("active");

      const dot = node.querySelector(".method-dot");
      const colorVar = METHOD_COLOR_VAR[tab.method] || "--text-dim";
      dot.style.background = `var(${colorVar})`;

      const title = node.querySelector(".tab-title");
      title.textContent = tabTitle(tab);

      node.addEventListener("click", (e) => {
        if (e.target.closest(".tab-close-btn")) return;
        selectTab(tab.id);
      });
      node.querySelector(".tab-close-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showTabContextMenu(e.clientX, e.clientY, tab.id);
      });
      node.addEventListener("mouseenter", () => {
        scheduleHoverPreview(node, tabPreviewHtml(tab));
      });
      node.addEventListener("mouseleave", clearHoverPreview);

      // --- перетаскивание вкладки для смены порядка ---
      node.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(tab.id));
        // задержка нужна, чтобы браузер успел сделать "снимок" перед сменой класса
        setTimeout(() => node.classList.add("dragging"), 0);
      });
      node.addEventListener("dragend", () => {
        node.classList.remove("dragging");
        syncTabOrderFromDom();
      });
      node.addEventListener("dragover", (e) => {
        e.preventDefault();
        const draggingEl = container.querySelector(".dragging");
        if (!draggingEl || draggingEl === node) return;
        const rect = node.getBoundingClientRect();
        const isAfter = e.clientX - rect.left > rect.width / 2;
        if (isAfter) node.after(draggingEl);
        else node.before(draggingEl);
      });

      container.appendChild(node);
    });
  }

  function tabTitle(tab) {
    try {
      const u = new URL(tab.url);
      return u.pathname === "/" ? u.hostname : u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    } catch {
      return tab.url || "Request";
    }
  }

  // после drag-and-drop DOM уже переставлен визуально — синхронизируем массив state.tabs
  // с фактическим порядком элементов, чтобы он не разъезжался при следующем renderAll()
  function syncTabOrderFromDom() {
    const container = document.getElementById("tabs-container");
    const orderedIds = Array.from(container.children).map((el) => parseInt(el.dataset.tabId, 10));
    state.tabs.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
  }

  // ---------------------------------------------------------------------
  // Контекстное меню вкладки
  // ---------------------------------------------------------------------
  let contextMenuTabId = null;

  function showTabContextMenu(x, y, tabId) {
    contextMenuTabId = tabId;
    const menu = document.getElementById("tab-context-menu");
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "block";
  }

  function hideTabContextMenu() {
    document.getElementById("tab-context-menu").style.display = "none";
    contextMenuTabId = null;
  }

  function initContextMenu() {
    document.addEventListener("click", hideTabContextMenu);
    document.getElementById("tab-context-menu").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || contextMenuTabId === null) return;
      const action = btn.dataset.action;
      const id = contextMenuTabId;
      hideTabContextMenu();

      if (action === "close") closeTab(id);
      else if (action === "close-others") closeOtherTabs(id);
      else if (action === "close-all") closeAllTabs();
      else if (action === "detach") detachTab(id);
    });
  }

  // ---------------------------------------------------------------------
  // "Открепление" вкладки в отдельное окно (через Python/pywebview)
  // ---------------------------------------------------------------------
  async function detachTab(id) {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (!window.pywebview) return;

    const payload = {
      method: tab.method,
      url: tab.url,
      params: tab.params,
      headers: tab.headers,
      body: tab.body,
    };
    await window.pywebview.api.open_detached_window(payload);
    closeTab(id);
  }

  // Вызывается из Python (api.py) при загрузке нового дочернего окна
  window.loadDetachedTab = function (tabState) {
    state.isDetachedWindow = true;
    state.tabs = [];
    addTab({
      method: tabState.method || "GET",
      url: tabState.url || "",
      params: tabState.params || [],
      headers: tabState.headers || [],
      body: tabState.body || "",
    });
  };

  // ---------------------------------------------------------------------
  // Рендер содержимого активной вкладки
  // ---------------------------------------------------------------------
  function renderTabContent() {
    const root = document.getElementById("tab-content");
    const tab = getActiveTab();

    if (!tab) {
      root.innerHTML = `<div class="text-secondary p-4">Нет открытых вкладок</div>`;
      return;
    }

    root.innerHTML = `
      <div class="request-line">
        <select class="form-select method-select method-${tab.method}" id="method-select"></select>
        <input type="text" class="form-control url-input" id="url-input"
               placeholder="https://api.example.com/endpoint" value="${escapeAttr(tab.url)}">
        <button class="btn send-btn" id="send-btn" ${tab.sending ? "disabled" : ""}>
          ${tab.sending ? "..." : "Send"}
        </button>
      </div>

      <ul class="nav sub-nav mb-3">
        <li class="nav-item"><button class="nav-link ${sub("params")}" data-sub="params">Params</button></li>
        <li class="nav-item"><button class="nav-link ${sub("headers")}" data-sub="headers">Headers</button></li>
        <li class="nav-item"><button class="nav-link ${sub("body")}" data-sub="body">Body</button></li>
      </ul>

      <div id="sub-tab-content"></div>

      <div class="response-panel">
        <div id="response-status" class="response-status text-secondary">
          <span class="status-dot" style="background:var(--text-dim)"></span> Status: —
        </div>
        <pre class="response-pre" id="response-pre">Нажмите Send</pre>
      </div>
    `;

    function sub(name) {
      return tab.activeSubTab === name ? "active" : "";
    }

    // метод
    const methodSelect = document.getElementById("method-select");
    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === tab.method) opt.selected = true;
      methodSelect.appendChild(opt);
    });
    methodSelect.addEventListener("change", (e) => {
      tab.method = e.target.value;
      methodSelect.className = `form-select method-select method-${tab.method}`;
      renderTabBar();
    });

    // url
    const urlInput = document.getElementById("url-input");
    urlInput.addEventListener("input", (e) => {
      tab.url = e.target.value;
    });
    urlInput.addEventListener("change", () => renderTabBar());
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendRequest(tab.id);
    });

    // send
    document.getElementById("send-btn").addEventListener("click", () => sendRequest(tab.id));

    // под-вкладки
    root.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tab.activeSubTab = btn.dataset.sub;
        renderTabContent();
      });
    });

    renderSubTabContent(tab);
    renderResponse(tab);
  }

  function renderSubTabContent(tab) {
    const container = document.getElementById("sub-tab-content");

    if (tab.activeSubTab === "body") {
      container.innerHTML = `
        <textarea class="form-control body-textarea" id="body-textarea" rows="10"
                  placeholder='{"key": "value"}'>${escapeHtml(tab.body)}</textarea>
      `;
      document.getElementById("body-textarea").addEventListener("input", (e) => {
        tab.body = e.target.value;
      });
      return;
    }

    const listKey = tab.activeSubTab; // 'params' | 'headers'
    const rows = tab[listKey];

    container.innerHTML = `<div id="kv-rows"></div>
      <button class="btn btn-sm btn-outline-secondary" id="add-kv-row">
        <i class="bi bi-plus-lg"></i> Add ${listKey === "params" ? "param" : "header"}
      </button>`;

    const rowsContainer = container.querySelector("#kv-rows");
    const template = document.getElementById("kv-row-template");

    rows.forEach((row, idx) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const keyInput = node.querySelector(".kv-key");
      const valInput = node.querySelector(".kv-value");
      keyInput.value = row.key;
      valInput.value = row.value;
      keyInput.addEventListener("input", (e) => (rows[idx].key = e.target.value));
      valInput.addEventListener("input", (e) => (rows[idx].value = e.target.value));
      node.querySelector(".kv-remove").addEventListener("click", () => {
        rows.splice(idx, 1);
        renderSubTabContent(tab);
      });
      rowsContainer.appendChild(node);
    });

    container.querySelector("#add-kv-row").addEventListener("click", () => {
      rows.push({ key: "", value: "" });
      renderSubTabContent(tab);
    });
  }

  function renderResponse(tab) {
    const statusEl = document.getElementById("response-status");
    const preEl = document.getElementById("response-pre");
    const r = tab.response;

    if (!r) {
      statusEl.className = "response-status text-secondary";
      statusEl.innerHTML = `<span class="status-dot" style="background:var(--text-dim)"></span> Status: —`;
      preEl.textContent = "Нажмите Send";
      return;
    }

    if (!r.ok) {
      statusEl.className = "response-status status-err";
      statusEl.innerHTML = `<span class="status-dot"></span> Error`;
      preEl.textContent = "Request failed:\n" + r.error;
      return;
    }

    const cls = statusClass(r.status_code);
    statusEl.className = "response-status " + cls;
    statusEl.innerHTML = `<span class="status-dot"></span> Status: ${r.status_code} ${r.reason}  |  ${r.elapsed_ms} ms`;

    let formatted = r.text;
    try {
      formatted = JSON.stringify(JSON.parse(r.text), null, 2);
    } catch {
      /* не JSON — оставляем как есть */
    }
    preEl.textContent = formatted;
  }

  function statusClass(code) {
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 400 && code < 500) return "status-4xx";
    return "status-5xx";
  }

  // ---------------------------------------------------------------------
  // Отправка запроса
  // ---------------------------------------------------------------------
  async function sendRequest(tabId) {
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.url.trim()) return;
    if (!window.pywebview) return;

    tab.sending = true;
    renderTabContent();

    const headersObj = {};
    tab.headers.forEach((h) => {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    });
    const paramsObj = {};
    tab.params.forEach((p) => {
      if (p.key.trim()) paramsObj[p.key.trim()] = p.value;
    });

    try {
      const result = await window.pywebview.api.send_request(
        tab.method,
        tab.url.trim(),
        headersObj,
        paramsObj,
        tab.body.trim() || null
      );
      tab.response = result;
    } catch (err) {
      tab.response = { ok: false, error: String(err) };
    }

    tab.sending = false;
    renderTabContent();
  }

  // ---------------------------------------------------------------------
  // Коллекции (сайдбар)
  // ---------------------------------------------------------------------
  function renderCollections() {
    const root = document.getElementById("collections-tree");
    root.innerHTML = "";
    DEMO_COLLECTION.forEach((entry) => {
      const el = document.createElement("div");
      el.className = "collection-item";
      const colorVar = METHOD_COLOR_VAR[entry.method] || "--text-dim";
      el.innerHTML = `
        <span class="collection-method-badge" style="color:var(${colorVar});border:1px solid var(${colorVar})">${entry.method}</span>
        <span>${entry.name}</span>
      `;
      el.addEventListener("click", () => {
        addTab({ method: entry.method, url: entry.url, headers: [{ key: "Content-Type", value: "application/json" }] });
      });
      el.addEventListener("mouseenter", () => {
        scheduleHoverPreview(el, previewHtml(entry.method, entry.url));
      });
      el.addEventListener("mouseleave", clearHoverPreview);
      root.appendChild(el);
    });
  }

  // ---------------------------------------------------------------------
  // Hover-превью: мини-окошко при наведении на вкладку или карточку коллекции
  // ---------------------------------------------------------------------
  let hoverTimer = null;

  function scheduleHoverPreview(anchorEl, html, delay = 350) {
    clearHoverPreview();
    hoverTimer = setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      showHoverPreviewAt(rect.left, rect.bottom + 6, html);
    }, delay);
  }

  function clearHoverPreview() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    const el = document.getElementById("hover-preview");
    el.style.display = "none";
  }

  function showHoverPreviewAt(x, y, html) {
    const el = document.getElementById("hover-preview");
    el.innerHTML = html;
    el.style.display = "block";

    // не даём превью вылезти за правый/нижний край окна
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 12;
    const maxY = window.innerHeight - rect.height - 12;
    el.style.left = Math.min(x, maxX) + "px";
    el.style.top = Math.min(y, maxY) + "px";
  }

  function previewHtml(method, url, statusInfo) {
    const colorVar = METHOD_COLOR_VAR[method] || "--text-dim";
    let html = `
      <span class="hp-method" style="color:var(${colorVar});border:1px solid var(${colorVar})">${method}</span>
      <div class="hp-url">${escapeHtml(url)}</div>
    `;
    if (statusInfo) html += statusInfo;
    return html;
  }

  function tabPreviewHtml(tab) {
    let statusInfo = "";
    if (tab.response) {
      if (tab.response.ok) {
        const cls = statusClass(tab.response.status_code);
        statusInfo = `<div class="hp-status ${cls}">Status: ${tab.response.status_code} ${tab.response.reason} · ${tab.response.elapsed_ms} ms</div>`;
      } else {
        statusInfo = `<div class="hp-status status-err">Error</div>`;
      }
    }
    return previewHtml(tab.method, tab.url || "(пустой URL)", statusInfo);
  }

  // ---------------------------------------------------------------------
  // Тема оформления: применение, сохранение, загрузка (через api.py)
  // ---------------------------------------------------------------------
  const DEFAULT_THEME = {
    accent: "#6366f1",
    bgApp: "#14151a",
    bgPanel: "#1a1c22",
    bgInput: "#20232b",
    textMain: "#e6e7eb",
    borderRadius: 8,
    fontSize: 14,
  };

  function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--bg-app", theme.bgApp);
    root.style.setProperty("--bg-panel", theme.bgPanel);
    root.style.setProperty("--bg-input", theme.bgInput);
    root.style.setProperty("--text-main", theme.textMain);
    root.style.setProperty("--radius", theme.borderRadius + "px");
    root.style.fontSize = theme.fontSize + "px";
  }

  function fillThemeForm(theme) {
    document.getElementById("theme-accent").value = theme.accent;
    document.getElementById("theme-bg-app").value = theme.bgApp;
    document.getElementById("theme-bg-panel").value = theme.bgPanel;
    document.getElementById("theme-bg-input").value = theme.bgInput;
    document.getElementById("theme-text").value = theme.textMain;
    document.getElementById("theme-radius").value = theme.borderRadius;
    document.getElementById("theme-radius-value").textContent = theme.borderRadius;
    document.getElementById("theme-fontsize").value = theme.fontSize;
    document.getElementById("theme-fontsize-value").textContent = theme.fontSize;
  }

  function readThemeForm() {
    return {
      accent: document.getElementById("theme-accent").value,
      bgApp: document.getElementById("theme-bg-app").value,
      bgPanel: document.getElementById("theme-bg-panel").value,
      bgInput: document.getElementById("theme-bg-input").value,
      textMain: document.getElementById("theme-text").value,
      borderRadius: parseInt(document.getElementById("theme-radius").value, 10),
      fontSize: parseInt(document.getElementById("theme-fontsize").value, 10),
    };
  }

  async function loadAndApplySavedTheme() {
    if (!window.pywebview) return;
    try {
      const raw = await window.pywebview.api.load_theme();
      if (raw) {
        const theme = JSON.parse(raw);
        applyTheme(Object.assign({}, DEFAULT_THEME, theme));
      }
    } catch {
      /* нет сохранённой темы — используем дефолт из style.css */
    }
  }

  function initThemeSettings() {
    const modalEl = document.getElementById("theme-modal");
    const modal = new bootstrap.Modal(modalEl);

    document.getElementById("theme-settings-btn").addEventListener("click", async () => {
      let current = DEFAULT_THEME;
      if (window.pywebview) {
        try {
          const raw = await window.pywebview.api.load_theme();
          if (raw) current = Object.assign({}, DEFAULT_THEME, JSON.parse(raw));
        } catch {
          /* используем дефолт */
        }
      }
      fillThemeForm(current);
      modal.show();
    });

    // живое применение при перетаскивании ползунков/выборе цвета
    ["theme-accent", "theme-bg-app", "theme-bg-panel", "theme-bg-input", "theme-text"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => applyTheme(readThemeForm()));
    });
    document.getElementById("theme-radius").addEventListener("input", (e) => {
      document.getElementById("theme-radius-value").textContent = e.target.value;
      applyTheme(readThemeForm());
    });
    document.getElementById("theme-fontsize").addEventListener("input", (e) => {
      document.getElementById("theme-fontsize-value").textContent = e.target.value;
      applyTheme(readThemeForm());
    });

    document.getElementById("theme-save-btn").addEventListener("click", async () => {
      const theme = readThemeForm();
      applyTheme(theme);
      if (window.pywebview) {
        await window.pywebview.api.save_theme(JSON.stringify(theme));
      }
      modal.hide();
    });

    document.getElementById("theme-reset-btn").addEventListener("click", () => {
      fillThemeForm(DEFAULT_THEME);
      applyTheme(DEFAULT_THEME);
    });
  }

  // ---------------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function renderAll() {
    renderTabBar();
    renderTabContent();
  }

  // ---------------------------------------------------------------------
  // Инициализация
  // ---------------------------------------------------------------------
  function init() {
    renderCollections();
    initContextMenu();
    initThemeSettings();
    loadAndApplySavedTheme();

    document.getElementById("add-tab-btn").addEventListener("click", () => addTab());
    document.getElementById("close-all-btn").addEventListener("click", () => closeAllTabs());
    document.getElementById("sidebar-toggle-btn").addEventListener("click", () => {
      document.getElementById("app-root").classList.toggle("sidebar-collapsed");
    });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        addTab();
      }
    });

    if (state.tabs.length === 0) {
      addTab();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();