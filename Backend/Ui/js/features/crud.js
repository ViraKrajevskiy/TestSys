/**
 * crud.js — Универсальная работа с сущностями из ответа.
 *
 * Логика:
 *   1. Смотрим ответ. Если это массив объектов или один объект с id —
 *      это «список сущностей», можно показать таблицу и кнопки CRUD.
 *   2. Колонки и поля модалки берутся ИЗ САМИХ ДАННЫХ — не нужно ничего
 *      захардкоживать. Раньше было прибито гвоздями к users.
 *   3. Если запрос пришёл из Swagger, доп. подсказки типов/required
 *      берутся из схемы.
 */
window.App = window.App || {};

(function () {
  let pendingDelete = null;

  // Скрытые по умолчанию системные поля JSONPlaceholder/REST — их обычно
  // не хочется править вручную (заполняются сервером).
  const HIDDEN_FIELDS = ["_id", "createdAt", "updatedAt", "created_at", "updated_at"];

  // Порядок предпочитаемых колонок — если такие есть в данных, выводим
  // их первыми. Хорошо ложится на большинство REST-ответов.
  const PREFERRED_ORDER = ["id", "uuid", "name", "title", "username", "login",
                            "email", "phone", "status", "role", "type"];

  const MAX_COLS = 8;   // больше — таблица становится нечитаемой

  // ============================================================
  // ОПРЕДЕЛЕНИЕ СУЩНОСТЕЙ В ОТВЕТЕ
  // ============================================================
  App.getResponseEntities = function (tab) {
    if (!tab.response || !tab.response.ok) return null;
    const data = App.tryParseJson(tab.response.text);
    if (data === null) return null;

    if (Array.isArray(data)) {
      // Массив примитивов не считаем сущностями
      const objects = data.filter(x => x && typeof x === "object" && !Array.isArray(x));
      return objects.length ? objects : null;
    }
    if (data && typeof data === "object" && _hasId(data)) return [data];

    // Иногда API возвращает {data: [...], meta: {...}} — пробуем распаковать
    if (data && typeof data === "object") {
      for (const key of ["data", "items", "results", "records"]) {
        const inner = data[key];
        if (Array.isArray(inner) && inner.length && typeof inner[0] === "object") {
          return inner;
        }
      }
    }
    return null;
  };

  function _hasId(obj) {
    return "id" in obj || "_id" in obj || "uuid" in obj;
  }

  /** ID может называться по-разному — вычисляем один раз для сущности */
  function _idOf(entity) {
    if (entity == null) return null;
    for (const k of ["id", "_id", "uuid", "ID", "Id"]) {
      if (k in entity) return entity[k];
    }
    return null;
  }

  /** Имя поля-идентификатора для URL */
  function _idField(entity) {
    for (const k of ["id", "_id", "uuid", "ID", "Id"]) {
      if (k in entity) return k;
    }
    return "id";
  }

  // ============================================================
  // БАЗОВЫЙ URL СУЩНОСТИ
  // ============================================================
  /**
   * По URL запроса пытаемся вычислить URL коллекции.
   * /users        → /users
   * /users/1      → /users
   * /users?limit=10 → /users
   */
  App.getEntityBaseUrl = function (tab) {
    const raw = App.resolveVariables(tab.url);
    try {
      const u = new URL(raw);
      const parts = u.pathname.split("/").filter(Boolean);

      // Если последний сегмент — идентификатор (число, uuid, guid), убираем
      if (parts.length && _looksLikeId(parts[parts.length - 1])) parts.pop();

      return u.origin + (parts.length ? "/" + parts.join("/") : "");
    } catch {
      // Если URL не парсится — возвращаем как есть без query
      return raw.split("?")[0].replace(/\/[0-9a-fA-F-]+$/, "");
    }
  };

  function _looksLikeId(s) {
    if (!s) return false;
    if (/^\d+$/.test(s)) return true;                                    // 123
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s)) return true;                // uuid
    if (/^[0-9a-f]{24}$/i.test(s)) return true;                          // ObjectId
    return false;
  }

  // ============================================================
  // АВТОПОДБОР КОЛОНОК И ПОЛЕЙ
  // ============================================================
  /**
   * По массиву сущностей — какие колонки показывать в таблице.
   * Берём объединение простых (не object/array) полей.
   */
  App.pickEntityColumns = function (entities) {
    if (!entities.length) return [];

    const seen = new Map();   // имя → сколько раз встретилось
    entities.forEach(e => {
      Object.keys(e || {}).forEach(k => {
        if (HIDDEN_FIELDS.includes(k)) return;
        const v = e[k];
        // Объекты и массивы в таблицу не влезают — их только в модалке
        if (v !== null && typeof v === "object") return;
        seen.set(k, (seen.get(k) || 0) + 1);
      });
    });

    if (!seen.size) return [];

    const all = [...seen.keys()];
    // Сначала предпочитаемые, потом всё остальное в порядке появления
    const ordered = [];
    PREFERRED_ORDER.forEach(k => { if (seen.has(k)) ordered.push(k); });
    all.forEach(k => { if (!ordered.includes(k)) ordered.push(k); });

    return ordered.slice(0, MAX_COLS);
  };

  /**
   * Поля для модалки Create/Edit.
   * Если запрос пришёл из Swagger — берём поля и типы из его схемы.
   * Иначе — из первого объекта.
   */
  App.pickEntityFields = function (entity, tab) {
    // Приоритет схеме, если она есть
    if (tab && tab.schema && Array.isArray(tab.schema.fields) && tab.schema.fields.length) {
      return tab.schema.fields
        .filter(f => !f.isArray && !f.path.includes("."))   // плоские поля
        .filter(f => !HIDDEN_FIELDS.includes(f.key))
        .map(f => ({
          key: f.key,
          label: _humanize(f.key),
          type: _swaggerInputType(f),
          required: !!f.required,
          enum: f.enum || null,
          description: f.description || "",
        }));
    }

    // Иначе — по образцу первой записи
    if (!entity || typeof entity !== "object") return [];

    return Object.keys(entity)
      .filter(k => !HIDDEN_FIELDS.includes(k))
      .filter(k => {
        const v = entity[k];
        // Вложенные объекты/массивы через простую форму не редактируем
        return v === null || typeof v !== "object";
      })
      .map(k => ({
        key: k,
        label: _humanize(k),
        type: _guessInputType(k, entity[k]),
        required: false,
        enum: null,
      }));
  };

  function _humanize(key) {
    return key
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^\w/, c => c.toUpperCase());
  }

  function _swaggerInputType(f) {
    const fmt = (f.format || "").toLowerCase();
    if (fmt === "email") return "email";
    if (fmt === "password") return "password";
    if (fmt === "date") return "date";
    if (fmt === "date-time") return "datetime-local";
    if (fmt === "uri" || fmt === "url") return "url";
    if (f.type === "integer" || f.type === "number") return "number";
    if (f.type === "boolean") return "checkbox";
    return "text";
  }

  function _guessInputType(key, value) {
    const k = key.toLowerCase();
    if (k.includes("email")) return "email";
    if (k.includes("password") || k.includes("pass")) return "password";
    if (k.includes("phone") || k.includes("tel")) return "tel";
    if (k.includes("url") || k.includes("website") || k.includes("site")) return "url";
    if (k.includes("date") && !k.includes("update")) return "date";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "checkbox";
    return "text";
  }

  // ============================================================
  // МОДАЛКА CREATE / EDIT
  // ============================================================
  App.openEntityModal = function (mode, entity, baseUrl, sourceTabId, tab) {
    const modal = document.getElementById("entity-modal");
    const title = document.getElementById("entity-modal-title");
    const fieldsRoot = document.getElementById("entity-form-fields");
    const saveBtn = document.getElementById("entity-save-btn");

    const entityLabel = _entityLabelFromUrl(baseUrl);
    title.textContent = mode === "create"
      ? `${App.t("create")} ${entityLabel}`
      : `${App.t("edit")} ${entityLabel}`;
    saveBtn.textContent = mode === "create" ? App.t("create") : App.t("save");

    // Поля для формы: либо по схеме, либо по образцу первой сущности,
    // либо (если создаём с нуля) по любой сущности из тек. tab
    const sampleTab = tab || (sourceTabId ? App.state.tabs.find(t => t.id === +sourceTabId) : null);
    const sample = entity || _sampleEntity(sampleTab);
    const fields = App.pickEntityFields(sample, sampleTab);

    if (!fields.length) {
      fieldsRoot.innerHTML =
        `<div class="text-secondary" style="font-size:12px;padding:12px 0;">${App.t("noFieldsAutodetect")}</div>`;
    } else {
      fieldsRoot.innerHTML = fields.map(f => _fieldHtml(f, entity)).join("");
    }

    modal.dataset.mode = mode;
    modal.dataset.entityId = entity ? String(_idOf(entity) ?? "") : "";
    modal.dataset.idField = entity ? _idField(entity) : "id";
    modal.dataset.baseUrl = baseUrl;
    modal.dataset.sourceTabId = sourceTabId || "";
    // Сохраняем список полей для сборки — с указанием типов
    modal._fields = fields;
    // Сохраняем оригинал: восстановим неотредактированные вложенные объекты
    modal._original = entity ? JSON.parse(JSON.stringify(entity)) : null;

    bootstrap.Modal.getOrCreateInstance(modal).show();
  };

  /** Найти любую сущность в текущей вкладке — как образец при Create */
  function _sampleEntity(tab) {
    if (!tab) return null;
    const list = App.getResponseEntities(tab);
    return list && list[0] ? list[0] : null;
  }

  function _entityLabelFromUrl(baseUrl) {
    try {
      const u = new URL(baseUrl);
      const last = u.pathname.split("/").filter(Boolean).pop();
      return last ? _humanize(last).replace(/s$/, "") : App.t("entity");
    } catch {
      return App.t("entity");
    }
  }

  function _fieldHtml(f, entity) {
    const val = entity ? entity[f.key] : "";
    const req = f.required ? ' <span style="color:#dc3545;">*</span>' : "";
    const hint = f.description
      ? `<div class="form-text" style="font-size:10.5px;">${App.escapeHtml(f.description)}</div>`
      : "";

    // Enum → select
    if (f.enum && f.enum.length) {
      const opts = f.enum.map(v =>
        `<option value="${App.escapeAttr(v)}"${String(val) === String(v) ? " selected" : ""}>${App.escapeHtml(v)}</option>`
      ).join("");
      return `
        <div class="mb-3">
          <label class="form-label" style="font-size:12px;">${App.escapeHtml(f.label)}${req}</label>
          <select class="form-select form-select-sm entity-field" data-field="${App.escapeAttr(f.key)}" data-type="enum">
            ${f.required ? "" : '<option value=""></option>'}${opts}
          </select>
          ${hint}
        </div>`;
    }

    // Boolean → чекбокс
    if (f.type === "checkbox") {
      const checked = (val === true || val === "true") ? "checked" : "";
      return `
        <div class="mb-3 form-check form-switch">
          <input type="checkbox" class="form-check-input entity-field"
                 data-field="${App.escapeAttr(f.key)}" data-type="boolean" ${checked}>
          <label class="form-check-label" style="font-size:12px;">${App.escapeHtml(f.label)}${req}</label>
          ${hint}
        </div>`;
    }

    // Всё остальное — обычный input
    const typeAttr = f.type || "text";
    return `
      <div class="mb-3">
        <label class="form-label" style="font-size:12px;">${App.escapeHtml(f.label)}${req}</label>
        <input type="${typeAttr}" class="form-control form-control-sm entity-field"
               data-field="${App.escapeAttr(f.key)}" data-type="${typeAttr}"
               value="${App.escapeAttr(val == null ? "" : String(val))}">
        ${hint}
      </div>`;
  }

  App.collectEntityFormData = function () {
    const modal = document.getElementById("entity-modal");
    // Начинаем с оригинала, чтобы вложенные объекты (address, geo и т.п.)
    // не потерялись — их через простую форму мы не редактируем.
    const data = modal._original ? JSON.parse(JSON.stringify(modal._original)) : {};

    document.querySelectorAll("#entity-form-fields .entity-field").forEach((input) => {
      const key = input.dataset.field;
      const type = input.dataset.type;
      let val;

      if (type === "boolean") {
        val = input.checked;
      } else if (type === "number") {
        const raw = input.value.trim();
        val = raw === "" ? null : Number(raw);
      } else {
        val = input.value;
      }

      // Пустое поле не удаляем — оставляем как есть, если пользователь ничего не менял
      if (val === "" || val === null) {
        if (modal._original && key in modal._original) return;
      }
      data[key] = val;
    });

    return data;
  };

  App.handleEntitySave = function () {
    const modal = document.getElementById("entity-modal");
    const mode = modal.dataset.mode;
    const baseUrl = modal.dataset.baseUrl;
    const entityId = modal.dataset.entityId;
    const sourceTabId = modal.dataset.sourceTabId;
    const body = JSON.stringify(App.collectEntityFormData(), null, 2);

    bootstrap.Modal.getInstance(modal).hide();

    // Если модалка открыта из существующей вкладки — только заполняем body
    if (sourceTabId) {
      const tab = App.state.tabs.find((t) => t.id === parseInt(sourceTabId, 10));
      if (tab) {
        tab.body = body;
        App.renderTabContent();
        return;
      }
    }

    const commonHeaders = [{ key: "Content-Type", value: "application/json" }];

    if (mode === "create") {
      App.addTab({
        method: "POST", url: baseUrl, body,
        headers: commonHeaders, activeSubTab: "body",
        crudAction: "create",
      });
      return;
    }

    App.addTab({
      method: "PUT", url: baseUrl + "/" + entityId, body,
      headers: commonHeaders, activeSubTab: "body",
      crudAction: "update",
    });
  };

  // ============================================================
  // УДАЛЕНИЕ
  // ============================================================
  App.confirmDeleteEntity = function (entity, baseUrl) {
    pendingDelete = { entity, baseUrl };
    const id = _idOf(entity);
    const name = entity.name || entity.title || entity.username || entity.email || id;
    document.getElementById("delete-confirm-text").textContent =
      `${App.t("delete")}: "${name}" (ID: ${id})?`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("delete-modal")).show();
  };

  App.handleDeleteConfirm = function () {
    if (!pendingDelete) return;
    const { entity, baseUrl } = pendingDelete;
    pendingDelete = null;
    bootstrap.Modal.getInstance(document.getElementById("delete-modal")).hide();

    App.addTab({
      method: "DELETE",
      url: baseUrl + "/" + _idOf(entity),
      headers: [{ key: "Content-Type", value: "application/json" }],
      crudAction: "delete",
    });
  };

  // ============================================================
  // ТАБЛИЦА
  // ============================================================
  App.renderEntityTable = function (entities, tab) {
    const baseUrl = App.getEntityBaseUrl(tab);
    const cols = App.pickEntityColumns(entities);
    const idField = _idField(entities[0]);

    let html = '<div class="crud-table-toolbar">';
    html += `<span class="text-secondary">${entities.length} ${App.t("records")}</span>`;
    html += `<button class="btn btn-sm send-btn" id="crud-create-btn"><i class="bi bi-plus-lg"></i> ${App.t("create")}</button>`;
    html += "</div>";

    if (!cols.length) {
      html += `<div style="color:var(--text-dim);padding:14px;">${App.t("noSimpleFields")}</div>`;
    } else {
      html += '<div class="table-responsive"><table class="table table-sm crud-table"><thead><tr>';
      cols.forEach(c => { html += `<th>${App.escapeHtml(c)}</th>`; });
      html += `<th class="crud-actions-col">${App.t("actions")}</th></tr></thead><tbody>`;

      entities.forEach((entity) => {
        html += "<tr>";
        cols.forEach(c => {
          const v = entity[c];
          html += "<td>" + _cellHtml(v) + "</td>";
        });
        const id = _idOf(entity);
        html += `<td class="crud-actions-col">
          <button class="btn btn-sm btn-outline-primary crud-edit-btn" data-id="${App.escapeAttr(id)}" title="${App.t("edit")}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger crud-delete-btn" data-id="${App.escapeAttr(id)}" title="${App.t("delete")}"><i class="bi bi-trash3"></i></button>
        </td></tr>`;
      });

      html += "</tbody></table></div>";
    }

    const container = document.createElement("div");
    container.innerHTML = html;
    container.className = "crud-table-wrap";

    const entityMap = {};
    entities.forEach(e => { entityMap[String(_idOf(e))] = e; });

    container.querySelector("#crud-create-btn").addEventListener("click", () => {
      App.openEntityModal("create", null, baseUrl, null, tab);
    });

    container.querySelectorAll(".crud-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const entity = entityMap[btn.dataset.id];
        if (entity) App.openEntityModal("edit", entity, baseUrl, null, tab);
      });
    });

    container.querySelectorAll(".crud-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const entity = entityMap[btn.dataset.id];
        if (entity) App.confirmDeleteEntity(entity, baseUrl);
      });
    });

    return container;
  };

  /** Как показывать значение в ячейке */
  function _cellHtml(v) {
    if (v === null || v === undefined) return '<span style="color:var(--text-dim);">—</span>';
    if (typeof v === "boolean") {
      return v
        ? '<span style="color:#22c55e;">✓</span>'
        : '<span style="color:#dc3545;">✗</span>';
    }
    if (typeof v === "object") return '<span style="color:var(--text-dim);">{…}</span>';
    const s = String(v);
    if (s.length > 60) {
      return `<span title="${App.escapeAttr(s)}">${App.escapeHtml(s.slice(0, 57))}…</span>`;
    }
    return App.escapeHtml(s);
  }

  App.initCrud = function () {
    document.getElementById("entity-save-btn").addEventListener("click", App.handleEntitySave);
    document.getElementById("delete-confirm-btn").addEventListener("click", App.handleDeleteConfirm);
  };
})();
