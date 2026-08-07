/**
 * collectionRunner.js — Запуск всех запросов коллекции по очереди
 * Показывает pass/fail по тест-скриптам и статус-коды
 */
window.App = window.App || {};

(function () {

  let _running = false;
  let _abort = false;

  // ── run logic ─────────────────────────────────────────────────────────────

  async function _runCollection(colIdx, opts, onResult) {
    const col = (App.COLLECTIONS || [])[colIdx];
    if (!col) return;

    const resolve = App.resolveAll || App.resolveVariables || (s => s);
    const pick = App.activeRows || (rows => (rows || []).filter(r => (r.key || "").trim()));

    // Flatten all requests. Структура: col.folders[].items[]
    // (поддерживаем и старые поля requests/ items на корне — на всякий случай)
    const allReqs = [];
    (col.items || col.requests || []).forEach(r => allReqs.push({ req: r, folder: null }));
    (col.folders || []).forEach(f => {
      (f.items || f.requests || []).forEach(r => allReqs.push({ req: r, folder: f.name }));
    });

    const delay = opts.delay || 0;

    for (let i = 0; i < allReqs.length; i++) {
      if (_abort) break;
      const { req, folder } = allReqs[i];
      if (!req.url || !req.url.trim()) {
        onResult({ req, folder, skipped: true });
        continue;
      }

      // Рабочая копия — pre-скрипт может менять url/body/headers,
      // но исходный запрос в коллекции трогать нельзя.
      const work = {
        method: req.method || "GET",
        url: req.url,
        body: req.body || "",
        headers: Array.isArray(req.headers) ? req.headers.map(h => ({ ...h })) : [],
        params:  Array.isArray(req.params)  ? req.params.map(p => ({ ...p }))  : [],
      };

      // Pre-request скрипт — до резолва переменных, чтобы он мог их задать
      if (req.preScript && req.preScript.trim() && App.runScript) {
        try { App.runScript(req.preScript, { source: "pre", tab: work }); }
        catch (_) { /* ошибка скрипта не должна ронять весь прогон */ }
      }

      const finalUrl = resolve(work.url).trim();
      const finalBody = work.body ? resolve(work.body) : "";

      // Проверяем схему — иначе бэк отдаёт невнятное
      // "No connection adapters were found"
      if (!/^https?:\/\//i.test(finalUrl)) {
        onResult({
          req, folder, elapsed: 0,
          response: { ok: false, error: `Некорректный URL: ${finalUrl}` },
        });
        if (delay > 0 && i < allReqs.length - 1) await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const headersObj = {};
      pick(work.headers).forEach(h => { headersObj[resolve(h.key).trim()] = resolve(h.value); });
      const paramsObj = {};
      pick(work.params).forEach(p => { paramsObj[resolve(p.key).trim()] = resolve(p.value); });

      let response = null;
      let testResult = null;
      const t0 = Date.now();
      try {
        response = await window.pywebview.api.send_request(
          work.method, finalUrl, headersObj, paramsObj,
          finalBody.trim() || null
        );
      } catch (e) {
        response = { ok: false, error: String(e) };
      }
      const elapsed = Date.now() - t0;

      // Test-скрипт после ответа
      if (req.testScript && req.testScript.trim() && response && App.runScript) {
        try {
          testResult = App.runScript(req.testScript, {
            source: "test",
            tab: Object.assign({}, work, { response }),
            response,
          });
        } catch (e) {
          testResult = { ok: false, tests: [], error: String(e) };
        }
      }

      onResult({ req, folder, response, testResult, elapsed });

      if (delay > 0 && i < allReqs.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ── modal ─────────────────────────────────────────────────────────────────

  App.showCollectionRunner = function () {
    document.getElementById("runner-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "runner-modal";
    modal.className = "app-modal-backdrop";

    const collections = Array.isArray(App.COLLECTIONS) ? App.COLLECTIONS : [];
    const hasCollections = collections.length > 0;
    const colOptions = hasCollections
      ? collections.map((c, i) => `<option value="${i}">${App.escapeHtml(c.name || "Коллекция " + (i+1))}</option>`).join("")
      : `<option value="" disabled>— нет коллекций —</option>`;

    modal.innerHTML = `
      <div class="app-modal" style="max-width:720px;width:96%;max-height:90vh;display:flex;flex-direction:column;">
        <div class="app-modal-header">
          <span>Collection Runner</span>
          <button class="app-modal-close" id="runner-close">&times;</button>
        </div>
        <div class="app-modal-body" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:12px;">
          ${!hasCollections ? `
          <div style="padding:24px;text-align:center;color:var(--text-dim);">
            <i class="bi bi-collection" style="font-size:32px;display:block;margin-bottom:8px;"></i>
            Нет коллекций для запуска.<br>
            <span style="font-size:12px;">Создайте коллекцию и добавьте в неё запросы.</span>
          </div>` : ""}
          <!-- config row -->
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;${!hasCollections ? "display:none;" : ""}">
            <select id="runner-col-select" class="form-select form-select-sm" style="flex:1;min-width:160px;">
              ${colOptions}
            </select>
            <label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:6px;white-space:nowrap;">
              Задержка (мс):
              <input type="number" id="runner-delay" value="0" min="0" max="10000" step="100"
                class="form-control form-control-sm" style="width:80px;">
            </label>
            <button id="runner-start" class="btn send-btn btn-sm" ${!hasCollections ? "disabled" : ""}>
              <i class="bi bi-play-fill"></i> Запустить
            </button>
            <button id="runner-stop" class="btn btn-sm btn-danger" style="display:none;">
              <i class="bi bi-stop-fill"></i> Стоп
            </button>
          </div>

          <!-- summary bar (hidden until run) -->
          <div id="runner-summary" style="display:none;padding:8px 12px;border-radius:var(--radius);background:var(--bg-input);font-size:12px;display:flex;gap:16px;align-items:center;">
            <span id="runner-sum-total" style="color:var(--text-dim);">0 запросов</span>
            <span id="runner-sum-pass" style="color:#4caf50;font-weight:600;">✓ 0 pass</span>
            <span id="runner-sum-fail" style="color:#f44336;font-weight:600;">✗ 0 fail</span>
            <span id="runner-sum-skip" style="color:var(--text-dim);">⊘ 0 skip</span>
            <span id="runner-sum-time" style="color:var(--text-dim);margin-left:auto;"></span>
          </div>

          <!-- progress -->
          <div id="runner-progress-wrap" style="display:none;">
            <div style="height:4px;background:var(--border);border-radius:var(--radius-sm);overflow:hidden;">
              <div id="runner-progress-bar" style="height:100%;width:0%;background:var(--accent);transition:width .2s;"></div>
            </div>
          </div>

          <!-- results table -->
          <div id="runner-results" style="flex:1;overflow:auto;"></div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector("#runner-close").onclick = () => { _abort = true; modal.remove(); };
    modal.addEventListener("click", e => { if (e.target === modal) { _abort = true; modal.remove(); } });

    const startBtn = modal.querySelector("#runner-start");
    const stopBtn  = modal.querySelector("#runner-stop");

    startBtn.addEventListener("click", async () => {
      if (_running) return;
      _running = true;
      _abort = false;

      const colIdx  = parseInt(modal.querySelector("#runner-col-select")?.value);
      const delay   = parseInt(modal.querySelector("#runner-delay")?.value) || 0;
      const col     = (App.COLLECTIONS || [])[colIdx];
      if (!col || isNaN(colIdx)) { _running = false; return; }

      // count total — структура col.folders[].items[]
      const total = (col.items || col.requests || []).length +
        (col.folders || []).reduce((s, f) => s + (f.items || f.requests || []).length, 0);

      startBtn.style.display = "none";
      stopBtn.style.display  = "";
      modal.querySelector("#runner-progress-wrap").style.display = "";
      modal.querySelector("#runner-summary").style.display = "flex";

      const resultsDiv = modal.querySelector("#runner-results");
      resultsDiv.innerHTML = "";

      let done = 0, pass = 0, fail = 0, skip = 0, totalMs = 0;
      const tStart = Date.now();

      function _updateSummary() {
        modal.querySelector("#runner-sum-total").textContent = `${done}/${total} запросов`;
        modal.querySelector("#runner-sum-pass").textContent  = `✓ ${pass} pass`;
        modal.querySelector("#runner-sum-fail").textContent  = `✗ ${fail} fail`;
        modal.querySelector("#runner-sum-skip").textContent  = `⊘ ${skip} skip`;
        modal.querySelector("#runner-sum-time").textContent  = `${((Date.now() - tStart)/1000).toFixed(1)}s`;
        modal.querySelector("#runner-progress-bar").style.width = total ? `${(done/total)*100}%` : "0%";
      }

      await _runCollection(colIdx, { delay }, ({ req, folder, response, testResult, elapsed, skipped }) => {
        done++;

        let rowClass = "runner-row";
        let statusHtml = "";
        let testHtml = "";
        let errorHtml = "";

        if (skipped) {
          skip++;
          statusHtml = `<span class="runner-status runner-status-skip">skip</span>`;
          rowClass += " runner-skip";
        } else if (!response || !response.ok) {
          fail++;
          // Текст ошибки может быть длинным — он уходит отдельной строкой
          // под названием, а не в узкую правую колонку.
          errorHtml = `<div class="runner-err">${App.escapeHtml(response?.error || "Ошибка")}</div>`;
          statusHtml = `<span class="runner-status runner-status-err">ERR</span>`;
          rowClass += " runner-fail";
        } else {
          const sc = response.status_code;
          const scOk = sc >= 200 && sc < 300;

          // Evaluate test results (runScript returns { tests: [{name, ok}], ... })
          let testPassed = 0, testFailed = 0;
          if (testResult && testResult.tests) {
            testResult.tests.forEach(a => {
              if (a.ok) testPassed++; else testFailed++;
            });
          }

          const overallOk = scOk && testFailed === 0;
          if (overallOk) pass++; else fail++;
          rowClass += overallOk ? " runner-pass" : " runner-fail";

          statusHtml =
            `<span class="runner-status ${scOk ? "runner-status-ok" : "runner-status-err"}">${sc}</span>` +
            `<span class="runner-time">${elapsed} мс</span>`;

          if (testResult && testResult.tests && testResult.tests.length) {
            testHtml = testResult.tests.map(a =>
              `<div class="runner-test ${a.ok ? "ok" : "fail"}">
                <span class="rt-mark">${a.ok ? "✓" : "✗"}</span>
                <span class="rt-name">${App.escapeHtml(a.name || "")}${
                  a.error ? ` <span class="rt-err">— ${App.escapeHtml(a.error)}</span>` : ""
                }</span>
              </div>`
            ).join("");
          }
          if (testResult && testResult.error) {
            errorHtml = `<div class="runner-err">${App.escapeHtml(testResult.error)}</div>`;
          }
        }

        const row = document.createElement("div");
        row.className = rowClass;
        const folderLabel = folder
          ? `<span class="runner-folder">${App.escapeHtml(folder)} / </span>` : "";
        row.innerHTML = `
          <div class="runner-row-inner">
            <span class="method-badge method-${(req.method || "GET").toLowerCase()} runner-method">
              ${req.method || "GET"}
            </span>
            <div class="runner-main">
              <div class="runner-name" title="${App.escapeAttr(req.name || "")}">${folderLabel}${App.escapeHtml(req.name || req.url || "")}</div>
              <div class="runner-url" title="${App.escapeAttr(req.url || "")}">${App.escapeHtml(req.url || "")}</div>
              ${errorHtml}
              ${testHtml ? `<div class="runner-tests">${testHtml}</div>` : ""}
            </div>
            <div class="runner-right">${statusHtml}</div>
          </div>`;
        resultsDiv.appendChild(row);
        resultsDiv.scrollTop = resultsDiv.scrollHeight;

        _updateSummary();
      });

      _running = false;
      startBtn.style.display = "";
      stopBtn.style.display  = "none";
    });

    stopBtn.addEventListener("click", () => { _abort = true; });
  };


})();
