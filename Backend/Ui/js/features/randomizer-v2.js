/**
 * Advanced Randomizer v2 — Template-Based
 *
 * Система:
 * 1. Берёт текущий Body (JSON) из активной вкладки ИЛИ вставляет пример
 * 2. Показывает все поля с галочками — что рандомизировать
 * 3. Для каждого поля можно выбрать тип генерации (auto / text / email / из списка / etc.)
 * 4. Кнопка "Generate" — заменяет ТОЛЬКО отмеченные поля, остальные не трогает
 * 5. Результат вставляется обратно в Body как валидный JSON
 */

const RandomizerV2 = (() => {
  let templateObj = {};     // Parsed template JSON
  let fieldConfigs = [];    // [{path, key, originalValue, checked, genType, customList}]
  let lastGenerated = null; // Last generated JSON string

  // ============================================================
  // EXAMPLE TEMPLATES — показываем пользователю как должен выглядеть JSON
  // ============================================================
  const EXAMPLES = {
    user: {
      label: "👤 User",
      data: {
        name: "John Doe",
        username: "johnd",
        email: "john@example.com",
        phone: "1-234-567-8900",
        website: "johndoe.com",
        company: {
          name: "Acme Corp",
          catchPhrase: "Multi-layered solution"
        }
      }
    },
    product: {
      label: "📦 Product",
      data: {
        title: "Wireless Mouse",
        price: 29.99,
        category: "electronics",
        description: "Ergonomic wireless mouse with USB receiver",
        inStock: true,
        rating: 4.5
      }
    },
    order: {
      label: "🛒 Order",
      data: {
        orderId: 10001,
        customer: "Jane Smith",
        email: "jane@mail.com",
        total: 159.90,
        status: "pending",
        items: 3,
        shipping: {
          city: "Moscow",
          zip: "101000",
          address: "Red Square 1"
        }
      }
    },
    auth: {
      label: "🔐 Auth",
      data: {
        username: "testuser",
        password: "qwerty123",
        email: "test@example.com",
        rememberMe: false
      }
    }
  };

  // ============================================================
  // GENERATORS — smart per-type
  // ============================================================
  const GEN_TYPES = {
    auto:     { label: "Auto",          fn: autoGenerate },
    text:     { label: "Текст",         fn: () => randomString(8) },
    name:     { label: "Имя",           fn: () => pickRandom(NAMES) },
    email:    { label: "Email",         fn: () => `${randomString(6)}@${pickRandom(["gmail.com","mail.com","test.com","example.com"])}` },
    phone:    { label: "Телефон",       fn: () => `+7-${rndDigits(3)}-${rndDigits(3)}-${rndDigits(4)}` },
    url:      { label: "URL",           fn: () => `https://${randomString(6)}.${pickRandom(["com","org","io","dev"])}` },
    number:   { label: "Число",         fn: () => Math.floor(Math.random() * 10000) },
    float:    { label: "Дробное",       fn: () => +(Math.random() * 1000).toFixed(2) },
    bool:     { label: "true/false",    fn: () => Math.random() > 0.5 },
    uuid:     { label: "UUID",          fn: generateUUID },
    lorem:    { label: "Lorem",         fn: () => pickRandom(LOREM_SENTENCES) },
    city:     { label: "Город",         fn: () => pickRandom(CITIES) },
    status:   { label: "Статус",        fn: () => pickRandom(["active","inactive","pending","approved","rejected","cancelled"]) },
    password: { label: "Пароль",        fn: () => randomMixedString(12) },
    date:     { label: "Дата",          fn: () => randomDate() },
    custom:   { label: "📋 Из списка...", fn: null }, // special — uses field's customList
  };

  const NAMES = [
    "John Doe", "Jane Smith", "Alice Johnson", "Bob Williams", "Charlie Brown",
    "Diana Prince", "Edward Norton", "Fiona Apple", "George Lucas", "Helen Troy",
    "Ivan Petrov", "Julia Roberts", "Kevin Hart", "Laura Palmer", "Olga Smirnova",
    "Dmitry Ivanov", "Elena Volkova", "Sergey Kozlov", "Anna Petrova", "Max Fischer",
  ];

  const CITIES = [
    "Moscow", "London", "New York", "Berlin", "Tokyo", "Paris",
    "Sydney", "Toronto", "Dubai", "Singapore", "Rome", "Istanbul",
  ];

  const LOREM_SENTENCES = [
    "Lorem ipsum dolor sit amet",
    "Consectetur adipiscing elit",
    "Sed do eiusmod tempor incididunt",
    "Ut labore et dolore magna aliqua",
    "Duis aute irure dolor in reprehenderit",
    "Excepteur sint occaecat cupidatat non proident",
  ];

  // ============================================================
  // HELPERS
  // ============================================================
  function randomString(len) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let r = "";
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }

  function randomMixedString(len) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let r = "";
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }

  function rndDigits(n) {
    let r = "";
    for (let i = 0; i < n; i++) r += Math.floor(Math.random() * 10);
    return r;
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function randomDate() {
    const d = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000));
    return d.toISOString().split("T")[0];
  }

  /** Auto-detect type from field key and original value */
  function autoGenerate(key, value) {
    const k = (key || "").toLowerCase();
    if (k.includes("email"))    return GEN_TYPES.email.fn();
    if (k.includes("password") || k.includes("pass")) return GEN_TYPES.password.fn();
    if (k.includes("phone") || k.includes("tel"))     return GEN_TYPES.phone.fn();
    if (k.includes("url") || k.includes("website") || k.includes("site")) return GEN_TYPES.url.fn();
    if (k.includes("city"))     return GEN_TYPES.city.fn();
    if (k.includes("status") || k === "state") return GEN_TYPES.status.fn();
    if (k.includes("date") || k.includes("created") || k.includes("updated")) return GEN_TYPES.date.fn();
    if (k.includes("name") || k.includes("username") || k.includes("customer")) return GEN_TYPES.name.fn();
    if (k.includes("uuid") || k.includes("guid")) return GEN_TYPES.uuid.fn();
    if (k.includes("description") || k.includes("catchphrase") || k.includes("bio")) return GEN_TYPES.lorem.fn();
    if (k.includes("zip") || k.includes("code")) return rndDigits(6);
    if (k.includes("address"))  return `${pickRandom(CITIES)}, ${randomString(6)} st. ${Math.floor(Math.random()*200)+1}`;
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rating")) return GEN_TYPES.float.fn();
    if (k.includes("id") && typeof value === "number") return Math.floor(Math.random() * 100000);
    if (typeof value === "number" && !Number.isInteger(value)) return GEN_TYPES.float.fn();
    if (typeof value === "number") return GEN_TYPES.number.fn();
    if (typeof value === "boolean") return GEN_TYPES.bool.fn();
    return GEN_TYPES.text.fn();
  }

  function truncate(str, max) {
    return str.length > max ? str.substring(0, max) + "..." : str;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  // ============================================================
  // PANEL UI
  // ============================================================
  function createPanel() {
    let panel = document.getElementById("randomizer-v2-panel");
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "randomizer-v2-panel";
    panel.className = "randomizer-v2-panel";

    // Build example buttons HTML
    const exampleBtns = Object.entries(EXAMPLES)
      .map(([k, v]) => `<button class="rv2-example-btn randomizer-btn" data-example="${k}" style="font-size:11px;padding:3px 8px;">${v.label}</button>`)
      .join("");

    panel.innerHTML = `
      <div class="randomizer-v2-header">
        <div class="randomizer-v2-title">
          <span>🎲</span> Template Randomizer
        </div>
        <div class="randomizer-v2-controls">
          <button id="rv2-collapse" class="randomizer-btn" title="Свернуть">
            <i class="bi bi-chevron-up"></i>
          </button>
          <button id="rv2-close" class="randomizer-btn" title="Закрыть">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>

      <div class="randomizer-v2-content">
        <!-- EXAMPLES ROW -->
        <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
          <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Примеры шаблонов:</label>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${exampleBtns}
          </div>
        </div>

        <!-- TOP: Load / Select controls -->
        <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);display:flex;gap:6px;flex-shrink:0;align-items:center;">
          <button id="rv2-load-body" class="randomizer-btn-primary" style="flex:1;font-size:12px;">
            📥 Из Body
          </button>
          <button id="rv2-load-file" class="randomizer-btn" style="font-size:11px;" title="Загрузить JSON шаблон из файла">
            📁 Файл
          </button>
          <input type="file" id="rv2-file-input" accept=".json,.txt" style="display:none;">
          <span style="color:var(--border-color);font-size:14px;">|</span>
          <button id="rv2-select-all" class="randomizer-btn" style="font-size:11px;" title="Выбрать все">☑</button>
          <button id="rv2-deselect-all" class="randomizer-btn" style="font-size:11px;" title="Снять все">☐</button>
        </div>

        <!-- FIELDS LIST -->
        <div id="rv2-fields" class="randomizer-v2-tab-content active" style="padding:8px 12px;overflow-y:auto;flex:1;max-height:350px;">
          <div style="color:var(--text-dim);text-align:center;padding:16px 0;font-size:12px;">
            <p style="margin:0 0 8px;">Выбери пример шаблона выше или нажми <strong>"Из Body"</strong></p>
            <p style="margin:0;font-size:11px;color:var(--text-dim);">
              Формат: обычный JSON объект, например:<br>
              <code style="color:var(--accent);font-size:11px;">{"name": "John", "email": "j@mail.com", "age": 25}</code>
            </p>
          </div>
        </div>

        <!-- CUSTOM LIST EDITOR (hidden by default) -->
        <div id="rv2-custom-editor" style="padding:8px 12px;border-top:1px solid var(--border-color);display:none;">
          <label style="font-size:11px;color:var(--accent);font-weight:600;">
            Свои значения для поля <strong id="rv2-custom-field-name"></strong>:
          </label>
          <textarea id="rv2-custom-values" class="randomizer-input" rows="3"
            style="width:100%;margin-top:4px;font-size:11px;"
            placeholder="По одному на строку:&#10;значение 1&#10;значение 2&#10;значение 3"></textarea>
          <div style="display:flex;gap:6px;margin-top:4px;">
            <button id="rv2-custom-save" class="randomizer-btn-primary" style="font-size:11px;">✓ Сохранить список</button>
            <button id="rv2-custom-cancel" class="randomizer-btn" style="font-size:11px;">Отмена</button>
          </div>
        </div>

        <!-- PREVIEW -->
        <div id="rv2-preview-wrap" style="padding:8px 12px;border-top:1px solid var(--border-color);max-height:180px;overflow-y:auto;display:none;">
          <label style="font-size:11px;color:var(--accent);font-weight:600;">Результат:</label>
          <pre id="rv2-preview" style="background:var(--bg-app);color:var(--accent);padding:8px;border-radius:4px;font-size:11px;margin:4px 0 0;max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;"></pre>
        </div>

        <!-- ACTIONS -->
        <div style="padding:10px 12px;border-top:1px solid var(--border-color);display:flex;gap:6px;flex-shrink:0;">
          <button id="rv2-generate" class="randomizer-btn-primary" style="flex:2;">
            🎲 Сгенерировать
          </button>
          <button id="rv2-copy" class="randomizer-btn" style="flex:1;" title="Скопировать JSON">
            📋 Copy
          </button>
          <button id="rv2-insert" class="randomizer-btn-primary" style="flex:1;" title="Вставить в Body">
            ⬇ Insert
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    attachEventListeners();
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  let _editingCustomIdx = -1; // which field's custom list we're editing

  function attachEventListeners() {
    document.getElementById("rv2-close").addEventListener("click", () => RandomizerV2.hide());
    document.getElementById("rv2-collapse").addEventListener("click", () => {
      const c = document.querySelector(".randomizer-v2-content");
      c.style.display = c.style.display === "none" ? "flex" : "none";
    });

    // Examples
    document.querySelectorAll(".rv2-example-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.example;
        const ex = EXAMPLES[key];
        if (!ex) return;
        loadTemplate(ex.data);
        // Also put into active tab body so user sees it
        _setActiveTabBody(JSON.stringify(ex.data, null, 2));
      });
    });

    document.getElementById("rv2-load-body").addEventListener("click", loadFromBody);

    // File load
    document.getElementById("rv2-load-file").addEventListener("click", () => {
      document.getElementById("rv2-file-input").click();
    });
    document.getElementById("rv2-file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          loadTemplate(data);
          _setActiveTabBody(JSON.stringify(data, null, 2));
        } catch (err) {
          alert("Файл не является валидным JSON!\n" + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = ""; // reset so same file can be loaded again
    });

    document.getElementById("rv2-select-all").addEventListener("click", () => toggleAll(true));
    document.getElementById("rv2-deselect-all").addEventListener("click", () => toggleAll(false));
    document.getElementById("rv2-generate").addEventListener("click", generate);
    document.getElementById("rv2-copy").addEventListener("click", copyResult);
    document.getElementById("rv2-insert").addEventListener("click", insertResult);

    // Custom list editor
    document.getElementById("rv2-custom-save").addEventListener("click", saveCustomList);
    document.getElementById("rv2-custom-cancel").addEventListener("click", hideCustomEditor);
  }

  // ============================================================
  // SET ACTIVE TAB BODY (helper)
  // ============================================================
  function _setActiveTabBody(json) {
    const tab = App.getActiveTab();
    if (!tab) return;
    if (!["POST", "PUT", "PATCH"].includes(tab.method)) tab.method = "POST";
    tab.body = json;
    tab.activeSubTab = "body";
    App.renderTabContent();
  }

  // ============================================================
  // LOAD TEMPLATE
  // ============================================================
  function loadFromBody() {
    const tab = App.getActiveTab();
    if (!tab) { alert("Нет активной вкладки!"); return; }

    const textarea = document.getElementById("body-textarea");
    const raw = textarea ? textarea.value : (tab.body || "");

    if (!raw.trim()) {
      alert("Body пуст! Выбери пример шаблона или введи JSON в Body.");
      return;
    }

    try {
      const obj = JSON.parse(raw);
      loadTemplate(obj);
    } catch (e) {
      alert("Body не является валидным JSON!\n" + e.message);
    }
  }

  function loadTemplate(obj) {
    templateObj = JSON.parse(JSON.stringify(obj)); // deep clone
    fieldConfigs = [];
    parseFields(templateObj, "");
    renderFields();
    // Hide preview from previous run
    document.getElementById("rv2-preview-wrap").style.display = "none";
    hideCustomEditor();
    lastGenerated = null;
  }

  /** Recursively parse JSON object into flat field list */
  function parseFields(obj, prefix) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];

      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        parseFields(val, path);
      } else {
        // Detect best default gen type
        const detectedType = detectBestType(key, val);
        fieldConfigs.push({
          path,
          key,
          originalValue: val,
          checked: true,
          genType: detectedType,
          customList: [], // for "custom" type
        });
      }
    }
  }

  /** Detect the best generator type based on key name and value */
  function detectBestType(key, value) {
    const k = (key || "").toLowerCase();
    if (k.includes("email")) return "email";
    if (k.includes("password") || k.includes("pass")) return "password";
    if (k.includes("phone") || k.includes("tel")) return "phone";
    if (k.includes("url") || k.includes("website") || k.includes("site")) return "url";
    if (k.includes("city")) return "city";
    if (k.includes("status") || k === "state") return "status";
    if (k.includes("date") || k.includes("created") || k.includes("updated")) return "date";
    if (k.includes("name") || k.includes("username") || k.includes("customer")) return "name";
    if (k.includes("uuid") || k.includes("guid")) return "uuid";
    if (k.includes("description") || k.includes("catchphrase") || k.includes("bio")) return "lorem";
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rating")) return "float";
    if (typeof value === "number" && !Number.isInteger(value)) return "float";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "bool";
    return "text";
  }

  // ============================================================
  // RENDER FIELDS
  // ============================================================
  function renderFields() {
    const container = document.getElementById("rv2-fields");

    if (fieldConfigs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-dim);text-align:center;font-size:12px;">Нет полей</p>';
      return;
    }

    const genOptions = Object.entries(GEN_TYPES)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
      .join("");

    let html = "";
    fieldConfigs.forEach((fc, idx) => {
      const displayVal = fc.originalValue === null ? "null"
        : typeof fc.originalValue === "string" ? `"${truncate(fc.originalValue, 20)}"`
        : String(fc.originalValue);

      const customBadge = fc.genType === "custom" && fc.customList.length > 0
        ? `<span style="font-size:9px;color:var(--accent);margin-left:2px;">(${fc.customList.length})</span>`
        : "";

      html += `
        <div class="randomizer-gen-item" style="margin-bottom:4px;padding:6px 8px;">
          <label style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer;">
            <input type="checkbox" class="rv2-field-check" data-idx="${idx}" ${fc.checked ? "checked" : ""}>
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <strong>${escapeHtml(fc.path)}</strong>
              <span style="color:var(--text-dim);margin-left:4px;font-size:11px;">${escapeHtml(displayVal)}</span>
            </span>
          </label>
          <div style="display:flex;gap:3px;align-items:center;flex-shrink:0;">
            <select class="rv2-field-type" data-idx="${idx}" style="
              width:110px;
              padding:3px 4px;
              background:var(--bg-input);color:var(--text-main);
              border:1px solid var(--border-color);border-radius:3px;font-size:10px;
            ">${genOptions}</select>
            ${customBadge}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Wire checkboxes
    container.querySelectorAll(".rv2-field-check").forEach(cb => {
      cb.addEventListener("change", (e) => {
        fieldConfigs[+e.target.dataset.idx].checked = e.target.checked;
      });
    });

    // Wire gen-type selects
    container.querySelectorAll(".rv2-field-type").forEach(sel => {
      sel.value = fieldConfigs[+sel.dataset.idx].genType;
      sel.addEventListener("change", (e) => {
        const idx = +e.target.dataset.idx;
        fieldConfigs[idx].genType = e.target.value;
        // If "custom" selected — open custom list editor
        if (e.target.value === "custom") {
          openCustomEditor(idx);
        }
      });
    });
  }

  // ============================================================
  // CUSTOM LIST EDITOR
  // ============================================================
  function openCustomEditor(idx) {
    _editingCustomIdx = idx;
    const fc = fieldConfigs[idx];
    document.getElementById("rv2-custom-field-name").textContent = fc.path;
    document.getElementById("rv2-custom-values").value = fc.customList.join("\n");
    document.getElementById("rv2-custom-editor").style.display = "block";
    document.getElementById("rv2-custom-values").focus();
  }

  function saveCustomList() {
    if (_editingCustomIdx < 0) return;
    const raw = document.getElementById("rv2-custom-values").value;
    fieldConfigs[_editingCustomIdx].customList = raw.split("\n").map(s => s.trim()).filter(Boolean);
    hideCustomEditor();
    renderFields(); // re-render to show badge count
  }

  function hideCustomEditor() {
    _editingCustomIdx = -1;
    document.getElementById("rv2-custom-editor").style.display = "none";
  }

  // ============================================================
  // GENERATE
  // ============================================================
  function generate() {
    if (fieldConfigs.length === 0) {
      alert("Сначала загрузи шаблон!");
      return;
    }

    // Deep clone template
    const result = JSON.parse(JSON.stringify(templateObj));

    // Replace only checked fields
    fieldConfigs.forEach(fc => {
      if (!fc.checked) return;

      let newVal;
      if (fc.genType === "custom") {
        // Pick from user's custom list
        if (fc.customList.length > 0) {
          const picked = pickRandom(fc.customList);
          // Try to preserve type: if original was number and picked looks like number
          if (typeof fc.originalValue === "number") {
            const n = Number(picked);
            newVal = isNaN(n) ? picked : n;
          } else if (typeof fc.originalValue === "boolean") {
            newVal = picked.toLowerCase() === "true";
          } else {
            newVal = picked;
          }
        } else {
          newVal = fc.originalValue; // no list — keep original
        }
      } else if (fc.genType === "auto") {
        newVal = autoGenerate(fc.key, fc.originalValue);
      } else {
        newVal = GEN_TYPES[fc.genType].fn();
      }

      setNestedValue(result, fc.path, newVal);
    });

    lastGenerated = JSON.stringify(result, null, 2);

    // Show preview
    document.getElementById("rv2-preview-wrap").style.display = "block";
    document.getElementById("rv2-preview").textContent = lastGenerated;
  }

  /** Set value at dot-separated path in object */
  function setNestedValue(obj, path, value) {
    const keys = path.split(".");
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
      if (!current) return;
    }
    current[keys[keys.length - 1]] = value;
  }

  // ============================================================
  // COPY / INSERT
  // ============================================================
  function copyResult() {
    if (!lastGenerated) { alert("Сначала сгенерируй!"); return; }
    navigator.clipboard.writeText(lastGenerated);
  }

  function insertResult() {
    if (!lastGenerated) { alert("Сначала сгенерируй!"); return; }
    _setActiveTabBody(lastGenerated);
  }

  // ============================================================
  // TOGGLE ALL
  // ============================================================
  function toggleAll(state) {
    fieldConfigs.forEach(fc => fc.checked = state);
    document.querySelectorAll(".rv2-field-check").forEach(cb => cb.checked = state);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    show: () => {
      createPanel();
      document.getElementById("randomizer-v2-panel").style.display = "flex";
    },
    hide: () => {
      const panel = document.getElementById("randomizer-v2-panel");
      if (panel) panel.style.display = "none";
    },
  };
})();
