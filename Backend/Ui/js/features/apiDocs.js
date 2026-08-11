/**
 * apiDocs.js — Генерация API-документации из коллекции
 *
 * Формирует HTML-документ со всеми эндпоинтами, параметрами, примерами.
 */
window.App = window.App || {};

(function () {

  App.showApiDocsGenerator = function () {
    const cols = App.state.collections || [];
    if (!cols.length) {
      App.showAlert && App.showAlert("No collections to generate docs from.");
      return;
    }

    let old = document.getElementById("apidocs-modal");
    if (old) old.remove();

    const div = document.createElement("div");
    div.id = "apidocs-modal";
    div.className = "modal fade show";
    div.style.cssText = "display:block;background:rgba(0,0,0,.55);z-index:10000;";

    div.innerHTML = `
      <div class="modal-dialog modal-md">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-file-earmark-code me-2"></i>Generate API Docs</h5>
            <button type="button" class="btn-close btn-close-white" id="apidocs-close"></button>
          </div>
          <div class="modal-body" style="padding:16px;">
            <div class="mb-3">
              <label style="font-size:12px;font-weight:600;">Collection</label>
              <select class="form-select form-select-sm" id="apidocs-col">
                ${cols.map((c, i) => `<option value="${i}">${App.escapeHtml(c.name)}</option>`).join("")}
              </select>
            </div>
            <div class="mb-3">
              <label style="font-size:12px;font-weight:600;">Title</label>
              <input type="text" class="form-control form-control-sm" id="apidocs-title" placeholder="API Documentation" value="${App.escapeAttr(cols[0]?.name || "API")} Documentation">
            </div>
            <div class="mb-3">
              <label style="font-size:12px;font-weight:600;">Base URL</label>
              <input type="text" class="form-control form-control-sm" id="apidocs-base" placeholder="https://api.example.com">
            </div>
            <div class="mb-3">
              <label style="font-size:12px;font-weight:600;">Format</label>
              <select class="form-select form-select-sm" id="apidocs-format">
                <option value="html">HTML</option>
                <option value="md">Markdown</option>
              </select>
            </div>
            <button class="btn send-btn w-100" id="apidocs-gen">
              <i class="bi bi-file-earmark-arrow-down me-1"></i>Generate
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(div);

    div.querySelector("#apidocs-close").addEventListener("click", _close);
    div.addEventListener("click", (e) => { if (e.target === div) _close(); });

    div.querySelector("#apidocs-col").addEventListener("change", (e) => {
      const col = cols[+e.target.value];
      document.getElementById("apidocs-title").value = (col?.name || "API") + " Documentation";
    });

    div.querySelector("#apidocs-gen").addEventListener("click", () => {
      const colIdx = parseInt(document.getElementById("apidocs-col").value);
      const title = document.getElementById("apidocs-title").value || "API Documentation";
      const baseUrl = document.getElementById("apidocs-base").value || "";
      const format = document.getElementById("apidocs-format").value;

      const col = cols[colIdx];
      if (!col) return;

      let output;
      if (format === "md") {
        output = _generateMd(col, title, baseUrl);
      } else {
        output = _generateHtml(col, title, baseUrl);
      }

      _showOutput(output, format);
    });
  };

  function _getAllRequests(col) {
    const result = [];
    (col.requests || []).forEach(r => result.push({ folder: null, req: r }));
    (col.folders || []).forEach(f => {
      (f.requests || []).forEach(r => result.push({ folder: f.name, req: r }));
    });
    return result;
  }

  function _methodColor(m) {
    const map = { GET: "#61affe", POST: "#49cc90", PUT: "#fca130", PATCH: "#50e3c2", DELETE: "#f93e3e" };
    return map[m] || "#999";
  }

  function _generateHtml(col, title, baseUrl) {
    const items = _getAllRequests(col);
    const groups = {};
    items.forEach(it => {
      const g = it.folder || "Root";
      if (!groups[g]) groups[g] = [];
      groups[g].push(it.req);
    });

    let toc = "";
    let body = "";
    let idx = 0;

    for (const [group, reqs] of Object.entries(groups)) {
      toc += `<li style="margin-top:8px;font-weight:600;">${_esc(group)}</li><ul>`;
      body += `<h2 id="group-${idx}" style="margin-top:40px;padding-bottom:8px;border-bottom:2px solid #e0e0e0;">${_esc(group)}</h2>`;

      reqs.forEach((r, ri) => {
        const anchor = `ep-${idx}-${ri}`;
        const method = (r.method || "GET").toUpperCase();
        let path = r.url || "";
        if (baseUrl && path.startsWith(baseUrl)) path = path.substring(baseUrl.length);

        toc += `<li><a href="#${anchor}" style="color:#4a9eff;text-decoration:none;">
          <span style="color:${_methodColor(method)};font-weight:700;font-size:12px;">${method}</span> ${_esc(path || r.url)}
        </a></li>`;

        body += `
          <div id="${anchor}" style="margin:24px 0;padding:16px;background:#f8f9fa;border-radius:8px;border-left:4px solid ${_methodColor(method)};">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="background:${_methodColor(method)};color:#fff;padding:2px 10px;border-radius:4px;font-weight:700;font-size:13px;">${method}</span>
              <code style="font-size:14px;">${_esc(r.url || "")}</code>
            </div>
            ${r.name ? `<div style="font-weight:600;margin-bottom:8px;">${_esc(r.name)}</div>` : ""}`;

        // Headers
        const headers = (r.headers || []).filter(h => h.key && h.enabled !== false);
        if (headers.length) {
          body += `<div style="margin-top:12px;"><strong>Headers</strong>
            <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:13px;">
              <tr style="background:#e9ecef;"><th style="padding:4px 8px;text-align:left;">Key</th><th style="padding:4px 8px;text-align:left;">Value</th></tr>
              ${headers.map(h => `<tr><td style="padding:4px 8px;border-top:1px solid #dee2e6;"><code>${_esc(h.key)}</code></td><td style="padding:4px 8px;border-top:1px solid #dee2e6;">${_esc(h.value)}</td></tr>`).join("")}
            </table></div>`;
        }

        // Params
        const params = (r.params || []).filter(p => p.key && p.enabled !== false);
        if (params.length) {
          body += `<div style="margin-top:12px;"><strong>Query Parameters</strong>
            <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:13px;">
              <tr style="background:#e9ecef;"><th style="padding:4px 8px;text-align:left;">Key</th><th style="padding:4px 8px;text-align:left;">Value</th></tr>
              ${params.map(p => `<tr><td style="padding:4px 8px;border-top:1px solid #dee2e6;"><code>${_esc(p.key)}</code></td><td style="padding:4px 8px;border-top:1px solid #dee2e6;">${_esc(p.value)}</td></tr>`).join("")}
            </table></div>`;
        }

        // Body
        if (r.body) {
          let bodyStr = r.body;
          try { bodyStr = JSON.stringify(JSON.parse(r.body), null, 2); } catch {}
          body += `<div style="margin-top:12px;"><strong>Request Body</strong>
            <pre style="background:#272822;color:#f8f8f2;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;margin-top:4px;">${_esc(bodyStr)}</pre></div>`;
        }

        body += `</div>`;
      });

      toc += `</ul>`;
      idx++;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${_esc(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; color: #333; }
  h1 { border-bottom: 3px solid #4a9eff; padding-bottom: 12px; }
  a { color: #4a9eff; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
</style>
</head>
<body>
<h1>${_esc(title)}</h1>
${baseUrl ? `<p><strong>Base URL:</strong> <code>${_esc(baseUrl)}</code></p>` : ""}
<p>Generated from collection <strong>${_esc(col.name)}</strong> on ${new Date().toLocaleDateString()}</p>
<h2>Table of Contents</h2>
<ul style="line-height:1.8;">${toc}</ul>
${body}
<hr style="margin-top:40px;">
<p style="color:#999;font-size:12px;">Generated by TestSys</p>
</body></html>`;
  }

  function _generateMd(col, title, baseUrl) {
    const items = _getAllRequests(col);
    const groups = {};
    items.forEach(it => {
      const g = it.folder || "Root";
      if (!groups[g]) groups[g] = [];
      groups[g].push(it.req);
    });

    let md = `# ${title}\n\n`;
    if (baseUrl) md += `**Base URL:** \`${baseUrl}\`\n\n`;
    md += `Generated from collection **${col.name}** on ${new Date().toLocaleDateString()}\n\n---\n\n`;

    for (const [group, reqs] of Object.entries(groups)) {
      md += `## ${group}\n\n`;
      reqs.forEach(r => {
        const method = (r.method || "GET").toUpperCase();
        md += `### \`${method}\` ${r.url || ""}\n\n`;
        if (r.name) md += `**${r.name}**\n\n`;

        const headers = (r.headers || []).filter(h => h.key && h.enabled !== false);
        if (headers.length) {
          md += `**Headers**\n\n| Key | Value |\n|-----|-------|\n`;
          headers.forEach(h => { md += `| \`${h.key}\` | ${h.value} |\n`; });
          md += "\n";
        }

        const params = (r.params || []).filter(p => p.key && p.enabled !== false);
        if (params.length) {
          md += `**Query Parameters**\n\n| Key | Value |\n|-----|-------|\n`;
          params.forEach(p => { md += `| \`${p.key}\` | ${p.value} |\n`; });
          md += "\n";
        }

        if (r.body) {
          let bodyStr = r.body;
          try { bodyStr = JSON.stringify(JSON.parse(r.body), null, 2); } catch {}
          md += "**Request Body**\n\n```json\n" + bodyStr + "\n```\n\n";
        }

        md += "---\n\n";
      });
    }

    md += `\n*Generated by TestSys*\n`;
    return md;
  }

  function _showOutput(content, format) {
    _close();

    let old = document.getElementById("apidocs-output-modal");
    if (old) old.remove();

    const div = document.createElement("div");
    div.id = "apidocs-output-modal";
    div.className = "modal fade show";
    div.style.cssText = "display:block;background:rgba(0,0,0,.55);z-index:10001;";

    const ext = format === "md" ? "md" : "html";
    const mime = format === "md" ? "text/markdown" : "text/html";

    div.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Generated Documentation</h5>
            <button type="button" class="btn-close btn-close-white" id="apidocs-out-close"></button>
          </div>
          <div class="modal-body" style="padding:0;">
            ${format === "html"
              ? `<iframe id="apidocs-preview" style="width:100%;height:500px;border:none;background:#fff;"></iframe>`
              : `<pre style="padding:16px;font-size:12px;max-height:500px;overflow:auto;margin:0;">${_esc(content)}</pre>`}
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline-secondary" id="apidocs-copy"><i class="bi bi-clipboard me-1"></i>Copy</button>
            <button class="btn send-btn" id="apidocs-download"><i class="bi bi-download me-1"></i>Download .${ext}</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(div);

    if (format === "html") {
      const iframe = document.getElementById("apidocs-preview");
      iframe.srcdoc = content;
    }

    div.querySelector("#apidocs-out-close").addEventListener("click", () => div.remove());
    div.addEventListener("click", (e) => { if (e.target === div) div.remove(); });

    div.querySelector("#apidocs-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      const btn = div.querySelector("#apidocs-copy");
      btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
      setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy'; }, 1200);
    });

    div.querySelector("#apidocs-download").addEventListener("click", () => {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `api-docs.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function _esc(s) { return App.escapeHtml ? App.escapeHtml(s || "") : (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function _close() {
    const m = document.getElementById("apidocs-modal");
    if (m) m.remove();
  }

})();
