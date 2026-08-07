/**
 * loadTest.js — Нагрузочное тестирование
 *
 * Возможности:
 *   - Воркер-пул с настраиваемым concurrency
 *   - Несколько запросов в одном тесте (round-robin)
 *   - Threshold / assertions (p95, p99, error%, min RPS)
 *   - Сохранение конфигураций в localStorage
 *   - Богатый график: scatter + rolling p50/p95 линии
 *   - Сравнение двух сессий бок о бок
 *   - Генерация CLI-команды (testsys load ...)
 *
 * Ограничения:
 *   - Всё живёт в WebView JS-потоке. RPS до ~1000-2000 req/s посильно;
 *     выше уже упирается в туда-обратно через pywebview bridge.
 *   - Для настоящих 10k+ RPS используйте CLI (Backend/cli.py load).
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _runs = new Map();       // id -> RunSession
  let _activeRunId = null;
  let _renderTimer = null;
  let _navIndicatorEl = null;

  const RENDER_THROTTLE_MS = 250;
  const CFG_KEY = "testsys_load_configs_v1";

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
    document.getElementById("load-cli").addEventListener("click", _copyCli);

    document.getElementById("load-run-select").addEventListener("change", (e) => {
      _activeRunId = e.target.value || null;
      _renderAll();
    });

    // Показывать нужные поля по профилю
    const profSel = document.getElementById("load-profile");
    const syncProf = () => {
      const p = profSel.value;
      document.getElementById("load-rampup-wrap").style.display = p === "rampup" ? "" : "none";
      document.getElementById("load-spike-wrap").style.display  = p === "spike"  ? "" : "none";
    };
    profSel.addEventListener("change", syncProf);
    syncProf();

    // Режим: по количеству / по длительности
    const modeSel = document.getElementById("load-mode");
    const syncMode = () => {
      const m = modeSel.value;
      document.getElementById("load-count-wrap").style.display    = m === "count"    ? "" : "none";
      document.getElementById("load-duration-wrap").style.display = m === "duration" ? "" : "none";
    };
    modeSel.addEventListener("change", syncMode);
    syncMode();

    // Мульти-запросы: показ/скрытие панели
    const multiToggle = document.getElementById("load-multi-mode");
    multiToggle.addEventListener("change", () => {
      document.getElementById("load-multi-panel").style.display = multiToggle.checked ? "" : "none";
      if (multiToggle.checked) _renderMultiList();
    });
    document.getElementById("load-multi-search").addEventListener("input", _renderMultiList);
    document.getElementById("load-multi-add-inline").addEventListener("click", _addInlineRequest);

    // Конфигурации
    document.getElementById("load-cfg-save").addEventListener("click", _saveConfig);
    document.getElementById("load-cfg-delete").addEventListener("click", _deleteConfig);
    document.getElementById("load-cfg-select").addEventListener("change", (e) => {
      if (e.target.value) _loadConfig(e.target.value);
    });
    _renderConfigSelect();

    // Сравнение
    document.getElementById("cmp-a").addEventListener("change", _renderCompare);
    document.getElementById("cmp-b").addEventListener("change", _renderCompare);

    _renderIndicator();
  };

  App.showLoadTest = function () {
    const tab = App.getActiveTab();
    if (!tab || !tab.url) {
      App.showAlert(App.t("loadNeedRequest"));
      return;
    }
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
      tab: JSON.parse(JSON.stringify(tab)),
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
  // МУЛЬТИ-ЗАПРОСЫ
  // ============================================================

  // Inline-запросы, добавленные прямо в панели (не из коллекций)
  let _inlineRequests = [];
  // Состояние раскрытия коллекций/папок в дереве
  const _multiTreeOpen = {};

  function _getAllRequests() {
    const out = [];
    // Сначала inline
    _inlineRequests.forEach((r, i) => {
      if (r.url) out.push({ ...r, _col: "—", _folder: "—", _inline: true, _inlineIdx: i });
    });
    // Потом из коллекций
    (App.COLLECTIONS || []).forEach(col => {
      (col.folders || []).forEach(folder => {
        (folder.items || []).forEach(item => {
          if (item.url) out.push({ ...item, _col: col.name, _folder: folder.name });
        });
      });
    });
    return out;
  }

  function _renderMultiList() {
    const container = document.getElementById("load-multi-list");
    const q = (document.getElementById("load-multi-search").value || "").toLowerCase();
    const allFlat = _getAllRequests();
    container.innerHTML = "";

    // ── Inline-запросы ──────────────────────────────────────
    if (_inlineRequests.length) {
      const inlineWrap = document.createElement("div");
      inlineWrap.className = "lm-tree-section";
      inlineWrap.innerHTML = `<div class="lm-tree-coll-head">
        <i class="bi bi-pencil-square me-1"></i>
        <span style="font-size:11px;font-weight:600;">Inline-запросы</span>
      </div>`;
      _inlineRequests.forEach((r, i) => {
        const flatIdx = allFlat.findIndex(x => x._inline && x._inlineIdx === i);
        const id = `multi-req-cb-${flatIdx}`;
        const row = document.createElement("div");
        row.className = "lm-tree-item";
        row.innerHTML = `
          <label class="load-multi-item" for="${id}" style="flex:1;margin:0;">
            <input type="checkbox" id="${id}" class="load-multi-cb" data-idx="${flatIdx}">
            <span><b style="color:var(--${_methodColor(r.method)});">${r.method || "GET"}</b> ${App.escapeHtml(_shortUrl(r.url))}</span>
          </label>
          <button class="lm-inline-del" data-inline-idx="${i}" title="Удалить"><i class="bi bi-x"></i></button>`;
        inlineWrap.appendChild(row);
      });
      container.appendChild(inlineWrap);
    }

    // ── Дерево коллекций ────────────────────────────────────
    (App.COLLECTIONS || []).forEach((col, colIdx) => {
      // Фильтрация папок/запросов
      const matchingFolders = (col.folders || []).map(folder => {
        const items = (folder.items || []).filter(item => {
          if (!item.url) return false;
          if (!q) return true;
          return (item.name || "").toLowerCase().includes(q) ||
                 (item.url || "").toLowerCase().includes(q) ||
                 (item.method || "").toLowerCase().includes(q) ||
                 col.name.toLowerCase().includes(q) ||
                 folder.name.toLowerCase().includes(q);
        });
        return { folder, items };
      }).filter(f => f.items.length);

      if (!matchingFolders.length && q) return; // нет совпадений — пропускаем

      const collKey = "coll_" + colIdx;
      const isCollOpen = _multiTreeOpen[collKey] !== false;

      const collWrap = document.createElement("div");
      collWrap.className = "lm-tree-section";

      const collHead = document.createElement("div");
      collHead.className = "lm-tree-coll-head";
      collHead.innerHTML = `
        <i class="bi bi-chevron-${isCollOpen ? "down" : "right"} lm-chevron"></i>
        <i class="bi bi-collection me-1" style="color:var(--accent);font-size:11px;"></i>
        <span style="font-size:11px;font-weight:600;">${App.escapeHtml(col.name)}</span>`;
      collHead.addEventListener("click", () => {
        _multiTreeOpen[collKey] = !isCollOpen;
        _renderMultiList();
      });
      collWrap.appendChild(collHead);

      if (isCollOpen) {
        const foldersToShow = q ? matchingFolders : (col.folders || []).map(folder => ({
          folder,
          items: (folder.items || []).filter(i => i.url),
        })).filter(f => f.items.length);

        foldersToShow.forEach(({ folder, items }, fi) => {
          const folderKey = collKey + "_f" + fi;
          const isFolderOpen = _multiTreeOpen[folderKey] !== false;

          const folderWrap = document.createElement("div");
          folderWrap.className = "lm-tree-folder";

          const folderHead = document.createElement("div");
          folderHead.className = "lm-tree-folder-head";
          folderHead.innerHTML = `
            <i class="bi bi-chevron-${isFolderOpen ? "down" : "right"} lm-chevron"></i>
            <i class="bi bi-folder2${isFolderOpen ? "-open" : ""} me-1" style="font-size:11px;color:var(--text-dim);"></i>
            <span style="font-size:11px;">${App.escapeHtml(folder.name)}</span>
            <span class="lm-folder-count">${items.length}</span>`;
          folderHead.addEventListener("click", () => {
            _multiTreeOpen[folderKey] = !isFolderOpen;
            _renderMultiList();
          });
          folderWrap.appendChild(folderHead);

          if (isFolderOpen) {
            items.forEach(item => {
              const flatIdx = allFlat.findIndex(x => !x._inline && x._col === col.name && x._folder === folder.name && x.url === item.url && x.name === item.name);
              const id = `multi-req-cb-${flatIdx}`;
              const row = document.createElement("label");
              row.className = "load-multi-item lm-tree-req";
              row.setAttribute("for", id);
              row.innerHTML = `
                <input type="checkbox" id="${id}" class="load-multi-cb" data-idx="${flatIdx}">
                <span class="lm-method-badge" style="color:var(--${_methodColor(item.method)});">${item.method || "GET"}</span>
                <span class="lm-req-name">${App.escapeHtml(item.name || _shortUrl(item.url))}</span>
                <span class="lm-req-url">${App.escapeHtml(_shortUrl(item.url))}</span>`;
              folderWrap.appendChild(row);
            });
          }
          collWrap.appendChild(folderWrap);
        });
      }
      container.appendChild(collWrap);
    });

    if (!container.children.length) {
      container.innerHTML = `<div style="color:var(--text-dim);padding:8px;font-size:12px;">${App.t("noRequestsYet")}</div>`;
    }

    // Навешиваем удаление inline
    container.querySelectorAll(".lm-inline-del").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        _inlineRequests.splice(+btn.dataset.inlineIdx, 1);
        _renderMultiList();
      });
    });
  }

  function _methodColor(method) {
    const map = { GET: "--method-get", POST: "--method-post", PUT: "--method-put",
                  DELETE: "--method-delete", PATCH: "--method-patch" };
    return map[(method || "GET").toUpperCase()] || "--text-dim";
  }

  function _getSelectedMultiRequests() {
    const all = _getAllRequests();
    return [...document.querySelectorAll(".load-multi-cb:checked")]
      .map(cb => all[+cb.dataset.idx])
      .filter(Boolean)
      .map(r => JSON.parse(JSON.stringify(r)));
  }

  /** Открывает mini-форму для добавления inline-запроса */
  async function _addInlineRequest() {
    const entry = await App.showRequestEditor(null);
    if (!entry) return;
    _inlineRequests.push(entry);
    _renderMultiList();
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

    // Если у сессии уже есть результаты — начинаем новую
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
    run.workers = [];
    run.deadlineAt = settings.mode === "duration"
      ? Date.now() + settings.durationMs
      : 0;

    _renderPhase();
    _scheduleRender();
    _renderIndicator();

    const N = settings.mode === "duration"
      ? settings.concurrency
      : Math.min(settings.concurrency, settings.count);

    const spawn = () => {
      if (run.aborted || run.workers.length >= N) return;
      run.workers.push(_worker(run));
    };

    if (settings.profile === "rampup") {
      const interval = Math.max(5, settings.rampupMs / N);
      for (let w = 0; w < N; w++) setTimeout(spawn, Math.round(w * interval));
    } else if (settings.profile === "spike") {
      const baseline = Math.min(2, N);
      for (let w = 0; w < baseline; w++) spawn();
      setTimeout(() => { for (let w = baseline; w < N; w++) spawn(); }, settings.spikeAtMs);
    } else {
      for (let w = 0; w < N; w++) spawn();
    }

    await _waitAllWorkers(run);

    if (run.running) {
      run.running = false;
      run.finishedAt = performance.now();
    }
    _renderPhase();
    _renderAll();
    _renderIndicator();
  }

  async function _waitAllWorkers(run) {
    while (true) {
      const snapshot = run.workers.slice();
      if (!snapshot.length) { await _sleep(20); }
      else await Promise.all(snapshot);
      if (run.workers.length === snapshot.length) return;
    }
  }

  async function _worker(run) {
    const s = run.settings;
    // Источники: несколько запросов или один (текущий таб)
    const sources = s.multiSources && s.multiSources.length ? s.multiSources : [run.tab];

    while (!run.aborted) {
      if (s.mode === "duration") {
        if (Date.now() >= run.deadlineAt) break;
      } else {
        if (run.nextIdx >= s.count) break;
      }
      const i = run.nextIdx++;
      // Round-robin по источникам
      const tabSnap = sources[i % sources.length];

      run.inFlight++;
      const result = await _runOne(tabSnap, s);
      run.inFlight--;

      if (run.aborted) break;
      result.warmup = i < (s.warmup || 0);
      result.reqLabel = sources.length > 1
        ? `${tabSnap.method} ${_shortUrl(tabSnap.url)}`
        : null;
      run.results.push(result);

      if (result.rl && Object.keys(result.rl).length) run.lastRl = result.rl;

      _scheduleRender();
      _renderIndicator();

      if (result.retryAfterMs > 0 && s.respectRetryAfter && !run.aborted) {
        run.throttledCount = (run.throttledCount || 0) + 1;
        await _sleepAbortable(result.retryAfterMs, run);
      } else if (s.delayMs > 0 && !run.aborted) {
        if (s.mode === "duration" || run.nextIdx < s.count) {
          await _sleep(s.delayMs);
        }
      }
    }
  }

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
    if (!run) return;
    run.aborted = true;
    if (run.running) {
      run.running = false;
      run.finishedAt = performance.now();
    }
    _renderPhase();
    _renderAll();
    _renderIndicator();
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
    const rl = _extractRateLimit(resp.headers);

    let testsOk = true, testError = "";
    if (tab.testScript && tab.testScript.trim() && App.runScript && resp.ok) {
      try {
        const testRes = App.runScript(tab.testScript, { source: "test", tab, response: resp });
        const failed = (testRes.tests || []).filter(t => !t.ok);
        if (!testRes.ok) { testsOk = false; testError = testRes.error; }
        else if (failed.length) { testsOk = false; testError = failed[0].name + " — " + (failed[0].error || ""); }
      } catch (e) { testsOk = false; testError = "script: " + String(e); }
    }

    const httpOk = resp.ok && (resp.status_code < 400);
    const status = resp.status_code || 0;
    const retryAfterMs = (status === 429 || status === 503) ? (rl.retryAfterMs || 0) : 0;

    return {
      ok: httpOk && testsOk, status, httpOk, testsOk, testError,
      ms, error: resp.ok ? "" : (resp.error || "").split("\n")[0],
      size: (resp.text || "").length, ts: Date.now(), rl, retryAfterMs,
      throttled: retryAfterMs > 0 || status === 429,
    };
  }

  // ============================================================
  // RATE-LIMIT / CDN (только чтение заголовков)
  // ============================================================
  function _extractRateLimit(headers) {
    const h = {};
    Object.entries(headers || {}).forEach(([k, v]) => { h[String(k).toLowerCase()] = v; });
    const info = {};
    const lim = h["ratelimit-limit"]     || h["x-ratelimit-limit"];
    const rem = h["ratelimit-remaining"] || h["x-ratelimit-remaining"];
    const rst = h["ratelimit-reset"]     || h["x-ratelimit-reset"];
    if (lim != null) info.limit     = _toNum(lim);
    if (rem != null) info.remaining = _toNum(rem);
    if (rst != null) info.resetAt   = _parseReset(rst);
    if (h["retry-after"] != null) info.retryAfterMs = _parseRetryAfter(h["retry-after"]);
    if (h["cf-ray"])          info.cfRay   = String(h["cf-ray"]);
    if (h["cf-cache-status"]) info.cfCache = String(h["cf-cache-status"]);
    if (h["x-cache"])         info.xCache  = String(h["x-cache"]);
    if (h["age"] != null)     info.age     = _toNum(h["age"]);
    if (h["server"])          info.server  = String(h["server"]);
    if (h["via"])             info.via     = String(h["via"]);
    return info;
  }

  function _toNum(v) {
    const n = Number(String(v).trim());
    return isFinite(n) ? n : String(v);
  }

  function _parseReset(v) {
    const n = Number(v);
    if (!isFinite(n)) return null;
    if (n > 1e9) return n * 1000;
    return Date.now() + n * 1000;
  }

  function _parseRetryAfter(v) {
    const s = String(v).trim();
    const asNum = Number(s);
    if (isFinite(asNum)) return Math.max(0, asNum) * 1000;
    const t = Date.parse(s);
    if (!isNaN(t)) return Math.max(0, t - Date.now());
    return 0;
  }

  const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ============================================================
  // ФОРМА
  // ============================================================
  function _readForm() {
    const mode        = document.getElementById("load-mode").value || "count";
    const count       = clamp(+document.getElementById("load-count").value, 1, 100000);
    const durationMs  = clamp(+document.getElementById("load-duration").value * 1000, 1000, 3600000);
    const concurrency = clamp(+document.getElementById("load-concurrency").value, 1, 500);
    const delayMs     = clamp(+document.getElementById("load-delay").value, 0, 60000);
    const warmup      = clamp(+document.getElementById("load-warmup").value, 0, 10000);
    const profile     = document.getElementById("load-profile").value || "constant";
    const rampupMs    = clamp(+document.getElementById("load-rampup").value * 1000, 500, 600000);
    const spikeAtMs   = clamp(+document.getElementById("load-spike").value * 1000, 500, 600000);
    const respectRetryAfter = document.getElementById("load-respect-retry").checked;

    // Пороги (assertions)
    const thrP95  = +document.getElementById("thr-p95").value  || null;
    const thrP99  = +document.getElementById("thr-p99").value  || null;
    const thrErr  = +document.getElementById("thr-err").value  || null;
    const thrRps  = +document.getElementById("thr-rps").value  || null;

    // Мульти-запросы
    const multiMode = document.getElementById("load-multi-mode").checked;
    let multiSources = null;
    if (multiMode) {
      multiSources = _getSelectedMultiRequests();
      if (!multiSources.length) {
        App.showAlert(App.t("selectAtLeastOne"));
        return null;
      }
    }

    if (mode === "count" && (isNaN(count) || count < 1)) {
      App.showAlert(App.t("loadBadCount"));
      return null;
    }
    return {
      mode, count, durationMs, concurrency, delayMs, warmup,
      profile, rampupMs, spikeAtMs, respectRetryAfter,
      thresholds: { p95: thrP95, p99: thrP99, errorPct: thrErr, minRps: thrRps },
      multiSources,
    };
  }

  function _fillFormFromConfig(cfg) {
    if (!cfg) return;
    const $ = (id) => document.getElementById(id);
    if (cfg.mode)           $("load-mode").value        = cfg.mode;
    if (cfg.count)          $("load-count").value       = cfg.count;
    if (cfg.durationSec)    $("load-duration").value    = cfg.durationSec;
    if (cfg.concurrency)    $("load-concurrency").value = cfg.concurrency;
    if (cfg.delayMs != null)$("load-delay").value       = cfg.delayMs;
    if (cfg.warmup != null) $("load-warmup").value      = cfg.warmup;
    if (cfg.profile)        $("load-profile").value     = cfg.profile;
    if (cfg.rampupSec)      $("load-rampup").value      = cfg.rampupSec;
    if (cfg.spikeSec)       $("load-spike").value       = cfg.spikeSec;
    if (cfg.thresholds) {
      const t = cfg.thresholds;
      if (t.p95)      $("thr-p95").value = t.p95;
      if (t.p99)      $("thr-p99").value = t.p99;
      if (t.errorPct) $("thr-err").value = t.errorPct;
      if (t.minRps)   $("thr-rps").value = t.minRps;
    }
    $("load-mode").dispatchEvent(new Event("change"));
    $("load-profile").dispatchEvent(new Event("change"));
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // ============================================================
  // КОНФИГУРАЦИИ (localStorage)
  // ============================================================
  function _getConfigs() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "[]"); } catch { return []; }
  }

  function _saveConfigs(arr) {
    localStorage.setItem(CFG_KEY, JSON.stringify(arr));
  }

  function _saveConfig() {
    const name = (document.getElementById("load-cfg-name").value || "").trim();
    if (!name) { App.showAlert(App.t("loadCfgEnterName")); return; }
    const cfg = {
      name,
      mode:        document.getElementById("load-mode").value,
      count:       +document.getElementById("load-count").value,
      durationSec: +document.getElementById("load-duration").value,
      concurrency: +document.getElementById("load-concurrency").value,
      delayMs:     +document.getElementById("load-delay").value,
      warmup:      +document.getElementById("load-warmup").value,
      profile:     document.getElementById("load-profile").value,
      rampupSec:   +document.getElementById("load-rampup").value,
      spikeSec:    +document.getElementById("load-spike").value,
      thresholds: {
        p95:      +document.getElementById("thr-p95").value || null,
        p99:      +document.getElementById("thr-p99").value || null,
        errorPct: +document.getElementById("thr-err").value || null,
        minRps:   +document.getElementById("thr-rps").value || null,
      },
    };
    const arr = _getConfigs().filter(c => c.name !== name);
    arr.push(cfg);
    _saveConfigs(arr);
    _renderConfigSelect(name);
    App.showAlert(`✓ ${name} — ${App.t("loadCfgSaved")}`);
  }

  function _loadConfig(name) {
    const cfg = _getConfigs().find(c => c.name === name);
    if (cfg) _fillFormFromConfig(cfg);
  }

  function _deleteConfig() {
    const sel = document.getElementById("load-cfg-select");
    const name = sel.value;
    if (!name) return;
    _saveConfigs(_getConfigs().filter(c => c.name !== name));
    _renderConfigSelect();
  }

  function _renderConfigSelect(selectName) {
    const sel = document.getElementById("load-cfg-select");
    const cfgs = _getConfigs();
    sel.innerHTML = `<option value="">${App.t("loadCfgLabel")}</option>` +
      cfgs.map(c =>
        `<option value="${App.escapeHtml(c.name)}" ${c.name === selectName ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`
      ).join("");
  }

  // ============================================================
  // ФОНОВЫЙ РЕЖИМ
  // ============================================================
  function _sendToBackground() { _modal.hide(); }

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
    let sumPct = 0;
    active.forEach(r => {
      if (r.settings && r.settings.mode === "duration") {
        const el = Math.max(0, Date.now() - r.startedAtWall);
        sumPct += Math.min(100, r.settings.durationMs ? el / r.settings.durationMs * 100 : 0);
      } else if (r.settings && r.settings.count) {
        sumPct += r.results.length / r.settings.count * 100;
      }
    });
    const pct = Math.round(sumPct / active.length);
    const done = active.reduce((s, r) => s + r.results.length, 0);
    _navIndicatorEl.textContent = active.length > 1 ? `${active.length}·${pct}%` : `${pct}%`;
    _navIndicatorEl.style.display = "";
    _navIndicatorEl.title = `${active.length} ${App.t("loadRunning")} — ${done} req`;
    btn.classList.add("load-nav-active");
  }

  // ============================================================
  // РЕНДЕР
  // ============================================================
  function _scheduleRender() {
    if (_renderTimer) return;
    _renderTimer = setTimeout(() => { _renderTimer = null; _renderAll(); }, RENDER_THROTTLE_MS);
  }

  function _renderAll() {
    _renderRunSelector();
    _renderPhase();
    _renderProgress();
    _renderSummary();
    _renderChart();
    _renderErrors();
    _renderCompare();
  }

  function _renderRunSelector() {
    const sel = document.getElementById("load-run-select");
    if (!sel) return;
    if (!_runs.size) {
      sel.innerHTML = `<option value="">${App.t("loadNoRuns")}</option>`;
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = [..._runs.values()].map(r => {
      const state = r.running ? "▶" : r.aborted ? "◼" : r.results.length ? "✓" : "○";
      const count = r.settings
        ? (r.settings.mode === "duration"
            ? `${r.results.length} req`
            : `${r.results.length}/${r.settings.count}`)
        : r.results.length;
      return `<option value="${r.id}" ${r.id === _activeRunId ? "selected" : ""}>${state} ${App.escapeHtml(r.label)} (${count})</option>`;
    }).join("");

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
    const start  = document.getElementById("load-start");
    const stop   = document.getElementById("load-stop");
    const bg     = document.getElementById("load-background");
    const status = document.getElementById("load-status");
    if (!start) return;
    const running = run && run.running;
    start.style.display = running ? "none" : "";
    stop.style.display  = running ? ""     : "none";
    bg.style.display    = running ? ""     : "none";
    if (!run) { status.textContent = ""; return; }
    if (running) {
      status.textContent = App.t("loadRunning"); status.style.color = "var(--accent)";
    } else if (run.aborted) {
      status.textContent = App.t("loadAborted"); status.style.color = "#ffc107";
    } else if (run.results.length && run.finishedAt) {
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
    if (!run || !run.settings) { bar.style.width = "0%"; txt.textContent = "—"; return; }
    const inFlight = run.inFlight ? ` · ${run.inFlight} ${App.t("inFlight")}` : "";
    if (run.settings.mode === "duration") {
      const now = run.running ? Date.now() : (run.startedAtWall + (run.finishedAt - run.startedAt));
      const elapsed = Math.max(0, now - run.startedAtWall);
      const totalMs = run.settings.durationMs;
      const pct = totalMs ? Math.min(100, Math.round(elapsed / totalMs * 100)) : 0;
      bar.style.width = pct + "%";
      txt.textContent = `${_fmtMs(elapsed)} / ${_fmtMs(totalMs)} (${pct}%) · ${run.results.length} req${inFlight}`;
    } else {
      const done = run.results.length;
      const total = run.settings.count;
      const pct = total ? Math.round(done / total * 100) : 0;
      bar.style.width = pct + "%";
      txt.textContent = `${done} / ${total} (${pct}%)${inFlight}`;
    }
  }

  function _fmtMs(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + "s";
    return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
  }

  function _measuredResults(run) {
    if (!run || !run.results) return [];
    return run.results.filter(r => !r.warmup);
  }

  // ============================================================
  // СВОДКА + ПОРОГИ
  // ============================================================
  function _renderSummary() {
    const run = _current();
    const box = document.getElementById("load-summary");
    if (!run || !run.results.length) { box.innerHTML = ""; return; }

    const results = _measuredResults(run);
    const warmupCount = run.results.length - results.length;
    if (!results.length) { box.innerHTML = ""; return; }

    const total = results.length;
    const passList = results.filter(r => r.ok);
    const pass = passList.length;
    const fail = total - pass;

    const times = results.map(r => r.ms).sort((a, b) => a - b);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = times[0], max = times[times.length - 1];
    const p50 = _pct(times, 50), p95 = _pct(times, 95), p99 = _pct(times, 99);

    const okTimes = passList.map(r => r.ms).sort((a, b) => a - b);
    const okP50 = _pct(okTimes, 50), okP95 = _pct(okTimes, 95), okP99 = _pct(okTimes, 99);

    const byStatus = {};
    results.forEach(r => {
      const k = r.status || "ERR";
      byStatus[k] = (byStatus[k] || 0) + 1;
    });

    const elapsedMs = (run.running ? performance.now() : run.finishedAt) - run.startedAt;
    const rps    = elapsedMs > 0 ? (total / (elapsedMs / 1000)).toFixed(1) : "—";
    const rpsOk  = elapsedMs > 0 ? (pass  / (elapsedMs / 1000)).toFixed(1) : "—";
    const passPct = ((pass / total) * 100).toFixed(1);
    const throttled = run.throttledCount || 0;

    // ---- Breakdown по запросам (multi-mode) ----
    let multiBreakdown = "";
    if (run.settings && run.settings.multiSources && run.settings.multiSources.length > 1) {
      const byReq = {};
      results.forEach(r => {
        const k = r.reqLabel || "?";
        if (!byReq[k]) byReq[k] = { total: 0, pass: 0, times: [] };
        byReq[k].total++;
        if (r.ok) byReq[k].pass++;
        byReq[k].times.push(r.ms);
      });
      multiBreakdown = `
        <div class="load-multi-breakdown">
          <div class="load-multi-breakdown-title">${App.t("loadByRequests")}</div>
          ${Object.entries(byReq).map(([label, d]) => {
            const sorted = d.times.sort((a, b) => a - b);
            const errPct = (((d.total - d.pass) / d.total) * 100).toFixed(0);
            const c = d.pass < d.total ? "#ffc107" : "#22c55e";
            return `<div class="load-multi-row">
              <span class="load-multi-label">${App.escapeHtml(label)}</span>
              <span>${d.total} req</span>
              <span style="color:${c}">${errPct}% err</span>
              <span>p50 ${_pct(sorted, 50)}ms</span>
              <span>p95 ${_pct(sorted, 95)}ms</span>
            </div>`;
          }).join("")}
        </div>`;
    }

    // ---- Threshold / assertions ----
    const thr = (run.settings && run.settings.thresholds) || {};
    const thrResults = [];
    if (thr.p95 != null) thrResults.push({ label: `p95 ≤ ${thr.p95}ms`, ok: p95 <= thr.p95, actual: p95 + "ms" });
    if (thr.p99 != null) thrResults.push({ label: `p99 ≤ ${thr.p99}ms`, ok: p99 <= thr.p99, actual: p99 + "ms" });
    if (thr.errorPct != null) {
      const errPct = (fail / total) * 100;
      thrResults.push({ label: `errors ≤ ${thr.errorPct}%`, ok: errPct <= thr.errorPct, actual: errPct.toFixed(1) + "%" });
    }
    if (thr.minRps != null) {
      thrResults.push({ label: `RPS ≥ ${thr.minRps}`, ok: +rps >= thr.minRps, actual: rps });
    }
    const anyFailed = thrResults.some(r => !r.ok);
    const thrHtml = thrResults.length ? `
      <div class="load-thresholds-result ${anyFailed ? "thr-fail" : "thr-pass"}">
        <span class="thr-badge">${anyFailed ? "✗ FAIL" : "✓ PASS"}</span>
        ${thrResults.map(r => `<span class="thr-item ${r.ok ? "thr-ok" : "thr-no"}">${r.label}: <b>${r.actual}</b></span>`).join("")}
      </div>` : "";

    box.innerHTML = `
      ${thrHtml}
      <div class="load-stats-grid">
        ${_stat(App.t("total"), total, "bi-send")}
        ${warmupCount ? _stat(App.t("loadWarmupSkipped"), warmupCount, "bi-thermometer-sun", "var(--text-dim)") : ""}
        ${_stat(App.t("successful"), `${pass} <small style="color:var(--text-dim);">(${passPct}%)</small>`, "bi-check-circle", "#22c55e")}
        ${_stat(App.t("failed"), fail, "bi-x-circle", fail ? "#dc3545" : "var(--text-dim)")}
        ${_stat("RPS", rps, "bi-lightning")}
        ${_stat(App.t("okRps"), rpsOk, "bi-lightning-fill", pass < total ? "#22c55e" : "")}
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
        ${throttled ? _stat(App.t("throttled"), throttled + "×", "bi-hourglass-split", "#ffc107") : ""}
      </div>
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
      ${multiBreakdown}
      ${_renderRateLimitPanel(run)}
      ${_renderHealthPlaques(results, total, pass, byStatus, p50, p95, p99, run.settings)}`;
  }

  function _renderRateLimitPanel(run) {
    const rl = run.lastRl;
    if (!rl || !Object.keys(rl).length) return "";
    const rows = [];
    if (rl.limit != null || rl.remaining != null) {
      const rem = rl.remaining != null ? rl.remaining : "?";
      const lim = rl.limit != null ? rl.limit : "?";
      const usedPct = (rl.limit && rl.remaining != null)
        ? Math.round((1 - rl.remaining / rl.limit) * 100) : null;
      rows.push(`<b>${App.t("rlBudget")}:</b> ${rem} / ${lim}${usedPct != null ? ` (${usedPct}% used)` : ""}`);
    }
    if (rl.resetAt) {
      const secs = Math.max(0, Math.round((rl.resetAt - Date.now()) / 1000));
      rows.push(`<b>${App.t("rlReset")}:</b> ${secs} ${App.t("seconds")}`);
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
      <div class="load-rl-title"><i class="bi bi-shield-check"></i> ${App.t("rlPanelTitle")}</div>
      ${rows.map(r => `<div class="load-rl-row">${r}</div>`).join("")}
    </div>`;
  }

  function _renderHealthPlaques(results, total, pass, byStatus, p50, p95, p99, settings) {
    const plaques = [];
    const failPct = ((total - pass) / total) * 100;
    if (failPct > 5) {
      plaques.push({ kind: "danger", text: `${failPct.toFixed(1)}% ${App.t("failed").toLowerCase()} — ${
        byStatus["429"] ? App.t("rlLikelyRateLimit")
        : byStatus["ERR"] ? App.t("rlLikelyRefuse")
        : App.t("rlLikelyServerErr")}` });
    }
    if (p50 > 0 && p99 > p50 * 6 && p99 > 500) {
      plaques.push({ kind: "warn", text: App.t("rlTailBlowup").replace("{ratio}", (p99 / p50).toFixed(1)) });
    }
    if ((byStatus["429"] || 0) / total > 0.05) plaques.push({ kind: "warn",   text: App.t("rlManyRateLimit") });
    if ((byStatus["ERR"] || 0) / total > 0.05) plaques.push({ kind: "danger", text: App.t("rlManyErr") });
    if (!plaques.length) return "";
    return `<div class="load-health">
      ${plaques.map(p => `<div class="load-health-item load-h-${p.kind}"><i class="bi bi-info-circle"></i> ${p.text}</div>`).join("")}
    </div>`;
  }

  function _stat(label, value, icon, color) {
    return `<div class="load-stat">
      <i class="bi ${icon}" ${color ? `style="color:${color}"` : ""}></i>
      <div class="load-stat-label">${label}</div>
      <div class="load-stat-value" ${color ? `style="color:${color}"` : ""}>${value}</div>
    </div>`;
  }

  function _pct(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100))];
  }

  // ============================================================
  // ГРАФИК — scatter + rolling p50/p95
  // ============================================================
  function _renderChart() {
    const run = _current();
    const svg = document.getElementById("load-chart");
    if (!svg) return;
    if (!run || !run.results.length) { svg.innerHTML = ""; return; }
    const results = run.results;

    const W = svg.clientWidth || 700, H = 200;
    const padL = 46, padR = 14, padT = 24, padB = 22;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const N = results.length;

    // Прореживание > 800 точек: берём worst в каждом бине
    let sampled = results;
    if (N > 800) {
      const bins = 800;
      const per = Math.ceil(N / bins);
      sampled = [];
      for (let b = 0; b < bins; b++) {
        const slice = results.slice(b * per, (b + 1) * per);
        if (!slice.length) break;
        sampled.push(slice.reduce((a, x) => x.ms > a.ms ? x : a, slice[0]));
      }
    }

    const allTimes = sampled.map(r => r.ms);
    const maxRaw = Math.max(1, ...allTimes);
    // Округляем ось Y вверх до красивого числа
    const maxY = Math.ceil(maxRaw / 100) * 100 || 100;
    const stepX = chartW / Math.max(1, sampled.length - 1);
    const toX = (i) => padL + i * stepX;
    const toY = (ms) => padT + chartH - Math.min(chartH, (ms / maxY) * chartH);

    // Y-axis (5 тиков)
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = Math.round((maxY / tickCount) * i);
      const y = toY(v).toFixed(1);
      const label = v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "s" : v + "ms";
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="2,3"/>
              <text x="${padL - 5}" y="${(+y + 3).toFixed(1)}" text-anchor="end" fill="var(--text-dim)" font-size="9">${label}</text>`;
    }).join("");

    // Scatter: цвет по статусу
    const dots = sampled.map((r, i) => {
      const x = toX(i).toFixed(1);
      const y = toY(r.ms).toFixed(1);
      const color = r.warmup ? "var(--text-dim)" : r.ok ? "var(--accent)" : "#dc3545";
      const radius = r.ok ? "1.5" : "2.5";
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${r.warmup ? "0.35" : "0.65"}"/>`;
    }).join("");

    // Rolling p50 / p95 (скользящее окно = 5% точек, мин 10)
    const winSize = Math.max(10, Math.floor(sampled.length * 0.05));
    let p50Path = "", p95Path = "";
    for (let i = 0; i < sampled.length; i++) {
      const half = Math.floor(winSize / 2);
      const from = Math.max(0, i - half);
      const to   = Math.min(sampled.length, from + winSize);
      const win  = sampled.slice(from, to).map(r => r.ms).sort((a, b) => a - b);
      const x = toX(i).toFixed(1);
      p50Path += (i ? " L " : "M ") + x + " " + toY(_pct(win, 50)).toFixed(1);
      p95Path += (i ? " L " : "M ") + x + " " + toY(_pct(win, 95)).toFixed(1);
    }

    // Легенда
    const lx = padL;
    const ly = padT - 10;
    const legend = [
      `<circle cx="${lx+5}"    cy="${ly}" r="3" fill="var(--accent)" opacity="0.65"/>`,
      `<text   x="${lx+11}"   y="${ly+3}" fill="var(--text-dim)" font-size="9">OK</text>`,
      `<circle cx="${lx+35}"   cy="${ly}" r="3" fill="#dc3545"/>`,
      `<text   x="${lx+41}"   y="${ly+3}" fill="var(--text-dim)" font-size="9">fail</text>`,
      `<line   x1="${lx+65}" y1="${ly}" x2="${lx+78}" y2="${ly}" stroke="#22c55e" stroke-width="2"/>`,
      `<text   x="${lx+82}"  y="${ly+3}" fill="var(--text-dim)" font-size="9">p50</text>`,
      `<line   x1="${lx+103}" y1="${ly}" x2="${lx+116}" y2="${ly}" stroke="#ffc107" stroke-width="2" stroke-dasharray="4,2"/>`,
      `<text   x="${lx+120}" y="${ly+3}" fill="var(--text-dim)" font-size="9">p95</text>`,
    ].join("");

    svg.setAttribute("height", H);
    svg.innerHTML = `
      ${ticks}
      ${dots}
      <path d="${p50Path}" fill="none" stroke="#22c55e" stroke-width="1.8" opacity="0.9"/>
      <path d="${p95Path}" fill="none" stroke="#ffc107" stroke-width="1.8" stroke-dasharray="5,3" opacity="0.9"/>
      ${legend}
      <text x="${padL}"     y="${H - 4}" fill="var(--text-dim)" font-size="9">#1</text>
      <text x="${W - padR}" y="${H - 4}" text-anchor="end" fill="var(--text-dim)" font-size="9">#${N}${N !== sampled.length ? ` (${sampled.length} pts)` : ""}</text>`;
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
      box.innerHTML = `<div style="color:var(--text-dim);padding:8px;text-align:center;">${App.t("loadNoErrors")}</div>`;
      return;
    }
    const groups = {};
    failed.forEach(r => {
      const key = r.error || (r.testError ? "test: " + r.testError : String(r.status));
      if (!groups[key]) groups[key] = { count: 0, sample: r };
      groups[key].count++;
    });
    box.innerHTML = `<div class="load-err-head">${App.t("loadErrorTypes")}:</div>` +
      Object.entries(groups).sort((a, b) => b[1].count - a[1].count)
        .map(([key, g]) => `<div class="load-err-row">
          <span class="load-err-count">${g.count}×</span>
          <span class="load-err-key">${App.escapeHtml(key.slice(0, 200))}</span>
          <span class="load-err-status">${g.sample.status || "—"}</span>
        </div>`).join("");
  }

  // ============================================================
  // СРАВНЕНИЕ СЕССИЙ
  // ============================================================
  function _renderCompare() {
    const wrap = document.getElementById("load-compare-wrap");
    if (!wrap) return;
    if (_runs.size < 2) { wrap.style.display = "none"; return; }
    wrap.style.display = "";

    const runArr = [..._runs.values()];
    const optHtml = runArr.map(r => {
      const state = r.running ? "▶" : r.aborted ? "◼" : r.results.length ? "✓" : "○";
      return `<option value="${r.id}">${state} ${App.escapeHtml(r.label)}</option>`;
    }).join("");

    const selA = document.getElementById("cmp-a");
    const selB = document.getElementById("cmp-b");
    const prevA = selA.value, prevB = selB.value;
    selA.innerHTML = optHtml;
    selB.innerHTML = optHtml;
    if (prevA && _runs.has(prevA)) selA.value = prevA;
    else selA.value = runArr[0].id;
    if (prevB && _runs.has(prevB) && prevB !== selA.value) selB.value = prevB;
    else selB.value = runArr[runArr.length - 1].id;

    const runA = _runs.get(selA.value);
    const runB = _runs.get(selB.value);
    const box  = document.getElementById("load-compare-table");

    if (!runA || !runB || selA.value === selB.value) {
      box.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding:6px;">${App.t("loadCompareSelect")}</div>`;
      return;
    }

    const sA = _calcStats(runA), sB = _calcStats(runB);
    if (!sA || !sB) { box.innerHTML = ""; return; }

    const rows = [
      ["", runA.label, runB.label, "Δ (B−A)"],
      [App.t("total"),                  sA.total,          sB.total,          _deltaNum(sA.total,    sB.total,    false)],
      [App.t("successful") + " %",      sA.passPct + "%",  sB.passPct + "%",  _deltaNum(+sA.passPct, +sB.passPct, true,  "%")],
      ["RPS",                            sA.rps,            sB.rps,            _deltaNum(+sA.rps,     +sB.rps,     true)],
      [App.t("avgTime"),                 sA.avg + "ms",     sB.avg + "ms",     _deltaNum(sA.avg,      sB.avg,      false, "ms")],
      ["p50",                            sA.p50 + "ms",     sB.p50 + "ms",     _deltaNum(sA.p50,      sB.p50,      false, "ms")],
      ["p95",                            sA.p95 + "ms",     sB.p95 + "ms",     _deltaNum(sA.p95,      sB.p95,      false, "ms")],
      ["p99",                            sA.p99 + "ms",     sB.p99 + "ms",     _deltaNum(sA.p99,      sB.p99,      false, "ms")],
    ];

    box.innerHTML = `<table class="load-cmp-table">
      ${rows.map((row, i) => `<tr class="${i === 0 ? "cmp-head" : ""}">
        ${row.map((cell, j) =>
          i === 0
            ? `<th ${j === 3 ? 'class="cmp-delta"' : ""}>${cell}</th>`
            : `<td ${j === 3 ? 'class="cmp-delta"' : ""}>${cell}</td>`
        ).join("")}
      </tr>`).join("")}
    </table>`;
  }

  function _calcStats(run) {
    const results = _measuredResults(run);
    if (!results.length) return null;
    const total = results.length;
    const pass  = results.filter(r => r.ok).length;
    const times = results.map(r => r.ms).sort((a, b) => a - b);
    const avg   = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const elapsedMs = (run.finishedAt || performance.now()) - run.startedAt;
    const rps = elapsedMs > 0 ? (total / (elapsedMs / 1000)).toFixed(1) : "—";
    return {
      total, pass, passPct: ((pass / total) * 100).toFixed(1),
      rps, avg,
      p50: _pct(times, 50), p95: _pct(times, 95), p99: _pct(times, 99),
    };
  }

  function _deltaNum(a, b, higherBetter, suffix = "") {
    a = +a; b = +b;
    if (isNaN(a) || isNaN(b)) return "—";
    const d = b - a;
    if (Math.abs(d) < 0.05) return "=";
    const better = higherBetter ? d > 0 : d < 0;
    const sign = d > 0 ? "+" : "";
    const fmt  = Number.isInteger(d) ? d : d.toFixed(1);
    return `<span style="color:${better ? "#22c55e" : "#dc3545"}">${sign}${fmt}${suffix}</span>`;
  }

  // ============================================================
  // CLI — генерация команды
  // ============================================================
  function _copyCli() {
    const run = _current();
    if (!run) return;
    const s   = run.settings || {};
    const tab = run.tab;
    let cmd = `testsys load --url "${tab.url}" --method ${tab.method || "GET"}`;
    if (s.mode === "duration") {
      cmd += ` --duration ${Math.round((s.durationMs || 30000) / 1000)}`;
    } else {
      cmd += ` --count ${s.count || 100}`;
    }
    cmd += ` --concurrency ${s.concurrency || 10}`;
    if (s.delayMs)  cmd += ` --delay ${s.delayMs}`;
    if (s.warmup)   cmd += ` --warmup ${s.warmup}`;
    if (s.profile && s.profile !== "constant") cmd += ` --profile ${s.profile}`;
    if (tab.body && tab.body.trim()) {
      const bodyPrev = tab.body.replace(/'/g, "\\'").slice(0, 300);
      cmd += ` --body '${bodyPrev}'`;
    }
    if (s.thresholds) {
      if (s.thresholds.p95)      cmd += ` --assert-p95 ${s.thresholds.p95}`;
      if (s.thresholds.p99)      cmd += ` --assert-p99 ${s.thresholds.p99}`;
      if (s.thresholds.errorPct) cmd += ` --assert-err-pct ${s.thresholds.errorPct}`;
      if (s.thresholds.minRps)   cmd += ` --assert-rps ${s.thresholds.minRps}`;
    }

    navigator.clipboard.writeText(cmd)
      .then(() => App.showAlert("✓ " + App.t("loadCliCopied")))
      .catch(() => { try { prompt("Скопируйте команду:", cmd); } catch (_) {} });
  }

  // ============================================================
  // ЭКСПОРТ И ОЧИСТКА
  // ============================================================
  async function _exportCsv() {
    const run = _current();
    if (!run || !run.results.length) { App.showAlert(App.t("noMetrics")); return; }
    const SEP = ";";
    const esc = (v) => { const s = String(v ?? ""); return /["\n;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [["#", "OK", "Status", "Time_ms", "Size", "Warmup", "Request", "Error", "Timestamp"]];
    run.results.forEach((r, i) => rows.push([
      i + 1, r.ok ? "1" : "0", r.status || "", r.ms, r.size || 0,
      r.warmup ? "1" : "0", r.reqLabel || "",
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
    if (!run || run.running) return;
    _runs.delete(run.id);
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

            <!-- Сессия -->
            <div class="d-flex align-items-center gap-2 mb-2">
              <label class="form-label mb-0" style="font-size:11px;color:var(--text-dim);white-space:nowrap;" data-i18n="session">Сессия:</label>
              <select id="load-run-select" class="form-select form-select-sm" style="flex:1;font-size:12px;"></select>
              <button class="btn btn-sm btn-outline-secondary" id="load-new-run" data-i18n-title="newSessionActive" title="Новая сессия">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
            <div class="load-target" id="load-target"></div>
            <div id="load-has-tests" style="font-size:11px;color:var(--text-dim);margin-bottom:8px;"></div>

            <!-- Конфиги -->
            <div class="load-cfg-bar mb-3">
              <select id="load-cfg-select" class="form-select form-select-sm" style="min-width:120px;font-size:12px;"></select>
              <input id="load-cfg-name" class="form-control form-control-sm" data-i18n-ph="loadCfgPlaceholder" placeholder="Имя конфига…" style="min-width:100px;font-size:12px;">
              <button class="btn btn-sm btn-outline-secondary" id="load-cfg-save" data-i18n-title="loadCfgSave" title="Сохранить конфиг">
                <i class="bi bi-floppy"></i>
              </button>
              <button class="btn btn-sm btn-outline-secondary" id="load-cfg-delete" data-i18n-title="loadCfgDelete" title="Удалить конфиг">
                <i class="bi bi-trash3"></i>
              </button>
            </div>

            <!-- Основные параметры -->
            <div class="row g-2 mb-2">
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadMode">Режим</label>
                <select id="load-mode" class="form-select form-select-sm">
                  <option value="count"    data-i18n-opt="loadModeCount">По количеству запросов</option>
                  <option value="duration" data-i18n-opt="loadModeDuration">По длительности (секунд)</option>
                </select>
              </div>
              <div class="col-md-3" id="load-count-wrap">
                <label class="form-label" style="font-size:12px;" data-i18n="loadCount">Количество запросов</label>
                <input type="number" class="form-control form-control-sm" id="load-count" value="100" min="1" max="100000">
              </div>
              <div class="col-md-3" id="load-duration-wrap" style="display:none;">
                <label class="form-label" style="font-size:12px;" data-i18n="loadDuration">Длительность (сек)</label>
                <input type="number" class="form-control form-control-sm" id="load-duration" value="30" min="1" max="3600">
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
                        data-i18n-title="minimizeBg" title="Свернуть">
                  <i class="bi bi-arrow-down-square"></i>
                </button>
              </div>
            </div>

            <!-- Профиль + warmup -->
            <div class="row g-2 mb-1">
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
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="loadWarmup">Warmup (запросов)</label>
                <input type="number" class="form-control form-control-sm" id="load-warmup" value="0" min="0" max="10000"
                       data-i18n-title="loadWarmupHint">
              </div>
              <div class="col-md-3 d-flex align-items-end">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" id="load-respect-retry" checked>
                  <label class="form-check-label" for="load-respect-retry" style="font-size:12px;" data-i18n="loadRespectRetry">Retry-After</label>
                </div>
              </div>
            </div>
            <div class="form-text mb-3" style="font-size:10px;" data-i18n="loadConcurrencyHint"></div>

            <!-- Несколько запросов (round-robin) -->
            <div class="mb-2">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="load-multi-mode">
                <label class="form-check-label" for="load-multi-mode" style="font-size:12px;font-weight:600;">
                  <i class="bi bi-collection me-1"></i><span data-i18n="loadMultiMode">Несколько запросов (round-robin)</span>
                </label>
              </div>
            </div>
            <div id="load-multi-panel" style="display:none;" class="load-multi-panel mb-3">
              <div class="d-flex gap-2 mb-2 align-items-center">
                <input id="load-multi-search" class="form-control form-control-sm"
                       data-i18n-ph="loadMultiSearch" placeholder="Поиск по запросам…" style="font-size:12px;flex:1;">
                <button class="btn btn-sm btn-outline-secondary" id="load-multi-add-inline" style="white-space:nowrap;font-size:11px;">
                  <i class="bi bi-plus-lg me-1"></i>Новый запрос
                </button>
              </div>
              <div id="load-multi-list" class="load-multi-list"></div>
            </div>

            <!-- Пороги (Assertions) -->
            <details class="load-thresholds-section mb-3">
              <summary style="font-size:12px;font-weight:600;cursor:pointer;color:var(--accent);user-select:none;">
                <i class="bi bi-flag me-1"></i><span data-i18n="loadAssertions">Assertions — провалить тест если…</span>
              </summary>
              <div class="row g-2 mt-1">
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="loadAssertP95">p95 ≤ (мс)</label>
                  <input type="number" class="form-control form-control-sm" id="thr-p95" placeholder="500" min="1">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="loadAssertP99">p99 ≤ (мс)</label>
                  <input type="number" class="form-control form-control-sm" id="thr-p99" placeholder="1000" min="1">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="loadAssertErr">Ошибок ≤ (%)</label>
                  <input type="number" class="form-control form-control-sm" id="thr-err" placeholder="1" min="0" max="100">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label" style="font-size:11px;" data-i18n="loadAssertRps">RPS ≥</label>
                  <input type="number" class="form-control form-control-sm" id="thr-rps" placeholder="50" min="1">
                </div>
              </div>
            </details>

            <span id="load-status" style="font-size:12px;font-weight:600;"></span>

            <!-- Прогресс -->
            <div class="load-progress-wrap mt-2">
              <div class="load-progress-track"><div id="load-progress" class="load-progress-bar"></div></div>
              <div id="load-progress-text" class="load-progress-text">—</div>
            </div>

            <!-- Сводка -->
            <div id="load-summary" class="load-summary"></div>

            <!-- График -->
            <div class="load-chart-wrap">
              <div class="load-chart-title" data-i18n="loadChartSubtitle">Время ответа — scatter + rolling p50 / p95</div>
              <svg id="load-chart" width="100%" height="200"></svg>
            </div>

            <!-- Ошибки -->
            <div id="load-errors" class="load-errors"></div>

            <!-- Сравнение сессий -->
            <div id="load-compare-wrap" style="display:none;" class="load-compare mt-3">
                      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">
                <i class="bi bi-bar-chart-steps me-1"></i><span data-i18n="loadCompareTitle">Сравнение сессий</span>
              </div>
              <div class="d-flex gap-2 mb-2 align-items-center">
                <select id="cmp-a" class="form-select form-select-sm" style="flex:1;font-size:12px;"></select>
                <span style="color:var(--text-dim);font-weight:600;">vs</span>
                <select id="cmp-b" class="form-select form-select-sm" style="flex:1;font-size:12px;"></select>
              </div>
              <div id="load-compare-table"></div>
            </div>

          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" id="load-clear">
              <i class="bi bi-trash3 me-1"></i><span data-i18n="clear">Очистить</span>
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="load-export">
              <i class="bi bi-download me-1"></i>CSV
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="load-cli" data-i18n-title="loadCliTitle" title="Скопировать как CLI-команду (testsys load …)">
              <i class="bi bi-terminal me-1"></i>CLI
            </button>
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="close">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
