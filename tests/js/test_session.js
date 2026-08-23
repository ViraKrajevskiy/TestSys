/**
 * tests/js/test_session.js
 * Сессия вкладок и защита переменных от undefined.
 *
 * Запуск: node tests/js/test_session.js
 */
const H = require("./_harness");
const { test, assert, assertEqual } = H;

// ─── pm.variables.set не должен писать "undefined" ────────────
function scriptCtx() {
  const ctx = H.makeContext();
  const A = H.load(ctx, "core/scripting.js");
  A.VARIABLES = {};
  A.saveCollections = () => {};
  return A;
}

test("значение undefined не записывается в переменную", () => {
  const A = scriptCtx();
  A.runScript('pm.variables.set("token", pm.response.json().access);',
    { source: "test", tab: {}, response: { status_code: 404, text: '{"detail":"no"}' } });
  assertEqual(A.VARIABLES.token, undefined, "в переменной не должно быть строки undefined");
});

test("про пропуск сообщается в консоли скриптов", () => {
  const A = scriptCtx();
  A.runScript('pm.variables.set("x", undefined);',
    { source: "test", tab: {}, response: { status_code: 200, text: "{}" } });
  const said = A.scriptConsole.get().some(e => String(e.text).includes("значение пустое"));
  assert(said, "пользователь должен увидеть предупреждение");
});

test("нормальное значение записывается", () => {
  const A = scriptCtx();
  A.runScript('pm.variables.set("token", pm.response.json().access);',
    { source: "test", tab: {}, response: { status_code: 200, text: '{"access":"JWT"}' } });
  assertEqual(A.VARIABLES.token, "JWT");
});

test("пустая строка — осознанное значение, пишется", () => {
  const A = scriptCtx();
  A.runScript('pm.variables.set("y", "");',
    { source: "test", tab: {}, response: { status_code: 200, text: "{}" } });
  assertEqual(A.VARIABLES.y, "");
});

// ─── Синхронизация не должна отдавать секреты ─────────────────
test("секретные переменные не уходят в синхронизацию", () => {
  const ctx = H.makeContext();
  const A = H.load(ctx, "features/sync.js");
  const secrets = A.syncSecretVars({
    baseUrl: "http://x", token: "T", password: "p", refresh: "R",
    apiKey: "k", userId: "1", sessionId: "s",
  });
  ["token", "password", "refresh", "apiKey", "sessionId"].forEach(k =>
    assert(secrets.includes(k), `${k} должен считаться секретом`));
  ["baseUrl", "userId"].forEach(k =>
    assert(!secrets.includes(k), `${k} секретом не является`));
});

(async () => {
  await H.run("СЕССИЯ И ПЕРЕМЕННЫЕ");
  process.exit(H.summary() ? 0 : 1);
})();
