window.App = window.App || {};

(function () {
  const DEFAULT_THEME = {
    accent: "#6366f1",
    bgApp: "#14151a",
    bgPanel: "#1a1c22",
    bgInput: "#20232b",
    textMain: "#e6e7eb",
    borderRadius: 8,
    fontSize: 14,
  };

  App.applyTheme = function (theme) {
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--bg-app", theme.bgApp);
    root.style.setProperty("--bg-panel", theme.bgPanel);
    root.style.setProperty("--bg-input", theme.bgInput);
    root.style.setProperty("--text-main", theme.textMain);
    root.style.setProperty("--radius", theme.borderRadius + "px");
    root.style.fontSize = theme.fontSize + "px";
  };

  function fillThemeForm(theme) {
    document.getElementById("theme-accent").value = theme.accent;
    document.getElementById("theme-bg-app").value = theme.bgApp;
    document.getElementById("theme-bg-panel").value = theme.bgPanel;
    document.getElementById("theme-bg-input").value = theme.bgInput;
    document.getElementById("theme-text").value = theme.textMain;
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
      borderRadius: parseInt(document.getElementById("theme-radius").value, 10),
      fontSize: parseInt(document.getElementById("theme-fontsize").value, 10),
    };
  }

  App.loadAndApplySavedTheme = async function () {
    if (!window.pywebview) return;
    try {
      const raw = await window.pywebview.api.load_theme();
      if (raw) {
        const theme = JSON.parse(raw);
        App.applyTheme(Object.assign({}, DEFAULT_THEME, theme));
      }
    } catch {}
  };

  App.initThemeSettings = function () {
    const modalEl = document.getElementById("theme-modal");
    const modal = new bootstrap.Modal(modalEl);

    document.getElementById("theme-settings-btn").addEventListener("click", async () => {
      let current = DEFAULT_THEME;
      if (window.pywebview) {
        try {
          const raw = await window.pywebview.api.load_theme();
          if (raw) current = Object.assign({}, DEFAULT_THEME, JSON.parse(raw));
        } catch {}
      }
      fillThemeForm(current);
      modal.show();
    });

    ["theme-accent", "theme-bg-app", "theme-bg-panel", "theme-bg-input", "theme-text"].forEach(id => {
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

    document.getElementById("theme-save-btn").addEventListener("click", async () => {
      const theme = readThemeForm();
      App.applyTheme(theme);
      if (window.pywebview) {
        await window.pywebview.api.save_theme(JSON.stringify(theme));
      }
      modal.hide();
    });

    document.getElementById("theme-reset-btn").addEventListener("click", () => {
      fillThemeForm(DEFAULT_THEME);
      App.applyTheme(DEFAULT_THEME);
    });
  };
})();
