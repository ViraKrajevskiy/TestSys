/**
 * syncUI.js — Модалка настройки совместной работы
 */
window.App = window.App || {};

(function () {
  let _modal = null;

  App.initSyncUI = function () {
    document.body.insertAdjacentHTML("beforeend", _modalHtml());
    const el = document.getElementById("sync-modal");
    _modal = bootstrap.Modal.getOrCreateInstance(el);

    document.getElementById("sync-btn")?.addEventListener("click", async () => {
      _fillForm();
      await _refreshHostStatus();
      _modal.show();
    });

    // Переключение режима — показываем нужную секцию
    document.querySelectorAll('input[name="sync-mode"]').forEach(r => {
      r.addEventListener("change", () => _showSection(r.value));
    });

    // Выбор папки
    document.getElementById("sync-pick-folder").addEventListener("click", async () => {
      if (!window.pywebview?.api?.pick_shared_folder) return;
      const res = await window.pywebview.api.pick_shared_folder();
      if (res.ok) document.getElementById("sync-folder-path").value = res.path;
    });

    // Показ полей владельца по чекбоксу require_login
    document.getElementById("sync-require-login").addEventListener("change", (e) => {
      document.getElementById("sync-admin-fields").style.display = e.target.checked ? "" : "none";
    });

    // Хост: старт / стоп
    document.getElementById("sync-host-start").addEventListener("click", async () => {
      await _saveForm();
      const requireLogin = document.getElementById("sync-require-login").checked;
      const adminName    = document.getElementById("sync-admin-name").value.trim();
      const adminPw      = document.getElementById("sync-admin-pw").value;
      if (requireLogin && !adminName) {
        App.showAlert(App.t("adminNameRequired") || "Укажите имя владельца"); return;
      }
      if (requireLogin && !adminPw) {
        App.showAlert(App.t("adminPwRequired") || "Задайте пароль владельца"); return;
      }
      const res = await App.syncHostStart({
        requireLogin, adminName, adminPassword: adminPw,
      });
      if (res.ok) {
        App.syncToast(App.t("hostRunning") + " :" + res.port);
        await _refreshHostStatus();
      } else {
        App.showAlert(App.t("error") + ": " + (res.error || "?"));
      }
    });

    // Пользователи и права
    document.getElementById("sync-manage-users").addEventListener("click", () => {
      App.showUsersAndAcl && App.showUsersAndAcl();
    });

    document.getElementById("sync-host-stop").addEventListener("click", async () => {
      await App.syncHostStop();          // внутри переводит режим в "local"
      // Синхронизируем форму: режим больше не "host"
      const localRadio = document.querySelector('input[name="sync-mode"][value="local"]');
      if (localRadio) { localRadio.checked = true; _showSection("local"); }
      App.syncToast(App.t("hostStopped"));
      await _refreshHostStatus();
    });

    // Клиент: проверка связи
    document.getElementById("sync-test-conn").addEventListener("click", async () => {
      const url = document.getElementById("sync-remote-url").value.trim();
      const token = document.getElementById("sync-remote-token").value;
      const out = document.getElementById("sync-test-result");
      const btn = document.getElementById("sync-test-conn");
      if (!url) { out.textContent = App.t("hostAddress"); out.style.color = "#dc3545"; return; }

      btn.disabled = true;
      out.innerHTML = `<i class="bi bi-hourglass-split"></i> ${App.t("checking")}`;
      out.style.color = "var(--text-dim)";
      try {
        const res = await App.syncTestConnection(url, token);
        if (res.ok && res.data) {
          out.innerHTML = `✅ ${App.t("connectionOk")} — «${_esc(res.data.host)}», v${res.data.version}` +
            (res.data.protected ? ` 🔒 ${App.t("protected")}` : "");
          out.style.color = "#28a745";
        } else {
          // Прогоняем ошибку через тот же анализатор, что и pull/push
          const human = App.humanizeSyncError ? App.humanizeSyncError(res.error, url) : (res.error || App.t("noResponse"));
          out.innerHTML = `❌ <span style="white-space:pre-wrap;">${_esc(human)}</span>`;
          out.style.color = "#dc3545";
        }
      } finally { btn.disabled = false; }
    });

    // Ручные Pull / Push — с блокировкой кнопок пока идёт запрос,
    // чтобы юзер не ловил «Занято» после второго клика.
    document.getElementById("sync-pull-btn").addEventListener("click", async () => {
      _setSyncActionsBusy(true, "pull");
      try {
        const res = await App.syncPull();
        if (!res.ok && res.error && !res.silent) App.showAlert(res.error);
      } finally { _setSyncActionsBusy(false); }
    });
    document.getElementById("sync-push-btn").addEventListener("click", async () => {
      _setSyncActionsBusy(true, "push");
      try {
        await App.syncPushWithConflictUI();
      } finally { _setSyncActionsBusy(false); }
    });

    document.getElementById("sync-logout-btn").addEventListener("click", async () => {
      const ok = await App.showConfirm({
        title: App.t("syncLogout") || "Выйти из сессии",
        message: App.t("syncLogoutConfirm") || "Вы отключитесь от общей сессии и перейдёте в режим «только этот компьютер». Продолжить?",
        okText: App.t("logout") || "Выйти", danger: true,
      });
      if (!ok) return;
      const r = await App.syncLogout();
      if (r.ok) {
        App.syncToast(App.t("loggedOut") || "Вы вышли из сессии");
        _modal.hide();
      }
    });

    document.getElementById("sync-auto-apply").addEventListener("change", (e) => {
      App.syncSetAutoApply(e.target.checked);
      try { localStorage.setItem("sync.autoApply", e.target.checked ? "1" : "0"); } catch (_) {}
    });
    // Подтягиваем сохранённое значение при открытии
    try {
      const saved = localStorage.getItem("sync.autoApply") === "1";
      App.syncSetAutoApply(saved);
      document.getElementById("sync-auto-apply").checked = saved;
    } catch (_) {}

    // Подписываемся на обновления списка участников (пуш каждые 8с из _poll)
    App.onSyncEvent && App.onSyncEvent((kind) => {
      if (kind === "clients" || kind === "role") _renderClients();
    });

    // Живая подсказка на ввод адреса хоста — детектим iPhone/мобильный
    // hotspot по IP-диапазону, ещё до попытки подключения.
    document.getElementById("sync-remote-url")?.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      const box = document.getElementById("sync-net-warn");
      if (!box) return;
      const hint = _networkHint(url);
      box.innerHTML = hint || "";
      box.style.display = hint ? "" : "none";
    });

    // Сохранить
    document.getElementById("sync-save-btn").addEventListener("click", async () => {
      await _saveForm();
      const m = _currentMode();

      App.syncStopPolling();
      if (m === "host") {
        const res = await App.syncHostStart();
        if (!res.ok) { App.showAlert(App.t("error") + ": " + res.error); return; }
      } else if (m === "client" || m === "folder") {
        const res = await App.syncPull(true);
        if (!res.ok && res.error) { App.showAlert(App.t("error") + ": " + res.error); return; }
        App.syncStartPolling();
      }

      App.updateSyncBadge();
      _modal.hide();
      App.syncToast(App.t("settingsSaved"));
    });
  };

  /**
   * Модалка входа — показывается когда сервер вернул 401 need_login.
   * Простая: имя + пароль. Токен сохраняется в localStorage автоматически.
   */
  App.showSyncLoginDialog = function (url) {
    return new Promise((resolve) => {
      if (document.getElementById("sync-login-modal")) {
        document.getElementById("sync-login-modal").remove();
      }
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="sync-login-modal" tabindex="-1">
          <div class="modal-dialog modal-sm modal-dialog-centered">
            <div class="modal-content theme-modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-shield-lock me-2"></i>${App.t("syncLoginTitle") || "Вход в сессию"}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">
                  ${App.t("syncLoginHint") || "Хост требует вход. Введите имя пользователя и пароль, выданные владельцем."}
                </div>
                <label class="form-label" style="font-size:12px;">${App.t("userName") || "Имя пользователя"}</label>
                <input type="text" class="form-control form-control-sm mb-2" id="sync-login-name">
                <label class="form-label" style="font-size:12px;">${App.t("password") || "Пароль"}</label>
                <input type="password" class="form-control form-control-sm" id="sync-login-pw">
                <div id="sync-login-err" style="font-size:11px;color:var(--danger);margin-top:8px;display:none;"></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${App.t("cancel") || "Отмена"}</button>
                <button class="btn send-btn btn-sm" id="sync-login-btn">
                  <i class="bi bi-box-arrow-in-right me-1"></i>${App.t("login") || "Войти"}
                </button>
              </div>
            </div>
          </div>
        </div>`);

      const el = document.getElementById("sync-login-modal");
      const mo = bootstrap.Modal.getOrCreateInstance(el);
      const nameEl = document.getElementById("sync-login-name");
      const pwEl   = document.getElementById("sync-login-pw");
      const errEl  = document.getElementById("sync-login-err");
      // Пред-заполняем именем из настроек
      nameEl.value = App.getSetting("syncClientName") || "";

      const submit = async () => {
        errEl.style.display = "none";
        const r = await App.syncLogin(nameEl.value.trim(), pwEl.value);
        if (!r.ok) {
          errEl.textContent = r.error || (App.t("loginError") || "Ошибка входа");
          errEl.style.display = "";
          return;
        }
        mo.hide();
        resolve(true);
      };

      document.getElementById("sync-login-btn").addEventListener("click", submit);
      pwEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

      el.addEventListener("hidden.bs.modal", () => { el.remove(); resolve(false); });
      mo.show();
      setTimeout(() => nameEl.focus(), 200);
    });
  };

  // ============================================================
  // МОДАЛКА «ПОЛЬЗОВАТЕЛИ И ПРАВА» (admin only)
  // ============================================================
  App.showUsersAndAcl = async function () {
    if (!document.getElementById("sync-usersacl-modal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="sync-usersacl-modal" tabindex="-1">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content theme-modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-people-fill me-2"></i>${App.t("manageUsers") || "Пользователи и права"}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <ul class="nav nav-tabs" role="tablist" style="border-color:var(--border-color);">
                  <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#ua-tab-users" type="button">${App.t("users") || "Пользователи"}</button></li>
                  <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ua-tab-acl" type="button">${App.t("collectionsAcl") || "Доступ к коллекциям"}</button></li>
                </ul>
                <div class="tab-content pt-3">
                  <div class="tab-pane fade show active" id="ua-tab-users">
                    <div class="d-flex gap-2 align-items-end mb-2 flex-wrap">
                      <div style="flex:1;min-width:150px;">
                        <label class="form-label" style="font-size:11px;">${App.t("userName") || "Имя"}</label>
                        <input type="text" class="form-control form-control-sm" id="ua-name">
                      </div>
                      <div style="flex:1;min-width:150px;">
                        <label class="form-label" style="font-size:11px;">${App.t("password") || "Пароль"}</label>
                        <input type="password" class="form-control form-control-sm" id="ua-pw" placeholder="${App.t("leaveBlankToKeep") || "оставьте пустым — не менять"}">
                      </div>
                      <div>
                        <label class="form-label" style="font-size:11px;">${App.t("role") || "Роль"}</label>
                        <select class="form-select form-select-sm" id="ua-role">
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                      <button class="btn btn-sm send-btn" id="ua-save">
                        <i class="bi bi-person-plus me-1"></i>${App.t("saveUser") || "Сохранить"}
                      </button>
                    </div>
                    <div id="ua-users-list"></div>
                  </div>
                  <div class="tab-pane fade" id="ua-tab-acl">
                    <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">
                      ${App.t("aclHint") || "Отмечайте, кто видит (👁) и кто может редактировать (✎) каждую коллекцию. «Все» — доступ для всех авторизованных."}
                    </div>
                    <div id="ua-acl-grid" style="overflow-x:auto;"></div>
                    <div class="mt-2">
                      <button class="btn btn-sm send-btn" id="ua-acl-save">
                        <i class="bi bi-check-lg me-1"></i>${App.t("save") || "Сохранить"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">${App.t("close") || "Закрыть"}</button>
              </div>
            </div>
          </div>
        </div>`);

      document.getElementById("ua-save").addEventListener("click", async () => {
        const name = document.getElementById("ua-name").value.trim();
        const pw   = document.getElementById("ua-pw").value;
        const role = document.getElementById("ua-role").value;
        if (!name) { App.showAlert(App.t("nameRequired") || "Имя обязательно"); return; }
        const r = await App.syncSaveUser(name, pw, role);
        if (!r.ok) { App.showAlert(App.t("error") + ": " + (r.error || "")); return; }
        document.getElementById("ua-name").value = "";
        document.getElementById("ua-pw").value = "";
        await _renderUsers();
        await _renderAcl();
      });

      document.getElementById("ua-acl-save").addEventListener("click", async () => {
        const acl = _readAclFromGrid();
        const r = await App.syncSaveAcl(acl);
        if (!r.ok) { App.showAlert(App.t("error") + ": " + (r.error || "")); return; }
        App.syncToast(App.t("aclUpdated") || "Права обновлены");
      });
    }
    await _renderUsers();
    await _renderAcl();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("sync-usersacl-modal")).show();
  };

  async function _renderUsers() {
    const box = document.getElementById("ua-users-list");
    if (!box) return;
    const r = await App.syncListUsers();
    if (!r.ok) { box.innerHTML = `<div style="color:var(--danger);">${_esc(r.error || "")}</div>`; return; }
    const users = r.users || [];
    if (!users.length) { box.innerHTML = `<div style="color:var(--text-dim);">Пока нет пользователей</div>`; return; }
    box.innerHTML = users.map(u => `
      <div class="sync-client" style="margin-bottom:4px;">
        <div class="sync-avatar">${_esc((u.name || "?").charAt(0).toUpperCase())}</div>
        <div class="sync-client-main">
          <div class="sync-client-name">${_esc(u.name)}</div>
          <div class="sync-client-meta">
            <span class="sync-role ${u.role === "admin" ? "sync-role-admin" : "sync-role-member"}">${u.role}</span>
            · ${_esc(u.created_at || "")}
          </div>
        </div>
      </div>`).join("");
  }

  async function _renderAcl() {
    const grid = document.getElementById("ua-acl-grid");
    if (!grid) return;

    const [aclRes, usersRes] = await Promise.all([App.syncGetAcl(), App.syncListUsers()]);
    if (!usersRes.ok) { grid.innerHTML = `<div style="color:var(--danger);">${_esc(usersRes.error || "")}</div>`; return; }
    const users = usersRes.users || [];
    const acl   = aclRes.ok ? (aclRes.acl || {}) : {};
    const cols  = (App.USER_COLLECTIONS || []).map(c => c.name);

    if (!cols.length) { grid.innerHTML = `<div style="color:var(--text-dim);">Нет пользовательских коллекций</div>`; return; }

    // Строим таблицу: строки — коллекции, колонки — пользователи + «*» (все)
    const heads = [`<th style="text-align:left;">${App.t("collection") || "Коллекция"}</th>`,
      `<th class="ua-uh"><span class="ua-uh-all">все</span></th>`,
      ...users.map(u => `<th class="ua-uh">${_esc(u.name)}<span class="sync-role ${u.role === "admin" ? "sync-role-admin" : "sync-role-member"}">${u.role[0]}</span></th>`)];

    const rows = cols.map(col => {
      const perms = acl[col] || { read: ["*"], write: ["*"] };
      const readers = new Set(perms.read || []);
      const writers = new Set(perms.write || []);
      const idCells = [{ id: "*" }, ...users.map(u => ({ id: u.id }))].map(({id}) => `
        <td class="ua-perm">
          <label title="${App.t("canRead") || "Читать"}"><input type="checkbox" data-col="${_esc(col)}" data-id="${_esc(id)}" data-kind="read" ${readers.has(id) ? "checked" : ""}> 👁</label>
          <label title="${App.t("canWrite") || "Изменять"}"><input type="checkbox" data-col="${_esc(col)}" data-id="${_esc(id)}" data-kind="write" ${writers.has(id) ? "checked" : ""}> ✎</label>
        </td>`).join("");
      return `<tr><td class="ua-col-name">${_esc(col)}</td>${idCells}</tr>`;
    }).join("");

    grid.innerHTML = `<table class="ua-acl-table"><thead><tr>${heads.join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  function _readAclFromGrid() {
    const acl = {};
    document.querySelectorAll("#ua-acl-grid input[type='checkbox']").forEach(cb => {
      const col = cb.dataset.col, id = cb.dataset.id, kind = cb.dataset.kind;
      if (!acl[col]) acl[col] = { read: [], write: [] };
      if (cb.checked) acl[col][kind].push(id);
    });
    // Пустой read/write → считаем как "*" (никого не хотим убивать по ошибке)
    Object.values(acl).forEach(p => {
      if (!p.read.length)  p.read  = ["*"];
      if (!p.write.length) p.write = ["*"];
    });
    return acl;
  }

  /** Обновить статус хоста, если модалка открыта (нужно при смене языка) */
  App.refreshSyncFormIfOpen = function () {
    const el = document.getElementById("sync-modal");
    if (el && el.classList.contains("show")) _refreshHostStatus();
  };

  /** Отрисовать список участников сессии. */
  function _renderClients() {
    const wrap = document.getElementById("sync-clients-wrap");
    const box  = document.getElementById("sync-clients-list");
    const cnt  = document.getElementById("sync-clients-count");
    if (!wrap || !box) return;

    const clients = App.getSyncClients ? App.getSyncClients() : [];
    const myRole  = App.getSyncMyRole  ? App.getSyncMyRole()  : "member";
    const myId    = App.getSyncClientId ? App.getSyncClientId() : "";
    const m = _currentMode();
    const activeMode = (m === "host" || m === "client");

    wrap.style.display = (activeMode && clients.length) ? "" : "none";
    if (!clients.length) return;

    cnt.textContent = ` · ${clients.length}`;
    box.innerHTML = clients.map(c => {
      const isMe = c.client_id === myId;
      const isAdmin = c.role === "admin";
      const roleBadge = isAdmin
        ? `<span class="sync-role sync-role-admin">admin</span>`
        : `<span class="sync-role sync-role-member">member</span>`;
      const meBadge = isMe ? `<span class="sync-me">${App.t("you") || "вы"}</span>` : "";
      const initial = (c.name || "?").charAt(0).toUpperCase();

      // Кнопки: только admin может делать что-то с чужими; со своей записью — ничего
      const canModify = myRole === "admin" && !isMe;
      const actions = canModify ? `
        <div class="sync-actions">
          ${isAdmin
            ? `<button class="sync-act" data-act="demote" data-id="${c.client_id}" title="${App.t("demoteToMember") || "Сделать участником"}">
                 <i class="bi bi-person"></i>
               </button>`
            : `<button class="sync-act" data-act="promote" data-id="${c.client_id}" title="${App.t("promoteToAdmin") || "Сделать admin"}">
                 <i class="bi bi-person-fill-up"></i>
               </button>`}
          <button class="sync-act sync-act-danger" data-act="kick" data-id="${c.client_id}"
                  title="${App.t("kickUser") || "Отключить на 5 мин"}">
            <i class="bi bi-x-circle"></i>
          </button>
        </div>` : "";

      return `
        <div class="sync-client">
          <div class="sync-avatar">${initial}</div>
          <div class="sync-client-main">
            <div class="sync-client-name">${_esc(c.name)} ${meBadge}</div>
            <div class="sync-client-meta">${roleBadge} · ${c.ip || ""} · ${App.t("uptime") || "онлайн"}: ${_fmtDur(c.online_for)}</div>
          </div>
          ${actions}
        </div>`;
    }).join("");

    box.querySelectorAll(".sync-act").forEach(btn => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act, id = btn.dataset.id;
        if (act === "promote" || act === "demote") {
          const role = act === "promote" ? "admin" : "member";
          const r = await App.syncSetRole(id, role);
          if (!r.ok) App.showAlert(App.t("error") + ": " + (r.error || ""));
        } else if (act === "kick") {
          const ok = await App.showConfirm({
            title: App.t("kickUser") || "Отключить участника",
            message: App.t("kickConfirm") || "Отключить этого участника на 5 минут?",
            okText: App.t("kick") || "Отключить", danger: true,
          });
          if (ok) {
            const r = await App.syncKick(id, 300);
            if (!r.ok) App.showAlert(App.t("error") + ": " + (r.error || ""));
          }
        }
      });
    });
  }

  function _fmtDur(sec) {
    sec = Math.max(0, sec | 0);
    if (sec < 60) return sec + " сек";
    if (sec < 3600) return Math.floor(sec / 60) + " мин";
    return Math.floor(sec / 3600) + " ч " + Math.floor((sec % 3600) / 60) + " м";
  }

  /** Заблокировать/разблокировать Pull/Push, показать «идёт…» на активной. */
  function _setSyncActionsBusy(busy, kind) {
    const pull = document.getElementById("sync-pull-btn");
    const push = document.getElementById("sync-push-btn");
    if (!pull || !push) return;

    pull.disabled = busy;
    push.disabled = busy;

    if (busy) {
      const target = kind === "push" ? push : pull;
      target.dataset.origHtml = target.innerHTML;
      target.innerHTML = `<i class="bi bi-hourglass-split me-1"></i>${
        kind === "push" ? (App.t("sending") || "Отправляем…") : (App.t("loading") || "Загружаем…")
      }`;
    } else {
      [pull, push].forEach(b => {
        if (b.dataset.origHtml) { b.innerHTML = b.dataset.origHtml; delete b.dataset.origHtml; }
      });
    }
  }

  /**
   * Быстрая проверка адреса без сети. Ловит известные плохие диапазоны:
   *   172.20.10.x — iPhone Personal Hotspot: client isolation.
   *   192.168.43.x — Android hotspot, тоже часто с изоляцией.
   *   169.254.x   — Windows APIPA, нет DHCP → нет сети.
   * Возвращает HTML-строку или пустоту.
   */
  function _networkHint(url) {
    let host = "";
    try { host = new URL(url).hostname; } catch { return ""; }
    if (!host) return "";
    if (/^172\.20\.10\./.test(host)) {
      return `<span style="color:#ffc107;">⚠ Похоже на iPhone hotspot (172.20.10.x). Личная точка iPhone блокирует связь между клиентами (client isolation) — синхронизация через него не заработает. Нужен обычный Wi-Fi или проводная сеть.</span>`;
    }
    if (/^192\.168\.43\./.test(host)) {
      return `<span style="color:#ffc107;">⚠ Похоже на Android hotspot. У большинства прошивок между клиентами стоит изоляция — синхронизация может не работать.</span>`;
    }
    if (/^169\.254\./.test(host)) {
      return `<span style="color:#dc3545;">⚠ 169.254.x — Windows не получил IP от роутера (APIPA). Реальной сети нет.</span>`;
    }
    return "";
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ============================================================
  function _currentMode() {
    const r = document.querySelector('input[name="sync-mode"]:checked');
    return r ? r.value : "local";
  }

  function _showSection(m) {
    ["folder", "host", "client"].forEach(s => {
      const el = document.getElementById("sync-sec-" + s);
      if (el) el.style.display = (s === m) ? "block" : "none";
    });
    const actions = document.getElementById("sync-manual-actions");
    if (actions) actions.style.display = (m === "local") ? "none" : "flex";
  }

  function _fillForm() {
    const s = App.getSettings();
    const m = s.syncMode || "local";
    const radio = document.querySelector(`input[name="sync-mode"][value="${m}"]`);
    if (radio) radio.checked = true;

    document.getElementById("sync-client-name").value = s.syncClientName || "";
    document.getElementById("sync-folder-path").value = s.syncFolderPath || "";
    document.getElementById("sync-host-port").value = s.syncHostPort || 8777;
    document.getElementById("sync-host-token").value = s.syncHostToken || "";
    document.getElementById("sync-remote-url").value = s.syncRemoteUrl || "";
    document.getElementById("sync-remote-token").value = s.syncRemoteToken || "";
    document.getElementById("sync-test-result").textContent = "";
    _showSection(m);
  }

  async function _saveForm() {
    const s = App.getSettings();
    s.syncMode        = _currentMode();
    s.syncClientName  = document.getElementById("sync-client-name").value.trim() || "user";
    s.syncFolderPath  = document.getElementById("sync-folder-path").value.trim();
    s.syncHostPort    = Math.max(1024, Math.min(65535, +document.getElementById("sync-host-port").value || 8777));
    s.syncHostToken   = document.getElementById("sync-host-token").value;
    s.syncRemoteUrl   = document.getElementById("sync-remote-url").value.trim();
    s.syncRemoteToken = document.getElementById("sync-remote-token").value;
    await App.saveSettingsObject(s);
  }

  async function _refreshHostStatus() {
    const box = document.getElementById("sync-host-status");
    if (!box) return;
    const st = await App.syncHostStatus();
    if (st.running) {
      // Рядом с каждым адресом — кнопка «скопировать в буфер», участнику
      // остаётся вставить в поле «Адрес хоста» и (при пароле) вписать токен.
      const links = (st.urls || []).map(u => `
        <div class="sync-host-url">
          <code style="color:var(--accent);user-select:all;flex:1;">${u}</code>
          <button class="btn btn-sm btn-outline-secondary sync-copy-btn"
                  data-copy="${u}" title="${App.t("copy") || "Скопировать"}">
            <i class="bi bi-clipboard"></i>
          </button>
        </div>`).join("");

      box.innerHTML = `
        <div style="color:#28a745;font-weight:600;margin-bottom:6px;">● ${App.t("hostRunning")}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">
          ${App.t("giveAddresses")}
        </div>
        <div style="font-size:12px;line-height:1.6;">${links}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">
          v${st.version} · ${App.t("lastBy")}: ${st.updated_by || "—"}
          ${st.protected ? ` · <span style="color:#ffc107;">🔒 ${App.t("protected") || "с паролем"}</span>` : ""}
        </div>`;

      box.querySelectorAll(".sync-copy-btn").forEach(b => {
        b.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(b.dataset.copy);
            App.syncToast(App.t("copied") || "Скопировано");
          } catch (_) { /* clipboard может быть заблокирован — молча */ }
        });
      });

      document.getElementById("sync-host-start").style.display = "none";
      document.getElementById("sync-host-stop").style.display = "";
      // Кнопка «Пользователи и права» — только когда хост в режиме require_login
      const mng = document.getElementById("sync-manage-users");
      if (mng) mng.style.display = st.require_login ? "" : "none";
    } else {
      box.innerHTML = `<div style="color:var(--text-dim);">○ ${App.t("hostStopped")}</div>`;
      document.getElementById("sync-host-start").style.display = "";
      document.getElementById("sync-host-stop").style.display = "none";
      const mng = document.getElementById("sync-manage-users");
      if (mng) mng.style.display = "none";
    }
  }

  // ============================================================
  function _modalHtml() {
    return `
    <div class="modal fade" id="sync-modal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-people me-2"></i><span data-i18n="sync">Совместная работа</span></h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">

            <div class="mb-3">
              <label class="form-label" style="font-size:12px;" data-i18n="yourName">Ваше имя (видно другим участникам)</label>
              <input type="text" class="form-control form-control-sm" id="sync-client-name" placeholder="Vira">
            </div>

            <hr style="border-color:var(--border-color);">

            <h6 style="color:var(--accent);font-size:13px;text-transform:uppercase;letter-spacing:.05em;" data-i18n="syncMode">Режим</h6>

            <div class="form-check mb-2">
              <input class="form-check-input" type="radio" name="sync-mode" value="local" id="sm-local">
              <label class="form-check-label" for="sm-local" style="font-size:13px;">
                <strong data-i18n="syncLocal">Только этот компьютер</strong>
                <div style="font-size:11px;color:var(--text-dim);" data-i18n="syncLocalDesc">Коллекции никуда не отправляются</div>
              </label>
            </div>

            <div class="form-check mb-2">
              <input class="form-check-input" type="radio" name="sync-mode" value="folder" id="sm-folder">
              <label class="form-check-label" for="sm-folder" style="font-size:13px;">
                <strong data-i18n="syncFolder">Общая папка</strong>
                <div style="font-size:11px;color:var(--text-dim);" data-i18n="syncFolderDesc">Dropbox / Яндекс.Диск / OneDrive — работает из любой сети</div>
              </label>
            </div>

            <div class="form-check mb-2">
              <input class="form-check-input" type="radio" name="sync-mode" value="host" id="sm-host">
              <label class="form-check-label" for="sm-host" style="font-size:13px;">
                <strong data-i18n="syncHost">Стать хостом</strong>
                <div style="font-size:11px;color:var(--text-dim);" data-i18n="syncHostDesc">Этот компьютер = сервер, остальные подключаются по IP</div>
              </label>
            </div>

            <div class="form-check mb-3">
              <input class="form-check-input" type="radio" name="sync-mode" value="client" id="sm-client">
              <label class="form-check-label" for="sm-client" style="font-size:13px;">
                <strong data-i18n="syncClient">Подключиться к хосту</strong>
                <div style="font-size:11px;color:var(--text-dim);" data-i18n="syncClientDesc">Ввести адрес компьютера-хоста</div>
              </label>
            </div>

            <!-- FOLDER -->
            <div id="sync-sec-folder" style="display:none;background:var(--bg-input);padding:12px;border-radius:var(--radius);">
              <label class="form-label" style="font-size:12px;" data-i18n="sharedFolder">Папка для общего файла</label>
              <div class="d-flex gap-2">
                <input type="text" class="form-control form-control-sm" id="sync-folder-path" placeholder="C:\\Users\\...\\Dropbox\\TestSys">
                <button class="btn btn-sm btn-outline-secondary" id="sync-pick-folder" style="white-space:nowrap;" data-i18n="choose">Выбрать...</button>
              </div>
              <div class="form-text" style="font-size:10px;" data-i18n="sharedFolderHint">
                Все участники указывают одну и ту же синхронизируемую папку. Файл: testsys_shared.json
              </div>
            </div>

            <!-- HOST -->
            <div id="sync-sec-host" style="display:none;background:var(--bg-input);padding:12px;border-radius:var(--radius);">
              <div class="row g-2 mb-2">
                <div class="col-4">
                  <label class="form-label" style="font-size:12px;" data-i18n="port">Порт</label>
                  <input type="number" class="form-control form-control-sm" id="sync-host-port" min="1024" max="65535">
                </div>
                <div class="col-8">
                  <label class="form-label" style="font-size:12px;" data-i18n="password">Пароль (необязательно)</label>
                  <input type="text" class="form-control form-control-sm" id="sync-host-token" placeholder="оставьте пустым — без пароля">
                </div>
              </div>

              <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" id="sync-require-login">
                <label class="form-check-label" for="sync-require-login" style="font-size:12px;" data-i18n="requireLogin">
                  Требовать вход по логину/паролю (индивидуальные пользователи и права)
                </label>
              </div>
              <div id="sync-admin-fields" style="display:none;background:var(--bg-app);padding:8px;border-radius:4px;margin-bottom:6px;">
                <div class="form-text" style="font-size:10px;color:var(--warn);margin-bottom:4px;">
                  <i class="bi bi-info-circle"></i>
                  <span data-i18n="firstAdminHint">При первом запуске создаётся владелец с этими данными. Дальше он управляет остальными пользователями.</span>
                </div>
                <label class="form-label" style="font-size:11px;" data-i18n="adminName">Имя владельца</label>
                <input type="text" class="form-control form-control-sm mb-2" id="sync-admin-name">
                <label class="form-label" style="font-size:11px;" data-i18n="adminPassword">Пароль владельца</label>
                <input type="password" class="form-control form-control-sm" id="sync-admin-pw">
              </div>

              <div class="d-flex gap-2 mb-2 flex-wrap">
                <button class="btn btn-sm send-btn" id="sync-host-start" data-i18n="startHost">Запустить хост</button>
                <button class="btn btn-sm btn-outline-danger" id="sync-host-stop" style="display:none;" data-i18n="stopHost">Остановить</button>
                <button class="btn btn-sm btn-outline-secondary" id="sync-manage-users" style="display:none;">
                  <i class="bi bi-people-fill me-1"></i><span data-i18n="manageUsers">Пользователи и права</span>
                </button>
              </div>
              <div id="sync-host-status" style="font-size:12px;padding:8px;background:var(--bg-app);border-radius:4px;"></div>
              <div class="form-text" style="font-size:10px;margin-top:6px;" data-i18n="hostLanHint">⚠</div>
            </div>

            <!-- CLIENT -->
            <div id="sync-sec-client" style="display:none;background:var(--bg-input);padding:12px;border-radius:var(--radius);">
              <label class="form-label" style="font-size:12px;" data-i18n="hostAddress">Адрес хоста</label>
              <input type="text" class="form-control form-control-sm mb-1" id="sync-remote-url" placeholder="http://192.168.1.5:8777">
              <div id="sync-net-warn" style="display:none;font-size:11px;margin-bottom:6px;"></div>
              <label class="form-label" style="font-size:12px;" data-i18n="passwordIfSet">Пароль (если задан на хосте)</label>
              <input type="text" class="form-control form-control-sm mb-2" id="sync-remote-token">
              <button class="btn btn-sm btn-outline-secondary" id="sync-test-conn" data-i18n="testConnection">Проверить связь</button>
              <div id="sync-test-result" style="font-size:11px;margin-top:6px;"></div>
            </div>

            <div id="sync-manual-actions" class="d-flex gap-2 mt-3 flex-wrap" style="display:none;">
              <button class="btn btn-sm btn-outline-secondary" id="sync-pull-btn">
                <i class="bi bi-download me-1"></i><span data-i18n="pullChanges">Забрать изменения</span>
              </button>
              <button class="btn btn-sm btn-outline-secondary" id="sync-push-btn">
                <i class="bi bi-upload me-1"></i><span data-i18n="pushChanges">Отправить свои</span>
              </button>
              <button class="btn btn-sm btn-outline-danger" id="sync-logout-btn">
                <i class="bi bi-box-arrow-right me-1"></i><span data-i18n="syncLogout">Выйти из сессии</span>
              </button>
              <div class="form-check form-switch ms-auto d-flex align-items-center">
                <input class="form-check-input me-1" type="checkbox" id="sync-auto-apply">
                <label class="form-check-label" for="sync-auto-apply" style="font-size:11px;" data-i18n="syncAutoApply">
                  Автозагружать без спроса
                </label>
              </div>
            </div>

            <!-- Живой список участников — обновляется каждые 8 сек -->
            <div id="sync-clients-wrap" class="mt-3" style="display:none;">
              <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">
                <i class="bi bi-people me-1"></i><span data-i18n="onlineNow">Онлайн сейчас</span>
                <span id="sync-clients-count" style="color:var(--accent);"></span>
              </div>
              <div id="sync-clients-list"></div>
            </div>

          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="sync-save-btn">
              <i class="bi bi-check-lg me-1"></i><span data-i18n="save">Сохранить</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
