/**
 * tests/js/_harness.js
 * Общая обвязка для JS-тестов: мини-раннер и загрузчик модулей UI
 * в изолированный контекст (window === globalThis, как в браузере).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const UI = path.join(__dirname, "../../Backend/Ui/js");

/** Создаёт контекст, в котором `window.App = ...` даёт глобальный App. */
function makeContext(extra) {
  const ctx = Object.assign({
    console, JSON, Math, Date, Promise, setTimeout, clearTimeout,
    String, Number, Object, Array, Boolean, Error, RegExp, performance,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  }, extra || {});
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.document = {
    body: { insertAdjacentHTML() {} },
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} },
                            addEventListener() {}, appendChild() {}, querySelector: () => null }),
    addEventListener() {},
  };
  vm.createContext(ctx);
  return ctx;
}

/** Загружает файл из Backend/Ui/js в контекст. */
function load(ctx, relPath) {
  vm.runInContext(fs.readFileSync(path.join(UI, relPath), "utf8"), ctx, { filename: relPath });
  return ctx.App;
}

// ─── Раннер ───────────────────────────────────────────────────
let passed = 0, failed = 0;
const _pending = [];

function test(name, fn) { _pending.push({ name, fn }); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "условие не выполнено");
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "не совпало"}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

/** Прогоняет накопленные тесты (поддерживает async). */
async function run(title) {
  console.log(`\n${title}`);
  for (const { name, fn } of _pending) {
    try {
      await fn();
      console.log("  ✓", name);
      passed++;
    } catch (e) {
      console.error("  ✗", name);
      console.error("    →", e.message);
      failed++;
    }
  }
  _pending.length = 0;
}

function summary() {
  console.log(`\n${passed} пройдено, ${failed} провалено`);
  return failed === 0;
}

module.exports = { makeContext, load, test, assert, assertEqual, run, summary };
