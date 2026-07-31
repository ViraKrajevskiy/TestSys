window.App = window.App || {};

App.renderAll = function () {
  App.renderTabBar();
  App.renderTabContent();
};

// Тип окна: main | randomizer | detached.
// Хеш в URL не годится — pywebview отдаёт страницу через свой http-сервер
// и до JS он не доезжает. Спрашиваем у Python: каждый экземпляр Api знает,
// какому окну принадлежит.
App.WINDOW_KIND = "main";
App.isMainWindow = function () { return App.WINDOW_KIND === "main"; };

/** Узнать тип окна у Python и применить нужный режим */
App.detectWindowKind = async function () {
  const api = await new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.pywebview && window.pywebview.api) { clearInterval(iv); resolve(window.pywebview.api); }
      else if (Date.now() - start > 5000) { clearInterval(iv); resolve(null); }
    }, 80);
  });
  if (!api || !api.get_window_kind) return "main";

  try {
    const kind = await api.get_window_kind();
    App.WINDOW_KIND = kind || "main";
  } catch (_) { App.WINDOW_KIND = "main"; }

  if (App.WINDOW_KIND === "randomizer" && window.loadRandomizerWindow) {
    window.loadRandomizerWindow();
  } else if (App.WINDOW_KIND === "console" && window.loadConsoleWindow) {
    window.loadConsoleWindow();
  }
  return App.WINDOW_KIND;
};

App.init = function () {
  App.installErrorHandlers();   // перехват ошибок — как можно раньше
  App.initLogViewer();
  App.renderCollections();
  App.initCrud();
  App.initContextMenu();
  App.initMetrics();
  App.initDynamicVarsUI();
  App.initSwaggerUI();
  App.initScriptConsole();
  App.initLoadTest();
  App.initUpdater();
  App.initSyncUI();
  App.initSettingsModal();
  App.initThemeSettings();
  App.initTabBarDrag();
  App.initResizable();          // ресайз панелей

  // Переводы применяем ПОСЛЕ вставки всех модалок — иначе их data-i18n
  // не обработается (модалки добавляются в DOM в init*-функциях выше).
  App.applyTranslations();

  App.loadSettings();           // загрузить настройки (лимиты, URL, логи)
  App.loadCollections().then(() => App.renderCollections()); // загрузить коллекции
  App.loadMetrics();            // история метрик переживает перезапуск
  App.loadAndApplySavedTheme(); // загрузить тему
  App.loadSidebarPosition && App.loadSidebarPosition(); // left / right / floating

  document.getElementById("add-tab-btn").addEventListener("click", () => App.addTab());
  document.getElementById("close-all-btn").addEventListener("click", () => App.closeAllTabs());
  document.getElementById("sidebar-toggle-btn").addEventListener("click", () => {
    document.getElementById("app-root").classList.toggle("sidebar-collapsed");
  });

  const returnBtn = document.getElementById("return-to-main-btn");
  if (returnBtn) {
    returnBtn.addEventListener("click", async () => {
      if (window.pywebview) {
        await window.pywebview.api.return_to_parent();
      }
    });
  }

  // Все горячие клавиши теперь в едином реестре — см. core/hotkeys.js.
  // Он же обрабатывает Ctrl+T / Ctrl+W / Ctrl+Tab / Ctrl+` и всё остальное.
  App.initHotkeys && App.initHotkeys();

  if (App.state.tabs.length === 0) {
    App.addTab();
  }

  // Спрашиваем у Python тип окна. Пока ответа нет, окно ведёт себя как
  // главное; узнав, что это рандомайзер — перестраивается.
  App.detectWindowKind().then((kind) => {
    if (kind === "main") {
      App.initSync();   // синхронизацией/хостом управляет только главное окно
    }
  });
};

document.addEventListener("DOMContentLoaded", App.init);

// ============================================================
// МОДАЛКИ: ОДНА ЗА РАЗ
//
// Стекирование двух модалок оказалось ненадёжным: Bootstrap создаёт
// отдельный backdrop на каждую, и при закрытии верхней нижний мог
// остаться висеть невидимым слоем — экран переставал реагировать на клики.
// Проще и надёжнее: открывая новую модалку, закрываем предыдущую.
// ============================================================
document.addEventListener("show.bs.modal", (e) => {
  document.querySelectorAll(".modal.show").forEach((m) => {
    if (m !== e.target) {
      const inst = bootstrap.Modal.getInstance(m);
      if (inst) inst.hide();
    }
  });
});

/**
 * Снять зависшие backdrop-ы и вернуть странице интерактивность.
 * Вызывается при любом закрытии и как аварийная кнопка (Esc).
 */
App.cleanupModals = function () {
  const open = document.querySelectorAll(".modal.show");
  if (open.length > 0) return;   // что-то ещё открыто — не трогаем

  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  // Иногда остаётся inline-стиль, блокирующий клики
  document.body.style.removeProperty("pointer-events");
};

document.addEventListener("hidden.bs.modal", (e) => {
  e.target.style.zIndex = "";
  setTimeout(App.cleanupModals, 60);
  setTimeout(App.cleanupModals, 350);   // после анимации закрытия
});

// Аварийный выход: Esc всегда возвращает управление
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setTimeout(() => {
    if (document.querySelectorAll(".modal.show").length === 0) App.cleanupModals();
  }, 100);
});
