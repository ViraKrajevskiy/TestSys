window.App = window.App || {};

(function () {
  const { state } = App;

  App.createTab = function (overrides) {
    // Первая (стартовая) вкладка получает демо-URL — чтобы пользователь
    // сразу видел, как выглядит запрос. Все последующие — пустые,
    // как в Postman/Insomnia: иначе одинаковый URL в двух вкладках
    // выглядит как «одна и та же вкладка».
    const isFirstTab = state.tabs.length === 0;
    const tab = {
      id: state.nextId++,
      method: "GET",
      url: isFirstTab ? "https://jsonplaceholder.typicode.com/users" : "",
      params: [],
      headers: [{ key: "Content-Type", value: "application/json" }],
      body: "",
      activeSubTab: "params",
      responseViewMode: "body",
      sending: false,
      response: null,
      userAgent: "",
      preScript: "",       // выполняется перед отправкой
      testScript: "",      // выполняется после ответа
      lastTests: null,     // результаты последнего запуска pm.test
      crudEntity: null,
      crudAction: null,
      // Родитель в дереве коллекций — по нему работает наследование
      // авторизации. У вкладки, открытой кнопкой «+», родителя нет.
      collectionName: null,
      folderName: null,
      // Multipart-загрузка: если files непустой, запрос уходит как
      // multipart/form-data (JSON body игнорируется).
      files: [],           // [{field, path, name, size}]
      formFields: [],      // [{key, value, enabled}] — текстовые поля формы
      // Опции запроса (вкладка «Настройки»)
      ignoreSsl: false,       // не проверять SSL-сертификат
      followRedirects: true,  // идти по 3xx
      timeoutSec: 0,          // 0 = глобальный таймаут из настроек
      description: "",         // заметка для команды
    };
    Object.assign(tab, overrides || {});
    return tab;
  };

  App.getActiveTab = function () {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  };

  App.addTab = function (overrides) {
    if (state.tabs.length >= App.LIMITS.MAX_TABS) {
      App.showAlert(`${App.t("maxTabsReached")} ${App.LIMITS.MAX_TABS}`);
      return null;
    }
    const tab = App.createTab(overrides);
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    App.renderAll();
    App.saveSession && App.saveSession();
    return tab;
  };

  App.selectTab = function (id) {
    state.activeTabId = id;
    App.renderAll();
    App.saveSession && App.saveSession();
  };

  App.closeTab = function (id) {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    setTimeout(() => App.saveSession && App.saveSession(), 0);
    const wasActive = state.activeTabId === id;
    state.tabs.splice(idx, 1);

    if (state.tabs.length === 0) {
      if (!state.isDetachedWindow) {
        App.addTab();
        return;
      }
      state.activeTabId = null;
      App.renderAll();
      return;
    }

    if (wasActive) {
      const nextIdx = Math.min(idx, state.tabs.length - 1);
      state.activeTabId = state.tabs[nextIdx].id;
      App.renderAll();
    } else {
      App.renderTabBar();
    }
  };

  /**
   * Дублировать вкладку: копируем все поля запроса (без ответа/истории),
   * вставляем сразу после оригинала и делаем активной.
   */
  App.duplicateTab = function (id) {
    const src = state.tabs.find(t => t.id === id);
    if (!src) return;
    if (state.tabs.length >= App.LIMITS.MAX_TABS) {
      App.showAlert && App.showAlert(`${App.t("maxTabsReached")} ${App.LIMITS.MAX_TABS}`);
      return;
    }
    // Копируем только «запросные» поля, не тащим ответ / историю
    const clone = App.createTab({
      method:        src.method,
      url:           src.url,
      params:        JSON.parse(JSON.stringify(src.params || [])),
      headers:       JSON.parse(JSON.stringify(src.headers || [])),
      body:          src.body || "",
      userAgent:     src.userAgent || "",
      preScript:     src.preScript || "",
      testScript:    src.testScript || "",
      auth:          src.auth ? JSON.parse(JSON.stringify(src.auth)) : undefined,
      formFields:    JSON.parse(JSON.stringify(src.formFields || [])),
      activeSubTab:  src.activeSubTab || "params",
      // Опции запроса — тоже копируем
      ignoreSsl:       !!src.ignoreSsl,
      followRedirects: src.followRedirects !== false,
      timeoutSec:      src.timeoutSec || 0,
      description:     src.description || "",
      // Название с суффиксом — чтобы отличить от оригинала
      title:         src.title ? src.title + " (copy)" : "",
      // Привязку к коллекции не копируем — дубль не должен перезаписывать оригинал
    });
    const srcIdx = state.tabs.findIndex(t => t.id === id);
    state.tabs.splice(srcIdx + 1, 0, clone);
    state.activeTabId = clone.id;
    App.renderAll();
    App.saveSession && App.saveSession();
  };

  App.closeOtherTabs = function (keepId) {
    state.tabs = state.tabs.filter((t) => t.id === keepId);
    state.activeTabId = keepId;
    App.renderAll();
  };

  App.closeAllTabs = function () {
    state.tabs = [];
    if (!state.isDetachedWindow) {
      App.addTab();
    } else {
      state.activeTabId = null;
      App.renderAll();
    }
  };

  /**
   * Автозаголовок — если пользователь сам не задал имя вкладки.
   * tab.title имеет приоритет: пользовательское имя не должно
   * перезаписываться при изменении URL.
   */
  App.tabTitle = function (tab) {
    if (tab.title && tab.title.trim()) return tab.title;

    if (tab.method === "RANDOMIZER") return "🎲 Randomizer";
    if (tab.method === "USERS")      return "👥 Users";

    if (tab.crudAction) {
      const labels = { list: "Users", read: "User", create: "Create", update: "Update", delete: "Delete" };
      if (labels[tab.crudAction]) return labels[tab.crudAction];
    }
    try {
      const u = new URL(tab.url);
      return u.pathname === "/" ? u.hostname : u.pathname.split("/").filter(Boolean).pop() || u.hostname;
    } catch {
      return tab.url || "Request";
    }
  };

  /**
   * Переименовать вкладку. Пустое имя — сбросить на автозаголовок.
   */
  App.renameTab = function (tabId, newTitle) {
    const tab = App.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const name = (newTitle || "").trim();
    tab.title = name || "";     // "" = использовать автозаголовок
    App.renderTabBar();
    App.saveSession && App.saveSession();
  };

  App.syncTabOrderFromDom = function () {
    const container = document.getElementById("tabs-container");
    const orderedIds = Array.from(container.children).map(el => parseInt(el.dataset.tabId, 10));
    state.tabs.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    App.saveSession && App.saveSession();
  };

  // ============================================================
  // СЕССИЯ: вкладки переживают перезапуск приложения
  // ============================================================
  // Раньше при закрытии TestSys все открытые вкладки терялись, хотя в
  // Postman/Insomnia они восстанавливаются. Пишем в tabs.json с задержкой,
  // чтобы не дёргать диск на каждое нажатие клавиши.

  // Поля ответа не сохраняем: они большие, быстро протухают и после
  // перезапуска всё равно бессмысленны.
  const _PERSIST_FIELDS = [
    "method", "url", "params", "headers", "body", "title",
    "activeSubTab", "responseViewMode", "userAgent",
    "preScript", "testScript", "auth",
    "collectionName", "folderName", "requestName",
    "crudEntity", "crudAction", "formFields",
    // Опции запроса
    "ignoreSsl", "followRedirects", "timeoutSec", "description",
  ];

  let _saveTimer = null;
  let _sessionLoaded = false;

  App.markSessionLoaded = function () { _sessionLoaded = true; };

  App.saveSession = function () {
    // До окончания загрузки не сохраняем — иначе пустой список затрёт файл
    if (!_sessionLoaded) return;
    if (state.isDetachedWindow) return;   // дочернее окно сессией не владеет
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.save_tabs) return;
      try {
        const payload = {
          version: 1,
          activeTabId: state.activeTabId,
          tabs: state.tabs
            // Рандомайзер и Users — служебные вкладки, восстанавливать нечего
            .filter(t => t.method !== "RANDOMIZER" && t.method !== "USERS")
            .map(t => {
              const o = {};
              _PERSIST_FIELDS.forEach(k => { if (t[k] !== undefined) o[k] = t[k]; });
              o.id = t.id;
              return o;
            }),
        };
        await window.pywebview.api.save_tabs(JSON.stringify(payload));
      } catch (e) {
        console.warn("[Session] save error:", e);
      }
    }, 600);
  };

  /** Немедленная запись сессии, минуя дебаунс — для beforeunload. */
  App.flushSession = function () {
    if (!_sessionLoaded || state.isDetachedWindow) return;
    clearTimeout(_saveTimer);
    _saveTimer = null;
    try {
      const payload = {
        version: 1,
        activeTabId: state.activeTabId,
        tabs: state.tabs
          .filter(t => t.method !== "RANDOMIZER" && t.method !== "USERS")
          .map(t => {
            const o = {};
            _PERSIST_FIELDS.forEach(k => { if (t[k] !== undefined) o[k] = t[k]; });
            o.id = t.id;
            return o;
          }),
      };
      window.pywebview.api.save_tabs(JSON.stringify(payload));
    } catch (e) { /* окно уже закрывается — глотаем */ }
  };

  App.loadSession = async function () {
    const api = await App.waitForApi("load_tabs", 5000);
    if (!api) { _sessionLoaded = true; return false; }
    try {
      const raw = await window.pywebview.api.load_tabs();
      if (!raw) { _sessionLoaded = true; return false; }
      const data = JSON.parse(raw);
      const saved = Array.isArray(data) ? data : (data.tabs || []);
      if (!saved.length) { _sessionLoaded = true; return false; }

      state.tabs = saved.map(t => App.createTab(t));
      // id мог сохраниться — продолжаем нумерацию с максимума, иначе
      // новые вкладки получат тот же id и перезапись поедет.
      state.nextId = Math.max(...state.tabs.map(t => t.id || 0)) + 1;

      const wanted = Array.isArray(data) ? null : data.activeTabId;
      state.activeTabId = state.tabs.some(t => t.id === wanted)
        ? wanted : state.tabs[0].id;

      _sessionLoaded = true;
      App.renderAll();
      return true;
    } catch (e) {
      console.warn("[Session] load error:", e);
      _sessionLoaded = true;
      return false;
    }
  };

  // ============================================================
  // Ctrl+S — сохранить вкладку обратно в коллекцию
  // ============================================================
  // Правки URL/тела/заголовков во вкладке жили только в памяти: закрыл
  // вкладку — правки пропали, в дереве остался старый вариант.

  /** Находит запись коллекции, из которой открыта вкладка. */
  App.findTabSourceEntry = function (tab) {
    if (!tab || !tab.collectionName || !tab.folderName) return null;
    const collection = (App.COLLECTIONS || []).find(c => c.name === tab.collectionName);
    if (!collection || collection.builtin) return null;
    const folder = (collection.folders || []).find(f => f.name === tab.folderName);
    if (!folder) return null;
    const name = tab.requestName || tab.title;
    const idx = (folder.items || []).findIndex(it => it.name === name);
    if (idx === -1) return null;
    return { collection, folder, idx, entry: folder.items[idx] };
  };

  /** Отличается ли вкладка от сохранённого в коллекции запроса? */
  App.tabIsDirty = function (tab) {
    const src = App.findTabSourceEntry(tab);
    if (!src) return false;
    const e = src.entry;
    if ((e.method || "") !== (tab.method || "")) return true;
    if ((e.url || "") !== (tab.url || "")) return true;
    if ((e.body || "") !== (tab.body || "")) return true;
    return false;
  };

  /**
   * Вкладка не привязана к коллекции — спрашиваем, куда её положить,
   * и создаём новый запрос. Иначе Ctrl+S на свободной вкладке молчал бы.
   */
  App.saveTabAsNewRequest = async function (tab) {
    const cols = (App.USER_COLLECTIONS || []).filter(c => !c.builtin);
    if (!cols.length) {
      App.showAlert && App.showAlert("Сначала создайте коллекцию — сохранять некуда");
      return false;
    }
    const targets = [];
    cols.forEach(c => (c.folders || []).forEach(f =>
      targets.push({ label: `${c.name} / ${f.name}`, collection: c, folder: f })));
    if (!targets.length) {
      App.showAlert && App.showAlert("В коллекции нет ни одной папки — создайте её");
      return false;
    }

    const picked = await App.showPickList({
      title: "Сохранить запрос",
      label: "Куда сохранить",
      options: targets.map(t => t.label),
      nameLabel: "Название запроса",
      nameValue: App.tabTitle(tab),
    });
    if (!picked) return false;

    const target = targets[picked.index];
    const entry = {
      method: tab.method,
      name: picked.name,
      url: tab.url,
    };
    if (tab.body && tab.body.trim()) entry.body = tab.body;
    if (tab.preScript && tab.preScript.trim()) entry.preScript = tab.preScript;
    if (tab.testScript && tab.testScript.trim()) entry.testScript = tab.testScript;
    if (tab.auth) entry.auth = JSON.parse(JSON.stringify(tab.auth));
    if (tab.description && tab.description.trim()) entry.description = tab.description;
    if (tab.ignoreSsl) entry.ignoreSsl = true;
    if (tab.followRedirects === false) entry.followRedirects = false;
    if (tab.timeoutSec && Number(tab.timeoutSec) > 0) entry.timeoutSec = Number(tab.timeoutSec);

    target.folder.items = target.folder.items || [];
    target.folder.items.push(entry);

    // Привязываем вкладку к новому месту — следующий Ctrl+S обновит её же
    tab.collectionName = target.collection.name;
    tab.folderName = target.folder.name;
    tab.requestName = entry.name;

    App.saveCollections && App.saveCollections();
    App.renderCollections && App.renderCollections();
    App.renderTabBar && App.renderTabBar();
    App.saveSession && App.saveSession();
    App.showAlert && App.showAlert(`✓ Создан запрос: ${target.label} / ${entry.name}`);
    return true;
  };

  /**
   * Сохраняет текущую вкладку в её запрос коллекции.
   * Если вкладка не привязана к коллекции — предлагает выбрать, куда положить.
   */
  App.saveTabToCollection = async function (tabId) {
    const tab = state.tabs.find(t => t.id === (tabId ?? state.activeTabId));
    if (!tab) return false;
    if (tab.method === "RANDOMIZER" || tab.method === "USERS") return false;

    const src = App.findTabSourceEntry(tab);
    if (!src) {
      // Вкладка не из коллекции — предлагаем сохранить как новый запрос
      return App.saveTabAsNewRequest ? App.saveTabAsNewRequest(tab) : false;
    }

    Object.assign(src.entry, {
      method: tab.method,
      url: tab.url,
      name: tab.requestName || src.entry.name,
    });
    if (tab.body && tab.body.trim()) src.entry.body = tab.body;
    else delete src.entry.body;
    // Pre-request и Tests тоже сохраняем — они часть запроса
    if (tab.preScript && tab.preScript.trim()) src.entry.preScript = tab.preScript;
    else delete src.entry.preScript;
    if (tab.testScript && tab.testScript.trim()) src.entry.testScript = tab.testScript;
    else delete src.entry.testScript;
    // Опции запроса
    if (tab.description && tab.description.trim()) src.entry.description = tab.description;
    else delete src.entry.description;
    if (tab.ignoreSsl) src.entry.ignoreSsl = true;
    else delete src.entry.ignoreSsl;
    if (tab.followRedirects === false) src.entry.followRedirects = false;
    else delete src.entry.followRedirects;
    if (tab.timeoutSec && Number(tab.timeoutSec) > 0) src.entry.timeoutSec = Number(tab.timeoutSec);
    else delete src.entry.timeoutSec;
    // Авторизацию запроса тоже запоминаем — иначе при повторном открытии
    // вкладка опять свалится в наследование.
    if (tab.auth) src.entry.auth = JSON.parse(JSON.stringify(tab.auth));

    App.saveCollections && App.saveCollections();
    App.renderCollections && App.renderCollections();
    App.renderTabBar && App.renderTabBar();
    App.showAlert && App.showAlert(
      `✓ Сохранено: ${src.collection.name} / ${src.folder.name} / ${src.entry.name}`);
    return true;
  };

})();