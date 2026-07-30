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

  let _pollTimer = null;
  let _lastKnownVersion = 0;   // версия документа, от которой мы правим (host/client)
  let _lastKnownMtime = 0;     // время файла (folder)
  let _busy = false;

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
    if (m === "local" || !api()) return { ok: false, error: "Синхронизация выключена" };
    if (_busy) return { ok: false, error: "Занято" };
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
        if (!silent) _toast("Загружено из общей папки");
        return { ok: true };
      }

      // host — читаем свой же файл через локальный сервер
      const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
      const token = m === "host" ? hostToken() : remoteToken();
      if (!url) return { ok: false, error: "Не задан адрес хоста" };

      const res = await api().sync_client_pull(url, token);
      if (!res.ok) return { ok: false, error: res.error };
      _applyDoc(res.doc, true);
      if (!silent) _toast(`Загружено (версия ${res.doc.version}, ${res.doc.updated_by || "—"})`);
      return { ok: true, version: res.doc.version };
    } finally {
      _busy = false;
    }
  };

  // ============================================================
  // PUSH — отправить свои изменения
  // ============================================================
  App.syncPush = async function (opts) {
    const force = opts && opts.force;
    const m = mode();
    if (m === "local" || !api()) return { ok: false, error: "Синхронизация выключена" };
    if (_busy) return { ok: false, error: "Занято" };
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
        _toast("Сохранено в общую папку");
        return { ok: true };
      }

      const url = m === "host" ? `http://127.0.0.1:${hostPort()}` : remoteUrl();
      const token = m === "host" ? hostToken() : remoteToken();
      if (!url) return { ok: false, error: "Не задан адрес хоста" };

      const doc = _buildDoc(force ? undefined : _lastKnownVersion);
      const res = await api().sync_client_push(url, token, JSON.stringify(doc));

      if (res.conflict) {
        return { ok: false, conflict: true, reason: "version", data: res.data };
      }
      if (!res.ok) return { ok: false, error: res.error };

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
      if (!res.ok && res.error) _toast("Ошибка: " + res.error, true);
      return res;
    }

    const who = res.data ? (res.data.updated_by || "кто-то") : "кто-то";
    const when = res.data ? (res.data.updated_at || "") : "";
    const msg =
      `Конфликт: ${who} уже изменил коллекции${when ? " (" + when + ")" : ""}.\n\n` +
      `OK — забрать чужую версию (свои правки потеряются)\n` +
      `Отмена — перезаписать своей версией (чужие правки потеряются)`;

    if (confirm(msg)) {
      return await App.syncPull();
    }
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

      const res = await api().sync_client_ping(url, token);
      if (res.ok && res.data && res.data.version > _lastKnownVersion) {
        _notifyRemoteChange(res.data.version);
      }
    } catch (_) { /* тихо */ }
  }

  function _notifyRemoteChange(version) {
    const bar = document.getElementById("sync-status-bar");
    if (!bar) return;
    bar.style.display = "flex";
    bar.querySelector("#sync-change-text").textContent =
      version ? `Есть новая версия коллекций (${version})` : "Коллекции изменены другим участником";
  }

  // ============================================================
  // HOST CONTROL
  // ============================================================
  App.syncHostStart = async function () {
    if (!api()) return { ok: false, error: "API недоступен" };
    const res = await api().sync_host_start(hostPort(), hostToken(), clientName());
    if (res.ok) {
      // Первичная загрузка своих коллекций на сервер, если он пуст
      const pull = await App.syncPull(true);
      if (pull.ok && App.USER_COLLECTIONS.length === 0) {
        // сервер пуст и локально пусто — ничего не делаем
      }
      App.syncStartPolling();
    }
    return res;
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
      if (!res.ok && res.error) _toast("Ошибка: " + res.error, true);
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
      local: "Синхронизация: выключена",
      folder: "Синхронизация: общая папка",
      host: "Синхронизация: этот компьютер — хост",
      client: "Синхронизация: подключён к хосту",
    }[m] || "Синхронизация";
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
