/**
 * authTab.js — Auth для запросов, папок и коллекций.
 *
 * Типы: Наследовать от родителя / None / Bearer Token / Basic Auth / API Key
 *
 * Данные хранятся в одинаковой структуре на трёх уровнях —
 * tab.auth, folder.auth, collection.auth:
 *   {
 *     type: "inherit" | "none" | "bearer" | "basic" | "apikey",
 *     bearer: { token: "" },
 *     basic:  { username: "", password: "", showPwd: false },
 *     apikey: { key: "X-API-Key", value: "", addTo: "header" }
 *   }
 *
 * НАСЛЕДОВАНИЕ (как в Postman / Insomnia / Bruno):
 *   запрос → папка → коллекция
 * Тип "inherit" означает «спроси у родителя». Запрос знает своего родителя
 * через tab.collectionName / tab.folderName — они проставляются при открытии
 * запроса из дерева коллекций. Вкладка, созданная кнопкой «+», родителя не
 * имеет, поэтому для неё inherit недоступен.
 *
 * Применение происходит в request.js через App.applyAuthToRequest(tab, headersObj, paramsObj).
 */
window.App = window.App || {};

(function () {

  // ── Дефолтная структура ──────────────────────────────────────────────────

  App.defaultAuth = function (type) {
    return {
      type:   type || "none",
      bearer: { token: "" },
      basic:  { username: "", password: "", showPwd: false },
      apikey: { key: "X-API-Key", value: "", addTo: "header" },
    };
  };

  /** Дописывает недостающие поля в объект auth любого уровня. */
  App.ensureAuthShape = function (owner, defaultType) {
    if (!owner) return App.defaultAuth(defaultType);
    if (!owner.auth || typeof owner.auth !== "object") owner.auth = App.defaultAuth(defaultType);
    if (!owner.auth.type)   owner.auth.type   = defaultType || "none";
    if (!owner.auth.bearer) owner.auth.bearer = { token: "" };
    if (!owner.auth.basic)  owner.auth.basic  = { username: "", password: "", showPwd: false };
    if (!owner.auth.apikey) owner.auth.apikey = { key: "X-API-Key", value: "", addTo: "header" };
    return owner.auth;
  };

  function _ensureAuth(tab) {
    // У запроса, открытого из коллекции, дефолт — наследование.
    return App.ensureAuthShape(tab, App.tabHasParent(tab) ? "inherit" : "none");
  }

  // ── Родитель запроса ─────────────────────────────────────────────────────

  App.tabHasParent = function (tab) {
    return !!(tab && tab.collectionName);
  };

  /** Возвращает {collection, folder} для вкладки — либо null'ы. */
  App.getTabParents = function (tab) {
    if (!tab || !tab.collectionName || !Array.isArray(App.COLLECTIONS)) {
      return { collection: null, folder: null };
    }
    const collection = App.COLLECTIONS.find(c => c.name === tab.collectionName) || null;
    const folder = collection && tab.folderName
      ? (collection.folders || []).find(f => f.name === tab.folderName) || null
      : null;
    return { collection, folder };
  };

  /** Реально настроенная авторизация (не "inherit" и не пустая)? */
  function _isConfigured(auth) {
    return !!(auth && auth.type && auth.type !== "inherit");
  }

  /**
   * Разрешает цепочку наследования запрос → папка → коллекция.
   * Возвращает {auth, source, label, collection, folder}, где source:
   *   "self"       — настроено на самом запросе
   *   "folder"     — унаследовано от папки
   *   "collection" — унаследовано от коллекции
   *   "none"       — наследовать не от кого, авторизации нет
   */
  App.resolveEffectiveAuth = function (tab) {
    const selfAuth = tab && tab.auth;
    const { collection, folder } = App.getTabParents(tab);

    if (_isConfigured(selfAuth)) {
      return { auth: selfAuth, source: "self", label: "", collection, folder };
    }
    if (folder && _isConfigured(folder.auth)) {
      return { auth: folder.auth, source: "folder", label: folder.name, collection, folder };
    }
    if (collection && _isConfigured(collection.auth)) {
      return { auth: collection.auth, source: "collection", label: collection.name, collection, folder };
    }
    return { auth: null, source: "none", label: "", collection, folder };
  };

  // ── Проверка: есть ли реальная авторизация ───────────────────────────────

  /** Точка-индикатор на вкладке Auth. Унаследованная авторизация тоже считается. */
  App.authHasBadge = function (tab) {
    const a = App.resolveEffectiveAuth(tab).auth;
    return App.authIsFilled(a);
  };

  App.authIsFilled = function (a) {
    if (!a || !a.type || a.type === "none" || a.type === "inherit") return false;
    if (a.type === "bearer") return !!(a.bearer && a.bearer.token);
    if (a.type === "basic")  return !!(a.basic  && (a.basic.username || a.basic.password));
    if (a.type === "apikey") return !!(a.apikey && a.apikey.value);
    return false;
  };

  // ── Применение к запросу ─────────────────────────────────────────────────

  /**
   * Добавляет заголовки / параметры на основе эффективной авторизации
   * (с учётом наследования от папки и коллекции).
   * Вызывается из request.js перед отправкой.
   * resolve — функция резолва переменных.
   */
  App.applyAuthToRequest = function (tab, headersObj, paramsObj, resolve) {
    const auth = App.resolveEffectiveAuth(tab).auth;
    if (!auth || auth.type === "none" || !auth.type || auth.type === "inherit") return;

    const r = resolve || (s => s);

    if (auth.type === "bearer" && auth.bearer) {
      const token = r(auth.bearer.token || "").trim();
      if (token) headersObj["Authorization"] = "Bearer " + token;
    }

    if (auth.type === "basic" && auth.basic) {
      const u = r(auth.basic.username || "").trim();
      const p = r(auth.basic.password || "");
      if (u || p) {
        headersObj["Authorization"] = "Basic " + btoa(u + ":" + p);
      }
    }

    if (auth.type === "apikey" && auth.apikey) {
      const k = r(auth.apikey.key   || "X-API-Key").trim();
      const v = r(auth.apikey.value || "").trim();
      if (k && v) {
        const addTo = auth.apikey.addTo || "header";
        if (addTo === "query") {
          paramsObj[k] = v;
        } else {
          headersObj[k] = v;
        }
      }
    }
  };

  // ── Диагностика: почему запрос ушёл без авторизации ──────────────────────

  /**
   * Проверяет, отправится ли вообще заголовок авторизации.
   *
   * Самый частый и самый непонятный случай: в поле токена стоит {{token}},
   * а переменная пустая — заголовок молча не уходит, сервер отвечает
   * «Authentication credentials were not provided», и по ответу невозможно
   * понять, что дело в незаполненной переменной.
   *
   * Возвращает null, если всё в порядке, иначе {title, hint}.
   */
  App.authDiagnose = function (tab, resolve) {
    const r = resolve || App.resolveAll || App.resolveVariables || (s => s);
    const eff = App.resolveEffectiveAuth(tab);
    const auth = eff.auth;

    const where = eff.source === "collection" ? ` (задана на коллекции «${eff.label}»)`
                : eff.source === "folder"     ? ` (задана на папке «${eff.label}»)`
                : "";

    if (!auth || !auth.type || auth.type === "none" || auth.type === "inherit") {
      if (eff.source === "none" && App.tabHasParent(tab)) {
        return {
          title: "Запрос ушёл без авторизации",
          hint: "У запроса выбрано «Наследовать от родителя», но ни у папки, "
              + "ни у коллекции авторизация не настроена.",
        };
      }
      return {
        title: "Запрос ушёл без авторизации",
        hint: "Во вкладке Auth выбран тип «No Auth». Если эндпоинт защищён — "
            + "выберите Bearer Token или наследование от коллекции.",
      };
    }

    // Ищем незаполненные переменные в значении
    const raw = auth.type === "bearer" ? (auth.bearer && auth.bearer.token) || ""
              : auth.type === "apikey" ? (auth.apikey && auth.apikey.value) || ""
              : auth.type === "basic"  ? [(auth.basic && auth.basic.username) || "",
                                          (auth.basic && auth.basic.password) || ""].join("")
              : "";
    const resolved = String(r(raw) || "").trim();
    if (resolved) return null;   // значение есть — авторизация точно ушла

    const vars = String(raw).match(/\{\{\s*([\w.-]+)\s*\}\}/g) || [];
    if (vars.length) {
      const names = [...new Set(vars.map(v => v.replace(/[{}\s]/g, "")))];
      const missing = names.filter(n => !App.VARIABLES || !String(App.VARIABLES[n] || "").trim());
      return {
        title: `Переменная ${missing.map(n => "{{" + n + "}}").join(", ")} пуста — заголовок не отправлен`,
        hint: "Заголовок авторизации не ушёл, поэтому сервер и ответил 401"
            + where + ". Отправьте сначала запрос, который выдаёт токен "
            + "(обычно login) — его Tests-скрипт заполнит переменную, и повторите этот запрос.",
      };
    }

    return {
      title: "Значение авторизации пустое — заголовок не отправлен",
      hint: `Тип авторизации — ${App.authSummary(auth)}${where}, но поле не заполнено.`,
    };
  };

  // ── Человекочитаемое описание авторизации ────────────────────────────────

  App.authSummary = function (auth) {
    if (!auth || !auth.type || auth.type === "none") return "без авторизации";
    if (auth.type === "inherit") return "наследует от родителя";
    if (auth.type === "bearer") {
      const t = (auth.bearer && auth.bearer.token) || "";
      return "Bearer Token" + (t ? ` · ${_short(t)}` : " · не задан");
    }
    if (auth.type === "basic") {
      const u = (auth.basic && auth.basic.username) || "";
      return "Basic Auth" + (u ? ` · ${u}` : " · не задан");
    }
    if (auth.type === "apikey") {
      const k = (auth.apikey && auth.apikey.key) || "";
      const where = (auth.apikey && auth.apikey.addTo) === "query" ? "query" : "header";
      return `API Key · ${k || "key"} (${where})`;
    }
    return auth.type;
  };

  function _short(s) {
    s = String(s);
    return s.length > 26 ? s.slice(0, 14) + "…" + s.slice(-6) : s;
  }

  // ── UI: вкладка Auth у запроса ───────────────────────────────────────────

  App.renderAuthTab = function (container, tab) {
    const auth = _ensureAuth(tab);
    const hasParent = App.tabHasParent(tab);

    container.innerHTML = `
      <div class="auth-tab-wrap">
        <div class="auth-type-row">
          <label class="auth-type-label">Тип авторизации</label>
          <select class="form-select form-select-sm auth-type-select" id="auth-type-select">
            ${hasParent ? `<option value="inherit" ${auth.type === "inherit" ? "selected" : ""}>Наследовать от родителя</option>` : ""}
            <option value="none"   ${auth.type === "none"   ? "selected" : ""}>No Auth</option>
            <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>Bearer Token</option>
            <option value="basic"  ${auth.type === "basic"  ? "selected" : ""}>Basic Auth</option>
            <option value="apikey" ${auth.type === "apikey" ? "selected" : ""}>API Key</option>
          </select>
        </div>
        <div id="auth-fields"></div>
        <div class="auth-hint" id="auth-hint" style="display:none;"></div>
      </div>`;

    const typeSelect = container.querySelector("#auth-type-select");
    typeSelect.addEventListener("change", () => {
      auth.type = typeSelect.value;
      _renderTabFields(container, tab, auth);
      App.renderTabBar && App.renderTabBar();   // обновить точку-индикатор
    });

    _renderTabFields(container, tab, auth);
  };

  /** Поля вкладки Auth: либо обычный редактор, либо панель наследования. */
  function _renderTabFields(container, tab, auth) {
    const box  = container.querySelector("#auth-fields");
    const hint = container.querySelector("#auth-hint");

    box.innerHTML = "";
    hint.style.display = "none";

    if (auth.type !== "inherit") {
      App.renderAuthEditor(box, auth, {
        onChange: () => App.renderTabBar && App.renderTabBar(),
        rerender: () => _renderTabFields(container, tab, auth),
        hintEl: hint,
      });
      return;
    }

    // ── Режим наследования ────────────────────────────────────────────────
    const eff = App.resolveEffectiveAuth(tab);
    const box2 = document.createElement("div");
    box2.className = "auth-inherit-box";

    if (eff.source === "none") {
      box2.innerHTML = `
        <div class="auth-inherit-head">
          <i class="bi bi-diagram-2"></i>
          <span>Ни у папки, ни у коллекции авторизация не настроена</span>
        </div>
        <div class="auth-inherit-desc">
          Задайте её один раз на коллекции — и все запросы внутри будут
          использовать её автоматически.
        </div>`;
    } else {
      const what = eff.source === "folder" ? "папки" : "коллекции";
      box2.innerHTML = `
        <div class="auth-inherit-head">
          <i class="bi ${eff.source === "folder" ? "bi-folder2" : "bi-collection"}"></i>
          <span>Наследует от ${what} <b>${_esc(eff.label)}</b></span>
        </div>
        <div class="auth-inherit-desc">${_esc(App.authSummary(eff.auth))}</div>`;
    }

    const btnRow = document.createElement("div");
    btnRow.className = "auth-inherit-actions";

    if (eff.collection) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-sm btn-outline-secondary";
      const target = eff.source === "folder" ? eff.folder : eff.collection;
      const isFolder = eff.source === "folder";
      editBtn.innerHTML = `<i class="bi bi-pencil"></i> ${eff.source === "none"
        ? "Настроить в коллекции"
        : `Изменить в ${isFolder ? "папке" : "коллекции"}`}`;
      editBtn.addEventListener("click", async () => {
        const owner = eff.source === "none" ? eff.collection : target;
        const kind  = (eff.source === "folder") ? "folder" : "collection";
        const saved = await App.showAuthEditor(owner, kind);
        if (saved) _renderTabFields(container, tab, auth);
      });
      btnRow.appendChild(editBtn);

      // Если наследуем от коллекции, но лежим в папке — даём задать и на папке
      if (eff.source !== "folder" && eff.folder) {
        const fBtn = document.createElement("button");
        fBtn.type = "button";
        fBtn.className = "btn btn-sm btn-outline-secondary";
        fBtn.innerHTML = `<i class="bi bi-folder2"></i> Задать на папке`;
        fBtn.addEventListener("click", async () => {
          const saved = await App.showAuthEditor(eff.folder, "folder");
          if (saved) _renderTabFields(container, tab, auth);
        });
        btnRow.appendChild(fBtn);
      }
    } else {
      box2.querySelector(".auth-inherit-desc").textContent =
        "Запрос не привязан к коллекции — наследовать не от кого.";
    }

    box.appendChild(box2);
    if (btnRow.children.length) box.appendChild(btnRow);
  }

  // ── UI: универсальный редактор полей (запрос / папка / коллекция) ────────

  /**
   * Рисует поля выбранного типа авторизации в container.
   * auth  — объект авторизации (мутируется на месте)
   * opts  — { onChange, rerender, hintEl }
   */
  App.renderAuthEditor = function (container, auth, opts) {
    opts = opts || {};
    const onChange = opts.onChange || function () {};
    const rerender = opts.rerender || function () {};
    const hint = opts.hintEl || null;

    const setHint = (html) => {
      if (!hint) return;
      hint.style.display = "";
      hint.innerHTML = html;
    };

    container.innerHTML = "";
    if (hint) hint.style.display = "none";

    if (auth.type === "none" || !auth.type) {
      setHint("Запрос отправляется без авторизации.");
      return;
    }

    if (auth.type === "bearer") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Token</label>
          <div class="auth-field-row">
            <input type="text" class="form-control form-control-sm auth-field-input" data-auth="bearer-token"
                   placeholder="{{token}} или eyJhbGci…"
                   value="${_esc(auth.bearer.token)}">
          </div>
        </div>`;
      container.querySelector('[data-auth="bearer-token"]').addEventListener("input", e => {
        auth.bearer.token = e.target.value;
        onChange();
      });
      setHint(`Добавляет заголовок: <code>Authorization: Bearer &lt;token&gt;</code>`);
      return;
    }

    if (auth.type === "basic") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Username</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="basic-user"
                 placeholder="{{username}}" value="${_esc(auth.basic.username)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Password</label>
          <div class="auth-field-row">
            <input type="${auth.basic.showPwd ? "text" : "password"}"
                   class="form-control form-control-sm auth-field-input" data-auth="basic-pwd"
                   placeholder="{{password}}" value="${_esc(auth.basic.password)}">
            <button type="button" class="btn btn-sm btn-outline-secondary auth-eye-btn" data-auth="pwd-toggle"
                    title="${auth.basic.showPwd ? "Скрыть" : "Показать"}">
              <i class="bi bi-eye${auth.basic.showPwd ? "-slash" : ""}"></i>
            </button>
          </div>
        </div>`;
      container.querySelector('[data-auth="basic-user"]').addEventListener("input", e => {
        auth.basic.username = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="basic-pwd"]').addEventListener("input", e => {
        auth.basic.password = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="pwd-toggle"]').addEventListener("click", () => {
        auth.basic.showPwd = !auth.basic.showPwd;
        rerender();
      });
      setHint(`Добавляет заголовок: <code>Authorization: Basic base64(user:pass)</code>`);
      return;
    }

    if (auth.type === "apikey") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Key</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="apikey-key"
                 placeholder="X-API-Key" value="${_esc(auth.apikey.key)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Value</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="apikey-val"
                 placeholder="{{apiKey}}" value="${_esc(auth.apikey.value)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Добавить в</label>
          <select class="form-select form-select-sm auth-field-input" data-auth="apikey-addto">
            <option value="header" ${auth.apikey.addTo === "header" ? "selected" : ""}>Header</option>
            <option value="query"  ${auth.apikey.addTo === "query"  ? "selected" : ""}>Query Params</option>
          </select>
        </div>`;
      container.querySelector('[data-auth="apikey-key"]').addEventListener("input", e => {
        auth.apikey.key = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="apikey-val"]').addEventListener("input", e => {
        auth.apikey.value = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="apikey-addto"]').addEventListener("change", e => {
        auth.apikey.addTo = e.target.value;
        rerender();
      });
      const addTo = auth.apikey.addTo || "header";
      setHint(addTo === "query"
        ? `Добавляет query-параметр: <code>?${_esc(auth.apikey.key || "key")}=…</code>`
        : `Добавляет заголовок: <code>${_esc(auth.apikey.key || "key")}: …</code>`);
      return;
    }
  };


  // ── Авто-обновление токена при 401 ───────────────────────────────────────
  //
  // Настраивается на коллекции: collection.tokenRefresh = {
  //   enabled: true,
  //   method: "POST",
  //   url: "{{baseUrl}}/api/auth/login/refresh/",
  //   body: '{"refresh": "{{refresh}}"}',
  //   tokenPath: "access",        // путь к новому токену в ответе
  //   tokenVar: "token",          // куда его положить
  //   refreshPath: "refresh",     // (необязательно) новый refresh-токен
  //   refreshVar: "refresh",
  // }

  App.defaultTokenRefresh = function () {
    return {
      enabled: false,
      method: "POST",
      url: "",
      body: '{"refresh": "{{refresh}}"}',
      tokenPath: "access",
      tokenVar: "token",
      refreshPath: "refresh",
      refreshVar: "refresh",
    };
  };

  /** Достаёт значение по пути вида "data.tokens.access" или "items[0].id". */
  function _pluck(obj, path) {
    if (!path) return undefined;
    return String(path).split(/[.\[\]]+/).filter(Boolean).reduce(
      (acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  /** Настройка refresh для вкладки — ищем на папке, затем на коллекции. */
  App.getTokenRefreshConfig = function (tab) {
    const { collection, folder } = App.getTabParents(tab);
    const cand = [folder && folder.tokenRefresh, collection && collection.tokenRefresh];
    for (const c of cand) {
      if (c && c.enabled && (c.url || "").trim()) return c;
    }
    return null;
  };

  // Состояние обновления токена. Держим на уровне модуля, а не вкладки:
  // если десять вкладок одновременно получили 401, обновлять токен нужно
  // ОДИН раз, а не десять.
  let _refreshInflight = null;   // промис текущего обновления (single-flight)
  let _refreshLastAt   = 0;      // когда последний раз успешно обновили
  let _refreshFails    = 0;      // сколько раз подряд обновление не помогло

  const REFRESH_COOLDOWN_MS = 2000;  // чаще этого обновляться бессмысленно
  const REFRESH_MAX_FAILS   = 3;     // после этого перестаём пытаться

  /** Сброс — вызывается после успешного логина. */
  App.resetTokenRefreshState = function () {
    _refreshInflight = null;
    _refreshLastAt = 0;
    _refreshFails = 0;
  };

  /**
   * Повтор после обновления токена всё равно вернул 401 — значит, обновление
   * не помогает. Считаем неудачи, чтобы не долбить сервер вечно.
   */
  App.markRefreshIneffective = function () {
    _refreshFails += 1;
    if (_refreshFails >= REFRESH_MAX_FAILS) {
      App.logWarn && App.logWarn("Auth",
        "Обновление токена не помогает — авто-обновление отключено до следующего успешного логина. "
        + "Отправьте запрос login вручную.");
    }
  };

  /** Является ли этот запрос самим refresh-эндпоинтом (его повторять нельзя). */
  function _isRefreshRequest(tab, cfg) {
    if (!cfg || !tab || !tab.url) return false;
    const r = App.resolveAll || App.resolveVariables || (s => s);
    const norm = u => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    return norm(r(tab.url)) === norm(r(cfg.url));
  }

  /**
   * Дёргает refresh-эндпоинт и кладёт новый токен в переменную.
   *
   * Возвращает true, если токен обновился — тогда исходный запрос имеет
   * смысл повторить. Защищено от штормов: одновременные вызовы разделяют
   * один запрос, есть пауза между обновлениями и предохранитель на случай,
   * когда обновление не помогает.
   */
  App.tryRefreshToken = async function (tab) {
    const cfg = App.getTokenRefreshConfig(tab);
    if (!cfg) return false;
    if (_isRefreshRequest(tab, cfg)) return false;   // сам refresh не обновляем
    if (_refreshFails >= REFRESH_MAX_FAILS) return false;
    if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.send_request) return false;

    // Уже обновляем — не плодим второй запрос, ждём тот же результат
    if (_refreshInflight) return _refreshInflight;

    // Только что обновились, а токен всё равно не подошёл — повтор не поможет
    if (Date.now() - _refreshLastAt < REFRESH_COOLDOWN_MS) return false;

    _refreshInflight = (async () => {
      const resolve = App.resolveAll || App.resolveVariables || (s => s);
      const url = resolve(cfg.url || "").trim();
      if (!/^https?:\/\//i.test(url)) {
        App.logWarn && App.logWarn("Auth", `Refresh не выполнен: некорректный URL «${url}»`);
        _refreshFails += 1;
        return false;
      }

      try {
        const body = cfg.body ? resolve(cfg.body) : null;
        const resp = await window.pywebview.api.send_request(
          (cfg.method || "POST").toUpperCase(), url,
          { "Content-Type": "application/json" }, {},
          body && body.trim() ? body : null,
        );

        if (!resp || !resp.ok || resp.status_code >= 400) {
          const code = resp && resp.status_code ? resp.status_code : "нет ответа";
          App.logWarn && App.logWarn("Auth",
            `Refresh не удался (${code}). Скорее всего, refresh-токен истёк — нужен новый вход через login.`);
          _refreshFails += 1;
          return false;
        }

        let data;
        try { data = JSON.parse(resp.text || "null"); }
        catch { App.logWarn && App.logWarn("Auth", "Refresh вернул не JSON"); _refreshFails += 1; return false; }

        const newToken = _pluck(data, cfg.tokenPath || "access");
        if (newToken === undefined || newToken === null || newToken === "") {
          App.logWarn && App.logWarn("Auth",
            `В ответе refresh нет поля «${cfg.tokenPath || "access"}»`);
          _refreshFails += 1;
          return false;
        }

        App.VARIABLES[cfg.tokenVar || "token"] = String(newToken);

        // Некоторые API на refresh отдают и новый refresh-токен (ротация).
        // Если его не сохранить, следующий refresh упадёт.
        if (cfg.refreshPath && cfg.refreshVar) {
          const newRefresh = _pluck(data, cfg.refreshPath);
          if (newRefresh) App.VARIABLES[cfg.refreshVar] = String(newRefresh);
        }

        _refreshLastAt = Date.now();
        App.saveCollections && App.saveCollections();
        App.renderCollections && App.renderCollections();
        return true;
      } catch (e) {
        App.logWarn && App.logWarn("Auth", "Refresh упал: " + (e && e.message || e));
        _refreshFails += 1;
        return false;
      }
    })();

    try {
      return await _refreshInflight;
    } finally {
      _refreshInflight = null;
    }
  };

  // ── UI: вкладка Auth у запроса ───────────────────────────────────────────

  App.renderAuthTab = function (container, tab) {
    const auth = _ensureAuth(tab);
    const hasParent = App.tabHasParent(tab);

    container.innerHTML = `
      <div class="auth-tab-wrap">
        <div class="auth-type-row">
          <label class="auth-type-label">Тип авторизации</label>
          <select class="form-select form-select-sm auth-type-select" id="auth-type-select">
            ${hasParent ? `<option value="inherit" ${auth.type === "inherit" ? "selected" : ""}>Наследовать от родителя</option>` : ""}
            <option value="none"   ${auth.type === "none"   ? "selected" : ""}>No Auth</option>
            <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>Bearer Token</option>
            <option value="basic"  ${auth.type === "basic"  ? "selected" : ""}>Basic Auth</option>
            <option value="apikey" ${auth.type === "apikey" ? "selected" : ""}>API Key</option>
          </select>
        </div>
        <div id="auth-fields"></div>
        <div class="auth-hint" id="auth-hint" style="display:none;"></div>
      </div>`;

    const typeSelect = container.querySelector("#auth-type-select");
    typeSelect.addEventListener("change", () => {
      auth.type = typeSelect.value;
      _renderTabFields(container, tab, auth);
      App.renderTabBar && App.renderTabBar();   // обновить точку-индикатор
    });

    _renderTabFields(container, tab, auth);
  };

  /** Поля вкладки Auth: либо обычный редактор, либо панель наследования. */
  function _renderTabFields(container, tab, auth) {
    const box  = container.querySelector("#auth-fields");
    const hint = container.querySelector("#auth-hint");

    box.innerHTML = "";
    hint.style.display = "none";

    if (auth.type !== "inherit") {
      App.renderAuthEditor(box, auth, {
        onChange: () => App.renderTabBar && App.renderTabBar(),
        rerender: () => _renderTabFields(container, tab, auth),
        hintEl: hint,
      });
      return;
    }

    // ── Режим наследования ────────────────────────────────────────────────
    const eff = App.resolveEffectiveAuth(tab);
    const box2 = document.createElement("div");
    box2.className = "auth-inherit-box";

    if (eff.source === "none") {
      box2.innerHTML = `
        <div class="auth-inherit-head">
          <i class="bi bi-diagram-2"></i>
          <span>Ни у папки, ни у коллекции авторизация не настроена</span>
        </div>
        <div class="auth-inherit-desc">
          Задайте её один раз на коллекции — и все запросы внутри будут
          использовать её автоматически.
        </div>`;
    } else {
      const what = eff.source === "folder" ? "папки" : "коллекции";
      box2.innerHTML = `
        <div class="auth-inherit-head">
          <i class="bi ${eff.source === "folder" ? "bi-folder2" : "bi-collection"}"></i>
          <span>Наследует от ${what} <b>${_esc(eff.label)}</b></span>
        </div>
        <div class="auth-inherit-desc">${_esc(App.authSummary(eff.auth))}</div>`;
    }

    const btnRow = document.createElement("div");
    btnRow.className = "auth-inherit-actions";

    if (eff.collection) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-sm btn-outline-secondary";
      const target = eff.source === "folder" ? eff.folder : eff.collection;
      const isFolder = eff.source === "folder";
      editBtn.innerHTML = `<i class="bi bi-pencil"></i> ${eff.source === "none"
        ? "Настроить в коллекции"
        : `Изменить в ${isFolder ? "папке" : "коллекции"}`}`;
      editBtn.addEventListener("click", async () => {
        const owner = eff.source === "none" ? eff.collection : target;
        const kind  = (eff.source === "folder") ? "folder" : "collection";
        const saved = await App.showAuthEditor(owner, kind);
        if (saved) _renderTabFields(container, tab, auth);
      });
      btnRow.appendChild(editBtn);

      // Если наследуем от коллекции, но лежим в папке — даём задать и на папке
      if (eff.source !== "folder" && eff.folder) {
        const fBtn = document.createElement("button");
        fBtn.type = "button";
        fBtn.className = "btn btn-sm btn-outline-secondary";
        fBtn.innerHTML = `<i class="bi bi-folder2"></i> Задать на папке`;
        fBtn.addEventListener("click", async () => {
          const saved = await App.showAuthEditor(eff.folder, "folder");
          if (saved) _renderTabFields(container, tab, auth);
        });
        btnRow.appendChild(fBtn);
      }
    } else {
      box2.querySelector(".auth-inherit-desc").textContent =
        "Запрос не привязан к коллекции — наследовать не от кого.";
    }

    box.appendChild(box2);
    if (btnRow.children.length) box.appendChild(btnRow);
  }

  // ── UI: универсальный редактор полей (запрос / папка / коллекция) ────────

  /**
   * Рисует поля выбранного типа авторизации в container.
   * auth  — объект авторизации (мутируется на месте)
   * opts  — { onChange, rerender, hintEl }
   */
  App.renderAuthEditor = function (container, auth, opts) {
    opts = opts || {};
    const onChange = opts.onChange || function () {};
    const rerender = opts.rerender || function () {};
    const hint = opts.hintEl || null;

    const setHint = (html) => {
      if (!hint) return;
      hint.style.display = "";
      hint.innerHTML = html;
    };

    container.innerHTML = "";
    if (hint) hint.style.display = "none";

    if (auth.type === "none" || !auth.type) {
      setHint("Запрос отправляется без авторизации.");
      return;
    }

    if (auth.type === "bearer") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Token</label>
          <div class="auth-field-row">
            <input type="text" class="form-control form-control-sm auth-field-input" data-auth="bearer-token"
                   placeholder="{{token}} или eyJhbGci…"
                   value="${_esc(auth.bearer.token)}">
          </div>
        </div>`;
      container.querySelector('[data-auth="bearer-token"]').addEventListener("input", e => {
        auth.bearer.token = e.target.value;
        onChange();
      });
      setHint(`Добавляет заголовок: <code>Authorization: Bearer &lt;token&gt;</code>`);
      return;
    }

    if (auth.type === "basic") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Username</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="basic-user"
                 placeholder="{{username}}" value="${_esc(auth.basic.username)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Password</label>
          <div class="auth-field-row">
            <input type="${auth.basic.showPwd ? "text" : "password"}"
                   class="form-control form-control-sm auth-field-input" data-auth="basic-pwd"
                   placeholder="{{password}}" value="${_esc(auth.basic.password)}">
            <button type="button" class="btn btn-sm btn-outline-secondary auth-eye-btn" data-auth="pwd-toggle"
                    title="${auth.basic.showPwd ? "Скрыть" : "Показать"}">
              <i class="bi bi-eye${auth.basic.showPwd ? "-slash" : ""}"></i>
            </button>
          </div>
        </div>`;
      container.querySelector('[data-auth="basic-user"]').addEventListener("input", e => {
        auth.basic.username = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="basic-pwd"]').addEventListener("input", e => {
        auth.basic.password = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="pwd-toggle"]').addEventListener("click", () => {
        auth.basic.showPwd = !auth.basic.showPwd;
        rerender();
      });
      setHint(`Добавляет заголовок: <code>Authorization: Basic base64(user:pass)</code>`);
      return;
    }

    if (auth.type === "apikey") {
      container.innerHTML = `
        <div class="auth-field-group">
          <label class="auth-field-label">Key</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="apikey-key"
                 placeholder="X-API-Key" value="${_esc(auth.apikey.key)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Value</label>
          <input type="text" class="form-control form-control-sm auth-field-input" data-auth="apikey-val"
                 placeholder="{{apiKey}}" value="${_esc(auth.apikey.value)}">
        </div>
        <div class="auth-field-group">
          <label class="auth-field-label">Добавить в</label>
          <select class="form-select form-select-sm auth-field-input" data-auth="apikey-addto">
            <option value="header" ${auth.apikey.addTo === "header" ? "selected" : ""}>Header</option>
            <option value="query"  ${auth.apikey.addTo === "query"  ? "selected" : ""}>Query Params</option>
          </select>
        </div>`;
      container.querySelector('[data-auth="apikey-key"]').addEventListener("input", e => {
        auth.apikey.key = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="apikey-val"]').addEventListener("input", e => {
        auth.apikey.value = e.target.value;
        onChange();
      });
      container.querySelector('[data-auth="apikey-addto"]').addEventListener("change", e => {
        auth.apikey.addTo = e.target.value;
        rerender();
      });
      const addTo = auth.apikey.addTo || "header";
      setHint(addTo === "query"
        ? `Добавляет query-параметр: <code>?${_esc(auth.apikey.key || "key")}=…</code>`
        : `Добавляет заголовок: <code>${_esc(auth.apikey.key || "key")}: …</code>`);
      return;
    }
  };


  // ── UI: диалог авторизации коллекции / папки ─────────────────────────────

  let _authModalReady = false;
  let _authResolve = null;

  function _ensureAuthModal() {
    if (_authModalReady) return;
    _authModalReady = true;

    document.body.insertAdjacentHTML("beforeend", `
    <div class="modal fade" id="app-auth-modal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="app-auth-title">Авторизация</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="auth-tab-wrap">
              <div class="auth-type-row">
                <label class="auth-type-label">Тип авторизации</label>
                <select class="form-select form-select-sm auth-type-select" id="app-auth-type"></select>
              </div>
              <div id="app-auth-fields"></div>
              <div class="auth-hint" id="app-auth-hint" style="display:none;"></div>
            </div>
            <div class="auth-scope-note" id="app-auth-scope"></div>
            <div id="app-auth-refresh-wrap"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="app-auth-save">Сохранить</button>
          </div>
        </div>
      </div>
    </div>`);

    const modal = document.getElementById("app-auth-modal");
    modal.addEventListener("hidden.bs.modal", () => _finishAuth(false));
  }

  function _finishAuth(val) {
    if (_authResolve) { const r = _authResolve; _authResolve = null; r(val); }
  }

  function _hideAuthModal() {
    try {
      const el = document.getElementById("app-auth-modal");
      const inst = window.bootstrap && bootstrap.Modal.getInstance(el);
      if (inst) inst.hide();
    } catch (e) {
      console.warn("[Auth] не удалось закрыть диалог:", e);
    }
  }

  /**
   * Открывает диалог авторизации для коллекции или папки.
   * owner — объект коллекции/папки, kind — "collection" | "folder".
   * Возвращает Promise<boolean> — сохранено или нет.
   */
  App.showAuthEditor = function (owner, kind) {
    _ensureAuthModal();
    if (!owner) return Promise.resolve(false);

    const isFolder = kind === "folder";
    // Папка по умолчанию наследует от коллекции, коллекция — корень цепочки.
    const auth = App.ensureAuthShape(owner, isFolder ? "inherit" : "none");
    // Правки применяем на копии — Отмена не должна ничего менять.
    const draft = JSON.parse(JSON.stringify(auth));

    document.getElementById("app-auth-title").textContent =
      (isFolder ? "Авторизация папки: " : "Авторизация коллекции: ") + (owner.name || "");

    document.getElementById("app-auth-scope").innerHTML = isFolder
      ? `Применяется ко всем запросам этой папки, у которых выбрано
         <b>«Наследовать от родителя»</b>. Перебивает настройку коллекции.`
      : `Применяется ко всем запросам коллекции, у которых выбрано
         <b>«Наследовать от родителя»</b>.`;

    const typeSel = document.getElementById("app-auth-type");
    typeSel.innerHTML = `
      ${isFolder ? `<option value="inherit">Наследовать от коллекции</option>` : ""}
      <option value="none">No Auth</option>
      <option value="bearer">Bearer Token</option>
      <option value="basic">Basic Auth</option>
      <option value="apikey">API Key</option>`;
    typeSel.value = draft.type;

    const fields = document.getElementById("app-auth-fields");
    const hint   = document.getElementById("app-auth-hint");

    const draw = () => App.renderAuthEditor(fields, draft, { rerender: draw, hintEl: hint });

    typeSel.onchange = () => { draft.type = typeSel.value; draw(); };
    draw();

    // Авто-refresh настраиваем здесь же — он логически часть авторизации
    const refreshDraft = JSON.parse(JSON.stringify(
      owner.tokenRefresh || App.defaultTokenRefresh()));
    _renderRefreshBlock(document.getElementById("app-auth-refresh-wrap"), refreshDraft);

    const saveBtn = document.getElementById("app-auth-save");
    saveBtn.onclick = () => {
      owner.auth = draft;
      owner.tokenRefresh = refreshDraft;
      App.saveCollections && App.saveCollections();

      // Промис резолвим ПЕРВЫМ делом. Если сначала прятать модалку и на этом
      // словить исключение, вызвавшая сторона зависнет в await навсегда.
      _finishAuth(true);
      _hideAuthModal();

      // Активная вкладка могла наследовать отсюда — перерисуем
      App.renderTabContent && App.renderTabContent();
      App.renderTabBar && App.renderTabBar();
      App.renderCollections && App.renderCollections();
    };

    return new Promise((resolve) => {
      _authResolve = resolve;
      bootstrap.Modal.getOrCreateInstance(document.getElementById("app-auth-modal")).show();
    });
  };

  /** Блок настройки авто-обновления токена при 401. */
  function _renderRefreshBlock(wrap, cfg) {
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="auth-refresh-box">
        <label class="auth-refresh-head">
          <input type="checkbox" id="tr-enabled" ${cfg.enabled ? "checked" : ""}>
          <span>Автоматически обновлять токен при 401</span>
        </label>
        <div class="auth-refresh-desc">
          Получив 401, TestSys сам дёрнет этот запрос, положит новый токен
          в переменную и повторит исходный запрос.
        </div>
        <div class="auth-refresh-fields" id="tr-fields" style="${cfg.enabled ? "" : "display:none;"}">
          <div class="auth-field-group">
            <label class="auth-field-label">URL обновления</label>
            <input type="text" id="tr-url" class="form-control form-control-sm auth-field-input"
                   placeholder="{{baseUrl}}/api/auth/login/refresh/" value="${_esc(cfg.url)}">
          </div>
          <div class="auth-field-group">
            <label class="auth-field-label">Тело запроса</label>
            <textarea id="tr-body" rows="2"
                      class="form-control form-control-sm auth-field-input">${_esc(cfg.body)}</textarea>
          </div>
          <div class="auth-refresh-row">
            <div class="auth-field-group">
              <label class="auth-field-label">Поле с новым токеном</label>
              <input type="text" id="tr-token-path" class="form-control form-control-sm auth-field-input"
                     placeholder="access" value="${_esc(cfg.tokenPath)}">
            </div>
            <div class="auth-field-group">
              <label class="auth-field-label">Сохранять в переменную</label>
              <input type="text" id="tr-token-var" class="form-control form-control-sm auth-field-input"
                     placeholder="token" value="${_esc(cfg.tokenVar)}">
            </div>
          </div>
          <div class="auth-refresh-row">
            <div class="auth-field-group">
              <label class="auth-field-label">Новый refresh (если есть)</label>
              <input type="text" id="tr-refresh-path" class="form-control form-control-sm auth-field-input"
                     placeholder="refresh" value="${_esc(cfg.refreshPath)}">
            </div>
            <div class="auth-field-group">
              <label class="auth-field-label">В переменную</label>
              <input type="text" id="tr-refresh-var" class="form-control form-control-sm auth-field-input"
                     placeholder="refresh" value="${_esc(cfg.refreshVar)}">
            </div>
          </div>
        </div>
      </div>`;

    const chk = wrap.querySelector("#tr-enabled");
    chk.addEventListener("change", () => {
      cfg.enabled = chk.checked;
      wrap.querySelector("#tr-fields").style.display = chk.checked ? "" : "none";
    });
    const bind = (id, key) => {
      wrap.querySelector(id).addEventListener("input", e => { cfg[key] = e.target.value; });
    };
    bind("#tr-url", "url");
    bind("#tr-body", "body");
    bind("#tr-token-path", "tokenPath");
    bind("#tr-token-var", "tokenVar");
    bind("#tr-refresh-path", "refreshPath");
    bind("#tr-refresh-var", "refreshVar");
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

})();
