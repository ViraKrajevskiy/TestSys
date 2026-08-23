/**
 * tests/js/test_auth.js
 * Наследование авторизации (запрос → папка → коллекция) и авто-обновление
 * токена при 401.
 *
 * Здесь ловились реальные баги: пустая переменная молча отключала заголовок,
 * а обёртка над sendRequest теряла флаг повтора и устраивала бесконечный цикл.
 *
 * Запуск: node tests/js/test_auth.js
 */
const H = require("./_harness");
const { test, assert, assertEqual } = H;

function setup() {
  const ctx = H.makeContext();
  const A = H.load(ctx, "features/authTab.js");

  A.COLLECTIONS = [{
    name: "API",
    auth: { type: "bearer", bearer: { token: "{{token}}" }, basic: {}, apikey: {} },
    tokenRefresh: {
      enabled: true, method: "POST", url: "{{baseUrl}}/auth/refresh/",
      body: '{"refresh":"{{refresh}}"}', tokenPath: "access", tokenVar: "token",
    },
    folders: [
      { name: "public", items: [] },
      { name: "admin", auth: { type: "basic", basic: { username: "root", password: "pw" }, bearer: {}, apikey: {} }, items: [] },
    ],
  }];
  A.VARIABLES = { baseUrl: "http://api.test", token: "T0", refresh: "R0" };
  A.resolveAll = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in A.VARIABLES ? A.VARIABLES[k] : m));
  A.resolveVariables = A.resolveAll;
  A.saveCollections = () => {};
  A.renderCollections = () => {};
  A.logWarn = () => {};
  return { ctx, A };
}

const tab = (folder, auth) => ({
  collectionName: "API", folderName: folder,
  auth: auth || { type: "inherit", bearer: {}, basic: {}, apikey: {} },
});

// ─── Наследование ─────────────────────────────────────────────
test("запрос наследует Bearer от коллекции", () => {
  const { A } = setup();
  const h = {};
  A.applyAuthToRequest(tab("public"), h, {}, A.resolveAll);
  assertEqual(h.Authorization, "Bearer T0");
});

test("папка перебивает коллекцию", () => {
  const { A } = setup();
  const eff = A.resolveEffectiveAuth(tab("admin"));
  assertEqual(eff.source, "folder");
  assertEqual(eff.label, "admin");
});

test("своя авторизация запроса перебивает всех", () => {
  const { A } = setup();
  const own = { type: "bearer", bearer: { token: "OWN" }, basic: {}, apikey: {} };
  const h = {};
  A.applyAuthToRequest(tab("admin", own), h, {}, A.resolveAll);
  assertEqual(h.Authorization, "Bearer OWN");
});

test("No Auth на запросе отключает наследование", () => {
  const { A } = setup();
  const none = { type: "none", bearer: {}, basic: {}, apikey: {} };
  const h = {};
  A.applyAuthToRequest(tab("public", none), h, {}, A.resolveAll);
  assertEqual(h.Authorization, undefined);
});

test("вкладка без коллекции ничего не наследует", () => {
  const { A } = setup();
  assertEqual(A.resolveEffectiveAuth({ auth: { type: "inherit" } }).source, "none");
});

// ─── Диагностика 401 ──────────────────────────────────────────
test("пустая {{token}} распознаётся как причина 401", () => {
  const { A } = setup();
  A.VARIABLES.token = "";
  const d = A.authDiagnose(tab("public"));
  assert(d && d.title.includes("{{token}}"), "должна называть переменную");
  assert(d.hint.includes("login"), "должна советовать логин");
});

test("при заполненном токене претензий нет", () => {
  const { A } = setup();
  assertEqual(A.authDiagnose(tab("public")), null);
});

// ─── Авто-обновление токена ───────────────────────────────────
function withRefresh(refreshResponse) {
  const { ctx, A } = setup();
  const calls = { refresh: 0 };
  ctx.window.pywebview = { api: { send_request: async (m, u) => {
    calls.refresh++;
    return refreshResponse;
  } } };
  return { A, calls };
}

const OK_REFRESH = { ok: true, status_code: 200, text: '{"access":"NEW"}' };

test("refresh обновляет токен и возвращает true", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  assertEqual(await A.tryRefreshToken(tab("public")), true);
  assertEqual(A.VARIABLES.token, "NEW");
  assertEqual(calls.refresh, 1);
});

test("пять одновременных 401 дают ОДИН refresh", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  const res = await Promise.all([1, 2, 3, 4, 5].map(() => A.tryRefreshToken(tab("public"))));
  assert(res.every(Boolean), "все должны получить успех");
  assertEqual(calls.refresh, 1, "запрос должен уйти один раз");
});

test("пауза не даёт обновляться подряд", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  await A.tryRefreshToken(tab("public"));
  assertEqual(await A.tryRefreshToken(tab("public")), false);
  assertEqual(calls.refresh, 1);
});

test("после серии безрезультатных обновлений срабатывает предохранитель", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  A.resetTokenRefreshState();
  for (let i = 0; i < 3; i++) A.markRefreshIneffective();
  assertEqual(await A.tryRefreshToken(tab("public")), false);
  assertEqual(calls.refresh, 0);
});

test("сам refresh-запрос не запускает refresh (защита от рекурсии)", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  const selfTab = { collectionName: "API", folderName: "public",
                    url: "{{baseUrl}}/auth/refresh/",
                    auth: { type: "inherit", bearer: {}, basic: {}, apikey: {} } };
  assertEqual(await A.tryRefreshToken(selfTab), false);
  assertEqual(calls.refresh, 0);
});

test("refresh с ошибкой не притворяется успехом", async () => {
  const { A } = withRefresh({ ok: true, status_code: 401, text: '{"detail":"expired"}' });
  assertEqual(await A.tryRefreshToken(tab("public")), false);
});

test("сброс состояния снова разрешает обновление", async () => {
  const { A, calls } = withRefresh(OK_REFRESH);
  await A.tryRefreshToken(tab("public"));
  A.resetTokenRefreshState();
  assertEqual(await A.tryRefreshToken(tab("public")), true);
  assertEqual(calls.refresh, 2);
});

(async () => {
  await H.run("АВТОРИЗАЦИЯ: наследование и обновление токена");
  process.exit(H.summary() ? 0 : 1);
})();
