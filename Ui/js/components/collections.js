window.App = window.App || {};

App.renderCollections = function () {
  const root = document.getElementById("collections-tree");
  root.innerHTML = "";
  App.DEMO_COLLECTION.forEach((entry) => {
    const el = document.createElement("div");
    el.className = "collection-item";
    const colorVar = App.METHOD_COLOR_VAR[entry.method] || "--text-dim";
    el.innerHTML = '<span class="collection-method-badge" style="color:var(' + colorVar + ');border:1px solid var(' + colorVar + ')">' + entry.method + '</span><span>' + entry.name + '</span>';
    el.addEventListener("click", () => {
      App.addTab({ method: entry.method, url: entry.url, headers: [{ key: "Content-Type", value: "application/json" }] });
    });
    el.addEventListener("mouseenter", () => App.scheduleHoverPreview(el, App.previewHtml(entry.method, entry.url)));
    el.addEventListener("mouseleave", App.clearHoverPreview);
    root.appendChild(el);
  });
};
