/**
 * codeGen.js — Генерация кода из запроса
 * Форматы: curl, fetch (JS), axios (JS), Python requests
 */
window.App = window.App || {};

(function () {

  // ── helpers ──────────────────────────────────────────────────────────────

  function _resolveTab(tab) {
    // подставляем переменные
    const url = App.resolveDynamic ? App.resolveDynamic(tab.url) : tab.url;
    const headers = (tab.headers || []).filter(h => h.key && h.enabled !== false);
    const body = (tab.bodyType === "raw" || !tab.bodyType) ? (tab.body || "") : "";
    return { url, headers, body, method: tab.method || "GET" };
  }

  function _headersObj(headers) {
    const obj = {};
    headers.forEach(h => { obj[h.key] = h.value; });
    return obj;
  }

  // ── generators ───────────────────────────────────────────────────────────

  function _toCurl(tab) {
    const { url, headers, body, method } = _resolveTab(tab);
    let s = `curl -X ${method} '${url}'`;
    headers.forEach(h => {
      s += ` \\\n  -H '${h.key}: ${h.value}'`;
    });
    if (body) {
      const escaped = body.replace(/'/g, "'\\''");
      s += ` \\\n  -d '${escaped}'`;
    }
    return s;
  }

  function _toFetch(tab) {
    const { url, headers, body, method } = _resolveTab(tab);
    const ho = _headersObj(headers);
    let opts = `  method: '${method}'`;
    if (Object.keys(ho).length) {
      opts += `,\n  headers: ${JSON.stringify(ho, null, 4).replace(/\n/g, "\n  ")}`;
    }
    if (body) {
      opts += `,\n  body: \`${body.replace(/`/g, "\\`")}\``;
    }
    return `const response = await fetch('${url}', {\n${opts}\n});\nconst data = await response.json();\nconsole.log(data);`;
  }

  function _toAxios(tab) {
    const { url, headers, body, method } = _resolveTab(tab);
    const ho = _headersObj(headers);
    let cfg = `  method: '${method.toLowerCase()}',\n  url: '${url}'`;
    if (Object.keys(ho).length) {
      cfg += `,\n  headers: ${JSON.stringify(ho, null, 4).replace(/\n/g, "\n  ")}`;
    }
    if (body) {
      try {
        cfg += `,\n  data: ${JSON.stringify(JSON.parse(body), null, 4).replace(/\n/g, "\n  ")}`;
      } catch {
        cfg += `,\n  data: \`${body.replace(/`/g, "\\`")}\``;
      }
    }
    return `import axios from 'axios';\n\nconst { data } = await axios({\n${cfg}\n});\nconsole.log(data);`;
  }

  function _toPython(tab) {
    const { url, headers, body, method } = _resolveTab(tab);
    const ho = _headersObj(headers);
    let s = `import requests\n\n`;
    if (Object.keys(ho).length) {
      s += `headers = ${_pyDict(ho)}\n\n`;
    }
    const hArg = Object.keys(ho).length ? ", headers=headers" : "";
    if (body) {
      try {
        const parsed = JSON.parse(body);
        s += `payload = ${_pyDict(parsed)}\n\n`;
        s += `response = requests.${method.toLowerCase()}('${url}'${hArg}, json=payload)`;
      } catch {
        s += `payload = """${body}"""\n\n`;
        s += `response = requests.${method.toLowerCase()}('${url}'${hArg}, data=payload)`;
      }
    } else {
      s += `response = requests.${method.toLowerCase()}('${url}'${hArg})`;
    }
    s += `\nprint(response.status_code)\nprint(response.json())`;
    return s;
  }

  function _pyDict(obj, indent) {
    indent = indent || 0;
    const pad = "    ".repeat(indent);
    const inner = "    ".repeat(indent + 1);
    if (typeof obj !== "object" || obj === null) return _pyVal(obj);
    if (Array.isArray(obj)) {
      const items = obj.map(v => inner + _pyVal(v)).join(",\n");
      return `[\n${items}\n${pad}]`;
    }
    const items = Object.entries(obj).map(([k, v]) => `${inner}"${k}": ${_pyVal(v)}`).join(",\n");
    return `{\n${items}\n${pad}}`;
  }

  function _pyVal(v) {
    if (v === null) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "number") return String(v);
    if (typeof v === "object") return _pyDict(v, 1);
    return `"${String(v).replace(/"/g, '\\"')}"`;
  }

  // ── modal ─────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "curl",   label: "cURL",           gen: _toCurl,   lang: "bash"       },
    { id: "fetch",  label: "JS fetch",        gen: _toFetch,  lang: "javascript" },
    { id: "axios",  label: "JS axios",        gen: _toAxios,  lang: "javascript" },
    { id: "python", label: "Python requests", gen: _toPython, lang: "python"     },
  ];

  let _activeFormat = "curl";

  App.showCodeGen = function () {
    const tab = App.getActiveTab();
    if (!tab || tab.method === "RANDOMIZER" || tab.method === "USERS") return;

    // Remove existing
    document.getElementById("codegen-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "codegen-modal";
    modal.className = "app-modal-backdrop";
    modal.innerHTML = `
      <div class="app-modal" style="max-width:680px;width:95%;">
        <div class="app-modal-header">
          <span data-i18n="codeGenTitle">Генерация кода</span>
          <button class="app-modal-close" id="cg-close">&times;</button>
        </div>
        <div class="app-modal-body" style="padding:0;">
          <div style="display:flex;border-bottom:1px solid var(--border);">
            ${TABS.map(t => `<button class="cg-tab-btn${t.id === _activeFormat ? " active" : ""}" data-fmt="${t.id}">${t.label}</button>`).join("")}
          </div>
          <div style="position:relative;">
            <pre id="cg-code" style="margin:0;padding:16px 16px 12px;font-size:12px;overflow:auto;max-height:380px;background:var(--bg-input);color:var(--text);white-space:pre-wrap;word-break:break-all;"></pre>
            <button id="cg-copy" title="Копировать" style="position:absolute;top:8px;right:8px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);padding:3px 10px;font-size:11px;cursor:pointer;">
              <i class="bi bi-clipboard"></i>
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    _renderCode();

    modal.querySelector("#cg-close").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll(".cg-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        _activeFormat = btn.dataset.fmt;
        modal.querySelectorAll(".cg-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.fmt === _activeFormat));
        _renderCode();
      });
    });

    modal.querySelector("#cg-copy").addEventListener("click", () => {
      const code = modal.querySelector("#cg-code").textContent;
      navigator.clipboard.writeText(code).catch(() => {});
      const btn = modal.querySelector("#cg-copy");
      btn.innerHTML = '<i class="bi bi-check"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard"></i>'; }, 1500);
    });

    function _renderCode() {
      const fmt = TABS.find(t => t.id === _activeFormat);
      modal.querySelector("#cg-code").textContent = fmt ? fmt.gen(tab) : "";
    }
  };

})();
