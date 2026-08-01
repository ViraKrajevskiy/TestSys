window.App = window.App || {};

App.state = {
  tabs: [],
  activeTabId: null,
  nextId: 1,
  isDetachedWindow: false,
  expandedFolders: { "JSONPlaceholder::Users": true },
  // Коллекции по умолчанию развёрнуты. Свёрнутые кладём сюда как true.
  collapsedCollections: {},
};

// ============================================================
// LIMITS — защита от перегрузки
// ============================================================
App.LIMITS = {
  MAX_TABS:          20,
  MAX_PARAMS:        50,
  MAX_HEADERS:       50,
  MAX_BODY_LENGTH:   500000,
  MAX_URL_LENGTH:    2048,
  MAX_RESPONSE_DISPLAY: 1000000,
  MAX_BATCH_GENERATE: 500,
};

App.VARIABLES = {
  baseUrl: "http://localhost:8000",
  userId: "1",
};

App.USER_BODY_TEMPLATE = JSON.stringify({
  name: "John Doe",
  username: "johnd",
  email: "john@example.com",
  phone: "1-234-567-8900",
  website: "johndoe.com",
}, null, 2);

// ============================================================
// DEFAULT COLLECTIONS (read-only examples)
// ============================================================
App.DEFAULT_COLLECTIONS = [
  {
    name: "JSONPlaceholder",
    builtin: true,
    folders: [
      {
        name: "Users",
        entity: "user",
        items: [
          { method: "GET", name: "List All", url: "{{baseUrl}}/users", crud: "list" },
          { method: "GET", name: "Get by ID", url: "{{baseUrl}}/users/{{userId}}", crud: "read" },
          { method: "POST", name: "Create", url: "{{baseUrl}}/users", crud: "create", body: App.USER_BODY_TEMPLATE },
          { method: "PUT", name: "Update", url: "{{baseUrl}}/users/{{userId}}", crud: "update", body: App.USER_BODY_TEMPLATE },
          { method: "DELETE", name: "Delete", url: "{{baseUrl}}/users/{{userId}}", crud: "delete" },
        ],
      },
    ],
  },
];

// User collections (editable, persisted)
App.USER_COLLECTIONS = [];

// Merged getter — default + user
Object.defineProperty(App, "COLLECTIONS", {
  get() { return App.DEFAULT_COLLECTIONS.concat(App.USER_COLLECTIONS); },
});

// ============================================================
// COLLECTIONS CRUD
// ============================================================
App.addCollection = function (name) {
  if (!name || !name.trim()) return null;
  // Имена уникальны: ключи раскрытия папок строятся как "Коллекция::Папка",
  // при совпадении имён состояние папок пересекалось бы.
  const col = { name: _uniqueName(name.trim()), builtin: false, folders: [] };
  App.USER_COLLECTIONS.push(col);
  App.saveCollections();
  App.renderCollections();
  return col;
};

App.renameCollection = function (colIdx, newName) {
  const col = App.USER_COLLECTIONS[colIdx];
  if (!col || col.builtin) return;
  const oldName = col.name;
  const wanted = newName.trim();
  if (!wanted || wanted === oldName) return;
  // Исключаем саму себя из проверки уникальности
  const others = App.COLLECTIONS.filter(c => c !== col).map(c => c.name);
  let unique = wanted, i = 2;
  while (others.includes(unique)) unique = `${wanted} (${i++})`;
  col.name = unique;
  // Ключи раскрытых папок содержат имя коллекции — переносим,
  // иначе после переименования все папки схлопываются.
  _renameFolderKeys(oldName, col.name);
  App.saveCollections();
  App.renderCollections();
};

function _renameFolderKeys(oldCol, newCol) {
  const ex = App.state.expandedFolders;
  Object.keys(ex).forEach((k) => {
    if (k.startsWith(oldCol + "::")) {
      ex[newCol + "::" + k.slice(oldCol.length + 2)] = ex[k];
      delete ex[k];
    }
  });
}

App.deleteCollection = function (colIdx) {
  const col = App.USER_COLLECTIONS[colIdx];
  if (!col || col.builtin) return;
  App.USER_COLLECTIONS.splice(colIdx, 1);
  App.saveCollections();
  App.renderCollections();
};

App.addFolder = function (col, folderName) {
  if (!folderName || !folderName.trim() || col.builtin) return;
  const name = _uniqueFolderName(col, folderName.trim());
  col.folders.push({ name, entity: null, items: [] });
  App.state.expandedFolders[col.name + "::" + name] = true;  // новая папка открыта
  App.saveCollections();
  App.renderCollections();
};

App.renameFolder = function (col, folderIdx, newName) {
  if (col.builtin) return;
  const folder = col.folders[folderIdx];
  if (!folder) return;
  const oldKey = col.name + "::" + folder.name;
  folder.name = _uniqueFolderName(col, newName.trim(), folderIdx);
  const newKey = col.name + "::" + folder.name;
  if (oldKey in App.state.expandedFolders) {
    App.state.expandedFolders[newKey] = App.state.expandedFolders[oldKey];
    delete App.state.expandedFolders[oldKey];
  }
  App.saveCollections();
  App.renderCollections();
};

/** Папки внутри коллекции не должны дублироваться — иначе путаются ключи раскрытия */
function _uniqueFolderName(col, name, skipIdx) {
  const taken = col.folders
    .filter((_, i) => i !== skipIdx)
    .map(f => f.name);
  if (!taken.includes(name)) return name;
  let i = 2;
  while (taken.includes(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

App.deleteFolder = function (col, folderIdx) {
  if (col.builtin) return;
  col.folders.splice(folderIdx, 1);
  App.saveCollections();
  App.renderCollections();
};

App.addRequest = function (folder, entry) {
  folder.items.push(entry);
  App.saveCollections();
  App.renderCollections();
};

App.editRequest = function (folder, itemIdx, updates) {
  Object.assign(folder.items[itemIdx], updates);
  App.saveCollections();
  App.renderCollections();
};

App.deleteRequest = function (folder, itemIdx) {
  folder.items.splice(itemIdx, 1);
  App.saveCollections();
  App.renderCollections();
};

// ============================================================
// SAVE / LOAD COLLECTIONS
// ============================================================
let _syncPushTimer = null;

App.saveCollections = async function () {
  if (window.pywebview && window.pywebview.api) {
    try {
      // Сохраняем коллекции ВМЕСТЕ с переменными — раньше переменные жили
      // только в памяти и терялись при перезапуске.
      const payload = {
        version: 2,
        collections: App.USER_COLLECTIONS.map(c => ({ name: c.name, folders: c.folders })),
        variables: App.VARIABLES,
      };
      await window.pywebview.api.save_collections(JSON.stringify(payload));
    } catch (e) { console.warn("[Collections] save error:", e); }
  }

  // Автоотправка в общий доступ (с задержкой, чтобы не спамить при серии правок)
  if (App.getSetting && App.getSetting("syncMode") !== "local" && App.syncPush) {
    clearTimeout(_syncPushTimer);
    _syncPushTimer = setTimeout(() => {
      App.syncPushWithConflictUI ? App.syncPushWithConflictUI() : App.syncPush();
    }, 1200);
  }
};

App.loadCollections = async function () {
  // Wait for pywebview API (same pattern as settings/theme)
  const api = await new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.pywebview && window.pywebview.api) { clearInterval(iv); resolve(window.pywebview.api); }
      else if (Date.now() - start > 3000) { clearInterval(iv); resolve(null); }
    }, 100);
  });
  if (!api) return;
  try {
    const raw = await api.load_collections();
    if (!raw) return;
    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      // Старый формат — голый массив коллекций (без переменных)
      App.USER_COLLECTIONS = data;
    } else if (data && Array.isArray(data.collections)) {
      // Новый формат: {collections, variables}
      App.USER_COLLECTIONS = data.collections;
      if (data.variables && typeof data.variables === "object") {
        // Сохранённые переменные имеют приоритет, дефолтные остаются как запасные
        App.VARIABLES = Object.assign({}, App.VARIABLES, data.variables);
      }
    } else {
      return;
    }
    App.USER_COLLECTIONS.forEach(c => { c.builtin = false; c.folders = c.folders || []; });
  } catch (e) { console.warn("[Collections] load error:", e); }
};

// ============================================================
// EXPORT / IMPORT COLLECTIONS
// ============================================================
App.COLLECTION_FORMAT_VERSION = 1;

/** Собрать объект для экспорта. col = null → экспорт всех пользовательских коллекций */
App.buildExportPayload = function (col) {
  return {
    testsys_collection: App.COLLECTION_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    variables: Object.assign({}, App.VARIABLES),
    collections: col ? [_stripCollection(col)] : App.USER_COLLECTIONS.map(_stripCollection),
  };
};

function _stripCollection(c) {
  return { name: c.name, folders: JSON.parse(JSON.stringify(c.folders || [])) };
}

/** Экспорт: col = объект коллекции или null (все) */
App.exportCollections = async function (col) {
  const payload = App.buildExportPayload(col);
  const json = JSON.stringify(payload, null, 2);
  const filename = (col ? col.name.replace(/[^\w\-]+/g, "_") : "testsys_collections") + ".json";

  // Через pywebview — нативный диалог сохранения
  if (window.pywebview?.api?.export_collection_file) {
    const res = await window.pywebview.api.export_collection_file(filename, json);
    if (res?.ok) return { ok: true, path: res.path };
    if (res?.cancelled) return { ok: false, cancelled: true };
    return { ok: false, error: res?.error || "Ошибка экспорта" };
  }

  // Fallback — скачивание через браузер
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return { ok: true };
};

/** Разбор содержимого файла → массив коллекций (нативный формат TestSys + совместимый) */
App.parseImportPayload = function (raw) {
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { return { ok: false, error: "Файл не является валидным JSON" }; }

  // Определяем совместимый формат коллекций (info.schema + item[])
  const info = data && data.info;
  if (info && Array.isArray(data.item)) {
    return _fromExternalFormat(data);
  }

  let cols = [];
  let vars = null;

  if (data && Array.isArray(data.collections)) {
    cols = data.collections;
    vars = data.variables || null;
  } else if (Array.isArray(data)) {
    cols = data;                     // голый массив коллекций
  } else if (data && data.name && Array.isArray(data.folders)) {
    cols = [data];                   // одна коллекция без обёртки
  } else {
    return { ok: false, error: "Не распознан формат файла коллекции" };
  }

  // Валидация структуры
  const valid = cols.filter(c => c && typeof c.name === "string" && Array.isArray(c.folders));
  if (!valid.length) return { ok: false, error: "В файле нет корректных коллекций" };

  return { ok: true, collections: valid, variables: vars };
};

/**
 * Импорт из совместимого формата (info + item[]) в наш нативный формат.
 * Структура: info.name + item[]. Каждый item — либо папка (item[] внутри),
 * либо request. Разворачиваем в { name, folders:[{name, items:[]}] }.
 * Вложенные папки схлопываем до одного уровня через " / " в имени.
 */
function _fromExternalFormat(src) {
  const colName = (src.info && src.info.name) || "Imported collection";
  const folders = [];

  const walk = (nodes, path) => {
    const localReqs = [];
    (nodes || []).forEach(n => {
      if (n.request) localReqs.push(_externalItemToRequest(n));
      else if (Array.isArray(n.item)) walk(n.item, path.concat(n.name || "folder"));
    });
    if (localReqs.length) {
      folders.push({ name: path.join(" / ") || "root", items: localReqs });
    }
  };
  walk(src.item || [], []);

  const vars = {};
  (src.variable || []).forEach(v => { if (v && v.key) vars[v.key] = v.value != null ? String(v.value) : ""; });

  return {
    ok: true,
    collections: [{ name: colName, folders: folders.length ? folders : [{ name: "root", items: [] }] }],
    variables: Object.keys(vars).length ? vars : null,
  };
}

function _externalItemToRequest(item) {
  const r = item.request || {};
  const method = (typeof r === "string") ? "GET" : (r.method || "GET").toUpperCase();

  let url = "";
  if (typeof r.url === "string") url = r.url;
  else if (r.url) {
    if (typeof r.url.raw === "string") url = r.url.raw;
    else {
      const host = Array.isArray(r.url.host) ? r.url.host.join(".") : (r.url.host || "");
      const path = Array.isArray(r.url.path) ? r.url.path.join("/") : (r.url.path || "");
      url = host + (path ? "/" + path : "");
    }
  }

  const headers = (r.header || []).filter(h => !h.disabled).map(h => ({
    key: h.key || "", value: h.value != null ? String(h.value) : "", enabled: true,
  }));

  let body = "";
  if (r.body) {
    if (r.body.mode === "raw") body = r.body.raw || "";
    else if (r.body.mode === "urlencoded" && Array.isArray(r.body.urlencoded)) {
      body = r.body.urlencoded.filter(p => !p.disabled)
        .map(p => encodeURIComponent(p.key) + "=" + encodeURIComponent(p.value || "")).join("&");
    }
  }

  // Скрипты переносим 1:1 — тот же pm.* API
  let preScript = "", testScript = "";
  (item.event || []).forEach(ev => {
    const code = (ev.script && ev.script.exec) ? ev.script.exec.join("\n") : "";
    if (ev.listen === "prerequest") preScript = code;
    else if (ev.listen === "test")  testScript = code;
  });

  return {
    name: item.name || method + " request",
    method, url, body,
    headers: headers.length ? headers : [{ key: "", value: "", enabled: true }],
    params: [{ key: "", value: "", enabled: true }],
    preScript, testScript,
  };
}

/** Импорт: добавляет коллекции, разрешая конфликты имён */
App.importCollections = async function (opts) {
  const mergeVars = opts && opts.mergeVariables;
  let raw = opts && opts.raw;

  if (!raw) {
    if (window.pywebview?.api?.import_collection_file) {
      const res = await window.pywebview.api.import_collection_file();
      if (res?.cancelled) return { ok: false, cancelled: true };
      if (!res?.ok) return { ok: false, error: res?.error || "Ошибка чтения файла" };
      raw = res.content;
    } else {
      return { ok: false, error: "Диалог файлов недоступен" };
    }
  }

  const parsed = App.parseImportPayload(raw);
  if (!parsed.ok) return parsed;

  const added = [];
  parsed.collections.forEach((c) => {
    const col = { name: _uniqueName(c.name), builtin: false, folders: c.folders };
    App.USER_COLLECTIONS.push(col);
    added.push(col.name);
  });

  if (mergeVars && parsed.variables) {
    Object.entries(parsed.variables).forEach(([k, v]) => {
      if (!(k in App.VARIABLES)) App.VARIABLES[k] = v;
    });
  }

  App.saveCollections();
  App.renderCollections();
  return { ok: true, added };
};

function _uniqueName(name) {
  const taken = App.COLLECTIONS.map(c => c.name);
  if (!taken.includes(name)) return name;
  let i = 2;
  while (taken.includes(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

// ============================================================
// METRICS HISTORY
// ============================================================
App.metricsHistory = [];
App.METRICS_MAX = 500;          // переопределяется настройкой maxMetrics

let _metricsSaveTimer = null;

App.recordMetric = function (entry) {
  // entry: {method, url, status, elapsed_ms, size, timestamp, ok}
  App.metricsHistory.push(entry);
  const limit = App.METRICS_MAX || 500;
  while (App.metricsHistory.length > limit) App.metricsHistory.shift();

  // Пишем на диск с задержкой — иначе серия запросов устроит шторм записей
  clearTimeout(_metricsSaveTimer);
  _metricsSaveTimer = setTimeout(App.saveMetrics, 1500);
};

App.saveMetrics = async function () {
  if (!(window.pywebview && window.pywebview.api && window.pywebview.api.save_metrics)) return;
  try {
    await window.pywebview.api.save_metrics(JSON.stringify(App.metricsHistory));
  } catch (e) { console.warn("[Metrics] save error:", e); }
};

App.loadMetrics = async function () {
  if (!(window.pywebview && window.pywebview.api && window.pywebview.api.load_metrics)) return;
  try {
    const raw = await window.pywebview.api.load_metrics();
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      App.metricsHistory = data.slice(-(App.METRICS_MAX || 500));
    }
  } catch (e) { console.warn("[Metrics] load error:", e); }
};

App.clearMetrics = async function () {
  App.metricsHistory = [];
  await App.saveMetrics();
};

// ============================================================
// METHOD COLORS
// ============================================================
App.METHOD_COLOR_VAR = {
  GET: "--method-get",
  POST: "--method-post",
  PUT: "--method-put",
  PATCH: "--method-patch",
  DELETE: "--method-delete",
  USERS: "--method-post",
  RANDOMIZER: "--accent",
};

App.USER_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "username", label: "Username", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
];

// ============================================================
// POPULAR USER AGENTS
// ============================================================
App.USER_AGENTS = [
  { label: "Default (none)", value: "" },
  { label: "Chrome 120 (Win)", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  { label: "Chrome 120 (Mac)", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  { label: "Firefox 121 (Win)", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0" },
  { label: "Safari 17 (Mac)", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15" },
  { label: "Edge 120 (Win)", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0" },
  { label: "iPhone Safari", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1" },
  { label: "Android Chrome", value: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36" },
  { label: "curl/8.4.0", value: "curl/8.4.0" },
  { label: "TestSys", value: "TestSys/1.0" },
  { label: "Python requests", value: "python-requests/2.31.0" },
  { label: "Googlebot", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
];
