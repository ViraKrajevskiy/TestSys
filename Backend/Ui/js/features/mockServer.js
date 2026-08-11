/**
 * mockServer.js — UI для встроенного mock-сервера
 */
window.App = window.App || {};

(function () {

  let _routes = [];
  let _running = false;
  let _port = 3999;
  let _logTimer = null;

  App.showMockServer = function () {
    // Fetch current status
    if (window.pywebview && window.pywebview.api) {
      window.pywebview.api.get_mock_status().then(s => {
        _running = s.running;
        _port = s.port || 3999;
        if (s.routes > 0 && _routes.length === 0) {
          // routes are on backend, keep local
        }
        _render();
      });
    } else {
      _render();
    }
  };

  function _render() {
    let old = document.getElementById("mock-modal");
    if (old) old.remove();

    const div = document.createElement("div");
    div.id = "mock-modal";
    div.className = "modal fade show";
    div.style.cssText = "display:block;background:rgba(0,0,0,.55);z-index:10000;";
    div.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-hdd-rack me-2"></i>Mock Server</h5>
            <button type="button" class="btn-close btn-close-white" id="mock-close"></button>
          </div>
          <div class="modal-body" style="padding:16px;">
            <div class="d-flex align-items-center gap-3 mb-3">
              <label style="font-size:12px;white-space:nowrap;">Port:</label>
              <input type="number" class="form-control form-control-sm" id="mock-port" value="${_port}" style="width:100px;" ${_running ? "disabled" : ""}>
              <button class="btn btn-sm ${_running ? "btn-danger" : "send-btn"}" id="mock-toggle">
                ${_running ? '<i class="bi bi-stop-circle me-1"></i>Stop' : '<i class="bi bi-play-fill me-1"></i>Start'}
              </button>
              <span id="mock-status" style="font-size:12px;color:${_running ? "var(--success,#28a745)" : "var(--text-dim)"};">
                ${_running ? "Running on :" + _port : "Stopped"}
              </span>
            </div>

            <div class="mb-2" style="font-weight:600;font-size:13px;">Routes</div>
            <div id="mock-routes"></div>
            <button class="btn btn-sm btn-outline-secondary mt-2" id="mock-add-route">
              <i class="bi bi-plus-lg me-1"></i>Add Route
            </button>

            <div class="mt-3 mb-2" style="font-weight:600;font-size:13px;">
              Request Log
              <button class="btn btn-sm btn-outline-secondary ms-2" id="mock-refresh-log" style="font-size:10px;padding:1px 8px;">Refresh</button>
            </div>
            <div id="mock-log" style="max-height:200px;overflow-y:auto;font-size:11px;font-family:monospace;background:var(--bg-input);border-radius:var(--radius);padding:8px;"></div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(div);
    div.querySelector("#mock-close").addEventListener("click", _close);
    div.addEventListener("click", (e) => { if (e.target === div) _close(); });

    div.querySelector("#mock-toggle").addEventListener("click", () => {
      if (_running) {
        _stopServer();
      } else {
        _port = parseInt(document.getElementById("mock-port").value) || 3999;
        _startServer();
      }
    });

    div.querySelector("#mock-add-route").addEventListener("click", () => {
      _routes.push({ method: "GET", path: "/api/test", status: 200, body: '{"ok": true}', delay: 0, headers: {} });
      _renderRoutes();
    });

    div.querySelector("#mock-refresh-log").addEventListener("click", _refreshLog);

    _renderRoutes();
    _refreshLog();
  }

  function _renderRoutes() {
    const container = document.getElementById("mock-routes");
    if (!container) return;

    if (_routes.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No routes defined. Click "Add Route" to create one.</div>';
      return;
    }

    container.innerHTML = _routes.map((r, i) => `
      <div class="mock-route-card" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;">
        <div class="d-flex gap-2 align-items-center mb-2">
          <select class="form-select form-select-sm mock-r-method" data-idx="${i}" style="width:90px;font-size:11px;">
            ${["GET","POST","PUT","PATCH","DELETE","ANY"].map(m => `<option ${m === r.method ? "selected" : ""}>${m}</option>`).join("")}
          </select>
          <input type="text" class="form-control form-control-sm mock-r-path" data-idx="${i}" value="${App.escapeAttr(r.path)}" placeholder="/api/path" style="flex:1;font-size:12px;">
          <input type="number" class="form-control form-control-sm mock-r-status" data-idx="${i}" value="${r.status}" style="width:70px;font-size:11px;" title="Status code">
          <input type="number" class="form-control form-control-sm mock-r-delay" data-idx="${i}" value="${r.delay || 0}" style="width:70px;font-size:11px;" title="Delay (ms)" placeholder="delay ms">
          <button class="btn btn-sm btn-outline-danger mock-r-del" data-idx="${i}" style="font-size:10px;padding:2px 6px;"><i class="bi bi-trash3"></i></button>
        </div>
        <textarea class="form-control form-control-sm mock-r-body" data-idx="${i}" rows="2" style="font-size:11px;font-family:monospace;" placeholder='Response body (JSON)'>${App.escapeHtml(typeof r.body === "object" ? JSON.stringify(r.body, null, 2) : (r.body || ""))}</textarea>
      </div>`).join("");

    // Bind events
    container.querySelectorAll(".mock-r-method").forEach(el => {
      el.addEventListener("change", (e) => { _routes[+e.target.dataset.idx].method = e.target.value; });
    });
    container.querySelectorAll(".mock-r-path").forEach(el => {
      el.addEventListener("input", (e) => { _routes[+e.target.dataset.idx].path = e.target.value; });
    });
    container.querySelectorAll(".mock-r-status").forEach(el => {
      el.addEventListener("input", (e) => { _routes[+e.target.dataset.idx].status = parseInt(e.target.value) || 200; });
    });
    container.querySelectorAll(".mock-r-delay").forEach(el => {
      el.addEventListener("input", (e) => { _routes[+e.target.dataset.idx].delay = parseInt(e.target.value) || 0; });
    });
    container.querySelectorAll(".mock-r-body").forEach(el => {
      el.addEventListener("input", (e) => { _routes[+e.target.dataset.idx].body = e.target.value; });
    });
    container.querySelectorAll(".mock-r-del").forEach(el => {
      el.addEventListener("click", (e) => {
        _routes.splice(+e.currentTarget.dataset.idx, 1);
        _renderRoutes();
      });
    });
  }

  function _startServer() {
    if (!window.pywebview || !window.pywebview.api) return;
    window.pywebview.api.start_mock_server(_port, _routes).then(res => {
      if (res.ok) {
        _running = true;
        _render();
      } else {
        App.showAlert && App.showAlert("Mock server error: " + (res.error || "unknown"));
      }
    });
  }

  function _stopServer() {
    if (!window.pywebview || !window.pywebview.api) return;
    window.pywebview.api.stop_mock_server().then(() => {
      _running = false;
      _render();
    });
  }

  function _refreshLog() {
    if (!window.pywebview || !window.pywebview.api) return;
    window.pywebview.api.get_mock_log().then(log => {
      const el = document.getElementById("mock-log");
      if (!el) return;
      if (!log || !log.length) {
        el.innerHTML = '<span style="color:var(--text-dim);">No requests yet</span>';
        return;
      }
      el.innerHTML = log.map(e => {
        const color = e.status < 400 ? "var(--success,#28a745)" : "var(--danger,#dc3545)";
        return `<div><span style="color:var(--text-dim)">${e.time}</span> <span style="color:${color}">${e.status}</span> ${e.method} ${App.escapeHtml(e.path)} <span style="color:var(--text-dim)">${e.note}</span></div>`;
      }).join("");
      el.scrollTop = el.scrollHeight;
    });
  }

  function _close() {
    const m = document.getElementById("mock-modal");
    if (m) m.remove();
    if (_logTimer) { clearInterval(_logTimer); _logTimer = null; }
  }

  /** Import routes from collection */
  App.importMockRoutesFromCollection = function (colIdx) {
    const col = (App.state.collections || [])[colIdx];
    if (!col) return;
    const allReqs = [];
    (col.requests || []).forEach(r => allReqs.push(r));
    (col.folders || []).forEach(f => (f.requests || []).forEach(r => allReqs.push(r)));

    allReqs.forEach(r => {
      let path = "/mock";
      try {
        const u = new URL(r.url);
        path = u.pathname;
      } catch {}
      _routes.push({
        method: r.method || "GET",
        path: path,
        status: 200,
        body: '{"mock": true}',
        delay: 0,
        headers: {},
      });
    });
  };

})();
