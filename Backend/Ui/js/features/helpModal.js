/**
 * helpModal.js — встроенная справка «как пользоваться TestSys».
 *
 * Три блока в одной модалке с поиском:
 *   1. Быстрый старт — 5 шагов для новичка.
 *   2. Возможности — шпаргалка «фича → что делает → где найти».
 *      Рукописный список: добавил фичу в приложение → допиши сюда ОДНУ строку.
 *   3. Горячие клавиши — берутся ЖИВЫМИ из реестра App.getHotkeys(),
 *      поэтому всегда точные даже после переназначения пользователем.
 *
 * Кнопка «?» в навбаре + F1.
 */
window.App = window.App || {};

(function () {
  const MODAL_ID = "help-modal";

  // ──────────────────────────────────────────────────────────────
  // Быстрый старт — меняется редко, поэтому статикой не страшно.
  // ──────────────────────────────────────────────────────────────
  const QUICK_START = [
    "Впиши URL в строку сверху, выбери метод (GET/POST/…) и нажми <b>Send</b> (или Ctrl+Enter).",
    "Тело запроса — на вкладке <b>Body</b>; параметры и заголовки — на <b>Params</b> / <b>Headers</b>.",
    "Сохрани запрос в коллекцию через <b>Ctrl+S</b> — он появится в дереве слева и переживёт перезапуск.",
    "Повторяющиеся значения (адрес сервера, токен) вынеси в <b>переменные</b> и подставляй как <code>{{baseUrl}}</code>.",
    "Авторизацию задай на коллекции/папке один раз — запросы внутри её <b>унаследуют</b> (как в Postman).",
  ];

  // ──────────────────────────────────────────────────────────────
  // Возможности — шпаргалка. ДОБАВИЛ ФИЧУ → допиши сюда одну строку.
  // ──────────────────────────────────────────────────────────────
  const FEATURES = [
    { cat: "Запрос", items: [
      { name: "Отправка запроса", desc: "Метод + URL + Send. Enter в строке URL тоже отправляет.", where: "Строка запроса / Ctrl+Enter" },
      { name: "Params и Headers", desc: "Таблицы ключ-значение. Чекбокс слева выключает строку не удаляя её.", where: "Вкладки Params / Headers" },
      { name: "Массовый ввод (bulk)", desc: "Вставить пачку заголовков текстом. Строка с # или // — выключена.", where: "Params/Headers → переключатель bulk" },
      { name: "Body + авто-формат", desc: "JSON-тело. Кнопка «{ }» форматирует, кнопка Form правит как поля формы.", where: "Вкладка Body" },
      { name: "Загрузка файлов", desc: "multipart/form-data: приложить файлы + текстовые поля формы.", where: "Вкладка Files (для POST/PUT/PATCH)" },
      { name: "Авторизация", desc: "Bearer, Basic, API Key, OAuth 2.0. Наследуется от папки/коллекции.", where: "Вкладка Auth" },
      { name: "Pre-request и Tests", desc: "Скрипты pm.* до и после запроса: подготовить данные, проверить ответ.", where: "Вкладки Pre-request / Tests" },
      { name: "Настройки запроса", desc: "Игнорировать SSL, следовать редиректам, свой таймаут, описание запроса.", where: "Вкладка Настройки" },
      { name: "User-Agent", desc: "Подменить User-Agent из списка или задать свой.", where: "Строка под вкладками запроса" },
      { name: "Генерация кода", desc: "Экспорт запроса в cURL, JS fetch/axios, Python requests.", where: "Кнопка </> у строки URL" },
      { name: "Динамические переменные", desc: "{{$randomEmail}}, {{$uuid}} и т.п. — подставляются при отправке.", where: "Кнопка {$}" },
    ]},
    { cat: "Ответ", items: [
      { name: "Подсветка и копирование", desc: "Клик по значению копирует его без кавычек, ПКМ — меню (значение/путь/в переменную).", where: "Панель ответа" },
      { name: "Сворачивание и поиск", desc: "Сворачивай узлы со счётчиком; Ctrl+F ищет по ответу с подсветкой.", where: "Панель ответа / Ctrl+F" },
      { name: "Разбивка времени", desc: "TTFB · загрузка · total · размер — вместо просто «N мс».", where: "Строка статуса ответа" },
      { name: "JSONPath-фильтр", desc: "Выцепить из ответа $.data[*].email и т.п.", where: "Поле под телом ответа" },
      { name: "JWT-декодер", desc: "Токен в ответе помечен 🔑 — клик показывает header/payload/срок.", where: "Значок 🔑 у JWT-строки" },
      { name: "Скачать ответ", desc: "Сохранить тело как файл: бинарь (PDF/картинка) как есть, текст как json/txt.", where: "Кнопка ⬇ в шапке ответа" },
      { name: "Эталон и diff", desc: "Сохранить ответ как эталон и подсвечивать изменения в следующих.", where: "Панель ответа → Эталон" },
      { name: "История ответов", desc: "Последние N ответов текущей вкладки — вернуться к прошлому.", where: "Панель ответа / Ctrl+H" },
    ]},
    { cat: "Коллекции", items: [
      { name: "Сохранение в коллекцию", desc: "Ctrl+S кладёт вкладку в коллекцию; точка • на вкладке = есть несохранённое.", where: "Ctrl+S / дерево слева" },
      { name: "Импорт", desc: "TestSys, Postman v2/v2.1, Insomnia, Bruno, Swagger/OpenAPI, cURL.", where: "Сайдбар → ⋯ → Импорт" },
      { name: "Экспорт", desc: "TestSys, Postman, Bruno, OpenAPI YAML, история как HAR.", where: "Сайдбар → ⋯ → Экспорт" },
      { name: "Наследование авторизации", desc: "Задать Auth на коллекции/папке — запросы внутри унаследуют.", where: "⋯ у коллекции / щит у папки" },
      { name: "Описание запроса", desc: "Заметка для команды — видна в подсказке при наведении на запрос.", where: "Вкладка Настройки → Описание" },
      { name: "Переменные окружений", desc: "baseUrl, токены и пр. Переключение наборов значений.", where: "Окружения" },
    ]},
    { cat: "Инструменты", items: [
      { name: "Рандомайзер", desc: "Быстрая подстановка случайных значений в поля.", where: "Навбар 🎲 / Ctrl+R" },
      { name: "Генератор данных", desc: "Сгенерировать тестовые данные по шаблону.", where: "Навбар 🔀 / Ctrl+G" },
      { name: "Collection Runner", desc: "Прогнать всю коллекцию запросов подряд с проверками.", where: "Навбар ▶" },
      { name: "Нагрузочное тестирование", desc: "Много одинаковых запросов — замерить поведение под нагрузкой.", where: "Навбар ⚡" },
      { name: "Параллельные тесты", desc: "Несколько запросов одновременно.", where: "Навбар / Ctrl+Shift+P" },
      { name: "Метрики", desc: "Графики времени и статусов по отправленным запросам.", where: "Навбар 📈" },
      { name: "Глобальная история", desc: "Все запросы со всех вкладок: поиск, сортировка, открыть заново.", where: "Навбар 🕐" },
      { name: "Mock Server", desc: "Локальный сервер-заглушка: маршруты, статусы, задержки, лог.", where: "Навбар → ⋯ → Mock Server" },
      { name: "Cookie Manager", desc: "Просмотр и правка cookie по доменам.", where: "Навбар → ⋯ → Cookie Manager" },
      { name: "Совместная работа", desc: "Синхронизация коллекций (секретные переменные не уходят).", where: "Навбар → ⋯ → Совместная работа" },
      { name: "Терминал", desc: "Встроенная консоль.", where: "Навбар → ⋯ → Терминал / Ctrl+`" },
    ]},
    { cat: "Вкладки", items: [
      { name: "Новая / закрыть", desc: "Работай с несколькими запросами параллельно.", where: "Ctrl+T / Ctrl+W" },
      { name: "Дублировать", desc: "Копия запроса без ответа — удобно варьировать параметры.", where: "ПКМ по вкладке → Дублировать" },
      { name: "Отдельное окно", desc: "Открепить вкладку в своё окно и сравнивать бок о бок.", where: "ПКМ по вкладке → Открыть в окне" },
      { name: "Переименовать", desc: "Своё имя вкладки вместо авто-заголовка из URL.", where: "ПКМ → Переименовать / F2" },
    ]},
  ];

  // ──────────────────────────────────────────────────────────────
  // Показ модалки
  // ──────────────────────────────────────────────────────────────
  App.showHelp = function () {
    _ensureModal();
    const el = document.getElementById(MODAL_ID);
    bootstrap.Modal.getOrCreateInstance(el).show();
    const search = document.getElementById("help-search");
    if (search) { search.value = ""; _renderBody(""); setTimeout(() => search.focus(), 150); }
  };

  function _ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    const el = document.createElement("div");
    el.className = "modal fade";
    el.id = MODAL_ID;
    el.tabIndex = -1;
    el.innerHTML = `
<div class="modal-dialog modal-lg modal-dialog-scrollable">
  <div class="modal-content theme-modal-content">
    <div class="modal-header">
      <h5 class="modal-title"><i class="bi bi-question-circle me-2"></i>Справка — как пользоваться TestSys</h5>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="help-search-wrap mb-3">
        <i class="bi bi-search"></i>
        <input id="help-search" class="form-control form-control-sm help-search"
               placeholder="Поиск по возможностям и клавишам…" autocomplete="off">
      </div>
      <div id="help-body"></div>
    </div>
  </div>
</div>`;
    document.body.appendChild(el);
    document.getElementById("help-search").addEventListener("input", (e) => _renderBody(e.target.value));
  }

  // ──────────────────────────────────────────────────────────────
  // Рендер тела (с учётом поиска)
  // ──────────────────────────────────────────────────────────────
  function _renderBody(query) {
    const body = document.getElementById("help-body");
    if (!body) return;
    const q = (query || "").trim().toLowerCase();
    const esc = App.escapeHtml || ((s) => s);
    let html = "";

    // --- Кнопка интерактивного обучения (прячем при активном поиске) ---
    if (!q) {
      html += '<div class="help-tour-cta">' +
        '<div class="help-tour-txt"><b>Первый раз здесь?</b> Пройдите интерактивный тур — ' +
        'подсветит функции прямо в интерфейсе.</div>' +
        '<button class="btn btn-sm help-tour-btn" onclick="App.startTutorial && App.startTutorial()">' +
        '<i class="bi bi-mortarboard me-1"></i>Пройти обучение</button>' +
        '</div>';
    }

    // --- Быстрый старт (прячем при активном поиске) ---
    if (!q) {
      html += '<section class="help-section"><div class="help-h">🚀 Быстрый старт</div><ol class="help-steps">';
      QUICK_START.forEach(s => { html += `<li>${s}</li>`; });
      html += "</ol></section>";
    }

    // --- Возможности ---
    let featBlocks = "";
    FEATURES.forEach(group => {
      const items = group.items.filter(it => !q ||
        it.name.toLowerCase().includes(q) ||
        it.desc.toLowerCase().includes(q) ||
        it.where.toLowerCase().includes(q) ||
        group.cat.toLowerCase().includes(q));
      if (!items.length) return;
      featBlocks += `<div class="help-cat">${esc(group.cat)}</div><table class="help-table"><tbody>`;
      items.forEach(it => {
        featBlocks += `<tr>
          <td class="help-feat">${esc(it.name)}</td>
          <td class="help-desc">${esc(it.desc)}</td>
          <td class="help-where">${esc(it.where)}</td>
        </tr>`;
      });
      featBlocks += "</tbody></table>";
    });
    if (featBlocks) {
      html += `<section class="help-section"><div class="help-h">🧩 Возможности</div>${featBlocks}</section>`;
    }

    // --- Горячие клавиши (живьём из реестра) ---
    const hkBlocks = _renderHotkeys(q, esc);
    if (hkBlocks) {
      html += `<section class="help-section"><div class="help-h">⌨️ Горячие клавиши</div>${hkBlocks}</section>`;
    }

    if (!featBlocks && !hkBlocks && q) {
      html = `<div class="help-empty">По запросу «${esc(query)}» ничего не найдено</div>`;
    }

    body.innerHTML = html;
  }

  /** Клавиши берём из App.getHotkeys() — всегда актуальные, даже если переназначены. */
  function _renderHotkeys(q, esc) {
    if (!App.getHotkeys) return "";
    const groups = {
      tabs: "Вкладки", request: "Запрос", console: "Консоль",
      ui: "Интерфейс", gen: "Генерация данных",
    };
    const all = App.getHotkeys();
    const byGroup = {};
    all.forEach(h => {
      const label = (App.t && App.t(h.i18n)) || h.i18n;
      const combo = h.combo ? (App.hotkeyPretty ? App.hotkeyPretty(h.combo) : h.combo) : "—";
      if (q && !label.toLowerCase().includes(q) && !combo.toLowerCase().includes(q)
           && !(groups[h.group] || "").toLowerCase().includes(q)) return;
      (byGroup[h.group] = byGroup[h.group] || []).push({ label, combo });
    });

    let out = "";
    Object.keys(groups).forEach(g => {
      const rows = byGroup[g];
      if (!rows || !rows.length) return;
      out += `<div class="help-cat">${esc(groups[g])}</div><table class="help-table help-hk"><tbody>`;
      rows.forEach(r => {
        out += `<tr>
          <td class="help-feat">${esc(r.label)}</td>
          <td class="help-kbd">${r.combo === "—" ? "<span class='help-off'>выкл.</span>" : `<kbd>${esc(r.combo)}</kbd>`}</td>
        </tr>`;
      });
      out += "</tbody></table>";
    });
    return out;
  }

  // ──────────────────────────────────────────────────────────────
  // Кнопка в навбаре + F1
  // ──────────────────────────────────────────────────────────────
  App.initHelp = function () {
    const btn = document.getElementById("help-btn");
    if (btn) btn.addEventListener("click", () => App.showHelp());
  };

  // F1 открывает справку из любого места
  document.addEventListener("keydown", (e) => {
    if (e.key === "F1") { e.preventDefault(); App.showHelp(); }
  });
})();
