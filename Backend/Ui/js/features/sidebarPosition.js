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

  const GEOM_KEY = "sidebar.floatGeom";   // {left, top, width, height}
  const MIN_W = 220, MIN_H = 200;

  /** Применить положение — вешаем класс на #app-root. */
  App.applySidebarPosition = function (pos) {
    if (!VALID.includes(pos)) pos = "left";
    const root = document.getElementById("app-root");
    if (!root) return;
    root.classList.remove("sidebar-right", "sidebar-floating");
    if (pos === "right") root.classList.add("sidebar-right");
    else if (pos === "floating") root.classList.add("sidebar-floating");

    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      if (pos === "floating") {
        // В плавающем режиме геометрию задаём мы: восстанавливаем
        // сохранённые координаты либо ставим дефолт у левого края.
        _applyFloatGeom(sidebar);
        _ensureFloatChrome(sidebar);
      } else {
        // Возврат в док: чистим inline-геометрию от плавающего режима,
        // иначе позиция «прилипает» и колонка разъезжается.
        sidebar.style.left = sidebar.style.top = "";
        sidebar.style.height = "";
        _removeFloatChrome(sidebar);
        const s = App.getSettings && App.getSettings();
        sidebar.style.width = (s && s.sidebarWidth) ? s.sidebarWidth + "px" : "";
      }
    }
    try { localStorage.setItem(STORAGE_KEY, pos); } catch (_) {}
  };

  // ============================================================
  // ПЛАВАЮЩЕЕ ОКНО: геометрия, перетаскивание, ресайз
  // ============================================================
  function _loadGeom() {
    try { return JSON.parse(localStorage.getItem(GEOM_KEY) || "null"); }
    catch (_) { return null; }
  }
  function _saveGeom(g) {
    try { localStorage.setItem(GEOM_KEY, JSON.stringify(g)); } catch (_) {}
  }

  /** Держим окно в пределах экрана — после ресайза приложения тоже. */
  function _clamp(g) {
    const maxW = Math.max(MIN_W, window.innerWidth  - 24);
    const maxH = Math.max(MIN_H, window.innerHeight - 60);
    g.width  = Math.min(Math.max(g.width  || 300, MIN_W), maxW);
    g.height = Math.min(Math.max(g.height || 480, MIN_H), maxH);
    g.left = Math.min(Math.max(g.left ?? 12, 0), window.innerWidth  - g.width);
    g.top  = Math.min(Math.max(g.top  ?? 56, 40), window.innerHeight - g.height);
    return g;
  }

  function _applyFloatGeom(sidebar) {
    const g = _clamp(_loadGeom() || { left: 12, top: 56, width: 300, height: Math.min(560, window.innerHeight - 100) });
    sidebar.style.left   = g.left + "px";
    sidebar.style.top    = g.top + "px";
    sidebar.style.width  = g.width + "px";
    sidebar.style.height = g.height + "px";
    _saveGeom(g);
  }

  /** Добавляем «обвязку окна»: кнопку закрытия и ручку ресайза. */
  function _ensureFloatChrome(sidebar) {
    const header = sidebar.querySelector(".sidebar-header");
    if (header && !header.querySelector(".sb-float-close")) {
      header.classList.add("sb-float-draggable");
      const btn = document.createElement("button");
      btn.className = "sb-float-close";
      btn.title = (App.t && App.t("hidePanel")) || "Скрыть панель";
      btn.innerHTML = '<i class="bi bi-x-lg"></i>';
      btn.addEventListener("mousedown", e => e.stopPropagation());  // не тянуть окно
      btn.addEventListener("click", () => {
        const toggle = document.getElementById("sidebar-toggle-btn");
        if (toggle) toggle.click();
      });
      header.appendChild(btn);
    }
    if (!sidebar.querySelector(".sb-float-resize")) {
      const grip = document.createElement("div");
      grip.className = "sb-float-resize";
      sidebar.appendChild(grip);
    }
  }

  function _removeFloatChrome(sidebar) {
    sidebar.querySelector(".sidebar-header")?.classList.remove("sb-float-draggable");
    sidebar.querySelector(".sb-float-close")?.remove();
    sidebar.querySelector(".sb-float-resize")?.remove();
  }

  /** Перетаскивание за шапку и ресайз за правый нижний угол. */
  function _initFloatInteractions() {
    const sidebar = document.getElementById("sidebar");
    const root = document.getElementById("app-root");
    if (!sidebar || !root) return;

    let mode = null;              // "drag" | "resize"
    let sx = 0, sy = 0, start = null;

    sidebar.addEventListener("mousedown", (e) => {
      if (!root.classList.contains("sidebar-floating")) return;

      const onGrip   = e.target.closest(".sb-float-resize");
      const onHeader = e.target.closest(".sidebar-header");
      if (!onGrip && !onHeader) return;
      // Клик по интерактивному элементу в шапке не должен таскать окно
      if (!onGrip && e.target.closest("button, input, a")) return;

      mode = onGrip ? "resize" : "drag";
      sx = e.clientX; sy = e.clientY;
      const r = sidebar.getBoundingClientRect();
      start = { left: r.left, top: r.top, width: r.width, height: r.height };
      document.body.classList.add(mode === "drag" ? "sb-dragging" : "sb-resizing");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!mode) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const g = mode === "drag"
        ? { left: start.left + dx, top: start.top + dy, width: start.width, height: start.height }
        : { left: start.left, top: start.top, width: start.width + dx, height: start.height + dy };
      _clamp(g);
      sidebar.style.left   = g.left + "px";
      sidebar.style.top    = g.top + "px";
      sidebar.style.width  = g.width + "px";
      sidebar.style.height = g.height + "px";
    });

    window.addEventListener("mouseup", () => {
      if (!mode) return;
      mode = null;
      document.body.classList.remove("sb-dragging", "sb-resizing");
      const r = sidebar.getBoundingClientRect();
      _saveGeom({ left: r.left, top: r.top, width: r.width, height: r.height });
    });

    // Окно приложения уменьшили — возвращаем панель в видимую область
    window.addEventListener("resize", () => {
      if (!root.classList.contains("sidebar-floating")) return;
      _applyFloatGeom(sidebar);
    });
  }

  /** Загрузить сохранённое положение (или дефолт «left»). */
  App.loadSidebarPosition = function () {
    let saved = "left";
    try { saved = localStorage.getItem(STORAGE_KEY) || "left"; } catch (_) {}
    _initFloatInteractions();
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
      { key: "left",  icon: "bi-layout-sidebar",
        label: App.t("sidebarLeft")  || "Слева",
        desc:  App.t("sidebarLeftDesc")  || "Обычная колонка слева, ширину можно тянуть" },
      { key: "right", icon: "bi-layout-sidebar-reverse",
        label: App.t("sidebarRight") || "Справа",
        desc:  App.t("sidebarRightDesc") || "То же самое, но колонка справа" },
      { key: "floating", icon: "bi-window-stack",
        label: App.t("sidebarFloating") || "Плавающее",
        desc:  App.t("sidebarFloatingDesc") || "Панель поверх контента — запросу достаётся вся ширина" },
    ];

    const menu = document.createElement("div");
    menu.id = "sidebar-pos-menu";
    menu.className = "sb-pos-menu";
    menu.innerHTML =
      `<div class="sb-pos-title">${App.t("sidebarPosition") || "Расположение панели"}</div>` +
      items.map((it) => `
      <button class="sb-pos-item ${it.key === current ? "active" : ""}" data-pos="${it.key}">
        <i class="bi ${it.icon}"></i>
        <span class="sb-pos-text">
          <span class="sb-pos-label">${it.label}</span>
          <span class="sb-pos-desc">${it.desc}</span>
        </span>
        ${it.key === current ? '<i class="bi bi-check-lg sb-pos-check"></i>' : ""}
      </button>`).join("") +
      `<div class="sb-pos-hint">
         <i class="bi bi-info-circle"></i>
         ${App.t("sidebarToggleHint") || "Скрыть панель целиком — кнопка слева от логотипа"}
       </div>`;

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
