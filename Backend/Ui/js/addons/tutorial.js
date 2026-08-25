/**
 * tutorial.js — ДОПОЛНЕНИЕ «Интерактивное обучение» (v2).
 *
 * НЕ подключается в index.html — лежит отдельно в репозитории и скачивается по
 * кнопке через tutorialLoader.js. Самодостаточен: несёт движок, стили, тексты.
 * Регистрирует window.App.__tutorial = { start, stop }.
 *
 * Что нового в v2:
 *  • Перед стартом закрываются открытые модалки (справка больше не висит сзади).
 *  • Настоящая интерактивность: на «шагах-действиях» пользователь ДОЛЖЕН сам
 *    кликнуть по подсвеченному элементу — кнопки «Далее» нет, пока не сделает,
 *    дальше не пускает. Клик мимо — подсветка мигает подсказкой.
 *  • Экран заблокирован оверлеем: жать можно только по нужному месту.
 *  • Двуязычно: ru / en (uz → en), язык берётся из App.getLang().
 *
 * Тексты правятся в массиве STEPS и коммитятся в репозиторий — пользователи
 * получают новую версию при следующем запуске, без пересборки приложения.
 */
(function () {
  window.App = window.App || {};

  // ── Язык ────────────────────────────────────────────────────────
  function _lang() {
    try { return (App.getLang && App.getLang()) || "ru"; } catch (_) { return "ru"; }
  }
  /** L({ru,en}) → строка на текущем языке (uz и прочие → en → ru). */
  function L(o) {
    if (o == null) return "";
    if (typeof o === "string") return o;
    const l = _lang();
    return o[l] || o.en || o.ru || "";
  }
  const UI = {
    next:  { ru: "Далее",     en: "Next" },
    back:  { ru: "Назад",     en: "Back" },
    skip:  { ru: "Пропустить", en: "Skip" },
    done:  { ru: "Готово",    en: "Done" },
    doHint:{ ru: "👉 Нажмите на подсвеченный элемент, чтобы продолжить",
             en: "👉 Click the highlighted element to continue" },
  };

  // ── Шаги. type: "info" (кнопка Далее) | "do" (нужен клик по target) ──
  const STEPS = [
    { type: "info", target: null,
      title: { ru: "Добро пожаловать в TestSys 👋", en: "Welcome to TestSys 👋" },
      text:  { ru: "Короткий интерактивный тур. На некоторых шагах нужно будет самому нажать на подсвеченный элемент — пока не нажмёте, дальше не пойдём. Выход в любой момент — Esc или «Пропустить».",
               en: "A short interactive tour. On some steps you'll need to click the highlighted element yourself — we won't move on until you do. Exit anytime with Esc or “Skip”." } },

    { type: "info", target: "#method-select",
      title: { ru: "Метод запроса", en: "HTTP method" },
      text:  { ru: "Здесь выбирается метод: GET, POST, PUT, PATCH, DELETE. Для POST/PUT/PATCH появляются вкладки Body и Files.",
               en: "Pick the method here: GET, POST, PUT, PATCH, DELETE. For POST/PUT/PATCH the Body and Files tabs appear." } },

    { type: "info", target: "#url-input",
      title: { ru: "Адрес запроса", en: "Request URL" },
      text:  { ru: "Сюда — URL. Можно вставлять переменные {{baseUrl}} и генераторы {{$uuid}}. Enter отправляет запрос.",
               en: "Type the URL here. You can use variables like {{baseUrl}} and generators like {{$uuid}}. Enter sends the request." } },

    { type: "info", target: "#send-btn",
      title: { ru: "Отправка", en: "Send" },
      text:  { ru: "Отправляет запрос. Горячая клавиша — Ctrl+Enter из любого поля.",
               en: "Sends the request. Shortcut — Ctrl+Enter from any field." } },

    { type: "do", target: '[data-sub="params"]',
      title: { ru: "Параметры запроса", en: "Query params" },
      text:  { ru: "Откройте вкладку Params. Здесь query-параметры в виде таблицы ключ-значение; чекбокс слева выключает строку не удаляя её.",
               en: "Open the Params tab. Query params as a key-value table; the checkbox on the left disables a row without deleting it." } },

    { type: "do", target: '[data-sub="headers"]',
      title: { ru: "Заголовки", en: "Headers" },
      text:  { ru: "Теперь откройте Headers. Так же таблицей задаются заголовки запроса. Есть режим массового ввода текстом.",
               en: "Now open Headers. Request headers set the same way. There's a bulk text-input mode too." } },

    { type: "do", target: '[data-sub="auth"]',
      title: { ru: "Авторизация", en: "Authorization" },
      text:  { ru: "Откройте вкладку Auth. Bearer, Basic, API Key, OAuth 2.0. Заданная на папке/коллекции авторизация наследуется всеми запросами внутри.",
               en: "Open the Auth tab. Bearer, Basic, API Key, OAuth 2.0. Auth set on a folder/collection is inherited by all requests inside." } },

    { type: "do", target: '[data-sub="options"]',
      title: { ru: "Настройки запроса", en: "Request settings" },
      text:  { ru: "Откройте вкладку Настройки — тут переключатели этого запроса.",
               en: "Open the Settings tab — per-request switches live here." } },

    { type: "info", target: '[data-sub="options"]',
      title: { ru: "Что внутри «Настройки»", en: "Inside “Settings”" },
      text:  { ru: "Игнорировать SSL-сертификат (для локалок с самоподписанным), следовать ли редиректам, свой таймаут и описание запроса для команды.",
               en: "Ignore the SSL certificate (for local self-signed servers), whether to follow redirects, a custom timeout, and a request description for your team." } },

    { type: "do", target: "#add-tab-btn",
      title: { ru: "Новая вкладка", en: "New tab" },
      text:  { ru: "Создайте новую вкладку — так работают с несколькими запросами сразу. (Ctrl+T тоже создаёт.)",
               en: "Create a new tab — that's how you work with several requests at once. (Ctrl+T also creates one.)" } },

    { type: "info", target: "#tabs-container",
      title: { ru: "Работа с вкладками", en: "Working with tabs" },
      text:  { ru: "Правый клик по вкладке: дублировать, переименовать, открыть в отдельном окне. Вкладки переживают перезапуск приложения.",
               en: "Right-click a tab: duplicate, rename, open in a separate window. Tabs survive app restarts." } },

    { type: "info", target: "#sidebar",
      title: { ru: "Коллекции", en: "Collections" },
      text:  { ru: "Слева — дерево коллекций, папок и запросов. Ctrl+S сохраняет текущую вкладку в коллекцию. Наведи на запрос — увидишь его описание.",
               en: "On the left — the tree of collections, folders and requests. Ctrl+S saves the current tab into a collection. Hover a request to see its description." } },

    { type: "info", target: ".response-panel",
      title: { ru: "Ответ", en: "Response" },
      text:  { ru: "Здесь появится ответ: подсветка JSON, клик по значению копирует его, разбивка времени (TTFB/загрузка/total), JSONPath-фильтр, декодер JWT и кнопка «Скачать».",
               en: "The response shows here: JSON highlighting, click a value to copy it, timing breakdown (TTFB/download/total), JSONPath filter, JWT decoder and a Download button." } },

    { type: "info", target: "#randomizer-btn",
      title: { ru: "Рандомайзер", en: "Randomizer" },
      text:  { ru: "Быстрая подстановка случайных значений в поля. Ctrl+R.",
               en: "Quickly insert random values into fields. Ctrl+R." } },

    { type: "info", target: "#data-generator-btn",
      title: { ru: "Генератор данных", en: "Data generator" },
      text:  { ru: "Сгенерировать тестовые данные по шаблону. Ctrl+G.",
               en: "Generate test data from a template. Ctrl+G." } },

    { type: "info", target: "#global-history-btn",
      title: { ru: "История запросов", en: "Request history" },
      text:  { ru: "Все запросы со всех вкладок: поиск, сортировка, открыть любой заново одним кликом.",
               en: "Every request from every tab: search, sort, reopen any of them in one click." } },

    { type: "info", target: "#nav-more-btn",
      title: { ru: "Ещё инструменты", en: "More tools" },
      text:  { ru: "Под этой кнопкой — Mock Server (локальные заглушки), Cookie Manager, Совместная работа, Терминал и это обучение.",
               en: "Under this button — Mock Server (local stubs), Cookie Manager, Collaboration, Terminal, and this tutorial." } },

    { type: "info", target: "#help-btn",
      title: { ru: "Справка", en: "Help" },
      text:  { ru: "Кнопка «?» (или F1) — шпаргалка по всем функциям и горячим клавишам с поиском.",
               en: "The “?” button (or F1) — a searchable cheat-sheet of all features and shortcuts." } },

    { type: "info", target: null,
      title: { ru: "Готово! 🎉", en: "All done! 🎉" },
      text:  { ru: "Это основное. Дальше просто пробуй: отправь запрос, сохрани в коллекцию, задай переменную. Тур всегда можно пройти заново из меню «Ещё» или из Справки.",
               en: "That's the essentials. Now just try it: send a request, save it to a collection, set a variable. You can retake the tour anytime from the “More” menu or Help." } },
  ];

  // ── Стили (несём с собой) ───────────────────────────────────────
  function _ensureCss() {
    if (document.getElementById("tut-style")) return;
    const st = document.createElement("style");
    st.id = "tut-style";
    st.textContent = `
      .tut-block { position: fixed; inset: 0; z-index: 99998; background: transparent; cursor: default; }
      .tut-spot {
        position: fixed; z-index: 100000; border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(8,10,15,.72);
        transition: all .22s cubic-bezier(.4,0,.2,1); pointer-events: none;
        outline: 2px solid var(--accent, #6366f1); outline-offset: 2px;
      }
      .tut-spot.tut-do { outline-color: #22c55e; }
      .tut-spot.tut-pulse { animation: tutPulse .45s ease; }
      @keyframes tutPulse {
        0%,100% { outline-color: #22c55e; }
        50% { outline-width: 5px; outline-color: #eab308; }
      }
      .tut-tip {
        position: fixed; z-index: 100001; max-width: 340px; width: max-content;
        background: var(--bg-panel, #1c1e26); color: var(--text-main, #e8e8ea);
        border: 1px solid var(--border-color, #33353f); border-radius: 10px;
        padding: 14px 16px; box-shadow: 0 12px 40px rgba(0,0,0,.5);
        font-size: .86rem; line-height: 1.5;
      }
      .tut-tip-title { font-weight: 600; font-size: .95rem; margin-bottom: 6px; }
      .tut-tip-text { opacity: .92; }
      .tut-do-hint {
        margin-top: 10px; font-size: .8rem; color: #22c55e;
        display: flex; align-items: center; gap: 6px;
      }
      .tut-tip-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
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
      .tut-btn-primary:hover { filter: brightness(1.08); }
      .tut-skip {
        border: none; background: none; color: var(--text-dim, #8b8d98);
        font-size: .76rem; cursor: pointer; padding: 4px 6px;
      }
      .tut-skip:hover { color: var(--text-main, #e8e8ea); text-decoration: underline; }
      .tut-tip-arrow {
        position: absolute; width: 10px; height: 10px; background: var(--bg-panel, #1c1e26);
        border-left: 1px solid var(--border-color, #33353f);
        border-top: 1px solid var(--border-color, #33353f); transform: rotate(45deg);
      }
    `;
    document.head.appendChild(st);
  }

  // ── Состояние ────────────────────────────────────────────────────
  let _steps = [], _idx = 0, _spot = null, _tip = null, _block = null;
  let _targetEl = null, _reposition = null;

  function start() {
    _ensureCss();
    if (_spot) _end();

    // Закрываем открытые модалки (в т.ч. Справку), чтобы они не висели сзади.
    let hadModal = false;
    document.querySelectorAll(".modal.show").forEach(m => {
      hadModal = true;
      try {
        const inst = window.bootstrap && bootstrap.Modal.getInstance(m);
        if (inst) inst.hide(); else m.classList.remove("show"), (m.style.display = "none");
      } catch (_) {}
    });
    // .modal-backdrop тоже уберём на всякий случай
    setTimeout(() => document.querySelectorAll(".modal-backdrop").forEach(b => b.remove()),
      hadModal ? 260 : 0);

    // Ждём закрытия модалки (анимация ~150мс), потом строим тур.
    setTimeout(() => _begin(), hadModal ? 240 : 0);
  }

  function _begin() {
    _idx = 0;
    _steps = STEPS.filter(s => !s.target || document.querySelector(s.target));
    if (!_steps.length) return;

    _block = document.createElement("div"); _block.className = "tut-block";
    _spot  = document.createElement("div"); _spot.className  = "tut-spot";
    _tip   = document.createElement("div"); _tip.className   = "tut-tip";
    document.body.appendChild(_block);
    document.body.appendChild(_spot);
    document.body.appendChild(_tip);

    _block.addEventListener("click", _onBlockClick, true);
    _reposition = () => _position();
    window.addEventListener("resize", _reposition);
    window.addEventListener("scroll", _reposition, true);
    document.addEventListener("keydown", _onKey, true);

    _render();
  }

  function _onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); _end(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); _prev(); }
    else if ((e.key === "ArrowRight" || e.key === "Enter") && _steps[_idx] && _steps[_idx].type === "info") {
      e.preventDefault(); _next();
    }
  }

  /** Клик по блокирующему оверлею: на «do»-шаге пропускаем только клик по цели. */
  function _onBlockClick(e) {
    const step = _steps[_idx];
    e.preventDefault(); e.stopPropagation();
    if (!step || step.type !== "do" || !_targetEl) return;   // info — просто гасим клик
    const r = _targetEl.getBoundingClientRect();
    const hit = e.clientX >= r.left && e.clientX <= r.right &&
                e.clientY >= r.top  && e.clientY <= r.bottom;
    if (hit) {
      try { _targetEl.click(); } catch (_) {}   // выполняем само действие (переключить вкладку и т.п.)
      setTimeout(_next, 160);
    } else {
      _pulse();   // мимо — подсказать, куда жать
    }
  }

  function _pulse() {
    if (!_spot) return;
    _spot.classList.remove("tut-pulse");
    void _spot.offsetWidth;         // рестарт анимации
    _spot.classList.add("tut-pulse");
  }

  function _render() {
    const step = _steps[_idx];
    if (!step) { _end(); return; }

    _targetEl = step.target ? document.querySelector(step.target) : null;
    if (_targetEl) {
      try { _targetEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); }
      catch (_) { try { _targetEl.scrollIntoView(); } catch (__) {} }
    }

    const isLast = _idx === _steps.length - 1;
    const isDo = step.type === "do";

    let foot = '<span class="tut-count">' + (_idx + 1) + ' / ' + _steps.length + '</span>' +
               '<button class="tut-skip" data-act="skip">' + L(UI.skip) + '</button>';
    if (_idx > 0) foot += '<button class="tut-btn" data-act="prev">' + L(UI.back) + '</button>';
    if (!isDo) foot += '<button class="tut-btn tut-btn-primary" data-act="next">' +
                       (isLast ? L(UI.done) : L(UI.next)) + '</button>';

    _tip.innerHTML =
      '<div class="tut-tip-arrow"></div>' +
      '<div class="tut-tip-title">' + _esc(L(step.title)) + '</div>' +
      '<div class="tut-tip-text">' + _esc(L(step.text)) + '</div>' +
      (isDo ? '<div class="tut-do-hint">' + _esc(L(UI.doHint)) + '</div>' : '') +
      '<div class="tut-tip-foot">' + foot + '</div>';

    _tip.querySelector('[data-act="skip"]').addEventListener("click", _end);
    const nextBtn = _tip.querySelector('[data-act="next"]');
    if (nextBtn) nextBtn.addEventListener("click", _next);
    const prevBtn = _tip.querySelector('[data-act="prev"]');
    if (prevBtn) prevBtn.addEventListener("click", _prev);

    _spot.classList.toggle("tut-do", isDo);
    setTimeout(() => _position(), 60);
  }

  function _position() {
    if (!_tip) return;
    const pad = 6;
    const arrow = _tip.querySelector(".tut-tip-arrow");

    if (!_targetEl) {
      _spot.style.opacity = "0";
      _spot.style.width = _spot.style.height = "0px";
      _spot.style.left = (window.innerWidth / 2) + "px";
      _spot.style.top  = (window.innerHeight / 2) + "px";
      const tw = _tip.offsetWidth, th = _tip.offsetHeight;
      _tip.style.left = Math.round((window.innerWidth - tw) / 2) + "px";
      _tip.style.top  = Math.round((window.innerHeight - th) / 2) + "px";
      if (arrow) arrow.style.display = "none";
      return;
    }

    const r = _targetEl.getBoundingClientRect();
    _spot.style.opacity = "1";
    _spot.style.left   = (r.left - pad) + "px";
    _spot.style.top    = (r.top  - pad) + "px";
    _spot.style.width  = (r.width  + pad * 2) + "px";
    _spot.style.height = (r.height + pad * 2) + "px";

    const tw = _tip.offsetWidth, th = _tip.offsetHeight, gap = 14;
    if (arrow) arrow.style.display = "";

    let top, left, place;
    if (r.bottom + gap + th < window.innerHeight) { top = r.bottom + gap; place = "bottom"; }
    else if (r.top - gap - th > 0)               { top = r.top - gap - th; place = "top"; }
    else { top = Math.max(8, Math.min(r.top, window.innerHeight - th - 8)); place = "side"; }

    if (place === "side") {
      left = (r.right + gap + tw < window.innerWidth) ? r.right + gap : r.left - gap - tw;
    } else {
      left = r.left + r.width / 2 - tw / 2;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    top  = Math.max(8, Math.min(top,  window.innerHeight - th - 8));
    _tip.style.left = Math.round(left) + "px";
    _tip.style.top  = Math.round(top) + "px";

    if (arrow) {
      if (place === "bottom") {
        arrow.style.top = "-6px"; arrow.style.transform = "rotate(45deg)";
        arrow.style.left = Math.round(Math.min(Math.max(r.left + r.width / 2 - left, 14), tw - 20)) + "px";
      } else if (place === "top") {
        arrow.style.top = (th - 4) + "px"; arrow.style.transform = "rotate(225deg)";
        arrow.style.left = Math.round(Math.min(Math.max(r.left + r.width / 2 - left, 14), tw - 20)) + "px";
      } else { arrow.style.display = "none"; }
    }
  }

  function _next() { if (_idx >= _steps.length - 1) { _end(); return; } _idx++; _render(); }
  function _prev() { if (_idx <= 0) return; _idx--; _render(); }

  function _end() {
    document.removeEventListener("keydown", _onKey, true);
    if (_reposition) {
      window.removeEventListener("resize", _reposition);
      window.removeEventListener("scroll", _reposition, true);
      _reposition = null;
    }
    if (_block) { _block.removeEventListener("click", _onBlockClick, true); _block.remove(); _block = null; }
    if (_spot) { _spot.remove(); _spot = null; }
    if (_tip)  { _tip.remove();  _tip = null; }
    _targetEl = null;
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.App.__tutorial = { start: start, stop: _end };
})();
