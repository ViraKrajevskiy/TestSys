/**
 * swaggerUI.js — Импорт OpenAPI / Swagger
 *
 * Два шага: сначала загрузка спецификации (URL или файл),
 * потом выбор эндпоинтов и создание коллекции.
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _parsed = null;      // результат App.parseSwagger
  let _selected = new Set();
  let _search = "";

  App.initSwaggerUI = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("swagger-modal"));

    // Открытие — делегированием, кнопка живёт в сайдбаре и пересоздаётся
    document.addEventListener("click", (e) => {
      if (e.target.closest("#import-swagger-btn")) {
        e.preventDefault();
        App.showSwaggerImport();
      }
    });

    document.getElementById("sw-load-url").addEventListener("click", _loadFromUrl);
    document.getElementById("sw-url").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); _loadFromUrl(); }
    });
    document.getElementById("sw-load-file").addEventListener("click", _loadFromFile);

    document.getElementById("sw-search").addEventListener("input", (e) => {
      _search = e.target.value.toLowerCase();
      _renderEndpoints();
    });
    document.getElementById("sw-all").addEventListener("click", () => _toggleAll(true));
    document.getElementById("sw-none").addEventListener("click", () => _toggleAll(false));
    document.getElementById("sw-import").addEventListener("click", _doImport);
    document.getElementById("sw-back").addEventListener("click", () => _step(1));
  };

  App.showSwaggerImport = function () {
    _parsed = null;
    _selected.clear();
    _search = "";
    document.getElementById("sw-error").style.display = "none";
    document.getElementById("sw-search").value = "";
    _step(1);
    _modal.show();
  };

  // ============================================================
  // ШАГИ
  // ============================================================
  function _step(n) {
    document.getElementById("sw-step-1").style.display = n === 1 ? "" : "none";
    document.getElementById("sw-step-2").style.display = n === 2 ? "" : "none";
    document.getElementById("sw-import").style.display = n === 2 ? "" : "none";
    document.getElementById("sw-back").style.display = n === 2 ? "" : "none";
  }

  function _busy(on, text) {
    const b = document.getElementById("sw-busy");
    b.style.display = on ? "" : "none";
    if (text) b.querySelector("span").textContent = text;
    ["sw-load-url", "sw-load-file"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = on;
    });
  }

  function _error(msg, details) {
    const el = document.getElementById("sw-error");
    el.style.display = "";
    el.innerHTML = `<strong>${App.escapeHtml(msg)}</strong>` +
      (details && details.length
        ? `<div style="font-size:10.5px;margin-top:5px;opacity:.85;">${
            details.map(d => App.escapeHtml(d)).join("<br>")}</div>`
        : "");
  }

  // ============================================================
  // ЗАГРУЗКА
  // ============================================================
  async function _loadFromUrl() {
    const url = document.getElementById("sw-url").value.trim();
    if (!url) { _error(App.t("errUrlRequired")); return; }

    document.getElementById("sw-error").style.display = "none";
    _busy(true, App.t("loading"));
    try {
      if (!window.pywebview?.api?.fetch_swagger) {
        _error(App.t("apiUnavailable"));
        return;
      }
      const res = await window.pywebview.api.fetch_swagger(url);
      if (!res.ok) { _error(res.error, res.tried); return; }
      _handleSpec(res.content, res.url);
    } finally {
      _busy(false);
    }
  }

  async function _loadFromFile() {
    document.getElementById("sw-error").style.display = "none";
    if (!window.pywebview?.api?.open_swagger_file) { _error(App.t("apiUnavailable")); return; }
    _busy(true, App.t("loading"));
    try {
      const res = await window.pywebview.api.open_swagger_file();
      if (res.cancelled) return;
      if (!res.ok) { _error(res.error); return; }
      _handleSpec(res.content, res.path);
    } finally {
      _busy(false);
    }
  }

  function _handleSpec(content, source) {
    const parsed = App.parseSwagger(content);
    if (!parsed.ok) { _error(parsed.error); return; }
    if (!parsed.endpoints.length) { _error(App.t("noEndpoints")); return; }

    _parsed = parsed;
    _selected = new Set(parsed.endpoints.map(e => e.method + " " + e.path));

    // Заголовок и выбор сервера
    document.getElementById("sw-title").textContent =
      parsed.title + (parsed.apiVersion ? " " + parsed.apiVersion : "");
    document.getElementById("sw-meta").textContent =
      `${parsed.version} · ${parsed.endpoints.length} ${App.t("endpoints")} · ${App.escapeHtml(source || "")}`;

    // Если спека не указала servers (частый случай для drf-spectacular),
    // подставляем origin адреса, откуда её скачали — иначе запросы
    // пойдут на дефолтный {{baseUrl}} = адрес нашего же бэкенда.
    const servers = [...parsed.servers];
    const inferred = _originFromSource(source);
    if (!servers.length && inferred) servers.push(inferred);
    if (!servers.length) servers.push("");

    const sel = document.getElementById("sw-server");
    sel.innerHTML = "";
    servers.forEach(s => {
      const o = document.createElement("option");
      o.value = s; o.textContent = s || App.t("notSpecified");
      sel.appendChild(o);
    });
    // Если добавили угаданный сервер — сразу его и выбираем
    if (inferred && !parsed.servers.length) sel.value = inferred;

    _renderEndpoints();
    _step(2);
  }

  /** Из URL, откуда скачали спеку, получить origin: http://host:port */
  function _originFromSource(source) {
    if (!source) return "";
    try {
      const u = new URL(source);
      return u.origin;   // http://127.0.0.1:8001
    } catch { return ""; }
  }

  // ============================================================
  // СПИСОК ЭНДПОИНТОВ
  // ============================================================
  function _renderEndpoints() {
    const box = document.getElementById("sw-endpoints");
    if (!_parsed) return;

    const list = _search
      ? _parsed.endpoints.filter(e =>
          e.path.toLowerCase().includes(_search) ||
          (e.summary || "").toLowerCase().includes(_search) ||
          e.tags.join(" ").toLowerCase().includes(_search))
      : _parsed.endpoints;

    if (!list.length) {
      box.innerHTML = `<div class="sw-empty">${App.t("logEmpty")}</div>`;
      _updateCount();
      return;
    }

    // Группировка по тегам
    const groups = {};
    list.forEach(e => { (groups[e.tags[0] || "default"] = groups[e.tags[0] || "default"] || []).push(e); });

    box.innerHTML = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([tag, items]) => `
      <div class="sw-group">
        <div class="sw-group-title">
          <input type="checkbox" class="sw-group-check" data-tag="${App.escapeAttr(tag)}">
          <i class="bi bi-folder2"></i> ${App.escapeHtml(tag)}
          <span class="sw-group-count">${items.length}</span>
        </div>
        ${items.map(e => {
          const id = e.method + " " + e.path;
          const colorVar = App.METHOD_COLOR_VAR[e.method] || "--text-dim";
          return `
          <label class="sw-ep${e.deprecated ? " sw-deprecated" : ""}" data-id="${App.escapeAttr(id)}">
            <input type="checkbox" class="sw-ep-check" data-id="${App.escapeAttr(id)}" ${_selected.has(id) ? "checked" : ""}>
            <span class="sw-method" style="color:var(${colorVar});border-color:var(${colorVar});">${e.method}</span>
            <span class="sw-path">${App.escapeHtml(e.path)}</span>
            <span class="sw-summary">${App.escapeHtml(e.summary || "")}</span>
            ${e.body ? '<i class="bi bi-braces sw-badge" title="есть тело"></i>' : ""}
          </label>`;
        }).join("")}
      </div>`).join("");

    box.querySelectorAll(".sw-ep-check").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) _selected.add(id); else _selected.delete(id);
        _updateCount();
      });
    });

    box.querySelectorAll(".sw-group-check").forEach(cb => {
      const tag = cb.dataset.tag;
      const ids = (groups[tag] || []).map(e => e.method + " " + e.path);
      cb.checked = ids.every(id => _selected.has(id));
      cb.addEventListener("change", (e) => {
        ids.forEach(id => e.target.checked ? _selected.add(id) : _selected.delete(id));
        _renderEndpoints();
      });
    });

    _updateCount();
  }

  function _toggleAll(state) {
    if (!_parsed) return;
    if (state) _parsed.endpoints.forEach(e => _selected.add(e.method + " " + e.path));
    else _selected.clear();
    _renderEndpoints();
  }

  function _updateCount() {
    const el = document.getElementById("sw-count");
    if (el) el.textContent = `${_selected.size} / ${_parsed ? _parsed.endpoints.length : 0}`;
    const btn = document.getElementById("sw-import");
    if (btn) btn.disabled = _selected.size === 0;
  }

  // ============================================================
  // ИМПОРТ
  // ============================================================
  async function _doImport() {
    if (!_parsed || !_selected.size) return;

    const serverUrl = document.getElementById("sw-server").value;
    const useVar = document.getElementById("sw-use-var").checked;

    const res = App.swaggerToCollection(_parsed, {
      serverUrl, useBaseUrlVar: useVar, selected: _selected,
    });

    // Спрашиваем название коллекции — предлагаем имя из спеки как дефолт
    const suggestedName = res.collection.name || "API Collection";
    const inputName = await App.showPrompt({
      title: App.t("importSwagger") || "Импорт Swagger",
      label: App.t("collectionName") || "Название коллекции",
      value: suggestedName,
      placeholder: suggestedName,
    });
    if (!inputName) return; // отмена

    // Уникальное имя, чтобы не конфликтовать с существующими
    const taken = App.COLLECTIONS.map(c => c.name);
    let name = inputName.trim() || suggestedName, i = 2;
    while (taken.includes(name)) name = `${inputName.trim()} (${i++})`;
    res.collection.name = name;

    App.USER_COLLECTIONS.push(res.collection);

    // baseUrl под этот API + переменные для путей вида /users/{id}
    if (useVar && serverUrl) App.VARIABLES.baseUrl = serverUrl;
    res.pathVars.forEach(v => { if (!(v in App.VARIABLES)) App.VARIABLES[v] = "1"; });

    await App.saveCollections();
    App.renderCollections();
    _modal.hide();

    const folders = res.collection.folders.length;
    const items = res.collection.folders.reduce((a, f) => a + f.items.length, 0);
    App.showAlert(
      `${App.t("imported")}: ${name}\n` +
      `${App.t("folders")}: ${folders} · ${App.t("requests")}: ${items}` +
      (res.pathVars.length ? `\n${App.t("varsCreated")}: ${res.pathVars.map(v => "{{" + v + "}}").join(", ")}` : "")
    );
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div class="modal fade" id="swagger-modal" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-file-earmark-code me-2"></i><span data-i18n="importSwagger">Импорт Swagger / OpenAPI</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <div class="modal-body">
            <!-- ШАГ 1: источник -->
            <div id="sw-step-1">
              <div style="font-size:11.5px;color:var(--text-dim);margin-bottom:10px;" data-i18n="swaggerIntro">
                Укажите адрес спецификации или адрес API — типичные пути вроде /openapi.json
                и /swagger.json будут проверены автоматически.
              </div>

              <label class="form-label" style="font-size:12px;" data-i18n="specUrl">Адрес спецификации или API</label>
              <div class="d-flex gap-2 mb-2">
                <input type="text" class="form-control form-control-sm" id="sw-url"
                       placeholder="https://api.example.com/openapi.json">
                <button class="btn send-btn btn-sm" id="sw-load-url" style="white-space:nowrap;" data-i18n="load">Загрузить</button>
              </div>

              <div class="d-flex align-items-center gap-2 my-3">
                <hr style="flex:1;border-color:var(--border-color);">
                <span style="font-size:11px;color:var(--text-dim);" data-i18n="or">или</span>
                <hr style="flex:1;border-color:var(--border-color);">
              </div>

              <button class="btn btn-outline-secondary btn-sm w-100" id="sw-load-file">
                <i class="bi bi-folder2-open me-1"></i><span data-i18n="chooseFile">Выбрать файл спецификации</span>
              </button>

              <div id="sw-busy" style="display:none;margin-top:12px;font-size:12px;color:var(--accent);">
                <span class="spinner-border spinner-border-sm me-2"></span><span>Загрузка...</span>
              </div>

              <div id="sw-error" class="sw-error" style="display:none;"></div>
            </div>

            <!-- ШАГ 2: выбор эндпоинтов -->
            <div id="sw-step-2" style="display:none;">
              <div class="sw-head">
                <div>
                  <div id="sw-title" class="sw-api-title"></div>
                  <div id="sw-meta" class="sw-api-meta"></div>
                </div>
              </div>

              <div class="row g-2 mb-2">
                <div class="col-md-8">
                  <label class="form-label" style="font-size:11px;" data-i18n="baseAddress">Базовый адрес</label>
                  <select class="form-select form-select-sm" id="sw-server"></select>
                </div>
                <div class="col-md-4 d-flex align-items-end">
                  <div class="form-check form-switch mb-1">
                    <input class="form-check-input" type="checkbox" id="sw-use-var" checked>
                    <label class="form-check-label" for="sw-use-var" style="font-size:11px;" data-i18n="useBaseUrlVar">
                      Через {{baseUrl}}
                    </label>
                  </div>
                </div>
              </div>

              <div class="d-flex gap-2 align-items-center mb-2">
                <input type="text" class="form-control form-control-sm" id="sw-search"
                       data-i18n-ph="search" placeholder="Поиск..." style="max-width:240px;">
                <button class="btn btn-outline-secondary btn-sm" id="sw-all" style="font-size:11px;" data-i18n="all">Все</button>
                <button class="btn btn-outline-secondary btn-sm" id="sw-none" style="font-size:11px;" data-i18n="none">Снять</button>
                <span id="sw-count" class="ms-auto" style="font-size:12px;color:var(--accent);font-weight:600;"></span>
              </div>

              <div id="sw-endpoints" class="sw-endpoints"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="sw-back" style="display:none;">
              <i class="bi bi-arrow-left me-1"></i><span data-i18n="back">Назад</span>
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="sw-import" style="display:none;">
              <i class="bi bi-download me-1"></i><span data-i18n="importBtn">Импортировать</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
