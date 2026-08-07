/**
 * Randomizer — единый экран
 *
 * Раньше было три несвязанные страницы (Type 1 / Word Lists / Template)
 * с разной моделью данных и разным смыслом кнопок. Теперь один экран:
 * список полей шаблона, у каждого поля свой генератор. Бывшие Type 1 и
 * Type 2 стали просто пунктами в выпадашке генераторов.
 *
 * Type 1 (по типу символов) считается локально — бэкенд для него не нужен.
 * Словари подтягиваются с сервера и мягко деградируют, если его нет.
 */

const UnifiedRandomizer = (() => {
  // Адрес из настроек, а не зашитый localhost
  const apiBase = () =>
    (window.App && App.getSetting && App.getSetting("apiBaseUrl")) || "http://127.0.0.1:8000";

  let isVisible = false;
  let isLocked = false;
  let isCollapsed = false;
  let _savedSize = null;

  let templateObj = {};
  let fieldConfigs = [];      // {path, key, originalValue, checked, genType, opts}
  let lastGenerated = null;
  let wordLists = [];
  let _openOptsIdx = -1;      // у какого поля раскрыты настройки
  let schemaFields = null;    // {path: meta} из Swagger, если запрос импортирован

  // ── Пользовательские шаблоны ──────────────────────────────────
  // Два слоя: localStorage — мгновенное чтение при старте;
  // Python (rand_templates.json) — авторитетное хранилище, переживает
  // перезапуск приложения (pywebview не всегда персистит localStorage).
  const _CTL_KEY = "ur.customTemplates";
  let _customTemplates = {};               // { id: { label, data } }
  let _tplLoadedFromDisk = false;

  function _loadCustomTpl() {
    try {
      const raw = localStorage.getItem(_CTL_KEY);
      _customTemplates = raw ? JSON.parse(raw) : {};
    } catch (_) { _customTemplates = {}; }
  }

  /** Догружаем с диска через Python — источник истины. */
  async function _loadCustomTplFromDisk() {
    if (_tplLoadedFromDisk) return;
    try {
      const api = await _waitForApi(3000);
      if (!api || !api.load_rand_templates) return;
      const raw = await api.load_rand_templates();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          _customTemplates = parsed;
          try { localStorage.setItem(_CTL_KEY, JSON.stringify(parsed)); } catch (_) {}
          _renderCustomTpls();
        }
      }
      _tplLoadedFromDisk = true;
    } catch (e) { console.warn("[Randomizer] load templates:", e); }
  }

  function _waitForApi(timeout) {
    return new Promise(resolve => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.pywebview && window.pywebview.api) { clearInterval(iv); resolve(window.pywebview.api); }
        else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
      }, 100);
    });
  }

  function _saveCustomTpl() {
    // Синхронно в localStorage — чтобы UI не ждал
    try { localStorage.setItem(_CTL_KEY, JSON.stringify(_customTemplates)); } catch (_) {}
    // И на диск через Python — переживёт перезапуск
    try {
      const api = window.pywebview && window.pywebview.api;
      if (api && api.save_rand_templates) {
        api.save_rand_templates(JSON.stringify(_customTemplates))
          .catch(e => console.warn("[Randomizer] save templates:", e));
      }
    } catch (_) {}
  }
  function _renderCustomTpls() {
    const list = document.querySelector(".ur-root #ur-custom-tpl-list");
    if (!list) return;
    const keys = Object.keys(_customTemplates);
    if (!keys.length) {
      list.innerHTML = `<span style="font-size:11px;color:var(--text-dim);opacity:.6;">${T("noCustomTemplates","Нет сохранённых шаблонов")}</span>`;
      return;
    }
    list.innerHTML = keys.map(id => `
      <span class="ur-custom-tpl-chip" data-id="${id}" style="display:inline-flex;align-items:center;gap:2px;">
        <button class="ur-example-btn randomizer-btn ur-ctpl-load" data-id="${id}" style="font-size:11px;padding:3px 6px;border-radius:4px 0 0 4px;">
          💾 ${App.escapeHtml(_customTemplates[id].label)}
        </button>
        <button class="randomizer-btn ur-ctpl-del" data-id="${id}" style="font-size:11px;padding:3px 5px;border-radius:0 4px 4px 0;border-left:1px solid var(--border-color);opacity:.7;" title="Удалить шаблон">✕</button>
      </span>`).join("");
    list.querySelectorAll(".ur-ctpl-load").forEach(b => {
      b.addEventListener("click", () => {
        const tpl = _customTemplates[b.dataset.id];
        if (tpl) loadTemplate(tpl.data);
      });
    });
    list.querySelectorAll(".ur-ctpl-del").forEach(b => {
      b.addEventListener("click", () => {
        delete _customTemplates[b.dataset.id];
        _saveCustomTpl();
        _renderCustomTpls();
      });
    });
  }

  // ============================================================
  // ПРИМЕРЫ ШАБЛОНОВ
  // ============================================================
  const EXAMPLES = {
    user: { label: "👤 User", data: { name: "John Doe", username: "johnd", email: "john@example.com", phone: "1-234-567-8900", website: "johndoe.com", company: { name: "Acme Corp", catchPhrase: "Multi-layered solution" } } },
    product: { label: "📦 Product", data: { title: "Wireless Mouse", price: 29.99, category: "electronics", description: "Ergonomic wireless mouse", inStock: true, rating: 4.5 } },
    order: { label: "🛒 Order", data: { orderId: 10001, customer: "Jane Smith", email: "jane@mail.com", total: 159.9, status: "pending", items: 3, shipping: { city: "Moscow", zip: "101000", address: "Red Square 1" } } },
    auth: { label: "🔐 Auth", data: { username: "testuser", password: "qwerty123", email: "test@example.com", rememberMe: false } },
    ruPerson:  { label: "🇷🇺 Физлицо РФ", data: { fio: "Иванов Иван Иванович", phone: "+7 (999) 123-45-67", email: "ivanov@mail.ru", inn: "123456789012", snils: "123-456-789 01", passport: "45 10 123456", address: "г. Москва, ул. Ленина, д. 1, кв. 1" } },
    ruCompany: { label: "🏢 Юрлицо РФ",  data: { name: "ООО Ромашка", inn: "1234567890", kpp: "123401001", ogrn: "1234567890123", bik: "044525225", rs: "40702810000000000000", address: "г. Москва, ул. Пушкина, д. 10" } },
    uzPerson:  { label: "🇺🇿 Физлицо UZ", data: { fullName: "Каримов Алишер", phone: "+998 (90) 123-45-67", email: "alisher@gmail.com", pinfl: "12345678901234", passport: "AB 1234567", address: "Тошкент вилояти, Тошкент, Мустақиллик кўчаси, 1-уй" } },
    uzCompany: { label: "🏢 Юрлицо UZ",  data: { name: 'МЧЖ "Технология"', inn: "123456789", address: "Тошкент, Амир Темур кўчаси, 10" } },
    usPerson:  { label: "🇺🇸 Person (US)", data: { fullName: "John Smith", phone: "+1 (555) 123-4567", email: "john.smith@gmail.com", ssn: "123-45-6789", address: "123 Main St, New York, NY 10001", zip: "10001", state: "New York (NY)" } },
    usCompany: { label: "🏢 Company (US)", data: { name: "Acme Corp LLC", ein: "12-3456789", phone: "+1 (800) 555-0100", email: "info@acme.com", address: "1 Corporate Blvd, Austin, TX 78701", zip: "78701" } },
  };

  // ============================================================
  // ДАННЫЕ
  // ============================================================
  const NAMES = ["John Doe","Jane Smith","Alice Johnson","Bob Williams","Charlie Brown","Diana Prince","Ivan Petrov","Elena Volkova","Sergey Kozlov","Anna Petrova","Max Fischer","Olga Smirnova"];
  const CITIES = ["Moscow","London","New York","Berlin","Tokyo","Paris","Sydney","Toronto","Dubai","Singapore","Rome","Istanbul"];
  const LOREM = ["Lorem ipsum dolor sit amet","Consectetur adipiscing elit","Sed do eiusmod tempor incididunt","Ut labore et dolore magna aliqua","Duis aute irure dolor"];
  const STATUSES = ["active","inactive","pending","approved","rejected","cancelled"];

  // ── Российские данные ──────────────────────────────────────────
  const RU_FIRST_M = ["Александр","Дмитрий","Михаил","Иван","Алексей","Сергей","Андрей","Николай","Евгений","Артём","Максим","Владимир","Кирилл","Роман","Павел","Виктор","Антон","Степан","Глеб","Тимур"];
  const RU_FIRST_F = ["Анна","Мария","Елена","Наталья","Ольга","Татьяна","Ирина","Светлана","Екатерина","Юлия","Виктория","Дарья","Марина","Надежда","Ксения","Алина","Валерия","Полина","Людмила","Оксана"];
  const RU_LAST_M  = ["Иванов","Смирнов","Кузнецов","Попов","Васильев","Петров","Соколов","Михайлов","Новиков","Федоров","Морозов","Волков","Алексеев","Лебедев","Семёнов","Егоров","Павлов","Козлов","Степанов","Никитин"];
  const RU_LAST_F  = ["Иванова","Смирнова","Кузнецова","Попова","Васильева","Петрова","Соколова","Михайлова","Новикова","Федорова","Морозова","Волкова","Алексеева","Лебедева","Семёнова","Егорова","Павлова","Козлова","Степанова","Никитина"];
  const RU_PATRON_M = ["Александрович","Дмитриевич","Михайлович","Иванович","Алексеевич","Сергеевич","Андреевич","Николаевич","Евгеньевич","Артёмович","Максимович","Владимирович","Кириллович","Романович","Павлович"];
  const RU_PATRON_F = ["Александровна","Дмитриевна","Михайловна","Ивановна","Алексеевна","Сергеевна","Андреевна","Николаевна","Евгеньевна","Артёмовна","Максимовна","Владимировна","Кирилловна","Романовна","Павловна"];
  const RU_CITIES  = ["Москва","Санкт-Петербург","Новосибирск","Екатеринбург","Нижний Новгород","Казань","Челябинск","Омск","Самара","Ростов-на-Дону","Уфа","Красноярск","Пермь","Воронеж","Волгоград","Краснодар","Саратов","Тюмень","Тольятти","Ижевск"];
  const RU_STREETS = ["Ленина","Пушкина","Гагарина","Советская","Мира","Садовая","Молодёжная","Центральная","Школьная","Новая","Лесная","Кирова","Октябрьская","Победы","Набережная","Парковая","Заречная","Луговая","Полевая","Строителей"];
  const RU_REGIONS = ["Московская обл.","Ленинградская обл.","Краснодарский край","Свердловская обл.","Республика Татарстан","Ростовская обл.","Башкортостан","Челябинская обл.","Новосибирская обл.","Самарская обл."];
  const RU_BANK_NAMES = ["Сбербанк","ВТБ","Газпромбанк","Альфа-Банк","Россельхозбанк","Тинькофф Банк","Открытие","РСХБ","ПСБ","Совкомбанк"];
  const RU_AUTO_LETTERS = "АВЕКМНОРСТУХ"; // кириллица, допустимая в номерах

  // ── Российские вспомогательные функции ─────────────────────────
  function _innCheckDigit(coefs, ds) {
    return coefs.reduce((s, c, i) => s + c * ds[i], 0) % 11 % 10;
  }
  function genInnFiz() {
    const d = Array.from({length: 10}, () => rnd(10));
    const c1 = _innCheckDigit([7,2,4,10,3,5,9,4,6,8], d);
    const c2 = _innCheckDigit([3,7,2,4,10,3,5,9,4,6,8], [...d, c1]);
    return d.join("") + c1 + c2;
  }
  function genInnUr() {
    const d = Array.from({length: 9}, () => rnd(10));
    // первые 4 цифры — код региона/налоговой, не должен быть 0000
    if (d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] === 0) d[0] = 1;
    const c = _innCheckDigit([2,4,10,3,5,9,4,6,8], d);
    return d.join("") + c;
  }
  function genSnils() {
    const d = Array.from({length: 9}, () => rnd(10));
    // номер не должен быть < 1001000 (правило ПФР)
    let num = +d.join("");
    if (num < 1001000) { d[0] = 0; d[1] = 0; d[2] = 1; d[3] = rnd(9) + 1; }
    let sum = d.reduce((s, v, i) => s + v * (9 - i), 0);
    if (sum > 101) sum = sum % 101;
    const ctl = (sum === 100 || sum === 101) ? 0 : sum;
    const base = d.join("").replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3");
    return `${base} ${String(ctl).padStart(2,"0")}`;
  }
  function genKpp() {
    // NNNN + PP + XXX  (регион+налоговая+причина)
    const region = String(rnd(98) + 1).padStart(2,"0");
    const tax    = String(rnd(98) + 1).padStart(2,"0");
    const reason = String(rnd(899) + 100);   // 001-999, но без 001-009 для уникальности
    return region + tax + "01" + reason.slice(-3);
  }
  function genOgrn() {
    const d = Array.from({length: 12}, () => rnd(10));
    // Первая цифра — признак ЮЛ (1) или ИП (не используем здесь)
    d[0] = 1;
    const n = BigInt(d.join(""));
    const ctl = Number(n % 11n % 10n);
    return d.join("") + ctl;
  }
  function genOgrnip() {
    const d = Array.from({length: 14}, () => rnd(10));
    d[0] = rnd(2) + 3; // 3 или 4 — признак ОГРНИП
    const n = BigInt(d.join(""));
    const ctl = Number(n % 13n % 10n);
    return d.join("") + ctl;
  }
  function genPassportRf() {
    const series = String(rnd(90) + 10) + " " + String(rnd(90) + 10);
    const number = String(rnd(900000) + 100000);
    return `${series} ${number}`;
  }
  function genBik() {
    // БИК: 04 + регион(2) + подразд(2) + номер(3)
    const reg = String(rnd(98) + 1).padStart(2,"0");
    const sub = pick(["01","02","03","04","05"]);
    const num = String(rnd(899) + 100);
    return "04" + reg + sub + num;
  }
  function genRs() {
    // Расчётный счёт — 20 цифр, начинается с 405/406/407/408/423/426/407
    const prefixes = ["40702","40701","40802","40703","42301","40501","40601"];
    return pick(prefixes) + digits(15);
  }
  function genAutoRf() {
    const L = RU_AUTO_LETTERS;
    const region = pick(["77","78","50","47","23","66","63","16","52","54","55","45","72","18"]);
    return L[rnd(L.length)] + String(rnd(900)+100) + L[rnd(L.length)] + L[rnd(L.length)] + region;
  }
  function genRuFullNameM() { return `${pick(RU_LAST_M)} ${pick(RU_FIRST_M)} ${pick(RU_PATRON_M)}`; }
  function genRuFullNameF() { return `${pick(RU_LAST_F)} ${pick(RU_FIRST_F)} ${pick(RU_PATRON_F)}`; }
  function genRuFullName() { return rnd(2) ? genRuFullNameM() : genRuFullNameF(); }
  function genRuAddress() {
    const city = pick(RU_CITIES);
    const street = pick(RU_STREETS);
    const house = rnd(200) + 1;
    const apt = rnd(2) ? `, кв. ${rnd(200)+1}` : "";
    return `г. ${city}, ул. ${street}, д. ${house}${apt}`;
  }
  function genRuEmail() {
    const name = pick(RU_FIRST_M.concat(RU_FIRST_F)).toLowerCase()
      .replace(/[ёе]/g,"e").replace(/[яа]/g,"a").replace(/[ыи]/g,"i")
      .replace(/[оу]/g,"u").replace(/[нн]/g,"n").replace(/[^a-z]/g,lower(1));
    return `${name}${rnd(99)+1}@${pick(["mail.ru","yandex.ru","rambler.ru","bk.ru","inbox.ru","list.ru"])}`;
  }
  function genRuPhone() {
    // +7 (9XX) XXX-XX-XX
    const code = String(rnd(9) + 900) ;
    return `+7 (${code}) ${digits(3)}-${digits(2)}-${digits(2)}`;
  }

  // ── Узбекистан ──────────────────────────────────────────────────
  const UZ_FIRST_M  = ["Акбар","Алишер","Бобур","Дилшод","Жамшид","Зафар","Комил","Лазиз","Мирзо","Нодир","Отабек","Равшан","Санжар","Тимур","Улугбек","Фаррух","Хасан","Шерзод","Элмурод","Юсуф"];
  const UZ_FIRST_F  = ["Азиза","Барно","Гулнора","Дилноза","Замира","Зулайхо","Камола","Лола","Малика","Наргиза","Нилуфар","Ойдин","Озода","Сабина","Севара","Умида","Феруза","Хилола","Шахло","Яшнар"];
  const UZ_LAST     = ["Каримов","Рахимов","Усмонов","Хасанов","Назаров","Исмоилов","Юсупов","Мирзаев","Холматов","Тошматов","Эргашев","Азимов","Сулаймонов","Бобоев","Норматов","Жалолов","Турсунов","Хамидов","Санақулов","Ўринов"];
  const UZ_CITIES   = ["Тошкент","Самарқанд","Бухоро","Наманган","Андижон","Фарғона","Нукус","Қарши","Ургенч","Термиз","Жиззах","Гулистон","Навоий","Денов","Чирчиқ","Олмалиқ","Ангрен","Бекобод","Қўқон","Марғилон"];
  const UZ_STREETS  = ["Мустақиллик","Навоий","Амир Темур","Беруний","Шароф Рашидов","Ипак Йўли","Янги Ўзбекистон","Дўстлик","Тинчлик","Истиқлол","Ўзбекистон","Мирзо Улугбек","Буюк Ипак Йўли","Зарафшон","Чўлпон"];
  const UZ_REGIONS  = ["Тошкент вилояти","Самарқанд вилояти","Фарғона вилояти","Андижон вилояти","Наманган вилояти","Бухоро вилояти","Хоразм вилояти","Қашқадарё вилояти","Сурхондарё вилояти","Жиззах вилояти","Навоий вилояти","Сирдарё вилояти","Қорақалпоғистон"];
  const UZ_OPERATORS = ["90","91","93","94","95","97","98","99","33","50"];

  function genUzPhone()    { return `+998 (${pick(UZ_OPERATORS)}) ${digits(3)}-${digits(2)}-${digits(2)}`; }
  function genUzFullName() { const m = rnd(2); return `${pick(UZ_LAST)} ${m ? pick(UZ_FIRST_M) : pick(UZ_FIRST_F)}`; }
  function genUzAddress()  {
    return `${pick(UZ_REGIONS)}, ${pick(UZ_CITIES)}, ${pick(UZ_STREETS)} кўчаси, ${rnd(200)+1}-уй`;
  }
  function genUzEmail()    {
    const name = pick(UZ_FIRST_M.concat(UZ_FIRST_F)).toLowerCase()
      .replace(/[ўқғҳ]/g, c => ({ў:"u",қ:"q",ғ:"g",ҳ:"h"})[c] || lower(1));
    return `${name}${rnd(99)+1}@${pick(["mail.ru","gmail.com","inbox.ru","rambler.ru","umail.uz","mail.uz"])}`;
  }
  /** ПИНФЛ — 14-значный персональный идентификационный номер физлица */
  function genUzPinfl() {
    // Структура: [пол+дата(7)][регион(2)][порядковый(4)][контроль(1)]
    const year    = 1960 + rnd(50);
    const month   = String(rnd(12)+1).padStart(2,"0");
    const day     = String(rnd(28)+1).padStart(2,"0");
    const gender  = rnd(2); // 1 — муж, 2 — жен
    const century = year >= 2000 ? (gender ? 5 : 6) : (gender ? 1 : 2);
    const yy      = String(year).slice(2);
    const region  = String(rnd(14)+1).padStart(2,"0");
    const seq     = String(rnd(9000)+1000);
    const base    = `${century}${yy}${month}${day}${region}${seq}`;
    // Простейший контрольный разряд (сумма % 10)
    const ctl = base.split("").reduce((s,c) => s + +c, 0) % 10;
    return base + ctl;
  }
  /** ИНН юрлица Узбекистан — 9 цифр */
  function genUzInn() {
    const region = String(rnd(14)+1).padStart(2,"0");
    const body   = digits(6);
    const ctl    = String((region + body).split("").reduce((s,c) => s + +c, 0) % 10);
    return region + body + ctl;
  }
  /** Серия и номер паспорта Узбекистана: AA 1234567 */
  function genUzPassport() {
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const series = alpha[rnd(26)] + alpha[rnd(26)];
    return `${series} ${digits(7)}`;
  }

  // ── США ─────────────────────────────────────────────────────────
  const US_FIRST_M  = ["James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua"];
  const US_FIRST_F  = ["Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica","Sarah","Karen","Lisa","Nancy","Betty","Margaret","Sandra","Ashley","Dorothy","Kimberly","Emily","Donna"];
  const US_LAST     = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin"];
  const US_CITIES   = ["New York","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio","San Diego","Dallas","San Jose","Austin","Jacksonville","Fort Worth","Columbus","Charlotte","Indianapolis","San Francisco","Seattle","Denver","Washington"];
  const US_STATES   = [["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["CA","California"],["CO","Colorado"],["FL","Florida"],["GA","Georgia"],["IL","Illinois"],["NY","New York"],["TX","Texas"],["WA","Washington"],["OH","Ohio"],["PA","Pennsylvania"],["MI","Michigan"],["NC","North Carolina"],["NJ","New Jersey"],["VA","Virginia"],["MA","Massachusetts"],["TN","Tennessee"],["IN","Indiana"]];
  const US_STREETS  = ["Main St","Oak Ave","Maple Dr","Cedar Ln","Pine St","Elm St","Washington Blvd","Park Ave","Lake Dr","Hill Rd","River Rd","Forest Ave","Sunset Blvd","Lincoln Ave","Jefferson St","Madison Ave","Monroe St","Adams St","Jackson Blvd","Harrison Ave"];
  const US_DOMAINS  = ["gmail.com","yahoo.com","outlook.com","hotmail.com","icloud.com","aol.com","protonmail.com","mail.com"];

  function genUsPhone()    {
    const area = String(rnd(800)+200);
    return `+1 (${area}) ${digits(3)}-${digits(4)}`;
  }
  function genUsFullName() { return `${pick(US_FIRST_M.concat(US_FIRST_F))} ${pick(US_LAST)}`; }
  function genUsAddress()  {
    const st = pick(US_STATES);
    return `${rnd(9999)+1} ${pick(US_STREETS)}, ${pick(US_CITIES)}, ${st[0]} ${digits(5)}`;
  }
  function genUsEmail()    {
    const fn = pick(US_FIRST_M.concat(US_FIRST_F)).toLowerCase();
    const ln = pick(US_LAST).toLowerCase();
    return `${fn}.${ln}${rnd(99)+1}@${pick(US_DOMAINS)}`;
  }
  function genUsZip()      { return digits(5); }
  function genUsState()    { const s = pick(US_STATES); return `${s[1]} (${s[0]})`; }
  /** SSN — Social Security Number: XXX-XX-XXXX */
  function genUsSsn()      {
    // Первые три цифры не могут быть 000, 666, 900-999
    let area;
    do { area = rnd(1000); } while (area === 0 || area === 666 || area >= 900);
    return `${String(area).padStart(3,"0")}-${String(rnd(100)).padStart(2,"0")}-${String(rnd(10000)).padStart(4,"0")}`;
  }
  /** EIN — Employer Identification Number: XX-XXXXXXX */
  function genUsEin()      {
    const prefixes = ["01","02","03","04","05","06","10","11","12","13","14","15","16","20","21","22","23","24","25","26","27","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","50","51","52","53","54","55","56","57","58","59","60","61","62","63","64","65","66","67","68","71","72","73","74","75","76","77","80","81","82","83","84","85","86","87","88","90","91","92","93","94","95","98","99"];
    return `${pick(prefixes)}-${digits(7)}`;
  }
  /** Номер кредитной карты (алгоритм Луна) */
  function genUsCreditCard() {
    const prefixes = [["4"],["51"],["52"],["53"],["54"],["55"],["37"],["6011"]];
    const prefix = pick(prefixes);
    const len = 16;
    const body = [...prefix];
    while (body.length < len - 1) body.push(String(rnd(10)));
    // Контрольная цифра Луна
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let n = +body[body.length - 1 - i];
      if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    body.push(String((10 - (sum % 10)) % 10));
    return body.join("").replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4");
  }
  /** Номер водительского удостоверения США (упрощённый формат) */
  function genUsDlNumber() {
    const st = pick(US_STATES)[0];
    return `${st}${digits(7)}`;
  }

  const CHARSETS = {
    text:         "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    numbers:      "0123456789",
    symbols:      "!@#$%^&*()_+-=[]{}|;:,.<>?",
    alphanumeric: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    mixed:        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%",
  };

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const digits = (n) => { let s = ""; for (let i = 0; i < n; i++) s += rnd(10); return s; };
  const lower = (n) => { let s = ""; for (let i = 0; i < n; i++) s += CHARSETS.text[rnd(26)]; return s; };
  const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = rnd(16); return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
  const isoDate = () => new Date(Date.now() - rnd(365 * 86400000)).toISOString().split("T")[0];

  /** Бывший Type 1 — теперь локально, без запроса к серверу */
  function genChars(o) {
    const set = CHARSETS[o.charType || "mixed"] || CHARSETS.mixed;
    const len = Math.max(1, Math.min(500, o.length || 20));
    let s = "";
    for (let i = 0; i < len; i++) s += set[rnd(set.length)];
    return s;
  }

  // ============================================================
  // РЕЕСТР ГЕНЕРАТОРОВ
  // opts: какой блок настроек показывать (null — без настроек)
  // dyn:  имя динамической переменной для режима «как переменные»
  // ============================================================
  const GEN = {
    auto:     { label: "Auto",           group: "smart", fn: (fc) => autoGenerate(fc.key, fc.originalValue) },
    text:     { label: "Текст",          group: "basic", fn: () => lower(8),                    dyn: "randomWord" },
    name:     { label: "Имя",            group: "basic", fn: () => pick(NAMES),                 dyn: "randomFullName" },
    email:    { label: "Email",          group: "basic", fn: () => `${lower(6)}@${pick(["gmail.com","mail.com","test.com"])}`, dyn: "randomEmail" },
    phone:    { label: "Телефон",        group: "basic", fn: () => `+7-${digits(3)}-${digits(3)}-${digits(4)}`, dyn: "randomPhone" },
    url:      { label: "URL",            group: "basic", fn: () => `https://${lower(6)}.${pick(["com","org","io"])}`, dyn: "randomUrl" },
    city:     { label: "Город",          group: "basic", fn: () => pick(CITIES),                dyn: "randomCity" },
    status:   { label: "Статус",         group: "basic", fn: () => pick(STATUSES),              dyn: "randomStatus" },
    password: { label: "Пароль",         group: "basic", fn: () => genChars({ charType: "mixed", length: 12 }), dyn: "randomPassword" },
    lorem:    { label: "Lorem",          group: "basic", fn: () => pick(LOREM),                 dyn: "randomSentence" },
    uuid:     { label: "UUID",           group: "basic", fn: uuid,                              dyn: "randomUUID" },
    date:     { label: "Дата",           group: "basic", fn: isoDate,                           dyn: "randomDate" },
    number:   { label: "Целое число",    group: "basic", fn: () => rnd(10000),                  dyn: "randomInt" },
    float:    { label: "Дробное",        group: "basic", fn: () => +(Math.random() * 1000).toFixed(2), dyn: "randomPrice" },
    bool:     { label: "true / false",   group: "basic", fn: () => Math.random() > 0.5,         dyn: "randomBoolean" },

    // ── Российские реалии ────────────────────────────────────────
    ruFullName:  { label: "ФИО (рус.)",           group: "russia", fn: genRuFullName },
    ruFullNameM: { label: "ФИО мужское",           group: "russia", fn: genRuFullNameM },
    ruFullNameF: { label: "ФИО женское",           group: "russia", fn: genRuFullNameF },
    ruPhone:     { label: "Телефон RU (+7)",        group: "russia", fn: genRuPhone },
    ruEmail:     { label: "Email RU (mail/yandex)", group: "russia", fn: genRuEmail },
    ruCity:      { label: "Город РФ",              group: "russia", fn: () => pick(RU_CITIES) },
    ruAddress:   { label: "Адрес РФ",             group: "russia", fn: genRuAddress },
    ruInnFiz:    { label: "ИНН физлица (12 цифр)", group: "russia", fn: genInnFiz },
    ruInnUr:     { label: "ИНН юрлица (10 цифр)",  group: "russia", fn: genInnUr },
    ruSnils:     { label: "СНИЛС",                 group: "russia", fn: genSnils },
    ruKpp:       { label: "КПП",                   group: "russia", fn: genKpp },
    ruOgrn:      { label: "ОГРН (юрлицо)",         group: "russia", fn: genOgrn },
    ruOgrnip:    { label: "ОГРНИП (ИП)",           group: "russia", fn: genOgrnip },
    ruPassport:  { label: "Паспорт РФ (серия+№)",  group: "russia", fn: genPassportRf },
    ruBik:       { label: "БИК банка",             group: "russia", fn: genBik },
    ruRs:        { label: "Расчётный счёт (р/с)",  group: "russia", fn: genRs },
    ruAuto:      { label: "Гос. номер авто РФ",    group: "russia", fn: genAutoRf },

    // ── Узбекистан ───────────────────────────────────────────────
    uzFullName:  { label: "ФИО (узб.)",            group: "uzbek", fn: genUzFullName },
    uzPhone:     { label: "Телефон UZ (+998)",      group: "uzbek", fn: genUzPhone },
    uzEmail:     { label: "Email (uz/gmail)",       group: "uzbek", fn: genUzEmail },
    uzCity:      { label: "Город Узбекистана",      group: "uzbek", fn: () => pick(UZ_CITIES) },
    uzAddress:   { label: "Адрес Узбекистана",      group: "uzbek", fn: genUzAddress },
    uzPinfl:     { label: "ПИНФЛ (14 цифр)",        group: "uzbek", fn: genUzPinfl },
    uzInn:       { label: "ИНН юрлица UZ (9 цифр)", group: "uzbek", fn: genUzInn },
    uzPassport:  { label: "Паспорт UZ (AA 1234567)",group: "uzbek", fn: genUzPassport },

    // ── США ──────────────────────────────────────────────────────
    usFullName:  { label: "Full Name (US)",         group: "usa", fn: genUsFullName },
    usPhone:     { label: "Phone US (+1)",           group: "usa", fn: genUsPhone },
    usEmail:     { label: "Email US",               group: "usa", fn: genUsEmail },
    usCity:      { label: "City (US)",              group: "usa", fn: () => pick(US_CITIES) },
    usState:     { label: "State (US)",             group: "usa", fn: genUsState },
    usAddress:   { label: "Address (US)",           group: "usa", fn: genUsAddress },
    usZip:       { label: "ZIP Code",               group: "usa", fn: genUsZip },
    usSsn:       { label: "SSN (XXX-XX-XXXX)",      group: "usa", fn: genUsSsn },
    usEin:       { label: "EIN (XX-XXXXXXX)",       group: "usa", fn: genUsEin },
    usCreditCard:{ label: "Credit Card (Luhn)",     group: "usa", fn: genUsCreditCard },
    usDl:        { label: "Driver License",         group: "usa", fn: genUsDlNumber },

    // Бывший Type 1 — теперь генератор поля
    chars:    { label: "По типу символов", group: "advanced", opts: "chars", fn: (fc) => genChars(fc.opts) },

    // Бывший Type 2 — словари с сервера
    dict:     { label: "Из словаря сервера", group: "advanced", opts: "dict", fn: null, async: true },

    // Свой список значений
    list:     { label: "Из своего списка", group: "advanced", opts: "list",
                fn: (fc) => fc.opts.values && fc.opts.values.length ? pick(fc.opts.values) : fc.originalValue },

    // --- По схеме OpenAPI (доступны, когда запрос импортирован из Swagger) ---
    enumValue:  { label: "Из enum схемы", group: "schema",
                  fn: (fc) => fc.meta && fc.meta.enum ? pick(fc.meta.enum) : fc.originalValue },
    inRange:    { label: "Число в границах", group: "schema",
                  fn: (fc) => {
                    const m = fc.meta || {};
                    const lo = m.minimum !== null && m.minimum !== undefined ? m.minimum : 0;
                    const hi = m.maximum !== null && m.maximum !== undefined ? m.maximum : lo + 1000;
                    const v = lo + Math.random() * (hi - lo);
                    return m.type === "integer" ? Math.floor(v) : +v.toFixed(2);
                  } },
    atMinLength:{ label: "Строка мин. длины", group: "schema",
                  fn: (fc) => "a".repeat(Math.max(1, (fc.meta && fc.meta.minLength) || 1)) },
    atMaxLength:{ label: "Строка макс. длины", group: "schema",
                  fn: (fc) => "a".repeat(Math.max(1, (fc.meta && fc.meta.maxLength) || 255)) },

    // --- Заведомо невалидные данные ---
    // Ради этого инструмент и открывают: проверить, что API отвечает
    // 400/422, а не падает с 500.
    badEmpty:     { label: "Пустая строка",        group: "invalid", fn: () => "" },
    badNull:      { label: "null",                 group: "invalid", fn: () => null },
    badMissing:   { label: "Убрать поле",          group: "invalid", fn: null, remove: true },
    badSpaces:    { label: "Только пробелы",       group: "invalid", fn: () => "     " },
    badWrongType: { label: "Неверный тип",         group: "invalid",
                    fn: (fc) => typeof fc.originalValue === "number" ? "не число"
                              : typeof fc.originalValue === "boolean" ? "не булево"
                              : 12345 },
    badTooLong:   { label: "Очень длинная строка", group: "invalid", opts: "long",
                    fn: (fc) => "A".repeat(Math.max(1, fc.opts.longLen || 10000)) },
    badNegative:  { label: "Отрицательное число",  group: "invalid", fn: () => -Math.abs(rnd(9999) + 1) },
    badZero:      { label: "Ноль",                 group: "invalid", fn: () => 0 },
    badHugeNum:   { label: "Огромное число",       group: "invalid", fn: () => 9999999999999999999 },
    badSql:       { label: "SQL-инъекция",         group: "invalid", fn: () => pick(SQL_PAYLOADS) },
    badXss:       { label: "XSS",                  group: "invalid", fn: () => pick(XSS_PAYLOADS) },
    badPath:      { label: "Обход путей",          group: "invalid", fn: () => pick(PATH_PAYLOADS) },
    badUnicode:   { label: "Спецсимволы Unicode",  group: "invalid", fn: () => pick(UNICODE_PAYLOADS) },
    // Нарушения конкретных ограничений схемы — самые ценные проверки:
    // API обязан ответить 400/422 именно на них.
    badNotInEnum: { label: "Значение вне enum",    group: "invalid",
                    fn: (fc) => {
                      const e = fc.meta && fc.meta.enum;
                      if (!e || !e.length) return "не-из-списка";
                      // Гарантированно отсутствующее в перечислении значение
                      let v = "НЕТ_ТАКОГО";
                      while (e.includes(v)) v += "_X";
                      return v;
                    } },
    badBelowMin:  { label: "Меньше минимума",      group: "invalid",
                    fn: (fc) => {
                      const m = fc.meta || {};
                      if (m.minimum !== null && m.minimum !== undefined) return m.minimum - 1;
                      return -1;
                    } },
    badAboveMax:  { label: "Больше максимума",     group: "invalid",
                    fn: (fc) => {
                      const m = fc.meta || {};
                      if (m.maximum !== null && m.maximum !== undefined) return m.maximum + 1;
                      return 999999999;
                    } },
    badTooShort:  { label: "Короче minLength",     group: "invalid",
                    fn: (fc) => {
                      const n = (fc.meta && fc.meta.minLength) || 1;
                      return "a".repeat(Math.max(0, n - 1));
                    } },
    badOverMaxLen:{ label: "Длиннее maxLength",    group: "invalid",
                    fn: (fc) => {
                      const n = (fc.meta && fc.meta.maxLength) || 255;
                      return "a".repeat(n + 1);
                    } },

    badFormat:    { label: "Неверный формат",      group: "invalid",
                    fn: (fc) => {
                      const k = (fc.key || "").toLowerCase();
                      if (k.includes("email")) return "не-почта@@";
                      if (k.includes("date")) return "2026-13-45";
                      if (k.includes("phone")) return "телефон";
                      if (k.includes("url") || k.includes("site")) return "не ссылка";
                      if (k.includes("uuid")) return "не-uuid-1234";
                      return "###неверно###";
                    } },
  };

  const SQL_PAYLOADS = ["' OR '1'='1", "'; DROP TABLE users; --", "1' UNION SELECT NULL--", "admin'--"];
  const XSS_PAYLOADS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "javascript:alert(1)"];
  const PATH_PAYLOADS = ["../../../etc/passwd", "..\\..\\windows\\win.ini", "/etc/shadow"];
  // Записаны escape-последовательностями: это невидимые управляющие символы,
  // из-за них файл выглядит бинарным в grep/diff и легко ломается при копировании.
  const UNICODE_PAYLOADS = [
    "\u{1F525}\u{1F480}\u{1F47E}",           // эмодзи
    "\u202Egnirts-lrt",                   // RTL-override, переворачивает текст
    "\u00A0\u00A0\u00A0",                    // неразрывные пробелы
    "\uFF21\uFF22\uFF23",                    // полноширинные латинские буквы
    "a\u200Bb",                           // zero-width space внутри слова
    "\uFEFF",                             // BOM
  ];

  const GROUPS = {
    smart:    "Умный подбор",
    basic:    "Типы данных",
    russia:   "🇷🇺 Россия",
    uzbek:    "🇺🇿 Узбекистан",
    usa:      "🇺🇸 США",
    schema:   "📋 По схеме OpenAPI",
    advanced: "Расширенные",
    invalid:  "⚠ Невалидные данные",
  };

  function autoGenerate(key, value) {
    const k = (key || "").toLowerCase();
    // Российские реквизиты — проверяем первыми, чтобы не перехватил общий «name»/«phone»
    if (k === "inn" || k.includes("_inn") || k.includes("inn_")) return rnd(2) ? genInnFiz() : genInnUr();
    if (k.includes("снилс") || k === "snils")          return genSnils();
    if (k === "kpp" || k.includes("_kpp") || k.includes("kpp_")) return genKpp();
    if (k === "ogrn" || k.includes("огрн"))            return genOgrn();
    if (k === "ogrnip" || k.includes("огрнип"))        return genOgrnip();
    if (k.includes("passport") || k.includes("паспорт")) return genPassportRf();
    if (k === "bik" || k.includes("_bik"))             return genBik();
    if (k.includes("account") || k.includes("счёт") || k.includes("schet") || k === "rs") return genRs();
    if (k.includes("auto") && (k.includes("num") || k.includes("plate") || k.includes("reg"))) return genAutoRf();
    // Общие
    if (k.includes("email"))                           return GEN.email.fn();
    if (k.includes("password") || k.includes("pass")) return GEN.password.fn();
    if (k.includes("phone") || k.includes("tel"))     return genRuPhone();
    if (k.includes("url") || k.includes("website") || k.includes("site")) return GEN.url.fn();
    if (k.includes("city") || k.includes("город"))   return pick(RU_CITIES);
    if (k.includes("status") || k === "state")        return GEN.status.fn();
    if (k.includes("date") || k.includes("created") || k.includes("updated")) return GEN.date.fn();
    if (k.includes("fio") || k.includes("фио") || k.includes("fullname") || k.includes("full_name")) return genRuFullName();
    if (k.includes("name") || k.includes("username") || k.includes("customer")) return genRuFullName();
    if (k.includes("uuid") || k.includes("guid"))     return GEN.uuid.fn();
    if (k.includes("description") || k.includes("catchphrase") || k.includes("bio")) return GEN.lorem.fn();
    if (k.includes("zip") || k.includes("code"))      return digits(6);
    if (k.includes("address") || k.includes("адрес")) return genRuAddress();
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rating")) return GEN.float.fn();
    if (k.includes("id") && typeof value === "number") return rnd(100000);
    if (typeof value === "number" && !Number.isInteger(value)) return GEN.float.fn();
    if (typeof value === "number") return GEN.number.fn();
    if (typeof value === "boolean") return GEN.bool.fn();
    return GEN.text.fn();
  }

  function detectType(key, value) {
    const k = (key || "").toLowerCase();
    // Российские реквизиты
    if (k === "inn" || k.includes("_inn") || k.includes("inn_")) return "ruInnFiz";
    if (k.includes("снилс") || k === "snils")            return "ruSnils";
    if (k === "kpp" || k.includes("_kpp"))               return "ruKpp";
    if (k === "ogrn" || k.includes("огрн"))              return "ruOgrn";
    if (k === "ogrnip")                                  return "ruOgrnip";
    if (k.includes("passport") || k.includes("паспорт")) return "ruPassport";
    if (k === "bik" || k.includes("_bik"))               return "ruBik";
    if (k.includes("account") || k === "rs")             return "ruRs";
    // Узбекские реквизиты
    if (k === "pinfl" || k.includes("пинфл"))            return "uzPinfl";
    // Американские реквизиты
    if (k === "ssn" || k.includes("social_security"))    return "usSsn";
    if (k === "ein" || k.includes("employer_id"))        return "usEin";
    if (k === "zip" || k === "zipcode" || k === "zip_code") return "usZip";
    if (k === "state" && typeof value === "string" && value.length <= 2) return "usState";
    if (k.includes("credit_card") || k.includes("card_number")) return "usCreditCard";
    // Общие
    if (k.includes("email"))                             return "email";
    if (k.includes("password") || k.includes("pass"))   return "password";
    if (k.includes("phone") || k.includes("tel"))       return "ruPhone";
    if (k.includes("url") || k.includes("website") || k.includes("site")) return "url";
    if (k.includes("city") || k.includes("город"))     return "ruCity";
    if (k.includes("status"))                           return "status";
    if (k.includes("date") || k.includes("created") || k.includes("updated")) return "date";
    if (k.includes("fio") || k.includes("фио") || k.includes("fullname") || k.includes("full_name")) return "ruFullName";
    if (k.includes("name") || k.includes("username") || k.includes("customer")) return "ruFullName";
    if (k.includes("uuid") || k.includes("guid"))       return "uuid";
    if (k.includes("description") || k.includes("catchphrase") || k.includes("bio")) return "lorem";
    if (k.includes("address") || k.includes("адрес"))  return "ruAddress";
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rating")) return "float";
    if (typeof value === "number" && !Number.isInteger(value)) return "float";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "bool";
    return "text";
  }

  const escapeHtml = (t) => { const d = document.createElement("div"); d.textContent = String(t); return d.innerHTML; };
  const truncate = (s, m) => s.length > m ? s.substring(0, m) + "..." : s;
  const T = (k, fb) => (window.App && App.t) ? App.t(k, fb) : (fb || k);

  // ============================================================
  // ВСТАВКА В ЗАПРОС
  // ============================================================
  /**
   * Отдельное окно рандомайзера?
   * Проверяем двумя способами: тип окна и факт, что единственная вкладка —
   * сам рандомайзер. Второе спасает, если тип ещё не успел приехать из Python.
   */
  function _isRandomizerWindow() {
    if (App.WINDOW_KIND === "randomizer") return true;
    return !!(window._randomizerWindowReady ||
      (App.state.isDetachedWindow &&
       App.state.tabs.length === 1 &&
       App.state.tabs[0].method === "RANDOMIZER"));
  }

  function _findRequestTab() {
    const a = App.getActiveTab();
    if (a && !["RANDOMIZER", "USERS"].includes(a.method)) return a;
    return [...App.state.tabs].reverse().find(t => !["RANDOMIZER", "USERS"].includes(t.method)) || null;
  }

  function _setBody(json) {
    if (_isRandomizerWindow() && window.pywebview?.api?.set_main_body) {
      window.pywebview.api.set_main_body(json)
        .then(ok => _notify(ok ? T("insertedToMain") : T("mainWindowNotFound"), ok ? "success" : "warning"))
        .catch(() => _notify(T("error"), "danger"));
      return;
    }
    const tab = _findRequestTab();
    if (!tab) { _notify(T("noTabs"), "warning"); return; }
    if (!["POST", "PUT", "PATCH"].includes(tab.method)) tab.method = "POST";
    tab.body = json;
    tab.activeSubTab = "body";
    if (App.state.activeTabId === tab.id) App.renderTabContent();
    else App.selectTab(tab.id);
    _notify(T("inserted"), "success");
  }

  // ============================================================
  // ПАНЕЛЬ
  // ============================================================
  function createPanel() {
    if (document.getElementById("unified-rand-panel")) return;

    const panel = document.createElement("div");
    panel.id = "unified-rand-panel";
    panel.className = "randomizer-v2-panel ur-root";
    panel.style.display = "none";
    Object.assign(panel.style, {
      resize: "both", overflow: "hidden",
      minWidth: "420px", minHeight: "340px", maxWidth: "90vw", maxHeight: "90vh",
    });

    panel.innerHTML = `
      <div class="randomizer-v2-header" id="ur-header" style="cursor:move;">
        <div class="randomizer-v2-title"><span>🎲</span> ${T("navRandomizer")}</div>
        <div class="randomizer-v2-controls">
          <button id="ur-detach" class="randomizer-btn" title="${T("openInWindow")}"><i class="bi bi-box-arrow-up-right"></i></button>
          <button id="ur-lock" class="randomizer-btn" title="${T("lockPanel")}"><i class="bi bi-unlock"></i></button>
          <button id="ur-collapse" class="randomizer-btn" title="${T("collapseResponse")}"><i class="bi bi-chevron-up"></i></button>
          <button id="ur-close" class="randomizer-btn" title="${T("close")}"><i class="bi bi-x"></i></button>
        </div>
      </div>` + _contentHTML();

    document.body.appendChild(panel);
    _makeDraggable();
    _attach();
    _loadWordLists().catch(() => {});
  }

  function _contentHTML() {
    const ex = Object.entries(EXAMPLES)
      .map(([k, v]) => `<button class="ur-example-btn randomizer-btn" data-example="${k}" style="font-size:11px;padding:3px 8px;">${v.label}</button>`)
      .join("");

    return `
      <div id="ur-body" class="randomizer-v2-content">

        <div class="ur-section">
          <label class="ur-label">${T("templateExamples")}</label>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${ex}</div>
        </div>

        <div class="ur-section" id="ur-custom-section" style="padding-top:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;">
            <label class="ur-label" style="margin:0;">${T("myTemplates","Мои шаблоны")}</label>
            <button id="ur-save-tpl" class="randomizer-btn" style="font-size:11px;padding:2px 8px;" title="${T("saveTemplate","Сохранить шаблон")}">
              <i class="bi bi-floppy"></i> ${T("saveTemplate","Сохранить")}
            </button>
          </div>
          <div id="ur-custom-tpl-list" style="display:flex;gap:4px;flex-wrap:wrap;min-height:22px;"></div>
          <div id="ur-save-tpl-form" style="display:none;margin-top:6px;gap:4px;align-items:center;">
            <input type="text" id="ur-tpl-name" class="form-control form-control-sm"
                   placeholder="${T("templateNameHint","Название шаблона...")}" style="flex:1;font-size:12px;">
            <button id="ur-tpl-name-ok" class="randomizer-btn-primary" style="font-size:11px;padding:3px 8px;white-space:nowrap;">
              <i class="bi bi-check-lg"></i>
            </button>
            <button id="ur-tpl-name-cancel" class="randomizer-btn" style="font-size:11px;padding:3px 7px;">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div class="ur-section ur-toolbar">
          <button id="ur-load-body" class="randomizer-btn-primary" style="flex:1;font-size:12px;">
            <i class="bi bi-download"></i> ${T("fromBody")}
          </button>
          <button id="ur-load-file" class="randomizer-btn" style="font-size:11px;">
            <i class="bi bi-folder2-open"></i> ${T("file")}
          </button>
          <input type="file" id="ur-file-input" accept=".json,.txt" style="display:none;">
          <span style="color:var(--border-color);">|</span>
          <button id="ur-all" class="randomizer-btn" style="font-size:11px;" title="${T("all")}">☑</button>
          <button id="ur-none" class="randomizer-btn" style="font-size:11px;" title="${T("none")}">☐</button>
        </div>

        <div id="ur-fields" class="ur-fields">
          <div class="ur-empty">
            <p style="margin:0 0 8px;">${T("pickTemplateHint")}</p>
            <code style="color:var(--accent);font-size:11px;">{"name": "John", "email": "j@mail.com", "age": 25}</code>
          </div>
        </div>

        <div id="ur-preview-wrap" class="ur-section" style="display:none;">
          <label class="ur-label">${T("result")}</label>
          <pre id="ur-preview" class="ur-preview"></pre>
        </div>

        <div class="ur-section ur-actions">
          <button id="ur-generate" class="randomizer-btn-primary" style="flex:2;">🎲 ${T("generate")}</button>
          <button id="ur-fuzz" class="ur-fuzz-btn" style="flex:1;" title="${T("fuzzHint")}">⚠ ${T("fuzz")}</button>
          <button id="ur-copy" class="randomizer-btn" style="flex:1;"><i class="bi bi-clipboard"></i></button>
          <button id="ur-insert" class="randomizer-btn-primary" style="flex:1;"><i class="bi bi-box-arrow-in-down"></i> ${T("insert")}</button>
          <button id="ur-as-vars" class="randomizer-btn" style="flex:1;" title="${T("asVarsHint")}">{$}</button>
        </div>

        <div id="ur-notification" class="ur-notify"></div>
      </div>`;
  }

  // ============================================================
  // РЕЖИМ ВКЛАДКИ
  // ============================================================
  function mountInTab(container) {
    const fp = document.getElementById("unified-rand-panel");
    if (fp) fp.remove();

    const wrap = document.createElement("div");
    wrap.className = "randomizer-tab-mode ur-root";
    wrap.innerHTML = _contentHTML();
    container.appendChild(wrap);

    _attach();
    if (fieldConfigs.length) renderFields();
    if (lastGenerated) _showPreview();
    if (wordLists.length) _fillDictSelects();
    else _loadWordLists().catch(() => {});
  }

  // ============================================================
  // СОБЫТИЯ
  // ============================================================
  function _attach() {
    document.getElementById("ur-detach")?.addEventListener("click", () => { hide(); openWindow(); });
    document.getElementById("ur-lock")?.addEventListener("click", _toggleLock);
    document.getElementById("ur-close")?.addEventListener("click", hide);
    document.getElementById("ur-collapse")?.addEventListener("click", _toggleCollapse);

    document.querySelectorAll(".ur-root .ur-example-btn").forEach(b => {
      b.addEventListener("click", () => {
        const e = EXAMPLES[b.dataset.example];
        if (e) loadTemplate(e.data);
      });
    });

    // ── Пользовательские шаблоны ────────────────────────────────
    _loadCustomTpl();          // мгновенно из localStorage
    _renderCustomTpls();
    _loadCustomTplFromDisk();  // и догружаем с диска (async, перерисует сам)

    const saveTplBtn  = document.getElementById("ur-save-tpl");
    const saveTplForm = document.getElementById("ur-save-tpl-form");
    const tplNameInp  = document.getElementById("ur-tpl-name");
    const tplNameOk   = document.getElementById("ur-tpl-name-ok");
    const tplNameCancel = document.getElementById("ur-tpl-name-cancel");

    saveTplBtn.addEventListener("click", () => {
      if (!Object.keys(templateObj).length) {
        _notify(T("loadTemplateFirst","Сначала загрузите шаблон"), "warning"); return;
      }
      saveTplForm.style.display = "flex";
      tplNameInp.value = "";
      tplNameInp.focus();
    });
    const _doSaveTpl = () => {
      const label = (tplNameInp.value || "").trim();
      if (!label) { tplNameInp.focus(); return; }
      const id = "u_" + Date.now();
      _customTemplates[id] = { label, data: JSON.parse(JSON.stringify(templateObj)) };
      _saveCustomTpl();
      _renderCustomTpls();
      saveTplForm.style.display = "none";
      _notify(T("savedTemplate","Шаблон сохранён: ") + label, "success");
    };
    tplNameOk.addEventListener("click", _doSaveTpl);
    tplNameInp.addEventListener("keydown", e => {
      if (e.key === "Enter") _doSaveTpl();
      if (e.key === "Escape") { saveTplForm.style.display = "none"; }
    });
    tplNameCancel.addEventListener("click", () => { saveTplForm.style.display = "none"; });

    document.getElementById("ur-load-body").addEventListener("click", loadFromBody);
    document.getElementById("ur-load-file").addEventListener("click", () => document.getElementById("ur-file-input").click());
    document.getElementById("ur-file-input").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => {
        try { loadTemplate(JSON.parse(ev.target.result)); }
        catch (err) { App.showAlert(T("errBadJson") + " " + err.message); }
      };
      r.readAsText(f); e.target.value = "";
    });

    document.getElementById("ur-all").addEventListener("click", () => _toggleAll(true));
    document.getElementById("ur-none").addEventListener("click", () => _toggleAll(false));
    document.getElementById("ur-generate").addEventListener("click", generate);
    document.getElementById("ur-copy").addEventListener("click", () => {
      if (!lastGenerated) { _notify(T("generateFirst"), "warning"); return; }
      navigator.clipboard.writeText(lastGenerated);
      _notify(T("copied"), "success");
    });
    document.getElementById("ur-insert").addEventListener("click", () => {
      if (!lastGenerated) { _notify(T("generateFirst"), "warning"); return; }
      _setBody(lastGenerated);
    });
    document.getElementById("ur-as-vars").addEventListener("click", insertAsVariables);
    document.getElementById("ur-fuzz").addEventListener("click", fuzzOneField);
  }

  /**
   * Испортить ОДНО случайное поле, остальные оставить валидными.
   * Так видно, на какое именно поле API реагирует неправильно —
   * если испортить всё сразу, причина ошибки будет неясна.
   */
  /**
   * Подобрать атаки под поле.
   * Со схемой они точечные: нарушить enum, выйти за minimum, убрать
   * обязательное поле. Без схемы — общий набор.
   */
  function _attacksFor(fc) {
    const all = Object.keys(GEN).filter(k => GEN[k].group === "invalid");
    const m = fc.meta;
    if (!m) {
      // Без схемы исключаем атаки, которым нужны её ограничения
      return all.filter(k => !["badNotInEnum", "badBelowMin", "badAboveMax",
                               "badTooShort", "badOverMaxLen"].includes(k));
    }

    const targeted = [];
    if (m.required) targeted.push("badMissing", "badNull", "badEmpty");
    if (m.enum && m.enum.length) targeted.push("badNotInEnum");
    if (m.minimum !== null && m.minimum !== undefined) targeted.push("badBelowMin");
    if (m.maximum !== null && m.maximum !== undefined) targeted.push("badAboveMax");
    if (m.minLength !== null && m.minLength !== undefined) targeted.push("badTooShort");
    if (m.maxLength !== null && m.maxLength !== undefined) targeted.push("badOverMaxLen");
    if (m.format) targeted.push("badFormat");
    if (m.type === "integer" || m.type === "number") targeted.push("badWrongType", "badNegative");
    if (m.type === "string") targeted.push("badWrongType", "badSql", "badXss", "badUnicode");

    return targeted.length ? targeted : all;
  }

  function fuzzOneField() {
    if (!fieldConfigs.length) { App.showAlert(T("loadTemplateFirst")); return; }

    const active = fieldConfigs.filter(f => f.checked);
    if (!active.length) { _notify(T("noFieldsSelected"), "warning"); return; }

    const victim = pick(active);
    const attack = pick(_attacksFor(victim));

    // Остальные поля — валидные значения по автоподбору
    fieldConfigs.forEach(f => {
      if (!f.checked) return;
      f.genType = (f === victim) ? attack : detectType(f.key, f.originalValue);
    });

    renderFields();
    generate().then(() => {
      _notify(`${T("fuzzed")}: ${victim.path} → ${GEN[attack].label}`, "warning");
    });
  }

  // ============================================================
  // ЗАГРУЗКА ШАБЛОНА
  // ============================================================
  async function loadFromBody() {
    let raw = "";
    let schema = null;

    if (_isRandomizerWindow()) {
      // Отдельное окно: тело берём из главного окна через мост
      if (!window.pywebview?.api?.get_main_body) {
        App.showAlert(T("mainWindowNotFound"));
        return;
      }
      try {
        raw = (await window.pywebview.api.get_main_body()) || "";
      } catch (e) {
        App.showAlert(T("mainWindowNotFound"));
        App.logWarn && App.logWarn("Randomizer", "get_main_body: " + e.message);
        return;
      }
      if (!raw.trim()) { App.showAlert(T("bodyEmptyMain")); return; }
    } else {
      const tab = _findRequestTab();
      if (!tab) { App.showAlert(T("noRequestTab")); return; }
      const ta = document.getElementById("body-textarea");
      raw = ta ? ta.value : (tab.body || "");
      if (!raw.trim()) { App.showAlert(T("bodyEmpty")); return; }
      schema = tab.schema || null;   // если запрос пришёл из Swagger
    }

    try {
      loadTemplate(JSON.parse(raw), schema);
      if (schema) _notify(`${T("schemaLoaded")}: ${schema.fields.length}`, "success");
    } catch (e) {
      App.showAlert(T("errBadJson") + " " + e.message);
    }
  }

  /**
   * @param obj    шаблон JSON
   * @param schema {fields:[...]} из Swagger — необязательно
   */
  function loadTemplate(obj, schema) {
    templateObj = JSON.parse(JSON.stringify(obj));

    // Раскладываем метаданные схемы по путям для быстрого поиска
    schemaFields = null;
    if (schema && Array.isArray(schema.fields) && schema.fields.length) {
      schemaFields = {};
      schema.fields.forEach(f => { schemaFields[f.path] = f; });
    }

    fieldConfigs = [];
    _parse(templateObj, "");
    lastGenerated = null;
    _openOptsIdx = -1;
    renderFields();
    const pw = document.getElementById("ur-preview-wrap");
    if (pw) pw.style.display = "none";
  }

  function _parse(obj, prefix) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        _parse(val, path);
      } else {
        // Если запрос пришёл из Swagger — тип берём из схемы,
        // а не угадываем по имени поля.
        const meta = schemaFields ? schemaFields[path] : null;

        fieldConfigs.push({
          path, key, originalValue: val, checked: true,
          genType: meta ? typeFromSchema(meta, key, val) : detectType(key, val),
          meta,   // required, enum, minimum, maximum, minLength...
          opts: { charType: "mixed", length: 12, listName: "", count: 1, separator: " ", values: [],
                  longLen: 10000 },
        });
      }
    }
  }

  /** Генератор по метаданным схемы — точнее, чем догадки по названию */
  function typeFromSchema(m, key, val) {
    // enum — берём строго из списка допустимых значений
    if (Array.isArray(m.enum) && m.enum.length) return "enumValue";

    const f = (m.format || "").toLowerCase();
    if (f === "email") return "email";
    if (f === "uuid" || f === "guid") return "uuid";
    if (f === "date") return "date";
    if (f === "date-time") return "date";
    if (f === "uri" || f === "url") return "url";
    if (f === "password") return "password";
    if (f === "hostname") return "url";

    switch (m.type) {
      case "integer": return "number";
      case "number":  return "float";
      case "boolean": return "bool";
      case "string":  return detectType(key, val);   // формата нет — смотрим на имя
      default:        return detectType(key, val);
    }
  }

  // ============================================================
  // РЕНДЕР ПОЛЕЙ
  // ============================================================
  function renderFields() {
    const box = document.getElementById("ur-fields");
    if (!box) return;

    if (!fieldConfigs.length) {
      box.innerHTML = `<div class="ur-empty">${T("noFields")}</div>`;
      return;
    }

    // Выпадашка с группировкой
    const grouped = {};
    Object.entries(GEN).forEach(([k, g]) => { (grouped[g.group] = grouped[g.group] || []).push([k, g]); });
    const options = Object.entries(grouped).map(([g, items]) =>
      `<optgroup label="${escapeHtml(GROUPS[g] || g)}">` +
      items.map(([k, g2]) => `<option value="${k}">${escapeHtml(g2.label)}</option>`).join("") +
      `</optgroup>`).join("");

    box.innerHTML = fieldConfigs.map((fc, i) => {
      const dv = fc.originalValue === null ? "null"
        : typeof fc.originalValue === "string" ? `"${truncate(fc.originalValue, 18)}"`
        : String(fc.originalValue);
      const hasOpts = !!GEN[fc.genType]?.opts;
      const isInvalid = GEN[fc.genType]?.group === "invalid";

      return `
        <div class="ur-field${fc.checked ? "" : " ur-off"}${isInvalid ? " ur-invalid" : ""}" data-idx="${i}">
          <div class="ur-field-row">
            <input type="checkbox" class="ur-check" data-idx="${i}" ${fc.checked ? "checked" : ""}>
            <span class="ur-path" title="${escapeHtml(_fieldTitle(fc))}">${escapeHtml(fc.path)}${
              fc.meta && fc.meta.required ? '<span class="ur-req" title="required">*</span>' : ""
            }</span>
            <span class="ur-orig">${escapeHtml(dv)}</span>
            <select class="ur-gen" data-idx="${i}">${options}</select>
            <button class="ur-opts-btn${hasOpts ? "" : " ur-hidden"}" data-idx="${i}" title="${T("genOptions")}">
              <i class="bi bi-sliders"></i>
            </button>
          </div>
          <div class="ur-opts" data-idx="${i}" style="display:${_openOptsIdx === i ? "block" : "none"}">
            ${_optsHTML(fc, i)}
          </div>
        </div>`;
    }).join("");

    // Значения select'ов
    box.querySelectorAll(".ur-gen").forEach(sel => {
      sel.value = fieldConfigs[+sel.dataset.idx].genType;
      sel.addEventListener("change", (e) => {
        const i = +e.target.dataset.idx;
        fieldConfigs[i].genType = e.target.value;
        _openOptsIdx = GEN[e.target.value]?.opts ? i : -1;   // сразу раскрываем настройки
        renderFields();
      });
    });

    box.querySelectorAll(".ur-check").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const i = +e.target.dataset.idx;
        fieldConfigs[i].checked = e.target.checked;
        e.target.closest(".ur-field").classList.toggle("ur-off", !e.target.checked);
      });
    });

    box.querySelectorAll(".ur-opts-btn").forEach(b => {
      b.addEventListener("click", () => {
        const i = +b.dataset.idx;
        _openOptsIdx = _openOptsIdx === i ? -1 : i;
        renderFields();
      });
    });

    _wireOpts(box);
    _fillDictSelects();
  }

  /** Подсказка при наведении: что известно о поле из схемы */
  function _fieldTitle(fc) {
    if (!fc.meta) return fc.path;
    const m = fc.meta;
    const bits = [fc.path, `тип: ${m.type}${m.format ? " / " + m.format : ""}`];
    if (m.required) bits.push("обязательное");
    if (m.enum) bits.push(`enum: ${m.enum.join(", ")}`);
    if (m.minimum !== null) bits.push(`min: ${m.minimum}`);
    if (m.maximum !== null) bits.push(`max: ${m.maximum}`);
    if (m.minLength !== null) bits.push(`minLength: ${m.minLength}`);
    if (m.maxLength !== null) bits.push(`maxLength: ${m.maxLength}`);
    if (m.description) bits.push(m.description);
    return bits.join("\n");
  }

  /** Настройки конкретного генератора */
  function _optsHTML(fc, i) {
    const kind = GEN[fc.genType]?.opts;
    if (!kind) return "";

    if (kind === "chars") {
      return `
        <div class="ur-opts-grid">
          <label>${T("charType")}
            <select class="ur-o-chartype" data-idx="${i}">
              <option value="text">${T("csText")}</option>
              <option value="numbers">${T("csNumbers")}</option>
              <option value="symbols">${T("csSymbols")}</option>
              <option value="alphanumeric">${T("csAlnum")}</option>
              <option value="mixed">${T("csMixed")}</option>
            </select>
          </label>
          <label>${T("length")}
            <input type="number" class="ur-o-length" data-idx="${i}" min="1" max="500" value="${fc.opts.length}">
          </label>
        </div>`;
    }

    if (kind === "dict") {
      const avail = wordLists.length;
      return `
        <div class="ur-opts-grid">
          <label>${T("wordList")}
            <select class="ur-o-list" data-idx="${i}">
              <option value="">${avail ? "—" : T("noListsAvailable")}</option>
            </select>
          </label>
          <label>${T("count")}
            <input type="number" class="ur-o-count" data-idx="${i}" min="1" max="20" value="${fc.opts.count}">
          </label>
          <label>${T("separator")}
            <input type="text" class="ur-o-sep" data-idx="${i}" value="${escapeHtml(fc.opts.separator)}">
          </label>
        </div>
        ${avail ? "" : `<div class="ur-opts-warn">${T("dictNeedsBackend")}</div>`}`;
    }

    if (kind === "list") {
      return `
        <label class="ur-opts-full">${T("ownValues")}
          <textarea class="ur-o-values" data-idx="${i}" rows="3"
            placeholder="${T("onePerLine")}">${escapeHtml((fc.opts.values || []).join("\n"))}</textarea>
        </label>`;
    }

    if (kind === "long") {
      return `
        <div class="ur-opts-grid">
          <label>${T("strLength")}
            <input type="number" class="ur-o-longlen" data-idx="${i}" min="1" max="1000000"
                   value="${fc.opts.longLen || 10000}">
          </label>
        </div>`;
    }
    return "";
  }

  function _wireOpts(box) {
    const set = (sel, prop, cast) => box.querySelectorAll(sel).forEach(el => {
      el.addEventListener("change", (e) => {
        const fc = fieldConfigs[+e.target.dataset.idx];
        fc.opts[prop] = cast ? cast(e.target.value) : e.target.value;
      });
    });
    set(".ur-o-chartype", "charType");
    set(".ur-o-length", "length", v => Math.max(1, Math.min(500, +v || 12)));
    set(".ur-o-list", "listName");
    set(".ur-o-count", "count", v => Math.max(1, Math.min(20, +v || 1)));
    set(".ur-o-sep", "separator");
    set(".ur-o-longlen", "longLen", v => Math.max(1, Math.min(1000000, +v || 10000)));
    box.querySelectorAll(".ur-o-values").forEach(el => {
      el.addEventListener("change", (e) => {
        const fc = fieldConfigs[+e.target.dataset.idx];
        fc.opts.values = e.target.value.split("\n").map(s => s.trim()).filter(Boolean);
      });
    });
  }

  function _fillDictSelects() {
    document.querySelectorAll(".ur-root .ur-o-list").forEach(sel => {
      const fc = fieldConfigs[+sel.dataset.idx];
      while (sel.options.length > 1) sel.remove(1);
      wordLists.forEach(l => {
        const o = document.createElement("option");
        o.value = l; o.textContent = l;
        sel.appendChild(o);
      });
      if (fc && fc.opts.listName) sel.value = fc.opts.listName;
    });
  }

  function _toggleAll(state) {
    fieldConfigs.forEach(f => f.checked = state);
    renderFields();
  }

  // ============================================================
  // СЛОВАРИ С СЕРВЕРА
  // ============================================================
  async function _loadWordLists() {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 3000);
      const r = await fetch(`${apiBase()}/randomize/lists`, { signal: c.signal });
      clearTimeout(t);
      const d = await r.json();
      wordLists = d.lists || [];
      _fillDictSelects();
    } catch (_) {
      wordLists = [];   // бэкенда нет — остальные генераторы работают как обычно
    }
  }

  async function _genFromDict(fc) {
    if (!fc.opts.listName) return fc.originalValue;
    try {
      const p = new URLSearchParams({
        list_name: fc.opts.listName,
        count: fc.opts.count || 1,
        separator: fc.opts.separator || "",
        error_probability: 0,
      });
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 5000);
      const r = await fetch(`${apiBase()}/randomize/type2?${p}`, { method: "POST", signal: c.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      return d.value ?? fc.originalValue;
    } catch (e) {
      App.logWarn && App.logWarn("Randomizer", `Словарь ${fc.opts.listName}: ${e.message}`);
      return fc.originalValue;
    }
  }

  // ============================================================
  // ГЕНЕРАЦИЯ
  // ============================================================
  async function generate() {
    if (!fieldConfigs.length) { App.showAlert(T("loadTemplateFirst")); return; }

    const result = JSON.parse(JSON.stringify(templateObj));
    const btn = document.getElementById("ur-generate");
    if (btn) btn.disabled = true;

    try {
      for (const fc of fieldConfigs) {
        if (!fc.checked) continue;
        const g = GEN[fc.genType];
        if (!g) continue;

        // «Убрать поле» — удаляем из объекта целиком
        if (g.remove) { _removePath(result, fc.path); continue; }

        let v;
        if (fc.genType === "dict") v = await _genFromDict(fc);
        else v = g.fn(fc);

        // Приведение типа делаем ТОЛЬКО для валидных генераторов —
        // невалидные специально ломают тип, и чинить их нельзя.
        const isInvalid = g.group === "invalid";
        if (!isInvalid && typeof fc.originalValue === "number" && typeof v === "string") {
          const n = Number(v);
          if (!isNaN(n)) v = n;
        }
        _setPath(result, fc.path, v);
      }
      lastGenerated = JSON.stringify(result, null, 2);
      _showPreview();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** Вставить шаблон с {{$переменными}} вместо конкретных значений */
  function insertAsVariables() {
    if (!fieldConfigs.length) { App.showAlert(T("loadTemplateFirst")); return; }

    const result = JSON.parse(JSON.stringify(templateObj));
    let converted = 0, skipped = 0;

    fieldConfigs.forEach(fc => {
      if (!fc.checked) return;
      const dyn = GEN[fc.genType]?.dyn;
      if (!dyn) { skipped++; return; }        // у chars/dict/list нет аналога-переменной
      _setPath(result, fc.path, `{{$${dyn}}}`);
      converted++;
    });

    if (!converted) { _notify(T("noVarEquivalent"), "warning"); return; }

    // Числовые поля: убираем кавычки, чтобы JSON остался валидным после подстановки
    let json = JSON.stringify(result, null, 2)
      .replace(/"(\{\{\$random(?:Int|Price|Float|Percent|Boolean|Timestamp|BigInt|Age)\}\})"/g, "$1");

    lastGenerated = json;
    _showPreview();
    _setBody(json);
    _notify(`${T("insertedAsVars")}: ${converted}` + (skipped ? ` (${skipped} ${T("skipped")})` : ""), "success");
  }

  function _setPath(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) { cur = cur[keys[i]]; if (!cur) return; }
    cur[keys[keys.length - 1]] = value;
  }

  /** Удалить поле по пути — для генератора «Убрать поле» */
  function _removePath(obj, path) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) { cur = cur[keys[i]]; if (!cur) return; }
    delete cur[keys[keys.length - 1]];
  }

  function _showPreview() {
    const w = document.getElementById("ur-preview-wrap");
    const p = document.getElementById("ur-preview");
    if (!w || !p) return;
    w.style.display = "block";
    p.textContent = lastGenerated;
  }

  // ============================================================
  // УВЕДОМЛЕНИЯ
  // ============================================================
  function _notify(msg, type) {
    const c = document.getElementById("ur-notification");
    if (!c) return;
    const color = type === "danger" ? "#dc3545" : type === "warning" ? "#ffc107" : "var(--accent)";
    c.innerHTML = `<div style="border-left:3px solid ${color};">${escapeHtml(msg)}</div>`;
    clearTimeout(c._t);
    c._t = setTimeout(() => { c.innerHTML = ""; }, 2600);
  }

  // ============================================================
  // ПЕРЕТАСКИВАНИЕ / БЛОКИРОВКА / СВОРАЧИВАНИЕ
  // ============================================================
  function _makeDraggable() {
    const h = document.getElementById("ur-header");
    const p = document.getElementById("unified-rand-panel");
    let ox = 0, oy = 0;
    h.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || isLocked) return;
      ox = e.clientX - p.offsetLeft; oy = e.clientY - p.offsetTop;
      const mv = (ev) => { p.style.left = (ev.clientX - ox) + "px"; p.style.top = (ev.clientY - oy) + "px"; p.style.right = "auto"; p.style.bottom = "auto"; };
      const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", mv);
      document.addEventListener("mouseup", up);
    });
  }

  function _toggleLock() {
    isLocked = !isLocked;
    const p = document.getElementById("unified-rand-panel");
    const h = document.getElementById("ur-header");
    const b = document.getElementById("ur-lock");
    p.style.resize = (isLocked || isCollapsed) ? "none" : "both";
    h.style.cursor = isLocked ? "default" : "move";
    b.innerHTML = `<i class="bi bi-${isLocked ? "lock" : "unlock"}"></i>`;
    b.style.color = isLocked ? "var(--accent)" : "";
  }

  function _toggleCollapse() {
    const p = document.getElementById("unified-rand-panel");
    const b = document.getElementById("ur-body");
    const btn = document.getElementById("ur-collapse");
    if (!p || !b) return;

    if (!isCollapsed) {
      _savedSize = { width: p.style.width, height: p.style.height, minHeight: p.style.minHeight };
      b.style.display = "none";
      p.style.resize = "none"; p.style.minHeight = "0"; p.style.height = "auto";
      btn.innerHTML = '<i class="bi bi-chevron-down"></i>';
    } else {
      b.style.display = "flex";
      p.style.minHeight = _savedSize?.minHeight || "340px";
      p.style.width = _savedSize?.width || "";
      p.style.height = _savedSize?.height || "";
      p.style.resize = isLocked ? "none" : "both";
      btn.innerHTML = '<i class="bi bi-chevron-up"></i>';
    }
    isCollapsed = !isCollapsed;
  }

  // ============================================================
  // ОТКРЫТИЕ
  // ============================================================
  function open(page) {
    const mode = (App.getSetting && App.getSetting("randomizerMode")) || "floating";
    if (mode === "window") openWindow(); else showFloating();
  }

  function openWindow() {
    if (window.pywebview?.api?.open_randomizer_window) window.pywebview.api.open_randomizer_window();
    else showFloating();
  }

  function openTab() {
    const ex = App.state.tabs.find(t => t.method === "RANDOMIZER");
    if (ex) { App.selectTab(ex.id); return; }
    App.addTab({ method: "RANDOMIZER", title: "🎲 Randomizer" });
  }

  function showFloating() {
    createPanel();
    document.getElementById("unified-rand-panel").style.display = "flex";
    isVisible = true;
  }

  function hide() {
    const p = document.getElementById("unified-rand-panel");
    if (p) p.style.display = "none";
    isVisible = false;
  }

  function toggle() { isVisible ? hide() : open(); }

  return {
    show: open, open, hide, toggle, openWindow, openTab, mountInTab, showFloating,
    setBody: _setBody,
    getRequestBody: () => { const t = _findRequestTab(); return t ? (t.body || "") : ""; },
    insertText: (txt) => _setBody(txt),
  };
})();

// ============================================================
// МОСТЫ МЕЖДУ ОКНАМИ
// ============================================================
window.insertIntoActiveBody = (t) => UnifiedRandomizer.insertText(t);
window.setActiveBody = (j) => UnifiedRandomizer.setBody(j);
window.getActiveBody = () => UnifiedRandomizer.getRequestBody();

window.loadRandomizerWindow = function () {
  if (window._randomizerWindowReady) return;
  window._randomizerWindowReady = true;

  // Помечаем окно ЗДЕСЬ: эта функция вызывается и из Python (on_loaded),
  // и из detectWindowKind — что бы ни сработало первым, режим выставится.
  App.WINDOW_KIND = "randomizer";
  App.state.isDetachedWindow = true;

  // Прячем всё лишнее — окно целиком отдано рандомайзеру
  document.getElementById("app-root")?.classList.add("sidebar-collapsed");
  ["app-navbar", "tab-bar", "sidebar"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const sr = document.getElementById("sidebar-resize-handle");
  if (sr) sr.style.display = "none";

  App.state.tabs = [];
  const tab = App.createTab({ method: "RANDOMIZER", title: "🎲 Randomizer" });
  App.state.tabs.push(tab);
  App.state.activeTabId = tab.id;
  App.renderTabContent();
};

// Совместимость со старыми именами
const Randomizer = { show: () => UnifiedRandomizer.open(), hide: () => UnifiedRandomizer.hide(), toggle: () => UnifiedRandomizer.toggle() };
const RandomizerV2 = { show: () => UnifiedRandomizer.open(), hide: () => UnifiedRandomizer.hide() };
