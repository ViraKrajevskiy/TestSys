/**
 * tests/js/test_curl.js
 * Тесты для App.parseCurl и App.toCurl (core/curl.js).
 * Запуск: node tests/js/test_curl.js
 */

// ─── Minimal App shim ─────────────────────────────────────────
const window = globalThis;
window.App = {};
window.btoa = (s) => Buffer.from(s, "binary").toString("base64");

// Загружаем модуль
const fs = require("fs");
const path = require("path");
const curlCode = fs.readFileSync(
  path.join(__dirname, "../../Backend/Ui/js/core/curl.js"), "utf8"
);
eval(curlCode);

// ─── Минималистичный test runner ──────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  ✓", name);
    passed++;
  } catch (e) {
    console.error("  ✗", name);
    console.error("    →", e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertIncludes(arr, val) {
  if (!arr.includes(val)) throw new Error(`expected [${arr}] to include "${val}"`);
}

// ─── parseCurl ────────────────────────────────────────────────
console.log("\nparseCurl:");

test("базовый GET", () => {
  const r = App.parseCurl("curl https://example.com/api");
  assert(r.ok, "ожидали ok=true");
  assertEqual(r.request.method, "GET");
  assertEqual(r.request.url, "https://example.com/api");
});

test("явный метод -X POST", () => {
  const r = App.parseCurl("curl -X POST https://api.example.com/users");
  assert(r.ok);
  assertEqual(r.request.method, "POST");
});

test("заголовки -H", () => {
  const r = App.parseCurl("curl https://ex.com -H 'Content-Type: application/json' -H 'Authorization: Bearer tok'");
  assert(r.ok);
  const keys = r.request.headers.map(h => h.key);
  assertIncludes(keys, "Content-Type");
  assertIncludes(keys, "Authorization");
});

test("тело -d переводит GET в POST", () => {
  const r = App.parseCurl(`curl https://api.ex.com/users -d '{"name":"Ivan"}'`);
  assert(r.ok);
  assertEqual(r.request.method, "POST");
  assert(r.request.body.includes("Ivan"), "body содержит данные");
});

test("--data-raw", () => {
  const r = App.parseCurl(`curl -X PUT https://ex.com/1 --data-raw '{"x":1}'`);
  assert(r.ok);
  assertEqual(r.request.method, "PUT");
  assert(r.request.body.length > 0);
});

test("query-параметры вытаскиваются из URL", () => {
  const r = App.parseCurl("curl 'https://ex.com/search?q=hello&page=2'");
  assert(r.ok);
  assertEqual(r.request.url, "https://ex.com/search");
  const params = r.request.params.map(p => p.key);
  assertIncludes(params, "q");
  assertIncludes(params, "page");
});

test("User-Agent -A", () => {
  const r = App.parseCurl("curl -A 'MyClient/1.0' https://ex.com/");
  assert(r.ok);
  assertEqual(r.request.userAgent, "MyClient/1.0");
});

test("-u basic auth → Authorization header", () => {
  const r = App.parseCurl("curl -u admin:secret https://ex.com/admin");
  assert(r.ok);
  const auth = r.request.headers.find(h => h.key === "Authorization");
  assert(auth, "должен быть Authorization");
  assert(auth.value.startsWith("Basic "), "должен быть Basic");
});

test("флаги без значений игнорируются (-k -L -s)", () => {
  const r = App.parseCurl("curl -k -L -s https://ex.com/");
  assert(r.ok);
  assertEqual(r.request.url, "https://ex.com/");
});

test("многострочный bash (backslash)", () => {
  const cmd = "curl -X POST \\\n  https://api.ex.com/data \\\n  -H 'Accept: application/json'";
  const r = App.parseCurl(cmd);
  assert(r.ok);
  assertEqual(r.request.method, "POST");
});

test("пустая строка → error", () => {
  const r = App.parseCurl("");
  assert(!r.ok, "пустая строка должна вернуть ошибку");
});

test("без URL → error", () => {
  const r = App.parseCurl("curl -X GET");
  assert(!r.ok, "команда без URL должна вернуть ошибку");
});

test("Content-Type auto-detect: JSON body", () => {
  const r = App.parseCurl(`curl -X POST https://ex.com -d '{"a":1}'`);
  assert(r.ok);
  const ct = r.request.headers.find(h => h.key === "Content-Type");
  assert(ct && ct.value === "application/json", "ожидали JSON content-type");
});

test("Content-Type auto-detect: form body", () => {
  const r = App.parseCurl("curl -X POST https://ex.com -d 'name=ivan&age=30'");
  assert(r.ok);
  const ct = r.request.headers.find(h => h.key === "Content-Type");
  assert(ct && ct.value === "application/x-www-form-urlencoded");
});

// ─── toCurl ───────────────────────────────────────────────────
console.log("\ntoCurl:");

function makeTab(overrides = {}) {
  return {
    method: "GET",
    url: "https://api.example.com/users",
    headers: [],
    params: [],
    body: "",
    userAgent: "",
    ...overrides,
  };
}

test("базовый GET", () => {
  const curl = App.toCurl(makeTab());
  assert(curl.includes("curl"), "содержит curl");
  assert(curl.includes("https://api.example.com/users"), "содержит URL");
});

test("POST с телом", () => {
  const curl = App.toCurl(makeTab({
    method: "POST",
    body: '{"name":"Ivan"}',
    headers: [{ key: "Content-Type", value: "application/json", enabled: true }],
  }));
  assert(curl.includes("-X POST") || curl.includes("--request POST"));
  assert(curl.includes('{"name":"Ivan"}'));
});

test("заголовки -H", () => {
  const curl = App.toCurl(makeTab({
    headers: [{ key: "Authorization", value: "Bearer xyz", enabled: true }],
  }));
  assert(curl.includes("Authorization"), "содержит заголовок");
  assert(curl.includes("Bearer xyz"));
});

test("отключённые заголовки пропускаются", () => {
  const curl = App.toCurl(makeTab({
    headers: [{ key: "X-Skip", value: "me", enabled: false }],
  }));
  assert(!curl.includes("X-Skip"), "отключённый заголовок не должен попасть в curl");
});

test("query-params добавляются к URL", () => {
  const curl = App.toCurl(makeTab({
    params: [
      { key: "page", value: "1", enabled: true },
      { key: "limit", value: "20", enabled: true },
    ],
  }));
  assert(curl.includes("page=1") && curl.includes("limit=20"));
});

test("User-Agent", () => {
  const curl = App.toCurl(makeTab({ userAgent: "TestSys/1.0" }));
  assert(curl.includes("TestSys/1.0"));
});

test("platform cmd: ^ вместо \\", () => {
  const curl = App.toCurl(makeTab({
    headers: [{ key: "X-H", value: "v", enabled: true }],
  }), { platform: "cmd" });
  assert(curl.includes("^") || curl.includes("\n"), "cmd-стиль перенос");
});

// ─── Итоги ────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Итого: ${passed} прошло, ${failed} провалено`);
if (failed > 0) process.exit(1);
