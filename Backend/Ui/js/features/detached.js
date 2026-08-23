window.App = window.App || {};

App.detachTab = async function (id) {
  const tab = App.state.tabs.find((t) => t.id === id);
  if (!tab) return;
  if (!window.pywebview) return;

  const payload = {
    method: tab.method,
    url: tab.url,
    params: tab.params,
    headers: tab.headers,
    body: tab.body,
  };
  App.closeTab(id);
  await window.pywebview.api.open_detached_window(payload);
};

App.syncDetachedStateToHost = function () {
  if (!App.state.isDetachedWindow || !window.pywebview?.api?.sync_detached_state) return;
  const state = window.getDetachedTabState();
  if (!state) return;
  window.pywebview.api.sync_detached_state(JSON.stringify(state));
};

let detachedSyncTimer = null;
App.scheduleDetachedStateSync = function () {
  if (!App.state.isDetachedWindow) return;
  clearTimeout(detachedSyncTimer);
  detachedSyncTimer = setTimeout(() => App.syncDetachedStateToHost(), 250);
};

document.addEventListener("input", () => App.scheduleDetachedStateSync(), true);
document.addEventListener("change", () => App.scheduleDetachedStateSync(), true);

window.loadDetachedTab = function (tabState) {
  App.state.isDetachedWindow = true;
  App.state.tabs = [];
  App.addTab({
    method: tabState.method || "GET",
    url: tabState.url || "",
    params: tabState.params || [],
    headers: tabState.headers || [],
    body: tabState.body || "",
  });
  App.syncDetachedStateToHost();
  const returnBtn = document.getElementById("return-to-main-btn");
  if (returnBtn) returnBtn.style.display = "inline-flex";
};

window.getDetachedTabState = function () {
  const tab = App.state.tabs[0];
  if (!tab) return null;
  return {
    method: tab.method,
    url: tab.url,
    params: tab.params,
    headers: tab.headers,
    body: tab.body,
  };
};

window.addReturnedTab = function (tabState) {
  App.addTab(tabState);
};

(function patchRenderAllForDetachedSync() {
  function install() {
    if (!App.renderAll || App.renderAll._detachedPatched) return;
    const orig = App.renderAll;
    // Пробрасываем аргументы (...args). Сейчас renderAll вызывается без них,
    // но ровно такая обёртка вокруг sendRequest в scriptConsole.js глотала
    // второй аргумент — и авто-обновление токена уходило в бесконечный цикл.
    // Пусть эта мина не ждёт своего часа.
    App.renderAll = function (...args) {
      const result = orig.apply(App, args);
      App.syncDetachedStateToHost();
      return result;
    };
    App.renderAll._detachedPatched = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
