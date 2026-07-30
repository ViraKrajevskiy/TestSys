/**
 * logViewer.js — Просмотр логов и ошибок
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _source = "memory";   // memory | file
  let _filter = "all";      // all | error | warn | info
  let _search = "";
  let _autoRefresh = null;

  App.initLogViewer = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    const el = document.getElementById("log-modal");
    _modal = bootstrap.Modal.getOrCreateInstance(el);

    // Открытие — через делегирование: кнопка живёт в модалке настроек,
    // которая создаётся ПОЗЖЕ этого модуля. Прямой addEventListener
    // просто не находил элемент и молча ничего не делал.
    document.addEventListener("click", (e) => {
      if (e.target.closest("#open-log-viewer")) {
        e.preventDefault();
        App.showLogViewer();
      }
    });

    // Источник: память / файл
    document.querySelectorAll('[name="log-source"]').forEach(r => {
      r.addEventListener("change", () => { _source = r.value; _render(); });
    });

    // Фильтр по уровню
    document.querySelectorAll(".log-filter-btn").forEach(b => {
      b.addEventListener("click", () => {
        _filter = b.dataset.level;
        document.querySelectorAll(".log-filter-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        _render();
      });
    });

    // Поиск
    document.getElementById("log-search").addEventListener("input", (e) => {
      _search = e.target.value.toLowerCase();
      _render();
    });

    // Кнопки
    document.getElementById("log-refresh").addEventListener("click", _render);

    document.getElementById("log-copy").addEventListener("click", async () => {
      const text = document.getElementById("log-output").innerText;
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);
      App.syncToast ? App.syncToast(App.t("copied")) : null;
    });

    document.getElementById("log-clear").addEventListener("click", async () => {
      const ok = await App.showConfirm({
        title: App.t("clear"),
        message: App.t("clearLogConfirm"),
        okText: App.t("clear"), danger: true,
      });
      if (!ok) return;
      App.clearLogBuffer();
      if (window.pywebview?.api?.clear_log) {
        const r = await window.pywebview.api.clear_log(true);   // вместе с архивами
        if (!r.ok) { App.showAlert(App.t("error") + ": " + r.error); return; }
      }
      _render();
      App.syncToast && App.syncToast(App.t("logsCleared"));
    });

    document.getElementById("log-export").addEventListener("click", async () => {
      if (!window.pywebview?.api?.export_log) return;
      const res = await window.pywebview.api.export_log();
      if (res.ok) App.showAlert(res.path);
      else if (!res.cancelled) App.showAlert(App.t("error") + ": " + res.error);
    });

    document.getElementById("log-open-folder").addEventListener("click", async () => {
      if (window.pywebview?.api?.open_log_folder) await window.pywebview.api.open_log_folder();
    });

    // Автообновление при открытой модалке
    el.addEventListener("shown.bs.modal", () => {
      _autoRefresh = setInterval(_render, 3000);
    });
    el.addEventListener("hidden.bs.modal", () => {
      clearInterval(_autoRefresh); _autoRefresh = null;
      // Сброс счётчика ошибок — пользователь их посмотрел
      App.clearLogBuffer && (App.getErrorCount() > 0) && _resetBadgeOnly();
    });
  };

  function _resetBadgeOnly() {
    // Обнуляем только бейдж, записи оставляем
    const btn = document.getElementById("settings-btn");
    const badge = btn && btn.querySelector(".error-badge");
    if (badge) badge.remove();
  }

  App.showLogViewer = function () {
    _render();
    _modal.show();
  };

  // ============================================================
  // РЕНДЕР
  // ============================================================
  async function _render() {
    const out = document.getElementById("log-output");
    if (!out) return;

    let entries = [];

    if (_source === "memory") {
      entries = App.getLogBuffer().map(e => ({
        ts: new Date(e.ts).toLocaleTimeString(),
        level: e.level,
        source: e.source,
        text: e.message,
        stack: e.stack,
      }));
    } else {
      // Из файла
      if (!window.pywebview?.api?.read_log) {
        out.innerHTML = `<div style="color:var(--text-dim);padding:16px;">${App.t("logFileUnavailable")}</div>`;
        return;
      }
      const res = await window.pywebview.api.read_log(3000);
      if (!res.ok) {
        out.innerHTML = `<div style="color:#dc3545;padding:16px;">${App.escapeHtml(res.error || "")}</div>`;
        return;
      }
      const shown = res.shown ?? (res.lines || []).length;
      const total = res.total ?? shown;
      document.getElementById("log-path").textContent =
        `${res.path || ""}  ·  ${App.t("linesShown")}: ${shown}` +
        (total > shown ? ` / ${total}` : "");
      entries = _groupFileLines(res.lines || []);
    }

    // Фильтрация
    let filtered = entries;
    if (_filter !== "all") {
      const want = _filter.toUpperCase();
      filtered = filtered.filter(e => (e.level || "").toUpperCase().startsWith(want.substring(0, 4)));
    }
    if (_search) {
      filtered = filtered.filter(e =>
        (e.text || "").toLowerCase().includes(_search) ||
        (e.source || "").toLowerCase().includes(_search));
    }

    // Счётчики
    const counts = { ERROR: 0, WARN: 0, INFO: 0 };
    entries.forEach(e => {
      const lv = (e.level || "").toUpperCase();
      if (lv.startsWith("ERR")) counts.ERROR++;
      else if (lv.startsWith("WARN")) counts.WARN++;
      else counts.INFO++;
    });
    document.getElementById("log-count-error").textContent = counts.ERROR;
    document.getElementById("log-count-warn").textContent = counts.WARN;
    document.getElementById("log-count-info").textContent = counts.INFO;

    if (!filtered.length) {
      out.innerHTML = `<div style="color:var(--text-dim);padding:16px;text-align:center;">${App.t("logEmpty")}</div>`;
      return;
    }

    // Новые сверху
    out.innerHTML = filtered.reverse().map(_row).join("");
  }

  function _row(e) {
    const lv = (e.level || "INFO").toUpperCase();
    const color = lv.startsWith("ERR") ? "#dc3545" : lv.startsWith("WARN") ? "#ffc107" : "var(--text-dim)";
    const icon = lv.startsWith("ERR") ? "bi-x-circle-fill"
               : lv.startsWith("WARN") ? "bi-exclamation-triangle-fill" : "bi-info-circle";

    return `
      <div class="log-row">
        <span class="log-time">${App.escapeHtml(e.ts || "")}</span>
        <i class="bi ${icon}" style="color:${color};font-size:11px;"></i>
        ${e.source ? `<span class="log-source">${App.escapeHtml(e.source)}</span>` : ""}
        <span class="log-text" style="${lv.startsWith("ERR") ? "color:#ff8080;" : ""}">${App.escapeHtml(e.text || "")}</span>
        ${e.stack ? `<details class="log-stack"><summary>stack</summary><pre>${App.escapeHtml(e.stack)}</pre></details>` : ""}
      </div>`;
  }

  const LINE_RE = /^([\d\-]+\s[\d:,]+)\s-\s(\w+)\s-\s([\s\S]*)$/;

  /**
   * Разбор файла с учётом многострочных записей.
   * Стектрейсы идут отдельными строками без префикса времени — раньше
   * каждая такая строка становилась самостоятельной записью и мусорила
   * в списке. Теперь они прилипают к своей записи как stack.
   */
  function _groupFileLines(lines) {
    const out = [];
    lines.forEach((line) => {
      const m = line.match(LINE_RE);
      if (m) {
        let text = m[3], source = "";
        const sm = text.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
        if (sm) { source = sm[1]; text = sm[2]; }
        out.push({ ts: m[1].split(" ")[1] || m[1], level: m[2], source, text, stack: "" });
      } else if (out.length) {
        // Продолжение предыдущей записи (стек, многострочное сообщение)
        out[out.length - 1].stack += (out[out.length - 1].stack ? "\n" : "") + line;
      } else {
        out.push({ ts: "", level: "INFO", source: "", text: line, stack: "" });
      }
    });
    return out;
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div class="modal fade" id="log-modal" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-card-list me-2"></i><span data-i18n="logs">Логи и ошибки</span></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <div class="modal-body" style="padding-bottom:8px;">
            <!-- Панель управления -->
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <div class="btn-group btn-group-sm" role="group">
                <input type="radio" class="btn-check" name="log-source" id="logsrc-mem" value="memory" checked>
                <label class="btn btn-outline-secondary btn-sm" for="logsrc-mem" style="font-size:11px;" data-i18n="logSession">Текущая сессия</label>
                <input type="radio" class="btn-check" name="log-source" id="logsrc-file" value="file">
                <label class="btn btn-outline-secondary btn-sm" for="logsrc-file" style="font-size:11px;" data-i18n="logFile">Файл лога</label>
              </div>

              <div class="btn-group btn-group-sm ms-2">
                <button class="btn btn-outline-secondary btn-sm log-filter-btn active" data-level="all" style="font-size:11px;">
                  <span data-i18n="all">Все</span>
                </button>
                <button class="btn btn-outline-secondary btn-sm log-filter-btn" data-level="error" style="font-size:11px;color:#dc3545;">
                  <i class="bi bi-x-circle"></i> <span id="log-count-error">0</span>
                </button>
                <button class="btn btn-outline-secondary btn-sm log-filter-btn" data-level="warn" style="font-size:11px;color:#ffc107;">
                  <i class="bi bi-exclamation-triangle"></i> <span id="log-count-warn">0</span>
                </button>
                <button class="btn btn-outline-secondary btn-sm log-filter-btn" data-level="info" style="font-size:11px;">
                  <i class="bi bi-info-circle"></i> <span id="log-count-info">0</span>
                </button>
              </div>

              <input type="text" class="form-control form-control-sm" id="log-search"
                     data-i18n-ph="search" placeholder="Поиск..." style="max-width:200px;font-size:11px;">

              <button class="btn btn-outline-secondary btn-sm ms-auto" id="log-refresh" style="font-size:11px;">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
            </div>

            <!-- Вывод -->
            <div id="log-output" class="log-output"></div>
            <div id="log-path" style="font-size:10px;color:var(--text-dim);margin-top:4px;word-break:break-all;"></div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-outline-secondary btn-sm" id="log-open-folder" style="font-size:11px;">
              <i class="bi bi-folder2-open me-1"></i><span data-i18n="openFolder">Открыть папку</span>
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="log-export" style="font-size:11px;">
              <i class="bi bi-download me-1"></i><span data-i18n="save">Сохранить</span>
            </button>
            <button class="btn btn-outline-secondary btn-sm" id="log-copy" style="font-size:11px;">
              <i class="bi bi-clipboard me-1"></i><span data-i18n="copy">Копировать</span>
            </button>
            <button class="btn btn-outline-danger btn-sm" id="log-clear" style="font-size:11px;">
              <i class="bi bi-trash3 me-1"></i><span data-i18n="clear">Очистить</span>
            </button>
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" style="font-size:11px;" data-i18n="close">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
