window.App = window.App || {};

/**
 * Сайдбар:
 *   - секция «Переменные» с полем ключ/значение и hover-действиями
 *   - панель кнопок с иконками (New / Import / Export / Swagger)
 *   - список коллекций и папок с раскрытием
 *
 * Всё выровнено по одной сетке отступов: слева 10px, между строками 4px,
 * высота строки 26px. Иконки-действия появляются при наведении, чтобы
 * визуально не мозолить глаза.
 */
(function () {

  App.renderCollections = function () {
    const root = document.getElementById("collections-tree");
    root.innerHTML = "";

    root.appendChild(_variablesBlock());
    root.appendChild(_toolbarBlock());

    App.COLLECTIONS.forEach((collection) => {
      const isUser = !collection.builtin;
      const userIdx = isUser ? App.USER_COLLECTIONS.indexOf(collection) : -1;
      root.appendChild(_collectionGroup(collection, isUser, userIdx));
    });
  };

  // ============================================================
  // ПЕРЕМЕННЫЕ
  // ============================================================
  function _variablesBlock() {
    const wrap = document.createElement("div");
    wrap.className = "sb-section sb-vars";
    wrap.innerHTML = `
      <div class="sb-section-head">
        <span class="sb-section-title">${App.t("variables")}</span>
        <button class="sb-icon-btn sb-add-btn" id="add-variable-btn" title="${App.t("addVariable")}">
          <i class="bi bi-plus-lg"></i>
        </button>
      </div>
      <div class="sb-vars-list"></div>`;

    const list = wrap.querySelector(".sb-vars-list");
    Object.keys(App.VARIABLES).forEach((key) => {
      const row = document.createElement("div");
      row.className = "sb-var-row";
      row.innerHTML = `
        <span class="sb-var-key" title="${App.escapeAttr("{{" + key + "}}")}">{{${App.escapeHtml(key)}}}</span>
        <input type="text" class="sb-var-value" value="${App.escapeAttr(App.VARIABLES[key])}">
        <button class="sb-icon-btn sb-var-del" title="${App.t("delete")}">
          <i class="bi bi-x"></i>
        </button>`;

      row.querySelector(".sb-var-value").addEventListener("change", (e) => {
        App.VARIABLES[key] = e.target.value;
        App.saveCollections();
      });

      row.querySelector(".sb-var-del").addEventListener("click", async () => {
        const ok = await App.showConfirm({
          title: App.t("delete"),
          message: `{{${key}}} — ${App.t("delete")}?`,
          okText: App.t("delete"), danger: true,
        });
        if (!ok) return;
        delete App.VARIABLES[key];
        App.saveCollections();
        App.renderCollections();
      });

      list.appendChild(row);
    });

    if (!Object.keys(App.VARIABLES).length) {
      const empty = document.createElement("div");
      empty.className = "sb-empty";
      empty.textContent = App.t("noVarsHint") || "Нет переменных";
      list.appendChild(empty);
    }

    wrap.querySelector("#add-variable-btn").addEventListener("click", async () => {
      const name = await App.showPrompt({
        title: App.t("addVariable"),
        label: App.t("variableName"),
        placeholder: "baseUrl",
      });
      if (!name) return;
      const k = name.replace(/[{}]/g, "").trim();
      if (!k) return;
      if (k in App.VARIABLES) {
        App.showAlert(`{{${k}}} — ${App.t("varExists")}`);
        return;
      }
      App.VARIABLES[k] = "";
      App.saveCollections();
      App.renderCollections();
    });

    return wrap;
  }

  // ============================================================
  // ТУЛБАР КНОПОК
  // ============================================================
  function _toolbarBlock() {
    const wrap = document.createElement("div");
    wrap.className = "sb-section sb-toolbar";
    // Компактный тулбар: только primary + 2 иконки + kebab.
    // Остальное едет в overflow-меню — раньше 7 кнопок ломали ряд при узком сайдбаре.
    wrap.innerHTML = `
      <button class="sb-btn sb-btn-primary" id="new-collection-btn">
        <i class="bi bi-plus-lg"></i> ${App.t("newCollection")}
      </button>
      <button class="sb-btn sb-btn-ghost" id="collapse-all-btn" title="${App.t("collapseAll") || "Свернуть всё"}">
        <i class="bi bi-arrows-collapse"></i>
      </button>
      <button class="sb-btn sb-btn-ghost sb-pos-btn" id="sidebar-pos-btn" title="${App.t("sidebarPosition") || "Положение"}">
        <i class="bi bi-layout-sidebar"></i>
      </button>
      <button class="sb-btn sb-btn-ghost" id="sb-more-btn" title="${App.t("more") || "Ещё"}">
        <i class="bi bi-three-dots"></i>
      </button>`;

    wrap.querySelector("#new-collection-btn").addEventListener("click", async () => {
      const name = await App.showPrompt({
        title: App.t("newCollection"),
        label: App.t("collectionName"),
        placeholder: "My API",
      });
      if (name) App.addCollection(name);
    });

    // Kebab-меню открывается по клику на «⋯». Содержит редко используемые
    // действия — импорт, экспорт, Swagger, «раскрыть всё».
    wrap.querySelector("#sb-more-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      _openSidebarMoreMenu(e.currentTarget);
    });

    // Кнопка выбора положения сайдбара — открывает маленький popover.
    // Обработчик события ставим на wrap: тулбар перерисовывается вместе
    // со всем сайдбаром, а popover живёт в body отдельно.
    wrap.querySelector("#sidebar-pos-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      App.showSidebarPositionMenu(e.currentTarget);
    });

    // Свернуть всё: помечаем каждую коллекцию как collapsed и подчищаем
    // expandedFolders, чтобы при следующем раскрытии всё было в свёрнутом
    // виде (иначе внутри раскрытой коллекции все папки будут распахнуты).
    wrap.querySelector("#collapse-all-btn").addEventListener("click", _collapseAll);

    return wrap;
  }

  function _collapseAll() {
    _allCollections().forEach(c => { App.state.collapsedCollections[c.name] = true; });
    Object.keys(App.state.expandedFolders).forEach(k => {
      App.state.expandedFolders[k] = false;
    });
    App.renderCollections();
  }
  function _expandAll() {
    App.state.collapsedCollections = {};
    _allCollections().forEach(c => {
      (c.folders || []).forEach(f => {
        App.state.expandedFolders[c.name + "::" + f.name] = true;
      });
    });
    App.renderCollections();
  }

  /** Overflow-меню для сайдбара — вторичные действия. */
  function _openSidebarMoreMenu(anchor) {
    const existing = document.getElementById("sb-more-menu");
    if (existing) { existing.remove(); return; }

    const items = [
      { icon: "bi-box-arrow-in-down", label: App.t("importCollection"), on: async () => {
          const res = await App.importCollections({ mergeVariables: true });
          if (res.cancelled) return;
          if (res.ok) App.showAlert(App.t("importCollection") + ": " + res.added.join(", "));
          else App.showAlert(App.t("error") + ": " + res.error);
        } },
      { icon: "bi-box-arrow-up", label: App.t("exportAll"), on: async () => {
          if (!App.USER_COLLECTIONS.length) { App.showAlert(App.t("exportAll") + " — " + App.t("none")); return; }
          const res = await App.exportCollections(null);
          if (res.cancelled) return;
          if (res.ok) App.showAlert(res.path || "OK");
          else App.showAlert(App.t("error") + ": " + res.error);
        } },
      { icon: "bi-file-earmark-code", label: App.t("importSwagger"), on: () => {
          document.getElementById("import-swagger-btn-hidden")?.click();
          App.showSwaggerImport && App.showSwaggerImport();
        } },
      { sep: true },
      { icon: "bi-arrows-expand",   label: App.t("expandAll")   || "Раскрыть всё", on: _expandAll },
      { icon: "bi-arrows-collapse", label: App.t("collapseAll") || "Свернуть всё", on: _collapseAll },
    ];

    const menu = document.createElement("div");
    menu.id = "sb-more-menu";
    menu.className = "sb-pos-menu";       // тот же стиль, что у popover позиции
    menu.style.width = "220px";
    menu.innerHTML = items.map(it => it.sep
      ? `<div class="sb-more-sep"></div>`
      : `<button class="sb-pos-item"><i class="bi ${it.icon}"></i><span>${App.escapeHtml(it.label)}</span></button>`
    ).join("");
    document.body.appendChild(menu);

    // Позиционируем под кнопкой; если снизу не хватает — выше
    const rect = anchor.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = rect.bottom + 4, left = rect.right - mw;
    if (top + mh > window.innerHeight) top = rect.top - mh - 4;
    if (left < 4) left = 4;
    menu.style.top = top + "px";
    menu.style.left = left + "px";

    const btns = menu.querySelectorAll(".sb-pos-item");
    const realItems = items.filter(it => !it.sep);
    btns.forEach((b, i) => {
      b.addEventListener("click", () => { menu.remove(); realItems[i].on(); });
    });

    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener("mousedown", off, true);
        }
      };
      document.addEventListener("mousedown", off, true);
    }, 0);
  }

  /** Все коллекции — встроенные + пользовательские. */
  function _allCollections() {
    const built = Array.isArray(App.BUILTIN_COLLECTIONS) ? App.BUILTIN_COLLECTIONS : [];
    const user  = Array.isArray(App.USER_COLLECTIONS)    ? App.USER_COLLECTIONS    : [];
    return built.concat(user);
  }

  // ============================================================
  // ГРУППА КОЛЛЕКЦИИ
  // ============================================================
  function _collectionGroup(collection, isUser, userIdx) {
    const wrap = document.createElement("div");
    wrap.className = "sb-collection";

    const collapsed = !!App.state.collapsedCollections[collection.name];
    if (collapsed) wrap.classList.add("sb-collapsed");

    // Заголовок. Шеврон + иконка + имя — кликабельная зона toggle.
    // Кнопки действий вынесены отдельно и не сворачивают коллекцию.
    const head = document.createElement("div");
    head.className = "sb-coll-head";
    head.innerHTML = `
      <div class="sb-coll-toggle" title="${App.t("collapseExpand") || "Свернуть/развернуть"}">
        <i class="bi bi-chevron-${collapsed ? "right" : "down"} sb-coll-chevron"></i>
        <i class="bi bi-collection sb-coll-icon"></i>
        <span class="sb-coll-name">${App.escapeHtml(collection.name)}</span>
      </div>
      <div class="sb-actions"></div>`;

    head.querySelector(".sb-coll-toggle").addEventListener("click", () => {
      App.state.collapsedCollections[collection.name] = !collapsed;
      App.renderCollections();
    });

    const actions = head.querySelector(".sb-actions");

    // Экспорт доступен всем, включая встроенные
    _addAction(actions, "bi-box-arrow-up", App.t("exportOne"), async (e) => {
      e.stopPropagation();
      const res = await App.exportCollections(collection);
      if (res.cancelled) return;
      if (res.ok) App.showAlert(res.path || "OK");
      else App.showAlert(App.t("error") + ": " + res.error);
    });

    if (isUser) {
      _addAction(actions, "bi-folder-plus", App.t("addFolder"), async (e) => {
        e.stopPropagation();
        const n = await App.showPrompt({ title: App.t("addFolder"), label: App.t("folderName") });
        if (n) App.addFolder(collection, n);
      }, "accent");

      _addAction(actions, "bi-pencil", App.t("rename"), async (e) => {
        e.stopPropagation();
        const n = await App.showPrompt({ title: App.t("rename"), label: App.t("newName"), value: collection.name });
        if (n) App.renameCollection(userIdx, n);
      });

      _addAction(actions, "bi-trash3", App.t("delete"), async (e) => {
        e.stopPropagation();
        const ok = await App.showConfirm({
          title: App.t("delete"),
          message: `"${collection.name}" — ${App.t("delete")}?`,
          okText: App.t("delete"), danger: true,
        });
        if (ok) App.deleteCollection(userIdx);
      }, "danger");
    }
    wrap.appendChild(head);

    // Папки — если коллекция свёрнута, вообще не рендерим (быстрее и чище).
    if (!collapsed) {
      collection.folders.forEach((folder, folderIdx) => {
        wrap.appendChild(_folderNode(collection, isUser, folder, folderIdx));
      });
    }

    return wrap;
  }

  // ============================================================
  // ПАПКА
  // ============================================================
  function _folderNode(collection, isUser, folder, folderIdx) {
    const folderKey = collection.name + "::" + folder.name;
    const isOpen = App.state.expandedFolders[folderKey] !== false;

    const wrap = document.createElement("div");
    wrap.className = "sb-folder";

    // Шапка
    const head = document.createElement("div");
    head.className = "sb-folder-head";
    head.innerHTML = `
      <div class="sb-folder-toggle">
        <i class="bi bi-chevron-${isOpen ? "down" : "right"} sb-folder-chevron"></i>
        <i class="bi bi-folder2 sb-folder-icon"></i>
        <span class="sb-folder-name">${App.escapeHtml(folder.name)}</span>
      </div>
      <div class="sb-actions"></div>`;

    head.querySelector(".sb-folder-toggle").addEventListener("click", () => {
      // Баг двух кликов: expandedFolders[key] по умолчанию undefined,
      // а визуально папка считается открытой (isOpen = ... !== false).
      // Прошлая логика делала !undefined = true — и первый клик уходил
      // в «пустоту». Читаем текущее состояние тем же выражением, что и
      // при рендере, — и инвертируем от него.
      const curOpen = App.state.expandedFolders[folderKey] !== false;
      App.state.expandedFolders[folderKey] = !curOpen;
      App.renderCollections();
    });

    if (isUser) {
      const actions = head.querySelector(".sb-actions");
      _addAction(actions, "bi-plus-lg", App.t("addRequest"), (e) => {
        e.stopPropagation();
        _editRequestDialog(folder, -1);
      }, "accent");
      _addAction(actions, "bi-pencil", App.t("rename"), async (e) => {
        e.stopPropagation();
        const n = await App.showPrompt({ title: App.t("rename"), label: App.t("newFolderName"), value: folder.name });
        if (n) App.renameFolder(collection, folderIdx, n);
      });
      _addAction(actions, "bi-trash3", App.t("delete"), async (e) => {
        e.stopPropagation();
        const ok = await App.showConfirm({
          title: App.t("delete"),
          message: `"${folder.name}" — ${App.t("delete")}?`,
          okText: App.t("delete"), danger: true,
        });
        if (ok) App.deleteFolder(collection, folderIdx);
      }, "danger");
    }
    wrap.appendChild(head);

    // Список запросов
    const items = document.createElement("div");
    items.className = "sb-items";
    if (!isOpen) items.style.display = "none";

    folder.items.forEach((entry, itemIdx) => {
      items.appendChild(_requestItem(collection, folder, isUser, entry, itemIdx));
    });
    wrap.appendChild(items);

    return wrap;
  }

  // ============================================================
  // ЗАПРОС
  // ============================================================
  function _requestItem(collection, folder, isUser, entry, itemIdx) {
    const url = App.resolveVariables(entry.url);
    const el = document.createElement("div");
    el.className = "sb-item";

    const colorVar = App.METHOD_COLOR_VAR[entry.method] || "--text-dim";
    el.innerHTML = `
      <div class="sb-item-main">
        <span class="sb-method" style="color:var(${colorVar});border-color:var(${colorVar});">${entry.method}</span>
        <span class="sb-item-name">${App.escapeHtml(entry.name)}</span>
      </div>
      <div class="sb-actions"></div>`;

    el.querySelector(".sb-item-main").addEventListener("click", () => {
      const overrides = {
        method: entry.method, url,
        headers: [{ key: "Content-Type", value: "application/json" }],
        crudEntity: folder.entity || null,
        crudAction: entry.crud || null,
        schema: entry.schema || null,
      };
      if (entry.body) { overrides.body = entry.body; overrides.activeSubTab = "body"; }
      if (["POST", "PUT", "PATCH"].includes(entry.method)) overrides.activeSubTab = "body";
      App.addTab(overrides);
    });

    el.querySelector(".sb-item-main").addEventListener("mouseenter",
      () => App.scheduleHoverPreview(el, App.previewHtml(entry.method, url)));
    el.querySelector(".sb-item-main").addEventListener("mouseleave", App.clearHoverPreview);

    if (isUser) {
      const actions = el.querySelector(".sb-actions");
      _addAction(actions, "bi-pencil", App.t("edit"), (e) => {
        e.stopPropagation();
        _editRequestDialog(folder, itemIdx);
      });
      _addAction(actions, "bi-trash3", App.t("delete"), async (e) => {
        e.stopPropagation();
        const ok = await App.showConfirm({
          title: App.t("delete"),
          message: `"${entry.name}" — ${App.t("delete")}?`,
          okText: App.t("delete"), danger: true,
        });
        if (ok) App.deleteRequest(folder, itemIdx);
      }, "danger");
    }

    return el;
  }

  // ============================================================
  // ХЕЛПЕР — кнопка-иконка
  // ============================================================
  function _addAction(container, icon, title, handler, variant) {
    const b = document.createElement("button");
    b.className = "sb-icon-btn" + (variant ? " sb-icon-btn-" + variant : "");
    b.title = title;
    b.innerHTML = `<i class="bi ${icon}"></i>`;
    b.addEventListener("click", handler);
    container.appendChild(b);
  }

  async function _editRequestDialog(folder, itemIdx) {
    const isEdit = itemIdx >= 0;
    const existing = isEdit ? folder.items[itemIdx] : null;
    const entry = await App.showRequestEditor(existing);
    if (!entry) return;
    if (isEdit) App.editRequest(folder, itemIdx, entry);
    else App.addRequest(folder, entry);
  }
})();
