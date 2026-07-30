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
        ${App.t("variables")}
        <button class="btn btn-sm p-0 border-0" id="add-variable-btn" title="${App.t("addVariable")}" style="color:var(--accent);font-size:14px;background:none;">
          <i class="bi bi-plus-lg"></i>
        </button>
      </div>`;
    Object.keys(App.VARIABLES).forEach((key) => {
      const row = document.createElement("div");
      row.className = "var-row";
      row.innerHTML =
        '<span class="var-key">{{' + key + "}}</span>" +
        '<input type="text" class="form-control form-control-sm var-value" data-var-key="' + key + '" value="' + App.escapeAttr(App.VARIABLES[key]) + '">' +
        '<button class="btn btn-sm p-0 border-0 var-delete-btn" data-var-key="' + key + '" title="' + App.t("delete") + '" style="color:var(--text-dim);font-size:12px;"><i class="bi bi-x"></i></button>';

      // Значение переменной — сохраняем на диск, иначе терялось при перезапуске
      row.querySelector(".var-value").addEventListener("change", (e) => {
        App.VARIABLES[key] = e.target.value;
        App.saveCollections();
      });

      row.querySelector(".var-delete-btn").addEventListener("click", async () => {
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
      varsBlock.appendChild(row);
    });
    varsBlock.querySelector("#add-variable-btn").addEventListener("click", async () => {
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
    root.appendChild(varsBlock);

    // --- Toolbar: New / Import / Export All ---
    const toolbar = document.createElement("div");
    toolbar.className = "d-flex gap-1 mb-2";
    toolbar.innerHTML = `
      <button class="btn btn-sm flex-grow-1" id="new-collection-btn"
        style="color:var(--accent);border:1px dashed var(--border-color);font-size:12px;background:transparent;">
        <i class="bi bi-plus-lg me-1"></i> ${App.t("newCollection")}
      </button>
      <button class="btn btn-sm" id="import-collection-btn" title="${App.t("importCollection")}"
        style="color:var(--text-dim);border:1px dashed var(--border-color);font-size:12px;background:transparent;">
        <i class="bi bi-box-arrow-in-down"></i>
      </button>
      <button class="btn btn-sm" id="export-all-btn" title="${App.t("exportAll")}"
        style="color:var(--text-dim);border:1px dashed var(--border-color);font-size:12px;background:transparent;">
        <i class="bi bi-box-arrow-up"></i>
      </button>
      <button class="btn btn-sm" id="import-swagger-btn" title="${App.t("importSwagger")}"
        style="color:var(--accent);border:1px dashed var(--border-color);font-size:12px;background:transparent;">
        <i class="bi bi-file-earmark-code"></i>
      </button>`;

    toolbar.querySelector("#new-collection-btn").addEventListener("click", async () => {
      const name = await App.showPrompt({
        title: App.t("newCollection"),
        label: App.t("collectionName"),
        placeholder: "My API",
      });
      if (name) App.addCollection(name);
    });

    toolbar.querySelector("#import-collection-btn").addEventListener("click", async () => {
      const res = await App.importCollections({ mergeVariables: true });
      if (res.cancelled) return;
      if (res.ok) App.showAlert(App.t("importCollection") + ": " + res.added.join(", "));
      else App.showAlert(App.t("error") + ": " + res.error);
    });

    toolbar.querySelector("#export-all-btn").addEventListener("click", async () => {
      if (!App.USER_COLLECTIONS.length) { App.showAlert(App.t("exportAll") + " — " + App.t("none")); return; }
      const res = await App.exportCollections(null);
      if (res.cancelled) return;
      if (res.ok) App.showAlert(res.path || "OK");
      else App.showAlert(App.t("error") + ": " + res.error);
    });

    root.appendChild(toolbar);

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

      const actions = document.createElement("div");
      actions.className = "row-actions";

      // Экспорт доступен для любой коллекции (включая встроенную)
      const exportBtn = document.createElement("button");
      exportBtn.className = "btn btn-sm p-0 border-0";
      exportBtn.title = App.t("exportOne");
      exportBtn.style.cssText = "color:var(--text-dim);font-size:12px;background:none;";
      exportBtn.innerHTML = '<i class="bi bi-box-arrow-up"></i>';
      exportBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const res = await App.exportCollections(collection);
        if (res.cancelled) return;
        if (res.ok) App.showAlert(res.path || "OK");
        else App.showAlert(App.t("error") + ": " + res.error);
      });
      actions.appendChild(exportBtn);

      if (isUser) {
        const userActions = document.createElement("div");
        userActions.innerHTML = `
          <button class="btn btn-sm p-0 border-0" title="${App.t("addFolder")}" style="color:var(--accent);font-size:12px;background:none;"><i class="bi bi-folder-plus"></i></button>
          <button class="btn btn-sm p-0 border-0" title="${App.t("rename")}" style="color:var(--text-dim);font-size:12px;background:none;"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm p-0 border-0" title="${App.t("delete")}" style="color:var(--text-dim);font-size:12px;background:none;"><i class="bi bi-trash3"></i></button>`;
        const [addFolderBtn, renameBtn, deleteBtn] = userActions.querySelectorAll("button");

        addFolderBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const n = await App.showPrompt({ title: App.t("addFolder"), label: App.t("folderName") });
          if (n) App.addFolder(collection, n);
        });
        renameBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const n = await App.showPrompt({ title: App.t("rename"), label: App.t("newName"), value: collection.name });
          if (n) App.renameCollection(userIdx, n);
        });
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await App.showConfirm({
            title: App.t("delete"),
            message: `"${collection.name}" — ${App.t("delete")}?`,
            okText: App.t("delete"), danger: true,
          });
          if (ok) App.deleteCollection(userIdx);
        });

        while (userActions.firstChild) actions.appendChild(userActions.firstChild);
      }

      colTitle.appendChild(actions);
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
          fActions.className = "row-actions";
          fActions.innerHTML = `
            <button class="btn btn-sm p-0 border-0" title="${App.t("addRequest")}" style="color:var(--accent);font-size:11px;background:none;"><i class="bi bi-plus-lg"></i></button>
            <button class="btn btn-sm p-0 border-0" title="${App.t("rename")}" style="color:var(--text-dim);font-size:11px;background:none;"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm p-0 border-0" title="${App.t("delete")}" style="color:var(--text-dim);font-size:11px;background:none;"><i class="bi bi-trash3"></i></button>`;
          const [addReqBtn, renameFolderBtn, deleteFolderBtn] = fActions.querySelectorAll("button");

          addReqBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            _editRequestDialog(folder, -1);
          });
          renameFolderBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const n = await App.showPrompt({ title: App.t("rename"), label: App.t("newFolderName"), value: folder.name });
            if (n) App.renameFolder(collection, folderIdx, n);
          });
          deleteFolderBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const ok = await App.showConfirm({
              title: App.t("delete"),
              message: `"${folder.name}" — ${App.t("delete")}?`,
              okText: App.t("delete"), danger: true,
            });
            if (ok) App.deleteFolder(collection, folderIdx);
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
              // Метаданные полей из Swagger — рандомайзер возьмёт типы отсюда
              schema: entry.schema || null,
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
            iActions.className = "row-actions";
            iActions.innerHTML = `
              <button class="btn btn-sm p-0 border-0" title="${App.t("edit")}" style="color:var(--text-dim);font-size:10px;background:none;"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm p-0 border-0" title="${App.t("delete")}" style="color:var(--text-dim);font-size:10px;background:none;"><i class="bi bi-trash3"></i></button>`;
            const [editBtn, delBtn] = iActions.querySelectorAll("button");
            editBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              _editRequestDialog(folder, itemIdx);
            });
            delBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const ok = await App.showConfirm({
                title: App.t("delete"),
                message: `"${entry.name}" — ${App.t("delete")}?`,
                okText: App.t("delete"), danger: true,
              });
              if (ok) App.deleteRequest(folder, itemIdx);
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
  // REQUEST EDITOR — одна модалка со всеми полями
  // ============================================================
  async function _editRequestDialog(folder, itemIdx) {
    const isEdit = itemIdx >= 0;
    const existing = isEdit ? folder.items[itemIdx] : null;
    const entry = await App.showRequestEditor(existing);
    if (!entry) return;
    if (isEdit) App.editRequest(folder, itemIdx, entry);
    else App.addRequest(folder, entry);
  }
})();
