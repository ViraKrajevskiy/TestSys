/**
 * sidebarPosition.js — положение сайдбара (лево/право/плавающее)
 *
 * Не через настройки в модалке, а через маленький popover прямо в тулбаре
 * сайдбара: три иконки, выбор сохраняется в localStorage и применяется
 * при старте.
 */
window.App = window.App || {};

(function () {
  const STORAGE_KEY = "sidebar.position";
  const VALID = ["left", "right", "floating"];

  /** Применить положение — вешаем класс на #app-root. */
  App.applySidebarPosition = function (pos) {
    if (!VALID.includes(pos)) pos = "left";
    const root = document.getElementById("app-root");
    if (!root) return;
    root.classList.remove("sidebar-right", "sidebar-floating");
    if (pos === "right") root.classList.add("sidebar-right");
    else if (pos === "floating") root.classList.add("sidebar-floating");

    // Сброс inline-width: сохранённая «широкая» ширина от режима
    // «слева» перекрывает 260px у floating, из-за чего сайдбар
    // разъезжается на пол-экрана. В floating размер задаёт CSS.
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      if (pos === "floating") sidebar.style.width = "";
      else {
        // Возвращаем ранее сохранённую ширину, если она есть
        const s = App.getSettings && App.getSettings();
        if (s && s.sidebarWidth) sidebar.style.width = s.sidebarWidth + "px";
      }
    }
    try { localStorage.setItem(STORAGE_KEY, pos); } catch (_) {}
  };

  /** Загрузить сохранённое положение (или дефолт «left»). */
  App.loadSidebarPosition = function () {
    let saved = "left";
    try { saved = localStorage.getItem(STORAGE_KEY) || "left"; } catch (_) {}
    App.applySidebarPosition(saved);
  };

  App.getSidebarPosition = function () {
    const root = document.getElementById("app-root");
    if (!root) return "left";
    if (root.classList.contains("sidebar-floating")) return "floating";
    if (root.classList.contains("sidebar-right")) return "right";
    return "left";
  };

  /**
   * Показать маленькое меню выбора рядом с кнопкой.
   * Используется из тулбара сайдбара (кнопка bi-layout-sidebar).
   */
  App.showSidebarPositionMenu = function (anchorBtn) {
    // Уже открыто — закрываем (кнопка работает как toggle)
    const existing = document.getElementById("sidebar-pos-menu");
    if (existing) { existing.remove(); return; }

    const current = App.getSidebarPosition();
    const items = [
      { key: "left",     icon: "bi-layout-sidebar",         label: App.t("sidebarLeft")     || "Слева" },
      { key: "right",    icon: "bi-layout-sidebar-reverse", label: App.t("sidebarRight")    || "Справа" },
      { key: "floating", icon: "bi-window-stack",           label: App.t("sidebarFloating") || "Плавающее" },
    ];

    const menu = document.createElement("div");
    menu.id = "sidebar-pos-menu";
    menu.className = "sb-pos-menu";
    menu.innerHTML = items.map((it) => `
      <button class="sb-pos-item ${it.key === current ? "active" : ""}" data-pos="${it.key}">
        <i class="bi ${it.icon}"></i>
        <span>${it.label}</span>
      </button>`).join("");

    document.body.appendChild(menu);

    // Позиционируем: сначала измеряем реальные размеры меню (шрифты, i18n),
    // потом выбираем сторону — приоритет там, где больше свободного места,
    // и всегда прижимаем к viewport, чтобы ничего не уезжало за край.
    const rect = anchorBtn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const gap = 6;
    const pad = 6;   // отступ от края окна

    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft  = rect.left;

    let left, top;
    if (spaceRight >= mw + gap + pad) {
      // Справа от кнопки
      left = rect.right + gap;
    } else if (spaceLeft >= mw + gap + pad) {
      // Слева от кнопки — важно для правого сайдбара, где справа края нет
      left = rect.left - mw - gap;
    } else {
      // Ни там ни там — под кнопкой, прижимая к правому краю окна
      left = Math.max(pad, window.innerWidth - mw - pad);
    }
    top = rect.top;
    // Не даём меню вылезти снизу
    if (top + mh + pad > window.innerHeight) {
      top = Math.max(pad, window.innerHeight - mh - pad);
    }
    menu.style.left = left + "px";
    menu.style.top  = top + "px";

    menu.querySelectorAll(".sb-pos-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        App.applySidebarPosition(el.dataset.pos);
        menu.remove();
      });
    });

    // Клик мимо — закрываем
    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorBtn) {
          menu.remove();
          document.removeEventListener("mousedown", off, true);
        }
      };
      document.addEventListener("mousedown", off, true);
    }, 0);
  };
})();
