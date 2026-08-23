/**
 * tests/js/test_schema_readonly.js
 * Импорт OpenAPI: поля readOnly не должны попадать в тело запроса.
 *
 * Сервер их не принимает (id, created_at, author и т.п.), а раньше они
 * подставлялись в шаблон и ломали POST/PUT ответом 400.
 *
 * Запуск: node tests/js/test_schema_readonly.js
 */
const H = require("./_harness");
const { test, assert, assertEqual } = H;

const SPEC = {
  openapi: "3.0.3",
  info: { title: "T", version: "1" },
  paths: {
    "/ratings/": { post: {
      operationId: "ratings_create",
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Rating" } } } },
      responses: { "201": { description: "" } },
    } },
    "/token/refresh/": { post: {
      operationId: "token_refresh",
      requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TokenRefresh" } } } },
      responses: { "200": { description: "" } },
    } },
  },
  components: { schemas: {
    Rating: {
      type: "object",
      properties: {
        id:      { type: "integer", readOnly: true },
        game:    { type: "integer" },
        author:  { type: "string",  readOnly: true },
        text:    { type: "string" },
        rating:  { type: "integer", minimum: 1, maximum: 5 },
        created: { type: "string", format: "date-time", readOnly: true },
      },
      required: ["game", "text", "rating"],
    },
    TokenRefresh: {
      type: "object",
      properties: {
        access:  { type: "string", readOnly: true },
        refresh: { type: "string" },
      },
      required: ["refresh"],
    },
  } },
};

function parse() {
  const ctx = H.makeContext();
  const A = H.load(ctx, "core/swagger.js");
  const parsed = A.parseSwagger(JSON.stringify(SPEC));
  // swaggerToCollection отдаёт {collection, pathVars, serverUrl}
  const { collection } = A.swaggerToCollection(parsed, {});
  return (collection.folders || []).flatMap(f => f.items || []);
}

test("readOnly-поля не попадают в тело", () => {
  const item = parse().find(i => i.url.includes("ratings"));
  const body = JSON.parse(item.body);
  ["id", "author", "created"].forEach(k =>
    assert(!(k in body), `поле ${k} должно быть исключено`));
});

test("обычные поля остаются", () => {
  const body = JSON.parse(parse().find(i => i.url.includes("ratings")).body);
  ["game", "text", "rating"].forEach(k =>
    assert(k in body, `поле ${k} должно остаться`));
});

test("minimum учитывается при генерации примера", () => {
  const body = JSON.parse(parse().find(i => i.url.includes("ratings")).body);
  assertEqual(body.rating, 1);
});

test("readOnly access не уезжает в refresh-запрос", () => {
  const body = JSON.parse(parse().find(i => i.url.includes("refresh")).body);
  assert(!("access" in body), "access — readOnly, слать его нельзя");
  assert("refresh" in body, "refresh должен остаться");
});

test("шаблон рандомайзера тоже без readOnly", () => {
  const item = parse().find(i => i.url.includes("ratings"));
  const paths = (item.schema.fields || []).map(f => f.path);
  ["id", "author", "created"].forEach(k =>
    assert(!paths.includes(k), `${k} не должен предлагаться для генерации`));
  ["game", "text", "rating"].forEach(k =>
    assert(paths.includes(k), `${k} должен предлагаться`));
});

(async () => {
  await H.run("ИМПОРТ OPENAPI: фильтр readOnly");
  process.exit(H.summary() ? 0 : 1);
})();
