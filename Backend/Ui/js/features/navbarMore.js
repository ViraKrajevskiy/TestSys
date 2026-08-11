/**
 * navbarMore.js — выпадающее меню «⋯» для редких кнопок навбара.
 *
 * Кнопки в #nav-more-hidden имеют data-атрибуты и обработчики событий
 * прямо в HTML (onclick=...). Меню перехватывает клик, показывает
 * список, и пробрасывает клик на оригинальную кнопку.
 */
(function () {
  function _init() {
    const btn = document.getElementById("nav-more-btn");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("nav-more-menu");
      if (existing) { existing.remove(); return; }
      _openMenu(btn);
    });
  }

  function _openMenu(anchor) {
    const hidden = document.getElementById("nav-more-hidden");
    if (!hidden) return;

    const menu = document.createElement("div");
    menu.id = "nav-more-menu";
    menu.className = "nav-more-menu";

    // Клонируем кнопки из скрытого контейнера
    Array.from(hidden.children).forEach(orig => {
      const item = document.createElement("button");
      item.className = "nav-more-item";
      item.innerHTML = orig.innerHTML;
      item.title = orig.title || "";

      item.addEventListener("click", () => {
        menu.remove();
        // Пробрасываем клик на оригинальную скрытую кнопку
        orig.click();
      });

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Позиционируем под кнопкой
    const rect = anchor.getBoundingClientRect();
    const mw = 200;
    menu.style.width = mw + "px";
    const left = Math.max(4, Math.min(window.innerWidth - mw - 4, rect.right - mw));
    menu.style.top  = (rect.bottom + 4) + "px";
    menu.style.left = left + "px";

    // Закрытие по клику снаружи
    setTimeout(() => {
      const off = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener("mousedown", off, true);
        }
      };
      document.addEventListener("mousedown", off, true);
    }, 0);
  }

  // Запускаем после загрузки DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }
})();
