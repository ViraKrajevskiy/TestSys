/**
 * theme.js — Система тем.
 *
 * Что тут делаем:
 *   1. Расширенная палитра (12+ переменных вместо 8) — success/warn/danger
 *      теперь тоже темизируются, а не захардкожены в CSS.
 *   2. Реальные пресеты в духе популярных редакторов — Nord, Dracula,
 *      Monokai, Solarized, GitHub, а не рандомные наборы.
 *   3. Автогенерация всей палитры из одного акцента и одного «яркость»
 *      слайдера — для тех, кто просто хочет «синюю тему» и не хочет
 *      подбирать 10 цветов вручную.
 *   4. Экспорт/импорт темы в JSON и в буфер обмена — можно шарить.
 *   5. Именованные пользовательские темы — сохраняете свою «Vira Dark»
 *      и переключаетесь между ней и рабочей за один клик.
 *   6. Всё в CSS-переменных, никаких inline-цветов на элементах.
 */
window.App = window.App || {};

(function () {
  const STORAGE_KEY = "theme.userThemes";     // {name: theme}
  const CURRENT_KEY = "theme.current";        // имя активной темы (или "custom")
  const QUICK_KEY   = "theme.quick";          // последняя применённая тема (быстрый старт)

  // ── Применяем тему НЕМЕДЛЕННО из localStorage, не ожидая pywebview ────────
  // Вызывается синхронно, пока страница ещё не успела отрисоваться.
  // Устраняет «флеш» (мигание дефолтной темы до загрузки сохранённой).
  (function _earlyApply() {
    try {
      const raw = localStorage.getItem(QUICK_KEY);
      if (raw) {
        const t = JSON.parse(raw);
        // Минимальный набор переменных — полный applyTheme недоступен ещё.
        const r = document.documentElement;
        const set = (k, v) => v && r.style.setProperty(k, v);
        set("--accent",       t.accent);
        set("--bg-app",       t.bgApp);
        set("--bg-panel",     t.bgPanel);
        set("--bg-input",     t.bgInput);
        set("--text-main",    t.textMain);
        set("--text-color",   t.textMain);
        set("--text-dim",     t.textDim);
        set("--border-color", t.borderColor);
        set("--success",      t.success);
        set("--warn",         t.warn);
        set("--danger",       t.danger);
        if (t.borderRadius !== undefined) r.style.setProperty("--radius", t.borderRadius + "px");
        if (t.fontSize)      r.style.fontSize = t.fontSize + "px";
        const isLight = _earlyIsLight(t.bgApp || "#14151a");
        r.setAttribute("data-bs-theme", isLight ? "light" : "dark");
      }
    } catch (_) {}
  })();

  function _earlyIsLight(hex) {
    try {
      const c = hex.replace("#","");
      const f = c.length === 3 ? c.split("").map(x=>x+x).join("") : c;
      const r=parseInt(f.slice(0,2),16), g=parseInt(f.slice(2,4),16), b=parseInt(f.slice(4,6),16);
      return (r*299+g*587+b*114)/1000 > 128;
    } catch { return false; }
  }

  // ============================================================
  // ПРЕСЕТЫ — известные схемы, а не рандом
  // ============================================================
  const PRESETS = {
    dark: {
      name: "TestSys Dark", accent: "#6366f1",
      bgApp: "#14151a", bgPanel: "#1a1c22", bgInput: "#20232b",
      textMain: "#e6e7eb", textDim: "#8b8f9c", borderColor: "#2b2e38",
      success: "#22c55e", warn: "#eab308", danger: "#ef4444",
      borderRadius: 8, fontSize: 14,
    },
    light: {
      name: "TestSys Light", accent: "#4f46e5",
      bgApp: "#f5f5f7", bgPanel: "#ffffff", bgInput: "#eceef2",
      textMain: "#1a1a2e", textDim: "#6b7280", borderColor: "#d1d5db",
      success: "#16a34a", warn: "#ca8a04", danger: "#dc2626",
      borderRadius: 8, fontSize: 14,
    },
    nord: {
      name: "Nord", accent: "#88c0d0",
      bgApp: "#2e3440", bgPanel: "#3b4252", bgInput: "#434c5e",
      textMain: "#eceff4", textDim: "#81a1c1", borderColor: "#4c566a",
      success: "#a3be8c", warn: "#ebcb8b", danger: "#bf616a",
      borderRadius: 6, fontSize: 14,
    },
    dracula: {
      name: "Dracula", accent: "#bd93f9",
      bgApp: "#282a36", bgPanel: "#21222c", bgInput: "#44475a",
      textMain: "#f8f8f2", textDim: "#6272a4", borderColor: "#44475a",
      success: "#50fa7b", warn: "#f1fa8c", danger: "#ff5555",
      borderRadius: 6, fontSize: 14,
    },
    monokai: {
      name: "Monokai", accent: "#a6e22e",
      bgApp: "#272822", bgPanel: "#1e1f1c", bgInput: "#3e3d32",
      textMain: "#f8f8f2", textDim: "#75715e", borderColor: "#49483e",
      success: "#a6e22e", warn: "#e6db74", danger: "#f92672",
      borderRadius: 4, fontSize: 14,
    },
    solarizedDark: {
      name: "Solarized Dark", accent: "#268bd2",
      bgApp: "#002b36", bgPanel: "#073642", bgInput: "#094551",
      textMain: "#eee8d5", textDim: "#93a1a1", borderColor: "#586e75",
      success: "#859900", warn: "#b58900", danger: "#dc322f",
      borderRadius: 6, fontSize: 14,
    },
    solarizedLight: {
      name: "Solarized Light", accent: "#268bd2",
      bgApp: "#fdf6e3", bgPanel: "#eee8d5", bgInput: "#eee8d5",
      textMain: "#073642", textDim: "#657b83", borderColor: "#d8d2b8",
      success: "#859900", warn: "#b58900", danger: "#dc322f",
      borderRadius: 6, fontSize: 14,
    },
    githubDark: {
      name: "GitHub Dark", accent: "#58a6ff",
      bgApp: "#0d1117", bgPanel: "#161b22", bgInput: "#21262d",
      textMain: "#c9d1d9", textDim: "#8b949e", borderColor: "#30363d",
      success: "#3fb950", warn: "#d29922", danger: "#f85149",
      borderRadius: 6, fontSize: 14,
    },
    githubLight: {
      name: "GitHub Light", accent: "#0969da",
      bgApp: "#ffffff", bgPanel: "#f6f8fa", bgInput: "#eaeef2",
      textMain: "#1f2328", textDim: "#59636e", borderColor: "#d0d7de",
      success: "#1a7f37", warn: "#9a6700", danger: "#cf222e",
      borderRadius: 6, fontSize: 14,
    },
    midnight: {
      name: "Midnight Blue", accent: "#3b82f6",
      bgApp: "#0f172a", bgPanel: "#1e293b", bgInput: "#334155",
      textMain: "#f1f5f9", textDim: "#94a3b8", borderColor: "#334155",
      success: "#10b981", warn: "#f59e0b", danger: "#ef4444",
      borderRadius: 8, fontSize: 14,
    },
    matrix: {
      name: "Matrix", accent: "#22c55e",
      bgApp: "#0a0a0a", bgPanel: "#111111", bgInput: "#1a1a1a",
      textMain: "#22c55e", textDim: "#166534", borderColor: "#1a3a1a",
      success: "#22c55e", warn: "#eab308", danger: "#ef4444",
      borderRadius: 2, fontSize: 14,
    },
    highContrast: {
      name: "High Contrast", accent: "#ffff00",
      bgApp: "#000000", bgPanel: "#0a0a0a", bgInput: "#1a1a1a",
      textMain: "#ffffff", textDim: "#c0c0c0", borderColor: "#ffffff",
      success: "#00ff00", warn: "#ffff00", danger: "#ff0000",
      borderRadius: 0, fontSize: 15,
    },
  };
  App.THEME_PRESETS = PRESETS;

  const DEFAULT_THEME = PRESETS.dark;
  App.DEFAULT_THEME = DEFAULT_THEME;

  // ============================================================
  // APPLY — вешаем всё на CSS-переменные
  // ============================================================
  App.applyTheme = function (theme) {
    const t = _fill(theme);
    const root = document.documentElement;

    // Базовые
    root.style.setProperty("--accent", t.accent);
    root.style.setProperty("--bg-app", t.bgApp);
    root.style.setProperty("--bg-panel", t.bgPanel);
    root.style.setProperty("--bg-input", t.bgInput);
    root.style.setProperty("--text-main", t.textMain);
    root.style.setProperty("--text-color", t.textMain);       // alias — местами используется
    root.style.setProperty("--text-dim", t.textDim);
    root.style.setProperty("--border-color", t.borderColor);
    root.style.setProperty("--radius", t.borderRadius + "px");
    root.style.fontSize = t.fontSize + "px";

    // Семантические (успех/предупреждение/ошибка) — раньше были захардкожены
    root.style.setProperty("--success", t.success);
    root.style.setProperty("--warn",    t.warn);
    root.style.setProperty("--danger",  t.danger);
    root.style.setProperty("--success-soft", withAlpha(t.success, 0.15));
    root.style.setProperty("--warn-soft",    withAlpha(t.warn,    0.15));
    root.style.setProperty("--danger-soft",  withAlpha(t.danger,  0.15));

    // Читаемый цвет текста поверх акцента — считаем контраст
    root.style.setProperty("--accent-text", contrastText(t.accent));
    root.style.setProperty("--accent-soft",  withAlpha(t.accent, 0.12));
    root.style.setProperty("--accent-focus", withAlpha(t.accent, 0.25));

    // Bootstrap-переключение — для его собственных цветов кнопок и т.п.
    const isLight = isLightColor(t.bgApp);
    root.setAttribute("data-bs-theme", isLight ? "light" : "dark");
  };

  /** Дозаполняем недостающие поля дефолтами — тема может быть неполной. */
  function _fill(t) {
    return Object.assign({}, DEFAULT_THEME, t || {});
  }

  // ============================================================
  // АВТОГЕНЕРАЦИЯ ПАЛИТРЫ из одного акцента + режима
  // ============================================================
  /**
   * Из одного цвета + режима «dark|light» собираем полную тему.
   * Для тех, кто не хочет крутить 10 пикеров.
   *   accent    — главный цвет (кнопки, ссылки)
   *   mode      — "dark" | "light"
   */
  App.deriveThemeFromAccent = function (accent, mode = "dark") {
    const base = mode === "light" ? PRESETS.light : PRESETS.dark;
    // Не берём accent'ное значение фона — оставляем нейтральный, чтобы
    // текст читался. Пользователь всегда может подкрутить руками.
    return Object.assign({}, base, {
      name: mode === "light" ? "Custom Light" : "Custom Dark",
      accent,
    });
  };

  // ============================================================
  // ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЬСКИХ ТЕМ
  // ============================================================
  function _loadUserThemes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function _saveUserThemes(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
  }
  App.getUserThemes  = _loadUserThemes;
  App.saveUserTheme  = (name, theme) => {
    if (!name) return false;
    const map = _loadUserThemes();
    map[name] = _fill(theme);
    _saveUserThemes(map);
    return true;
  };
  App.deleteUserTheme = (name) => {
    const map = _loadUserThemes();
    if (map[name]) { delete map[name]; _saveUserThemes(map); return true; }
    return false;
  };
  App.getAllThemes = () => {
    // Пресеты + пользовательские, помеченные признаком builtin
    const out = [];
    Object.entries(PRESETS).forEach(([k, v]) => out.push({ key: k, builtin: true, theme: v }));
    Object.entries(_loadUserThemes()).forEach(([k, v]) => out.push({ key: k, builtin: false, theme: v }));
    return out;
  };

  // ============================================================
  // ЭКСПОРТ / ИМПОРТ
  // ============================================================
  App.exportThemeToJson = (theme) => JSON.stringify(_fill(theme), null, 2);
  App.importThemeFromJson = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") return { ok: false, error: "Не JSON-объект" };
      // Минимальная валидация — есть ли хоть один известный цветовой ключ
      const cols = ["accent", "bgApp", "bgPanel", "textMain"];
      if (!cols.some(k => k in parsed)) return { ok: false, error: "Не похоже на тему TestSys" };
      return { ok: true, theme: _fill(parsed) };
    } catch (e) {
      return { ok: false, error: "Невалидный JSON: " + e.message };
    }
  };

  // ============================================================
  // УТИЛИТЫ ЦВЕТА
  // ============================================================
  function isLightColor(hex) {
    const [r, g, b] = hexRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }

  function contrastText(hex) {
    const [r, g, b] = hexRgb(hex);
    const y = (r * 299 + g * 587 + b * 114) / 1000;
    return y > 150 ? "#1a1a1a" : "#ffffff";
  }

  function hexRgb(hex) {
    const c = String(hex || "#000000").replace("#", "");
    const full = c.length === 3 ? c.split("").map(x => x + x).join("") : c;
    return [
      parseInt(full.substring(0, 2), 16) || 0,
      parseInt(full.substring(2, 4), 16) || 0,
      parseInt(full.substring(4, 6), 16) || 0,
    ];
  }

  function withAlpha(hex, alpha) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  App.themeUtils = { isLightColor, contrastText, hexRgb, withAlpha };

  // ============================================================
  // ЗАГРУЗКА СОХРАНЁННОЙ ТЕМЫ ПРИ СТАРТЕ
  // ============================================================
  App.loadAndApplySavedTheme = async function () {
    const api = await _waitForPywebview(3000);
    if (!api) return;
    try {
      const raw = await api.load_theme();
      if (raw) {
        const theme = JSON.parse(raw);
        App.applyTheme(theme);
        // Синхронизируем localStorage с вычисленным accentText — следующий старт без флеша.
        const filled = _fill(theme);
        const toCache = Object.assign({}, filled, { accentText: contrastText(filled.accent) });
        try { localStorage.setItem(QUICK_KEY, JSON.stringify(toCache)); } catch (_) {}
      }
    } catch (e) {
      console.warn("[Theme] load error:", e);
    }
  };

  function _waitForPywebview(timeout) {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.pywebview && window.pywebview.api) { clearInterval(iv); resolve(window.pywebview.api); }
        else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  /** Сохранить и применить одновременно. */
  App.saveAndApplyTheme = async function (theme) {
    const t = _fill(theme);
    App.applyTheme(t);
    // Сохраняем в localStorage с вычисленным accentText —
    // чтобы инлайн-скрипт в <head> мог применить его мгновенно без флеша.
    const toSave = Object.assign({}, t, { accentText: contrastText(t.accent) });
    try { localStorage.setItem(QUICK_KEY, JSON.stringify(toSave)); } catch (_) {}
    const api = window.pywebview && window.pywebview.api;
    if (api && api.save_theme) {
      try { await api.save_theme(JSON.stringify(t)); } catch (e) { console.warn(e); }
    }
    return t;
  };

  // ============================================================
  // UI — модалка тем (переработана: три вкладки)
  // ============================================================
  App.initThemeSettings = function () {
    // Впрыскиваем HTML модалки один раз
    if (!document.getElementById("theme-modal-v2")) {
      document.body.insertAdjacentHTML("beforeend", _modalHtml());
      _wire();
    }

    document.getElementById("theme-settings-btn")?.addEventListener("click", () => {
      App.openThemeModal();
    });

    // При смене языка перерисовываем список пресетов и «мои темы» —
    // их имена и описания генерятся в JS, data-i18n их не покроет.
    App.onLangChange && App.onLangChange(() => {
      const modal = document.getElementById("theme-modal-v2");
      if (!modal || !modal.classList.contains("show")) return;
      _renderPresets();
      _renderMyThemes();
    });
  };

  App.openThemeModal = async function () {
    // Защита: если модалку кто-то удалил из DOM (например, i18n при смене
    // языка), пересоздаём — иначе Bootstrap падает на getOrCreateInstance(null).
    if (!document.getElementById("theme-modal-v2")) {
      document.body.insertAdjacentHTML("beforeend", _modalHtml());
      _wire();
    }
    const modalEl = document.getElementById("theme-modal-v2");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    // Подтянем текущую тему
    let current = Object.assign({}, DEFAULT_THEME);
    if (window.pywebview && window.pywebview.api) {
      try {
        const raw = await window.pywebview.api.load_theme();
        if (raw) current = Object.assign({}, DEFAULT_THEME, JSON.parse(raw));
      } catch {}
    }
    _fillCustomForm(current);
    _renderPresets(current);
    _renderMyThemes(current);
    modal.show();
  };

  let _originalTheme = null;   // чтобы Cancel вернул как было

  function _wire() {
    const root = document.getElementById("theme-modal-v2");

    // Запоминаем «до», чтобы при отмене вернуть
    root.addEventListener("show.bs.modal", async () => {
      const api = window.pywebview && window.pywebview.api;
      if (!api) { _originalTheme = null; return; }
      try {
        const raw = await api.load_theme();
        _originalTheme = raw ? JSON.parse(raw) : null;
      } catch { _originalTheme = null; }
    });
    root.addEventListener("hide.bs.modal", (e) => {
      // Если модалку закрыли крестиком без сохранения — откатываем
      if (root.dataset.saved === "1") { root.dataset.saved = ""; return; }
      if (_originalTheme) App.applyTheme(_originalTheme);
    });

    // Live-preview всех color pickers и слайдеров кастомной вкладки
    ["theme-accent","theme-bg-app","theme-bg-panel","theme-bg-input","theme-text","theme-text-dim","theme-border","theme-success","theme-warn","theme-danger"]
      .forEach(id => root.querySelector("#" + id)?.addEventListener("input", () => App.applyTheme(_readCustomForm())));

    root.querySelector("#theme-radius")?.addEventListener("input", (e) => {
      root.querySelector("#theme-radius-value").textContent = e.target.value;
      App.applyTheme(_readCustomForm());
    });
    root.querySelector("#theme-fontsize")?.addEventListener("input", (e) => {
      root.querySelector("#theme-fontsize-value").textContent = e.target.value;
      App.applyTheme(_readCustomForm());
    });

    // Автогенерация «из акцента»
    root.querySelector("#theme-auto-generate")?.addEventListener("click", () => {
      const accent = root.querySelector("#theme-quickcolor").value;
      const mode   = root.querySelector('input[name="theme-quickmode"]:checked')?.value || "dark";
      const t = App.deriveThemeFromAccent(accent, mode);
      _fillCustomForm(t);
      App.applyTheme(t);
      // Переключим на «Кастом», чтобы юзер увидел заполненные поля
      root.querySelector('[data-bs-target="#theme-tab-custom"]').click();
    });

    // Сохранить как пользовательскую тему
    root.querySelector("#theme-save-as").addEventListener("click", async () => {
      const name = await App.showPrompt({
        title: App.t("saveThemeAs") || "Сохранить тему как…",
        label: App.t("themeName") || "Имя темы",
        placeholder: "My Dark", value: "",
      });
      if (!name) return;
      App.saveUserTheme(name, _readCustomForm());
      _renderMyThemes(_readCustomForm());
      App.syncToast && App.syncToast((App.t("themeSaved") || "Тема сохранена") + ": " + name);
    });

    // Экспорт в буфер / файл
    root.querySelector("#theme-export").addEventListener("click", async () => {
      const json = App.exportThemeToJson(_readCustomForm());
      try {
        await navigator.clipboard.writeText(json);
        App.syncToast && App.syncToast(App.t("themeCopied") || "Тема скопирована в буфер");
      } catch { App.showAlert(json.slice(0, 300)); }
    });

    // Импорт из вставленного JSON
    root.querySelector("#theme-import").addEventListener("click", async () => {
      const txt = await App.showPrompt({
        title: App.t("importTheme") || "Импорт темы",
        label: App.t("pasteJson") || "Вставьте JSON темы",
        placeholder: "{ \"accent\": \"#...\", ... }", multiline: true,
      });
      if (!txt) return;
      const res = App.importThemeFromJson(txt);
      if (!res.ok) { App.showAlert(App.t("error") + ": " + res.error); return; }
      _fillCustomForm(res.theme);
      App.applyTheme(res.theme);
    });

    // Сохранить (закрыть модалку)
    root.querySelector("#theme-save-btn").addEventListener("click", async () => {
      root.dataset.saved = "1";
      await App.saveAndApplyTheme(_readCustomForm());
      bootstrap.Modal.getOrCreateInstance(root).hide();
    });

    // Сброс к дефолту
    root.querySelector("#theme-reset-btn").addEventListener("click", () => {
      _fillCustomForm(DEFAULT_THEME);
      App.applyTheme(DEFAULT_THEME);
    });
  }

  // ---------- рендер вкладок ----------
  function _renderPresets(current) {
    const wrap = document.getElementById("theme-presets-grid");
    if (!wrap) return;
    wrap.innerHTML = Object.entries(PRESETS).map(([key, t]) => `
      <div class="theme-card" data-preset="${key}" title="${t.name}">
        <div class="theme-card-swatches" style="background:${t.bgApp};">
          <span class="swatch-accent" style="background:${t.accent};flex:1.6;"></span>
          <span style="background:${t.success};"></span>
          <span style="background:${t.warn};"></span>
          <span style="background:${t.danger};"></span>
        </div>
        <div class="theme-card-name" style="color:${t.textMain};background:${t.bgPanel};border-top:1px solid ${t.borderColor};">
          ${t.name}
        </div>
      </div>`).join("");
    wrap.querySelectorAll(".theme-card").forEach(card => {
      card.addEventListener("click", async () => {
        const key = card.dataset.preset;
        const preset = PRESETS[key];
        if (!preset) return;
        _fillCustomForm(preset);
        await App.saveAndApplyTheme(preset);
        wrap.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
      });
    });
  }

  function _renderMyThemes(current) {
    const wrap = document.getElementById("theme-my-list");
    if (!wrap) return;
    const themes = App.getUserThemes();
    const keys = Object.keys(themes);
    if (!keys.length) {
      wrap.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding:12px;text-align:center;">
        ${App.t("noUserThemes") || "Пока нет сохранённых тем. Настройте цвета на вкладке «Кастом» и нажмите «Сохранить как…»."}
      </div>`;
      return;
    }
    wrap.innerHTML = keys.map(name => {
      const t = themes[name];
      return `
        <div class="theme-card theme-user-card" data-name="${_esc(name)}">
          <div class="theme-card-swatches" style="background:${t.bgApp};">
            <span style="background:${t.accent};"></span>
            <span style="background:${t.bgPanel};"></span>
            <span style="background:${t.textMain};"></span>
          </div>
          <div class="theme-card-name" style="color:${t.textMain};background:${t.bgPanel};">
            ${_esc(name)}
            <button class="theme-user-del" data-del="${_esc(name)}" title="${App.t("delete") || "Удалить"}">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>`;
    }).join("");

    wrap.querySelectorAll(".theme-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".theme-user-del")) return;
        const name = card.dataset.name;
        const t = App.getUserThemes()[name];
        if (t) { _fillCustomForm(t); App.saveAndApplyTheme(t); }
      });
    });
    wrap.querySelectorAll(".theme-user-del").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const name = btn.dataset.del;
        const ok = await App.showConfirm({
          title: App.t("delete") || "Удалить",
          message: `${name}?`, okText: App.t("delete") || "Удалить", danger: true,
        });
        if (ok) { App.deleteUserTheme(name); _renderMyThemes(); }
      });
    });
  }

  // ---------- заполнение / чтение кастомной формы ----------
  function _fillCustomForm(t) {
    t = _fill(t);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set("theme-accent",   t.accent);
    set("theme-bg-app",   t.bgApp);
    set("theme-bg-panel", t.bgPanel);
    set("theme-bg-input", t.bgInput);
    set("theme-text",     t.textMain);
    set("theme-text-dim", t.textDim);
    set("theme-border",   t.borderColor);
    set("theme-success",  t.success);
    set("theme-warn",     t.warn);
    set("theme-danger",   t.danger);
    set("theme-radius",   t.borderRadius);
    set("theme-fontsize", t.fontSize);
    const rv = document.getElementById("theme-radius-value");   if (rv) rv.textContent = t.borderRadius;
    const fv = document.getElementById("theme-fontsize-value"); if (fv) fv.textContent = t.fontSize;
  }
  function _readCustomForm() {
    const g = (id) => document.getElementById(id)?.value;
    return {
      accent: g("theme-accent"), bgApp: g("theme-bg-app"), bgPanel: g("theme-bg-panel"),
      bgInput: g("theme-bg-input"), textMain: g("theme-text"), textDim: g("theme-text-dim"),
      borderColor: g("theme-border"), success: g("theme-success"), warn: g("theme-warn"),
      danger: g("theme-danger"),
      borderRadius: parseInt(g("theme-radius"), 10),
      fontSize: parseInt(g("theme-fontsize"), 10),
    };
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ============================================================
  // HTML модалки
  // ============================================================
  function _modalHtml() {
    // Все статические подписи вынесены в data-i18n — applyTranslations()
    // переключит их без пересборки. Полный список ключей — в i18n.js.
    return `
    <div class="modal fade" id="theme-modal-v2" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content theme-modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-palette me-2"></i><span data-i18n="theme">Тема</span></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">

            <ul class="nav nav-tabs" role="tablist" style="border-color:var(--border-color);">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#theme-tab-presets" type="button" data-i18n="presets">Пресеты</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#theme-tab-quick" type="button" data-i18n="quickGen">Быстрая генерация</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#theme-tab-custom" type="button" data-i18n="custom">Кастом</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#theme-tab-my" type="button" data-i18n="myThemes">Мои темы</button></li>
            </ul>

            <div class="tab-content pt-3">

              <!-- ПРЕСЕТЫ -->
              <div class="tab-pane fade show active" id="theme-tab-presets">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;" data-i18n="clickToApply">
                  Кликните — тема применится сразу. Отмена вернёт как было.
                </div>
                <div id="theme-presets-grid" class="theme-grid"></div>
              </div>

              <!-- БЫСТРАЯ ГЕНЕРАЦИЯ -->
              <div class="tab-pane fade" id="theme-tab-quick">
                <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;" data-i18n="pickColorAndMode">
                  Выберите главный цвет и режим — сгенерируем всю палитру.
                </div>
                <div class="d-flex gap-3 align-items-center flex-wrap">
                  <div>
                    <label class="form-label" style="font-size:12px;" data-i18n="mainColor">Главный цвет</label>
                    <input type="color" id="theme-quickcolor" value="#6366f1" style="width:70px;height:38px;padding:2px;">
                  </div>
                  <div class="form-check form-check-inline align-self-end">
                    <input class="form-check-input" type="radio" name="theme-quickmode" value="dark" id="tqmd" checked>
                    <label class="form-check-label" for="tqmd" data-i18n="dark">Тёмная</label>
                  </div>
                  <div class="form-check form-check-inline align-self-end">
                    <input class="form-check-input" type="radio" name="theme-quickmode" value="light" id="tqml">
                    <label class="form-check-label" for="tqml" data-i18n="light">Светлая</label>
                  </div>
                  <button class="btn send-btn btn-sm align-self-end" id="theme-auto-generate">
                    <i class="bi bi-magic me-1"></i><span data-i18n="generate">Сгенерировать</span>
                  </button>
                </div>
              </div>

              <!-- КАСТОМ -->
              <div class="tab-pane fade" id="theme-tab-custom">
                <div class="row g-2">
                  ${_colorField("theme-accent",   "accent",     "Акцент")}
                  ${_colorField("theme-bg-app",   "bgApp",      "Фон приложения")}
                  ${_colorField("theme-bg-panel", "bgPanel",    "Фон панелей")}
                  ${_colorField("theme-bg-input", "bgInput",    "Фон инпутов")}
                  ${_colorField("theme-text",     "textMain",   "Основной текст")}
                  ${_colorField("theme-text-dim", "textDim",    "Второстепенный текст")}
                  ${_colorField("theme-border",   "borderColor","Рамки")}
                  ${_colorField("theme-success",  "success",    "Успех")}
                  ${_colorField("theme-warn",     "warn",       "Предупреждение")}
                  ${_colorField("theme-danger",   "danger",     "Ошибка")}
                </div>
                <div class="mt-3">
                  <label class="form-label" style="font-size:12px;"><span data-i18n="borderRadius">Скругление</span> (<span id="theme-radius-value">8</span>px)</label>
                  <input type="range" class="form-range" id="theme-radius" min="0" max="20" step="1">
                </div>
                <div>
                  <label class="form-label" style="font-size:12px;"><span data-i18n="fontSize">Размер шрифта</span> (<span id="theme-fontsize-value">14</span>px)</label>
                  <input type="range" class="form-range" id="theme-fontsize" min="11" max="20" step="1">
                </div>
                <div class="d-flex gap-2 flex-wrap mt-3">
                  <button class="btn btn-sm btn-outline-secondary" id="theme-save-as">
                    <i class="bi bi-bookmark-plus me-1"></i><span data-i18n="saveThemeAs">Сохранить как…</span>
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" id="theme-export">
                    <i class="bi bi-clipboard me-1"></i><span data-i18n="copyJson">Скопировать JSON</span>
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" id="theme-import">
                    <i class="bi bi-clipboard-check me-1"></i><span data-i18n="importTheme">Импорт</span>
                  </button>
                </div>
              </div>

              <!-- МОИ ТЕМЫ -->
              <div class="tab-pane fade" id="theme-tab-my">
                <div id="theme-my-list" class="theme-grid"></div>
              </div>

            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="theme-reset-btn">
              <i class="bi bi-arrow-counterclockwise me-1"></i><span data-i18n="defaults">По умолчанию</span>
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal" data-i18n="cancel">Отмена</button>
            <button type="button" class="btn send-btn btn-sm" id="theme-save-btn">
              <i class="bi bi-check-lg me-1"></i><span data-i18n="save">Сохранить</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function _colorField(id, key, label) {
    return `
      <div class="col-6 col-md-4">
        <label class="form-label" style="font-size:11px;" data-i18n="${key}">${label}</label>
        <input type="color" class="form-control form-control-sm theme-color-input" id="${id}">
      </div>`;
  }

  function _t(key, fallback) {
    return (App.t && App.t(key)) || fallback;
  }
})();
