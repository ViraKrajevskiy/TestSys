/**
 * loadTest.js — Нагрузочное тестирование
 *
 * Что делаем:
 *   - Настоящий параллельный запуск через воркер-пул. Раньше был
 *     for-await серийный — это НЕ нагрузка, а пинг по очереди.
 *   - Несколько параллельных сессий (job manager): можно запустить один
 *     тест, оставить его крутиться в фоне и параллельно стартовать
 *     второй по другому запросу.
 *   - Фоновый режим: модалку можно закрыть, тест продолжает крутиться,
 *     прогресс виден в мини-индикаторе на кнопке в навбаре.
 *
 * Реально ли идёт нагрузка:
 *   Да. Каждый воркер параллельно вызывает window.pywebview.api.send_request,
 *   Python отправляет HTTP параллельно через requests в пуле потоков uvicorn.
 *   Раньше эффективная параллельность = 1 (serial). Теперь =
 *   settings.concurrency.
 *
 * Ограничения:
 *   - Всё живёт в WebView JS-потоке. RPS до ~1000-2000 req/s посильно;
 *     выше уже упирается в туда-обратно через pywebview bridge.
 *   - Для настоящих 10k+ RPS используйте CLI (Backend/cli.py) — там
 *     запросы идут напрямую из Python без JS-моста.
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _runs = new Map();       // id -> RunSession
  let _activeRunId = null;     // какая сессия сейчас показана в модалке
  let _renderTimer = null;     // единый таймер для throttle-рендера
  let _navIndicatorEl = null;  // мини-плашка в навбаре с прогрессом

  const RENDER_THROTTLE_MS = 250;   // как часто пересчитывать сводку/график

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  App.initLoadTest = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("load-modal"));

    document.addEventListener("click", (e) => {
      if (e.target.closest("#load-test-btn")) {
        e.preventDefault();
        App.showLoadTest();
      }
    });

    document.getElementById("load-start").addEventListener("click", _startCurrent);
    document.getElementById("load-stop").addEventListener("click", _stopCurrent);
    document.getElementById("load-export").addEventListener("click", _exportCsv);
    document.getElementById("load-clear").addEventListener("click", _clearCurrent);
    document.getElementById("load-background").addEventListener("click", _sendToBackground);
    document.getElementById("load-new-run").addEventListener("click", _prepareNewRun);
    document.getElementById("load-run-select").addEventListener("change", (e) => {
      _activeRunId = e.target.value || null;
      _renderAll();
    });

    // Показывать нужные поля по выбранному профилю
    const profSel = document.getElementById("load-profile");
    const syncProf = () => {
      const p = profSel.value;
      document.getElementById("load-rampup-wrap").style.display = p === "rampup" ? "" : "none";
      document.getElementById("load-spike-wrap").style.display  = p === "spike"  ? "" : "none";
    };
    profSel.addEventListener("change", syncProf);
    syncProf();

    _renderIndicator();
  };

  App.showLoadTest = function () {
    const tab = App.getActiveTab();
    if (!tab || !tab.url) {
      App.showAlert(App.t("loadNeedRequest"));
      return;
    }
    // Если сейчас нет активной сессии — привязываем к текущей вкладке
    if (!_activeRunId) _prepareNewRun();
    _renderAll();
    _modal.show();
  };

  // ============================================================
  // СЕССИИ
  // ============================================================
  function _newSession(tab) {
    const id = "run-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    return {
      id,
      label: `${tab.method} ${_shortUrl(tab.url)}`,
      tab: JSON.parse(JSON.stringify(tab)),   // snapshot — вкладка может меняться
      settings: null,
      results: [],
      running: false,
      aborted: false,
      startedAt: 0,
      finishedAt: 0,
      inFlight: 0,
      nextIdx: 0,
    };
  }

  function _prepareNewRun() {
    const tab = App.getActiveTab();
    if (!tab || !tab.url) return;
    const s = _newSession(tab);
    _runs.set(s.id, s);
    _activeRunId = s.id;
    _renderAll();
  }

  function _current() { return _runs.get(_activeRunId) || null; }

  function _shortUrl(u) {
    const r = String(u || "");
    return r.length > 40 ? r.slice(0, 37) + "…" : r;
  }

  // ============================================================
  // ЗАПУСК
  // ============================================================
  async function _startCurrent() {
    const run = _current();
    if (!run) { App.showAlert(App.t("loadNeedRequest")); return; }
    if (run.running) return;

    const settings = _readForm();
    if (!settings) return;

    // Если у сессии уже есть результаты, стартуем новую (не смешиваем)
    if (run.results.length > 0) {
      _prepareNewRun();
      return _startCurrent();
    }

    run.settings = settings;
    run.running = true;
    run.aborted = false;
    run.startedAt = performance.now();
    run.startedAtWall = Date.now();
    run.nextIdx = 0;
    run.workers = [];      // регистрируем всех воркеров, чтобы дождаться

    _renderPhase();
    _scheduleRender();
    _renderIndicator();

    const N = Math.min(settings.concurrency, settings.count);
    const spawn = () => {
      if (run.aborted || run.workers.length >= N) return;
      run.workers.push(_worker(run));
    };

    // Раскатка воркеров по профилю
    if (settings.profile === "rampup") {
      // Линейно набираем concurrency от 1 до N за rampupMs
      const interval = Math.max(5, settings.rampupMs / N);
      for (let w = 0; w < N; w++) setTimeout(spawn, Math.round(w * interval));
    } else if (settings.profile === "spike") {
      // Базовая нагрузка (2 воркера), потом через spikeAtMs — резкий выброс
      const baseline = Math.min(2, N);
      for (let w = 0; w < baseline; w++) spawn();
      setTimeout(() => {
        for (let w = baseline; w < N; w++) spawn();
      }, settings.spikeAtMs);
    } else {
      // constant — все сразу
      for (let w = 0; w < N; w++) spawn();
    }

    // Ждём завершения ВСЕХ, включая тех, кто заспаунится позже.
    // Обычный Promise.all(workers) взял бы только текущий срез.
    await _waitAllWorkers(run);

    run.running = false;
    run.finishedAt = performance.now();
    _renderPhase();
    _renderAll();
    _renderIndicator();
  }

  async function _waitAllWorkers(run) {
    // Постоянно дожидаемся текущего среза; если пока ждали, кто-то ещё
    // добавился — повторяем цикл. Так корректно завершается ramp-up/spike.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snapshot = run.workers.slice();
      if (!snapshot.length) { await _sleep(20); }
      else await Promise.all(snapshot);
      if (run.workers.length === snapshot.length) return;
    }
  }

  async function _worker(run) {
    while (!run.aborted) {
      const i = run.nextIdx++;
      if (i >= run.settings.count) break;

      run.inFlight++;
      const result = await _runOne(run.tab, run.settings);
      run.inFlight--;
      run.results.push(result);

      // Свежую rate-limit инфу вешаем на run, чтобы панель показала последнее
      if (result.rl && Object.keys(result.rl).length) run.lastRl = result.rl;

      _scheduleRender();
      _renderIndicator();

      // Уважаем Retry-After — если сервер попросил подождать, ждём столько,
      // сколько попросили, а не долбим дальше. Это правильное клиентское
      // поведение и способ не спровоцировать более жёсткий блок.
      if (result.retryAfterMs > 0 && run.settings.respectRetryAfter && !run.aborted) {
        run.throttledCount = (run.throttledCount || 0) + 1;
        await _sleepAbortable(result.retryAfterMs, run);
      } else if (run.settings.delayMs > 0 && !run.aborted && run.nextIdx < run.settings.count) {
        await _sleep(run.settings.delayMs);
      }
    }
  }

  /** sleep, который просыпается на abort — иначе Retry-After заморозит стоп на минуты */
  async function _sleepAbortable(ms, run) {
    const step = 100;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (run.aborted) return;
      await _sleep(Math.min(step, end - Date.now()));
    }
  }

  function _stopCurrent() {
    const run = _current();
    if (run) run.aborted = true;
  }

  /** Один запрос — с замером и валидацией через Tests-скрипт */
  async function _runOne(tab, settings) {
    const startedMs = performance.now();

    const resolve = App.resolveAll || App.resolveVariables || ((s) => s);
    const finalUrl = resolve(tab.url).trim();
    const finalBody = tab.body ? resolve(tab.body) : "";

    const pick = App.activeRows || ((rows) => (rows || []).filter(r => (r.key || "").trim()));
    const headersObj = {};
    pick(tab.headers).forEach(h => { headersObj[resolve(h.key).trim()] = resolve(h.value); });
    const paramsObj = {};
    pick(tab.params).forEach(p => { paramsObj[resolve(p.key).trim()] = resolve(p.value); });
    if (tab.userAgent) headersObj["User-Agent"] = resolve(tab.userAgent);

    let resp;
    try {
      resp = await window.pywebview.api.send_request(
        tab.method, finalUrl, headersObj, paramsObj, finalBody.trim() || null,
      );
    } catch (e) {
      return { ok: false, error: String(e), ms: performance.now() - startedMs, ts: Date.now() };
    }

    const ms = resp.elapsed_ms || Math.round(performance.now() - startedMs);

    // Достаём информацию о rate-limit и CDN — только read-only, для калибровки.
    // Ничего не подделываем, ничего не обходим — просто читаем что нам сказали.
    const rl = _extractRateLimit(resp.headers);

    // Tests-скрипт запускаем только если он есть — иначе трата времени на каждой итерации
    let testsOk = true, testError = "";
    if (tab.testScript && tab.testScript.trim() && App.runScript && resp.ok) {
      try {
        const testRes = App.runScript(tab.testScript, { source: "test", tab, response: resp });
        const failed = (testRes.tests || []).filter(t => !t.ok);
        if (!testRes.ok) { testsOk = false; testError = testRes.error; }
        else if (failed.length) { testsOk = false; testError = failed[0].name + " — " + (failed[0].error || ""); }
      } catch (e) {
        testsOk = false; testError = "script: " + String(e);
      }
    }

    const httpOk = resp.ok && (resp.status_code < 400);
    const status = resp.status_code || 0;
    // Если это 429/503 и есть Retry-After — вернём отдельным полем, чтобы воркер
    // мог честно подождать. Это НЕ обход лимита, это уважение к нему.
    const retryAfterMs = (status === 429 || status === 503) ? (rl.retryAfterMs || 0) : 0;

    return {
      ok: httpOk && testsOk,
      status,
      httpOk, testsOk, testError,
      ms,
      error: resp.ok ? "" : (resp.error || "").split("\n")[0],
      size: (resp.text || "").length,
      ts: Date.now(),
      rl,                    // info из заголовков для панели
      retryAfterMs,          // > 0 → воркер должен уважить
      throttled: retryAfterMs > 0 || status === 429,
    };
  }

  // ============================================================
  // RATE-LIMIT / CDN АНАЛИЗ (только чтение заголовков)
  // ============================================================
  function _extractRateLimit(headers) {
    const h = {};
    Object.entries(headers || {}).forEach(([k, v]) => { h[String(k).toLowerCase()] = v; });

    const info = {};
    // Стандарт draft: RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset.
    // Плюс исторические X-RateLimit-*, которые всё ещё используют GitHub, Stripe и др.
    const lim = h["ratelimit-limit"]     || h["x-ratelimit-limit"];
    const rem = h["ratelimit-remaining"] || h["x-ratelimit-remaining"];
    const rst = h["ratelimit-reset"]     || h["x-ratelimit-reset"];
    if (lim != null) info.limit     = _toNum(lim);
    if (rem != null) info.remaining = _toNum(rem);
    if (rst != null) info.resetAt   = _parseReset(rst);

    // Retry-After: секунды или HTTP-дата
    if (h["retry-after"] != null) info.retryAfterMs = _parseRetryAfter(h["retry-after"]);

    // CDN / прокси — полезно понимать, дошёл ли ты до origin
    if (h["cf-ray"])          info.cfRay       = String(h["cf-ray"]);
    if (h["cf-cache-status"]) info.cfCache     = String(h["cf-cache-status"]);
    if (h["x-cache"])         info.xCache      = String(h["x-cache"]);
    if (h["age"] != null)     info.age         = _toNum(h["age"]);
    if (h["server"])          info.server      = String(h["server"]);
    if (h["via"])             info.via         = String(h["via"]);

    return info;
  }

  function _toNum(v) {
    const n = Number(String(v).trim());
    return isFinite(n) ? n : String(v);
  }

  /** RateLimit-Reset может быть: секунд-до-сброса ИЛИ unix-timestamp. Оба поддерживаем. */
  function _parseReset(v) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    // Больше миллиарда — почти наверняка unix-время. Меньше — секунды до сброса.
    if (n > 1e9) return n * 1000;                // → ms unix
    return Date.now() + n * 1000;                // относительно теперь
  }

  /** Retry-After: "120" (секунды) или "Wed, 21 Oct 2015 07:28:00 GMT" (HTTP-дата). */
  function _parseRetryAfter(v) {
    const s = String(v).trim();
    const asNum = Number(s);
    if (isFinite(asNum)) return Math.max(0, asNum) * 1000;
    const t = Date.parse(s);
    if (!isNaN(t)) return Math.max(0, t - Date.now());
    return 0;
  }

  const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function _readForm() {
    const count       = clamp(+document.getElementById("load-count").value, 1, 100000);
    const concurrency = clamp(+document.getElementById("load-concurrency").value, 1, 500);
    const delayMs     = clamp(+document.getElementById("load-delay").value, 0, 60000);
    const profile     = document.getElementById("load-profile").value || "constant";
    const rampupMs    = clamp(+document.getElementById("load-rampup").value * 1000, 500, 600000);
    const spikeAtMs   = clamp(+document.getElementById("load-spike").value * 1000, 500, 600000);
    const respectRetryAfter = document.getElementById("load-respect-retry").checked;
    if (isNaN(count) || count < 1) { App.showAlert(App.t("loadBadCount")); return null; }
    return { count, concurrency, delayMs, profile, rampupMs, spikeAtMs, respectRetryAfter };
  }
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // ============================================================
  // ФОНОВЫЙ РЕЖИМ
  // ============================================================
  function _sendToBackground() {
    // Просто прячем модалку — тест продолжит крутиться, индикатор в навбаре
    // покажет прогресс, клик по нему снова откроет.
    _modal.hide();
  }

  /**
   * Обновить мини-индикатор в навбаре: количество активных сессий и
   * суммарный прогресс. Клик — снова открывает модалку с последней активной.
   */
  function _renderIndicator() {
    const btn = document.getElementById("load-test-btn");
    if (!btn) return;

    if (!_navIndicatorEl) {
      _navIndicatorEl = document.createElement("span");
      _navIndicatorEl.className = "load-nav-badge";
      _navIndicatorEl.style.display = "none";
      btn.style.position = "relative";
      btn.appendChild(_navIndicatorEl);
    }

    const active = [..._runs.values()].filter(r => r.running);
    if (!active.length) {
      _navIndicatorEl.style.display = "none";
      btn.classList.remove("load-nav-active");
      return;
    }

    const done = active.reduce((s, r) => s + r.results.length, 0);
    const total = active.reduce((s, r) => s + (r.settings ? r.settings.count : 0), 0);
    const pct = total ? Math.round(done / total * 100) : 0;

    _navIndicatorEl.textContent = active.length > 1
      ? `${active.length}·${pct}%`
      : `${pct}%`;
    _navIndicatorEl.style.display = "";
    _navIndicatorEl.title = `${active.length} ${App.t("loadRunning")} — ${done}/${total}`;
    btn.classList.add("load-nav-active");
  }

  // ============================================================
  // РЕНДЕР
  // ============================================================
  function _scheduleRender() {
    if (_renderTimer) return;
    _renderTimer = setTimeout(() => {
      _renderTimer = null;
      _renderAll();
    }, RENDER_THROTTLE_MS);
  }

  function _renderAll() {
    _renderRunSelector();
    _renderPhase();
    _renderProgress();
    _renderSummary();
    _renderChart();
    _renderErrors();
  }

  function _renderRunSelector() {
    const sel = document.getElementById("load-run-select");
    if (!sel) return;

    if (!_runs.size) {
      sel.innerHTML = `<option value="">${App.t("loadNoRuns") || "— нет сессий —"}</option>`;
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = [..._runs.values()].map(r => {
      const state = r.running ? "▶" : r.aborted ? "◼" : r.results.length ? "✓" : "○";
      return `<option value="${r.id}" ${r.id === _activeRunId ? "selected" : ""}>
                ${state} ${App.escapeHtml(r.label)}  (${r.results.length}${r.settings ? "/" + r.settings.count : ""})
              </option>`;
    }).join("");

    // Отображаем таргет активной сессии
    const run = _current();
    if (run) {
      document.getElementById("load-target").textContent = run.label;
      document.getElementById("load-has-tests").textContent =
        run.tab.testScript && run.tab.testScript.trim()
          ? "✓ " + App.t("loadWillUseTests")
          : "— " + App.t("loadNoTests");
    }
  }

  function _renderPhase() {
    const run = _current();
    const start = document.getElementById("load-start");
    const stop = document.getElementById("load-stop");
    const bg = document.getElementById("load-background");
    const status = document.getElementById("load-status");
    if (!start) return;

    const running = run && run.running;
    start.style.display  = running ? "none" : "";
    stop.style.display   = running ? ""    : "none";
    bg.style.display     = running ? ""    : "none";

    if (!run) { status.textContent = ""; return; }
    if (running) {
      status.textContent = App.t("loadRunning");
      status.style.color = "var(--accent)";
    } else if (run.aborted) {
      status.textContent = App.t("loadAborted"); status.style.color = "#ffc107";
    } else if (run.results.length && run.settings && run.results.length >= run.settings.count) {
      status.textContent = App.t("loadDone"); status.style.color = "#22c55e";
    } else {
      status.textContent = "";
    }
  }

  function _renderProgress() {
    const run = _current();
    const bar = document.getElementById("load-progress");
    const txt = document.getElementById("load-progress-text");
    if (!bar) return;
    if (!run || !run.settings) {
      bar.style.width = "0%"; txt.textContent = "—";
      return;
    }
    const done = run.results.length;
    const total = run.settings.count;
    const pct = total ? Math.round(done / total * 100) : 0;
    bar.style.width = pct + "%";
    txt.textContent = `${done} / ${total}  (${pct}%)  ${run.inFlight ? "· " + run.inFlight + " " + (App.t("inFlight") || "в полёте") : ""}`;
  }

  function _renderSummary() {
    const run = _current();
    const box = document.getElementById("load-summary");
    if (!run || !run.results.length) { box.innerHTML = ""; return; }

    const results = run.results;
    const total = results.length;
    const passList = results.filter(r => r.ok);
    const pass = passList.length;
    const fail = total - pass;

    // Все запросы
    const times = results.map(r => r.ms).sort((a, b) => a - b);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = times[0];
    const max = times[times.length - 1];
    const p50 = _pct(times, 50);
    const p95 = _pct(times, 95);
    const p99 = _pct(times, 99);

    // Только успешные — истинное поведение сервера, не искажённое быстрыми ошибками
    const okTimes = passList.map(r => r.ms).sort((a, b) => a - b);
    const okP50 = _pct(okTimes, 50);
    const okP95 = _pct(okTimes, 95);
    const okP99 = _pct(okTimes, 99);

    const byStatus = {};
    results.forEach(r => {
      const k = r.status || "ERR";
      byStatus[k] = (byStatus[k] || 0) + 1;
    });

    // RPS общий и «полезный» (только успешные)
    const elapsedMs = (run.running ? performance.now() : run.finishedAt) - run.startedAt;
    const rps       = elapsedMs > 0 ? (total / (elapsedMs / 1000)).toFixed(1) : "—";
    const rpsOk     = elapsedMs > 0 ? (pass  / (elapsedMs / 1000)).toFixed(1) : "—";

    const passPct = ((pass / total) * 100).toFixed(1);
    const throttled = run.throttledCount || 0;

    box.innerHTML = `
      ${_stat(App.t("total"), total, "bi-send")}
      ${_stat(App.t("successful"), `${pass} <small style="color:var(--text-dim);">(${passPct}%)</small>`, "bi-check-circle", "#22c55e")}
      ${_stat(App.t("failed"), fail, "bi-x-circle", fail ? "#dc3545" : "var(--text-dim)")}
      ${_stat("RPS", rps, "bi-lightning")}
      ${_stat(App.t("okRps") || "RPS OK", rpsOk, "bi-lightning-fill", pass < total ? "#22c55e" : "")}
      ${_stat(App.t("avgTime"), avg + " ms", "bi-clock")}
      ${_stat("min / max", `${min} / ${max} ms`, "bi-speedometer")}
      ${_stat("p50", p50 + " ms", "bi-graph-up")}
      ${_stat("p95", p95 + " ms", "bi-graph-up", p95 > 500 ? "#ffc107" : "")}
      ${_stat("p99", p99 + " ms", "bi-graph-up", p99 > 1000 ? "#dc3545" : "")}
      ${passList.length && passList.length !== total ? `
        ${_stat("p50 ✓", okP50 + " ms", "bi-check2-circle", "#22c55e")}
        ${_stat("p95 ✓", okP95 + " ms", "bi-check2-circle", "#22c55e")}
        ${_stat("p99 ✓", okP99 + " ms", "bi-check2-circle", "#22c55e")}
      ` : ""}
      ${throttled ? _stat(App.t("throttled") || "Retry-After", throttled + "×", "bi-hourglass-split", "#ffc107") : ""}
      <div class="load-status-dist">
        ${Object.entries(byStatus).map(([k, v]) => {
          const color = k === "ERR" ? "#dc3545"
            : String(k).charAt(0) === "2" ? "#22c55e"
            : String(k) === "429" ? "#ffc107"
            : String(k).charAt(0) === "4" ? "#ffc107"
            : String(k).charAt(0) === "5" ? "#dc3545" : "var(--text-dim)";
          return `<span class="load-status-chip" style="border-color:${color};color:${color};">${k}: ${v}</span>`;
        }).join("")}
      </div>
      ${_renderRateLimitPanel(run)}
      ${_renderHealthPlaques(results, total, pass, byStatus, p50, p95, p99, run.settings)}`;
  }

  /** Панель с последним состоянием rate-limit / CDN */
  function _renderRateLimitPanel(run) {
    const rl = run.lastRl;
    if (!rl || !Object.keys(rl).length) return "";
    const rows = [];

    if (rl.limit != null || rl.remaining != null) {
      const rem = rl.remaining != null ? rl.remaining : "?";
      const lim = rl.limit     != null ? rl.limit     : "?";
      const usedPct = (rl.limit && rl.remaining != null)
        ? Math.round((1 - rl.remaining / rl.limit) * 100) : null;
      rows.push(`<b>${App.t("rlBudget") || "Бюджет"}:</b> ${rem} / ${lim}${usedPct != null ? ` (${usedPct}% использовано)` : ""}`);
    }
    if (rl.resetAt) {
      const secs = Math.max(0, Math.round((rl.resetAt - Date.now()) / 1000));
      rows.push(`<b>${App.t("rlReset") || "Сброс через"}:</b> ${secs} ${App.t("seconds") || "с"}`);
    }
    if (rl.cfRay || rl.cfCache) {
      const bits = [];
      if (rl.cfCache) bits.push(`CF-Cache: <b>${rl.cfCache}</b>`);
      if (rl.cfRay)   bits.push(`CF-Ray: ${rl.cfRay}`);
      rows.push(bits.join(" · "));
    }
    if (rl.xCache) rows.push(`X-Cache: <b>${rl.xCache}</b>${rl.age != null ? ` (age ${rl.age}s)` : ""}`);
    if (rl.server) rows.push(`<span style="color:var(--text-dim);">Server: ${rl.server}</span>`);

    if (!rows.length) return "";
    return `<div class="load-rl-panel">
      <div class="load-rl-title"><i class="bi bi-shield-check"></i> ${App.t("rlPanelTitle") || "Rate-limit / CDN — из заголовков ответа"}</div>
      ${rows.map(r => `<div class="load-rl-row">${r}</div>`).join("")}
    </div>`;
  }

  /** Автоматические плашки: saturation, high tail latency, много ошибок */
  function _renderHealthPlaques(results, total, pass, byStatus, p50, p95, p99, settings) {
    const plaques = [];
    const failPct = ((total - pass) / total) * 100;

    // >5% ошибок — плохо
    if (failPct > 5) {
      plaques.push({
        kind: "danger",
        text: `${failPct.toFixed(1)}% ${App.t("failed").toLowerCase()} — ${
          byStatus["429"] ? App.t("rlLikelyRateLimit") || "похоже на rate-limit"
          : byStatus["ERR"] ? App.t("rlLikelyRefuse") || "сервер отказывает в соединениях"
          : App.t("rlLikelyServerErr") || "сервер отдаёт ошибки"
        }`,
      });
    }
    // p99 сильно больше p50 — хвост распределения улетел
    if (p50 > 0 && p99 > p50 * 6 && p99 > 500) {
      plaques.push({
        kind: "warn",
        text: (App.t("rlTailBlowup") || "Хвост p99/p50 = {ratio}×: очередь копится, часть запросов застревает")
              .replace("{ratio}", (p99 / p50).toFixed(1)),
      });
    }
    // Много 429
    if ((byStatus["429"] || 0) / total > 0.05) {
      plaques.push({
        kind: "warn",
        text: (App.t("rlManyRateLimit") || "429 ответов много: сервер вежливо просит замедлиться. Стоит снизить concurrency."),
      });
    }
    // Много ERR
    if ((byStatus["ERR"] || 0) / total > 0.05) {
      plaques.push({
        kind: "danger",
        text: (App.t("rlManyErr") || "Не долетает > 5%: перегрузили клиент/сеть/сервер. Реального теста сервиса тут нет."),
      });
    }

    if (!plaques.length) return "";
    return `<div class="load-health">
      ${plaques.map(p => `<div class="load-health-item load-h-${p.kind}"><i class="bi bi-info-circle"></i> ${p.text}</div>`).join("")}
    </div>`;
  }

  function _stat(label, value, icon, color) {
    return `
      <div class="load-stat">
        <i class="bi ${icon}" ${color ? `style="color:${color}"` : ""}></i>
        <div class="load-stat-label">${label}</div>
        <div class="load-stat-value" ${color ? `style="color:${color}"` : ""}>${value}</div>
      </div>`;
  }

  function _pct(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100));
    return sorted[i];
  }

  // ============================================================
  // ГРАФИК
  // ============================================================
  function _renderChart() {
    const run = _current();
    const svg = document.getElementById("load-chart");
    if (!svg) return;
    if (!run || !run.results.length) { svg.innerHTML = ""; return; }
    const results = run.results;

    const W = svg.clientWidth || 600, H = 180;
    const padL = 40, padR = 10, padT = 10, padB = 22;
    const chartW = W - padL - padR, chartH = H - padT - padB;

    // Для сессий > 500 точек прореживаем — рисуем не все, а bin-max по времени
    const N = results.length;
    let sampled = results;
    if (N > 500) {
      const bins = 500;
      const per = Math.ceil(N / bins);
      sampled = [];
      for (let b = 0; b < bins; b++) {
        const slice = results.slice(b * per, (b + 1) * per);
        if (!slice.length) break;
        // Берём худший в бине — так пики видны, никого не прячем
        const worst = slice.reduce((a, x) => x.ms > a.ms ? x : a, slice[0]);
        sampled.push(worst);
      }
    }

    const times = sampled.map(r => r.ms);
    const maxY = Math.max(1, Math.ceil(Math.max(...times) / 100) * 100);
    const stepX = chartW / Math.max(1, sampled.length - 1);

    let path = "";
    sampled.forEach((r, i) => {
      const x = padL + i * stepX;
      const y = padT + chartH - (r.ms / maxY) * chartH;
      path += (i ? " L " : "M ") + x.toFixed(1) + " " + y.toFixed(1);
    });

    let fails = "";
    sampled.forEach((r, i) => {
      if (r.ok) return;
      const x = padL + i * stepX;
      const y = padT + chartH - (r.ms / maxY) * chartH;
      fails += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#dc3545"/>`;
    });

    const ticks = [0, maxY / 2, maxY].map(v => {
      const y = padT + chartH - (v / maxY) * chartH;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="2,3"/>
              <text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--text-dim)" font-size="9">${v} ms</text>`;
    }).join("");

    svg.innerHTML = `
      ${ticks}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      ${fails}
      <text x="${padL}" y="${H - 4}" fill="var(--text-dim)" font-size="9">#1</text>
      <text x="${W - padR}" y="${H - 4}" text-anchor="end" fill="var(--text-dim)" font-size="9">#${N}${N !== sampled.length ? " (" + sampled.length + " " + (App.t("points") || "точек") + ")" : ""}</text>`;
  }

  // ============================================================
  // ОШИБКИ
  // ============================================================
  function _renderErrors() {
    const run = _current();
    const box = document.getElementById("load-errors");
    if (!run || !run.results.length) { box.innerHTML = ""; return; }

    const failed = run.results.filter(r => !r.ok);
    if (!failed.length) {
      box.innerHTML = `<div style="color:var(--text-dim);padding:12px;text-align:center;">${App.t("loadNoErrors")}</div>`;
      return;
    }

    const groups = {};
    failed.forEach(r => {
      const key = r.error || (r.testError ? "test: " + r.testError : String(r.status));
      if (!groups[key]) groups[key] = { count: 0, sample: r };
      groups[key].count++;
    });

    const list = Object.entries(groups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, g]) => `
        <div class="load-err-row">
          <span class="load-err-count">${g.count}×</span>
          <span class="load-err-key">${App.escapeHtml(key.slice(0, 200))}</span>
          <span class="load-err-status">${g.sample.status || "—"}</span>
        </div>`).join("");

    box.innerHTML = `
      <div class="load-err-head">${App.t("loadErrorTypes")}:</div>
      ${list}`;
  }

  // ============================================================
  // ЭКСПОРТ И ОЧИСТКА
  // ============================================================
  async function _exportCsv() {
    const run = _current();
    if (!run || !run.results.length) { App.showAlert(App.t("noMetrics")); return; }

    const SEP = ";";
    const esc = (v) => {
      const s = String(v ?? "");
      return /["\n;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [["#", "OK", "Status", "Time_ms", "Size", "Error", "Timestamp"]];
    run.results.forEach((r, i) => rows.push([
      i + 1, r.ok ? "1" : "0", r.status || "", r.ms, r.size || 0,
      r.error || r.testError || "",
      r.ts ? new Date(r.ts).toISOString() : "",
    ]));
    const csv = rows.map(r => r.map(esc).join(SEP)).join("\r\n");

    if (window.pywebview?.api?.save_text_file) {
      const res = await window.pywebview.api.save_text_file(
        "load-test.csv", csv, ["CSV (*.csv)", "All files (*.*)"]
      );
      if (res.ok) App.showAlert(res.path);
      else if (!res.cancelled) App.showAlert(App.t("error") + ": " + res.error);
    }
  }

  function _clearCurrent() {
    const run = _current();
    if (!run) return;
    if (run.running) return;    // защита — не даём стереть работающую сессию
    _runs.delete(run.id);
    // Переключаемся на следующую или создаём новую
    const rest = [..._runs.keys()];
    _activeRunId = rest[rest.length - 1] || null;
    if (!_activeRunId) _prepareNewRun();
    else _renderAll();
    _renderIndicator();
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div class="modal fade" id="load-modal" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-lightning-charge me-2"></i><span data-i18n="loadTest">Нагрузочное тестирование</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <div class="modal-body">
            <div class="d-flex align-items-center gap-2 mb-2">
              <label class="form-label mb-0" style="font-size:11px;color:var(--text-dim);white-space:nowrap;" data-i18n="session">Сессия:</label>
              <select id="load-run-select" class="form-select form-select-sm" style="flex:1;font-size:12px;"></select>
              <button class="btn btn-sm btn-outline-secondary" id="load-new-run" data-i18n-title="newSessionActive" title="Новая сессия под активную вкладку">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>

            <div class="load-target" id="load-target"></div>
            <div id="load-has-tests" style="font-size:11px;color:var(--text-dim);margin-bottom:12px;"></div>

            <div class="row g-2 mb-2">
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadCount">Количество запросов</label>
                <input type="number" class="form-control form-control-sm" id="load-count" value="100" min="1" max="100000">
              </div>
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadConcurrency">Параллельно</label>
                <input type="number" class="form-control form-control-sm" id="load-concurrency" value="10" min="1" max="500">
              </div>
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadDelay">Задержка на воркер (мс)</label>
                <input type="number" class="form-control form-control-sm" id="load-delay" value="0" min="0" max="60000">
              </div>
              <div class="col-md-3 d-flex align-items-end gap-2">
                <button class="btn send-btn btn-sm" id="load-start">
                  <i class="bi bi-play-fill"></i> <span data-i18n="loadStart">Запустить</span>
                </button>
                <button class="btn btn-outline-danger btn-sm" id="load-stop" style="display:none;">
                  <i class="bi bi-stop-fill"></i> <span data-i18n="loadStop">Остановить</span>
                </button>
                <button class="btn btn-outline-secondary btn-sm" id="load-background" style="display:none;"
                        data-i18n-title="minimizeBg" title="Свернуть — тест продолжит крутиться в фоне">
                  <i class="bi bi-arrow-down-square"></i>
                </button>
              </div>
            </div>

            <div class="row g-2 mb-2">
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadProfile">Профиль нагрузки</label>
                <select id="load-profile" class="form-select form-select-sm">
                  <option value="constant" data-i18n-opt="profConstant">Постоянная (сразу N)</option>
                  <option value="rampup"   data-i18n-opt="profRampup">Ramp-up (плавно 1→N)</option>
                  <option value="spike"    data-i18n-opt="profSpike">Spike (резкий выброс)</option>
                </select>
              </div>
              <div class="col-md-3" id="load-rampup-wrap" style="display:none;">
                <label class="form-label" style="font-size:12px;" data-i18n="loadRampupSec">Ramp-up за (сек)</label>
                <input type="number" class="form-control form-control-sm" id="load-rampup" value="10" min="1" max="600">
              </div>
              <div class="col-md-3" id="load-spike-wrap" style="display:none;">
                <label class="form-label" style="font-size:12px;" data-i18n="loadSpikeSec">Spike через (сек)</label>
                <input type="number" class="form-control form-control-sm" id="load-spike" value="5" min="1" max="600">
              </div>
              <div class="col-md-6 d-flex align-items-end">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="load-respect-retry" checked>
                  <label class="form-check-label" for="load-respect-retry" style="font-size:12px;" data-i18n="loadRespectRetry">
                    Уважать Retry-After
                  </label>
                </div>
              </div>
            </div>
            <div class="form-text" style="font-size:10px;margin-top:-6px;" data-i18n="loadConcurrencyHint">
              «Параллельно» — сколько запросов идёт одновременно. Реальную нагрузку создаёт именно это значение.
            </div>

            <span id="load-status" style="font-size:12px;font-weight:600;"></span>

            <div class="load-progress-wrap mt-2">
              <div class="load-progress-track"><div id="load-progress" class="load-progress-bar"></div></div>
              <div id="load-progress-text" class="load-progress-text">—</div>
            </div>

            <div id="load-summary" class="load-summary"></div>

            <div class="load-chart-wrap">
              <div class="load-chart-title">${App.t("loadChartTitle")}</div>
              <svg id="load-chart" width="100%" height="180"></svg>
            </div>

            <div id="load-errors" class="load-errors"></div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" id="load-clear" title="${'Удалить эту сессию'}">
              <i class="bi bi-trash3 me-1"></i><span data-i18n="clear">Очистить</span>
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="load-export">
              <i class="bi bi-download me-1"></i>CSV
            </button>
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="close">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
