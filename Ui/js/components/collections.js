window.App = window.App || {};

App.renderCollections = function () {
  const root = document.getElementById("collections-tree");
  root.innerHTML = "";

  const varsBlock = document.createElement("div");
  varsBlock.className = "sidebar-vars mb-3";
  varsBlock.innerHTML = '<div class="sidebar-section-title">Variables</div>';
  Object.keys(App.VARIABLES).forEach((key) => {
    const row = document.createElement("div");
    row.className = "var-row";
    row.innerHTML =
      '<span class="var-key">{{' + key + "}}</span>" +
      '<input type="text" class="form-control form-control-sm var-value" data-var-key="' + key + '" value="' + App.escapeAttr(App.VARIABLES[key]) + '">';
    row.querySelector(".var-value").addEventListener("change", (e) => {
      App.VARIABLES[key] = e.target.value;
    });
    varsBlock.appendChild(row);
  });
  root.appendChild(varsBlock);

  App.COLLECTIONS.forEach((collection) => {
    const colEl = document.createElement("div");
    colEl.className = "collection-group";

    const colTitle = document.createElement("div");
    colTitle.className = "collection-group-title";
    colTitle.textContent = collection.name;
    colEl.appendChild(colTitle);

    collection.folders.forEach((folder) => {
      const folderKey = collection.name + "::" + folder.name;
      const isOpen = App.state.expandedFolders[folderKey] !== false;

      const folderEl = document.createElement("div");
      folderEl.className = "collection-folder";

      const folderHeader = document.createElement("div");
      folderHeader.className = "collection-folder-header";
      folderHeader.innerHTML =
        '<i class="bi bi-chevron-' + (isOpen ? "down" : "right") + ' folder-chevron"></i>' +
        '<i class="bi bi-folder2"></i>' +
        "<span>" + folder.name + "</span>";
      folderHeader.addEventListener("click", () => {
        App.state.expandedFolders[folderKey] = !App.state.expandedFolders[folderKey];
        App.renderCollections();
      });
      folderEl.appendChild(folderHeader);

      const itemsEl = document.createElement("div");
      itemsEl.className = "collection-folder-items" + (isOpen ? "" : " d-none");

      folder.items.forEach((entry) => {
        const url = App.resolveVariables(entry.url);
        const el = document.createElement("div");
        el.className = "collection-item";
        const colorVar = App.METHOD_COLOR_VAR[entry.method] || "--text-dim";
        el.innerHTML =
          '<span class="collection-method-badge" style="color:var(' + colorVar + ');border:1px solid var(' + colorVar + ')">' +
          entry.method +
          "</span><span>" +
          entry.name +
          "</span>";

        el.addEventListener("click", () => {
          const overrides = {
            method: entry.method,
            url,
            headers: [{ key: "Content-Type", value: "application/json" }],
            crudEntity: folder.entity || null,
            crudAction: entry.crud || null,
          };
          if (entry.body) {
            overrides.body = entry.body;
            overrides.activeSubTab = "body";
          }
          if (entry.method === "POST" || entry.method === "PUT" || entry.method === "PATCH") {
            overrides.activeSubTab = "body";
          }
          App.addTab(overrides);
        });

        el.addEventListener("mouseenter", () => App.scheduleHoverPreview(el, App.previewHtml(entry.method, url)));
        el.addEventListener("mouseleave", App.clearHoverPreview);
        itemsEl.appendChild(el);
      });

      folderEl.appendChild(itemsEl);
      colEl.appendChild(folderEl);
    });

    root.appendChild(colEl);
  });
};
