/**
 * dataGenerator.js — PyWebView Version
 * Data generator modal component with smart field type detection.
 * Uses window.pywebview.api instead of fetch for PyWebView compatibility.
 *
 * Logging goes to: ../testsys.log
 */

const Generator = (() => {
  let currentData = {};
  let fieldConfigs = [];
  let settings = {
    textLength: 10,
    numberMin: 1,
    numberMax: 1000,
    statuses: ['active', 'inactive', 'pending', 'approved', 'rejected'],
    daysAgo: 365
  };

  // Field type icons and descriptions
  const FIELD_TYPES = {
    email: { icon: "at", color: "primary", desc: "Email address" },
    password: { icon: "shield-lock", color: "warning", desc: "Password" },
    phone: { icon: "telephone", color: "info", desc: "Phone number" },
    url: { icon: "globe", color: "secondary", desc: "URL" },
    date: { icon: "calendar", color: "danger", desc: "Date" },
    status: { icon: "check-circle", color: "success", desc: "Status" },
    name: { icon: "person", color: "primary", desc: "Name" },
    text: { icon: "file-text", color: "secondary", desc: "Text" },
    number: { icon: "hash", color: "info", desc: "Number" },
  };

  /**
   * Initialize generator modal and event listeners
   */
  async function init() {
    log("🚀 Generator initializing...");
    createModal();
    setupEventListeners();
    await detectFormFields();
    log("✅ Generator ready!");
  }

  /**
   * Create Bootstrap modal HTML
   */
  function createModal() {
    const modal = document.createElement("div");
    modal.id = "generator-modal";
    modal.className = "modal fade";
    modal.tabIndex = "-1";
    modal.innerHTML = `
      <div class="modal-dialog modal-xl">
        <div class="modal-content theme-modal-content">
          <div class="modal-header border-0" style="border-bottom:1px solid var(--border-color) !important">
            <h5 class="modal-title">
              <i class="bi bi-shuffle me-2"></i>
              <strong>Test Data Generator</strong>
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          
          <div class="modal-body">
            <!-- Notifications -->
            <div id="gen-notification"></div>

            <div class="row g-3">
              <!-- LEFT: Settings -->
              <div class="col-lg-3">
                <div class="card" style="background:var(--bg-input);border-color:var(--border-color)">
                  <div class="card-header">
                    <h6 class="mb-0">⚙️ Settings</h6>
                  </div>
                  <div class="card-body">
                    
                    <div class="mb-3">
                      <label class="form-label text-info">📝 Text Length</label>
                      <input type="number" class="form-control form-control-sm" 
                        id="gen-text-length" value="10" min="3" max="100">
                    </div>

                    <div class="mb-3">
                      <label class="form-label text-info">🔢 Number Min</label>
                      <input type="number" class="form-control form-control-sm" 
                        id="gen-num-min" value="1">
                    </div>

                    <div class="mb-3">
                      <label class="form-label text-info">🔢 Number Max</label>
                      <input type="number" class="form-control form-control-sm" 
                        id="gen-num-max" value="1000">
                    </div>

                    <div class="mb-3">
                      <label class="form-label text-info">✅ Statuses</label>
                      <textarea class="form-control form-control-sm" id="gen-statuses" 
                        rows="4" style="font-size: 0.85rem;">active
inactive
pending
approved
rejected</textarea>
                    </div>

                    <hr>

                    <button type="button" class="btn btn-success w-100 btn-sm" id="gen-autofill-btn">
                      <i class="bi bi-magic me-1"></i> Auto-Fill All
                    </button>
                  </div>
                </div>
              </div>

              <!-- CENTER & RIGHT: Fields & Preview -->
              <div class="col-lg-9">
                <!-- Fields -->
                <div class="card bg-secondary mb-3">
                  <div class="card-header">
                    <h6 class="mb-0">📋 Detected Fields</h6>
                  </div>
                  <div class="card-body" id="gen-form-fields" style="max-height: 400px; overflow-y: auto;">
                    <p class="text-muted text-center py-4">
                      <i class="bi bi-inbox"></i> Detecting form fields...
                    </p>
                  </div>
                </div>

                <!-- Preview -->
                <div class="card" style="background:var(--bg-input);border-color:var(--border-color)">
                  <div class="card-header">
                    <h6 class="mb-0">📊 Data Preview</h6>
                  </div>
                  <div class="card-body" style="max-height: 150px; overflow-y: auto;">
                    <pre id="gen-preview" class="mb-0 text-light" style="font-size: 0.85rem;"></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer border-0" style="border-bottom:1px solid var(--border-color) !important">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">
              Close
            </button>
            <button type="button" class="btn btn-info btn-sm" id="gen-reload-btn">
              <i class="bi bi-arrow-clockwise me-1"></i> Reload Fields
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="gen-copy-json-btn">
              <i class="bi bi-clipboard me-1"></i> Copy JSON
            </button>
            <button type="button" class="btn btn-success btn-sm" id="gen-insert-body-btn">
              <i class="bi bi-box-arrow-in-down me-1"></i> Insert into Body
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="gen-submit-btn">
              <i class="bi bi-cloud-arrow-up me-1"></i> Validate
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    log("✅ Modal HTML created");
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    const btn = document.getElementById("data-generator-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        log("📌 Generator button clicked");
        showModal();
      });
    } else {
      log("⚠️ data-generator-btn not found");
    }

    document.getElementById("gen-autofill-btn")?.addEventListener("click", autoFill);
    document.getElementById("gen-submit-btn")?.addEventListener("click", validateData);
    document.getElementById("gen-reload-btn")?.addEventListener("click", detectFormFields);

    // Copy generated JSON to clipboard
    document.getElementById("gen-copy-json-btn")?.addEventListener("click", () => {
      const json = JSON.stringify(currentData, null, 2);
      navigator.clipboard.writeText(json);
      showNotification("✅ JSON скопирован!", "success");
    });

    // Insert generated JSON into active tab's body
    document.getElementById("gen-insert-body-btn")?.addEventListener("click", () => {
      const json = JSON.stringify(currentData, null, 2);
      if (!json || json === "{}") {
        showNotification("Сначала сгенерируй данные!", "warning");
        return;
      }
      const tab = App.getActiveTab();
      if (!tab) {
        showNotification("Нет активной вкладки!", "warning");
        return;
      }
      // Ensure method supports body
      if (!["POST", "PUT", "PATCH"].includes(tab.method)) {
        tab.method = "POST";
      }
      tab.body = json;
      tab.activeSubTab = "body";
      // Close modal and re-render
      closeModal();
      App.renderTabContent();
      showNotification("✅ Вставлено в Body!", "success");
    });

    // Settings change listeners
    document.getElementById("gen-text-length")?.addEventListener("change", (e) => {
      settings.textLength = parseInt(e.target.value) || 10;
    });
    document.getElementById("gen-num-min")?.addEventListener("change", (e) => {
      settings.numberMin = parseInt(e.target.value) || 1;
    });
    document.getElementById("gen-num-max")?.addEventListener("change", (e) => {
      settings.numberMax = parseInt(e.target.value) || 1000;
    });

    // Очищать застрявшие backdrop-ы при закрытии модалки
    const modalEl = document.getElementById("generator-modal");
    if (modalEl) {
      modalEl.addEventListener("hidden.bs.modal", () => {
        // Удаляем все оставшиеся backdrop-ы
        document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
        // Убираем modal-open с body (иначе прокрутка и клики заблокированы)
        document.body.classList.remove("modal-open");
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("padding-right");
      });
    }

    log("✅ Event listeners attached");
  }

  /**
   * Detect form fields in active tab
   */
  async function detectFormFields() {
    log("🔍 Detecting form fields...");
    fieldConfigs = [];

    // Look for inputs in tab content
    const tabContent = document.getElementById("tab-content");
    if (!tabContent) {
      log("⚠️ #tab-content not found");
      showNotification("No tab-content found", "warning");
      return;
    }

    const inputs = tabContent.querySelectorAll("input, select, textarea");
    log(`Found ${inputs.length} input elements`);

    inputs.forEach((input, index) => {
      const config = {
        id: input.id || `field_${index}`,
        name: input.name || input.placeholder || input.id || `field_${index}`,
        type: input.type || 'text',
        element: input,
        value: input.value || '',
      };
      fieldConfigs.push(config);
    });

    renderFormFields();
    updatePreview();
    showNotification(`Detected ${fieldConfigs.length} fields`, "info");
  }

  /**
   * Render form fields UI
   */
  function renderFormFields() {
    const container = document.getElementById("gen-form-fields");

    if (fieldConfigs.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-4">No input fields detected</p>';
      return;
    }

    let html = '';
    fieldConfigs.forEach((config) => {
      const typeInfo = getTypeInfo(config.name);
      html += `
        <div class="mb-2">
          <label class="form-label text-info" style="font-size: 0.9rem;">
            <i class="bi bi-${typeInfo.icon}"></i> ${config.name}
          </label>
          <div class="input-group input-group-sm">
            <input type="text" 
              class="form-control gen-field-input" 
              data-field-id="${config.id}"
              value="${config.value}"
              style="background:var(--bg-input);color:var(--text-main);border-color:var(--border-color);">
            <button class="btn btn-outline-info btn-sm gen-field-gen-btn" 
              type="button" 
              data-field-id="${config.id}"
              title="Generate random value">
              <i class="bi bi-shuffle"></i>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach individual generate buttons
    container.querySelectorAll('.gen-field-gen-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fieldId = e.currentTarget.getAttribute('data-field-id');
        const config = fieldConfigs.find(f => f.id === fieldId);
        if (config) {
          await generateField(config);
        }
      });
    });

    // Sync input changes
    container.querySelectorAll('.gen-field-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const fieldId = e.target.getAttribute('data-field-id');
        const config = fieldConfigs.find(f => f.id === fieldId);
        if (config) {
          config.value = e.target.value;
          currentData[config.name] = e.target.value;
        }
        updatePreview();
      });
    });

    log(`✅ Rendered ${fieldConfigs.length} fields`);
  }

  /**
   * Generate single field
   */
  async function generateField(config) {
    log(`📝 Generating ${config.name}...`);

    try {
      const result = await window.pywebview.api.generate_field(config.name);

      if (result.success) {
        const value = result.value;
        config.value = value;
        currentData[config.name] = value;

        // Update UI
        const input = document.querySelector(`[data-field-id="${config.id}"]`);
        if (input) {
          input.value = value;
        }

        updatePreview();
        log(`✅ Generated ${config.name}: ${value}`);
      } else {
        log(`❌ Error generating ${config.name}: ${result.error}`, "error");
        showNotification(`Error: ${result.error}`, "danger");
      }
    } catch (error) {
      log(`❌ Exception: ${error.message}`, "error");
      showNotification(`Exception: ${error.message}`, "danger");
    }
  }

  /**
   * Auto-fill all fields
   */
  async function autoFill() {
    log("🪄 Auto-filling all fields...");
    showNotification("Generating data for all fields...", "info");

    try {
      const fieldNames = fieldConfigs.map(f => f.name);
      const result = await window.pywebview.api.generate_data(fieldNames);

      if (result.success) {
        const data = result.data;

        // Update configs and UI
        fieldConfigs.forEach(config => {
          if (data[config.name]) {
            config.value = data[config.name];
            currentData[config.name] = data[config.name];

            const input = document.querySelector(`[data-field-id="${config.id}"]`);
            if (input) {
              input.value = data[config.name];
            }
          }
        });

        updatePreview();
        log(`✅ Auto-filled ${Object.keys(data).length} fields`);
        showNotification(`✅ Filled ${Object.keys(data).length} fields!`, "success");
      } else {
        log(`❌ Error: ${result.error}`, "error");
        showNotification(`Error: ${result.error}`, "danger");
      }
    } catch (error) {
      log(`❌ Exception: ${error.message}`, "error");
      showNotification(`Exception: ${error.message}`, "danger");
    }
  }

  /**
   * Validate data on server
   */
  async function validateData() {
    log("✅ Validating data...");
    showNotification("Validating data...", "info");

    try {
      const result = await window.pywebview.api.validate_data(currentData);

      if (result.success) {
        log("✅ All fields validated successfully");
        showNotification("✅ All fields valid!", "success");
      } else {
        const errors = result.errors || [result.error];
        log(`❌ Validation errors: ${errors.join('; ')}`, "error");
        showNotification(`❌ ${errors.join('; ')}`, "danger");
      }
    } catch (error) {
      log(`❌ Exception: ${error.message}`, "error");
      showNotification(`Exception: ${error.message}`, "danger");
    }
  }

  /**
   * Update preview pane
   */
  function updatePreview() {
    const preview = document.getElementById("gen-preview");
    preview.textContent = JSON.stringify(currentData, null, 2);
  }

  /**
   * Show notification
   */
  function showNotification(message, type = 'info') {
    const container = document.getElementById("gen-notification");
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.style.fontSize = "0.9rem";
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
    `;

    container.innerHTML = '';
    container.appendChild(alert);

    // Auto dismiss
    setTimeout(() => alert.remove(), 3000);
  }

  /**
   * Get type info for field
   */
  function getTypeInfo(fieldName) {
    const name = fieldName.toLowerCase();

    if (name.includes('email')) return FIELD_TYPES.email;
    if (name.includes('password')) return FIELD_TYPES.password;
    if (name.includes('phone') || name.includes('tel')) return FIELD_TYPES.phone;
    if (name.includes('status') || name.includes('state')) return FIELD_TYPES.status;
    if (name.includes('date') || name.includes('time')) return FIELD_TYPES.date;
    if (name.includes('url') || name.includes('website') || name.includes('site')) return FIELD_TYPES.url;
    if (name.includes('name') || name.includes('title')) return FIELD_TYPES.name;
    if (name.includes('id') || name.includes('count') || name.includes('age') || name.includes('number')) return FIELD_TYPES.number;

    return FIELD_TYPES.text;
  }

  /**
   * Logging function
   */
  function log(message, level = "INFO") {
    console.log(`[Generator] ${message}`);
  }

  /**
   * Show modal
   */
  function showModal() {
    const el = document.getElementById("generator-modal");
    // getOrCreateInstance — НЕ new bootstrap.Modal, иначе плодятся backdrop-ы
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    detectFormFields();
    modal.show();
  }

  /**
   * Close modal
   */
  function closeModal() {
    const el = document.getElementById("generator-modal");
    const modal = bootstrap.Modal.getInstance(el);
    if (modal) modal.hide();
  }

  // Public API
  return {
    init,
    showModal,
    log,
  };
})();

// Initialize when DOM ready or on page load
document.addEventListener("DOMContentLoaded", () => {
  if (window.pywebview && window.pywebview.api) {
    Generator.init();
  } else {
    // Fallback: wait for pywebview
    setTimeout(() => {
      if (window.pywebview && window.pywebview.api) {
        Generator.init();
      }
    }, 500);
  }
});

// Also try on load event
window.addEventListener("load", () => {
  if (window.pywebview && window.pywebview.api) {
    Generator.log("Initialized via load event");
  }
});