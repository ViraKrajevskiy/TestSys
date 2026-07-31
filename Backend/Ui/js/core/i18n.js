/**
 * i18n.js — Переводы RU / EN
 * Использование: App.t("key") или атрибут data-i18n="key" в HTML
 */
window.App = window.App || {};

(function () {
  const DICT = {
    ru: {
      // Общее
      ok: "OK", cancel: "Отмена", save: "Сохранить", delete: "Удалить", close: "Закрыть",
      edit: "Редактировать", add: "Добавить", rename: "Переименовать", confirm: "Подтверждение",
      message: "Сообщение", input: "Ввод", error: "Ошибка", loading: "Загрузка...",
      yes: "Да", no: "Нет", none: "нет", all: "Все", copy: "Копировать", copied: "Скопировано!",

      // Навбар
      navGenerator: "Генератор тестовых данных", navRandomizer: "Рандомайзер",
      navUsers: "Управление пользователями", navTheme: "Настроить тему",
      navSync: "Совместная работа", navMetrics: "Метрики запросов", navSettings: "Настройки проекта",
      navSidebar: "Свернуть/развернуть коллекции", navReturn: "Вернуть вкладку в главное окно",

      // Сайдбар
      collections: "Коллекции", variables: "Переменные",
      newCollection: "Новая", importCollection: "Импортировать коллекцию из файла",
      exportAll: "Экспортировать все мои коллекции", exportOne: "Экспортировать / поделиться",
      addFolder: "Добавить папку", addRequest: "Добавить запрос", addVariable: "Добавить переменную",
      collectionName: "Имя коллекции", folderName: "Имя папки", variableName: "Имя переменной",
      newFolderName: "Новое имя папки", newName: "Новое имя",
      varExists: "переменная с таким именем уже есть",
      importSwagger: "Импорт Swagger / OpenAPI",
      swaggerIntro: "Укажите адрес спецификации или адрес API — типичные пути вроде /openapi.json и /swagger.json будут проверены автоматически.",
      specUrl: "Адрес спецификации или API", load: "Загрузить", or: "или",
      chooseFile: "Выбрать файл спецификации", endpoints: "эндпоинтов",
      notSpecified: "не указан", baseAddress: "Базовый адрес",
      useBaseUrlVar: "Через {{baseUrl}}", back: "Назад", importBtn: "Импортировать",
      imported: "Импортировано", folders: "папок", requests: "запросов",
      varsCreated: "Созданы переменные", noEndpoints: "В спецификации не найдено ни одного эндпоинта",
      apiUnavailable: "Функция недоступна вне приложения",

      // Обновления
      updates: "Обновления", checkUpdates: "Проверить обновления", checkNow: "Проверить",
      autoCheckUpdates: "Проверять при запуске", currentVersion: "Текущая версия",
      newVersionAvailable: "Доступна новая версия", yours: "у вас", whatsNew: "Что нового",
      later: "Позже", upToDate: "У вас последняя версия", availableVersions: "Доступные версии",
      savedVersions: "Сохранённые версии",
      savedVersionsHint: "Предыдущие версии остаются на диске — откат на них мгновенный, без скачивания.",
      newer: "новее", installed: "установлена", older: "старее",
      updateTo: "Обновить до", rollbackTo: "Откатиться на", rollbackInstant: "Откатиться",
      updateBtn: "Обновить", installAndRestart: "Установить и перезапустить",
      downloading: "Скачивание...", installing: "Установка...", restarting: "Перезапуск...",
      appWillRestart: "Приложение закроется и запустится заново.",
      rollbackWarning: "Вы вернётесь на старую версию — новые возможности станут недоступны.",
      noReleases: "Релизов не найдено", showPrerelease: "Показывать тестовые версии",
      devModeNoUpdate: "Обновление доступно только в собранном приложении, не при запуске из исходников.",
      cleanupBackups: "Очистить старые", removed: "Удалено",
      cleanupBackupsConfirm: "Удалить все сохранённые версии, кроме трёх последних?",

      // Вкладки / запрос
      newTab: "Новая вкладка (Ctrl+T)", closeAllTabs: "Закрыть все вкладки",
      closeTab: "Закрыть вкладку", closeOthers: "Закрыть остальные", renameTab: "Переименовать (F2)",
      openInWindow: "Открыть в отдельном окне", noTabs: "Нет открытых вкладок",
      send: "Отправить", params: "Параметры", headers: "Заголовки", body: "Тело",
      method: "Метод", requestName: "Название", key: "Ключ", value: "Значение",
      newRequest: "Новый запрос", editRequest: "Редактировать запрос",
      enableRow: "Включить/выключить строку",
      kvHint: "Новая строка добавляется сама. Снимите галочку, чтобы временно отключить строку.",
      varsHint: "Можно использовать переменные: {{baseUrl}}, {{userId}}",
      dynamicVars: "Динамические переменные",
      dynamicVarsIntro: "Вставьте переменную в URL, параметры, заголовки или тело запроса — значение подставится в момент отправки. Каждый запуск даёт новые данные.",
      clickToInsert: "Нажмите на переменную, чтобы вставить её в поле",
      tryIt: "Попробовать", willBeSent: "Будет отправлено",
      regenerate: "Сгенерировать заново", unknownVars: "Неизвестные переменные",
      insertInto: "Вставится в", atCursor: "на позицию курсора", atEnd: "в конец",
      placeCursorHint: "Тело содержит готовый JSON. Поставьте курсор туда, куда нужна переменная, и откройте справочник снова — иначе разметка сломается. Сейчас клик просто скопирует переменную.",
      copiedPlaceManually: "Скопировано — вставьте в нужное место",
      fillFields: "Заполнить", fieldsFilled: "Заполнено полей", field: "Поле",
      fillFieldsIntro: "Поля вашего JSON и подобранные к ним переменные. Значения будут подставляться заново при каждой отправке запроса.",
      showAllVars: "Показать все переменные",
      // Рандомайзер
      templateExamples: "Примеры шаблонов", fromBody: "Из Body", file: "Файл",
      pickTemplateHint: "Выберите пример шаблона или загрузите JSON из Body",
      noFields: "Нет полей", result: "Результат", generate: "Сгенерировать", insert: "Вставить",
      generateFirst: "Сначала сгенерируйте", loadTemplateFirst: "Сначала загрузите шаблон",
      bodyEmpty: "Body пуст", inserted: "Вставлено", insertedToMain: "Вставлено в главное окно",
      bodyEmptyMain: "Body в главном окне пуст — введите там JSON",
      noRequestTab: "Нет вкладки с запросом",
      mainWindowNotFound: "Главное окно не найдено", genOptions: "Настройки генератора",
      charType: "Тип символов", length: "Длина", wordList: "Словарь", count: "Количество",
      separator: "Разделитель", ownValues: "Свои значения", onePerLine: "По одному на строку",
      csText: "Только буквы", csNumbers: "Только цифры", csSymbols: "Только символы",
      csAlnum: "Буквы и цифры", csMixed: "Всё вместе",
      noListsAvailable: "словарей нет", dictNeedsBackend: "Словари приходят с сервера — проверьте, что бэкенд запущен",
      asVarsHint: "Вставить как динамические переменные", insertedAsVars: "Вставлено как переменные",
      noVarEquivalent: "У выбранных генераторов нет аналога среди переменных", skipped: "пропущено",
      lockPanel: "Закрепить позицию и размер",
      fuzz: "Испортить", fuzzed: "Испорчено поле",
      fuzzHint: "Испортить одно случайное поле — проверить, что API вернёт 400/422, а не 500",
      noFieldsSelected: "Не выбрано ни одного поля", strLength: "Длина строки",
      schemaLoaded: "Схема загружена, полей",

      // Ответ
      response: "Ответ", status: "Статус", pressSend: "Нажмите «Отправить»",
      requestFailed: "Запрос не выполнен", copyResponse: "Копировать ответ",
      collapseResponse: "Свернуть ответ", expandResponse: "Развернуть ответ",
      responseTruncated: "[обрезано]", table: "Таблица", records: "записей",
      resizeHint: "Потяните для изменения размера",

      // Ошибки валидации
      errNameRequired: "Введите название запроса", errUrlRequired: "Введите URL",
      errBadJson: "Некорректный JSON:", errInvalidJsonBody: "Некорректный JSON в теле запроса",
      errBadUrl: "URL должен начинаться с http:// или https://",
      limitReached: "Достигнут лимит", bodyTruncated: "Тело обрезано, максимум",
      maxTabsReached: "Максимум вкладок:", kb: "КБ",

      // Настройки
      settings: "Настройки проекта", connection: "Подключение", logging: "Логирование",
      limits: "Лимиты", language: "Язык", interfaceLanguage: "Язык интерфейса",
      enableLogging: "Включить логирование", logLevel: "Уровень логов",
      maxTabs: "Макс. вкладок", maxParams: "Макс. параметров", maxHeaders: "Макс. заголовков",
      maxBody: "Макс. тело (КБ)", maxUrl: "Макс. URL", maxResponse: "Макс. ответ (КБ)",
      timeout: "Таймаут (сек)", defaults: "По умолчанию",
      randomizerSection: "Рандомайзер", randomizerMode: "Режим открытия",
      modeFloating: "Панель внутри окна (плавающая)", modeWindow: "Отдельное окно ОС",
      limitsHint: "Увеличивайте осторожно — высокие значения могут перегрузить приложение.",

      // Синхронизация
      sync: "Совместная работа", syncMode: "Режим", yourName: "Ваше имя (видно другим участникам)",
      syncLocal: "Только этот компьютер", syncLocalDesc: "Коллекции никуда не отправляются",
      syncFolder: "Общая папка", syncFolderDesc: "Dropbox / Яндекс.Диск / OneDrive — работает из любой сети",
      syncHost: "Стать хостом", syncHostDesc: "Этот компьютер = сервер, остальные подключаются по IP",
      syncClient: "Подключиться к хосту", syncClientDesc: "Ввести адрес компьютера-хоста",
      sharedFolder: "Папка для общего файла", choose: "Выбрать...",
      port: "Порт", password: "Пароль (необязательно)", hostAddress: "Адрес хоста",
      startHost: "Запустить хост", stopHost: "Остановить", testConnection: "Проверить связь",
      pullChanges: "Забрать изменения", pushChanges: "Отправить свои",
      hostRunning: "Хост запущен", hostStopped: "Хост остановлен",
      giveAddresses: "Дайте участникам один из адресов:",
      collectionsChanged: "Коллекции изменены другим участником", load: "Загрузить", hide: "Скрыть",
      passwordIfSet: "Пароль (если задан на хосте)", checking: "Проверяю...",
      connectionOk: "Связь есть", protected: "защищён паролем", noResponse: "нет ответа",
      settingsSaved: "Настройки сохранены", lastBy: "последний",
      apiUrlHint: "Адрес FastAPI бэкенда. По умолчанию localhost:8000",
      randomizerModeHint: "В плавающей панели есть кнопка ↗ для выноса в отдельное окно.",
      hostLanHint: "⚠ Работает только внутри одной сети. Для разных сетей — Tailscale или общая папка. Возможно, потребуется разрешить порт в брандмауэре Windows.",
      sharedFolderHint: "Все участники указывают одну и ту же синхронизируемую папку. Файл: testsys_shared.json",

      // Логи
      logs: "Логи и ошибки", viewLogs: "Просмотреть логи и ошибки",
      logSession: "Текущая сессия", logFile: "Файл лога", search: "Поиск...",
      logEmpty: "Записей нет", openFolder: "Открыть папку",
      clearLogConfirm: "Очистить все логи? Записи будут удалены безвозвратно.",
      logFileUnavailable: "Файл лога недоступен в этом режиме",
      clearLogs: "Очистить логи", logsCleared: "Логи очищены",
      linesShown: "строк", archives: "архивов",
      maxLogFile: "Размер файла (МБ)", logBackups: "Архивов",
      maxLogEntries: "Записей в памяти", maxMetrics: "История метрик",
      logLimitsHint: "Файл лога обрезается автоматически: при достижении размера старое уходит в архив.",
      clearMetricsConfirm: "Очистить историю метрик? Данные будут удалены безвозвратно.",

      // Метрики
      metrics: "Метрики запросов", total: "Всего", successful: "Успешных", failed: "Ошибок",
      avgTime: "Ср. время", minMax: "Мин / Макс", totalSize: "Общий размер",
      byStatus: "По статусам", byMethod: "По методам", clear: "Очистить",
      noMetrics: "Нет данных. Отправьте запрос.", when: "Когда", size: "Размер", time: "Время",
    },

    en: {
      ok: "OK", cancel: "Cancel", save: "Save", delete: "Delete", close: "Close",
      edit: "Edit", add: "Add", rename: "Rename", confirm: "Confirm",
      message: "Message", input: "Input", error: "Error", loading: "Loading...",
      yes: "Yes", no: "No", none: "none", all: "All", copy: "Copy", copied: "Copied!",

      navGenerator: "Test data generator", navRandomizer: "Randomizer",
      navUsers: "User management", navTheme: "Customize theme",
      navSync: "Collaboration", navMetrics: "Request metrics", navSettings: "Project settings",
      navSidebar: "Toggle collections sidebar", navReturn: "Return tab to main window",

      collections: "Collections", variables: "Variables",
      newCollection: "New", importCollection: "Import collection from file",
      exportAll: "Export all my collections", exportOne: "Export / share",
      addFolder: "Add folder", addRequest: "Add request", addVariable: "Add variable",
      collectionName: "Collection name", folderName: "Folder name", variableName: "Variable name",
      newFolderName: "New folder name", newName: "New name",
      varExists: "a variable with this name already exists",
      importSwagger: "Import Swagger / OpenAPI",
      swaggerIntro: "Enter the spec URL or the API address — common paths like /openapi.json and /swagger.json are checked automatically.",
      specUrl: "Spec or API address", load: "Load", or: "or",
      chooseFile: "Choose spec file", endpoints: "endpoints",
      notSpecified: "not specified", baseAddress: "Base address",
      useBaseUrlVar: "Use {{baseUrl}}", back: "Back", importBtn: "Import",
      imported: "Imported", folders: "folders", requests: "requests",
      varsCreated: "Variables created", noEndpoints: "No endpoints found in the specification",
      apiUnavailable: "Not available outside the app",

      updates: "Updates", checkUpdates: "Check for updates", checkNow: "Check",
      autoCheckUpdates: "Check on startup", currentVersion: "Current version",
      newVersionAvailable: "New version available", yours: "yours", whatsNew: "What is new",
      later: "Later", upToDate: "You have the latest version", availableVersions: "Available versions",
      savedVersions: "Saved versions",
      savedVersionsHint: "Previous versions stay on disk — rolling back to them is instant, no download.",
      newer: "newer", installed: "installed", older: "older",
      updateTo: "Update to", rollbackTo: "Roll back to", rollbackInstant: "Roll back",
      updateBtn: "Update", installAndRestart: "Install and restart",
      downloading: "Downloading...", installing: "Installing...", restarting: "Restarting...",
      appWillRestart: "The app will close and start again.",
      rollbackWarning: "You will return to an older version — newer features will be unavailable.",
      noReleases: "No releases found", showPrerelease: "Show pre-release versions",
      devModeNoUpdate: "Updating works only in the built app, not when running from source.",
      cleanupBackups: "Clean up old", removed: "Removed",
      cleanupBackupsConfirm: "Delete all saved versions except the three most recent?",

      newTab: "New tab (Ctrl+T)", closeAllTabs: "Close all tabs",
      closeTab: "Close tab", closeOthers: "Close others", renameTab: "Rename (F2)",
      openInWindow: "Open in separate window", noTabs: "No open tabs",
      send: "Send", params: "Params", headers: "Headers", body: "Body",
      method: "Method", requestName: "Name", key: "Key", value: "Value",
      newRequest: "New request", editRequest: "Edit request",
      enableRow: "Enable/disable row",
      kvHint: "A new row is added automatically. Uncheck to temporarily disable a row.",
      varsHint: "You can use variables: {{baseUrl}}, {{userId}}",
      dynamicVars: "Dynamic variables",
      dynamicVarsIntro: "Insert a variable into the URL, params, headers or body — the value is substituted when the request is sent. Every run gives fresh data.",
      clickToInsert: "Click a variable to insert it into the field",
      tryIt: "Try it", willBeSent: "Will be sent",
      regenerate: "Regenerate", unknownVars: "Unknown variables",
      insertInto: "Will be inserted into", atCursor: "at cursor position", atEnd: "at the end",
      placeCursorHint: "The body already contains valid JSON. Place the cursor where you want the variable and reopen this dialog — otherwise the JSON would break. For now clicking just copies the variable.",
      copiedPlaceManually: "Copied — paste it where needed",
      fillFields: "Fill", fieldsFilled: "Fields filled", field: "Field",
      fillFieldsIntro: "Fields of your JSON with matching variables. Values are regenerated on every request.",
      showAllVars: "Show all variables",
      templateExamples: "Template examples", fromBody: "From Body", file: "File",
      pickTemplateHint: "Pick a template example or load JSON from Body",
      noFields: "No fields", result: "Result", generate: "Generate", insert: "Insert",
      generateFirst: "Generate first", loadTemplateFirst: "Load a template first",
      bodyEmpty: "Body is empty", inserted: "Inserted", insertedToMain: "Inserted into main window",
      bodyEmptyMain: "Body in the main window is empty — enter JSON there",
      noRequestTab: "No request tab",
      mainWindowNotFound: "Main window not found", genOptions: "Generator options",
      charType: "Character type", length: "Length", wordList: "Word list", count: "Count",
      separator: "Separator", ownValues: "Own values", onePerLine: "One per line",
      csText: "Letters only", csNumbers: "Digits only", csSymbols: "Symbols only",
      csAlnum: "Letters and digits", csMixed: "Everything",
      noListsAvailable: "no lists", dictNeedsBackend: "Word lists come from the server — make sure the backend is running",
      asVarsHint: "Insert as dynamic variables", insertedAsVars: "Inserted as variables",
      noVarEquivalent: "Selected generators have no variable equivalent", skipped: "skipped",
      lockPanel: "Lock position and size",
      fuzz: "Break it", fuzzed: "Broken field",
      fuzzHint: "Break one random field — check the API returns 400/422, not 500",
      noFieldsSelected: "No fields selected", strLength: "String length",
      schemaLoaded: "Schema loaded, fields",

      response: "Response", status: "Status", pressSend: "Press Send",
      requestFailed: "Request failed", copyResponse: "Copy response",
      collapseResponse: "Collapse response", expandResponse: "Expand response",
      responseTruncated: "[truncated]", table: "Table", records: "record(s)",
      resizeHint: "Drag to resize",

      errNameRequired: "Enter request name", errUrlRequired: "Enter URL",
      errBadJson: "Invalid JSON:", errInvalidJsonBody: "Invalid JSON in request body",
      errBadUrl: "URL must start with http:// or https://",
      limitReached: "Limit reached", bodyTruncated: "Body truncated, max",
      maxTabsReached: "Max tabs:", kb: "KB",

      settings: "Project settings", connection: "Connection", logging: "Logging",
      limits: "Limits", language: "Language", interfaceLanguage: "Interface language",
      enableLogging: "Enable logging", logLevel: "Log level",
      maxTabs: "Max tabs", maxParams: "Max params", maxHeaders: "Max headers",
      maxBody: "Max body (KB)", maxUrl: "Max URL", maxResponse: "Max response (KB)",
      timeout: "Timeout (sec)", defaults: "Defaults",
      randomizerSection: "Randomizer", randomizerMode: "Opening mode",
      modeFloating: "Floating panel inside window", modeWindow: "Separate OS window",
      limitsHint: "Increase with care — high values may overload the app.",

      sync: "Collaboration", syncMode: "Mode", yourName: "Your name (visible to others)",
      syncLocal: "This computer only", syncLocalDesc: "Collections are not shared",
      syncFolder: "Shared folder", syncFolderDesc: "Dropbox / Google Drive / OneDrive — works across networks",
      syncHost: "Become host", syncHostDesc: "This computer = server, others connect by IP",
      syncClient: "Connect to host", syncClientDesc: "Enter the host computer's address",
      sharedFolder: "Folder for shared file", choose: "Browse...",
      port: "Port", password: "Password (optional)", hostAddress: "Host address",
      startHost: "Start host", stopHost: "Stop", testConnection: "Test connection",
      pullChanges: "Pull changes", pushChanges: "Push mine",
      hostRunning: "Host running", hostStopped: "Host stopped",
      giveAddresses: "Give participants one of these addresses:",
      collectionsChanged: "Collections changed by another participant", load: "Load", hide: "Hide",
      passwordIfSet: "Password (if set on host)", checking: "Checking...",
      connectionOk: "Connected", protected: "password protected", noResponse: "no response",
      settingsSaved: "Settings saved", lastBy: "last by",
      apiUrlHint: "FastAPI backend address. Default localhost:8000",
      randomizerModeHint: "The floating panel has an ↗ button to pop out into a separate window.",
      hostLanHint: "⚠ Works only within one network. For different networks use Tailscale or a shared folder. You may need to allow the port in Windows Firewall.",
      sharedFolderHint: "All participants must point to the same synced folder. File: testsys_shared.json",

      logs: "Logs & errors", viewLogs: "View logs and errors",
      logSession: "Current session", logFile: "Log file", search: "Search...",
      logEmpty: "No entries", openFolder: "Open folder",
      clearLogConfirm: "Clear all logs? Entries will be permanently deleted.",
      logFileUnavailable: "Log file is unavailable in this mode",
      clearLogs: "Clear logs", logsCleared: "Logs cleared",
      linesShown: "lines", archives: "archives",
      maxLogFile: "File size (MB)", logBackups: "Archives",
      maxLogEntries: "Entries in memory", maxMetrics: "Metrics history",
      logLimitsHint: "The log file is trimmed automatically: on reaching the size limit older data moves to an archive.",
      clearMetricsConfirm: "Clear metrics history? Data will be permanently deleted.",

      metrics: "Request metrics", total: "Total", successful: "Successful", failed: "Failed",
      avgTime: "Avg time", minMax: "Min / Max", totalSize: "Total size",
      byStatus: "By status", byMethod: "By method", clear: "Clear",
      noMetrics: "No data. Send a request.", when: "When", size: "Size", time: "Time",
    },
  };

  let _lang = "ru";

  /** Перевод по ключу */
  App.t = function (key, fallback) {
    const d = DICT[_lang] || DICT.ru;
    return d[key] !== undefined ? d[key] : (fallback !== undefined ? fallback : key);
  };

  App.getLang = function () { return _lang; };

  App.setLang = function (lang) {
    if (!DICT[lang]) return;
    _lang = lang;
    document.documentElement.setAttribute("lang", lang);

    // Статические подписи (data-i18n) во всём документе, включая модалки
    App.applyTranslations();

    // Динамические части — перерисовываем, их текст строится в JS
    try {
      if (App.renderCollections) App.renderCollections();
      if (App.renderTabBar) App.renderTabBar();
      if (App.renderTabContent) App.renderTabContent();
      if (App.refreshMetricsIfOpen) App.refreshMetricsIfOpen();
      if (App.refreshSyncFormIfOpen) App.refreshSyncFormIfOpen();
    } catch (e) {
      // Перевод не должен ронять приложение
      if (App.logWarn) App.logWarn("i18n", "Ошибка перерисовки при смене языка: " + e.message);
    }
  };

  /** Применить переводы к элементам с data-i18n / data-i18n-title / data-i18n-ph */
  App.applyTranslations = function (root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = App.t(el.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(el => {
      el.title = App.t(el.dataset.i18nTitle);
    });
    scope.querySelectorAll("[data-i18n-ph]").forEach(el => {
      el.placeholder = App.t(el.dataset.i18nPh);
    });
  };

  App.LANGUAGES = [
    { value: "ru", label: "Русский" },
    { value: "en", label: "English" },
  ];
})();
