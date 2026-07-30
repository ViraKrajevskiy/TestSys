window.App = window.App || {};

(function () {
  // ============================================================
  // RENDER
  // ============================================================
  App.renderCollections = function () {
    const root = document.getElementById("collections-tree");
    root.innerHTML = "";

    // --- Variables block ---
    const varsBlock = document.createElement("div");
    varsBlock.className = "sidebar-vars mb-3";
    varsBlock.innerHTML = `
      <div class="sidebar-section-title d-flex justify-content-between align-items-center">
        Variables
        <button class="btn btn-sm p-0 border-0" id="add-variable-btn" title="Добавить переменную" style="color:var(--accent);font-size:14px;background:none;">
          <i class="bi bi-plus-lg"></i>
        </button>
      </div>`;
    Object.keys(App.VARIABLES).forEach((key) => {
      const row = document.createElement("div");
      row.className = "var-row";
      row.innerHTML =
        '<span class="var-key">{{' + key + "}}</span>" +
        '<input type="text" class="form-control form-control-sm var-value" data-var-key="' + key + '" value="' + App.escapeAttr(App.VARIABLES[key]) + '">' +
        '<button class="btn btn-sm p-0 border-0 var-delete-btn" data-var-key="' + key + '" title="Удалить" style="color:var(--text-dim);font-size:12px;"><i class="bi bi-x"></i></button>';
      row.querySelector(".var-value").addEventListener("change", (e) => {
        App.VARIABLES[key] = e.target.value;
      });
      row.querySelector(".var-delete-btn").addEventListener("click", () => {
        delete App.VARIABLES[key];
        App.renderCollections();
      });
      varsBlock.appendChild(row);
    });
    varsBlock.querySelector("#add-variable-btn").addEventListener("click", () => {
      const name = prompt("Имя переменной:");
      if (!name || !name.trim()) return;
      const k = name.trim().replace(/[{}]/g, "");
      App.VARIABLES[k] = "";
      App.renderCollections();
    });
    root.appendChild(varsBlock);

    // --- "Add Collection" button ---
    const addColBtn = document.createElement("button");
    addColBtn.className = "btn btn-sm w-100 mb-2";
    addColBtn.style.cssText = "color:var(--accent);border:1px dashed var(--border-color);font-size:12px;background:transparent;";
    addColBtn.innerHTML = '<i class="bi bi-plus-lg me-1"></i> New Collection';
    addColBtn.addEventListener("click", () => {
      const name = prompt("Имя коллекции:");
      if (name) App.addCollection(name);
    });
    root.appendChild(addColBtn);

    // --- Collections ---
    App.COLLECTIONS.forEach((collection, colGlobalIdx) => {
      const isUser = !collection.builtin;
      const userIdx = isUser ? App.USER_COLLECTIONS.indexOf(collection) : -1;

      const colEl = document.createElement("div");
      colEl.className = "collection-group";

      // Collection title
      const colTitle = document.createElement("div");
      colTitle.className = "collection-group-title d-flex justify-content-between align-items-center";
      colTitle.innerHTML = '<span>' + App.escapeHtml(collection.name) + '</span>';

      if (isUser) {
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:2px;";
        actions.innerHTML = `
          <button class="btn btn-sm p-0 border-0" title="Добавить папку" style="color:var(--accent);font-size:12px;background:none;"><i class="bi bi-folder-plus"></i></button>
          <button class="btn btn-sm p-0 border-0" title="Переименовать" style="color:var(--text-dim);font-size:12px;background:none;"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm p-0 border-0" title="Удалить" style="color:var(--text-dim);font-size:12px;background:none;"><i class="bi bi-trash3"></i></button>`;
        const [addFolderBtn, renameBtn, deleteBtn] = actions.querySelectorAll("button");

        addFolderBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const n = prompt("Имя папки:");
          if (n) App.addFolder(collection, n);
        });
        renameBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const n = prompt("Новое имя:", collection.name);
          if (n) App.renameCollection(userIdx, n);
        });
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm('Удалить коллекцию "' + collection.name + '"?')) App.deleteCollection(userIdx);
        });

        colTitle.appendChild(actions);
      }
      colEl.appendChild(colTitle);

      // Folders
      collection.folders.forEach((folder, folderIdx) => {
        const folderKey = collection.name + "::" + folder.name;
        const isOpen = App.state.expandedFolders[folderKey] !== false;

        const folderEl = document.createElement("div");
        folderEl.className = "collection-folder";

        const folderHeader = document.createElement("div");
        folderHeader.className = "collection-folder-header d-flex justify-content-between align-items-center";
        folderHeader.innerHTML =
          '<div style="display:flex;align-items:center;gap:4px;flex:1;cursor:pointer;" class="folder-toggle">' +
            '<i class="bi bi-chevron-' + (isOpen ? "down" : "right") + ' folder-chevron"></i>' +
            '<i class="bi bi-folder2"></i>' +
            "<span>" + App.escapeHtml(folder.name) + "</span>" +
          '</div>';

        if (isUser) {
          const fActions = document.createElement("div");
          fActions.style.cssText = "display:flex;gap:2px;";
          fActions.innerHTML = `
            <button class="btn btn-sm p-0 border-0" title="Добавить запрос" style="color:var(--accent);font-size:11px;background:none;"><i class="bi bi-plus-lg"></i></button>
            <button class="btn btn-sm p-0 border-0" title="Переименовать" style="color:var(--text-dim);font-size:11px;background:none;"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm p-0 border-0" title="Удалить" style="color:var(--text-dim);font-size:11px;background:none;"><i class="bi bi-trash3"></i></button>`;
          const [addReqBtn, renameFolderBtn, deleteFolderBtn] = fActions.querySelectorAll("button");

          addReqBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            _showRequestEditor(folder, -1, collection);
          });
          renameFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const n = prompt("Новое имя папки:", folder.name);
            if (n) App.renameFolder(collection, folderIdx, n);
          });
          deleteFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm('Удалить папку "' + folder.name + '"?')) App.deleteFolder(collection, folderIdx);
          });

          folderHeader.appendChild(fActions);
        }

        folderHeader.querySelector(".folder-toggle").addEventListener("click", () => {
          App.state.expandedFolders[folderKey] = !App.state.expandedFolders[folderKey];
          App.renderCollections();
        });
        folderEl.appendChild(folderHeader);

        // Items
        const itemsEl = document.createElement("div");
        itemsEl.className = "collection-folder-items" + (isOpen ? "" : " d-none");

        folder.items.forEach((entry, itemIdx) => {
          const url = App.resolveVariables(entry.url);
          const el = document.createElement("div");
          el.className = "collection-item d-flex justify-content-between align-items-center";
          const colorVar = App.METHOD_COLOR_VAR[entry.method] || "--text-dim";

          const left = document.createElement("div");
          left.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;overflow:hidden;cursor:pointer;";
          left.innerHTML =
            '<span class="collection-method-badge" style="color:var(' + colorVar + ');border:1px solid var(' + colorVar + ')">' +
            entry.method + "</span><span style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" +
            App.escapeHtml(entry.name) + "</span>";

          left.addEventListener("click", () => {
            const overrides = {
              method: entry.method,
              url,
              headers: [{ key: "Content-Type", value: "application/json" }],
              crudEntity: folder.entity || null,
              crudAction: entry.crud || null,
            };
            if (entry.body) { overrides.body = entry.body; overrides.activeSubTab = "body"; }
            if (["POST", "PUT", "PATCH"].includes(entry.method)) overrides.activeSubTab = "body";
            App.addTab(overrides);
          });

          left.addEventListener("mouseenter", () => App.scheduleHoverPreview(left, App.previewHtml(entry.method, url)));
          left.addEventListener("mouseleave", App.clearHoverPreview);
          el.appendChild(left);

          if (isUser) {
            const iActions = document.createElement("div");
            iActions.style.cssText = "display:flex;gap:1px;flex-shrink:0;";
            iActions.innerHTML = `
              <button class="btn btn-sm p-0 border-0" title="Редактировать" style="color:var(--text-dim);font-size:10px;background:none;"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm p-0 border-0" title="Удалить" style="color:var(--text-dim);font-size:10px;background:none;"><i class="bi bi-trash3"></i></button>`;
            const [editBtn, delBtn] = iActions.querySelectorAll("button");
            editBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              _showRequestEditor(folder, itemIdx, collection);
            });
            delBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (confirm('Удалить "' + entry.name + '"?')) App.deleteRequest(folder, itemIdx);
            });
            el.appendChild(iActions);
          }

          itemsEl.appendChild(el);
        });

        folderEl.appendChild(itemsEl);
        colEl.appendChild(folderEl);
      });

      root.appendChild(colEl);
    });
  };

  // ============================================================
  // REQUEST EDITOR MODAL (inline)
  // ============================================================
  function _showRequestEditor(folder, itemIdx, collection) {
    const isEdit = itemIdx >= 0;
    const existing = isEdit ? folder.items[itemIdx] : null;

    const name = prompt(
      isEdit ? "Имя запроса:" : "Имя нового запроса:",
      existing ? existing.name : "New Request"
    );
    if (!name) return;

    const method = prompt("Метод (GET/POST/PUT/PATCH/DELETE):", existing ? existing.method : "GET");
    if (!method) return;
    const m = method.trim().toUpperCase();
    if (!["GET","POST","PUT","PATCH","DELETE"].includes(m)) { alert("Неверный метод!"); return; }

    const url = prompt("URL:", existing ? existing.url : "https://");
    if (!url) return;

    const entry = {
      method: m,
      name: name.trim(),
      url: url.trim(),
    };

    if (["POST","PUT","PATCH"].includes(m)) {
      const body = prompt("Body (JSON, пусто = без body):", existing ? existing.body || "" : "");
      if (body) entry.body = body;
    }

    if (isEdit) {
      App.editRequest(folder, itemIdx, entry);
    } else {
      App.addRequest(folder, entry);
    }
  }
})();
