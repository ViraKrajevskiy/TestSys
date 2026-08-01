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
      noVarsHint: "Нет переменных",
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
      openOnGitHub: "Открыть в GitHub",
      noInstaller: "У этого релиза нет установочного файла — только страница на GitHub",
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
      preRequest: "Pre-request", tests: "Tests",
      preRequestTitle: "Скрипт перед отправкой",
      preRequestHint: "Выполняется до подстановки переменных. Можно менять URL, заголовки, тело и переменные через pm.",
      testsTitle: "Скрипт после ответа",
      testsHint: "Выполняется после получения ответа. Используйте pm.test для проверок и pm.variables.set для сохранения данных.",
      runNow: "Запустить", snippets: "Шаблоны", pickSnippet: "Выбрать...",
      scriptOkNoTests: "Скрипт выполнен без ошибок",
      preScriptFailed: "Pre-request скрипт упал",
      console: "Консоль", replPlaceholder: "Введите команду... (Ctrl+` открыть/закрыть, Ctrl+L очистить)",
      popOut: "В отдельное окно", resize: "Изменить размер",
      consoleInSeparateWindow: "Консоль открыта в отдельном окне",
      sidebarPosition: "Положение сайдбара",
      sidebarLeft: "Слева", sidebarRight: "Справа", sidebarFloating: "Плавающее",

      // --- Горячие клавиши ---
      collapseAll: "Свернуть всё", expandAll: "Раскрыть всё",
      collapseExpand: "Свернуть/развернуть",

      hotkeys: "Горячие клавиши",
      hotkeysHint: "Нажмите на клавишу справа от команды, чтобы задать своё сочетание. Escape отменяет ввод, Backspace — сбрасывает к умолчанию.",
      hkPressKeys: "Нажмите клавиши…",
      hkChangeHint: "Кликните и нажмите нужное сочетание",
      hkClash: "Уже занято командой: {key}",
      hkGroup_tabs: "Вкладки", hkGroup_request: "Запрос",
      hkGroup_console: "Консоль", hkGroup_ui: "Интерфейс",
      hkNewTab: "Новая вкладка", hkCloseTab: "Закрыть вкладку",
      hkNextTab: "Следующая вкладка", hkPrevTab: "Предыдущая вкладка",
      hkSendRequest: "Отправить запрос",
      hkToggleConsole: "Открыть/закрыть консоль",
      hkClearConsole: "Очистить консоль",
      hkPopoutConsole: "Консоль в отдельном окне",
      hkToggleSidebar: "Скрыть/показать сайдбар",
      hkOpenSettings: "Открыть настройки",
      hkOpenUpdates: "Проверить обновления",
      resetToDefault: "Сбросить к умолчанию", resetAll: "Сбросить все",
      hotkeysResetConfirm: "Все горячие клавиши вернутся к значениям по умолчанию. Продолжить?",
      reset: "Сбросить",
      terminal: "Терминал (Ctrl+`)",
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
      actions: "Действия", create: "Создать", entity: "Сущность",
      noFieldsAutodetect: "Не удалось определить поля автоматически. Отредактируйте JSON вручную.",
      noSimpleFields: "У сущностей нет простых полей для таблицы (только вложенные объекты).",
      editAsForm: "Редактировать как форму",
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
      syncConflictTitle: "Конфликт версий",
      syncConflictMsg: "{who} уже изменил коллекции{when}.\n\nЗабрать чужую версию — ваши правки потеряются.\nПерезаписать своей — чужие правки потеряются.",
      syncTakeTheirs: "Забрать чужую", syncKeepMine: "Перезаписать своей",
      syncLogout: "Выйти из сессии", logout: "Выйти", loggedOut: "Вы вышли из сессии",
      syncLogoutConfirm: "Вы отключитесь от общей сессии и перейдёте в режим «только этот компьютер». Продолжить?",
      syncAutoApply: "Автозагружать без спроса",
      onlineNow: "Онлайн сейчас", uptime: "онлайн", you: "вы",
      promoteToAdmin: "Сделать admin", demoteToMember: "Сделать участником",
      kickUser: "Отключить на 5 мин", kickConfirm: "Отключить этого участника на 5 минут?",
      kick: "Отключить", more: "Ещё", sending: "Отправляем…", loading: "Загружаем…",

      // --- Темы ---
      theme: "Тема", presets: "Пресеты", quickGen: "Быстрая генерация",
      custom: "Кастом", myThemes: "Мои темы",
      clickToApply: "Кликните — тема применится сразу. Отмена вернёт как было.",
      pickColorAndMode: "Выберите главный цвет и режим — сгенерируем всю палитру.",
      mainColor: "Главный цвет", dark: "Тёмная", light: "Светлая", generate: "Сгенерировать",
      accent: "Акцент", bgApp: "Фон приложения", bgPanel: "Фон панелей",
      bgInput: "Фон инпутов", textMain: "Основной текст", textDim: "Второстепенный текст",
      borderColor: "Рамки", success: "Успех", warn: "Предупреждение", danger: "Ошибка",
      borderRadius: "Скругление", fontSize: "Размер шрифта",
      saveThemeAs: "Сохранить как…", themeName: "Имя темы",
      copyJson: "Скопировать JSON", importTheme: "Импорт темы",
      themeCopied: "Тема скопирована в буфер", themeSaved: "Тема сохранена",
      pasteJson: "Вставьте JSON темы", noUserThemes: "Пока нет сохранённых тем. Настройте цвета на вкладке «Кастом» и нажмите «Сохранить как…».",
      defaults: "По умолчанию",

      // --- Sync users / ACL ---
      requireLogin: "Требовать вход по логину/паролю (индивидуальные пользователи и права)",
      firstAdminHint: "При первом запуске создаётся владелец с этими данными. Дальше он управляет остальными пользователями.",
      adminName: "Имя владельца", adminPassword: "Пароль владельца",
      manageUsers: "Пользователи и права", users: "Пользователи", collectionsAcl: "Доступ к коллекциям",
      userName: "Имя пользователя", password: "Пароль", role: "Роль",
      saveUser: "Сохранить", leaveBlankToKeep: "оставьте пустым — не менять",
      aclHint: "Отмечайте, кто видит (👁) и кто может редактировать (✎) каждую коллекцию. «все» — доступ для всех авторизованных.",
      canRead: "Читать", canWrite: "Изменять", collection: "Коллекция",
      login: "Войти", syncLoginTitle: "Вход в сессию",
      syncLoginHint: "Хост требует вход. Введите имя пользователя и пароль, выданные владельцем.",

      // --- Параллельные тесты ---
      parallelTests: "Параллельные тесты",
      parHint: "Одновременно запускаем несколько разных запросов, чтобы найти race conditions: дедлоки, дубли записей, потерянные обновления.",
      parIterations: "Итераций (раундов)", parRoundConcurrency: "Раундов параллельно",
      parDelay: "Задержка между раундами (мс)", selected: "выбрано",
      selectRequests: "Выберите запросы для параллельного запуска",
      selectAll: "Все", selectNone: "Ничего",
      noRequestsYet: "Нет сохранённых запросов. Добавьте в коллекции.",
      selectAtLeastOne: "Выберите хотя бы один запрос",
      rounds: "раундов", running: "Идёт тест…", aborted: "Остановлено", done: "Готово",
      request: "Запрос", flags: "Флаги",

      // --- cURL / импорт / WS / Env / History ---
      importCurl: "Импорт cURL", copyAsCurl: "Скопировать как cURL",
      copiedAsCurl: "Скопировано как cURL", noActiveRequest: "Нет активного запроса",
      curlHint: "Вставьте команду curl из документации, DevTools (Copy → Copy as cURL) или своего скрипта.",
      preview: "Разобрать", openAsTab: "Открыть как вкладку",
      environment: "Окружение", noEnv: "no env", manageEnvs: "Управление окружениями…",
      environments: "Окружения", envHint: "Разные значения переменных для dev/staging/prod. Активное окружение перебивает глобальные.",
      envNamePlaceholder: "Имя нового окружения (dev, staging, prod)",
      add: "Добавить", activate: "Сделать активным", active: "активно",
      noEnvsYet: "Окружений пока нет. Добавьте dev/staging/prod выше.",
      respHistory: "История ответов", saveBaseline: "Сохранить текущий как эталон",
      clearBaseline: "Убрать эталон", showDiff: "Показать diff с эталоном",
      clearHistory: "Очистить историю", baseline: "Эталон", noBaseline: "Эталон не задан",
      historyEmpty: "История пуста", showing: "Показан",
      noChangesFromBaseline: "Изменений относительно эталона нет",
      baselineSaved: "Эталон сохранён",
      hkResponseHistory: "История ответов", hkImportCurl: "Импорт cURL", hkWebsocket: "WebSocket-клиент",

      // --- Мелкие ключи-подписи из свежих модалок ---
      session: "Сессия:", newSessionActive: "Новая сессия под активную вкладку",
      minimizeBg: "Свернуть — тест продолжит крутиться в фоне",
      noDiff: "Нет данных",
      updSrcDev: "запуск из исходников (python main.py). Auto-update отключён. Версия читается из Backend/version.py — правьте её перед сборкой (build.bat 1.0.5).",
      updSrcExe: "собранный exe — auto-update работает",
      load: "Загрузить", create: "Создать", start: "Старт", stop: "Стоп",
      noUsersHint: 'Нет пользователей. Нажмите "Загрузить" или "Создать".',
      usersLoadFail: "Не удалось загрузить пользователей",
      // Sync statuses + errors
      syncModeLocal:  "Синхронизация: выключена",
      syncModeFolder: "Синхронизация: общая папка",
      syncModeHost:   "Синхронизация: этот компьютер — хост",
      syncModeClient: "Синхронизация: подключён к хосту",
      syncOff: "Синхронизация выключена", noHostUrl: "Не задан адрес хоста",
      kickedByAdmin: "Вас исключил admin", busy: "Занято",
      syncBusyWait: "Уже идёт синхронизация, подождите…",
      syncPulledFolder: "Загружено из общей папки", syncSavedFolder: "Сохранено в общую папку",
      syncKicked: "Вас исключил admin. Синхронизация остановлена.",
      aclUpdated: "Права обновлены", loginError: "Ошибка входа",
      adminNameRequired: "Укажите имя владельца", adminPwRequired: "Задайте пароль владельца",
      nameRequired: "Имя обязательно", alreadyExists: "Уже есть",
      newChangesTitle: "Новые изменения в коллекциях",
      newChangesMsg: "На хосте появилась версия {v}{by}. Загрузить сейчас?\n\nВаши локальные правки, не отправленные на хост, могут быть перезаписаны.",
      from: "от",
      // WebSocket messages
      wsAlreadyOpen: "Уже открыто соединение. Закройте текущее и попробуйте снова.",
      wsBadUrl: "URL должен начинаться с ws:// или wss://",
      wsCreateFail: "Не удалось создать соединение",
      wsOpening: "Открываю соединение с",
      wsOpened: "Соединение установлено", wsError: "Ошибка соединения",
      wsClosed: "Соединение закрыто", wsNoConn: "Нет активного соединения",
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
      loadTest: "Нагрузочное тестирование",
      loadNeedRequest: "Откройте вкладку с запросом — тот же запрос будет отправлен N раз.",
      loadCount: "Количество запросов",
      loadDelay: "Задержка на воркер (мс)",
      loadConcurrency: "Параллельно",
      loadConcurrencyHint: "«Параллельно» — сколько запросов идёт одновременно. Реальную нагрузку создаёт именно это значение.",
      loadNoRuns: "— нет сессий —",
      inFlight: "в полёте", points: "точек",
      okRps: "RPS OK", throttled: "Retry-After",
      loadProfile: "Профиль нагрузки",
      profConstant: "Постоянная (сразу N)",
      profRampup: "Ramp-up (плавно 1→N)",
      profSpike: "Spike (резкий выброс)",
      loadRampupSec: "Ramp-up за (сек)",
      loadSpikeSec: "Spike через (сек)",
      loadRespectRetry: "Уважать Retry-After",
      rlPanelTitle: "Rate-limit / CDN — из заголовков ответа",
      rlBudget: "Бюджет", rlReset: "Сброс через", seconds: "с",
      rlLikelyRateLimit: "похоже на rate-limit",
      rlLikelyRefuse: "сервер отказывает в соединениях",
      rlLikelyServerErr: "сервер отдаёт ошибки",
      rlTailBlowup: "Хвост p99/p50 = {ratio}×: очередь копится, часть запросов застревает",
      rlManyRateLimit: "429 ответов много: сервер вежливо просит замедлиться. Стоит снизить concurrency.",
      rlManyErr: "Не долетает > 5%: перегрузили клиент/сеть/сервер. Реального теста сервиса тут нет.",
      loadStart: "Запустить", loadStop: "Остановить",
      loadRunning: "Идёт нагрузка...", loadAborted: "Прервано", loadDone: "Готово",
      loadBadCount: "Введите количество от 1 до 10000",
      loadChartTitle: "Время ответа по запросам (провалы — красные точки)",
      loadNoErrors: "Ошибок не было — все запросы прошли ✓",
      loadErrorTypes: "Типы ошибок",
      loadWillUseTests: "Каждый ответ проверяется вашим Tests-скриптом",
      loadNoTests: "Нет Tests-скрипта — считаем удачей любой 2xx/3xx",
      avgTime: "Ср. время", minMax: "Мин / Макс", totalSize: "Общий размер",
      byStatus: "По статусам", byMethod: "По методам", clear: "Очистить",
      noMetrics: "Нет данных. Отправьте запрос.", when: "Когда", size: "Размер", time: "Время",
      lastChecked: "Последняя проверка",
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
      noVarsHint: "No variables",
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
      openOnGitHub: "Open on GitHub",
      noInstaller: "This release has no installer attached — only the GitHub page",
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
      preRequest: "Pre-request", tests: "Tests",
      preRequestTitle: "Pre-request script",
      preRequestHint: "Runs before variable substitution. You can modify URL, headers, body and variables via pm.",
      testsTitle: "Post-response script",
      testsHint: "Runs after the response. Use pm.test for assertions and pm.variables.set to save data.",
      runNow: "Run", snippets: "Snippets", pickSnippet: "Pick...",
      scriptOkNoTests: "Script executed without errors",
      preScriptFailed: "Pre-request script failed",
      console: "Console", replPlaceholder: "Type a command... (Ctrl+` toggle, Ctrl+L clear)",
      popOut: "Open in separate window", resize: "Resize",
      consoleInSeparateWindow: "Console is open in a separate window",
      sidebarPosition: "Sidebar position",
      sidebarLeft: "Left", sidebarRight: "Right", sidebarFloating: "Floating",

      // --- Hotkeys ---
      collapseAll: "Collapse all", expandAll: "Expand all",
      collapseExpand: "Collapse/expand",

      hotkeys: "Hotkeys",
      hotkeysHint: "Click the key on the right of a command to set your own combo. Escape cancels, Backspace resets to default.",
      hkPressKeys: "Press keys…",
      hkChangeHint: "Click, then press the desired combo",
      hkClash: "Already used by: {key}",
      hkGroup_tabs: "Tabs", hkGroup_request: "Request",
      hkGroup_console: "Console", hkGroup_ui: "Interface",
      hkNewTab: "New tab", hkCloseTab: "Close tab",
      hkNextTab: "Next tab", hkPrevTab: "Previous tab",
      hkSendRequest: "Send request",
      hkToggleConsole: "Toggle console",
      hkClearConsole: "Clear console",
      hkPopoutConsole: "Console in separate window",
      hkToggleSidebar: "Toggle sidebar",
      hkOpenSettings: "Open settings",
      hkOpenUpdates: "Check for updates",
      resetToDefault: "Reset to default", resetAll: "Reset all",
      hotkeysResetConfirm: "All hotkeys will be reset to defaults. Continue?",
      reset: "Reset",
      terminal: "Terminal (Ctrl+`)",
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
      actions: "Actions", create: "Create", entity: "Entity",
      noFieldsAutodetect: "Could not detect fields automatically. Edit the JSON manually.",
      noSimpleFields: "Entities have no simple fields for the table (only nested objects).",
      editAsForm: "Edit as form",
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
      syncConflictTitle: "Version conflict",
      syncConflictMsg: "{who} has already changed the collections{when}.\n\nTake theirs — you lose your edits.\nOverwrite with yours — they lose theirs.",
      syncTakeTheirs: "Take theirs", syncKeepMine: "Overwrite with mine",
      syncLogout: "Leave session", logout: "Leave", loggedOut: "You left the session",
      syncLogoutConfirm: "You will disconnect from the shared session and switch to \"local only\". Continue?",
      syncAutoApply: "Auto-apply without asking",
      onlineNow: "Online now", uptime: "online", you: "you",
      promoteToAdmin: "Promote to admin", demoteToMember: "Demote to member",
      kickUser: "Kick for 5 min", kickConfirm: "Kick this user for 5 minutes?",
      kick: "Kick", more: "More", sending: "Sending…", loading: "Loading…",

      // --- Themes ---
      theme: "Theme", presets: "Presets", quickGen: "Quick generate",
      custom: "Custom", myThemes: "My themes",
      clickToApply: "Click to apply instantly. Cancel reverts.",
      pickColorAndMode: "Pick an accent color and mode — we'll generate the palette.",
      mainColor: "Main color", dark: "Dark", light: "Light", generate: "Generate",
      accent: "Accent", bgApp: "App background", bgPanel: "Panel background",
      bgInput: "Input background", textMain: "Text", textDim: "Dim text",
      borderColor: "Borders", success: "Success", warn: "Warning", danger: "Danger",
      borderRadius: "Border radius", fontSize: "Font size",
      saveThemeAs: "Save as…", themeName: "Theme name",
      copyJson: "Copy JSON", importTheme: "Import theme",
      themeCopied: "Theme copied to clipboard", themeSaved: "Theme saved",
      pasteJson: "Paste theme JSON", noUserThemes: "No saved themes yet. Customize colors in the Custom tab and click \"Save as…\".",
      defaults: "Defaults",

      // --- Sync users / ACL ---
      requireLogin: "Require login (individual users and permissions)",
      firstAdminHint: "On first start we create an owner with these credentials. They manage the other users afterwards.",
      adminName: "Owner name", adminPassword: "Owner password",
      manageUsers: "Users & permissions", users: "Users", collectionsAcl: "Collection access",
      userName: "Username", password: "Password", role: "Role",
      saveUser: "Save", leaveBlankToKeep: "leave blank to keep",
      aclHint: "Check who can view (👁) and edit (✎) each collection. \"all\" = any authenticated user.",
      canRead: "Read", canWrite: "Write", collection: "Collection",
      login: "Log in", syncLoginTitle: "Session login",
      syncLoginHint: "The host requires login. Enter the username and password given by the owner.",

      // --- Parallel tests ---
      parallelTests: "Parallel tests",
      parHint: "Fire multiple different requests at the same time to find race conditions: deadlocks, duplicate records, lost updates.",
      parIterations: "Iterations (rounds)", parRoundConcurrency: "Rounds in parallel",
      parDelay: "Delay between rounds (ms)", selected: "selected",
      selectRequests: "Pick requests to run in parallel",
      selectAll: "All", selectNone: "None",
      noRequestsYet: "No saved requests. Add some to collections first.",
      selectAtLeastOne: "Pick at least one request",
      rounds: "rounds", running: "Running…", aborted: "Aborted", done: "Done",
      request: "Request", flags: "Flags",
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
      loadTest: "Load testing",
      loadNeedRequest: "Open a request tab — the same request will be sent N times.",
      loadCount: "Number of requests",
      loadDelay: "Per-worker delay (ms)",
      loadConcurrency: "Concurrency",
      loadConcurrencyHint: "\"Concurrency\" is how many requests run in parallel. This is what actually creates load.",
      loadNoRuns: "— no sessions —",
      inFlight: "in flight", points: "points",
      okRps: "OK RPS", throttled: "Retry-After",
      loadProfile: "Load profile",
      profConstant: "Constant (N at once)",
      profRampup: "Ramp-up (gradual 1→N)",
      profSpike: "Spike (sudden burst)",
      loadRampupSec: "Ramp-up over (s)",
      loadSpikeSec: "Spike after (s)",
      loadRespectRetry: "Respect Retry-After",
      rlPanelTitle: "Rate-limit / CDN — from response headers",
      rlBudget: "Budget", rlReset: "Resets in", seconds: "s",
      rlLikelyRateLimit: "looks like a rate limit",
      rlLikelyRefuse: "server refusing connections",
      rlLikelyServerErr: "server returning errors",
      rlTailBlowup: "Tail p99/p50 = {ratio}×: queue building up, some requests stuck",
      rlManyRateLimit: "Many 429 responses: server asks you to slow down. Reduce concurrency.",
      rlManyErr: "> 5% not landing: client/network/server saturated. Not really testing the service.",
      loadStart: "Start", loadStop: "Stop",
      loadRunning: "Running load...", loadAborted: "Aborted", loadDone: "Done",
      loadBadCount: "Enter count from 1 to 10000",
      loadChartTitle: "Response time per request (failures — red dots)",
      loadNoErrors: "No errors — all requests passed ✓",
      loadErrorTypes: "Error types",
      loadWillUseTests: "Each response will be validated by your Tests script",
      loadNoTests: "No Tests script — any 2xx/3xx counts as success",
      avgTime: "Avg time", minMax: "Min / Max", totalSize: "Total size",
      byStatus: "By status", byMethod: "By method", clear: "Clear",
      noMetrics: "No data. Send a request.", when: "When", size: "Size", time: "Time",
      lastChecked: "Last checked",

      // --- Fresh keys ---
      session: "Session:", newSessionActive: "New session for the active tab",
      minimizeBg: "Minimize — the test keeps running in background",
      noDiff: "No data",
      updSrcDev: "running from source (python main.py). Auto-update is off. Version comes from Backend/version.py — edit it before building (build.bat 1.0.5).",
      updSrcExe: "built exe — auto-update works",
      load: "Load", create: "Create", start: "Start", stop: "Stop",
      noUsersHint: 'No users yet. Click "Load" or "Create".',
      usersLoadFail: "Failed to load users",
      syncModeLocal:  "Sync: off",
      syncModeFolder: "Sync: shared folder",
      syncModeHost:   "Sync: this machine is host",
      syncModeClient: "Sync: connected to host",
      syncOff: "Sync is off", noHostUrl: "Host address not set",
      kickedByAdmin: "Kicked by admin", busy: "Busy",
      syncBusyWait: "Sync already in progress, please wait…",
      syncPulledFolder: "Loaded from shared folder", syncSavedFolder: "Saved to shared folder",
      syncKicked: "Admin kicked you. Sync stopped.",
      aclUpdated: "Permissions updated", loginError: "Login error",
      adminNameRequired: "Owner name required", adminPwRequired: "Owner password required",
      nameRequired: "Name required", alreadyExists: "Already exists",
      newChangesTitle: "New changes in collections",
      newChangesMsg: "Version {v}{by} is on the host. Load now?\n\nYour local edits not pushed to the host may be overwritten.",
      from: "from",
      wsAlreadyOpen: "Connection is already open. Close the current one and try again.",
      wsBadUrl: "URL must start with ws:// or wss://",
      wsCreateFail: "Failed to create connection",
      wsOpening: "Opening connection to",
      wsOpened: "Connected", wsError: "Connection error",
      wsClosed: "Connection closed", wsNoConn: "No active connection",

      // --- English fills for keys added later on RU side ---
      add: "Add", preview: "Parse",
      importCurl: "Import cURL", copiedAsCurl: "Copied as cURL",
      curlHint: "Paste a curl command from docs, DevTools (Copy → Copy as cURL) or your script.",
      environment: "Environment", environments: "Environments",
      envNamePlaceholder: "New environment name (dev, staging, prod)",
      noEnvsYet: "No environments yet. Add dev/staging/prod above.",
      respHistory: "Response history", historyEmpty: "History is empty",
      clearHistory: "Clear history", clearBaseline: "Clear baseline",
      noChangesFromBaseline: "No changes vs baseline", baselineSaved: "Baseline saved",
      hkResponseHistory: "Response history",
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

    // Модалки, построенные лениво через `${App.t(...)}` в HTML-шаблоне,
    // не обновляются автоматически — они строятся один раз при первом
    // открытии. Удаляем их из DOM: при следующем открытии пересоберутся
    // на актуальном языке.
    LAZY_MODAL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.classList.contains("show")) el.remove();
    });

    // Даём слушателям знать — модули могут перерисовать свои DOM-фрагменты
    _langListeners.forEach((fn) => { try { fn(_lang); } catch (_) {} });
  };

  const _langListeners = [];
  /** Подписка на смену языка — для модулей, которые сами перерисовывают своё DOM. */
  App.onLangChange = function (fn) {
    if (typeof fn === "function") _langListeners.push(fn);
  };

  /**
   * ТОЛЬКО ленивые модалки — те, чья open-функция сама проверяет
   * `if (!document.getElementById(id)) build()`. При смене языка удаляем
   * их из DOM, при следующем open() пересоберутся с новым языком.
   *
   * НЕ включаем сюда модалки, которые построены жёстко в init() —
   * такие после удаления никто не пересоберёт, и в них полезут null-ошибки
   * при следующем открытии. Для них язык применяется при переоткрытии
   * приложения (или отдельным rebuild-механизмом).
   */
  const LAZY_MODAL_IDS = [
    "ws-modal",              // websocket.js — lazy
    "resp-hist-modal",       // responseHistoryUI.js — lazy
    "curl-import-modal",     // curlUI.js — lazy
    "env-mgr-modal",         // environments.js — lazy
    "sync-usersacl-modal",   // syncUI.js — lazy
    "sync-login-modal",      // syncUI.js — создаётся заново каждый раз
  ];

  /** Применить переводы к элементам с data-i18n / data-i18n-title / data-i18n-ph / data-i18n-opt */
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
    // Для <option> в <select> нужно менять именно .text, textContent тоже работает,
    // но браузер иногда кэширует .text. Так надёжнее.
    scope.querySelectorAll("[data-i18n-opt]").forEach(el => {
      el.text = App.t(el.dataset.i18nOpt);
    });
  };

  App.LANGUAGES = [
    { value: "ru", label: "Русский" },
    { value: "en", label: "English" },
  ];
})();
