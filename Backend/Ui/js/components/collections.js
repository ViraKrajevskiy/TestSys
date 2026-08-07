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

  // Текущий поисковый запрос
  let _searchQuery = "";   // нижний регистр, для фильтрации
  let _searchRaw   = "";   // оригинальный текст, для восстановления в input

  App.renderCollections = function () {
    const root = document.getElementById("collections-tree");

    // Сохраняем: был ли фокус в поиске
    const searchFocused = document.activeElement?.classList.contains("sb-search-input");

    root.innerHTML = "";
    root.appendChild(_variablesBlock());
    root.appendChild(_toolbarBlock());
    root.appendChild(_searchBlock());

    // Рендерим дерево коллекций в отдельный контейнер — не трогаем search-блок
    const treeWrap = document.createElement("div");
    treeWrap.id = "sb-collection-tree";
    root.appendChild(treeWrap);
    _renderCollectionTree(treeWrap);

    // Восстанавливаем фокус поиска и позицию курсора
    if (searchFocused) {
      const newInp = root.querySelector(".sb-search-input");
      if (newInp) { newInp.focus(); const l = newInp.value.length; newInp.setSelectionRange(l, l); }
    }
  };

  /** Только дерево коллекций — вызывается из поиска без пересоздания header/toolbar/search */
  function _renderCollectionTree(container) {
    container.innerHTML = "";
    const q = _searchQuery;

    App.COLLECTIONS.forEach((collection) => {
      const isUser = !collection.builtin;
      const userIdx = isUser ? App.USER_COLLECTIONS.indexOf(collection) : -1;

      if (q) {
        const node = _collectionGroupFiltered(collection, isUser, userIdx, q);
        if (node) container.appendChild(node);
      } else {
        container.appendChild(_collectionGroup(collection, isUser, userIdx));
      }
    });

    if (q && !container.querySelectorAll(".sb-item").length) {
      const empty = document.createElement("div");
      empty.className = "sb-empty";
      empty.style.padding = "12px 10px";
      empty.textContent = App.t("sidebarNoResults") || "Нет совпадений";
      container.appendChild(empty);
    }
  };

  // ============================================================
  // ============================================================
  // ПОИСК
  // ============================================================
  function _searchBlock() {
    const wrap = document.createElement("div");
    wrap.className = "sb-search-wrap";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "sb-search-input";
    inp.placeholder = App.t("sidebarSearch") || "Поиск запросов…";
    inp.value = _searchRaw;
    inp.setAttribute("aria-label", App.t("sidebarSearch") || "Поиск");

    const clearBtn = document.createElement("button");
    clearBtn.className = "sb-search-clear" + (_searchRaw ? "" : " d-none");
    clearBtn.title = App.t("sidebarSearchClear") || "Очистить";
    clearBtn.innerHTML = `<i class="bi bi-x"></i>`;

    inp.addEventListener("input", () => {
      _searchRaw   = inp.value;
      _searchQuery = inp.value.toLowerCase().trim();
      clearBtn.classList.toggle("d-none", !_searchQuery);
      // Обновляем только дерево — input остаётся в DOM, фокус не теряется
      const tree = document.getElementById("sb-collection-tree");
      if (tree) _renderCollectionTree(tree);
    });

    clearBtn.addEventListener("click", () => {
      _searchRaw = "";
      _searchQuery = "";
      inp.value = "";
      clearBtn.classList.add("d-none");
      const tree = document.getElementById("sb-collection-tree");
      if (tree) _renderCollectionTree(tree);
      inp.focus();
    });

    wrap.appendChild(inp);
    wrap.appendChild(clearBtn);
    return wrap;
  }

  /** Отфильтрованная коллекция — только совпадающие элементы, всё раскрыто */
  function _collectionGroupFiltered(collection, isUser, userIdx, q) {
    // Собираем совпадающие пары [folder, item]
    const matches = [];
    (collection.folders || []).forEach((folder, folderIdx) => {
      (folder.items || []).forEach((entry, itemIdx) => {
        const haystack = (entry.name + " " + entry.url + " " + entry.method).toLowerCase();
        if (haystack.includes(q)) matches.push({ folder, folderIdx, entry, itemIdx });
      });
    });

    // Имя коллекции тоже может совпасть → показываем всё содержимое
    const collMatch = collection.name.toLowerCase().includes(q);
    if (!matches.length && !collMatch) return null;

    const wrap = document.createElement("div");
    wrap.className = "sb-collection";

    const head = document.createElement("div");
    head.className = "sb-coll-head";
    head.innerHTML = `
      <div class="sb-coll-toggle">
        <i class="bi bi-chevron-down sb-coll-chevron"></i>
        <i class="bi bi-collection sb-coll-icon"></i>
        <span class="sb-coll-name">${_highlight(App.escapeHtml(collection.name), q)}</span>
      </div>
      <div class="sb-actions"></div>`;
    wrap.appendChild(head);

    // Группируем по папкам
    const byFolder = new Map();
    (collMatch
      ? (collection.folders || []).flatMap((folder, folderIdx) =>
          (folder.items || []).map((entry, itemIdx) => ({ folder, folderIdx, entry, itemIdx })))
      : matches
    ).forEach(m => {
      if (!byFolder.has(m.folderIdx)) byFolder.set(m.folderIdx, { folder: m.folder, items: [] });
      byFolder.get(m.folderIdx).items.push(m);
    });

    byFolder.forEach(({ folder, items }) => {
      const fNode = document.createElement("div");
      fNode.className = "sb-folder";
      fNode.innerHTML = `
        <div class="sb-folder-head">
          <div class="sb-folder-toggle">
            <i class="bi bi-chevron-down sb-folder-chevron"></i>
            <i class="bi bi-folder2-open sb-folder-icon"></i>
            <span class="sb-folder-name">${_highlight(App.escapeHtml(folder.name), q)}</span>
          </div>
        </div>`;

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "sb-items";
      items.forEach(({ entry, itemIdx }) => {
        itemsWrap.appendChild(_requestItem(collection, folder, isUser, entry, itemIdx, q));
      });
      fNode.appendChild(itemsWrap);
      wrap.appendChild(fNode);
    });

    return wrap;
  }

  /** Подсветить совпадение в тексте */
  function _highlight(html, q) {
    if (!q) return html;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return html.replace(new RegExp(`(${escaped})`, "gi"),
      `<mark style="background:var(--accent);color:#fff;border-radius:var(--radius-sm);padding:0 1px;">$1</mark>`);
  }

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

    const _doImport = async (label) => {
      const res = await App.importCollections({ mergeVariables: true });
      if (res.cancelled) return;
      if (res.ok) App.showAlert(`✓ ${label}: ` + res.added.join(", "));
      else App.showAlert(App.t("error") + ": " + res.error);
    };

    const items = [
      { icon: "bi-box-arrow-in-down", label: "Импорт…", sub: [
          { icon: "bi-file-earmark-arrow-up", label: "Файл TestSys (.json)", on: () => _doImport("Импортировано") },
          { icon: "bi-p-circle",              label: "Postman Collection",    on: () => _doImport("Постман") },
          { icon: "bi-moon-stars",            label: "Insomnia Export",       on: () => _doImport("Insomnia") },
          { icon: "bi-braces",                label: "Bruno (.bru.json)",     on: () => _doImport("Bruno") },
          { icon: "bi-file-earmark-code",     label: "Swagger / OpenAPI",     on: () => { App.showSwaggerImport && App.showSwaggerImport(); } },
          { icon: "bi-terminal",              label: "cURL",                  on: () => App.showCurlImport && App.showCurlImport() },
      ]},
      { icon: "bi-box-arrow-up", label: "Экспорт…", sub: [
          { icon: "bi-file-earmark-arrow-down", label: "Файл TestSys (.json)", on: async () => {
              if (!App.USER_COLLECTIONS.length) return;
              const res = await App.exportCollections(null);
              if (res.ok) App.showAlert(res.path || "OK");
            }},
          { icon: "bi-send-arrow-up",   label: "Postman v2.1",   on: async () => { if (!App.USER_COLLECTIONS.length) return; const r = await App.exportAsPostman(null); if (r.ok) App.showAlert(`✓ Postman: ${r.count}`); } },
          { icon: "bi-braces-asterisk", label: "Bruno (.bru)",   on: async () => { if (!App.USER_COLLECTIONS.length) return; const r = await App.exportAsBruno(null); if (r.ok) App.showAlert("✓ Bruno"); } },
          { icon: "bi-filetype-yml",    label: "OpenAPI YAML",   on: async () => { if (!App.USER_COLLECTIONS.length) return; await App.exportAsOpenApi(null, "yaml"); } },
          { icon: "bi-file-earmark-arrow-down", label: "История запросов (HAR)", on: () => App.exportHar && App.exportHar(null) },
      ]},
      { sep: true },
      { icon: "bi-arrows-expand",   label: App.t("expandAll")   || "Раскрыть всё", on: _expandAll },
      { icon: "bi-arrows-collapse", label: App.t("collapseAll") || "Свернуть всё", on: _collapseAll },
    ];

    const menu = document.createElement("div");
    menu.id = "sb-more-menu";
    menu.className = "sb-pos-menu";
    menu.style.width = "210px";
    document.body.appendChild(menu);

    const _buildMenu = (container, menuItems) => {
      container.innerHTML = "";
      menuItems.forEach(it => {
        if (it.sep) {
          container.insertAdjacentHTML("beforeend", `<div class="sb-more-sep"></div>`);
          return;
        }
        const btn = document.createElement("button");
        btn.className = "sb-pos-item";
        btn.innerHTML = `<i class="bi ${it.icon}"></i><span>${App.escapeHtml(it.label)}</span>` +
          (it.sub ? `<i class="bi bi-chevron-right" style="margin-left:auto;font-size:9px;"></i>` : "");
        container.appendChild(btn);

        if (it.sub) {
          // Подменю — показывается при наведении
          const sub = document.createElement("div");
          sub.className = "sb-pos-menu sb-submenu";
          sub.style.cssText = "position:fixed;width:220px;display:none;z-index:10001;";
          document.body.appendChild(sub);
          _buildMenu(sub, it.sub);

          let _subHideTimer = null;
          const _showSub = () => {
            clearTimeout(_subHideTimer);
            document.querySelectorAll(".sb-submenu").forEach(s => { if (s !== sub) s.style.display = "none"; });

            // Позиционируем относительно ВСЕГО меню, а не отдельного пункта:
            // иначе подменю уходит внутрь основного меню и налезает на него.
            const menuRect = menu.getBoundingClientRect();
            const btnRect  = btn.getBoundingClientRect();
            const subW = sub.offsetWidth  || 220;
            const subH = sub.offsetHeight || 200;
            const gap = 4, pad = 8;

            let left;
            if (menuRect.right + gap + subW + pad <= window.innerWidth) {
              left = menuRect.right + gap;                 // справа от меню
            } else if (menuRect.left - gap - subW >= pad) {
              left = menuRect.left - subW - gap;           // слева от меню
            } else {
              left = Math.max(pad, window.innerWidth - subW - pad);
            }

            // По вертикали выравниваем на пункт, но не даём вылезти вниз/вверх
            let top = btnRect.top;
            if (top + subH + pad > window.innerHeight) top = window.innerHeight - subH - pad;
            if (top < pad) top = pad;

            sub.style.top  = top + "px";
            sub.style.left = left + "px";
            sub.style.display = "";
          };
          const _hideSub = () => {
            _subHideTimer = setTimeout(() => { sub.style.display = "none"; }, 120);
          };
          btn.addEventListener("mouseenter", _showSub);
          btn.addEventListener("mouseleave", (e) => {
            if (!sub.contains(e.relatedTarget)) _hideSub();
          });
          sub.addEventListener("mouseenter", () => clearTimeout(_subHideTimer));
          sub.addEventListener("mouseleave", (e) => {
            if (!btn.contains(e.relatedTarget)) _hideSub();
          });
          sub.querySelectorAll(".sb-pos-item").forEach((sb, si) => {
            sb.addEventListener("click", () => {
              sub.style.display = "none";
              menu.remove();
              document.querySelectorAll(".sb-submenu").forEach(s => s.remove());
              it.sub[si].on();
            });
          });
        } else {
          btn.addEventListener("click", () => {
            menu.remove();
            document.querySelectorAll(".sb-submenu").forEach(s => s.remove());
            it.on();
          });
        }
      });
    };

    _buildMenu(menu, items);

    // Позиционируем под кнопкой
    const rect = anchor.getBoundingClientRect();
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    let top = rect.bottom + 4, left = rect.right - mw;
    if (top + mh > window.innerHeight) top = rect.top - mh - 4;
    if (left < 4) left = 4;
    menu.style.top = top + "px";
    menu.style.left = left + "px";

    // Закрытие по клику вне меню
    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor && !e.target.closest(".sb-submenu")) {
          menu.remove();
          document.querySelectorAll(".sb-submenu").forEach(s => s.remove());
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

    // ⋯ меню (экспорт + дублировать)
    _addCollectionMoreMenu(actions, collection, isUser, userIdx);
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

    // Drop-зона для drag&drop (только пользовательские коллекции)
    if (isUser) {
      wrap.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          wrap.classList.add("sb-drop-over");
        }
      });
      wrap.addEventListener("dragleave", e => {
        if (!wrap.contains(e.relatedTarget)) wrap.classList.remove("sb-drop-over");
      });
      wrap.addEventListener("drop", e => {
        e.preventDefault();
        wrap.classList.remove("sb-drop-over");
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (data.colName === collection.name && data.folderName === folder.name) return; // та же папка
          // Находим исходную коллекцию и папку
          const srcCol = App.USER_COLLECTIONS.find(c => c.name === data.colName);
          const srcFolder = srcCol && (srcCol.folders || []).find(f => f.name === data.folderName);
          if (!srcFolder) return;
          const [item] = srcFolder.items.splice(data.itemIdx, 1);
          if (!item) return;
          folder.items.push(item);
          App.saveCollections();
          App.renderCollections();
        } catch {}
      });
    }

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
      const curOpen = App.state.expandedFolders[folderKey] !== false;
      const willOpen = !curOpen;
      App.state.expandedFolders[folderKey] = willOpen;

      // Lazy-fill: если открываем и контейнер ещё не заполнен — заполняем без полного перерендера
      const itemsEl = wrap.querySelector(".sb-items");
      if (willOpen && itemsEl && itemsEl.dataset.lazy === "1") {
        itemsEl.removeAttribute("data-lazy");
        folder.items.forEach((entry, itemIdx) => {
          itemsEl.appendChild(_requestItem(collection, folder, isUser, entry, itemIdx));
        });
        itemsEl.style.display = "";
        // Обновляем шеврон
        head.querySelector(".sb-folder-chevron").className = "bi bi-chevron-down sb-folder-chevron";
      } else {
        App.renderCollections();
      }
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

    // Список запросов — ленивый рендер: DOM-узлы создаём только когда папка открыта
    const items = document.createElement("div");
    items.className = "sb-items";

    if (isOpen) {
      folder.items.forEach((entry, itemIdx) => {
        items.appendChild(_requestItem(collection, folder, isUser, entry, itemIdx));
      });
    } else {
      items.style.display = "none";
      // Маркер — при раскрытии папки нужно будет заполнить
      items.dataset.lazy = "1";
      items.dataset.collName = collection.name;
      items.dataset.folderIdx = folderIdx;
    }
    wrap.appendChild(items);

    return wrap;
  }

  // ============================================================
  // ЗАПРОС
  // ============================================================
  function _requestItem(collection, folder, isUser, entry, itemIdx, q) {
    const url = App.resolveVariables(entry.url);
    const el = document.createElement("div");
    el.className = "sb-item";

    // Drag & drop — только для пользовательских коллекций
    if (isUser) {
      el.draggable = true;
      el.dataset.dndCol  = collection.name;
      el.dataset.dndFolder = folder.name;
      el.dataset.dndIdx  = itemIdx;

      el.addEventListener("dragstart", e => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({
          colName: collection.name, folderName: folder.name, itemIdx,
        }));
        el.classList.add("sb-dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("sb-dragging"));
    }

    const colorVar = App.METHOD_COLOR_VAR[entry.method] || "--text-dim";
    const nameHtml = q ? _highlight(App.escapeHtml(entry.name), q) : App.escapeHtml(entry.name);
    el.innerHTML = `
      <div class="sb-item-main">
        <span class="sb-method" style="color:var(${colorVar});border-color:var(${colorVar});">${entry.method}</span>
        <span class="sb-item-name">${nameHtml}</span>
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
  function _addCollectionMoreMenu(container, collection, isUser, userIdx) {
    const btn = document.createElement("button");
    btn.className = "sb-icon-btn";
    btn.title = "Ещё…";
    btn.innerHTML = `<i class="bi bi-three-dots"></i>`;
    container.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.querySelectorAll(".sb-col-more-menu");
      const wasOpen = existing.length > 0;
      existing.forEach(m => m.remove());
      if (wasOpen) return; // toggle: закрыли — не открываем

      const menuItems = [];

      if (isUser) {
        menuItems.push({
          icon: "bi-copy", label: "Дублировать",
          on: () => App.duplicateCollection(userIdx),
        });
        menuItems.push({ sep: true });
      }

      menuItems.push({
        icon: "bi-box-arrow-up", label: "Экспорт TestSys (.json)",
        on: async () => {
          const res = await App.exportCollections(collection);
          if (res.ok) App.showAlert(res.path || "OK");
          else if (!res.cancelled) App.showAlert(App.t("error") + ": " + res.error);
        },
      });
      menuItems.push({
        icon: "bi-send-arrow-up", label: "Экспорт в Postman",
        on: async () => {
          const res = await App.exportAsPostman(collection);
          if (res.ok) App.showAlert("✓ Экспортировано в Postman");
          else if (!res.cancelled) App.showAlert(App.t("error") + ": " + res.error);
        },
      });
      menuItems.push({
        icon: "bi-filetype-yml", label: "Экспорт в OpenAPI",
        on: async () => {
          const res = await App.exportAsOpenApi(collection, "yaml");
          if (res.ok) App.showAlert("✓ Экспортировано в OpenAPI YAML");
          else if (!res.cancelled) App.showAlert(App.t("error") + ": " + res.error);
        },
      });
      menuItems.push({
        icon: "bi-filetype-json", label: "Экспорт в Bruno",
        on: async () => {
          const res = await App.exportAsBruno && App.exportAsBruno(collection);
          if (res && res.ok) App.showAlert("✓ Экспортировано в Bruno");
        },
      });

      const menu = document.createElement("div");
      menu.className = "sb-pos-menu sb-col-more-menu";
      document.body.appendChild(menu);

      menuItems.forEach(it => {
        if (it.sep) {
          menu.insertAdjacentHTML("beforeend", `<div class="sb-more-sep"></div>`);
          return;
        }
        const item = document.createElement("button");
        item.className = "sb-pos-item";
        item.innerHTML = `<i class="bi ${it.icon}"></i><span>${App.escapeHtml(it.label)}</span>`;
        item.addEventListener("click", () => { menu.remove(); it.on(); });
        menu.appendChild(item);
      });

      const r = btn.getBoundingClientRect();
      const mw = 210;
      let left = r.right - mw;
      if (left < 4) left = 4;
      let top = r.bottom + 4;
      menu.style.cssText = `position:fixed;z-index:10000;width:${mw}px;top:${top}px;left:${left}px;`;

      requestAnimationFrame(() => {
        const _close = (ev) => {
          if (!menu.contains(ev.target) && !btn.contains(ev.target)) {
            menu.remove();
            document.removeEventListener("mousedown", _close, true);
          }
        };
        document.addEventListener("mousedown", _close, true);
      });
    });
  }

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
