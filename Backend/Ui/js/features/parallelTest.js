/**
 * parallelTest.js — Параллельные тесты (race conditions).
 *
 * В отличие от Load Test — там дубасим ОДИН запрос N раз в параллель —
 * здесь запускаем НЕСКОЛЬКО РАЗНЫХ запросов одновременно. Цель — найти
 * race conditions на сервере:
 *   - Дедлоки/500 при одновременных writes.
 *   - Дубликаты (POST /order отработал дважды с одинаковыми данными).
 *   - Потерянные обновления (lost update).
 *   - Аномальные задержки, когда сервер сериализует по мьютексу.
 *
 * Как пользоваться:
 *   1. Выбираешь несколько запросов из коллекций (галочками).
 *   2. Ставишь количество итераций и «одновременно N раундов».
 *   3. Жмёшь Start. Все выбранные запросы летят одновременно за N раундов.
 *   4. Смотришь сводку по каждой ручке + красные точки: где race.
 *
 * Что подсвечиваем как подозрительное:
 *   - Кол-во 5xx > 0.
 *   - «Уникальность» — если у POST в ответе одинаковые id — дубль.
 *   - Если один и тот же запрос иногда 200 иногда 4xx — недетерминизм.
 *   - Timings: одна ручка отвечает то за 20мс то за 3000мс — блокировка.
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _selected = new Set();      // ключи выбранных запросов (col::folder::name)
  let _state = null;              // {running, results, config, aborted}

  App.initParallelTest = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("par-modal"));

    document.addEventListener("click", (e) => {
      if (e.target.closest("#par-test-btn")) {
        e.preventDefault();
        App.showParallelTest();
      }
    });

    document.getElementById("par-start").addEventListener("click", _start);
    document.getElementById("par-stop").addEventListener("click", _stop);
    document.getElementById("par-selectall").addEventListener("click", () => _selectAll(true));
    document.getElementById("par-selectnone").addEventListener("click", () => _selectAll(false));
    document.getElementById("par-export").addEventListener("click", _exportCsv);

    // При смене языка перерисовываем динамические части (список запросов,
    // результаты, автоанализ) — они собираются в JS и не покрыты data-i18n.
    App.onLangChange && App.onLangChange(() => {
      const modal = document.getElementById("par-modal");
      if (!modal || !modal.classList.contains("show")) return;
      _renderRequestTree();
      _renderResults();
      _renderAnalysis();
    });
  };

  App.showParallelTest = function () {
    // Защита: модалка могла быть удалена извне (i18n cleanup) — пересоздаём.
    // Без этого _renderRequestTree упадёт на innerHTML = null.
    if (!document.getElementById("par-modal")) {
      App.initParallelTest();
    }
    _renderRequestTree();
    _renderResults();
    _modal.show();
  };

  // ============================================================
  // ВЫБОР ЗАПРОСОВ ИЗ КОЛЛЕКЦИЙ
  // ============================================================
  function _allRequests() {
    // Собираем плоский список всех запросов из пользовательских коллекций
    const out = [];
    const cols = (App.USER_COLLECTIONS || []).concat(App.BUILTIN_COLLECTIONS || []);
    cols.forEach((c) => {
      (c.folders || []).forEach((f) => {
        (f.items || []).forEach((it, idx) => {
          out.push({
            key: `${c.name}::${f.name}::${idx}`,
            collection: c.name, folder: f.name, name: it.name,
            method: it.method, url: it.url,
            entry: it, folderRef: f,
          });
        });
      });
    });
    return out;
  }

  function _renderRequestTree() {
    const box = document.getElementById("par-requests");
    const all = _allRequests();
    if (!all.length) {
      box.innerHTML = `<div style="color:var(--text-dim);padding:12px;">${App.t("noRequestsYet") || "Нет сохранённых запросов. Добавьте в коллекции."}</div>`;
      return;
    }

    // Группируем: collection -> folder -> requests
    const byColFolder = {};
    all.forEach(r => {
      const c = byColFolder[r.collection] = byColFolder[r.collection] || {};
      (c[r.folder] = c[r.folder] || []).push(r);
    });

    let html = "";
    Object.entries(byColFolder).forEach(([col, folders]) => {
      html += `<div class="par-col"><div class="par-col-name"><i class="bi bi-collection"></i> ${App.escapeHtml(col)}</div>`;
      Object.entries(folders).forEach(([folder, reqs]) => {
        html += `<div class="par-folder"><div class="par-folder-name"><i class="bi bi-folder2"></i> ${App.escapeHtml(folder)}</div>`;
        reqs.forEach(r => {
          const checked = _selected.has(r.key) ? "checked" : "";
          const colorVar = (App.METHOD_COLOR_VAR && App.METHOD_COLOR_VAR[r.method]) || "--text-dim";
          html += `
            <label class="par-req">
              <input type="checkbox" data-key="${App.escapeAttr(r.key)}" ${checked}>
              <span class="par-method" style="color:var(${colorVar});border-color:var(${colorVar});">${r.method}</span>
              <span class="par-req-name">${App.escapeHtml(r.name)}</span>
              <span class="par-req-url">${App.escapeHtml(String(r.url || "").slice(0, 60))}</span>
            </label>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    });
    box.innerHTML = html;

    box.querySelectorAll("input[type='checkbox']").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) _selected.add(cb.dataset.key);
        else _selected.delete(cb.dataset.key);
        _updateSelectionInfo();
      });
    });
    _updateSelectionInfo();
  }

  function _selectAll(on) {
    const box = document.getElementById("par-requests");
    box.querySelectorAll("input[type='checkbox']").forEach(cb => {
      cb.checked = on;
      if (on) _selected.add(cb.dataset.key);
      else    _selected.delete(cb.dataset.key);
    });
    _updateSelectionInfo();
  }

  function _updateSelectionInfo() {
    const el = document.getElementById("par-selection-info");
    if (el) el.textContent = `${_selected.size} ${App.t("selected") || "выбрано"}`;
  }

  // ============================================================
  // ЗАПУСК
  // ============================================================
  async function _start() {
    if (_state && _state.running) return;
    if (!_selected.size) { App.showAlert(App.t("selectAtLeastOne") || "Выберите хотя бы один запрос"); return; }

    const iterations = clamp(+document.getElementById("par-iterations").value, 1, 1000);
    const roundConcurrency = clamp(+document.getElementById("par-round-concurrency").value, 1, 20);
    const delayMs = clamp(+document.getElementById("par-delay").value, 0, 10000);

    const allReqs = _allRequests();
    const chosen = allReqs.filter(r => _selected.has(r.key));

    _state = {
      running: true, aborted: false,
      config: { iterations, roundConcurrency, delayMs },
      chosen,
      // Массив результатов по каждой ручке: {key, results: [{ms, status, ok, body, roundIdx}]}
      results: chosen.map(r => ({ key: r.key, req: r, results: [] })),
      startedAt: performance.now(),
    };

    _setPhase("running");
    _updateProgress(0, iterations);

    // Каждый раунд: одновременно выпускаем все выбранные запросы.
    // roundConcurrency — сколько раундов идёт параллельно (обычно 1-3).
    let round = 0;
    const runRound = async (rIdx) => {
      const promises = chosen.map((r) => _runOne(r, rIdx));
      const rs = await Promise.all(promises);
      rs.forEach((res, i) => {
        _state.results[i].results.push(Object.assign({ roundIdx: rIdx }, res));
      });
    };

    while (round < iterations && !_state.aborted) {
      const batch = [];
      for (let c = 0; c < roundConcurrency && round < iterations; c++, round++) {
        batch.push(runRound(round));
      }
      await Promise.all(batch);
      _updateProgress(round, iterations);
      _renderResults();
      if (delayMs > 0 && round < iterations && !_state.aborted) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    _state.running = false;
    _state.finishedAt = performance.now();
    _setPhase(_state.aborted ? "aborted" : "done");
    _renderResults();
    _renderAnalysis();
  }

  function _stop() { if (_state) _state.aborted = true; }

  async function _runOne(reqInfo, roundIdx) {
    const started = performance.now();
    const tab = reqInfo.entry;
    const resolve = App.resolveAll || App.resolveVariables || ((s) => s);
    const url = resolve(tab.url || "").trim();
    const body = tab.body ? resolve(tab.body) : "";
    const headers = { "Content-Type": "application/json" };

    let resp;
    try {
      resp = await window.pywebview.api.send_request(
        tab.method, url, headers, {}, body || null,
      );
    } catch (e) {
      return { ok: false, error: String(e), ms: performance.now() - started, status: 0, body: "" };
    }
    const ms = resp.elapsed_ms || Math.round(performance.now() - started);
    return {
      ok: resp.ok && resp.status_code < 400,
      status: resp.status_code || 0,
      ms, body: (resp.text || "").slice(0, 512),   // храним обрезанный ответ для анализа
      error: resp.ok ? "" : (resp.error || "").split("\n")[0],
    };
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // ============================================================
  // РЕНДЕР РЕЗУЛЬТАТОВ
  // ============================================================
  function _renderResults() {
    const box = document.getElementById("par-results");
    if (!_state) { box.innerHTML = ""; return; }

    const rows = _state.results.map(g => {
      const total = g.results.length;
      const ok    = g.results.filter(r => r.ok).length;
      const fail  = total - ok;
      const times = g.results.map(r => r.ms);
      const avg   = times.length ? Math.round(times.reduce((a,b)=>a+b,0) / times.length) : 0;
      const min   = times.length ? Math.min(...times) : 0;
      const max   = times.length ? Math.max(...times) : 0;

      // Статусы: сколько 5xx, сколько 4xx
      const s5xx = g.results.filter(r => r.status >= 500).length;
      const s4xx = g.results.filter(r => r.status >= 400 && r.status < 500).length;

      const flags = [];
      if (s5xx > 0) flags.push(`<span class="par-flag par-flag-danger">${s5xx}× 5xx</span>`);
      if (s4xx > 0) flags.push(`<span class="par-flag par-flag-warn">${s4xx}× 4xx</span>`);
      // Разброс времени: max > avg × 3 подсвечиваем — «сериализация»
      if (avg > 0 && max > avg * 3 && max > 200) flags.push(`<span class="par-flag par-flag-warn">блокировка?</span>`);

      const colorVar = (App.METHOD_COLOR_VAR && App.METHOD_COLOR_VAR[g.req.method]) || "--text-dim";
      return `
        <tr>
          <td><span class="par-method" style="color:var(${colorVar});border-color:var(${colorVar});">${g.req.method}</span></td>
          <td><b>${App.escapeHtml(g.req.name)}</b><div class="par-req-url">${App.escapeHtml(String(g.req.url || "").slice(0, 60))}</div></td>
          <td>${total}</td>
          <td style="color:var(--success);">${ok}</td>
          <td style="color:${fail ? "var(--danger)" : "var(--text-dim)"}">${fail}</td>
          <td>${avg} ms</td>
          <td>${min}/${max}</td>
          <td>${flags.join(" ") || "—"}</td>
        </tr>`;
    }).join("");

    box.innerHTML = `
      <table class="par-table">
        <thead><tr>
          <th></th><th>${App.t("request") || "Запрос"}</th>
          <th>Total</th><th>OK</th><th>Fail</th>
          <th>avg</th><th>min/max</th><th>${App.t("flags") || "Флаги"}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /** Дополнительный анализ на race conditions после завершения. */
  function _renderAnalysis() {
    const box = document.getElementById("par-analysis");
    if (!_state) { box.innerHTML = ""; return; }

    const notes = [];

    _state.results.forEach(g => {
      const results = g.results;
      if (!results.length) return;

      // 1. Недетерминизм статусов — одна и та же ручка иногда OK иногда fail
      const statuses = new Set(results.map(r => r.status));
      if (statuses.size > 2) {
        notes.push({
          kind: "warn",
          text: `<b>${_esc(g.req.name)}</b> отвечает разными статусами: ${[...statuses].join(", ")}. Возможен недетерминизм при конкурентных вызовах.`,
        });
      }

      // 2. Дубликаты тел ответа для POST — часто индикатор дублирующего insert
      if (["POST", "PUT"].includes(g.req.method)) {
        const bodies = results.filter(r => r.ok).map(r => r.body);
        const uniq = new Set(bodies);
        if (bodies.length > 1 && uniq.size < bodies.length) {
          notes.push({
            kind: "danger",
            text: `<b>${_esc(g.req.name)}</b>: обнаружены дубликаты в ответах ${g.req.method}. Возможно, сервер создал одинаковые записи от параллельных запросов (нужен idempotency-key или UNIQUE constraint).`,
          });
        }
      }

      // 3. Большая разница min/max — сериализация на mutex/lock
      const times = results.map(r => r.ms);
      const min = Math.min(...times), max = Math.max(...times);
      if (min > 0 && max > min * 10 && max > 500) {
        notes.push({
          kind: "warn",
          text: `<b>${_esc(g.req.name)}</b>: разброс времени ${min}..${max} мс. Похоже на блокировку/сериализацию (пул БД, глобальный mutex).`,
        });
      }

      // 4. Много 5xx — дедлок / crash
      const s5xx = results.filter(r => r.status >= 500).length;
      if (s5xx > 0) {
        notes.push({
          kind: "danger",
          text: `<b>${_esc(g.req.name)}</b>: ${s5xx} ответов 5xx. Классический признак дедлока БД или необработанного исключения при конкурентных запросах.`,
        });
      }
    });

    // 5. Кросс-запросы: если несколько разных ручек POST'ят и все ответы одинаковые — race
    // (упрощённый эвристический анализ, для 2+ разных запросов)
    if (_state.chosen.length >= 2) {
      const allPostBodies = [];
      _state.results.forEach(g => {
        if (["POST", "PUT"].includes(g.req.method)) {
          g.results.filter(r => r.ok).forEach(r => allPostBodies.push({ req: g.req.name, body: r.body }));
        }
      });
      const byBody = {};
      allPostBodies.forEach(x => { (byBody[x.body] = byBody[x.body] || new Set()).add(x.req); });
      Object.values(byBody).forEach(set => {
        if (set.size > 1) {
          notes.push({
            kind: "warn",
            text: `Разные запросы (${[...set].join(", ")}) вернули одинаковое тело. Возможно, сервер путает состояние между сессиями.`,
          });
        }
      });
    }

    if (!notes.length) {
      box.innerHTML = `<div class="par-note par-note-ok"><i class="bi bi-check-circle"></i> Явных race conditions не обнаружено.</div>`;
      return;
    }
    box.innerHTML = notes.map(n => `<div class="par-note par-note-${n.kind}"><i class="bi bi-exclamation-triangle"></i> ${n.text}</div>`).join("");
  }

  // ============================================================
  // ФАЗЫ И ЭКСПОРТ
  // ============================================================
  function _updateProgress(done, total) {
    const bar = document.getElementById("par-progress");
    const txt = document.getElementById("par-progress-text");
    if (!bar) return;
    const pct = total ? Math.round(done / total * 100) : 0;
    bar.style.width = pct + "%";
    txt.textContent = `${done} / ${total} ${App.t("rounds") || "раундов"} (${pct}%)`;
  }

  function _setPhase(phase) {
    const start = document.getElementById("par-start");
    const stop  = document.getElementById("par-stop");
    const status = document.getElementById("par-status");
    if (phase === "running") {
      start.style.display = "none"; stop.style.display = "";
      status.textContent = App.t("running") || "Идёт тест…"; status.style.color = "var(--accent)";
    } else {
      start.style.display = ""; stop.style.display = "none";
      if (phase === "aborted") { status.textContent = App.t("aborted") || "Остановлено"; status.style.color = "var(--warn)"; }
      else if (phase === "done") { status.textContent = App.t("done") || "Готово"; status.style.color = "var(--success)"; }
      else status.textContent = "";
    }
  }

  async function _exportCsv() {
    if (!_state || !_state.results.length) { App.showAlert(App.t("noMetrics") || "Нет данных"); return; }
    const SEP = ";";
    const esc = (v) => {
      const s = String(v ?? "");
      return /["\n;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [["Request", "Method", "Round", "OK", "Status", "Time_ms", "Error"]];
    _state.results.forEach(g => {
      g.results.forEach(r => rows.push([
        g.req.name, g.req.method, r.roundIdx,
        r.ok ? "1" : "0", r.status, r.ms, r.error || "",
      ]));
    });
    const csv = rows.map(r => r.map(esc).join(SEP)).join("\r\n");
    if (window.pywebview?.api?.save_text_file) {
      const res = await window.pywebview.api.save_text_file(
        "parallel-test.csv", csv, ["CSV (*.csv)", "All files (*.*)"]
      );
      if (res.ok) App.showAlert(res.path);
      else if (!res.cancelled) App.showAlert("Error: " + res.error);
    }
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    // Все user-facing строки — через data-i18n / data-i18n-title, чтобы
    // applyTranslations() подхватил их при смене языка на лету, без пересборки.
    return `
    <div class="modal fade" id="par-modal" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-diagram-3 me-2"></i><span data-i18n="parallelTests">Параллельные тесты</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;" data-i18n="parHint">
              Одновременно запускаем несколько разных запросов, чтобы найти race conditions: дедлоки, дубли записей, потерянные обновления.
            </div>

            <div class="row g-2 mb-3">
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="parIterations">Итераций (раундов)</label>
                <input type="number" class="form-control form-control-sm" id="par-iterations" value="20" min="1" max="1000">
              </div>
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="parRoundConcurrency">Раундов параллельно</label>
                <input type="number" class="form-control form-control-sm" id="par-round-concurrency" value="1" min="1" max="20">
              </div>
              <div class="col-md-3">
                <label class="form-label" style="font-size:12px;" data-i18n="parDelay">Задержка между раундами (мс)</label>
                <input type="number" class="form-control form-control-sm" id="par-delay" value="0" min="0" max="10000">
              </div>
              <div class="col-md-3 d-flex align-items-end gap-2">
                <button class="btn send-btn btn-sm" id="par-start"><i class="bi bi-play-fill"></i> <span data-i18n="start">Start</span></button>
                <button class="btn btn-outline-danger btn-sm" id="par-stop" style="display:none;"><i class="bi bi-stop-fill"></i> <span data-i18n="stop">Stop</span></button>
                <span id="par-status" style="font-size:12px;font-weight:600;"></span>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2 mb-2">
              <div style="flex:1;font-size:12px;color:var(--text-dim);">
                <span data-i18n="selectRequests">Выберите запросы для параллельного запуска</span>
                — <span id="par-selection-info">0 <span data-i18n="selected">выбрано</span></span>
              </div>
              <button class="btn btn-sm btn-outline-secondary" id="par-selectall" data-i18n="selectAll">Все</button>
              <button class="btn btn-sm btn-outline-secondary" id="par-selectnone" data-i18n="selectNone">Ничего</button>
            </div>

            <div id="par-requests" class="par-tree" style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius);padding:6px;"></div>

            <div class="load-progress-wrap mt-3">
              <div class="load-progress-track"><div id="par-progress" class="load-progress-bar"></div></div>
              <div id="par-progress-text" class="load-progress-text">—</div>
            </div>

            <div id="par-results" class="mt-3"></div>
            <div id="par-analysis" class="mt-3"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" id="par-export"><i class="bi bi-download me-1"></i>CSV</button>
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="close">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
