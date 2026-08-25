/**
 * tutorial.js — ДОПОЛНЕНИЕ «Интерактивное обучение».
 *
 * Этот файл НЕ подключается в index.html. Он лежит в репозитории отдельно и
 * скачивается по кнопке через tutorialLoader.js. Полностью самодостаточен:
 * несёт свой движок тура, стили и список шагов. Регистрирует
 * window.App.__tutorial = { start }.
 *
 * Движок — «прожектор»: затемняет экран, вырезает окно вокруг нужного
 * элемента, рядом показывает объяснение. Пользователь идёт по шагам кнопкой
 * «Далее» ИЛИ кликнув по самому подсвеченному элементу.
 *
 * Чтобы добавить/поменять объяснение — правьте массив STEPS ниже и коммитьте
 * в репозиторий: пользователи получат новую версию при следующем запуске,
 * без пересборки приложения.
 */
(function () {
  window.App = window.App || {};

  // ──────────────────────────────────────────────────────────────
  // ШАГИ. target — CSS-селектор реального элемента (или null = по центру).
  // ──────────────────────────────────────────────────────────────
  const STEPS = [
    { target: null, title: "Добро пожаловать в TestSys 👋",
      text: "Это короткий тур по основным возможностям. Идите кнопкой «Далее» или кликайте по подсвеченному элементу. Выйти — Esc или «Пропустить». Поехали!" },

    { target: "#method-select", title: "Метод запроса",
      text: "Выбор HTTP-метода: GET, POST, PUT, PATCH, DELETE. Для POST/PUT/PATCH появятся вкладки Body и Files." },

    { target: "#url-input", title: "Адрес запроса",
      text: "Сюда — URL. Можно подставлять переменные вида {{baseUrl}} и генераторы {{$uuid}}. Enter тоже отправляет запрос." },

    { target: '#url-dynvar-btn', title: "Динамические переменные",
      text: "Справочник {{$…}} — случайные email, uuid, числа, даты. Подставляются в момент отправки." },

    { target: '#codegen-btn', title: "Генерация кода",
      text: "Превратить текущий запрос в готовый код: cURL, JS fetch/axios, Python requests. Удобно отдать коллеге." },

    { target: "#send-btn", title: "Отправка",
      text: "Отправляет запрос. Горячая клавиша — Ctrl+Enter из любого поля." },

    { target: '[data-sub="params"]', title: "Параметры и заголовки",
      text: "Params и Headers — таблицы «ключ-значение». Чекбокс слева выключает строку, не удаляя её. Есть режим массового ввода." },

    { target: '[data-sub="auth"]', title: "Авторизация",
      text: "Bearer, Basic, API Key, OAuth 2.0. Заданная на папке или коллекции авторизация наследуется всеми запросами внутри." },

    { target: '[data-sub="options"]', title: "Настройки запроса",
      text: "Игнорировать SSL-сертификат, следовать ли редиректам, свой таймаут и описание запроса для команды." },

    { target: ".response-panel", title: "Ответ",
      text: "Здесь появится ответ: подсветка JSON, клик по значению копирует его, разбивка времени (TTFB/загрузка/total), JSONPath-фильтр и декодер JWT." },

    { target: "#response-download-btn", title: "Скачать ответ",
      text: "Сохранить тело ответа файлом: картинку/PDF — как есть, JSON/текст — с нужным расширением." },

    { target: "#sidebar", title: "Коллекции",
      text: "Слева — дерево коллекций, папок и запросов. Ctrl+S сохраняет текущую вкладку в коллекцию. Наведите на запрос — увидите его описание." },

    { target: "#add-tab-btn", title: "Вкладки",
      text: "Несколько запросов одновременно. Ctrl+T — новая вкладка. Правый клик по вкладке: дублировать, переименовать, открыть в отдельном окне." },

    { target: "#randomizer-btn", title: "Рандомайзер",
      text: "Быстрая подстановка случайных значений в поля. Ctrl+R." },

    { target: "#data-generator-btn", title: "Генератор данных",
      text: "Сгенерировать тестовые данные по шаблону. Ctrl+G." },

    { target: "#collection-runner-btn", title: "Collection Runner",
      text: "Прогнать всю коллекцию запросов подряд вместе с проверками из вкладки Tests." },

    { target: "#global-history-btn", title: "История запросов",
      text: "Все запросы со всех вкладок: поиск, сортировка, открыть любой заново одним кликом." },

    { target: "#nav-more-btn", title: "Ещё инструменты",
      text: "Под этой кнопкой — Mock Server (локальные заглушки), Cookie Manager, Совместная работа, Терминал и настройки темы." },

    { target: "#help-btn", title: "Справка",
      text: "Кнопка «?» (или F1) — шпаргалка по всем функциям и горячим клавишам с поиском. Загляните, если что-то забудется." },

    { target: null, title: "Готово! 🎉",
      text: "Это основное. Дальше — просто пробуйте: отправьте запрос, сохраните в коллекцию, задайте переменную. Тур всегда можно пройти заново из меню «Ещё» или из Справки." },
  ];

  // ──────────────────────────────────────────────────────────────
  // Стили движка (несёт с собой, чтобы дополнение было автономным)
  // ──────────────────────────────────────────────────────────────
  function _ensureCss() {
    if (document.getElementById("tut-style")) return;
    const st = document.createElement("style");
    st.id = "tut-style";
    st.textContent = `
      .tut-spot {
        position: fixed; z-index: 100000; border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(8,10,15,.72);
        transition: all .22s cubic-bezier(.4,0,.2,1);
        pointer-events: none;
        outline: 2px solid var(--accent, #6366f1);
        outline-offset: 2px;
      }
      .tut-tip {
        position: fixed; z-index: 100001; max-width: 340px; width: max-content;
        background: var(--bg-panel, #1c1e26); color: var(--text-main, #e8e8ea);
        border: 1px solid var(--border-color, #33353f);
        border-radius: 10px; padding: 14px 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,.5);
        font-size: .86rem; line-height: 1.5;
      }
      .tut-tip-title { font-weight: 600; font-size: .95rem; margin-bottom: 6px; }
      .tut-tip-text  { color: var(--text-main, #e8e8ea); opacity: .92; }
      .tut-tip-foot {
        display: flex; align-items: center; gap: 8px; margin-top: 14px;
      }
      .tut-count { font-size: .76rem; color: var(--text-dim, #8b8d98); margin-right: auto; }
      .tut-btn {
        border: 1px solid var(--border-color, #33353f); background: transparent;
        color: var(--text-main, #e8e8ea); border-radius: 6px;
        padding: 4px 12px; font-size: .8rem; cursor: pointer;
      }
      .tut-btn:hover { background: var(--bg-input, #2a2c36); }
      .tut-btn-primary {
        background: var(--accent, #6366f1); border-color: var(--accent, #6366f1);
        color: var(--accent-text, #fff);
      }
      .tut-btn-primary:hover { filter: brightness(1.08); background: var(--accent, #6366f1); }
      .tut-skip {
        border: none; background: none; color: var(--text-dim, #8b8d98);
        font-size: .76rem; cursor: pointer; padding: 4px 6px;
      }
      .tut-skip:hover { color: var(--text-main, #e8e8ea); text-decoration: underline; }
      .tut-tip-arrow {
        position: absolute; width: 10px; height: 10px;
        background: var(--bg-panel, #1c1e26);
        border-left: 1px solid var(--border-color, #33353f);
        border-top: 1px solid var(--border-color, #33353f);
        transform: rotate(45deg);
      }
    `;
    document.head.appendChild(st);
  }

  // ──────────────────────────────────────────────────────────────
  // Состояние тура
  // ──────────────────────────────────────────────────────────────
  let _steps = [], _idx = 0, _spot = null, _tip = null;
  let _targetEl = null, _clickHandler = null, _reposition = null;

  function start() {
    _ensureCss();
    if (_spot) _end();               // повторный запуск — сначала закрываем прошлый
    _idx = 0;
    // Оставляем только шаги, чей элемент существует (или без цели).
    _steps = STEPS.filter(s => !s.target || document.querySelector(s.target));
    if (!_steps.length) return;

    _spot = document.createElement("div"); _spot.className = "tut-spot";
    _tip  = document.createElement("div"); _tip.className  = "tut-tip";
    document.body.appendChild(_spot);
    document.body.appendChild(_tip);

    _reposition = () => _position();
    window.addEventListener("resize", _reposition);
    window.addEventListener("scroll", _reposition, true);
    document.addEventListener("keydown", _onKey, true);

    _render();
  }

  function _onKey(e) {
    if (e.key === "Escape")      { e.preventDefault(); _end(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); _next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); _prev(); }
  }

  function _render() {
    const step = _steps[_idx];
    if (!step) { _end(); return; }

    // Снимаем прошлый клик-хэндлер с прошлой цели
    _detachTargetClick();

    _targetEl = step.target ? document.querySelector(step.target) : null;

    // Прокручиваем цель в зону видимости, затем позиционируем
    if (_targetEl) {
      try { _targetEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); }
      catch (_) { try { _targetEl.scrollIntoView(); } catch (__) {} }
    }

    const isLast = _idx === _steps.length - 1;
    _tip.innerHTML =
      '<div class="tut-tip-arrow"></div>' +
      '<div class="tut-tip-title">' + _esc(step.title) + '</div>' +
      '<div class="tut-tip-text">' + _esc(step.text) + '</div>' +
      '<div class="tut-tip-foot">' +
        '<span class="tut-count">' + (_idx + 1) + ' / ' + _steps.length + '</span>' +
        '<button class="tut-skip" data-act="skip">Пропустить</button>' +
        (_idx > 0 ? '<button class="tut-btn" data-act="prev">Назад</button>' : '') +
        '<button class="tut-btn tut-btn-primary" data-act="next">' +
          (isLast ? 'Готово' : 'Далее') + '</button>' +
      '</div>';

    _tip.querySelector('[data-act="skip"]').addEventListener("click", _end);
    _tip.querySelector('[data-act="next"]').addEventListener("click", _next);
    const prevBtn = _tip.querySelector('[data-act="prev"]');
    if (prevBtn) prevBtn.addEventListener("click", _prev);

    // Клик по самому подсвеченному элементу тоже двигает тур вперёд —
    // «пользователь сам нажимает функции».
    if (_targetEl) {
      _clickHandler = () => { setTimeout(_next, 120); };
      _targetEl.addEventListener("click", _clickHandler, { once: true });
    }

    // Позиционируем после того, как отработает scrollIntoView
    setTimeout(() => _position(), 60);
  }

  function _position() {
    if (!_tip) return;
    const pad = 6;

    if (!_targetEl) {
      // Шаг без цели — прячем прожектор, центрируем подсказку.
      _spot.style.opacity = "0";
      _spot.style.width = _spot.style.height = "0px";
      _spot.style.left = (window.innerWidth / 2) + "px";
      _spot.style.top  = (window.innerHeight / 2) + "px";
      const tw = _tip.offsetWidth, th = _tip.offsetHeight;
      _tip.style.left = Math.round((window.innerWidth - tw) / 2) + "px";
      _tip.style.top  = Math.round((window.innerHeight - th) / 2) + "px";
      const arrow = _tip.querySelector(".tut-tip-arrow");
      if (arrow) arrow.style.display = "none";
      return;
    }

    const r = _targetEl.getBoundingClientRect();
    _spot.style.opacity = "1";
    _spot.style.left   = (r.left - pad) + "px";
    _spot.style.top    = (r.top  - pad) + "px";
    _spot.style.width  = (r.width  + pad * 2) + "px";
    _spot.style.height = (r.height + pad * 2) + "px";

    const tw = _tip.offsetWidth, th = _tip.offsetHeight;
    const gap = 14;
    const arrow = _tip.querySelector(".tut-tip-arrow");
    if (arrow) arrow.style.display = "";

    // Пытаемся снизу; если не влезает — сверху; иначе сбоку.
    let top, left, place = "bottom";
    if (r.bottom + gap + th < window.innerHeight) {
      top = r.bottom + gap; place = "bottom";
    } else if (r.top - gap - th > 0) {
      top = r.top - gap - th; place = "top";
    } else {
      top = Math.max(8, Math.min(r.top, window.innerHeight - th - 8)); place = "side";
    }

    if (place === "side") {
      left = (r.right + gap + tw < window.innerWidth) ? r.right + gap : r.left - gap - tw;
    } else {
      // Центрируем по цели, но держим в пределах экрана
      left = r.left + r.width / 2 - tw / 2;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    top  = Math.max(8, Math.min(top,  window.innerHeight - th - 8));

    _tip.style.left = Math.round(left) + "px";
    _tip.style.top  = Math.round(top) + "px";

    // Позиция стрелки
    if (arrow) {
      if (place === "bottom") {
        arrow.style.top = "-6px";
        arrow.style.left = Math.round(Math.min(Math.max(r.left + r.width / 2 - left, 14), tw - 20)) + "px";
        arrow.style.transform = "rotate(45deg)";
      } else if (place === "top") {
        arrow.style.top = (th - 4) + "px";
        arrow.style.left = Math.round(Math.min(Math.max(r.left + r.width / 2 - left, 14), tw - 20)) + "px";
        arrow.style.transform = "rotate(225deg)";
      } else {
        arrow.style.display = "none";
      }
    }
  }

  function _next() { if (_idx >= _steps.length - 1) { _end(); return; } _idx++; _render(); }
  function _prev() { if (_idx <= 0) return; _idx--; _render(); }

  function _detachTargetClick() {
    if (_targetEl && _clickHandler) {
      try { _targetEl.removeEventListener("click", _clickHandler); } catch (_) {}
    }
    _clickHandler = null;
  }

  function _end() {
    _detachTargetClick();
    document.removeEventListener("keydown", _onKey, true);
    if (_reposition) {
      window.removeEventListener("resize", _reposition);
      window.removeEventListener("scroll", _reposition, true);
      _reposition = null;
    }
    if (_spot) { _spot.remove(); _spot = null; }
    if (_tip)  { _tip.remove();  _tip = null; }
    _targetEl = null;
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Регистрируемся — loader вызовет App.__tutorial.start()
  window.App.__tutorial = { start: start, stop: _end };
})();
