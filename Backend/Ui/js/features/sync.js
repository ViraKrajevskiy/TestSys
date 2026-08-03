/**
 * sync.js — Совместная работа над коллекциями
 *
 * Режимы:
 *   local  — только на этом компьютере (по умолчанию)
 *   folder — общий файл в папке Dropbox/Яндекс.Диск/OneDrive
 *   host   — этот компьютер = сервер, другие подключаются по IP
 *   client — подключение к чужому хосту
 */
window.App = window.App || {};

(function () {
  const POLL_MS = 8000;
  const CID_KEY = "sync.clientId";
  const TOKEN_KEY = "sync.sessionToken";       // храним в localStorage — переживает перезапуск

  let _pollTimer = null;
  let _lastKnownVersion = 0;   // версия документа, от которой мы правим (host/client)
  let _lastKnownMtime = 0;     // время файла (folder)
  let _busy = false;
  let _clients = [];           // последний известный список участников
  let _myRole = "member";
  let _myUserId = "";
  let _promptOpen = false;     // диалог «загрузить новые изменения?» уже открыт
  let _loginPromptOpen = false;// «требуется вход» модалка уже открыта

  /** Стабильный client_id этого приложения — переживает перезапуск. */
  function clientId() {
    let id = "";
    try { id = localStorage.getItem(CID_KEY) || ""; } catch (_) {}
    if (id) return id;
    // Простой UUIDv4 без зависимостей
    id = "c-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
    try { localStorage.setItem(CID_KEY, id); } catch (_) {}
    return id;
  }
  App.getSyncClientId = clientId;

  App.getSyncClients = () => _clients.slice();
  App.getSyncMyRole  = () => _myRole;
  App.getSyncUserId  = () => _myUserId;

  /** Сессионный токен — выдаёт хост при login, живёт 8 часов. */
  function sessionToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }
  function setSessionToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else   localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
  App.getSyncSessionToken = sessionToken;

  // ============================================================
  // ХЕЛПЕРЫ
  // ============================================================
  function mode() { return (App.getSetting && App.getSetting("syncMode")) || "local"; }
  function clientName() { return (App.getSetting && App.getSetting("syncClientName")) || "user"; }
  function folderPath() { return (App.getSetting && App.getSetting("syncFolderPath")) || ""; }
  function remoteUrl() { return (App.getSetting && App.getSetting("syncRemoteUrl")) || ""; }
  function remoteToken() { return (App.getSetting && App.getSetting("syncRemoteToken")) || ""; }
  function hostPort() { return (App.getSetting && App.getSetting("syncHostPort")) || 8777; }
  function hostToken() { return (App.getSetting && App.getSetting("syncHostToken")) || ""; }

  function api() { return window.pywebview && window.pywebview.api; }

  /** Документ для отправки */
  function _buildDoc(baseVersion) {
    return {
      collections: App.USER_COLLECTIONS.map(c => ({ name: c.name, folders: c.folders })),
      variables: Object.assign({}, App.VARIABLES),
      client_name: clientName(),
      base_version: baseVersion,
    };
  }

  /** Применить полученный документ к локальному состоянию */
  function _applyDoc(doc, mergeVars) {
    if (!doc || !Array.isArray(doc.collections)) return false;
    App.USER_COLLECTIONS = doc.collections.map(c => ({
      name: c.name, builtin: false, folders: c.folders || [],
    }));
    if (mergeVars !== false && doc.variables) {
      Object.entries(doc.variables).forEach(([k, v]) => {
        if (!(k in App.VARIABLES)) App.VARIABLES[k] = v;
      });
    }
    _lastKnownVersion = doc.version || 0;
    App.renderCollections();
    return true;
  }

  // ============================================================
  // PULL — забрать изменения
  // ============================================================
  App.syncPull = async function (silent) {
    const m = mode();
    if (m === "local" || !api()) return { ok: false, error: App.t("syncOff") || "Синхронизация выключена" };
    if (_busy) {
      if (!silent) _toast(App.t("syncBusyWait") || "Уже идёт синхронизация, подождите…", false);
      return { ok: false, error: "busy", silent: true };
    }
    _busy = true;

    try {
      if (m === "folder") {
        const res = await api().shared_folder_read(folderPath());
        if (!res.ok) return { ok: false, error: res.error };
        if (!res.exists) return { ok: true, empty: true };
        const parsed = App.parseImportPayload(res.content);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        _applyDoc({ collections: parsed.collections, variables: parsed.variables }, true);
        _lastKnownMtime = res.mtime;
        if (!silent) _toast(App.t("syncPulledFolder") || "Загружено из общей папки");
        return { ok: true };
      }

      // host — читаем свой же файл через локальный сервер
      const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
      const token = m === "host" ? hostToken() : remoteToken();
      if (!url) return { ok: false, error: App.t("noHostUrl") || "Не задан адрес хоста" };

      const res = await api().sync_client_pull(url, token, clientId(), clientName(), sessionToken());
      if (res.kicked) return { ok: false, error: App.t("kickedByAdmin") || "Вас исключил admin", kicked: true };
      if (res.need_login) { _requireLogin(url); return { ok: false, error: "need_login", silent: true }; }
      if (!res.ok) return { ok: false, error: _humanNetErr(res.error, url) };
      _applyDoc(res.doc, true);
      if (!silent) _toast(`Загружено (версия ${res.doc.version}, ${res.doc.updated_by || "—"})`);
      return { ok: true, version: res.doc.version };
    } finally {
      _busy = false;
    }
  };

  /**
   * Превращаем сетевую портянку в человеческое объяснение.
   * ConnectTimeoutError → «хост не отвечает», «Max retries» → «недоступен» и т.д.
   * Плюс подсказки по типовым причинам.
   */
  App.humanizeSyncError = function (err, url) { return _humanNetErr(err, url); };

  function _humanNetErr(err, url) {
    const raw = String(err || "").toLowerCase();
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();

    // Признаки: TCP-таймаут при попытке подключиться
    if (raw.includes("connecttimeout") || raw.includes("timed out")) {
      const hints = [];
      // 172.20.10.x — iPhone Personal Hotspot: клиенты изолированы друг от друга
      if (/^172\.20\.10\./.test(host)) {
        hints.push("iPhone/мобильный хот-спот: клиенты не видят друг друга (client isolation). Нужен обычный Wi-Fi или проводная сеть.");
      } else {
        hints.push("Проверьте на хосте: приложение запущено и «● Хост запущен»?");
        hints.push("Проверьте брандмауэр Windows на хосте: TestSys должен быть разрешён в частной сети.");
        hints.push("Проверьте, что оба ПК в одной сети (Wi-Fi без «изоляции клиентов», не VPN).");
      }
      return `${host} не отвечает — соединение отвалилось по таймауту.\n\n• ${hints.join("\n• ")}`;
    }
    if (raw.includes("refused") || raw.includes("10061")) {
      return `${host} отклонил соединение — порт открыт, но никто на нём не слушает.\n\n• Хост не запущен, или порт другой.\n• На хосте у TestSys нажат «Стоп»?`;
    }
    if (raw.includes("unreachable") || raw.includes("no route")) {
      return `Нет маршрута до ${host} — вы в разных сетях.\n\n• Проверьте, что обе машины в одной локалке.\n• VPN у кого-то из вас может ломать маршруты.`;
    }
    if (raw.includes("name or service not known") || raw.includes("getaddrinfo") || raw.includes("nodename")) {
      return `Не удалось разрешить имя ${host}. Используйте IP-адрес вместо hostname, или проверьте DNS.`;
    }
    if (raw.includes("401") || raw.includes("токен") || raw.includes("token")) {
      return `Неверный пароль (токен). Уточните у хоста, какой пароль стоит в его настройках синхронизации.`;
    }
    // Что-то экзотическое — отдаём как есть, но короче
    return String(err).split("\n")[0].slice(0, 250);
  }

  // ============================================================
  // PUSH — отправить свои изменения
  // ============================================================
  App.syncPush = async function (opts) {
    const force = opts && opts.force;
    const m = mode();
    if (m === "local" || !api()) return { ok: false, error: App.t("syncOff") || "Синхронизация выключена" };
    if (_busy) return { ok: false, error: App.t("busy") || "Занято" };
    _busy = true;

    try {
      if (m === "folder") {
        // Проверка: не изменил ли кто-то файл, пока мы правили
        if (!force) {
          const mt = await api().shared_folder_mtime(folderPath());
          if (_lastKnownMtime && mt && mt > _lastKnownMtime + 0.5) {
            return { ok: false, conflict: true, reason: "folder" };
          }
        }
        const payload = JSON.stringify(App.buildExportPayload(null), null, 2);
        const res = await api().shared_folder_write(folderPath(), payload);
        if (!res.ok) return { ok: false, error: res.error };
        _lastKnownMtime = res.mtime;
        _toast(App.t("syncSavedFolder") || "Сохранено в общую папку");
        return { ok: true };
      }

      const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
      const token = m === "host" ? hostToken() : remoteToken();
      if (!url) return { ok: false, error: App.t("noHostUrl") || "Не задан адрес хоста" };

      const doc = _buildDoc(force ? undefined : _lastKnownVersion);
      const res = await api().sync_client_push(url, token, JSON.stringify(doc), clientId(), clientName(), sessionToken());
      if (res.kicked) return { ok: false, error: App.t("kickedByAdmin") || "Вас исключил admin", kicked: true };
      if (res.need_login) { _requireLogin(url); return { ok: false, error: "need_login", silent: true }; }

      if (res.conflict) {
        return { ok: false, conflict: true, reason: "version", data: res.data };
      }
      if (!res.ok) return { ok: false, error: _humanNetErr(res.error, url) };

      _lastKnownVersion = res.data.version;
      _toast(`Отправлено (версия ${res.data.version})`);
      return { ok: true, version: res.data.version };
    } finally {
      _busy = false;
    }
  };

  // ============================================================
  // PUSH с разрешением конфликта
  // ============================================================
  App.syncPushWithConflictUI = async function () {
    const res = await App.syncPush();
    if (res.ok || !res.conflict) {
      if (!res.ok && res.error) _toast(App.t("error") + ": " + res.error, true);
      return res;
    }

    const who = res.data ? (res.data.updated_by || "кто-то") : "кто-то";
    const when = res.data ? (res.data.updated_at || "") : "";

    // Раньше был нативный confirm() — он рушится в pywebview и не темизирован.
    // Пользуемся своим модальным диалогом; кнопки красноречивые, чтобы никто
    // не потерял чужие правки из-за формулировки «OK / Отмена».
    const choice = await (App.showConfirm ? App.showConfirm({
      title: App.t("syncConflictTitle") || "Конфликт версий",
      message: (App.t("syncConflictMsg") || "{who} уже изменил коллекции{when}.\n\nЗабрать чужую версию — ваши правки потеряются.\nПерезаписать своей — чужие правки потеряются.")
        .replace("{who}", who).replace("{when}", when ? ` (${when})` : ""),
      okText:     App.t("syncTakeTheirs") || "Забрать чужую",
      cancelText: App.t("syncKeepMine")   || "Перезаписать своей",
      danger: true,
    }) : Promise.resolve(true));

    if (choice) return await App.syncPull();
    return await App.syncPush({ force: true });
  };

  // ============================================================
  // АВТООПРОС — следим за чужими изменениями
  // ============================================================
  App.syncStartPolling = function () {
    App.syncStopPolling();
    if (mode() === "local") return;
    _pollTimer = setInterval(_poll, POLL_MS);
  };

  App.syncStopPolling = function () {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  };

  async function _poll() {
    if (_busy || !api()) return;
    const m = mode();

    try {
      if (m === "folder") {
        const mt = await api().shared_folder_mtime(folderPath());
        if (mt && _lastKnownMtime && mt > _lastKnownMtime + 0.5) {
          _notifyRemoteChange();
        } else if (mt && !_lastKnownMtime) {
          _lastKnownMtime = mt;
        }
        return;
      }

      const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
      const token = m === "host" ? hostToken() : remoteToken();
      if (!url) return;

      // Ping заодно тащит список участников для UI и нашу текущую роль
      const [ping, session] = await Promise.all([
        api().sync_client_ping(url, token, clientId(), clientName(), sessionToken()),
        api().sync_session_list(url, token, clientId(), clientName()).catch(() => ({ ok: false })),
      ]);
      if (session && session.ok && session.data) {
        _clients = session.data.clients || [];
        _publish("clients");
      }
      if (ping.kicked) {
        _publish("kicked");
        App.syncStopPolling();
        _toast(App.t("syncKicked") || "Вас исключил admin. Синхронизация остановлена.", true);
        return;
      }
      if (ping.ok && ping.data) {
        if (ping.data.your_role && ping.data.your_role !== _myRole) {
          _myRole = ping.data.your_role;
          _publish("role");
        }
        if (ping.data.version > _lastKnownVersion) {
          // Всегда спрашиваем, не авто-применяем
          _openChangesDialog(ping.data.version);
        }
      }
    } catch (_) { /* тихо */ }
  }

  /** Диалог «применить новые изменения?» — заменяет старую тонкую полоску */
  async function _openChangesDialog(version) {
    if (_promptOpen) return;
    _promptOpen = true;
    try {
      const who = _clients.length ? (
        // Ищем того, кто последний менял — приблизительно, по updated_by документа
        // (не хранится в ping, но покажем «есть кто-то онлайн»)
        ""
      ) : "";
      const ok = await App.showConfirm({
        title: App.t("newChangesTitle") || "Новые изменения в коллекциях",
        message: (App.t("newChangesMsg") || "На хосте появилась версия {v}{by}. Загрузить сейчас?\n\nВаши локальные правки, не отправленные на хост, могут быть перезаписаны.")
                    .replace("{v}", version).replace("{by}", who ? " " + (App.t("from") || "от") + " " + who : ""),
        okText: App.t("load") || "Загрузить",
        cancelText: App.t("later") || "Позже",
      });
      if (ok) {
        const res = await App.syncPull();
        if (!res.ok && res.error && !res.silent) App.showAlert(res.error);
      }
    } finally { _promptOpen = false; }
  }

  // Простенькая подписка для UI — не хочется тащить event bus ради одного модуля
  const _subs = [];
  App.onSyncEvent = (fn) => { _subs.push(fn); };
  function _publish(kind) { _subs.forEach(fn => { try { fn(kind); } catch (_) {} }); }

  function _notifyRemoteChange(version) {
    // Оставлено для обратной совместимости — теперь используется _openChangesDialog
    _openChangesDialog(version);
  }

  // ============================================================
  // HOST CONTROL
  // ============================================================
  App.syncHostStart = async function (opts) {
    if (!api()) return { ok: false, error: "API недоступен" };
    opts = opts || {};
    // client_id владельца — тот же, что и локальный, чтоб он числился как admin.
    // require_login/admin_name/admin_password — только если хост включает
    // per-user auth. При включении первый раз создаём владельца.
    const res = await api().sync_host_start(
      hostPort(), hostToken(), clientName(), clientId(),
      !!opts.requireLogin,
      opts.adminName || clientName(),
      opts.adminPassword || "",
    );
    if (res.ok) {
      _myRole = "admin";
      // Владельцу дальше ходить не по shared-token, а по session-token.
      // Логинимся сразу после старта, если включён режим логина.
      if (opts.requireLogin && opts.adminPassword) {
        const login = await App.syncLogin(opts.adminName || clientName(), opts.adminPassword);
        if (!login.ok) { /* показывать не будем — статус хоста и так виден */ }
      }
      const pull = await App.syncPull(true);
      if (pull.ok && App.USER_COLLECTIONS.length === 0) { /* ничего */ }
      App.syncStartPolling();
    }
    return res;
  };

  /**
   * Явный logout — сообщаем хосту, что уходим (освободит место в списке),
   * затем переводим в local и останавливаем опрос.
   */
  App.syncLogout = async function () {
    if (!api()) return { ok: false };
    App.syncStopPolling();
    const m = mode();
    if (m === "client" && remoteUrl()) {
      try { await api().sync_session_leave(remoteUrl(), remoteToken(), clientId()); } catch (_) {}
    } else if (m === "host") {
      await App.syncHostStop(true);   // остановит и почистит список
    }
    if (App.saveSettingsObject) {
      await App.saveSettingsObject({ syncMode: "local" });
    }
    _clients = [];
    _publish("clients");
    App.updateSyncBadge && App.updateSyncBadge();
    return { ok: true };
  };

  /**
   * Остановить хост.
   * ВАЖНО: переводим режим в "local" и сохраняем — иначе при следующем
   * запуске initSync() снова поднимет сервер, хотя пользователь его выключил.
   */
  App.syncHostStop = async function (keepMode) {
    if (!api()) return { ok: false };
    App.syncStopPolling();
    const res = await api().sync_host_stop();

    if (!keepMode && App.saveSettingsObject) {
      await App.saveSettingsObject({ syncMode: "local" });
      App.updateSyncBadge && App.updateSyncBadge();
    }
    return res;
  };

  App.syncHostStatus = async function () {
    if (!api()) return { running: false };
    return await api().sync_host_status();
  };

  // ============================================================
  // ADMIN-ДЕЙСТВИЯ (kick / роли) — доступны только admin-у
  // ============================================================
  App.syncSetRole = async function (targetId, role) {
    if (!api()) return { ok: false };
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    const token = m === "host" ? hostToken() : remoteToken();
    return await api().sync_session_set_role(url, token, clientId(), targetId, role);
  };

  App.syncKick = async function (targetId, seconds) {
    if (!api()) return { ok: false };
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    const token = m === "host" ? hostToken() : remoteToken();
    return await api().sync_session_kick(url, token, clientId(), targetId, seconds || 300);
  };

  // autoApply удалён — всегда спрашивать

  // ============================================================
  // ЛОГИН / ЛОГАУТ (per-user auth)
  // ============================================================
  App.syncLogin = async function (username, password) {
    if (!api()) return { ok: false, error: "API недоступен" };
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    if (!url) return { ok: false, error: "Не задан адрес хоста" };
    const res = await api().sync_auth_login(url, username, password, clientId());
    if (res.ok && res.data && res.data.token) {
      setSessionToken(res.data.token);
      _myRole   = res.data.role || "member";
      _myUserId = res.data.user_id || "";
      _publish("role");
      _publish("login");
    }
    return res;
  };

  App.syncAuthLogout = async function () {
    if (!api()) return { ok: false };
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    const tok = sessionToken();
    if (url && tok) {
      try { await api().sync_auth_logout(url, tok, clientId()); } catch (_) {}
    }
    setSessionToken("");
    _myUserId = ""; _myRole = "member";
    _publish("login");
    return { ok: true };
  };

  App.syncListUsers = async function () {
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    return await api().sync_auth_users_list(url, sessionToken(), clientId());
  };
  App.syncSaveUser = async function (name, password, role) {
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    return await api().sync_auth_users_save(url, sessionToken(), name, password, role, clientId());
  };
  App.syncGetAcl = async function () {
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    return await api().sync_acl_get(url, sessionToken(), clientId());
  };
  App.syncSaveAcl = async function (acl) {
    const m = mode();
    const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
    return await api().sync_acl_save(url, sessionToken(), acl, clientId());
  };

  /** Показать модалку логина, когда сервер вернул 401 need_login. */
  async function _requireLogin(url) {
    if (_loginPromptOpen) return;
    _loginPromptOpen = true;
    try {
      if (App.showSyncLoginDialog) {
        await App.showSyncLoginDialog(url);
      } else {
        // Fallback без UI-модалки
        const name = await App.showPrompt({ title: "Требуется вход", label: "Имя пользователя", value: clientName() });
        if (!name) return;
        const pw = await App.showPrompt({ title: "Требуется вход", label: "Пароль", value: "" });
        if (!pw) return;
        const r = await App.syncLogin(name, pw);
        if (!r.ok) App.showAlert((App.t("loginError") || "Ошибка входа") + ": " + (r.error || ""));
      }
    } finally { _loginPromptOpen = false; }
  }

  // ============================================================
  // ПРОВЕРКА ПОДКЛЮЧЕНИЯ (для клиента)
  // ============================================================
  App.syncTestConnection = async function (url, token) {
    if (!api()) return { ok: false, error: "API недоступен" };
    return await api().sync_client_ping(url, token);
  };

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  App.initSync = function () {
    // Дочерние окна (рандомайзер, detached) синхронизацией не управляют
    if (App.isMainWindow && !App.isMainWindow()) return;

    _injectStatusBar();

    // Автостарт по сохранённому режиму
    setTimeout(async () => {
      const m = mode();
      if (m === "local") return;
      if (m === "host") {
        await App.syncHostStart();
      } else {
        await App.syncPull(true);
        App.syncStartPolling();
      }
      _updateStatusBadge();
    }, 1500);
  };

  // ============================================================
  // UI: полоса статуса
  // ============================================================
  function _injectStatusBar() {
    const bar = document.createElement("div");
    bar.id = "sync-status-bar";
    bar.style.cssText = `
      display:none;align-items:center;gap:10px;padding:6px 14px;
      background:var(--bg-input);border-bottom:1px solid var(--accent);
      font-size:12px;color:var(--text-main);flex-shrink:0;`;
    bar.innerHTML = `
      <i class="bi bi-arrow-repeat" style="color:var(--accent);"></i>
      <span id="sync-change-text" style="flex:1;">Коллекции изменены</span>
      <button class="btn btn-sm" id="sync-pull-now" style="font-size:11px;padding:2px 10px;background:var(--accent);color:#fff;border:none;border-radius:4px;">
        Загрузить
      </button>
      <button class="btn btn-sm" id="sync-dismiss" style="font-size:11px;padding:2px 8px;background:none;color:var(--text-dim);border:none;">
        Скрыть
      </button>`;

    const appBody = document.querySelector(".app-body");
    if (appBody && appBody.parentNode) {
      appBody.parentNode.insertBefore(bar, appBody);
    }

    bar.querySelector("#sync-pull-now").addEventListener("click", async () => {
      const res = await App.syncPull();
      bar.style.display = "none";
      if (!res.ok && res.error) _toast(App.t("error") + ": " + res.error, true);
    });
    bar.querySelector("#sync-dismiss").addEventListener("click", () => {
      bar.style.display = "none";
    });
  }

  function _updateStatusBadge() {
    const btn = document.getElementById("sync-btn");
    if (!btn) return;
    const m = mode();
    const icons = { local: "bi-hdd", folder: "bi-folder-symlink", host: "bi-broadcast", client: "bi-plug" };
    btn.innerHTML = `<i class="bi ${icons[m] || "bi-hdd"}"></i>`;
    btn.style.color = m === "local" ? "" : "var(--accent)";
    btn.title = {
      local:  App.t("syncModeLocal")  || "Синхронизация: выключена",
      folder: App.t("syncModeFolder") || "Синхронизация: общая папка",
      host:   App.t("syncModeHost")   || "Синхронизация: этот компьютер — хост",
      client: App.t("syncModeClient") || "Синхронизация: подключён к хосту",
    }[m] || (App.t("sync") || "Синхронизация");
  }
  App.updateSyncBadge = _updateStatusBadge;

  // ============================================================
  // TOAST
  // ============================================================
  function _toast(msg, isError) {
    let t = document.getElementById("sync-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "sync-toast";
      t.style.cssText = `
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        padding:8px 16px;border-radius:var(--radius);font-size:12px;
        z-index:1085;box-shadow:0 4px 16px rgba(0,0,0,.5);transition:opacity .3s;`;
      document.body.appendChild(t);
    }
    t.style.background = isError ? "#dc3545" : "var(--bg-input)";
    t.style.color = isError ? "#fff" : "var(--text-main)";
    t.style.border = `1px solid ${isError ? "#dc3545" : "var(--accent)"}`;
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2800);
  }
  App.syncToast = _toast;
})();
