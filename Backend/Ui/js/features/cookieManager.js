/**
 * cookieManager.js — Просмотр и редактирование куки по домену
 */
window.App = window.App || {};

(function () {

  App.showCookieManager = async function () {
    document.getElementById("cookie-modal")?.remove();

    if (!window.pywebview) {
      App.showMessage?.("Cookie Manager доступен только в приложении", "info");
      return;
    }

    const modal = document.createElement("div");
    modal.id = "cookie-modal";
    modal.className = "app-modal-backdrop";
    modal.innerHTML = `
      <div class="app-modal" style="max-width:700px;width:96%;max-height:88vh;display:flex;flex-direction:column;">
        <div class="app-modal-header">
          <span><i class="bi bi-cookie me-2"></i>Cookie Manager</span>
          <button class="app-modal-close" id="ck-close">&times;</button>
        </div>
        <div class="app-modal-body" style="flex:1;overflow:auto;padding:0;">
          <div style="display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center;">
            <button id="ck-reload" class="btn btn-sm" style="background:var(--bg-input);color:var(--text);border:1px solid var(--border);">
              <i class="bi bi-arrow-clockwise"></i> Обновить
            </button>
            <button id="ck-add" class="btn send-btn btn-sm">
              <i class="bi bi-plus-lg"></i> Добавить
            </button>
            <button id="ck-clear-all" class="btn btn-sm btn-danger" style="margin-left:auto;">
              <i class="bi bi-trash"></i> Очистить все
            </button>
          </div>
          <div id="ck-body" style="padding:12px 16px;"></div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector("#ck-close").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

    async function _load() {
      const res = await window.pywebview.api.get_cookies();
      _render(res?.cookies || {});
    }

    function _render(cookiesByDomain) {
      const body = modal.querySelector("#ck-body");
      const domains = Object.keys(cookiesByDomain);
      if (!domains.length) {
        body.innerHTML = `<div style="color:var(--text-dim);font-size:13px;padding:24px;text-align:center;">
          Нет куки. Они появятся после первого запроса к серверу, который вернёт Set-Cookie.
        </div>`;
        return;
      }
      body.innerHTML = domains.map(domain => {
        const cookies = cookiesByDomain[domain];
        return `
          <div class="ck-domain-block" style="margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
              <i class="bi bi-globe2"></i> ${App.escapeHtml(domain)}
              <button class="ck-del-domain btn btn-sm" data-domain="${App.escapeAttr(domain)}"
                style="margin-left:auto;font-size:10px;padding:1px 7px;background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:var(--radius);cursor:pointer;">
                удалить домен
              </button>
            </div>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead>
                <tr style="color:var(--text-dim);">
                  <th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);width:35%;">Имя</th>
                  <th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);">Значение</th>
                  <th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border);width:50px;">Path</th>
                  <th style="width:28px;border-bottom:1px solid var(--border);"></th>
                </tr>
              </thead>
              <tbody>
                ${cookies.map(c => `
                  <tr class="ck-row" data-domain="${App.escapeAttr(domain)}" data-name="${App.escapeAttr(c.name)}">
                    <td style="padding:4px 6px;font-weight:500;">${App.escapeHtml(c.name)}</td>
                    <td style="padding:4px 6px;word-break:break-all;max-width:200px;">
                      <span class="ck-val-display">${App.escapeHtml(c.value)}</span>
                      <input class="ck-val-edit form-control form-control-sm" style="display:none;font-size:11px;" value="${App.escapeAttr(c.value)}">
                    </td>
                    <td style="padding:4px 6px;color:var(--text-dim);">${App.escapeHtml(c.path || "/")}</td>
                    <td style="padding:4px 6px;text-align:center;">
                      <button class="ck-del btn btn-sm" title="Удалить"
                        data-domain="${App.escapeAttr(domain)}" data-name="${App.escapeAttr(c.name)}"
                        style="padding:0 5px;background:transparent;border:none;color:#f44336;font-size:14px;cursor:pointer;">
                        &times;
                      </button>
                    </td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`;
      }).join("");

      // Edit value on double-click
      body.querySelectorAll(".ck-val-display").forEach(el => {
        el.addEventListener("dblclick", () => {
          const row = el.closest(".ck-row");
          el.style.display = "none";
          const inp = row.querySelector(".ck-val-edit");
          inp.style.display = "";
          inp.focus();
          inp.addEventListener("blur", async () => {
            const domain = row.dataset.domain, name = row.dataset.name;
            await window.pywebview.api.set_cookie(domain, name, inp.value, "/");
            _load();
          }, { once: true });
          inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
        });
      });

      // Delete single cookie
      body.querySelectorAll(".ck-del").forEach(btn => {
        btn.addEventListener("click", async () => {
          await window.pywebview.api.delete_cookie(btn.dataset.domain, btn.dataset.name);
          _load();
        });
      });

      // Delete whole domain
      body.querySelectorAll(".ck-del-domain").forEach(btn => {
        btn.addEventListener("click", async () => {
          const domain = btn.dataset.domain;
          const cookies = cookiesByDomain[domain] || [];
          for (const c of cookies) {
            await window.pywebview.api.delete_cookie(domain, c.name);
          }
          _load();
        });
      });
    }

    modal.querySelector("#ck-reload").addEventListener("click", _load);

    modal.querySelector("#ck-clear-all").addEventListener("click", async () => {
      if (!confirm("Очистить все куки?")) return;
      await window.pywebview.api.clear_cookies();
      _load();
    });

    // Add cookie form
    modal.querySelector("#ck-add").addEventListener("click", () => {
      const body = modal.querySelector("#ck-body");
      // Insert inline form at top
      if (body.querySelector("#ck-add-form")) return;
      const form = document.createElement("div");
      form.id = "ck-add-form";
      form.style.cssText = "display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);";
      form.innerHTML = `
        <input id="ck-f-domain" class="form-control form-control-sm" placeholder="domain (example.com)" style="flex:1;min-width:130px;">
        <input id="ck-f-name"   class="form-control form-control-sm" placeholder="name" style="flex:1;min-width:100px;">
        <input id="ck-f-value"  class="form-control form-control-sm" placeholder="value" style="flex:2;min-width:120px;">
        <input id="ck-f-path"   class="form-control form-control-sm" placeholder="/" style="width:60px;">
        <button id="ck-f-save" class="btn send-btn btn-sm">Сохранить</button>
        <button id="ck-f-cancel" class="btn btn-sm" style="background:var(--bg-input);color:var(--text);border:1px solid var(--border);">Отмена</button>`;
      body.prepend(form);
      form.querySelector("#ck-f-domain").focus();
      form.querySelector("#ck-f-cancel").onclick = () => form.remove();
      form.querySelector("#ck-f-save").onclick = async () => {
        const d = form.querySelector("#ck-f-domain").value.trim();
        const n = form.querySelector("#ck-f-name").value.trim();
        const v = form.querySelector("#ck-f-value").value;
        const p = form.querySelector("#ck-f-path").value.trim() || "/";
        if (!d || !n) { form.querySelector("#ck-f-domain").focus(); return; }
        await window.pywebview.api.set_cookie(d, n, v, p);
        form.remove();
        _load();
      };
    });

    await _load();
  };

})();
