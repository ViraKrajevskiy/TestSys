window.App = window.App || {};

(function () {
  // ============================================================
  // INIT — кнопка + модалка
  // ============================================================
  App.initMetrics = function () {
    // Inject modal
    const html = `
    <div class="modal fade" id="metrics-modal" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-graph-up me-2"></i>Метрики запросов</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
            <!-- Summary cards -->
            <div id="metrics-summary" class="row g-2 mb-3"></div>
            <!-- History table -->
            <div id="metrics-table-wrap"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="metrics-clear-btn">
              <i class="bi bi-trash3 me-1"></i>Очистить
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="metrics-export-btn">
              <i class="bi bi-download me-1"></i>Export CSV
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Закрыть</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML("beforeend", html);

    const modalEl = document.getElementById("metrics-modal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Open button
    document.getElementById("metrics-btn")?.addEventListener("click", () => {
      _renderMetrics();
      modal.show();
    });

    // Clear
    document.getElementById("metrics-clear-btn").addEventListener("click", () => {
      App.metricsHistory = [];
      _renderMetrics();
    });

    // Export
    document.getElementById("metrics-export-btn").addEventListener("click", _exportCsv);
  };

  // ============================================================
  // RENDER
  // ============================================================
  function _renderMetrics() {
    const data = App.metricsHistory;
    _renderSummary(data);
    _renderTable(data);
  }

  function _renderSummary(data) {
    const container = document.getElementById("metrics-summary");
    if (data.length === 0) {
      container.innerHTML = '<div class="col-12 text-center" style="color:var(--text-dim);padding:16px;">Нет данных. Отправьте запрос.</div>';
      return;
    }

    const total = data.length;
    const success = data.filter(d => d.ok).length;
    const failed = total - success;
    const times = data.filter(d => d.elapsed_ms > 0).map(d => d.elapsed_ms);
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const minTime = times.length ? Math.min(...times) : 0;
    const maxTime = times.length ? Math.max(...times) : 0;
    const totalSize = data.reduce((a, d) => a + (d.size || 0), 0);

    // Status code distribution
    const statusCounts = {};
    data.forEach(d => {
      const key = d.status ? String(d.status).charAt(0) + "xx" : "err";
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    });

    // Method distribution
    const methodCounts = {};
    data.forEach(d => { methodCounts[d.method] = (methodCounts[d.method] || 0) + 1; });

    container.innerHTML = `
      ${_card("Всего", total, "bi-send", "var(--accent)")}
      ${_card("Успешных", success, "bi-check-circle", "#28a745")}
      ${_card("Ошибок", failed, "bi-x-circle", "#dc3545")}
      ${_card("Ср. время", avgTime + " ms", "bi-clock", "var(--accent)")}
      ${_card("Мин / Макс", minTime + " / " + maxTime + " ms", "bi-speedometer", "var(--text-dim)")}
      ${_card("Общий размер", _formatSize(totalSize), "bi-hdd", "var(--text-dim)")}
      <div class="col-6 col-md-3">
        <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius);padding:10px;">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;">По статусам</div>
          <div style="font-size:12px;margin-top:4px;">
            ${Object.entries(statusCounts).map(([k, v]) => `<span style="margin-right:8px;"><strong>${k}:</strong> ${v}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius);padding:10px;">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;">По методам</div>
          <div style="font-size:12px;margin-top:4px;">
            ${Object.entries(methodCounts).map(([k, v]) => `<span style="margin-right:8px;"><strong>${k}:</strong> ${v}</span>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function _card(label, value, icon, color) {
    return `
    <div class="col-6 col-md-2">
      <div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius);padding:10px;text-align:center;">
        <i class="bi ${icon}" style="font-size:18px;color:${color};"></i>
        <div style="font-size:16px;font-weight:700;color:var(--text-main);margin-top:2px;">${value}</div>
        <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;">${label}</div>
      </div>
    </div>`;
  }

  function _renderTable(data) {
    const wrap = document.getElementById("metrics-table-wrap");
    if (data.length === 0) { wrap.innerHTML = ""; return; }

    const reversed = [...data].reverse(); // newest first
    let html = `
    <div class="table-responsive" style="max-height:350px;overflow-y:auto;">
      <table class="table table-sm" style="font-size:12px;color:var(--text-main);">
        <thead><tr>
          <th style="color:var(--text-dim);">#</th>
          <th style="color:var(--text-dim);">Метод</th>
          <th style="color:var(--text-dim);">URL</th>
          <th style="color:var(--text-dim);">Статус</th>
          <th style="color:var(--text-dim);">Время</th>
          <th style="color:var(--text-dim);">Размер</th>
          <th style="color:var(--text-dim);">Когда</th>
        </tr></thead><tbody>`;

    reversed.forEach((d, i) => {
      const statusClass = d.ok ? (d.status < 400 ? "color:#28a745" : "color:#ffc107") : "color:#dc3545";
      const methodVar = App.METHOD_COLOR_VAR[d.method] || "--text-dim";
      const urlShort = _shortenUrl(d.url, 40);
      const time = d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : "—";

      html += `<tr>
        <td>${data.length - i}</td>
        <td><span style="color:var(${methodVar});font-weight:600;">${d.method}</span></td>
        <td title="${App.escapeHtml(d.url)}" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${App.escapeHtml(urlShort)}</td>
        <td style="${statusClass};font-weight:600;">${d.status || "ERR"}</td>
        <td>${d.elapsed_ms} ms</td>
        <td>${_formatSize(d.size)}</td>
        <td style="color:var(--text-dim);">${time}</td>
      </tr>`;
    });

    html += "</tbody></table></div>";
    wrap.innerHTML = html;
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function _shortenUrl(url, max) {
    if (!url || url.length <= max) return url;
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return u.host + (path.length > max - u.host.length ? path.substring(0, max - u.host.length) + "..." : path);
    } catch {
      return url.substring(0, max) + "...";
    }
  }

  function _exportCsv() {
    const data = App.metricsHistory;
    if (!data.length) return;
    let csv = "Method,URL,Status,Time_ms,Size_bytes,OK,Timestamp\n";
    data.forEach(d => {
      csv += `${d.method},"${(d.url || "").replace(/"/g, '""')}",${d.status || ""},${d.elapsed_ms},${d.size},${d.ok},${d.timestamp ? new Date(d.timestamp).toISOString() : ""}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "testsys-metrics.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
})();
