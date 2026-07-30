window.App = window.App || {};

App.state = {
  tabs: [],
  activeTabId: null,
  nextId: 1,
  isDetachedWindow: false,
  expandedFolders: { "JSONPlaceholder::Users": true },
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
  const col = { name: name.trim(), builtin: false, folders: [] };
  App.USER_COLLECTIONS.push(col);
  App.saveCollections();
  App.renderCollections();
  return col;
};

App.renameCollection = function (colIdx, newName) {
  const col = App.USER_COLLECTIONS[colIdx];
  if (!col || col.builtin) return;
  col.name = newName.trim();
  App.saveCollections();
  App.renderCollections();
};

App.deleteCollection = function (colIdx) {
  const col = App.USER_COLLECTIONS[colIdx];
  if (!col || col.builtin) return;
  App.USER_COLLECTIONS.splice(colIdx, 1);
  App.saveCollections();
  App.renderCollections();
};

App.addFolder = function (col, folderName) {
  if (!folderName || !folderName.trim() || col.builtin) return;
  col.folders.push({ name: folderName.trim(), entity: null, items: [] });
  App.saveCollections();
  App.renderCollections();
};

App.renameFolder = function (col, folderIdx, newName) {
  if (col.builtin) return;
  col.folders[folderIdx].name = newName.trim();
  App.saveCollections();
  App.renderCollections();
};

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
App.saveCollections = async function () {
  if (window.pywebview && window.pywebview.api) {
    try {
      await window.pywebview.api.save_collections(JSON.stringify(App.USER_COLLECTIONS));
    } catch (e) { console.warn("[Collections] save error:", e); }
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
    if (raw) {
      App.USER_COLLECTIONS = JSON.parse(raw);
      App.USER_COLLECTIONS.forEach(c => c.builtin = false);
    }
  } catch (e) { console.warn("[Collections] load error:", e); }
};

// ============================================================
// METRICS HISTORY
// ============================================================
App.metricsHistory = [];
App.METRICS_MAX = 200;

App.recordMetric = function (entry) {
  // entry: {method, url, status, elapsed_ms, size, timestamp, ok}
  App.metricsHistory.push(entry);
  if (App.metricsHistory.length > App.METRICS_MAX) App.metricsHistory.shift();
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
  { label: "Postman", value: "PostmanRuntime/7.35.0" },
  { label: "Python requests", value: "python-requests/2.31.0" },
  { label: "Googlebot", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
];
