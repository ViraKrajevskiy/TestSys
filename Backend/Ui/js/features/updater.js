/**
 * updater.js — обновление приложения
 *
 * При запуске тихо проверяет GitHub Releases. Если версия новее —
 * показывает полосу сверху. Установка и откат идут через Python:
 * скачивание, подмена exe, перезапуск.
 */
window.App = window.App || {};

(function () {
  let _modal = null;
  let _info = null;        // {version, repo, frozen}
  let _releases = [];
  let _latest = null;
  let _backups = [];
  let _progressTimer = null;
  let _pending = null;     // релиз, который ставим

  const api = () => window.pywebview && window.pywebview.api;

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  App.initUpdater = function () {
    document.body.insertAdjacentHTML("beforeend", _html());
    _injectBanner();
    _modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("update-modal"));

    document.addEventListener("click", (e) => {
      if (e.target.closest("#check-updates-btn")) {
        e.preventDefault();
        App.showUpdater();
      }
    });

    document.getElementById("upd-check").addEventListener("click", () => _check(false));
    document.getElementById("upd-install").addEventListener("click", _startInstall);
    document.getElementById("upd-prerelease").addEventListener("change", () => _check(false));
    document.getElementById("upd-cleanup").addEventListener("click", _cleanup);

    // Тихая проверка при запуске — только в собранном приложении.
    // Кулдаун 1 час: если уже проверяли недавно — пропускаем, чтоб не флудить GitHub.
    setTimeout(async () => {
      _info = await _getInfo();
      if (!_info || !_info.frozen) return;
      if (App.getSetting && App.getSetting("autoCheckUpdates") === false) return;
      if (_isCheckCoolingDown()) return;
      _check(true);
    }, 4000);
  };

  async function _getInfo() {
    if (!api() || !api().get_app_version) return null;
    try { return await api().get_app_version(); } catch (_) { return null; }
  }

  // ============================================================
  // КУЛДАУН — не флудим GitHub при частых перезапусках
  // ============================================================
  const _CHECK_COOLDOWN_MS = 60 * 60 * 1000; // 1 час
  const _CHECK_TS_KEY = "tsys.lastUpdateCheck";

  function _isCheckCoolingDown() {
    try {
      const ts = parseInt(localStorage.getItem(_CHECK_TS_KEY) || "0", 10);
      return ts && (Date.now() - ts < _CHECK_COOLDOWN_MS);
    } catch (_) { return false; }
  }

  function _saveCheckTimestamp() {
    try { localStorage.setItem(_CHECK_TS_KEY, String(Date.now())); } catch (_) {}
  }

  // ============================================================
  // ПРОВЕРКА
  // ============================================================
  async function _check(silent) {
    if (!api() || !api().check_updates) {
      if (!silent) _status(App.t("apiUnavailable"), "warn");
      return;
    }

    const pre = document.getElementById("upd-prerelease")?.checked || false;
    if (!silent) _status(App.t("checking"), "info");

    try {
      const res = await api().check_updates("", pre, "");
      if (!res.ok) {
        if (!silent) _status(res.error, "error");
        return;
      }

      _releases = res.releases || [];
      _latest = res.latest;
      _info = _info || {};
      _info.version = res.current;
      _saveCheckTimestamp(); // запомним время — следующий автостарт пропустит проверку

      if (res.has_update) {
        _showBanner(res.latest, res.current);
        if (!silent) _renderModal();
      } else {
        _hideBanner();
        if (!silent) {
          _status(`${App.t("upToDate")} — ${res.current}`, "ok");
          _renderModal();
        }
      }
    } catch (e) {
      if (!silent) _status(String(e), "error");
    }
  }

  // ============================================================
  // ПОЛОСА УВЕДОМЛЕНИЯ
  // ============================================================
  function _injectBanner() {
    const bar = document.createElement("div");
    bar.id = "update-banner";
    bar.innerHTML = `
      <i class="bi bi-arrow-up-circle"></i>
      <span id="upd-banner-text"></span>
      <button class="btn btn-sm" id="upd-banner-open">${App.t("whatsNew")}</button>
      <button class="btn btn-sm" id="upd-banner-hide">${App.t("later")}</button>`;

    const appBody = document.querySelector(".app-body");
    if (appBody && appBody.parentNode) appBody.parentNode.insertBefore(bar, appBody);

    bar.querySelector("#upd-banner-open").addEventListener("click", () => App.showUpdater());
    bar.querySelector("#upd-banner-hide").addEventListener("click", () => {
      _hideBanner();
      // Не напоминаем про эту версию до следующей
      if (_latest && App.saveSettingsObject) {
        App.saveSettingsObject({ skippedVersion: _latest.version });
      }
    });
  }

  function _showBanner(rel, current) {
    if (!rel) return;
    // Уважаем «позже» для этой конкретной версии
    if (App.getSetting && App.getSetting("skippedVersion") === rel.version) return;

    const bar = document.getElementById("update-banner");
    if (!bar) return;
    bar.querySelector("#upd-banner-text").textContent =
      `${App.t("newVersionAvailable")} ${rel.version}` +
      (current ? ` (${App.t("yours")} ${current})` : "");
    bar.style.display = "flex";
  }

  function _hideBanner() {
    const bar = document.getElementById("update-banner");
    if (bar) bar.style.display = "none";
  }

  // ============================================================
  // МОДАЛКА
  // ============================================================
  App.showUpdater = async function () {
    _info = (await _getInfo()) || _info || {};
    document.getElementById("upd-current").textContent = _info.version || "—";
    document.getElementById("upd-repo").textContent = _info.repo || "—";

    // Явно показываем, откуда версия: из собранного exe или из исходников.
    // Это ключевое: если пользователь бежит из source, обновление не пройдёт
    // и версия в файле version.py — единственный источник правды.
    const src = document.getElementById("upd-src-mode");
    if (src) {
      src.innerHTML = _info.frozen
        ? `<span style="color:#22c55e;">📦 ${App.t("updSrcExe") || "собранный exe — auto-update работает"}</span>`
        : `<span style="color:#ffc107;">🛠 ${App.t("updSrcDev") || "запуск из исходников (python main.py). Auto-update отключён. Версия читается из Backend/version.py — правьте её перед сборкой (build.bat 1.0.5)."}</span>`;
    }

    const devWarn = document.getElementById("upd-dev-warn");
    devWarn.style.display = _info.frozen ? "none" : "";

    await _loadBackups();
    _renderModal();
    _renderLastCheckTime();
    _modal.show();
    if (!_releases.length) _check(false);
  };

  async function _loadBackups() {
    if (!api() || !api().list_backups) return;
    try {
      const r = await api().list_backups();
      _backups = r.backups || [];
    } catch (_) { _backups = []; }
  }

  function _renderModal() {
    _renderReleases();
    _renderBackups();
  }

  function _renderLastCheckTime() {
    const el = document.getElementById("upd-last-check");
    if (!el) return;
    try {
      const ts = parseInt(localStorage.getItem(_CHECK_TS_KEY) || "0", 10);
      if (!ts) { el.textContent = ""; return; }
      const d = new Date(ts);
      const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const today = new Date();
      const dateStr = (d.toDateString() === today.toDateString())
        ? hm
        : d.toLocaleDateString() + " " + hm;
      el.textContent = (App.t("lastChecked") || "Последняя проверка") + ": " + dateStr;
    } catch (_) {}
  }

  function _renderReleases() {
    const box = document.getElementById("upd-releases");
    if (!_releases.length) {
      box.innerHTML = `<div class="upd-empty">${App.t("noReleases")}</div>`;
      return;
    }

    const cur = _info.version || "0.0.0";
    box.innerHTML = _releases.map((r) => {
      const rel = _cmp(r.version, cur);
      const badge = rel > 0
        ? `<span class="upd-badge upd-new">${App.t("newer")}</span>`
        : rel === 0
          ? `<span class="upd-badge upd-cur">${App.t("installed")}</span>`
          : `<span class="upd-badge upd-old">${App.t("older")}</span>`;

      // Три случая с кнопкой:
      //   1) это текущая версия — кнопки нет
      //   2) есть установочный файл (exe/zip) — «Обновить»/«Откатить»
      //   3) файла нет — «Открыть в GitHub» (ссылка на релиз)
      let action = "";
      if (rel !== 0) {
        if (r.has_asset === false) {
          action = `<a class="upd-action upd-link" href="${App.escapeAttr(r.html_url || "")}"
                       target="_blank" rel="noopener"
                       title="${App.escapeAttr(App.t("noInstaller"))}">
                      <i class="bi bi-box-arrow-up-right me-1"></i>${App.t("openOnGitHub")}
                    </a>`;
        } else {
          action = `<button class="upd-action" data-ver="${App.escapeAttr(r.version)}">
                     ${rel > 0 ? App.t("updateTo") : App.t("rollbackTo")}
                    </button>`;
        }
      }

      // Тег для zip-архивов — чтобы было видно, что качается не exe напрямую
      const isZip = (r.asset || "").toLowerCase().endsWith(".zip");
      const zipTag = isZip ? '<span class="upd-badge upd-pre">zip</span>' : "";

      return `
        <div class="upd-release">
          <div class="upd-rel-head">
            <strong>${App.escapeHtml(r.version)}</strong>
            ${badge}
            ${r.prerelease ? '<span class="upd-badge upd-pre">pre</span>' : ""}
            ${zipTag}
            <span class="upd-rel-date">${App.escapeHtml(r.published)}</span>
            ${r.size ? `<span class="upd-rel-size">${_mb(r.size)}</span>` : ""}
            ${action}
          </div>
          ${r.notes ? `<div class="upd-notes">${App.escapeHtml(_trim(r.notes, 400))}</div>` : ""}
        </div>`;
    }).join("");

    box.querySelectorAll(".upd-action").forEach((b) => {
      // ссылки-«открыть на GitHub» не перехватываем — пусть открываются как есть
      if (b.tagName === "A") return;
      b.addEventListener("click", () => {
        const rel = _releases.find((x) => x.version === b.dataset.ver);
        if (rel) _confirmInstall(rel);
      });
    });
  }

  function _renderBackups() {
    const box = document.getElementById("upd-backups");
    const wrap = document.getElementById("upd-backups-wrap");

    if (!_backups.length) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "";

    box.innerHTML = _backups.map((b) => `
      <div class="upd-backup">
        <i class="bi bi-clock-history"></i>
        <strong>${App.escapeHtml(b.version)}</strong>
        <span class="upd-rel-date">${App.escapeHtml(b.date)}</span>
        <span class="upd-rel-size">${_mb(b.size)}</span>
        <button class="upd-action upd-rollback" data-path="${App.escapeAttr(b.path)}"
                data-ver="${App.escapeAttr(b.version)}">
          ${App.t("rollbackInstant")}
        </button>
      </div>`).join("");

    box.querySelectorAll(".upd-rollback").forEach((b) => {
      b.addEventListener("click", () => _confirmRollback(b.dataset.path, b.dataset.ver));
    });
  }

  // ============================================================
  // УСТАНОВКА
  // ============================================================
  async function _confirmInstall(rel) {
    if (!_info.frozen) { App.showAlert(App.t("devModeNoUpdate")); return; }

    const older = _cmp(rel.version, _info.version) < 0;
    const ok = await App.showConfirm({
      title: older ? App.t("rollbackTo") + " " + rel.version : App.t("updateTo") + " " + rel.version,
      message: `${App.t("appWillRestart")}\n\n` +
               `${App.t("size")}: ${_mb(rel.size)}\n` +
               `${App.t("currentVersion")}: ${_info.version} → ${rel.version}` +
               (older ? `\n\n${App.t("rollbackWarning")}` : ""),
      okText: older ? App.t("rollbackTo") : App.t("updateBtn"),
      danger: older,
    });
    if (!ok) return;

    _pending = rel;
    _download(rel);
  }

  async function _download(rel) {
    _setBusy(true);
    _progress(0, rel.size);
    _status(App.t("downloading"), "info");
    _showNavBadge(0);

    try {
      const res = await api().download_update(rel.url, rel.size, rel.sha_url || "");
      if (!res.ok) { _fail(res.error); return; }
      _pollProgress();
    } catch (e) { _fail(String(e)); }
  }

  function _pollProgress() {
    clearInterval(_progressTimer);
    _progressTimer = setInterval(async () => {
      try {
        const s = await api().download_progress();
        _progress(s.done, s.total);

        // Крупный прогресс — на активной кнопке «Обновить до ...» + в навбаре
        const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
        _markPendingButtonProgress(pct);
        _showNavBadge(pct);

        if (s.error) { clearInterval(_progressTimer); _hideNavBadge(); _fail(s.error); return; }

        if (s.finished && s.path) {
          clearInterval(_progressTimer);
          _status(App.t("installing"), "info");
          _markPendingButtonProgress(100, App.t("installing"));
          document.getElementById("upd-install").style.display = "";
          document.getElementById("upd-install").disabled = false;
          // Ставим сразу — пользователь уже подтвердил
          _startInstall();
        }
      } catch (e) {
        clearInterval(_progressTimer);
        _hideNavBadge();
        _fail(String(e));
      }
    }, 400);
  }

  /** Отметить кнопку «Обновить до X.Y.Z» скачивающейся версии текстом с процентом. */
  function _markPendingButtonProgress(pct, forcedText) {
    if (!_pending) return;
    const btns = document.querySelectorAll(`#upd-releases .upd-action[data-ver="${App.escapeAttr(_pending.version)}"]`);
    btns.forEach(b => {
      if (!b.dataset.origText) b.dataset.origText = b.textContent.trim();
      b.disabled = true;
      b.innerHTML = forcedText
        ? `<i class="bi bi-hourglass-split me-1"></i>${forcedText}`
        : `⏳ ${App.t("downloading") || "Скачивание"} ${pct}%`;
    });
  }

  function _clearPendingButton() {
    document.querySelectorAll("#upd-releases .upd-action").forEach(b => {
      if (b.dataset.origText) {
        b.textContent = b.dataset.origText;
        delete b.dataset.origText;
      }
      b.disabled = false;
    });
  }

  // Бейдж в навбаре — виден даже когда модалка закрыта
  let _navBadgeEl = null;
  function _showNavBadge(pct) {
    const btn = document.getElementById("check-updates-btn");
    if (!btn) return;
    if (!_navBadgeEl) {
      _navBadgeEl = document.createElement("span");
      _navBadgeEl.className = "upd-nav-badge";
      btn.style.position = "relative";
      btn.appendChild(_navBadgeEl);
    }
    _navBadgeEl.textContent = pct + "%";
    _navBadgeEl.style.display = "";
    btn.classList.add("upd-nav-active");
  }
  function _hideNavBadge() {
    if (_navBadgeEl) _navBadgeEl.style.display = "none";
    document.getElementById("check-updates-btn")?.classList.remove("upd-nav-active");
  }

  async function _startInstall() {
    try {
      _status(App.t("restarting"), "info");
      const res = await api().install_update("");
      if (!res.ok) { _fail(res.error); return; }
      // Дальше приложение закроется и запустится заново
    } catch (e) { _fail(String(e)); }
  }

  async function _confirmRollback(path, ver) {
    if (!_info.frozen) { App.showAlert(App.t("devModeNoUpdate")); return; }

    const ok = await App.showConfirm({
      title: App.t("rollbackTo") + " " + ver,
      message: `${App.t("appWillRestart")}\n\n${App.t("rollbackWarning")}`,
      okText: App.t("rollbackTo"), danger: true,
    });
    if (!ok) return;

    _setBusy(true);
    _status(App.t("restarting"), "info");
    try {
      const res = await api().rollback_version(path);
      if (!res.ok) _fail(res.error);
    } catch (e) { _fail(String(e)); }
  }

  async function _cleanup() {
    const ok = await App.showConfirm({
      title: App.t("cleanupBackups"),
      message: App.t("cleanupBackupsConfirm"),
      okText: App.t("clear"), danger: true,
    });
    if (!ok) return;
    try {
      const r = await api().cleanup_backups(3);
      await _loadBackups();
      _renderBackups();
      App.syncToast && App.syncToast(`${App.t("removed")}: ${r.removed || 0}`);
    } catch (_) {}
  }

  // ============================================================
  // ВСПОМОГАТЕЛЬНОЕ
  // ============================================================
  function _fail(msg) {
    _setBusy(false);
    _progressHide();
    _clearPendingButton();
    _hideNavBadge();
    _status(App.t("error") + ": " + msg, "error");
    App.logError && App.logError("Updater", msg);
  }

  function _setBusy(on) {
    document.querySelectorAll(".upd-action").forEach((b) => (b.disabled = on));
    const c = document.getElementById("upd-check");
    if (c) c.disabled = on;
  }

  function _progress(done, total) {
    const wrap = document.getElementById("upd-progress-wrap");
    const bar = document.getElementById("upd-progress");
    const txt = document.getElementById("upd-progress-text");
    if (!wrap) return;
    wrap.style.display = "";
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    bar.style.width = pct + "%";
    txt.textContent = `${_mb(done)} / ${_mb(total)}  (${pct}%)`;
  }

  function _progressHide() {
    const w = document.getElementById("upd-progress-wrap");
    if (w) w.style.display = "none";
  }

  function _status(msg, kind) {
    const el = document.getElementById("upd-status");
    if (!el) return;
    el.style.display = msg ? "" : "none";
    el.textContent = msg || "";
    el.className = "upd-status upd-" + (kind || "info");
  }

  function _cmp(a, b) {
    const p = (v) => {
      const n = String(v || "").replace(/^v/i, "").split("-")[0].split(".").map((x) => parseInt(x, 10) || 0);
      while (n.length < 3) n.push(0);
      return n;
    };
    const x = p(a), y = p(b);
    for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; }
    return 0;
  }

  const _mb = (b) => !b ? "—" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";
  const _trim = (s, n) => s.length > n ? s.slice(0, n) + "…" : s;

  // ============================================================
  // HTML
  // ============================================================
  function _html() {
    return `
    <div class="modal fade" id="update-modal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-arrow-up-circle me-2"></i><span data-i18n="updates">Обновления</span>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>

          <div class="modal-body">
            <div class="upd-info">
              <span data-i18n="currentVersion">Текущая версия</span>:
              <strong id="upd-current">—</strong>
              <span class="upd-repo" id="upd-repo"></span>
            </div>
            <div id="upd-src-mode" style="font-size:11px;margin-top:4px;"></div>

            <div id="upd-dev-warn" class="upd-status upd-warn" style="display:none;">
              <span data-i18n="devModeNoUpdate">Обновление доступно только в собранном приложении, не при запуске из исходников.</span>
              <br><br>
              <b>Как поднять версию:</b>
              <ol style="margin:6px 0 0 20px;padding:0;font-size:11px;">
                <li>Закройте приложение.</li>
                <li>В корне проекта: <code>build.bat 1.0.5</code> (или <code>build.bat bump patch</code>).</li>
                <li>Загрузите новый <code>dist\\TestSys.exe</code> (или <code>dist.zip</code>) в GitHub Release с тегом <code>v1.0.5</code>.</li>
                <li>Запустите новый exe — он покажет актуальную версию и увидит релиз.</li>
              </ol>
            </div>

            <div class="d-flex gap-2 align-items-center my-2 flex-wrap">
              <button class="btn btn-sm send-btn" id="upd-check">
                <i class="bi bi-arrow-clockwise me-1"></i><span data-i18n="checkNow">Проверить</span>
              </button>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="upd-prerelease">
                <label class="form-check-label" for="upd-prerelease" style="font-size:11px;" data-i18n="showPrerelease">
                  Показывать тестовые версии
                </label>
              </div>
              <span id="upd-last-check" style="font-size:10px;color:var(--text-dim);margin-left:auto;"></span>
            </div>

            <div id="upd-status" class="upd-status" style="display:none;"></div>

            <div id="upd-progress-wrap" style="display:none;" class="my-2">
              <div class="upd-progress-track"><div id="upd-progress" class="upd-progress-bar"></div></div>
              <div id="upd-progress-text" class="upd-progress-text"></div>
            </div>

            <h6 class="upd-section" data-i18n="availableVersions">Доступные версии</h6>
            <div id="upd-releases" class="upd-list"></div>

            <div id="upd-backups-wrap" style="display:none;">
              <h6 class="upd-section mt-3">
                <span data-i18n="savedVersions">Сохранённые версии</span>
                <button class="btn btn-sm btn-link p-0 ms-2" id="upd-cleanup" style="font-size:11px;">
                  <span data-i18n="cleanupBackups">Очистить старые</span>
                </button>
              </h6>
              <div class="upd-hint" data-i18n="savedVersionsHint">
                Предыдущие версии остаются на диске — откат на них мгновенный, без скачивания.
              </div>
              <div id="upd-backups" class="upd-list"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="close">Закрыть</button>
            <button type="button" class="btn send-btn btn-sm" id="upd-install" style="display:none;">
              <i class="bi bi-download me-1"></i><span data-i18n="installAndRestart">Установить и перезапустить</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }
})();
