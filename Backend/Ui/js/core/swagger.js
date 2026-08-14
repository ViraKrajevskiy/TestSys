/**
 * swagger.js — Разбор OpenAPI 3.x и Swagger 2.0
 *
 * Превращает спецификацию в:
 *   - список эндпоинтов (метод, путь, теги, параметры, тело)
 *   - примеры тел запросов, собранные из схем
 *   - метаданные полей (тип, формат, required, enum, границы)
 *     — их использует рандомайзер, чтобы не угадывать тип по имени
 *
 * Всё локально, без сети: спецификацию приносит вызывающий код.
 */
window.App = window.App || {};

(function () {
  const MAX_DEPTH = 8;   // защита от циклических $ref

  // ============================================================
  // ТОЧКА ВХОДА
  // ============================================================
  /**
   * Разобрать спецификацию.
   * @returns {ok, version, title, servers, endpoints[], error}
   */
  App.parseSwagger = function (raw) {
    let spec;
    try {
      spec = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: "Файл не является валидным JSON: " + e.message };
    }

    if (!spec || typeof spec !== "object") {
      return { ok: false, error: "Пустая или некорректная спецификация" };
    }

    const isV3 = !!spec.openapi;
    const isV2 = !!spec.swagger;
    if (!isV3 && !isV2) {
      return { ok: false, error: "Не найдено поле openapi или swagger — это не спецификация OpenAPI" };
    }
    if (!spec.paths || typeof spec.paths !== "object") {
      return { ok: false, error: "В спецификации нет раздела paths" };
    }

    const ctx = {
      spec,
      isV3,
      // Где лежат переиспользуемые схемы: v3 — components.schemas, v2 — definitions
      schemas: isV3 ? (spec.components && spec.components.schemas) || {} : spec.definitions || {},
    };

    const endpoints = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      if (!item || typeof item !== "object") continue;

      // Параметры, общие для всех методов пути
      const shared = Array.isArray(item.parameters) ? item.parameters : [];

      for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
        const op = item[method];
        if (!op || typeof op !== "object") continue;
        endpoints.push(_buildEndpoint(ctx, method.toUpperCase(), path, op, shared));
      }
    }

    return {
      ok: true,
      version: isV3 ? (spec.openapi || "3.x") : (spec.swagger || "2.0"),
      title: (spec.info && spec.info.title) || "API",
      apiVersion: (spec.info && spec.info.version) || "",
      description: (spec.info && spec.info.description) || "",
      servers: _servers(ctx),
      endpoints,
    };
  };

  // ============================================================
  // БАЗОВЫЕ URL
  // ============================================================
  function _servers(ctx) {
    const { spec, isV3 } = ctx;
    if (isV3) {
      if (Array.isArray(spec.servers) && spec.servers.length) {
        return spec.servers.map(s => _applyServerVars(s));
      }
      return [];
    }
    // Swagger 2.0: схема + хост + базовый путь по частям
    const scheme = (spec.schemes && spec.schemes[0]) || "http";
    const host = spec.host || "";
    const base = spec.basePath || "";
    return host ? [scheme + "://" + host + base] : (base ? [base] : []);
  }

  /** Подставить значения по умолчанию в шаблон вида https://{host}/v1 */
  function _applyServerVars(server) {
    let url = server.url || "";
    if (server.variables) {
      Object.entries(server.variables).forEach(([k, v]) => {
        url = url.replace(new RegExp(`\\{${k}\\}`, "g"), v.default ?? "");
      });
    }
    return url;
  }

  // ============================================================
  // ЭНДПОИНТ
  // ============================================================
  function _buildEndpoint(ctx, method, path, op, sharedParams) {
    const params = (sharedParams || []).concat(Array.isArray(op.parameters) ? op.parameters : [])
      .map(p => _deref(ctx, p))
      .filter(Boolean);

    const query = [];
    const headers = [];
    const pathVars = [];

    params.forEach(p => {
      const entry = {
        key: p.name,
        value: _paramExample(ctx, p),
        required: !!p.required,
        description: p.description || "",
      };
      if (p.in === "query") query.push(entry);
      else if (p.in === "header") headers.push(entry);
      else if (p.in === "path") pathVars.push(entry);
    });

    // Тело запроса
    const bodyInfo = _requestBody(ctx, op, params);

    return {
      method,
      path,
      operationId: op.operationId || "",
      summary: op.summary || op.description || "",
      tags: Array.isArray(op.tags) && op.tags.length ? op.tags : ["default"],
      deprecated: !!op.deprecated,
      query,
      headers,
      pathVars,
      body: bodyInfo.example,          // строка JSON или ""
      bodySchema: bodyInfo.schema,     // сырая схема — для рандомайзера
      fields: bodyInfo.fields,         // плоский список полей с метаданными
      contentType: bodyInfo.contentType,
    };
  }

  /** Пример значения для параметра пути/запроса/заголовка */
  function _paramExample(ctx, p) {
    if (p.example !== undefined) return String(p.example);
    const sch = _deref(ctx, p.schema || p);   // v3 — в schema, v2 — прямо в параметре
    if (!sch) return "";
    if (sch.default !== undefined) return String(sch.default);
    if (Array.isArray(sch.enum) && sch.enum.length) return String(sch.enum[0]);
    const v = _exampleValue(ctx, sch, p.name, 0);
    return v === null || typeof v === "object" ? "" : String(v);
  }

  /** Тело запроса: v3 — requestBody, v2 — параметр с in: body */
  function _requestBody(ctx, op, params) {
    const empty = { example: "", schema: null, fields: [], contentType: "" };

    let schema = null;
    let contentType = "application/json";

    if (ctx.isV3) {
      const rb = _deref(ctx, op.requestBody);
      if (!rb || !rb.content) return empty;
      // Предпочитаем JSON, иначе берём что есть
      const types = Object.keys(rb.content);
      const jsonType = types.find(t => t.includes("json")) || types[0];
      if (!jsonType) return empty;
      contentType = jsonType;
      schema = _deref(ctx, rb.content[jsonType].schema);
    } else {
      const bodyParam = params.find(p => p.in === "body");
      if (!bodyParam) {
        // form-data в v2 — собираем из отдельных параметров
        const formParams = params.filter(p => p.in === "formData");
        if (!formParams.length) return empty;
        const obj = {};
        formParams.forEach(p => { obj[p.name] = _exampleValue(ctx, p, p.name, 0); });
        return {
          example: JSON.stringify(obj, null, 2),
          schema: null,
          fields: formParams.map(p => ({
            path: p.name, type: p.type || "string", required: !!p.required,
            enum: p.enum || null, format: p.format || "",
          })),
          contentType: "application/x-www-form-urlencoded",
        };
      }
      schema = _deref(ctx, bodyParam.schema);
    }

    if (!schema) return empty;

    const example = _exampleValue(ctx, schema, "", 0);
    const fields = [];
    _collectFields(ctx, schema, "", fields, 0);

    return {
      example: example === null || example === undefined ? "" : JSON.stringify(example, null, 2),
      schema,
      fields,
      contentType,
    };
  }

  // ============================================================
  // РАЗЫМЕНОВАНИЕ $ref
  // ============================================================
  function _deref(ctx, node, depth = 0) {
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) return node || null;
    if (!node.$ref) return node;

    const ref = node.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/")) return node;

    // #/components/schemas/User  →  ["components","schemas","User"]
    const parts = ref.slice(2).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let cur = ctx.spec;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return null;
      cur = cur[p];
    }
    // Ссылка может вести на другую ссылку
    return _deref(ctx, cur, depth + 1);
  }

  /** Собрать составные схемы: allOf/oneOf/anyOf */
  function _flatten(ctx, schema, depth) {
    if (!schema) return null;
    const s = _deref(ctx, schema);
    if (!s) return null;

    if (Array.isArray(s.allOf)) {
      // allOf — объединяем свойства всех частей
      const merged = { type: "object", properties: {}, required: [] };
      s.allOf.forEach(part => {
        const p = _flatten(ctx, part, depth + 1);
        if (!p) return;
        Object.assign(merged.properties, p.properties || {});
        if (Array.isArray(p.required)) merged.required.push(...p.required);
      });
      // Свои свойства поверх
      Object.assign(merged.properties, s.properties || {});
      if (Array.isArray(s.required)) merged.required.push(...s.required);
      return merged;
    }

    // oneOf/anyOf — берём первый вариант, иначе пример собрать невозможно
    if (Array.isArray(s.oneOf) && s.oneOf.length) return _flatten(ctx, s.oneOf[0], depth + 1);
    if (Array.isArray(s.anyOf) && s.anyOf.length) return _flatten(ctx, s.anyOf[0], depth + 1);

    return s;
  }

  // ============================================================
  // ПРИМЕР ЗНАЧЕНИЯ ПО СХЕМЕ
  // ============================================================
  /** Поле помечено readOnly — сервер его не принимает (id, created_at, …). */
  function _isReadOnly(ctx, schema, depth) {
    const s = _flatten(ctx, schema, depth);
    return !!(s && s.readOnly === true);
  }

  function _exampleValue(ctx, schema, name, depth) {
    if (depth > MAX_DEPTH) return null;
    const s = _flatten(ctx, schema, depth);
    if (!s) return null;

    // Явно указанные примеры имеют приоритет
    if (s.example !== undefined) return s.example;
    if (s.default !== undefined) return s.default;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];

    const type = s.type || (s.properties ? "object" : "string");

    if (type === "object") {
      const obj = {};
      const props = s.properties || {};
      Object.keys(props).forEach(k => {
        // readOnly-поля сервер отдаёт, но НЕ принимает (id, created_at,
        // rating_writer и т.п.). Раньше они попадали в тело запроса и
        // ломали POST/PUT — DRF отвечал 400 или молча их игнорировал.
        if (_isReadOnly(ctx, props[k], depth + 1)) return;
        obj[k] = _exampleValue(ctx, props[k], k, depth + 1);
      });
      return obj;
    }

    if (type === "array") {
      const item = _exampleValue(ctx, s.items, name, depth + 1);
      return item === null || item === undefined ? [] : [item];
    }

    if (type === "boolean") return true;

    if (type === "integer" || type === "number") {
      if (typeof s.minimum === "number") return s.minimum;
      return type === "integer" ? 0 : 0.0;
    }

    // string — подбираем по формату, иначе по имени поля
    return _stringExample(s.format, name, s);
  }

  function _stringExample(format, name, s) {
    const byFormat = {
      email: "user@example.com",
      "date-time": new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      uri: "https://example.com",
      url: "https://example.com",
      hostname: "example.com",
      ipv4: "192.168.0.1",
      ipv6: "2001:db8::1",
      password: "P@ssw0rd123",
      byte: "U3dhZ2dlcg==",
      binary: "",
    };
    if (format && byFormat[format] !== undefined) return byFormat[format];

    const k = (name || "").toLowerCase();
    if (k.includes("email")) return "user@example.com";
    if (k.includes("phone") || k.includes("tel")) return "+1-234-567-8900";
    if (k.includes("url") || k.includes("website")) return "https://example.com";
    if (k.includes("name")) return "string";
    if (k.includes("password")) return "P@ssw0rd123";

    // Уважаем minLength, если задан
    if (typeof s.minLength === "number" && s.minLength > 6) {
      return "s".repeat(s.minLength);
    }
    return "string";
  }

  // ============================================================
  // МЕТАДАННЫЕ ПОЛЕЙ (для рандомайзера)
  // ============================================================
  function _collectFields(ctx, schema, prefix, out, depth) {
    if (depth > MAX_DEPTH) return;
    const s = _flatten(ctx, schema, depth);
    if (!s) return;

    const type = s.type || (s.properties ? "object" : "string");

    if (type === "object") {
      const props = s.properties || {};
      const req = Array.isArray(s.required) ? s.required : [];
      Object.entries(props).forEach(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        const vs = _flatten(ctx, v, depth + 1) || {};
        const vType = vs.type || (vs.properties ? "object" : "string");

        // Поля только для чтения в запрос не отправляются — пропускаем,
        // иначе рандомайзер генерит для них значения впустую.
        if (vs.readOnly === true) return;

        if (vType === "object") {
          _collectFields(ctx, v, path, out, depth + 1);
        } else if (vType === "array") {
          // Массивы в шаблоне представлены одним элементом
          const items = _flatten(ctx, vs.items, depth + 1);
          if (items && (items.type === "object" || items.properties)) {
            _collectFields(ctx, vs.items, path + ".0", out, depth + 1);
          } else {
            out.push(_fieldMeta(path, k, items || {}, req.includes(k), true));
          }
        } else {
          out.push(_fieldMeta(path, k, vs, req.includes(k), false));
        }
      });
      return;
    }

    if (type === "array") {
      _collectFields(ctx, s.items, prefix, out, depth + 1);
    }
  }

  function _fieldMeta(path, key, s, required, isArray) {
    return {
      path, key,
      type: s.type || "string",
      format: s.format || "",
      required: !!required,
      isArray: !!isArray,
      enum: Array.isArray(s.enum) ? s.enum.slice() : null,
      minimum: typeof s.minimum === "number" ? s.minimum : null,
      maximum: typeof s.maximum === "number" ? s.maximum : null,
      minLength: typeof s.minLength === "number" ? s.minLength : null,
      maxLength: typeof s.maxLength === "number" ? s.maxLength : null,
      pattern: s.pattern || null,
      nullable: !!s.nullable,
      description: s.description || "",
    };
  }

  // ============================================================
  // ПРЕОБРАЗОВАНИЕ В КОЛЛЕКЦИЮ
  // ============================================================
  /**
   * Собрать коллекцию из разобранной спецификации.
   * @param parsed результат parseSwagger
   * @param opts {serverUrl, useBaseUrlVar, selected:Set<string>}
   */
  App.swaggerToCollection = function (parsed, opts) {
    opts = opts || {};
    const serverUrl = (opts.serverUrl || "").replace(/\/+$/, "");
    const useVar = opts.useBaseUrlVar !== false;
    const selected = opts.selected || null;

    const base = useVar ? "{{baseUrl}}" : serverUrl;
    const folders = {};
    const pathVarNames = new Set();

    parsed.endpoints.forEach((ep) => {
      const id = ep.method + " " + ep.path;
      if (selected && !selected.has(id)) return;

      // /users/{userId} → /users/{{userId}}, чтобы работали переменные приложения
      let url = base + ep.path.replace(/\{([^}]+)\}/g, (_, v) => {
        pathVarNames.add(v);
        return `{{${v}}}`;
      });

      // Query-параметры добавляем как строку запроса
      const q = ep.query.filter(p => p.required && p.value !== "");
      if (q.length) {
        url += "?" + q.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
      }

      const tag = ep.tags[0] || "default";
      if (!folders[tag]) folders[tag] = { name: tag, entity: null, items: [] };

      folders[tag].items.push({
        method: ep.method,
        name: _endpointName(ep),
        url,
        body: ep.body || undefined,
        // Метаданные схемы — рандомайзер берёт типы отсюда, а не угадывает
        schema: ep.fields && ep.fields.length ? { fields: ep.fields } : undefined,
      });
    });

    return {
      collection: {
        name: parsed.title + (parsed.apiVersion ? ` ${parsed.apiVersion}` : ""),
        builtin: false,
        folders: Object.values(folders).sort((a, b) => a.name.localeCompare(b.name)),
      },
      pathVars: [...pathVarNames],
      serverUrl,
    };
  };

  function _endpointName(ep) {
    if (ep.summary) return ep.summary.length > 60 ? ep.summary.slice(0, 57) + "..." : ep.summary;
    if (ep.operationId) return ep.operationId;
    return ep.path;
  }
})();
