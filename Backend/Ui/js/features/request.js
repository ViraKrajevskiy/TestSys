window.App = window.App || {};

App.sendRequest = async function (tabId) {
  const tab = App.state.tabs.find((t) => t.id === tabId);
  if (!tab || !tab.url.trim()) return;
  if (!window.pywebview) return;

  // Pre-request script — ДО резолва переменных, чтобы скрипт мог
  // добавить/поменять переменные, заголовки и тело.
  if (tab.preScript && App.runScript) {
    const pre = App.runScript(tab.preScript, { source: "pre", tab });
    if (!pre.ok) {
      tab.response = {
        ok: false,
        error: (App.t ? App.t("preScriptFailed") : "Pre-request failed") + ":\n" + pre.error,
      };
      App.renderTabContent();
      return;
    }
  }

  // Резолв переменных: статические {{baseUrl}} + динамические {{$randomEmail}}.
  // Делается ОДИН раз на отправку — значения фиксируются, чтобы в логах и
  // метриках был тот же URL, который реально ушёл на сервер.
  const resolve = App.resolveAll || App.resolveVariables || ((s) => s);

  // Предупреждаем о неизвестных генераторах, но не блокируем отправку
  if (App.findUnknownDynamic) {
    const unknown = [
      ...App.findUnknownDynamic(tab.url),
      ...App.findUnknownDynamic(tab.body),
    ];
    if (unknown.length) {
      App.logWarn && App.logWarn("DynamicVars",
        "Неизвестные переменные: " + [...new Set(unknown)].map(u => `{{$${u}}}`).join(", "));
    }
  }

  const finalUrl = resolve(tab.url).trim();
  const finalBody = tab.body ? resolve(tab.body) : "";

  // Проверяем схему ДО отправки. Иначе requests отдаёт невнятное
  // "No connection adapters were found" — а на деле в URL просто заехал
  // лишний текст (например, случайно вставленная переменная).
  if (!/^https?:\/\//i.test(finalUrl)) {
    tab.response = {
      ok: false,
      error: `${App.t ? App.t("errBadUrl") : "Некорректный URL"}\n\n${finalUrl}`,
    };
    App.logError && App.logError("Request", `Некорректный URL: ${finalUrl}`);
    tab.sending = false;
    App.renderTabContent();
    return;
  }

  // Проверяем JSON уже ПОСЛЕ подстановки — до неё тело может быть
  // невалидным из-за плейсхолдеров, и это нормально.
  if (["POST", "PUT", "PATCH"].includes(tab.method) && finalBody.trim()) {
    const parsed = App.tryParseJson(finalBody);
    if (parsed === null) {
      tab.response = { ok: false, error: App.t ? App.t("errInvalidJsonBody") : "Invalid JSON in request body" };
      App.renderTabContent();
      return;
    }
  }

  tab.sending = true;
  App.renderTabContent();

  // Учитываем чекбоксы: выключенные и пустые строки в запрос не идут
  const pick = App.activeRows || ((rows) => (rows || []).filter(r => (r.key || "").trim()));
  const headersObj = {};
  pick(tab.headers).forEach((h) => { headersObj[resolve(h.key).trim()] = resolve(h.value); });
  const paramsObj = {};
  pick(tab.params).forEach((p) => { paramsObj[resolve(p.key).trim()] = resolve(p.value); });

  // Inject User-Agent if set
  if (tab.userAgent) {
    headersObj["User-Agent"] = resolve(tab.userAgent);
  }

  // Сохраняем то, что реально ушло — видно в панели ответа
  tab.lastSent = { url: finalUrl, body: finalBody, headers: headersObj, params: paramsObj };

  const requestStart = Date.now();
  try {
    tab.response = await window.pywebview.api.send_request(
      tab.method, finalUrl, headersObj, paramsObj, finalBody.trim() || null
    );
    if (tab.response.ok && App.getResponseEntities(tab) && tab.crudEntity) {
      tab.responseViewMode = "table";
    }
  } catch (err) {
    tab.response = { ok: false, error: String(err) };
    App.logError && App.logError("Request", `${tab.method} ${finalUrl} — ${err}`,
      err && err.stack ? err.stack : "");
  }
  tab.sending = false;

  // История ответов: держим последние N — часто нужно «а что было 3 запроса назад».
  // Кладём копию с метаданными: время, метод, URL — чтобы список читался без клика.
  App.pushResponseHistory && App.pushResponseHistory(tab, tab.response, {
    method: tab.method, url: finalUrl,
  });

  // Test-скрипт после ответа — assertions идут в tab.lastTests
  if (tab.testScript && tab.response && App.runScript) {
    tab.lastTests = App.runScript(tab.testScript, {
      source: "test", tab, response: tab.response,
    });
  } else {
    tab.lastTests = null;
  }

  // Логируем неуспешные ответы
  if (App.logError && tab.response) {
    if (!tab.response.ok) {
      App.logError("Request", `${tab.method} ${finalUrl} — ${tab.response.error}`);
    } else if (tab.response.status_code >= 400) {
      const lvl = tab.response.status_code >= 500 ? "logError" : "logWarn";
      App[lvl]("Request",
        `${tab.method} ${finalUrl} → ${tab.response.status_code} ${tab.response.reason || ""}`.trim());
    }
  }

  // Record metrics
  if (App.recordMetric) {
    const resp = tab.response || {};
    App.recordMetric({
      method: tab.method,
      url: finalUrl,
      status: resp.status_code || 0,
      elapsed_ms: resp.elapsed_ms || (Date.now() - requestStart),
      size: resp.text ? resp.text.length : 0,
      ok: !!resp.ok,
      timestamp: Date.now(),
    });
  }

  App.renderTabContent();
};
