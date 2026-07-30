window.App = window.App || {};

(function () {
  // ============================================================
  // PRESET THEMES
  // ============================================================
  const PRESETS = {
    dark: {
      name: "Dark",
      accent: "#6366f1",
      bgApp: "#14151a",
      bgPanel: "#1a1c22",
      bgInput: "#20232b",
      textMain: "#e6e7eb",
      textDim: "#8b8f9c",
      borderColor: "#2b2e38",
      borderRadius: 8,
      fontSize: 14,
    },
    light: {
      name: "Light",
      accent: "#4f46e5",
      bgApp: "#f5f5f5",
      bgPanel: "#ffffff",
      bgInput: "#e8e8ed",
      textMain: "#1a1a2e",
      textDim: "#6b7280",
      borderColor: "#d1d5db",
      borderRadius: 8,
      fontSize: 14,
    },
    midnight: {
      name: "Midnight Blue",
      accent: "#3b82f6",
      bgApp: "#0f172a",
      bgPanel: "#1e293b",
      bgInput: "#334155",
      textMain: "#f1f5f9",
      textDim: "#94a3b8",
      borderColor: "#334155",
      borderRadius: 8,
      fontSize: 14,
    },
    green: {
      name: "Matrix",
      accent: "#22c55e",
      bgApp: "#0a0a0a",
      bgPanel: "#111111",
      bgInput: "#1a1a1a",
      textMain: "#22c55e",
      textDim: "#166534",
      borderColor: "#1a3a1a",
      borderRadius: 4,
      fontSize: 14,
    },
  };

  const DEFAULT_THEME = PRESETS.dark;

  // ============================================================
  // APPLY THEME
  // ============================================================
  App.applyTheme = function (theme) {
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--bg-app", theme.bgApp);
    root.style.setProperty("--bg-panel", theme.bgPanel);
    root.style.setProperty("--bg-input", theme.bgInput);
    root.style.setProperty("--text-main", theme.textMain);
    root.style.setProperty("--text-dim", theme.textDim || "#8b8f9c");
    root.style.setProperty("--border-color", theme.borderColor || "#2b2e38");
    root.style.setProperty("--radius", theme.borderRadius + "px");
    root.style.fontSize = theme.fontSize + "px";

    // Определяем светлая тема или тёмная для Bootstrap
    const isLight = isLightColor(theme.bgApp);
    root.setAttribute("data-bs-theme", isLight ? "light" : "dark");
  };

  function isLightColor(hex) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }

  // ============================================================
  // FORM HELPERS
  // ============================================================
  function fillThemeForm(theme) {
    document.getElementById("theme-accent").value = theme.accent;
    document.getElementById("theme-bg-app").value = theme.bgApp;
    document.getElementById("theme-bg-panel").value = theme.bgPanel;
    document.getElementById("theme-bg-input").value = theme.bgInput;
    document.getElementById("theme-text").value = theme.textMain;
    document.getElementById("theme-text-dim").value = theme.textDim || "#8b8f9c";
    document.getElementById("theme-border").value = theme.borderColor || "#2b2e38";
    document.getElementById("theme-radius").value = theme.borderRadius;
    document.getElementById("theme-radius-value").textContent = theme.borderRadius;
    document.getElementById("theme-fontsize").value = theme.fontSize;
    document.getElementById("theme-fontsize-value").textContent = theme.fontSize;
  }

  function readThemeForm() {
    return {
      accent: document.getElementById("theme-accent").value,
      bgApp: document.getElementById("theme-bg-app").value,
      bgPanel: document.getElementById("theme-bg-panel").value,
      bgInput: document.getElementById("theme-bg-input").value,
      textMain: document.getElementById("theme-text").value,
      textDim: document.getElementById("theme-text-dim").value,
      borderColor: document.getElementById("theme-border").value,
      borderRadius: parseInt(document.getElementById("theme-radius").value, 10),
      fontSize: parseInt(document.getElementById("theme-fontsize").value, 10),
    };
  }

  // ============================================================
  // LOAD / SAVE
  // ============================================================
  App.loadAndApplySavedTheme = async function () {
    // pywebview API может быть не готов при DOMContentLoaded — ждём
    const api = await _waitForPywebview(3000);
    if (!api) return;
    try {
      const raw = await api.load_theme();
      if (raw) {
        const theme = JSON.parse(raw);
        App.applyTheme(Object.assign({}, DEFAULT_THEME, theme));
      }
    } catch (e) {
      console.warn("[Theme] load error:", e);
    }
  };

  function _waitForPywebview(timeout) {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) {
        return resolve(window.pywebview.api);
      }
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.pywebview && window.pywebview.api) {
          clearInterval(iv);
          resolve(window.pywebview.api);
        } else if (Date.now() - start > timeout) {
          clearInterval(iv);
          resolve(null);
        }
      }, 100);
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  App.initThemeSettings = function () {
    const modalEl = document.getElementById("theme-modal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    document.getElementById("theme-settings-btn").addEventListener("click", async () => {
      let current = Object.assign({}, DEFAULT_THEME);
      if (window.pywebview) {
        try {
          const raw = await window.pywebview.api.load_theme();
          if (raw) current = Object.assign({}, DEFAULT_THEME, JSON.parse(raw));
        } catch {}
      }
      fillThemeForm(current);
      modal.show();
    });

    // Live preview на color pickers
    ["theme-accent", "theme-bg-app", "theme-bg-panel", "theme-bg-input", "theme-text", "theme-text-dim", "theme-border"].forEach(id => {
      document.getElementById(id).addEventListener("input", () => App.applyTheme(readThemeForm()));
    });
    document.getElementById("theme-radius").addEventListener("input", (e) => {
      document.getElementById("theme-radius-value").textContent = e.target.value;
      App.applyTheme(readThemeForm());
    });
    document.getElementById("theme-fontsize").addEventListener("input", (e) => {
      document.getElementById("theme-fontsize-value").textContent = e.target.value;
      App.applyTheme(readThemeForm());
    });

    // Preset buttons
    document.querySelectorAll("[data-theme-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.themePreset;
        const preset = PRESETS[key];
        if (preset) {
          fillThemeForm(preset);
          App.applyTheme(preset);
        }
      });
    });

    // Save
    document.getElementById("theme-save-btn").addEventListener("click", async () => {
      const theme = readThemeForm();
      App.applyTheme(theme);
      if (window.pywebview && window.pywebview.api) {
        try {
          await window.pywebview.api.save_theme(JSON.stringify(theme));
        } catch (e) {
          console.warn("[Theme] save error:", e);
        }
      }
      modal.hide();
    });

    // Reset
    document.getElementById("theme-reset-btn").addEventListener("click", () => {
      fillThemeForm(DEFAULT_THEME);
      App.applyTheme(DEFAULT_THEME);
    });
  };
})();
