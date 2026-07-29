/**
 * randomizer-floating-panel.js — Advanced Randomizer (Type 1 & Type 2)
 * FLOATING PANEL VERSION (не modal)
 * Более удобно, не блокирует экран, можно менять размер и место
 */

const Randomizer = (() => {
  const API_BASE = "http://localhost:8000"; // ← Поменяй на свой адрес!

  let currentMode = 'type1';
  let wordLists = [];
  let isVisible = false;
  let settings = {
    type1: {
      charType: 'mixed',
      length: 20,
      errorProbability: 0.0
    },
    type2: {
      listName: '',
      count: 1,
      separator: '',
      errorProbability: 0.0
    }
  };

  /**
   * Initialize randomizer
   */
  async function init() {
    log("🚀 Randomizer initializing...");
    createPanel();
    setupEventListeners();
    await loadWordLists();
    log("✅ Randomizer ready!");
  }

  /**
   * Create floating panel (NOT modal)
   */
  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "randomizer-panel";
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 500px;
      max-height: 70vh;
      background: #1a1a1a;
      border: 2px solid #495057;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      display: none;
      flex-direction: column;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    panel.innerHTML = `
      <div style="
        padding: 12px 16px;
        border-bottom: 1px solid #495057;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #212529;
        border-radius: 10px 10px 0 0;
        user-select: none;
        cursor: move;
      " id="randomizer-header">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; color: #fff;">
          <span style="font-size: 18px;">🎲</span>
          <span>Advanced Randomizer</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="randomizer-minimize" style="
            background: none; border: none; color: #adb5bd; cursor: pointer;
            font-size: 18px; padding: 4px; display: flex; align-items: center;
            transition: color 0.2s;
          " title="Minimize">
            <span>−</span>
          </button>
          <button id="randomizer-close" style="
            background: none; border: none; color: #adb5bd; cursor: pointer;
            font-size: 18px; padding: 4px; display: flex; align-items: center;
            transition: color 0.2s;
          " title="Close">
            <span>×</span>
          </button>
        </div>
      </div>

      <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column;">
        <div id="randomizer-notification" style="padding: 8px 12px;"></div>

        <!-- Mode Tabs -->
        <div style="
          display: flex;
          border-bottom: 1px solid #495057;
          background: #212529;
          flex-shrink: 0;
        ">
          <button id="tab-type1" style="
            flex: 1;
            background: #495057;
            color: #fff;
            border: none;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 13px;
            border-bottom: 3px solid #0d6;
            transition: background 0.2s;
          ">
            <i style="font-style: italic;">▭</i> Type 1: Data Type
          </button>
          <button id="tab-type2" style="
            flex: 1;
            background: #343a40;
            color: #adb5bd;
            border: none;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
          ">
            <i style="font-style: italic;">≡</i> Type 2: Lists
          </button>
        </div>

        <div style="padding: 12px; overflow-y: auto;">
          <!-- TYPE 1 -->
          <div id="content-type1">
            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                Character Type
              </label>
              <select id="rand-char-type" style="
                width: 100%;
                padding: 6px 8px;
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                font-size: 12px;
              ">
                <option value="text">Text Only</option>
                <option value="numbers">Numbers Only</option>
                <option value="symbols">Symbols Only</option>
                <option value="alphanumeric" selected>Alphanumeric</option>
                <option value="mixed">Mixed (+ Symbols)</option>
              </select>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                Length
              </label>
              <input type="number" id="rand-length" value="20" min="1" max="500" style="
                width: 100%;
                padding: 6px 8px;
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                font-size: 12px;
              ">
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                Error Probability (0-1)
              </label>
              <input type="number" id="rand-error-prob" value="0" min="0" max="1" step="0.1" style="
                width: 100%;
                padding: 6px 8px;
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                font-size: 12px;
              ">
            </div>
          </div>

          <!-- TYPE 2 -->
          <div id="content-type2" style="display: none;">
            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                Word List
              </label>
              <select id="rand-list-name" style="
                width: 100%;
                padding: 6px 8px;
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                font-size: 12px;
              ">
                <option value="">-- Select List --</option>
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                  Count
                </label>
                <input type="number" id="rand-count" value="1" min="1" max="10" style="
                  width: 100%;
                  padding: 6px 8px;
                  background: #444;
                  color: #fff;
                  border: 1px solid #666;
                  border-radius: 4px;
                  font-size: 12px;
                ">
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                  Separator
                </label>
                <input type="text" id="rand-separator" placeholder="space, comma" style="
                  width: 100%;
                  padding: 6px 8px;
                  background: #444;
                  color: #fff;
                  border: 1px solid #666;
                  border-radius: 4px;
                  font-size: 12px;
                ">
              </div>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 4px; font-weight: 500;">
                Error Probability (0-1)
              </label>
              <input type="number" id="rand-error-prob-t2" value="0" min="0" max="1" step="0.1" style="
                width: 100%;
                padding: 6px 8px;
                background: #444;
                color: #fff;
                border: 1px solid #666;
                border-radius: 4px;
                font-size: 12px;
              ">
            </div>
          </div>
        </div>

        <!-- Output -->
        <div style="
          padding: 12px;
          border-top: 1px solid #495057;
          background: #212529;
          flex-shrink: 0;
        ">
          <label style="display: block; font-size: 12px; color: #0d6; margin-bottom: 6px; font-weight: 500;">
            📊 Generated Value
          </label>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="rand-output" placeholder="Click Generate..." readonly style="
              flex: 1;
              padding: 8px 10px;
              background: #333;
              color: #0d6;
              border: 1px solid #0d6;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
              font-size: 12px;
            ">
            <button id="rand-copy-btn" style="
              padding: 8px 12px;
              background: #495057;
              color: #0d6;
              border: 1px solid #0d6;
              border-radius: 4px;
              cursor: pointer;
              font-weight: bold;
              transition: background 0.2s;
            " title="Copy to clipboard">
              📋
            </button>
          </div>
        </div>

        <!-- Generate Button -->
        <div style="padding: 12px; background: #212529; flex-shrink: 0; border-top: 1px solid #495057;">
          <button id="rand-generate-btn" style="
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #0d6 0%, #0a4 100%);
            color: #000;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: transform 0.2s, box-shadow 0.2s;
          " title="Generate value">
            🎲 GENERATE
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    log("✅ Floating panel created");

    // Make header draggable
    makeDraggable();
  }

  /**
   * Make panel draggable
   */
  function makeDraggable() {
    const header = document.getElementById("randomizer-header");
    const panel = document.getElementById("randomizer-panel");
    let offsetX = 0, offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;

      const moveFn = (e) => {
        panel.style.left = (e.clientX - offsetX) + "px";
        panel.style.top = (e.clientY - offsetY) + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      };

      const stopFn = () => {
        document.removeEventListener("mousemove", moveFn);
        document.removeEventListener("mouseup", stopFn);
      };

      document.addEventListener("mousemove", moveFn);
      document.addEventListener("mouseup", stopFn);
    });
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    document.getElementById("randomizer-btn")?.addEventListener("click", toggle);
    document.getElementById("rand-generate-btn")?.addEventListener("click", generateValue);
    document.getElementById("rand-copy-btn")?.addEventListener("click", copyToClipboard);
    document.getElementById("randomizer-close")?.addEventListener("click", hide);
    document.getElementById("randomizer-minimize")?.addEventListener("click", toggleMinimize);

    // Tab switching
    document.getElementById("tab-type1")?.addEventListener("click", switchToType1);
    document.getElementById("tab-type2")?.addEventListener("click", switchToType2);

    // Settings change listeners
    document.getElementById("rand-char-type")?.addEventListener("change", (e) => {
      settings.type1.charType = e.target.value;
    });
    document.getElementById("rand-length")?.addEventListener("change", (e) => {
      settings.type1.length = parseInt(e.target.value) || 20;
    });
    document.getElementById("rand-error-prob")?.addEventListener("change", (e) => {
      settings.type1.errorProbability = parseFloat(e.target.value) || 0;
    });
    document.getElementById("rand-list-name")?.addEventListener("change", (e) => {
      settings.type2.listName = e.target.value;
    });
    document.getElementById("rand-count")?.addEventListener("change", (e) => {
      settings.type2.count = parseInt(e.target.value) || 1;
    });
    document.getElementById("rand-separator")?.addEventListener("change", (e) => {
      settings.type2.separator = e.target.value;
    });
    document.getElementById("rand-error-prob-t2")?.addEventListener("change", (e) => {
      settings.type2.errorProbability = parseFloat(e.target.value) || 0;
    });

    log("✅ Event listeners attached");
  }

  /**
   * Switch to Type 1 tab
   */
  function switchToType1() {
    currentMode = 'type1';
    document.getElementById("content-type1").style.display = "block";
    document.getElementById("content-type2").style.display = "none";
    document.getElementById("tab-type1").style.background = "#495057";
    document.getElementById("tab-type1").style.color = "#fff";
    document.getElementById("tab-type1").style.borderBottomColor = "#0d6";
    document.getElementById("tab-type2").style.background = "#343a40";
    document.getElementById("tab-type2").style.color = "#adb5bd";
    document.getElementById("tab-type2").style.borderBottomColor = "#343a40";
  }

  /**
   * Switch to Type 2 tab
   */
  function switchToType2() {
    currentMode = 'type2';
    document.getElementById("content-type1").style.display = "none";
    document.getElementById("content-type2").style.display = "block";
    document.getElementById("tab-type1").style.background = "#343a40";
    document.getElementById("tab-type1").style.color = "#adb5bd";
    document.getElementById("tab-type1").style.borderBottomColor = "#343a40";
    document.getElementById("tab-type2").style.background = "#495057";
    document.getElementById("tab-type2").style.color = "#fff";
    document.getElementById("tab-type2").style.borderBottomColor = "#0d6";
  }

  /**
   * Load word lists from backend
   */
  async function loadWordLists() {
    try {
      const response = await fetch(`${API_BASE}/randomize/lists`);
      const data = await response.json();
      wordLists = data.lists || [];

      const select = document.getElementById("rand-list-name");
      if (select) {
        wordLists.forEach(list => {
          const option = document.createElement("option");
          option.value = list;
          option.textContent = list;
          select.appendChild(option);
        });
        if (wordLists.length > 0) {
          settings.type2.listName = wordLists[0];
          select.value = wordLists[0];
        }
      }
      log(`✅ Loaded ${wordLists.length} word lists`);
    } catch (error) {
      log(`⚠️ Failed to load word lists: ${error.message}`, "warn");
    }
  }

  /**
   * Generate value
   */
  async function generateValue() {
    log(`🎲 Generating ${currentMode}...`);
    showNotification("Generating...", "info");

    try {
      let endpoint, params;

      if (currentMode === 'type1') {
        endpoint = `/randomize/type1`;
        params = new URLSearchParams({
          char_type: settings.type1.charType,
          length: settings.type1.length,
          error_probability: settings.type1.errorProbability
        });
      } else {
        endpoint = `/randomize/type2`;
        if (!settings.type2.listName) {
          showNotification("Select a word list!", "warning");
          return;
        }
        params = new URLSearchParams({
          list_name: settings.type2.listName,
          count: settings.type2.count,
          separator: settings.type2.separator,
          error_probability: settings.type2.errorProbability
        });
      }

      const response = await fetch(`${API_BASE}${endpoint}?${params}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const value = data.value || '';

      document.getElementById("rand-output").value = value;
      log(`✅ Generated: ${value.substring(0, 50)}...`);
      showNotification("✅ Done!", "success");
    } catch (error) {
      log(`❌ Error: ${error.message}`, "error");
      showNotification(`Error: ${error.message}`, "danger");
    }
  }

  /**
   * Copy to clipboard
   */
  function copyToClipboard() {
    const output = document.getElementById("rand-output");
    if (output.value) {
      navigator.clipboard.writeText(output.value);
      showNotification("✅ Copied!", "success");
      log("📋 Copied to clipboard");
    }
  }

  /**
   * Show notification
   */
  function showNotification(message, type = 'info') {
    const container = document.getElementById("randomizer-notification");
    if (!container) return;

    const alert = document.createElement("div");
    alert.style.cssText = `
      padding: 8px 10px;
      background: ${type === 'success' ? '#2d5016' : type === 'danger' ? '#5a1c1c' : '#1a3a4a'};
      color: ${type === 'success' ? '#90ee90' : type === 'danger' ? '#ff6b6b' : '#87ceeb'};
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 6px;
    `;
    alert.textContent = message;

    container.innerHTML = '';
    container.appendChild(alert);

    setTimeout(() => alert.remove(), 2500);
  }

  /**
   * Toggle visibility
   */
  function toggle() {
    isVisible ? hide() : show();
  }

  /**
   * Show panel
   */
  function show() {
    document.getElementById("randomizer-panel").style.display = "flex";
    isVisible = true;
  }

  /**
   * Hide panel
   */
  function hide() {
    document.getElementById("randomizer-panel").style.display = "none";
    isVisible = false;
  }

  /**
   * Toggle minimize
   */
  function toggleMinimize() {
    const content = document.querySelector("#randomizer-panel > div:nth-child(2)");
    if (content.style.display === "none") {
      content.style.display = "flex";
    } else {
      content.style.display = "none";
    }
  }

  /**
   * Logging
   */
  function log(message, level = "INFO") {
    console.log(`[Randomizer] ${message}`);
  }

  // Public API
  return {
    init,
    show,
    hide,
    toggle,
  };
})();

// Initialize on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  if (window.bootstrap) {
    Randomizer.init();
  } else {
    setTimeout(() => Randomizer.init(), 500);
  }
});