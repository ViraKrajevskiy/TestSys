window.App = window.App || {};

/**
 * Дождаться конкретного метода pywebview API.
 *
 * ВАЖНО: проверять только window.pywebview.api нельзя — pywebview создаёт
 * объект api ДО того, как прикрепит к нему методы. Поллер ловил пустой
 * объект, и вызовы падали с "api.load_theme is not a function".
 * Поэтому ждём typeof конкретного метода === "function".
 *
 * @param method  имя метода, который реально нужен (например "load_collections")
 * @param timeout мс; по умолчанию 15000
 * @returns Promise<api|null>  null — метод так и не появился
 */
App.waitForApi = function (method, timeout = 15000) {
  const ready = () =>
    window.pywebview && window.pywebview.api &&
    typeof window.pywebview.api[method] === "function";

  return new Promise((resolve) => {
    if (ready()) return resolve(window.pywebview.api);
    const start = Date.now();
    // pywebviewready — штатное событие моста; ловим и его, и поллим
    const onReady = () => { if (ready()) done(window.pywebview.api); };
    window.addEventListener("pywebviewready", onReady);
    const iv = setInterval(() => {
      if (ready()) done(window.pywebview.api);
      else if (Date.now() - start > timeout) done(null);
    }, 100);
    function done(val) {
      clearInterval(iv);
      window.removeEventListener("pywebviewready", onReady);
      resolve(val);
    }
  });
};

App.escapeHtml = function (str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

App.escapeAttr = function (str) {
  return App.escapeHtml(str).replace(/"/g, "&quot;");
};

App.resolveVariables = function (str) {
  return String(str || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(App.VARIABLES, key) ? App.VARIABLES[key] : `{{${key}}}`;
  });
};

App.tryParseJson = function (text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

App.formatJson = function (text) {
  const parsed = App.tryParseJson(text);
  if (parsed === null) return text;
  return JSON.stringify(parsed, null, 2);
};

// ============================================================
// HTTP STATUS CODE MEANINGS
// ============================================================
App.STATUS_MEANINGS = {
  ru: {
    200: "Успешно", 201: "Создано", 202: "Принято", 204: "Нет содержимого",
    301: "Перемещено навсегда", 302: "Временное перенаправление", 304: "Не изменялось",
    400: "Неверный запрос", 401: "Не авторизован", 403: "Доступ запрещён",
    404: "Не найдено", 405: "Метод не разрешён", 408: "Таймаут запроса",
    409: "Конфликт", 413: "Тело слишком большое", 415: "Неподдерживаемый формат",
    422: "Ошибка валидации", 429: "Слишком много запросов",
    500: "Внутренняя ошибка сервера", 502: "Плохой шлюз",
    503: "Сервис недоступен", 504: "Таймаут шлюза",
  },
  en: {
    200: "OK", 201: "Created", 202: "Accepted", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
    409: "Conflict", 413: "Payload Too Large", 415: "Unsupported Media Type",
    422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway",
    503: "Service Unavailable", 504: "Gateway Timeout",
  },
};

App.statusMeaning = function (code) {
  const lang = App.getLang ? App.getLang() : "ru";
  const dict = App.STATUS_MEANINGS[lang] || App.STATUS_MEANINGS.ru;
  if (dict[code]) return dict[code];
  // Обобщённо по классу кода
  const generic = lang === "ru"
    ? { 2: "Успешно", 3: "Перенаправление", 4: "Ошибка клиента", 5: "Ошибка сервера" }
    : { 2: "Success", 3: "Redirect", 4: "Client error", 5: "Server error" };
  return generic[Math.floor(code / 100)] || "";
};
