window.App = window.App || {};

App.sendRequest = async function (tabId) {
  const tab = App.state.tabs.find((t) => t.id === tabId);
  if (!tab || !tab.url.trim()) return;
  if (!window.pywebview) return;

  tab.sending = true;
  App.renderTabContent();

  const headersObj = {};
  tab.headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });
  const paramsObj = {};
  tab.params.forEach((p) => { if (p.key.trim()) paramsObj[p.key.trim()] = p.value; });

  try {
    tab.response = await window.pywebview.api.send_request(
      tab.method, tab.url.trim(), headersObj, paramsObj, tab.body.trim() || null
    );
  } catch (err) {
    tab.response = { ok: false, error: String(err) };
  }
  tab.sending = false;
  App.renderTabContent();
};
