window.App = window.App || {};

App.sendRequest = async function (tabId) {
  const tab = App.state.tabs.find((t) => t.id === tabId);
  if (!tab || !tab.url.trim()) return;
  if (!window.pywebview) return;

  if (["POST", "PUT", "PATCH"].includes(tab.method) && tab.body.trim()) {
    const parsed = App.tryParseJson(tab.body);
    if (parsed === null) {
      tab.response = { ok: false, error: "Invalid JSON in request body" };
      App.renderTabContent();
      return;
    }
  }

  tab.sending = true;
  App.renderTabContent();

  const headersObj = {};
  tab.headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });
  const paramsObj = {};
  tab.params.forEach((p) => { if (p.key.trim()) paramsObj[p.key.trim()] = p.value; });

  // Inject User-Agent if set
  if (tab.userAgent) {
    headersObj["User-Agent"] = tab.userAgent;
  }

  const requestStart = Date.now();
  try {
    tab.response = await window.pywebview.api.send_request(
      tab.method, tab.url.trim(), headersObj, paramsObj, tab.body.trim() || null
    );
    if (tab.response.ok && App.getResponseEntities(tab) && tab.crudEntity) {
      tab.responseViewMode = "table";
    }
  } catch (err) {
    tab.response = { ok: false, error: String(err) };
  }
  tab.sending = false;

  // Record metrics
  if (App.recordMetric) {
    const resp = tab.response || {};
    App.recordMetric({
      method: tab.method,
      url: tab.url.trim(),
      status: resp.status_code || 0,
      elapsed_ms: resp.elapsed_ms || (Date.now() - requestStart),
      size: resp.text ? resp.text.length : 0,
      ok: !!resp.ok,
      timestamp: Date.now(),
    });
  }

  App.renderTabContent();
};
