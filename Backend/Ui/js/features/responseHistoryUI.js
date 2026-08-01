/**
 * responseHistoryUI.js — модалка истории ответов и просмотра diff'а.
 * Открывается по горячей клавише или через контекст-меню.
 */
window.App = window.App || {};

(function () {
  App.showResponseHistoryUI = function () {
    const tab = App.getActiveTab && App.getActiveTab();
    if (!tab) { App.showAlert(App.t("noActiveRequest") || "Нет активного запроса"); return; }
    const hist = App.getResponseHistory(tab);

    if (!document.getElementById("resp-hist-modal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="resp-hist-modal" tabindex="-1">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content theme-modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-clock-history me-2"></i>${App.t("respHistory") || "История ответов"}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="d-flex gap-2 mb-2 flex-wrap">
                  <button class="btn btn-sm btn-outline-secondary" id="rh-save-baseline">
                    <i class="bi bi-bookmark-star me-1"></i>${App.t("saveBaseline") || "Сохранить текущий как эталон"}
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" id="rh-clear-baseline">
                    <i class="bi bi-x-lg me-1"></i>${App.t("clearBaseline") || "Убрать эталон"}
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" id="rh-show-diff">
                    <i class="bi bi-file-diff me-1"></i>${App.t("showDiff") || "Показать diff с эталоном"}
                  </button>
                  <button class="btn btn-sm btn-outline-danger ms-auto" id="rh-clear">
                    <i class="bi bi-trash3 me-1"></i>${App.t("clearHistory") || "Очистить историю"}
                  </button>
                </div>
                <div id="rh-baseline-info" style="font-size:11px;color:var(--text-dim);margin-bottom:6px;"></div>
                <div id="rh-list"></div>
                <div id="rh-diff" style="margin-top:12px;"></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${App.t("close") || "Закрыть"}</button>
              </div>
            </div>
          </div>
        </div>`);
      document.getElementById("rh-save-baseline").addEventListener("click", () => {
        const t = App.getActiveTab();
        App.saveBaseline(t);
        _render();
      });
      document.getElementById("rh-clear-baseline").addEventListener("click", () => {
        App.clearBaseline(App.getActiveTab()); _render();
      });
      document.getElementById("rh-show-diff").addEventListener("click", _renderDiff);
      document.getElementById("rh-clear").addEventListener("click", () => {
        App.clearResponseHistory(App.getActiveTab()); _render();
      });
    }
    _render();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("resp-hist-modal")).show();
  };

  function _render() {
    const tab = App.getActiveTab();
    if (!tab) return;
    const list = document.getElementById("rh-list");
    const bl   = document.getElementById("rh-baseline-info");
    const hist = App.getResponseHistory(tab);

    if (tab.baselineResponse) {
      const when = tab.baselineSavedAt ? new Date(tab.baselineSavedAt).toLocaleString() : "";
      bl.innerHTML = `📌 ${App.t("baseline") || "Эталон"}: HTTP ${tab.baselineResponse.status_code || "?"} · ${when}`;
      bl.style.color = "var(--accent)";
    } else {
      bl.textContent = App.t("noBaseline") || "Эталон не задан — жмите «Сохранить текущий как эталон» на нужном ответе.";
      bl.style.color = "var(--text-dim)";
    }

    if (!hist.length) {
      list.innerHTML = `<div style="color:var(--text-dim);padding:12px;text-align:center;">${App.t("historyEmpty") || "История пуста — сделайте несколько запросов."}</div>`;
      return;
    }

    list.innerHTML = hist.map((h, i) => {
      const r = h.response || {};
      const status = r.status_code || "ERR";
      const statusCol = String(status).charAt(0) === "2" ? "var(--success)"
                       : String(status).charAt(0) === "5" ? "var(--danger)"
                       : String(status).charAt(0) === "4" ? "var(--warn)" : "var(--text-dim)";
      const time = new Date(h.ts).toLocaleTimeString();
      return `
        <div class="rh-row" data-idx="${i}">
          <span class="rh-idx">${i === 0 ? "★" : "#" + i}</span>
          <span class="rh-status" style="color:${statusCol};border-color:${statusCol};">${status}</span>
          <span class="rh-method">${h.method || ""}</span>
          <span class="rh-url" title="${_esc(h.url || "")}">${_esc((h.url || "").slice(0, 50))}${(h.url || "").length > 50 ? "…" : ""}</span>
          <span class="rh-time">${time}</span>
          <span class="rh-ms">${r.elapsed_ms || 0} ms</span>
          <button class="btn btn-sm btn-outline-secondary rh-show" data-idx="${i}"><i class="bi bi-eye"></i></button>
        </div>`;
    }).join("");

    list.querySelectorAll(".rh-show").forEach(btn => {
      btn.addEventListener("click", () => {
        App.showHistoricResponse(App.getActiveTab(), +btn.dataset.idx);
        App.syncToast && App.syncToast((App.t("showing") || "Показан") + " #" + btn.dataset.idx);
      });
    });
  }

  function _renderDiff() {
    const tab = App.getActiveTab();
    const box = document.getElementById("rh-diff");
    if (!tab.baselineResponse) { box.innerHTML = `<div style="color:var(--warn);">${App.t("noBaseline") || "Нет эталона"}</div>`; return; }
    const d = App.diffWithBaseline(tab);
    if (!d) { box.innerHTML = `<div style="color:var(--text-dim);">${App.t("noDiff") || "Нет данных"}</div>`; return; }
    const changes = d.diff || [];
    if (!changes.length) {
      box.innerHTML = `<div class="rh-diff-clean">✓ ${App.t("noChangesFromBaseline") || "Изменений относительно эталона нет"}</div>`;
      return;
    }

    let head = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">`;
    if (d.meta.statusChanged) head += `⚠ Статус: ${d.meta.baseStatus} → ${d.meta.curStatus}. `;
    if (Math.abs(d.meta.elapsedDelta) > 10) head += `Время: ${d.meta.elapsedDelta > 0 ? "+" : ""}${d.meta.elapsedDelta} ms. `;
    head += `Изменений: ${changes.length}.</div>`;

    if (d.mode === "json") {
      box.innerHTML = head + `<div class="rh-diff-list">` + changes.map(c => {
        const cls = c.kind === "added" ? "rh-diff-add" : c.kind === "removed" ? "rh-diff-del" : "rh-diff-chg";
        const sign = c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "≠";
        let body = "";
        if (c.kind === "changed") body = `${_short(c.from)} → ${_short(c.to)}`;
        else if (c.kind === "added") body = _short(c.to);
        else body = _short(c.from);
        return `<div class="rh-diff-row ${cls}"><span class="rh-diff-sign">${sign}</span><span class="rh-diff-path">${_esc(c.path)}</span><span class="rh-diff-val">${_esc(body)}</span></div>`;
      }).join("") + `</div>`;
    } else {
      box.innerHTML = head + `<div class="rh-diff-list">` + changes.map(c => {
        const cls = c.kind === "added" ? "rh-diff-add" : "rh-diff-del";
        const sign = c.kind === "added" ? "+" : "−";
        return `<div class="rh-diff-row ${cls}"><span class="rh-diff-sign">${sign}</span><span class="rh-diff-val" style="font-family:monospace;">${_esc(c.line)}</span></div>`;
      }).join("") + `</div>`;
    }
  }

  function _short(v) {
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  }
  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
