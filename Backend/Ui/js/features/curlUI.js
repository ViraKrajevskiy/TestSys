/**
 * curlUI.js — модалка импорта cURL и хелпер копирования as cURL.
 * Использует App.parseCurl / App.toCurl из core/curl.js.
 */
window.App = window.App || {};

(function () {
  App.showCurlImport = function () {
    if (!document.getElementById("curl-import-modal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="curl-import-modal" tabindex="-1">
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content theme-modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-terminal me-2"></i>${App.t("importCurl") || "Импорт cURL"}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">
                  ${App.t("curlHint") || "Вставьте команду curl из документации, DevTools (Copy → Copy as cURL) или своего скрипта. Мы разберём метод, URL, заголовки и тело."}
                </div>
                <textarea id="curl-input" class="form-control" rows="10" spellcheck="false"
                          placeholder="curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -d '{&quot;name&quot;:&quot;Vira&quot;}'"
                          style="font-family:'Consolas',monospace;font-size:12px;"></textarea>
                <div id="curl-preview" style="font-size:11px;margin-top:8px;padding:8px;background:var(--bg-input);border-radius:var(--radius);display:none;"></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary btn-sm" id="curl-preview-btn"><i class="bi bi-eye me-1"></i>${App.t("preview") || "Разобрать"}</button>
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${App.t("cancel") || "Отмена"}</button>
                <button class="btn send-btn btn-sm" id="curl-open-tab"><i class="bi bi-plus-lg me-1"></i>${App.t("openAsTab") || "Открыть как вкладку"}</button>
              </div>
            </div>
          </div>
        </div>`);

      document.getElementById("curl-preview-btn").addEventListener("click", _preview);
      document.getElementById("curl-open-tab").addEventListener("click", _openAsTab);
    }
    const el = document.getElementById("curl-import-modal");
    bootstrap.Modal.getOrCreateInstance(el).show();
    setTimeout(() => document.getElementById("curl-input")?.focus(), 200);
  };

  function _preview() {
    const text = document.getElementById("curl-input").value;
    const res = App.parseCurl(text);
    const box = document.getElementById("curl-preview");
    if (!res.ok) {
      box.style.display = "";
      box.innerHTML = `<span style="color:var(--danger);">${res.error}</span>`;
      return;
    }
    const r = res.request;
    box.style.display = "";
    box.innerHTML = `
      <div><b>Method:</b> ${r.method}</div>
      <div><b>URL:</b> ${_esc(r.url)}</div>
      ${r.headers.length ? `<div><b>Headers:</b> ${r.headers.length}</div>` : ""}
      ${r.params.length  ? `<div><b>Params:</b> ${r.params.length}</div>`   : ""}
      ${r.body ? `<div><b>Body:</b> ${_esc(r.body.slice(0, 200))}${r.body.length > 200 ? "…" : ""}</div>` : ""}`;
  }

  function _openAsTab() {
    const text = document.getElementById("curl-input").value;
    const res = App.parseCurl(text);
    if (!res.ok) { App.showAlert(res.error); return; }
    const r = res.request;
    App.addTab({
      method: r.method, url: r.url,
      headers: r.headers.length ? r.headers : [{ key: "", value: "", enabled: true }],
      params:  r.params.length  ? r.params  : [{ key: "", value: "", enabled: true }],
      body: r.body || "",
      userAgent: r.userAgent || "",
      activeSubTab: r.body ? "body" : "params",
    });
    bootstrap.Modal.getOrCreateInstance(document.getElementById("curl-import-modal")).hide();
    document.getElementById("curl-input").value = "";
    document.getElementById("curl-preview").style.display = "none";
  }

  /** Быстрая кнопка «Скопировать как cURL» для активной вкладки. */
  App.copyActiveTabAsCurl = async function () {
    const tab = App.getActiveTab && App.getActiveTab();
    if (!tab || !tab.url) { App.showAlert(App.t("noActiveRequest") || "Нет активного запроса"); return; }
    const curl = App.toCurl(tab, { platform: "bash" });
    try {
      await navigator.clipboard.writeText(curl);
      App.syncToast && App.syncToast(App.t("copiedAsCurl") || "Скопировано как cURL");
    } catch (_) {
      App.showAlert(curl);   // fallback: покажем текст
    }
  };

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
