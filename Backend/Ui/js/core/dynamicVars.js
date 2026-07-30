/**
 * dynamicVars.js — Динамические переменные {{$randomEmail}}
 *
 * Пишутся прямо в URL, params, headers или body. Значение вычисляется
 * в момент отправки запроса — каждый повтор даёт новые данные.
 *
 *   {"email": "{{$randomEmail}}", "id": "{{$randomUUID}}"}
 *
 * Отличие от обычных {{baseUrl}}: те статичные из App.VARIABLES,
 * эти — с префиксом $ и генерируются заново при каждом вызове.
 */
window.App = window.App || {};

(function () {
  // ============================================================
  // ДАННЫЕ ДЛЯ ГЕНЕРАТОРОВ
  // ============================================================
  const FIRST_NAMES = ["John","Jane","Alice","Bob","Charlie","Diana","Ivan","Elena","Sergey","Anna","Max","Olga","Peter","Maria","Nikolai","Sofia"];
  const LAST_NAMES  = ["Doe","Smith","Johnson","Williams","Brown","Prince","Petrov","Volkova","Kozlov","Fischer","Ivanov","Novak"];
  const CITIES      = ["Moscow","London","New York","Berlin","Tokyo","Paris","Sydney","Toronto","Dubai","Singapore","Rome","Istanbul"];
  const COUNTRIES   = ["Russia","USA","UK","Germany","Japan","France","Australia","Canada","Italy","Spain"];
  const STREETS     = ["Main St","Oak Ave","Park Rd","Lenina","Tverskaya","Baker St","Broadway","Sunset Blvd"];
  const DOMAINS     = ["gmail.com","mail.com","example.com","test.org","company.io"];
  const COMPANIES   = ["Acme Corp","Globex","Initech","Umbrella","Stark Industries","Wayne Enterprises","Soylent"];
  const PRODUCTS    = ["Wireless Mouse","Laptop Stand","USB Hub","Monitor","Keyboard","Webcam","Headphones"];
  const STATUSES    = ["active","inactive","pending","approved","rejected","cancelled"];
  const LOREM_WORDS = ["lorem","ipsum","dolor","sit","amet","consectetur","adipiscing","elit","sed","tempor","labore","magna","aliqua"];
  const CURRENCIES  = ["USD","EUR","RUB","GBP","JPY","CNY"];
  const COLORS      = ["red","green","blue","yellow","purple","orange","black","white"];

  const rnd  = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const digits = (n) => { let s = ""; for (let i = 0; i < n; i++) s += rnd(10); return s; };
  const lower = (n) => { const c = "abcdefghijklmnopqrstuvwxyz"; let s = ""; for (let i = 0; i < n; i++) s += c[rnd(26)]; return s; };
  const between = (min, max) => min + rnd(max - min + 1);

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = rnd(16);
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function isoDate(offsetDays) {
    const d = new Date(Date.now() + offsetDays * 86400000);
    return d.toISOString().split("T")[0];
  }

  // ============================================================
  // РЕЕСТР ГЕНЕРАТОРОВ
  // ============================================================
  const GENERATORS = {
    // --- Личные данные ---
    randomFirstName:  { fn: () => pick(FIRST_NAMES),                     group: "person", ex: "John" },
    randomLastName:   { fn: () => pick(LAST_NAMES),                      group: "person", ex: "Smith" },
    randomFullName:   { fn: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, group: "person", ex: "John Smith" },
    randomUserName:   { fn: () => `${pick(FIRST_NAMES).toLowerCase()}${rnd(1000)}`, group: "person", ex: "john42" },
    randomEmail:      { fn: () => `${pick(FIRST_NAMES).toLowerCase()}.${lower(4)}@${pick(DOMAINS)}`, group: "person", ex: "john.abcd@mail.com" },
    randomPhone:      { fn: () => `+7-${digits(3)}-${digits(3)}-${digits(4)}`, group: "person", ex: "+7-912-345-6789" },
    randomPassword:   { fn: () => { const c = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%"; let s = ""; for (let i = 0; i < 12; i++) s += c[rnd(c.length)]; return s; }, group: "person", ex: "aB3!xY9pQ2w" },
    randomAge:        { fn: () => between(18, 80),                        group: "person", ex: "34" },

    // --- Адрес ---
    randomCity:       { fn: () => pick(CITIES),                          group: "address", ex: "Berlin" },
    randomCountry:    { fn: () => pick(COUNTRIES),                       group: "address", ex: "Germany" },
    randomStreet:     { fn: () => `${pick(STREETS)} ${between(1, 200)}`,  group: "address", ex: "Main St 42" },
    randomAddress:    { fn: () => `${pick(CITIES)}, ${pick(STREETS)} ${between(1, 200)}`, group: "address", ex: "Berlin, Oak Ave 17" },
    randomZipCode:    { fn: () => digits(6),                             group: "address", ex: "101000" },
    randomLatitude:   { fn: () => (Math.random() * 180 - 90).toFixed(6),  group: "address", ex: "55.751244" },
    randomLongitude:  { fn: () => (Math.random() * 360 - 180).toFixed(6), group: "address", ex: "37.618423" },

    // --- Интернет ---
    randomUrl:        { fn: () => `https://${lower(6)}.${pick(["com","org","io","dev"])}`, group: "internet", ex: "https://abcdef.io" },
    randomDomain:     { fn: () => `${lower(7)}.${pick(["com","net","org"])}`, group: "internet", ex: "example.com" },
    randomIP:         { fn: () => `${between(1,255)}.${rnd(256)}.${rnd(256)}.${between(1,254)}`, group: "internet", ex: "192.168.1.10" },
    randomIPv6:       { fn: () => Array.from({length:8}, () => rnd(65536).toString(16)).join(":"), group: "internet", ex: "2001:db8::1" },
    randomMAC:        { fn: () => Array.from({length:6}, () => rnd(256).toString(16).padStart(2,"0")).join(":"), group: "internet", ex: "a1:b2:c3:d4:e5:f6" },
    randomUserAgent:  { fn: () => (App.USER_AGENTS && App.USER_AGENTS.length > 1) ? pick(App.USER_AGENTS.slice(1)).value : "Mozilla/5.0", group: "internet", ex: "Mozilla/5.0 ..." },

    // --- Идентификаторы ---
    randomUUID:       { fn: uuid,                                        group: "id", ex: "3f2b...c8a1" },
    randomGUID:       { fn: uuid,                                        group: "id", ex: "3f2b...c8a1" },
    randomObjectId:   { fn: () => Array.from({length:24}, () => rnd(16).toString(16)).join(""), group: "id", ex: "507f1f77bcf86cd7" },
    randomInt:        { fn: () => between(1, 1000),                       group: "id", ex: "417" },
    randomBigInt:     { fn: () => between(100000, 999999999),             group: "id", ex: "84719203" },

    // --- Числа и деньги ---
    randomPrice:      { fn: () => (Math.random() * 1000).toFixed(2),      group: "number", ex: "249.99" },
    randomFloat:      { fn: () => (Math.random() * 100).toFixed(4),       group: "number", ex: "42.7391" },
    randomPercent:    { fn: () => between(0, 100),                        group: "number", ex: "73" },
    randomCurrency:   { fn: () => pick(CURRENCIES),                       group: "number", ex: "USD" },
    randomBoolean:    { fn: () => Math.random() > 0.5,                    group: "number", ex: "true" },

    // --- Дата и время ---
    randomDate:       { fn: () => isoDate(-rnd(365)),                     group: "date", ex: "2026-03-14" },
    randomFutureDate: { fn: () => isoDate(between(1, 365)),               group: "date", ex: "2027-01-20" },
    randomPastDate:   { fn: () => isoDate(-between(1, 3650)),             group: "date", ex: "2019-08-02" },
    randomDateTime:   { fn: () => new Date(Date.now() - rnd(31536000000)).toISOString(), group: "date", ex: "2026-05-01T12:30:00Z" },
    randomTimestamp:  { fn: () => Math.floor(Date.now() / 1000) - rnd(31536000), group: "date", ex: "1767225600" },
    timestamp:        { fn: () => Math.floor(Date.now() / 1000),          group: "date", ex: "текущий unix-time" },
    isoTimestamp:     { fn: () => new Date().toISOString(),               group: "date", ex: "текущее время ISO" },

    // --- Текст и бизнес ---
    randomWord:       { fn: () => pick(LOREM_WORDS),                      group: "text", ex: "lorem" },
    randomWords:      { fn: () => Array.from({length: between(3,8)}, () => pick(LOREM_WORDS)).join(" "), group: "text", ex: "lorem ipsum dolor" },
    randomSentence:   { fn: () => { const w = Array.from({length: between(5,12)}, () => pick(LOREM_WORDS)).join(" "); return w[0].toUpperCase() + w.slice(1) + "."; }, group: "text", ex: "Lorem ipsum dolor sit." },
    randomCompany:    { fn: () => pick(COMPANIES),                        group: "text", ex: "Acme Corp" },
    randomProduct:    { fn: () => pick(PRODUCTS),                         group: "text", ex: "Wireless Mouse" },
    randomStatus:     { fn: () => pick(STATUSES),                         group: "text", ex: "active" },
    randomColor:      { fn: () => pick(COLORS),                           group: "text", ex: "blue" },
    randomHexColor:   { fn: () => "#" + rnd(16777216).toString(16).padStart(6, "0"), group: "text", ex: "#3fa9c8" },
  };

  // ============================================================
  // РЕЗОЛВ
  // ============================================================
  const RE = /\{\{\$(\w+)\}\}/g;

  /**
   * Подставить динамические переменные в строку.
   * Каждое вхождение вычисляется отдельно — два {{$randomEmail}}
   * в одном теле дадут два разных адреса.
   */
  App.resolveDynamic = function (str) {
    if (!str || typeof str !== "string") return str;
    return str.replace(RE, (full, name) => {
      const gen = GENERATORS[name];
      if (!gen) return full;              // неизвестное имя оставляем как есть
      try {
        return String(gen.fn());
      } catch (e) {
        if (App.logWarn) App.logWarn("DynamicVars", `Генератор ${name}: ${e.message}`);
        return full;
      }
    });
  };

  /** Полный резолв: сначала статические {{baseUrl}}, затем динамические {{$...}} */
  App.resolveAll = function (str) {
    return App.resolveDynamic(App.resolveVariables(str));
  };

  /** Есть ли в строке динамические переменные */
  App.hasDynamic = function (str) {
    if (!str || typeof str !== "string") return false;
    RE.lastIndex = 0;
    return RE.test(str);
  };

  /** Найти неизвестные переменные — для подсветки ошибок */
  App.findUnknownDynamic = function (str) {
    const bad = [];
    if (!str || typeof str !== "string") return bad;
    let m;
    RE.lastIndex = 0;
    while ((m = RE.exec(str)) !== null) {
      if (!GENERATORS[m[1]] && !bad.includes(m[1])) bad.push(m[1]);
    }
    return bad;
  };

  // ============================================================
  // СПРАВОЧНИК (для UI-подсказки)
  // ============================================================
  App.DYNAMIC_GROUPS = {
    person:   "Личные данные",
    address:  "Адрес",
    internet: "Интернет",
    id:       "Идентификаторы",
    number:   "Числа",
    date:     "Дата и время",
    text:     "Текст",
  };

  App.getDynamicList = function () {
    return Object.entries(GENERATORS).map(([name, g]) => ({
      name, group: g.group, example: g.ex,
      token: `{{$${name}}}`,
    }));
  };

  App.getDynamicNames = function () { return Object.keys(GENERATORS); };

  /** Предпросмотр: показать, во что развернётся строка */
  App.previewDynamic = function (str) { return App.resolveAll(str); };

  // ============================================================
  // ПОДБОР ПЕРЕМЕННОЙ ПОД ПОЛЕ
  // ============================================================
  /** Какая переменная лучше всего подходит полю с таким именем и значением */
  App.suggestDynamicVar = function (key, value) {
    const k = (key || "").toLowerCase();

    if (k.includes("email") || k.includes("mail")) return "randomEmail";
    if (k.includes("password") || k.includes("pass")) return "randomPassword";
    if (k.includes("phone") || k.includes("tel")) return "randomPhone";
    if (k.includes("username") || k.includes("login")) return "randomUserName";
    if (k.includes("firstname")) return "randomFirstName";
    if (k.includes("lastname") || k.includes("surname")) return "randomLastName";
    if (k.includes("company") || k.includes("organization")) return "randomCompany";
    if (k.includes("city")) return "randomCity";
    if (k.includes("country")) return "randomCountry";
    if (k.includes("street") || k.includes("address")) return "randomAddress";
    if (k.includes("zip") || k.includes("postal")) return "randomZipCode";
    if (k.includes("url") || k.includes("website") || k.includes("site") || k.includes("link")) return "randomUrl";
    if (k.includes("domain")) return "randomDomain";
    if (k.includes("uuid") || k.includes("guid")) return "randomUUID";
    if (k.includes("status") || k === "state") return "randomStatus";
    if (k.includes("color") || k.includes("colour")) return "randomColor";
    if (k.includes("currency")) return "randomCurrency";
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("cost")) return "randomPrice";
    if (k.includes("age")) return "randomAge";
    if (k.includes("ip")) return "randomIP";
    if (k.includes("description") || k.includes("comment") || k.includes("bio") || k.includes("note")) return "randomSentence";
    if (k.includes("title") || k.includes("product")) return "randomProduct";
    if (k.includes("name")) return "randomFullName";
    if (k.includes("created") || k.includes("updated") || k.includes("datetime")) return "randomDateTime";
    if (k.includes("date")) return "randomDate";
    if (k.includes("time")) return "randomTimestamp";
    if (k === "id" || k.endsWith("id") || k.endsWith("Id")) {
      return typeof value === "number" ? "randomInt" : "randomUUID";
    }

    // По типу значения, если имя ничего не подсказало
    if (typeof value === "boolean") return "randomBoolean";
    if (typeof value === "number") {
      return Number.isInteger(value) ? "randomInt" : "randomPrice";
    }
    return "randomWord";
  };

  /** Числовые генераторы — их значения не берутся в кавычки */
  const NUMERIC = ["randomInt", "randomBigInt", "randomPrice", "randomFloat",
                   "randomPercent", "randomAge", "randomTimestamp", "randomBoolean"];

  App.isNumericDynamic = function (name) { return NUMERIC.includes(name); };

  /**
   * Разложить JSON на плоский список полей с подобранными переменными.
   * @returns [{path, key, value, suggested, isNumeric}]
   */
  App.analyzeJsonForVars = function (obj, prefix = "", out = []) {
    if (!obj || typeof obj !== "object") return out;

    Object.keys(obj).forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];

      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        App.analyzeJsonForVars(val, path, out);
      } else if (Array.isArray(val)) {
        // Массивы примитивов — подставляем в первый элемент
        if (val.length && typeof val[0] !== "object") {
          const s = App.suggestDynamicVar(key, val[0]);
          out.push({ path: path + ".0", key, value: val[0], suggested: s,
                     isNumeric: App.isNumericDynamic(s) });
        }
      } else {
        const s = App.suggestDynamicVar(key, val);
        out.push({ path, key, value: val, suggested: s,
                   isNumeric: App.isNumericDynamic(s) });
      }
    });
    return out;
  };

  /**
   * Подставить переменные в JSON.
   * @param obj        исходный объект
   * @param selections {path: varName} — какие поля чем заменить
   * @returns строка JSON, где числовые переменные без кавычек
   */
  App.fillJsonWithVars = function (obj, selections) {
    const result = JSON.parse(JSON.stringify(obj));
    const numericPaths = [];

    Object.entries(selections).forEach(([path, varName]) => {
      if (!varName) return;
      _setPath(result, path, `{{$${varName}}}`);
      if (App.isNumericDynamic(varName)) numericPaths.push(varName);
    });

    let json = JSON.stringify(result, null, 2);

    // Числа и булевы не должны быть строками — иначе сервер отвергнет тип
    if (numericPaths.length) {
      const uniq = [...new Set(numericPaths)];
      const re = new RegExp(`"(\\{\\{\\$(?:${uniq.join("|")})\\}\\})"`, "g");
      json = json.replace(re, "$1");
    }
    return json;
  };

  function _setPath(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      // Индексы массивов приходят как числа в строке
      cur = cur[k];
      if (cur === undefined || cur === null) return;
    }
    cur[keys[keys.length - 1]] = value;
  }
})();
