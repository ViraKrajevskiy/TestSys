/**
 * Unified Randomizer — All-in-one panel
 * Page 1: Type 1 (Data Type — random chars)
 * Page 2: Type 2 (Word Lists from backend)
 * Page 3: Template (JSON template-based)
 *
 * Single floating panel with page tabs at the top.
 */

const UnifiedRandomizer = (() => {
  const API_BASE = "http://localhost:8000";

  let currentPage = "type1"; // "type1" | "type2" | "template"
  let isVisible = false;
  let isLocked = false;
  let wordLists = [];

  // Type 1/2 settings
  let t1Settings = { charType: "mixed", length: 20, errorProbability: 0 };
  let t2Settings = { listName: "", count: 1, separator: "", errorProbability: 0 };

  // Template state
  let templateObj = {};
  let fieldConfigs = [];
  let lastGenerated = null;
  let _editingCustomIdx = -1;

  // ============================================================
  // EXAMPLE TEMPLATES
  // ============================================================
  const EXAMPLES = {
    user: {
      label: "👤 User",
      data: { name: "John Doe", username: "johnd", email: "john@example.com", phone: "1-234-567-8900", website: "johndoe.com", company: { name: "Acme Corp", catchPhrase: "Multi-layered solution" } }
    },
    product: {
      label: "📦 Product",
      data: { title: "Wireless Mouse", price: 29.99, category: "electronics", description: "Ergonomic wireless mouse", inStock: true, rating: 4.5 }
    },
    order: {
      label: "🛒 Order",
      data: { orderId: 10001, customer: "Jane Smith", email: "jane@mail.com", total: 159.9, status: "pending", items: 3, shipping: { city: "Moscow", zip: "101000", address: "Red Square 1" } }
    },
    auth: {
      label: "🔐 Auth",
      data: { username: "testuser", password: "qwerty123", email: "test@example.com", rememberMe: false }
    }
  };

  // ============================================================
  // TEMPLATE GENERATORS
  // ============================================================
  const GEN_TYPES = {
    auto:     { label: "Auto",        fn: autoGenerate },
    text:     { label: "Текст",       fn: () => randomString(8) },
    name:     { label: "Имя",         fn: () => pickRandom(NAMES) },
    email:    { label: "Email",       fn: () => `${randomString(6)}@${pickRandom(["gmail.com","mail.com","test.com","example.com"])}` },
    phone:    { label: "Телефон",     fn: () => `+7-${rndDigits(3)}-${rndDigits(3)}-${rndDigits(4)}` },
    url:      { label: "URL",         fn: () => `https://${randomString(6)}.${pickRandom(["com","org","io","dev"])}` },
    number:   { label: "Число",       fn: () => Math.floor(Math.random() * 10000) },
    float:    { label: "Дробное",     fn: () => +(Math.random() * 1000).toFixed(2) },
    bool:     { label: "true/false",  fn: () => Math.random() > 0.5 },
    uuid:     { label: "UUID",        fn: generateUUID },
    lorem:    { label: "Lorem",       fn: () => pickRandom(LOREM_SENTENCES) },
    city:     { label: "Город",       fn: () => pickRandom(CITIES) },
    status:   { label: "Статус",      fn: () => pickRandom(["active","inactive","pending","approved","rejected","cancelled"]) },
    password: { label: "Пароль",      fn: () => randomMixedString(12) },
    date:     { label: "Дата",        fn: () => randomDate() },
    custom:   { label: "📋 Из списка...", fn: null },
  };

  const NAMES = ["John Doe","Jane Smith","Alice Johnson","Bob Williams","Charlie Brown","Diana Prince","Ivan Petrov","Elena Volkova","Sergey Kozlov","Anna Petrova","Max Fischer","Olga Smirnova"];
  const CITIES = ["Moscow","London","New York","Berlin","Tokyo","Paris","Sydney","Toronto","Dubai","Singapore","Rome","Istanbul"];
  const LOREM_SENTENCES = ["Lorem ipsum dolor sit amet","Consectetur adipiscing elit","Sed do eiusmod tempor incididunt","Ut labore et dolore magna aliqua","Duis aute irure dolor in reprehenderit","Excepteur sint occaecat cupidatat"];

  // ============================================================
  // HELPERS
  // ============================================================
  function randomString(len) { const c = "abcdefghijklmnopqrstuvwxyz"; let r = ""; for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }
  function randomMixedString(len) { const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"; let r = ""; for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)]; return r; }
  function rndDigits(n) { let r = ""; for (let i = 0; i < n; i++) r += Math.floor(Math.random() * 10); return r; }
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function generateUUID() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); }); }
  function randomDate() { const d = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)); return d.toISOString().split("T")[0]; }
  function truncate(str, max) { return str.length > max ? str.substring(0, max) + "..." : str; }
  function escapeHtml(text) { const d = document.createElement("div"); d.textContent = String(text); return d.innerHTML; }

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
    if (k.includes("address")) return `${pickRandom(CITIES)}, ${randomString(6)} st. ${Math.floor(Math.random()*200)+1}`;
    if (k.includes("price") || k.includes("total") || k.includes("amount") || k.includes("rating")) return GEN_TYPES.float.fn();
    if (k.includes("id") && typeof value === "number") return Math.floor(Math.random() * 100000);
    if (typeof value === "number" && !Number.isInteger(value)) return GEN_TYPES.float.fn();
    if (typeof value === "number") return GEN_TYPES.number.fn();
    if (typeof value === "boolean") return GEN_TYPES.bool.fn();
    return GEN_TYPES.text.fn();
  }

  // ============================================================
  // INSERT INTO BODY (shared)
  // ============================================================
  function _insertTextIntoBody(text) {
    const tab = App.getActiveTab();
    if (!tab) { _notify("Нет активной вкладки!", "warning"); return; }
    const needsRerender = !["POST","PUT","PATCH"].includes(tab.method) || tab.activeSubTab !== "body";
    if (!["POST","PUT","PATCH"].includes(tab.method)) tab.method = "POST";
    tab.activeSubTab = "body";
    if (needsRerender) App.renderTabContent();
    const textarea = document.getElementById("body-textarea");
    if (textarea) {
      const s = textarea.selectionStart, e = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + text + textarea.value.substring(e);
      tab.body = textarea.value;
      textarea.setSelectionRange(s + text.length, s + text.length);
      textarea.focus();
    } else {
      tab.body = (tab.body || "") + text;
    }
    _notify("✅ Вставлено!", "success");
  }

  function _setActiveTabBody(json) {
    const tab = App.getActiveTab();
    if (!tab) return;
    if (!["POST","PUT","PATCH"].includes(tab.method)) tab.method = "POST";
    tab.body = json;
    tab.activeSubTab = "body";
    App.renderTabContent();
  }

  // ============================================================
  // NOTIFICATION
  // ============================================================
  function _notify(msg, type) {
    const c = document.getElementById("ur-notification");
    if (!c) return;
    c.innerHTML = `<div style="padding:6px 10px;background:var(--bg-input);color:var(--text-main);border-left:3px solid var(--accent);border-radius:4px;font-size:12px;">${escapeHtml(msg)}</div>`;
    setTimeout(() => c.innerHTML = "", 2500);
  }

  // ============================================================
  // CREATE PANEL
  // ============================================================
  function createPanel() {
    let panel = document.getElementById("unified-rand-panel");
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "unified-rand-panel";
    panel.className = "randomizer-v2-panel";
    panel.style.display = "none";

    const exBtns = Object.entries(EXAMPLES).map(([k, v]) =>
      `<button class="ur-example-btn randomizer-btn" data-example="${k}" style="font-size:11px;padding:3px 8px;">${v.label}</button>`
    ).join("");

    const genOptions = Object.entries(GEN_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");

    // Make panel resizable via CSS
    panel.style.resize = "both";
    panel.style.overflow = "hidden";
    panel.style.minWidth = "360px";
    panel.style.minHeight = "300px";
    panel.style.maxWidth = "90vw";
    panel.style.maxHeight = "90vh";

    panel.innerHTML = `
      <!-- HEADER -->
      <div class="randomizer-v2-header" id="ur-header" style="cursor:move;">
        <div class="randomizer-v2-title"><span>🎲</span> Randomizer</div>
        <div class="randomizer-v2-controls">
          <button id="ur-lock" class="randomizer-btn" title="Закрепить позицию и размер"><i class="bi bi-unlock"></i></button>
          <button id="ur-collapse" class="randomizer-btn" title="Свернуть"><i class="bi bi-chevron-up"></i></button>
          <button id="ur-close" class="randomizer-btn" title="Закрыть"><i class="bi bi-x"></i></button>
        </div>
      </div>

      <div id="ur-body" class="randomizer-v2-content">
        <!-- PAGE TABS -->
        <div class="randomizer-v2-tabs" style="flex-shrink:0;">
          <button class="randomizer-v2-tab active" data-page="type1">▭ Data Type</button>
          <button class="randomizer-v2-tab" data-page="type2">≡ Word Lists</button>
          <button class="randomizer-v2-tab" data-page="template">📋 Template</button>
        </div>

        <div id="ur-notification" style="padding:4px 12px;flex-shrink:0;"></div>

        <!-- ===== PAGE: TYPE 1 ===== -->
        <div class="ur-page" id="ur-page-type1" style="padding:12px;overflow-y:auto;flex:1;">
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Character Type</label>
            <select id="ur-t1-chartype" class="randomizer-input" style="width:100%;">
              <option value="text">Text Only</option>
              <option value="numbers">Numbers Only</option>
              <option value="symbols">Symbols Only</option>
              <option value="alphanumeric">Alphanumeric</option>
              <option value="mixed" selected>Mixed (+ Symbols)</option>
            </select>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Length</label>
            <input type="number" id="ur-t1-length" class="randomizer-input" value="20" min="1" max="500" style="width:100%;">
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Error Probability (0-1)</label>
            <input type="number" id="ur-t1-errprob" class="randomizer-input" value="0" min="0" max="1" step="0.1" style="width:100%;">
          </div>

          <!-- OUTPUT -->
          <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:10px;">
            <label style="font-size:11px;color:var(--accent);font-weight:600;">📊 Результат</label>
            <div style="display:flex;gap:6px;margin-top:4px;">
              <input type="text" id="ur-t1-output" class="randomizer-input" placeholder="Click Generate..." readonly style="flex:1;font-family:monospace;">
              <button id="ur-t1-copy" class="randomizer-btn" title="Copy">📋</button>
              <button id="ur-t1-insert" class="randomizer-btn-primary" style="font-size:12px;" title="Insert into Body">⬇ Insert</button>
            </div>
          </div>
          <button id="ur-t1-generate" class="randomizer-btn-primary" style="width:100%;margin-top:10px;padding:10px;font-size:13px;">🎲 GENERATE</button>
        </div>

        <!-- ===== PAGE: TYPE 2 ===== -->
        <div class="ur-page" id="ur-page-type2" style="padding:12px;overflow-y:auto;flex:1;display:none;">
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Word List</label>
            <select id="ur-t2-listname" class="randomizer-input" style="width:100%;">
              <option value="">-- Select List --</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div>
              <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Count</label>
              <input type="number" id="ur-t2-count" class="randomizer-input" value="1" min="1" max="10" style="width:100%;">
            </div>
            <div>
              <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Separator</label>
              <input type="text" id="ur-t2-separator" class="randomizer-input" placeholder="space, comma" style="width:100%;">
            </div>
          </div>
          <div style="margin-bottom:10px;">
            <label style="display:block;font-size:12px;color:var(--accent);margin-bottom:4px;font-weight:500;">Error Probability (0-1)</label>
            <input type="number" id="ur-t2-errprob" class="randomizer-input" value="0" min="0" max="1" step="0.1" style="width:100%;">
          </div>

          <!-- OUTPUT -->
          <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:10px;">
            <label style="font-size:11px;color:var(--accent);font-weight:600;">📊 Результат</label>
            <div style="display:flex;gap:6px;margin-top:4px;">
              <input type="text" id="ur-t2-output" class="randomizer-input" placeholder="Click Generate..." readonly style="flex:1;font-family:monospace;">
              <button id="ur-t2-copy" class="randomizer-btn" title="Copy">📋</button>
              <button id="ur-t2-insert" class="randomizer-btn-primary" style="font-size:12px;" title="Insert into Body">⬇ Insert</button>
            </div>
          </div>
          <button id="ur-t2-generate" class="randomizer-btn-primary" style="width:100%;margin-top:10px;padding:10px;font-size:13px;">🎲 GENERATE</button>
        </div>

        <!-- ===== PAGE: TEMPLATE ===== -->
        <div class="ur-page" id="ur-page-template" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
          <!-- Examples row -->
          <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);flex-shrink:0;">
            <label style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">Примеры шаблонов:</label>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">${exBtns}</div>
          </div>
          <!-- Load controls -->
          <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);display:flex;gap:6px;flex-shrink:0;align-items:center;">
            <button id="ur-tpl-load-body" class="randomizer-btn-primary" style="flex:1;font-size:12px;">📥 Из Body</button>
            <button id="ur-tpl-load-file" class="randomizer-btn" style="font-size:11px;" title="Загрузить JSON">📁 Файл</button>
            <input type="file" id="ur-tpl-file-input" accept=".json,.txt" style="display:none;">
            <span style="color:var(--border-color);font-size:14px;">|</span>
            <button id="ur-tpl-select-all" class="randomizer-btn" style="font-size:11px;" title="Выбрать все">☑</button>
            <button id="ur-tpl-deselect-all" class="randomizer-btn" style="font-size:11px;" title="Снять все">☐</button>
          </div>
          <!-- Fields -->
          <div id="ur-tpl-fields" style="padding:8px 12px;overflow-y:auto;flex:1;max-height:350px;">
            <div style="color:var(--text-dim);text-align:center;padding:16px 0;font-size:12px;">
              <p style="margin:0 0 8px;">Выбери пример шаблона или нажми <strong>"Из Body"</strong></p>
              <p style="margin:0;font-size:11px;"><code style="color:var(--accent);">{"name":"John","email":"j@mail.com","age":25}</code></p>
            </div>
          </div>
          <!-- Custom list editor -->
          <div id="ur-tpl-custom-editor" style="padding:8px 12px;border-top:1px solid var(--border-color);display:none;">
            <label style="font-size:11px;color:var(--accent);font-weight:600;">Свои значения для <strong id="ur-tpl-custom-field-name"></strong>:</label>
            <textarea id="ur-tpl-custom-values" class="randomizer-input" rows="3" style="width:100%;margin-top:4px;font-size:11px;" placeholder="По одному на строку"></textarea>
            <div style="display:flex;gap:6px;margin-top:4px;">
              <button id="ur-tpl-custom-save" class="randomizer-btn-primary" style="font-size:11px;">✓ Сохранить</button>
              <button id="ur-tpl-custom-cancel" class="randomizer-btn" style="font-size:11px;">Отмена</button>
            </div>
          </div>
          <!-- Preview -->
          <div id="ur-tpl-preview-wrap" style="padding:8px 12px;border-top:1px solid var(--border-color);max-height:180px;overflow-y:auto;display:none;">
            <label style="font-size:11px;color:var(--accent);font-weight:600;">Результат:</label>
            <pre id="ur-tpl-preview" style="background:var(--bg-app);color:var(--accent);padding:8px;border-radius:4px;font-size:11px;margin:4px 0 0;max-height:140px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;"></pre>
          </div>
          <!-- Actions -->
          <div style="padding:10px 12px;border-top:1px solid var(--border-color);display:flex;gap:6px;flex-shrink:0;">
            <button id="ur-tpl-generate" class="randomizer-btn-primary" style="flex:2;">🎲 Сгенерировать</button>
            <button id="ur-tpl-copy" class="randomizer-btn" style="flex:1;">📋 Copy</button>
            <button id="ur-tpl-insert" class="randomizer-btn-primary" style="flex:1;">⬇ Insert</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    _makeDraggable();
    _attachEvents();
    // Load word lists in background
    _loadWordLists().catch(() => {});
  }

  // ============================================================
  // DRAGGABLE
  // ============================================================
  function _makeDraggable() {
    const header = document.getElementById("ur-header");
    const panel = document.getElementById("unified-rand-panel");
    let ox = 0, oy = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      if (isLocked) return;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
      const mv = (e) => { panel.style.left = (e.clientX - ox) + "px"; panel.style.top = (e.clientY - oy) + "px"; panel.style.right = "auto"; panel.style.bottom = "auto"; };
      const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", mv);
      document.addEventListener("mouseup", up);
    });
  }

  function _toggleLock() {
    isLocked = !isLocked;
    const panel = document.getElementById("unified-rand-panel");
    const header = document.getElementById("ur-header");
    const lockBtn = document.getElementById("ur-lock");
    if (isLocked) {
      panel.style.resize = "none";
      header.style.cursor = "default";
      lockBtn.innerHTML = '<i class="bi bi-lock"></i>';
      lockBtn.title = "Разблокировать позицию и размер";
      lockBtn.style.color = "var(--accent)";
    } else {
      panel.style.resize = "both";
      header.style.cursor = "move";
      lockBtn.innerHTML = '<i class="bi bi-unlock"></i>';
      lockBtn.title = "Закрепить позицию и размер";
      lockBtn.style.color = "";
    }
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  function _attachEvents() {
    // Lock / Close / Collapse
    document.getElementById("ur-lock").addEventListener("click", _toggleLock);
    document.getElementById("ur-close").addEventListener("click", hide);
    document.getElementById("ur-collapse").addEventListener("click", () => {
      const b = document.getElementById("ur-body");
      b.style.display = b.style.display === "none" ? "flex" : "none";
    });

    // Page tabs
    document.querySelectorAll("#unified-rand-panel .randomizer-v2-tab").forEach(btn => {
      btn.addEventListener("click", () => switchPage(btn.dataset.page));
    });

    // ---- TYPE 1 ----
    document.getElementById("ur-t1-chartype").addEventListener("change", e => t1Settings.charType = e.target.value);
    document.getElementById("ur-t1-length").addEventListener("change", e => t1Settings.length = parseInt(e.target.value) || 20);
    document.getElementById("ur-t1-errprob").addEventListener("change", e => t1Settings.errorProbability = parseFloat(e.target.value) || 0);
    document.getElementById("ur-t1-generate").addEventListener("click", generateType1);
    document.getElementById("ur-t1-copy").addEventListener("click", () => _copyText(document.getElementById("ur-t1-output").value));
    document.getElementById("ur-t1-insert").addEventListener("click", () => { const v = document.getElementById("ur-t1-output").value; if (v) _insertTextIntoBody(v); else _notify("Сначала сгенерируй!", "warning"); });

    // ---- TYPE 2 ----
    document.getElementById("ur-t2-listname").addEventListener("change", e => t2Settings.listName = e.target.value);
    document.getElementById("ur-t2-count").addEventListener("change", e => t2Settings.count = parseInt(e.target.value) || 1);
    document.getElementById("ur-t2-separator").addEventListener("change", e => t2Settings.separator = e.target.value);
    document.getElementById("ur-t2-errprob").addEventListener("change", e => t2Settings.errorProbability = parseFloat(e.target.value) || 0);
    document.getElementById("ur-t2-generate").addEventListener("click", generateType2);
    document.getElementById("ur-t2-copy").addEventListener("click", () => _copyText(document.getElementById("ur-t2-output").value));
    document.getElementById("ur-t2-insert").addEventListener("click", () => { const v = document.getElementById("ur-t2-output").value; if (v) _insertTextIntoBody(v); else _notify("Сначала сгенерируй!", "warning"); });

    // ---- TEMPLATE ----
    document.querySelectorAll("#unified-rand-panel .ur-example-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const ex = EXAMPLES[btn.dataset.example];
        if (ex) { loadTemplate(ex.data); _setActiveTabBody(JSON.stringify(ex.data, null, 2)); }
      });
    });
    document.getElementById("ur-tpl-load-body").addEventListener("click", loadFromBody);
    document.getElementById("ur-tpl-load-file").addEventListener("click", () => document.getElementById("ur-tpl-file-input").click());
    document.getElementById("ur-tpl-file-input").addEventListener("change", (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { try { const d = JSON.parse(ev.target.result); loadTemplate(d); _setActiveTabBody(JSON.stringify(d, null, 2)); } catch (err) { alert("Не валидный JSON!\n" + err.message); } };
      reader.readAsText(file); e.target.value = "";
    });
    document.getElementById("ur-tpl-select-all").addEventListener("click", () => toggleAllFields(true));
    document.getElementById("ur-tpl-deselect-all").addEventListener("click", () => toggleAllFields(false));
    document.getElementById("ur-tpl-generate").addEventListener("click", generateTemplate);
    document.getElementById("ur-tpl-copy").addEventListener("click", () => { if (lastGenerated) _copyText(lastGenerated); else _notify("Сначала сгенерируй!", "warning"); });
    document.getElementById("ur-tpl-insert").addEventListener("click", () => { if (lastGenerated) _setActiveTabBody(lastGenerated); else _notify("Сначала сгенерируй!", "warning"); });
    document.getElementById("ur-tpl-custom-save").addEventListener("click", saveCustomList);
    document.getElementById("ur-tpl-custom-cancel").addEventListener("click", hideCustomEditor);
  }

  // ============================================================
  // PAGE SWITCHING
  // ============================================================
  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll("#unified-rand-panel .randomizer-v2-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.page === page);
    });
    document.querySelectorAll("#unified-rand-panel .ur-page").forEach(p => {
      const id = p.id.replace("ur-page-", "");
      if (id === page) {
        p.style.display = page === "template" ? "flex" : "block";
      } else {
        p.style.display = "none";
      }
    });
  }

  // ============================================================
  // TYPE 1 GENERATE
  // ============================================================
  async function generateType1() {
    _notify("Generating...", "info");
    try {
      const params = new URLSearchParams({
        char_type: t1Settings.charType,
        length: t1Settings.length,
        error_probability: t1Settings.errorProbability
      });
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(`${API_BASE}/randomize/type1?${params}`, { method: "POST", signal: ctrl.signal });
      clearTimeout(tmr);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      document.getElementById("ur-t1-output").value = data.value || "";
      _notify("✅ Done!", "success");
    } catch (err) {
      _notify("Error: " + err.message, "danger");
    }
  }

  // ============================================================
  // TYPE 2 GENERATE
  // ============================================================
  async function generateType2() {
    if (!t2Settings.listName) { _notify("Выбери список!", "warning"); return; }
    _notify("Generating...", "info");
    try {
      const params = new URLSearchParams({
        list_name: t2Settings.listName,
        count: t2Settings.count,
        separator: t2Settings.separator,
        error_probability: t2Settings.errorProbability
      });
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(`${API_BASE}/randomize/type2?${params}`, { method: "POST", signal: ctrl.signal });
      clearTimeout(tmr);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      document.getElementById("ur-t2-output").value = data.value || "";
      _notify("✅ Done!", "success");
    } catch (err) {
      _notify("Error: " + err.message, "danger");
    }
  }

  // ============================================================
  // LOAD WORD LISTS
  // ============================================================
  async function _loadWordLists() {
    try {
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 3000);
      const resp = await fetch(`${API_BASE}/randomize/lists`, { signal: ctrl.signal });
      clearTimeout(tmr);
      const data = await resp.json();
      wordLists = data.lists || [];
      const sel = document.getElementById("ur-t2-listname");
      if (sel) {
        wordLists.forEach(l => { const o = document.createElement("option"); o.value = l; o.textContent = l; sel.appendChild(o); });
        if (wordLists.length > 0) { t2Settings.listName = wordLists[0]; sel.value = wordLists[0]; }
      }
    } catch (_) {}
  }

  // ============================================================
  // TEMPLATE FUNCTIONS
  // ============================================================
  function loadFromBody() {
    const tab = App.getActiveTab();
    if (!tab) { alert("Нет активной вкладки!"); return; }
    const textarea = document.getElementById("body-textarea");
    const raw = textarea ? textarea.value : (tab.body || "");
    if (!raw.trim()) { alert("Body пуст!"); return; }
    try { loadTemplate(JSON.parse(raw)); } catch (e) { alert("Не валидный JSON!\n" + e.message); }
  }

  function loadTemplate(obj) {
    templateObj = JSON.parse(JSON.stringify(obj));
    fieldConfigs = [];
    _parseFields(templateObj, "");
    renderFields();
    document.getElementById("ur-tpl-preview-wrap").style.display = "none";
    hideCustomEditor();
    lastGenerated = null;
  }

  function _parseFields(obj, prefix) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        _parseFields(val, path);
      } else {
        fieldConfigs.push({ path, key, originalValue: val, checked: true, genType: _detectBestType(key, val), customList: [] });
      }
    }
  }

  function _detectBestType(key, value) {
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

  function renderFields() {
    const container = document.getElementById("ur-tpl-fields");
    if (fieldConfigs.length === 0) { container.innerHTML = '<p style="color:var(--text-dim);text-align:center;font-size:12px;">Нет полей</p>'; return; }

    const genOpts = Object.entries(GEN_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
    let html = "";
    fieldConfigs.forEach((fc, idx) => {
      const dv = fc.originalValue === null ? "null" : typeof fc.originalValue === "string" ? `"${truncate(fc.originalValue, 20)}"` : String(fc.originalValue);
      const badge = fc.genType === "custom" && fc.customList.length > 0 ? `<span style="font-size:9px;color:var(--accent);margin-left:2px;">(${fc.customList.length})</span>` : "";
      html += `
        <div class="randomizer-gen-item" style="margin-bottom:4px;padding:6px 8px;">
          <label style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer;">
            <input type="checkbox" class="ur-tpl-check" data-idx="${idx}" ${fc.checked ? "checked" : ""}>
            <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <strong>${escapeHtml(fc.path)}</strong>
              <span style="color:var(--text-dim);margin-left:4px;font-size:11px;">${escapeHtml(dv)}</span>
            </span>
          </label>
          <div style="display:flex;gap:3px;align-items:center;flex-shrink:0;">
            <select class="ur-tpl-type" data-idx="${idx}" style="width:110px;padding:3px 4px;background:var(--bg-input);color:var(--text-main);border:1px solid var(--border-color);border-radius:3px;font-size:10px;">${genOpts}</select>
            ${badge}
          </div>
        </div>`;
    });
    container.innerHTML = html;

    container.querySelectorAll(".ur-tpl-check").forEach(cb => {
      cb.addEventListener("change", e => { fieldConfigs[+e.target.dataset.idx].checked = e.target.checked; });
    });
    container.querySelectorAll(".ur-tpl-type").forEach(sel => {
      sel.value = fieldConfigs[+sel.dataset.idx].genType;
      sel.addEventListener("change", e => {
        const idx = +e.target.dataset.idx;
        fieldConfigs[idx].genType = e.target.value;
        if (e.target.value === "custom") openCustomEditor(idx);
      });
    });
  }

  function openCustomEditor(idx) {
    _editingCustomIdx = idx;
    const fc = fieldConfigs[idx];
    document.getElementById("ur-tpl-custom-field-name").textContent = fc.path;
    document.getElementById("ur-tpl-custom-values").value = fc.customList.join("\n");
    document.getElementById("ur-tpl-custom-editor").style.display = "block";
    document.getElementById("ur-tpl-custom-values").focus();
  }

  function saveCustomList() {
    if (_editingCustomIdx < 0) return;
    const raw = document.getElementById("ur-tpl-custom-values").value;
    fieldConfigs[_editingCustomIdx].customList = raw.split("\n").map(s => s.trim()).filter(Boolean);
    hideCustomEditor();
    renderFields();
  }

  function hideCustomEditor() {
    _editingCustomIdx = -1;
    const el = document.getElementById("ur-tpl-custom-editor");
    if (el) el.style.display = "none";
  }

  function toggleAllFields(state) {
    fieldConfigs.forEach(fc => fc.checked = state);
    document.querySelectorAll(".ur-tpl-check").forEach(cb => cb.checked = state);
  }

  function generateTemplate() {
    if (fieldConfigs.length === 0) { alert("Сначала загрузи шаблон!"); return; }
    const result = JSON.parse(JSON.stringify(templateObj));
    fieldConfigs.forEach(fc => {
      if (!fc.checked) return;
      let nv;
      if (fc.genType === "custom") {
        if (fc.customList.length > 0) {
          const picked = pickRandom(fc.customList);
          if (typeof fc.originalValue === "number") { const n = Number(picked); nv = isNaN(n) ? picked : n; }
          else if (typeof fc.originalValue === "boolean") { nv = picked.toLowerCase() === "true"; }
          else nv = picked;
        } else nv = fc.originalValue;
      } else if (fc.genType === "auto") { nv = autoGenerate(fc.key, fc.originalValue); }
      else { nv = GEN_TYPES[fc.genType].fn(); }
      _setNestedValue(result, fc.path, nv);
    });
    lastGenerated = JSON.stringify(result, null, 2);
    document.getElementById("ur-tpl-preview-wrap").style.display = "block";
    document.getElementById("ur-tpl-preview").textContent = lastGenerated;
  }

  function _setNestedValue(obj, path, value) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) { cur = cur[keys[i]]; if (!cur) return; }
    cur[keys[keys.length - 1]] = value;
  }

  // ============================================================
  // COPY HELPER
  // ============================================================
  function _copyText(text) {
    if (!text) { _notify("Нечего копировать!", "warning"); return; }
    navigator.clipboard.writeText(text);
    _notify("✅ Скопировано!", "success");
  }

  // ============================================================
  // SHOW / HIDE
  // ============================================================
  function show(page) {
    createPanel();
    document.getElementById("unified-rand-panel").style.display = "flex";
    isVisible = true;
    if (page) switchPage(page);
  }

  function hide() {
    const p = document.getElementById("unified-rand-panel");
    if (p) p.style.display = "none";
    isVisible = false;
  }

  function toggle(page) { isVisible ? hide() : show(page); }

  // ============================================================
  // PUBLIC
  // ============================================================
  return { show, hide, toggle };
})();

// Backward compat — old names still work
const Randomizer = { show: () => UnifiedRandomizer.show("type1"), hide: () => UnifiedRandomizer.hide(), toggle: () => UnifiedRandomizer.toggle("type1") };
const RandomizerV2 = { show: () => UnifiedRandomizer.show("template"), hide: () => UnifiedRandomizer.hide() };
