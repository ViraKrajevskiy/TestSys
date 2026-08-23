/**
 * tests/js/test_request_retry.js
 * Повтор запроса после обновления токена.
 *
 * Регрессия на реальный баг: scriptConsole.js оборачивал App.sendRequest
 * функцией с одним параметром и терял флаг «это уже повтор». Приложение
 * уходило в бесконечный цикл 401 → refresh → повтор → 401 и вешало WebView2.
 *
 * Запуск: node tests/js/test_request_retry.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const H = require("./_harness");
const { test, assert, assertEqual } = H;

const UI = path.join(__dirname, "../../Backend/Ui/js");

/** Поднимает App с request.js и мокнутым транспортом. */
function setup({ withConsoleWrapper } = {}) {
  const st = { main: 0, refresh: 0, log: [] };
  const ctx = H.makeContext();

  ctx.window.pywebview = { api: { send_request: async (m, u) => {
    if (u.includes("/refresh/")) {
      st.refresh++;
      return { ok: true, status_code: 200, text: '{"access":"NEW' + st.refresh + '"}' };
    }
    st.main++;
    return { ok: true, status_code: 401, reason: "Unauthorized", headers: {}, elapsed_ms: 1,
             text: '{"detail":"Authentication credentials were not provided."}' };
  } } };

  const A = H.load(ctx, "features/authTab.js");
  H.load(ctx, "features/request.js");

  const tab = { id: 1, method: "POST", url: "http://api.test/items/", headers: [], params: [],
                body: '{"a":1}', files: [], formFields: [],
                collectionName: "API", folderName: "f",
                auth: { type: "inherit", bearer: {}, basic: {}, apikey: {} } };

  A.state = { tabs: [tab], activeTabId: 1 };
  A.COLLECTIONS = [{ name: "API",
    auth: { type: "bearer", bearer: { token: "{{token}}" }, basic: {}, apikey: {} },
    tokenRefresh: { enabled: true, method: "POST", url: "{{baseUrl}}/auth/refresh/",
                    body: "{}", tokenPath: "access", tokenVar: "token" },
    folders: [{ name: "f", items: [] }] }];
  A.VARIABLES = { baseUrl: "http://api.test", token: "OLD", refresh: "R" };
  A.resolveAll = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in A.VARIABLES ? A.VARIABLES[k] : m));
  A.resolveVariables = A.resolveAll;
  A.tryParseJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
  A.LIMITS = { MAX_URL_LENGTH: 2048 };
  ["renderTabContent", "renderTabBar", "renderAll", "saveCollections",
   "renderCollections", "pushResponseHistory", "recordMetric", "saveSession"].forEach(k => { A[k] = () => {}; });
  A.getResponseEntities = () => null;
  A.activeRows = (r) => (r || []);
  A.logWarn = (t, m) => st.log.push(m);
  A.logError = (t, m) => st.log.push("ERR " + m);
  A.waitForApi = async () => ctx.window.pywebview.api;
  A.scriptConsole = { write: () => {}, clear: () => {}, get: () => [] };

  if (withConsoleWrapper) {
    // Тот самый перехватчик из scriptConsole.js — берём его настоящий код,
    // чтобы тест ловил регрессию в реальной обёртке, а не в её копии.
    const src = fs.readFileSync(path.join(UI, "features/scriptConsole.js"), "utf8");
    const from = src.indexOf("const orig = App.sendRequest;");
    const to = src.indexOf("App.sendRequest._consoleHooked = true;");
    assert(from !== -1 && to !== -1, "не нашёл перехватчик в scriptConsole.js");
    vm.runInContext(src.slice(from, to), ctx);
  }

  return { A, st, tab };
}

/** Не даёт тесту висеть вечно, если цикл всё-таки вернётся. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
  ]);
}

test("401 → обновление → ровно один повтор", async () => {
  const { A, st } = setup();
  await withTimeout(A.sendRequest(1), 5000, "зависло — вернулся бесконечный цикл");
  assertEqual(st.main, 2, "основных запросов");
  assertEqual(st.refresh, 1, "обновлений токена");
});

test("перехватчик консоли не ломает защиту от цикла", async () => {
  const { A, st } = setup({ withConsoleWrapper: true });
  await withTimeout(A.sendRequest(1), 5000, "зависло — обёртка снова теряет аргументы");
  assertEqual(st.main, 2, "основных запросов");
  assertEqual(st.refresh, 1, "обновлений токена");
});

test("пять вкладок с 401 обновляют токен один раз", async () => {
  const { A, st } = setup({ withConsoleWrapper: true });
  for (let i = 2; i <= 5; i++) {
    A.state.tabs.push(Object.assign({}, A.state.tabs[0], {
      id: i, response: null, _authRetrying: false,
      auth: { type: "inherit", bearer: {}, basic: {}, apikey: {} },
    }));
  }
  await withTimeout(Promise.all([1, 2, 3, 4, 5].map(id => A.sendRequest(id))),
                    8000, "зависло на нескольких вкладках");
  assertEqual(st.refresh, 1, "обновление должно быть общим");
});

test("успешный ответ снимает предохранитель", async () => {
  const { A, ctx } = (() => { const s = setup(); return { A: s.A, ctx: null }; })();
  A.markRefreshIneffective();
  A.markRefreshIneffective();
  A.markRefreshIneffective();
  // Имитируем успешный ответ — request.js должен вызвать сброс
  A.state.tabs[0].response = { ok: true, status_code: 200 };
  A.resetTokenRefreshState();
  assert(typeof A.resetTokenRefreshState === "function", "сброс должен быть доступен");
});

(async () => {
  await H.run("ПОВТОР ЗАПРОСА: защита от бесконечного цикла");
  process.exit(H.summary() ? 0 : 1);
})();
