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

    // Хост: старт / стоп
    document.getElementById("sync-host-start").addEventListener("click", async () => {
      await _saveForm();
      const res = await App.syncHostStart();
      if (res.ok) {
        App.syncToast(App.t("hostRunning") + " :" + res.port);
        await _refreshHostStatus();
      } else {
        App.showAlert(App.t("error") + ": " + (res.error || "?"));
      }
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
      if (!url) { out.textContent = App.t("hostAddress"); out.style.color = "#dc3545"; return; }
      out.textContent = App.t("checking");
      out.style.color = "var(--text-dim)";
      const res = await App.syncTestConnection(url, token);
      if (res.ok && res.data) {
        out.textContent = `✅ ${App.t("connectionOk")} — «${res.data.host}», v${res.data.version}` +
          (res.data.protected ? ` (${App.t("protected")})` : "");
        out.style.color = "#28a745";
      } else {
        out.textContent = "❌ " + (res.error || App.t("noResponse"));
        out.style.color = "#dc3545";
      }
    });

    // Ручные Pull / Push
    document.getElementById("sync-pull-btn").addEventListener("click", async () => {
      const res = await App.syncPull();
      if (!res.ok && res.error) App.showAlert(App.t("error") + ": " + res.error);
    });
    document.getElementById("sync-push-btn").addEventListener("click", async () => {
      await App.syncPushWithConflictUI();
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

  /** Обновить статус хоста, если модалка открыта (нужно при смене языка) */
  App.refreshSyncFormIfOpen = function () {
    const el = document.getElementById("sync-modal");
    if (el && el.classList.contains("show")) _refreshHostStatus();
  };

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
      const links = (st.urls || []).map(u =>
        `<code style="color:var(--accent);user-select:all;">${u}</code>`).join("<br>");
      box.innerHTML = `
        <div style="color:#28a745;font-weight:600;margin-bottom:4px;">● ${App.t("hostRunning")}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">
          ${App.t("giveAddresses")}
        </div>
        <div style="font-size:12px;line-height:1.6;">${links}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;">
          v${st.version} · ${App.t("lastBy")}: ${st.updated_by || "—"}
        </div>`;
      document.getElementById("sync-host-start").style.display = "none";
      document.getElementById("sync-host-stop").style.display = "";
    } else {
      box.innerHTML = `<div style="color:var(--text-dim);">○ ${App.t("hostStopped")}</div>`;
      document.getElementById("sync-host-start").style.display = "";
      document.getElementById("sync-host-stop").style.display = "none";
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
              <div class="d-flex gap-2 mb-2">
                <button class="btn btn-sm send-btn" id="sync-host-start" data-i18n="startHost">Запустить хост</button>
                <button class="btn btn-sm btn-outline-danger" id="sync-host-stop" style="display:none;" data-i18n="stopHost">Остановить</button>
              </div>
              <div id="sync-host-status" style="font-size:12px;padding:8px;background:var(--bg-app);border-radius:4px;"></div>
              <div class="form-text" style="font-size:10px;margin-top:6px;" data-i18n="hostLanHint">⚠</div>
            </div>

            <!-- CLIENT -->
            <div id="sync-sec-client" style="display:none;background:var(--bg-input);padding:12px;border-radius:var(--radius);">
              <label class="form-label" style="font-size:12px;" data-i18n="hostAddress">Адрес хоста</label>
              <input type="text" class="form-control form-control-sm mb-2" id="sync-remote-url" placeholder="http://192.168.1.5:8777">
              <label class="form-label" style="font-size:12px;" data-i18n="passwordIfSet">Пароль (если задан на хосте)</label>
              <input type="text" class="form-control form-control-sm mb-2" id="sync-remote-token">
              <button class="btn btn-sm btn-outline-secondary" id="sync-test-conn" data-i18n="testConnection">Проверить связь</button>
              <div id="sync-test-result" style="font-size:11px;margin-top:6px;"></div>
            </div>

            <div id="sync-manual-actions" class="d-flex gap-2 mt-3" style="display:none;">
              <button class="btn btn-sm btn-outline-secondary" id="sync-pull-btn">
                <i class="bi bi-download me-1"></i><span data-i18n="pullChanges">Забрать изменения</span>
              </button>
              <button class="btn btn-sm btn-outline-secondary" id="sync-push-btn">
                <i class="bi bi-upload me-1"></i><span data-i18n="pushChanges">Отправить свои</span>
              </button>
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
