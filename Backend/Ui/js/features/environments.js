/**
 * environments.js — профили окружений (dev/staging/prod).
 *
 * Пользователи хотят: держат один и тот же набор запросов, но нужно
 * быстро переключать {{baseUrl}}, {{apiKey}}, {{userId}} между dev,
 * staging и prod. Стандартная практика для API-тулов.
 *
 * Модель: список окружений {name: {var: value}} + активное. При смене
 * активного — оверлеим значения в App.VARIABLES: сначала «глобальные»,
 * потом «активного окружения» (окружение перебивает).
 *
 * Хранение: в App.state.environments (сохраняется вместе с коллекциями).
 * Первое окружение при создании — «Default».
 */
window.App = window.App || {};

(function () {
  // ============================================================
  // ХЕЛПЕРЫ
  // ============================================================
  function _envs()      { return App.state.environments   || (App.state.environments = {}); }
  function _activeName() { return App.state.activeEnv     || ""; }
  function _globals()   { return App.state.globalVariables || {}; }

  App.getEnvironments  = () => Object.assign({}, _envs());
  App.getActiveEnv     = () => _activeName();
  App.getEnvNames      = () => Object.keys(_envs());

  /**
   * Пересобрать App.VARIABLES: глобальные + активное окружение.
   * Вызывается при смене env и при загрузке.
   */
  App.rebuildVariables = function () {
    const base = Object.assign({}, _globals());
    const envName = _activeName();
    if (envName && _envs()[envName]) {
      Object.assign(base, _envs()[envName]);
    }
    App.VARIABLES = base;
    // Триггерим перерисовку — url-preview'ы в сайдбаре зависят от переменных
    if (App.renderCollections) App.renderCollections();
  };

  App.setActiveEnv = function (name) {
    if (name && !_envs()[name]) return false;
    App.state.activeEnv = name || "";
    App.saveCollections && App.saveCollections();
    App.rebuildVariables();
    _renderBadge();
    return true;
  };

  App.saveEnvironment = function (name, vars) {
    if (!name) return false;
    _envs()[name] = Object.assign({}, vars || {});
    App.saveCollections && App.saveCollections();
    if (_activeName() === name) App.rebuildVariables();
    _renderBadge();
    return true;
  };

  App.deleteEnvironment = function (name) {
    if (!_envs()[name]) return false;
    delete _envs()[name];
    if (_activeName() === name) App.state.activeEnv = "";
    App.saveCollections && App.saveCollections();
    App.rebuildVariables();
    _renderBadge();
    return true;
  };

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  App.initEnvironments = function () {
    // При первом запуске — если ещё есть только App.VARIABLES, «фотографируем» их
    // как глобальные, чтобы старые пользователи не потеряли свои переменные.
    if (!App.state.globalVariables && App.VARIABLES && Object.keys(App.VARIABLES).length) {
      App.state.globalVariables = Object.assign({}, App.VARIABLES);
    }
    _injectBadge();
    App.rebuildVariables();
    _renderBadge();
  };

  // ============================================================
  // UI В НАВБАРЕ — селектор окружения
  // ============================================================
  function _injectBadge() {
    if (document.getElementById("env-badge-wrap")) return;
    // Вставляем рядом с кнопкой sync (правая часть навбара)
    const navbar = document.getElementById("app-navbar");
    if (!navbar) return;
    const wrap = document.createElement("div");
    wrap.id = "env-badge-wrap";
    wrap.className = "env-badge-wrap";
    wrap.innerHTML = `
      <button type="button" id="env-badge-btn" class="env-badge" title="${App.t("environment") || "Окружение"}">
        <i class="bi bi-box"></i>
        <span id="env-badge-name">${App.t("noEnv") || "no env"}</span>
        <i class="bi bi-chevron-down" style="font-size:10px;opacity:.6;"></i>
      </button>`;
    // Кладём перед первой кнопкой навбара справа (иконка sync)
    const syncBtn = document.getElementById("sync-btn");
    if (syncBtn && syncBtn.parentNode) {
      syncBtn.parentNode.insertBefore(wrap, syncBtn);
    } else {
      navbar.appendChild(wrap);
    }
    document.getElementById("env-badge-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      _openMenu(e.currentTarget);
    });
  }

  function _renderBadge() {
    const nameEl = document.getElementById("env-badge-name");
    if (!nameEl) return;
    const n = _activeName();
    nameEl.textContent = n || (App.t("noEnv") || "no env");
    const wrap = document.getElementById("env-badge-wrap");
    if (wrap) wrap.classList.toggle("env-active", !!n);
  }

  function _openMenu(anchor) {
    // Закрываем предыдущий, если открыт
    document.getElementById("env-menu")?.remove();

    const menu = document.createElement("div");
    menu.id = "env-menu";
    menu.className = "sb-pos-menu";       // переиспользуем стиль popover-меню
    menu.style.width = "240px";

    const names = App.getEnvNames();
    const active = _activeName();
    const items = names.map(n => `
      <button class="sb-pos-item ${n === active ? "active" : ""}" data-env="${_esc(n)}">
        <i class="bi bi-box"></i><span>${_esc(n)}</span>
      </button>`).join("");
    menu.innerHTML = `
      <button class="sb-pos-item ${!active ? "active" : ""}" data-env="">
        <i class="bi bi-slash-circle"></i><span>${App.t("noEnv") || "no env"}</span>
      </button>
      ${names.length ? `<div class="sb-more-sep"></div>${items}` : ""}
      <div class="sb-more-sep"></div>
      <button class="sb-pos-item" data-act="manage">
        <i class="bi bi-gear"></i><span>${App.t("manageEnvs") || "Управление окружениями…"}</span>
      </button>`;

    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.top = (rect.bottom + 4) + "px";
    menu.style.left = Math.max(4, Math.min(window.innerWidth - mw - 4, rect.left)) + "px";
    if (rect.bottom + 4 + mh > window.innerHeight) {
      menu.style.top = Math.max(4, rect.top - mh - 4) + "px";
    }

    menu.querySelectorAll("[data-env]").forEach(btn => {
      btn.addEventListener("click", () => {
        App.setActiveEnv(btn.dataset.env);
        menu.remove();
      });
    });
    menu.querySelector("[data-act='manage']").addEventListener("click", () => {
      menu.remove();
      App.showEnvManager();
    });

    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("mousedown", off, true); }
      };
      document.addEventListener("mousedown", off, true);
    }, 0);
  }

  // ============================================================
  // МОДАЛКА УПРАВЛЕНИЯ ОКРУЖЕНИЯМИ
  // ============================================================
  App.showEnvManager = function () {
    if (!document.getElementById("env-mgr-modal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="env-mgr-modal" tabindex="-1">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content theme-modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-box me-2"></i>${App.t("environments") || "Окружения"}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">
                  ${App.t("envHint") || "Одинаковые переменные {{baseUrl}}, {{apiKey}} с разными значениями для dev/staging/prod. Активное окружение перебивает глобальные переменные."}
                </div>
                <div class="d-flex gap-2 mb-3">
                  <input type="text" id="env-new-name" class="form-control form-control-sm" placeholder="${App.t("envNamePlaceholder") || "Имя нового окружения (dev, staging, prod)"}">
                  <button class="btn btn-sm send-btn" id="env-new-add">
                    <i class="bi bi-plus-lg me-1"></i>${App.t("add") || "Добавить"}
                  </button>
                </div>
                <div id="env-mgr-list"></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${App.t("close") || "Закрыть"}</button>
              </div>
            </div>
          </div>
        </div>`);
      document.getElementById("env-new-add").addEventListener("click", () => {
        const name = document.getElementById("env-new-name").value.trim();
        if (!name) return;
        if (App.getEnvironments()[name]) { App.showAlert(App.t("alreadyExists") || "Уже есть"); return; }
        App.saveEnvironment(name, {});
        document.getElementById("env-new-name").value = "";
        _renderMgrList();
      });
    }
    _renderMgrList();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("env-mgr-modal")).show();
  };

  function _renderMgrList() {
    const box = document.getElementById("env-mgr-list");
    if (!box) return;
    const envs = App.getEnvironments();
    const active = _activeName();
    const names = Object.keys(envs);
    if (!names.length) {
      box.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:20px;">${App.t("noEnvsYet") || "Окружений пока нет. Добавьте dev/staging/prod выше."}</div>`;
      return;
    }
    box.innerHTML = names.map(name => {
      const vars = envs[name];
      const rows = Object.entries(vars).map(([k, v]) => `
        <div class="env-var-row">
          <input type="text" data-env="${_esc(name)}" data-kind="k" class="form-control form-control-sm" value="${_esc(k)}" placeholder="key">
          <input type="text" data-env="${_esc(name)}" data-kind="v" data-key="${_esc(k)}" class="form-control form-control-sm" value="${_esc(v)}" placeholder="value">
          <button class="btn btn-sm btn-outline-danger" data-del-var="${_esc(name)}::${_esc(k)}"><i class="bi bi-x-lg"></i></button>
        </div>`).join("");
      return `
        <div class="env-block ${name === active ? "env-block-active" : ""}">
          <div class="env-block-head">
            <div class="env-block-name">
              <i class="bi bi-box"></i> ${_esc(name)}
              ${name === active ? `<span class="env-active-mark">${App.t("active") || "активно"}</span>` : ""}
            </div>
            <div class="env-block-actions">
              <button class="btn btn-sm btn-outline-secondary" data-activate="${_esc(name)}">${name === active ? "—" : (App.t("activate") || "Сделать активным")}</button>
              <button class="btn btn-sm btn-outline-secondary" data-add-var="${_esc(name)}"><i class="bi bi-plus-lg"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-del-env="${_esc(name)}"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
          <div class="env-vars">${rows || `<div style="color:var(--text-dim);font-size:11px;padding:6px;">Нет переменных. Нажмите +</div>`}</div>
        </div>`;
    }).join("");

    // Вешаем обработчики
    box.querySelectorAll("[data-activate]").forEach(b => b.addEventListener("click", () => {
      App.setActiveEnv(b.dataset.activate); _renderMgrList();
    }));
    box.querySelectorAll("[data-add-var]").forEach(b => b.addEventListener("click", () => {
      const name = b.dataset.addVar;
      const vars = App.getEnvironments()[name];
      const key = "var" + (Object.keys(vars).length + 1);
      App.saveEnvironment(name, Object.assign({}, vars, { [key]: "" }));
      _renderMgrList();
    }));
    box.querySelectorAll("[data-del-env]").forEach(b => b.addEventListener("click", async () => {
      const name = b.dataset.delEnv;
      const ok = await App.showConfirm({ title: App.t("delete") || "Удалить", message: `${name}?`, danger: true });
      if (ok) { App.deleteEnvironment(name); _renderMgrList(); }
    }));
    box.querySelectorAll("[data-del-var]").forEach(b => b.addEventListener("click", () => {
      const [name, key] = b.dataset.delVar.split("::");
      const vars = Object.assign({}, App.getEnvironments()[name]);
      delete vars[key];
      App.saveEnvironment(name, vars);
      _renderMgrList();
    }));
    // Автосохранение переменных при потере фокуса
    box.querySelectorAll("input[data-env]").forEach(inp => inp.addEventListener("change", () => {
      _collectAndSave(box);
    }));
  }

  function _collectAndSave(box) {
    const byEnv = {};
    box.querySelectorAll(".env-block").forEach(block => {
      const name = block.querySelector(".env-block-name").textContent.trim().split(/\s+/)[0];
      // Собираем пары key/value по строкам
      const map = {};
      block.querySelectorAll(".env-var-row").forEach(row => {
        const k = row.querySelector("input[data-kind='k']").value.trim();
        const v = row.querySelector("input[data-kind='v']").value;
        if (k) map[k] = v;
      });
      byEnv[name] = map;
    });
    // Перезаписываем полностью — но только известные окружения
    Object.entries(byEnv).forEach(([name, vars]) => App.saveEnvironment(name, vars));
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
