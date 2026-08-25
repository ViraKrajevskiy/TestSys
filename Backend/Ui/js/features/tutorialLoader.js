/**
 * tutorialLoader.js — загрузчик дополнения «Интерактивное обучение».
 *
 * Само обучение (движок тура + шаги + стили) НЕ входит в сборку: оно лежит
 * отдельным файлом `js/addons/tutorial.js` в репозитории и скачивается по
 * кнопке. Скачивание идёт через Python-бэкенд (api.download_addon) — у него
 * нет ограничений CORS/CSP, и он кэширует файл, поэтому со второго раза
 * обучение открывается и без интернета.
 *
 * Здесь — только тонкий загрузчик: скачать → внедрить → запустить.
 */
window.App = window.App || {};

(function () {
  const ADDON = "tutorial.js";
  let _loading = false;

  App.startTutorial = async function () {
    // Уже загружено в этой сессии — просто запускаем заново, без скачивания.
    if (App.__tutorial && typeof App.__tutorial.start === "function") {
      _runTour();
      return;
    }
    if (_loading) return;
    _loading = true;

    try {
      const api = window.pywebview && window.pywebview.api;
      if (!api || !api.download_addon) {
        App.showAlert && App.showAlert(
          "Интерактивное обучение доступно только в desktop-режиме приложения.");
        return;
      }

      App.syncToast && App.syncToast("Загружаю интерактивное обучение из репозитория…");

      let res;
      try {
        res = JSON.parse(await api.download_addon(ADDON));
      } catch (e) {
        App.showAlert && App.showAlert("Ошибка загрузки обучения: " + e);
        return;
      }

      if (!res || !res.ok) {
        App.showAlert && App.showAlert(
          "Не удалось загрузить обучение: " + ((res && res.error) || "неизвестная ошибка") +
          "\n\nФайл берётся из репозитория TestSys на GitHub — проверьте интернет " +
          "и что дополнение выложено в репозиторий.");
        return;
      }

      _inject(res.content);

      if (!App.__tutorial || typeof App.__tutorial.start !== "function") {
        App.showAlert && App.showAlert(
          "Дополнение скачалось, но не запустилось — похоже, неверный формат файла.");
        return;
      }

      if (res.offline) {
        App.syncToast && App.syncToast("Нет сети — открываю сохранённую копию обучения");
      }
      _runTour();
    } finally {
      _loading = false;
    }
  };

  /**
   * Запуск тура. Сначала закрываем открытые модалки (в т.ч. Справку, из которой
   * тур мог быть вызван) — иначе окно висит поверх/позади подсветки. Это дубль
   * страховки на уровне сборки: не зависит от версии скачанного дополнения.
   */
  function _runTour() {
    const closed = _closeOpenModals();
    setTimeout(() => {
      if (App.__tutorial && typeof App.__tutorial.start === "function") App.__tutorial.start();
    }, closed ? 240 : 0);
  }

  /** Закрыть все видимые bootstrap-модалки и убрать подложки. Вернёт true, если что-то закрыли. */
  function _closeOpenModals() {
    let any = false;
    document.querySelectorAll(".modal.show").forEach(m => {
      any = true;
      try {
        const inst = window.bootstrap && bootstrap.Modal.getInstance(m);
        if (inst) inst.hide();
        else { m.classList.remove("show"); m.style.display = "none"; }
      } catch (_) {}
    });
    if (any) {
      setTimeout(() => document.querySelectorAll(".modal-backdrop").forEach(b => b.remove()), 260);
    }
    return any;
  }

  /** Выполнить скачанный код: добавляем <script> с исходником в документ. */
  function _inject(src) {
    // Убираем предыдущую инъекцию, если вдруг была битой
    const prev = document.querySelector('script[data-addon="tutorial"]');
    if (prev) prev.remove();
    const s = document.createElement("script");
    s.textContent = src;
    s.dataset.addon = "tutorial";
    document.body.appendChild(s);
  }

  App.initTutorial = function () {
    const btn = document.getElementById("tutorial-btn");
    if (btn) btn.addEventListener("click", () => App.startTutorial());
  };
})();
