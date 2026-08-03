/**
 * dynamicVarsUI.js — Справочник динамических переменных
 *
 * Кнопка {$} рядом с полями. Клик по переменной вставляет её
 * в поле, из которого справочник открыли.
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _target = null;       // поле, куда вставлять
  let _targetSel = null;    // позиция курсора, снятая В МОМЕНТ ОТКРЫТИЯ
  let _search = "";
  let _copyOnly = false;    // режим: только копировать, не вставлять в поле

  // Режим "fields" — в теле готовый JSON, заполняем его поля.
  // Режим "list"   — обычный справочник переменных.
  let _mode = "list";
  let _jsonObj = null;
  let _fields = [];
  let _fieldSel = {};

  /** Понятное имя поля — чтобы было видно, куда именно вставится */
  function _targetLabel(el) {
    if (!el) return "";
    if (el.id === "url-input") return "URL";
    if (el.id === "body-textarea") return App.t("body");
    if (el.classList && el.classList.contains("kv-key")) return App.t("key");
    if (el.classList && el.classList.contains("kv-value")) return App.t("value");
    return el.placeholder || el.id || "";
  }

  App.initDynamicVarsUI = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    const el = document.getElementById("dynvars-modal");
    _modal = bootstrap.Modal.getOrCreateInstance(el);

    document.getElementById("dynvars-search").addEventListener("input", (e) => {
      _search = e.target.value.toLowerCase();
      _renderList();
    });

    document.getElementById("dynvars-apply").addEventListener("click", _applyFields);
    document.getElementById("dynvars-show-list").addEventListener("click", () => {
      _jsonObj = null;          // переключаемся в справочник вручную
      _setupListMode();
    });

    // Живой предпросмотр
    document.getElementById("dynvars-preview-input").addEventListener("input", _renderPreview);
    document.getElementById("dynvars-preview-again").addEventListener("click", _renderPreview);

    el.addEventListener("shown.bs.modal", () => {
      document.getElementById("dynvars-search").focus();
    });
  };

  /**
   * Открыть справочник.
   * target — input/textarea, куда вставится выбранная переменная.
   */
  App.showDynamicVars = function (target) {
    _target = target || null;

    // Позицию курсора снимаем ЗДЕСЬ, пока фокус ещё в поле. После открытия
    // модалки фокус уходит в поиск, и selectionStart уже не отражает
    // намерение пользователя.
    _targetSel = null;
    if (_target) {
      const focused = document.activeElement === _target;
      const s = _target.selectionStart, e = _target.selectionEnd;
      // Курсор считается заданным, только если пользователь реально
      // ставил его в поле. Иначе (0,0 без фокуса) — это «не трогали»,
      // и вставлять в самое начало нельзя: так переменная влезала
      // перед '{' в JSON и перед 'http' в адресе.
      const explicit = focused || s > 0 || e > 0;
      _targetSel = explicit ? { start: s, end: e } : null;
    }

    _search = "";
    document.getElementById("dynvars-search").value = "";

    // Если в теле уже лежит JSON — предлагаем заполнить его поля,
    // а не заставляем искать место для курсора. Это и есть намерение:
    // «хочу сюда случайные данные».
    _jsonObj = null;
    if (_target && _target.id === "body-textarea") {
      const txt = (_target.value || "").trim();
      if (txt) {
        const parsed = App.tryParseJson(txt);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          _jsonObj = parsed;
        }
      }
    }

    if (_jsonObj) _setupFieldsMode();
    else _setupListMode();

    _modal.show();
  };

  /** Режим 1: в теле есть JSON — показываем его поля */
  function _setupFieldsMode() {
    _mode = "fields";
    document.getElementById("dynvars-fields-mode").style.display = "";
    document.getElementById("dynvars-list-mode").style.display = "none";
    document.getElementById("dynvars-apply").style.display = "";

    _fieldSel = {};
    _fields = App.analyzeJsonForVars(_jsonObj);
    _fields.forEach(f => { _fieldSel[f.path] = f.suggested; });
    _renderFields();
  }

  /** Режим 2: обычный справочник переменных */
  function _setupListMode() {
    _mode = "list";
    document.getElementById("dynvars-fields-mode").style.display = "none";
    document.getElementById("dynvars-list-mode").style.display = "";
    document.getElementById("dynvars-apply").style.display = "none";

    const hint = document.getElementById("dynvars-hint");
    if (_target) {
      hint.style.display = "";
      const where = _targetSel ? App.t("atCursor") : App.t("atEnd");
      hint.innerHTML = `<i class="bi bi-cursor-text me-1"></i>` +
        `${App.t("insertInto")}: <strong>${App.escapeHtml(_targetLabel(_target))}</strong> — ${where}`;
    } else {
      hint.style.display = "none";
    }

    _renderList();
    _renderPreview();
  }

  // ============================================================
  // РЕЖИМ ПОЛЕЙ
  // ============================================================
  function _renderFields() {
    const box = document.getElementById("dynvars-fields");
    if (!_fields.length) {
      box.innerHTML = `<div style="color:var(--text-dim);padding:16px;text-align:center;">${App.t("noFields")}</div>`;
      return;
    }

    const opts = App.getDynamicList()
      .map(v => `<option value="${v.name}">${App.escapeHtml(v.name)}</option>`).join("");

    box.innerHTML = _fields.map((f, i) => {
      const shown = typeof f.value === "string" ? `"${f.value}"` : String(f.value);
      const on = !!_fieldSel[f.path];
      return `
        <div class="dvf-row${on ? "" : " dvf-off"}">
          <input type="checkbox" class="dvf-check" data-i="${i}" ${on ? "checked" : ""}>
          <span class="dvf-path" title="${App.escapeAttr(f.path)}">${App.escapeHtml(f.path)}</span>
          <span class="dvf-val">${App.escapeHtml(shown.length > 22 ? shown.slice(0, 20) + "…" : shown)}</span>
          <i class="bi bi-arrow-right dvf-arrow"></i>
          <select class="dvf-sel" data-i="${i}">${opts}</select>
        </div>`;
    }).join("");

    box.querySelectorAll(".dvf-sel").forEach(sel => {
      const i = +sel.dataset.i;
      sel.value = _fieldSel[_fields[i].path] || _fields[i].suggested;
      sel.addEventListener("change", (e) => {
        _fieldSel[_fields[i].path] = e.target.value;
        _renderFieldsPreview();
      });
    });

    box.querySelectorAll(".dvf-check").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const i = +e.target.dataset.i;
        const f = _fields[i];
        _fieldSel[f.path] = e.target.checked
          ? (box.querySelector(`.dvf-sel[data-i="${i}"]`).value || f.suggested)
          : null;
        e.target.closest(".dvf-row").classList.toggle("dvf-off", !e.target.checked);
        _renderFieldsPreview();
      });
    });

    _renderFieldsPreview();
  }

  function _renderFieldsPreview() {
    const out = document.getElementById("dynvars-fields-preview");
    if (!out || !_jsonObj) return;
    const json = App.fillJsonWithVars(_jsonObj, _fieldSel);
    out.textContent = json;

    const n = Object.values(_fieldSel).filter(Boolean).length;
    document.getElementById("dynvars-apply").disabled = n === 0;
    document.getElementById("dvf-count").textContent = `${n} / ${_fields.length}`;
  }

  /** Применить: записать заполненный JSON обратно в тело */
  function _applyFields() {
    if (!_jsonObj || !_target) return;
    const json = App.fillJsonWithVars(_jsonObj, _fieldSel);

    _target.value = json;
    _target.dispatchEvent(new Event("input", { bubbles: true }));
    _target.dispatchEvent(new Event("change", { bubbles: true }));

    _modal.hide();
    const n = Object.values(_fieldSel).filter(Boolean).length;
    App.syncToast && App.syncToast(`${App.t("fieldsFilled")}: ${n}`);
  }

  // ============================================================
  // СПИСОК
  // ============================================================
  function _renderList() {
    const box = document.getElementById("dynvars-list");
    const all = App.getDynamicList();

    const filtered = _search
      ? all.filter(v => v.name.toLowerCase().includes(_search) ||
                        (v.example || "").toLowerCase().includes(_search))
      : all;

    if (!filtered.length) {
      box.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:20px;">${App.t("logEmpty")}</div>`;
      return;
    }

    // Группируем
    const groups = {};
    filtered.forEach(v => { (groups[v.group] = groups[v.group] || []).push(v); });

    box.innerHTML = Object.entries(groups).map(([g, items]) => `
      <div class="dynvar-group">
        <div class="dynvar-group-title">${App.escapeHtml(App.DYNAMIC_GROUPS[g] || g)}</div>
        ${items.map(v => `
          <div class="dynvar-item" data-token="${App.escapeAttr(v.token)}" title="${App.t("clickToInsert")}">
            <code class="dynvar-token">${App.escapeHtml(v.token)}</code>
            <span class="dynvar-example">${App.escapeHtml(v.example || "")}</span>
            <button class="dynvar-copy" title="${App.t("copy")}"><i class="bi bi-clipboard"></i></button>
          </div>`).join("")}
      </div>`).join("");

    // Клик по строке — вставить, клик по кнопке — скопировать
    box.querySelectorAll(".dynvar-item").forEach(item => {
      const token = item.dataset.token;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".dynvar-copy")) return;
        _insert(token);
      });

      item.querySelector(".dynvar-copy").addEventListener("click", (e) => {
        e.stopPropagation();
        _copyOnly = true;
        _insert(token);
        _copyOnly = false;
        const btn = e.currentTarget;
        const old = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        btn.style.color = "#28a745";
        setTimeout(() => { btn.innerHTML = old; btn.style.color = ""; }, 1000);
      });
    });
  }

  /** Вставить токен в целевое поле на позицию курсора */
  function _insert(token) {
    // Поле могло быть пересоздано при перерисовке вкладки — тогда наша
    // ссылка указывает на элемент вне документа, и вставка «проваливается».
    if (_target && !_target.isConnected && _target.id) {
      const fresh = document.getElementById(_target.id);
      if (fresh) _target = fresh;
    }

    // Небезопасно вставлять — копируем и говорим об этом прямо
    if (!_target || !_target.isConnected || _copyOnly) {
      navigator.clipboard.writeText(token);
      App.syncToast && App.syncToast(
        _copyOnly ? App.t("copiedPlaceManually") : App.t("copied")
      );
      _modal.hide();
      return;
    }

    // Курсор, снятый при открытии. Если его не было — дописываем в конец,
    // а не в начало: вставка перед '{' ломала JSON, а перед 'http' — адрес.
    const len = _target.value.length;
    const start = _targetSel ? _targetSel.start : len;
    const end = _targetSel ? _targetSel.end : len;
    _target.value = _target.value.slice(0, start) + token + _target.value.slice(end);

    // Уведомляем приложение об изменении, чтобы значение попало в состояние вкладки
    _target.dispatchEvent(new Event("input", { bubbles: true }));
    _target.dispatchEvent(new Event("change", { bubbles: true }));

    const pos = start + token.length;
    _modal.hide();
    setTimeout(() => { _target.focus(); _target.setSelectionRange(pos, pos); }, 200);
  }

  // ============================================================
  // ПРЕДПРОСМОТР
  // ============================================================
  function _renderPreview() {
    const inp = document.getElementById("dynvars-preview-input");
    const out = document.getElementById("dynvars-preview-out");
    if (!inp || !out) return;

    const src = inp.value;
    if (!src.trim()) { out.textContent = ""; return; }

    const unknown = App.findUnknownDynamic(src);
    out.textContent = App.previewDynamic(src);
    out.style.color = unknown.length ? "#ffc107" : "var(--accent)";

    const warn = document.getElementById("dynvars-preview-warn");
    warn.textContent = unknown.length
      ? `${App.t("unknownVars")}: ${unknown.map(u => "{{$" + u + "}}").join(", ")}`
      : "";
  }

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div class="modal fade" id="dynvars-modal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-braces me-2"></i><span data-i18n="dynamicVars">Динамические переменные</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <div class="modal-body">

            <!-- РЕЖИМ 1: в теле уже есть JSON — заполняем его поля -->
            <div id="dynvars-fields-mode" style="display:none;">
              <div class="dvf-intro">
                <i class="bi bi-magic me-1"></i><span data-i18n="fillFieldsIntro">
                  Поля вашего JSON и подобранные к ним переменные. Значения будут
                  подставляться заново при каждой отправке запроса.
                </span>
              </div>

              <div class="dvf-head">
                <span data-i18n="field">Поле</span>
                <span id="dvf-count" style="margin-left:auto;color:var(--accent);font-weight:600;"></span>
              </div>

              <div id="dynvars-fields" class="dvf-list"></div>

              <label class="form-label mt-2" style="font-size:11px;color:var(--text-dim);" data-i18n="willBeSent">Будет отправлено</label>
              <pre id="dynvars-fields-preview" class="dynvars-preview"></pre>

              <button class="btn btn-link btn-sm p-0" id="dynvars-show-list" style="font-size:11px;">
                <span data-i18n="showAllVars">Показать все переменные</span> →
              </button>
            </div>

            <!-- РЕЖИМ 2: справочник переменных -->
            <div id="dynvars-list-mode">
              <div style="font-size:11.5px;color:var(--text-dim);margin-bottom:10px;" data-i18n="dynamicVarsIntro">
                Вставьте переменную в URL, параметры, заголовки или тело запроса — значение
                подставится в момент отправки. Каждый запуск даёт новые данные.
              </div>

              <div id="dynvars-hint" style="font-size:11px;color:var(--accent);margin-bottom:8px;"></div>

              <input type="text" class="form-control form-control-sm mb-2" id="dynvars-search"
                     data-i18n-ph="search" placeholder="Поиск...">

              <div id="dynvars-list" class="dynvars-list"></div>

              <hr style="border-color:var(--border-color);">

              <label class="form-label" style="font-size:12px;" data-i18n="tryIt">Попробовать</label>
              <div class="d-flex gap-2">
                <input type="text" class="form-control form-control-sm" id="dynvars-preview-input"
                       value='{"email": "{{$randomEmail}}", "id": {{$randomInt}}}'
                       style="font-family:'Courier New',monospace;font-size:11.5px;">
                <button class="btn btn-sm btn-outline-secondary" id="dynvars-preview-again" title="Ещё раз">
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
              </div>
              <pre id="dynvars-preview-out" class="dynvars-preview"></pre>
              <div id="dynvars-preview-warn" style="font-size:11px;color:#ffc107;"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="close">Закрыть</button>
            <button type="button" class="btn send-btn btn-sm" id="dynvars-apply" style="display:none;">
              <i class="bi bi-check-lg me-1"></i><span data-i18n="fillFields">Заполнить</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
