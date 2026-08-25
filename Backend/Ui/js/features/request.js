window.App = window.App || {};

App.sendRequest = async function (tabId, opts) {
  const tab = App.state.tabs.find((t) => t.id === tabId);
  if (!tab || !tab.url.trim()) return;

  // Повторный заход после авто-обновления токена — чтобы не зациклиться
  const _authRetried = !!(opts && opts._authRetried);

  // Если pywebview ещё не готов (первые ~500мс после старта) —
  // ждём до 5 секунд вместо тихого return.
  // Раньше первый клик просто пропадал без какого-либо сигнала пользователю.
  if (!window.pywebview || typeof window.pywebview.api?.send_request !== "function") {
    tab.sending = true;
    App.renderTabContent();
    const api = await App.waitForApi("send_request", 5000);
    tab.sending = false;
    if (!api) {
      tab.response = {
        ok: false,
        error: App.t ? App.t("errNoBackend") : "Соединение с приложением не установлено",
      };
      App.renderTabContent();
      return;
    }
    // pywebview готов — продолжаем нормальный путь ниже
    App.renderTabContent();
  }

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

  // Схлопываем случайные двойные слэши: {{baseUrl}} с завершающим "/" плюс
  // путь, начинающийся с "/", давали "host//api/..." — сервер отвечал 404.
  // "://" в схеме и слэши внутри query-строки не трогаем.
  const _dedupeSlashes = (u) => {
    const q = u.indexOf("?");
    const head = q === -1 ? u : u.slice(0, q);
    const tail = q === -1 ? "" : u.slice(q);
    return head.replace(/([^:])\/{2,}/g, "$1/") + tail;
  };
  const finalUrl = _dedupeSlashes(resolve(tab.url).trim());
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

  // Если приложены файлы — уходит multipart, JSON body игнорируется на бэке,
  // поэтому и валидировать его нет смысла.
  const hasFiles = Array.isArray(tab.files) && tab.files.length > 0;

  // Проверяем JSON уже ПОСЛЕ подстановки — до неё тело может быть
  // невалидным из-за плейсхолдеров, и это нормально.
  if (!hasFiles && ["POST", "PUT", "PATCH"].includes(tab.method) && finalBody.trim()) {
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

  // Inject Auth headers / params
  if (App.applyAuthToRequest) {
    App.applyAuthToRequest(tab, headersObj, paramsObj, resolve);
  }

  // Inject User-Agent if set
  if (tab.userAgent) {
    headersObj["User-Agent"] = resolve(tab.userAgent);
  }

  // Multipart: подготавливаем список файлов (пропускаем без пути/поля) и
  // резолвим переменные в текстовых полях формы.
  let filesArr = null, formFieldsArr = null;
  if (hasFiles) {
    filesArr = tab.files
      .filter(f => f && f.path && (f.field || "").trim())
      .map(f => ({
        field: resolve(f.field).trim(),
        path: f.path,
        filename: f.name || undefined,
        content_type: (f.content_type || "").trim() || undefined,
      }));
    formFieldsArr = (tab.formFields || [])
      .filter(f => (f.enabled !== false) && (f.key || "").trim())
      .map(f => ({ key: resolve(f.key).trim(), value: resolve(f.value || "") }));
  }

  // Сохраняем то, что реально ушло — видно в панели ответа
  tab.lastSent = {
    url: finalUrl, body: finalBody, headers: headersObj, params: paramsObj,
    files: filesArr, formFields: formFieldsArr,
  };

  const requestStart = Date.now();
  try {
    // Без файлов зовём старую сигнатуру (5 аргументов) — совместимо со
    // сборками бэка без multipart. Extra args добавляем только если реально
    // отправляем файлы.
    // SSL-проверка и прокси — из настроек. verify_ssl по умолчанию true.
    const globalVerify = App.getSetting ? App.getSetting("verifySsl") !== false : true;
    // Чекбокс «Игнорировать SSL» на вкладке жёстко отключает проверку для
    // этого запроса — перебивает глобальную настройку.
    const verifySsl = tab.ignoreSsl ? false : globalVerify;
    const proxy = (App.getSetting && App.getSetting("proxyUrl")) || null;
    // По умолчанию идём по 3xx-редиректам; чекбокс на вкладке может выключить.
    const followRedirects = tab.followRedirects !== false;
    // Таймаут с вкладки переопределяет глобальный; пустой/0 = глобальный.
    const timeout = (tab.timeoutSec && Number(tab.timeoutSec) > 0) ? Number(tab.timeoutSec) : null;

    tab.response = hasFiles
      ? await window.pywebview.api.send_request(
          tab.method, finalUrl, headersObj, paramsObj, null,
          filesArr, formFieldsArr, verifySsl, proxy, followRedirects, timeout,
        )
      : await window.pywebview.api.send_request(
          tab.method, finalUrl, headersObj, paramsObj, finalBody.trim() || null,
          null, null, verifySsl, proxy, followRedirects, timeout,
        );
    if (tab.response.ok && App.getResponseEntities(tab) && tab.crudEntity) {
      tab.responseViewMode = "table";
    }
  } catch (err) {
    tab.response = { ok: false, error: String(err) };
    App.logError && App.logError("Request", `${tab.method} ${finalUrl} — ${err}`,
      err && err.stack ? err.stack : "");
  }

  // ── Авто-обновление токена при 401 ──────────────────────────────────────
  // Токен живёт недолго, и раньше приходилось вручную идти на login.
  // Если у коллекции настроен refresh — дёргаем его и повторяем запрос.
  // _authRetried не даёт зациклиться, если refresh тоже отдаёт 401.
  // Флаг держим НА ВКЛАДКЕ, а не только в аргументах: любой перехватчик
  // App.sendRequest (например, консоль скриптов) может не пробросить второй
  // аргумент — и защита от цикла молча исчезнет. Проверено на практике.
  // Любой успешный ответ означает, что авторизация снова работает —
  // снимаем предохранитель, накопленный прошлыми неудачами.
  if (tab.response && tab.response.ok && tab.response.status_code < 400
      && App.resetTokenRefreshState) {
    App.resetTokenRefreshState();
  }

  const alreadyRetrying = _authRetried || tab._authRetrying === true;

  if (!alreadyRetrying && tab.response && tab.response.ok && tab.response.status_code === 401
      && App.tryRefreshToken) {
    tab._authRetrying = true;
    try {
      const refreshed = await App.tryRefreshToken(tab);
      if (refreshed) {
        tab.sending = false;
        App.logWarn && App.logWarn("Auth", "Получен 401 — токен обновлён, повторяю запрос");
        const result = await App.sendRequest(tabId, { _authRetried: true });
        // Повтор со свежим токеном снова 401 — обновление не помогает.
        // Отмечаем, чтобы предохранитель отключил авто-refresh.
        if (tab.response && tab.response.status_code === 401 && App.markRefreshIneffective) {
          App.markRefreshIneffective();
        }
        return result;
      }
    } finally {
      tab._authRetrying = false;
    }
  }

  tab.sending = false;

  // История ответов: держим последние N — часто нужно «а что было 3 запроса назад».
  // Кладём копию с метаданными: время, метод, URL — чтобы список читался без клика.
  App.pushResponseHistory && App.pushResponseHistory(tab, tab.response, {
    method: tab.method, url: finalUrl,
  });

  // Test-скрипт запускаем ТОЛЬКО когда реально пришёл HTTP-ответ.
  // При обрыве соединения / таймауте (response.ok === false) ответа нет,
  // pm.response.status был бы undefined — и тесты падали бы с бессмысленным
  // «ожидался 200, получен undefined», пряча настоящую причину (сервер
  // недоступен). Ответ 4xx/5xx — это тоже ответ (ok === true), тесты для него
  // прогоняем как обычно: их часто и пишут под проверку 404/401 и т.п.
  if (tab.testScript && tab.response && tab.response.ok && App.runScript) {
    tab.lastTests = App.runScript(tab.testScript, {
      source: "test", tab, response: tab.response,
    });
  } else if (tab.testScript && tab.response && !tab.response.ok) {
    // Запрос не выполнился — помечаем тесты как пропущенные, чтобы UI показал
    // это явно, а не «0 прошло, N упало» против несуществующего ответа.
    tab.lastTests = {
      skipped: true,
      reason: (tab.response.error || "Запрос не выполнен").split("\n")[0],
      tests: [],
    };
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
