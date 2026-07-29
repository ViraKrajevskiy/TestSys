/**
 * generator.js
 * Data generator modal component with smart field type detection.
 * Integrates with /generate and /generate-schema endpoints.
 */

const Generator = (() => {
  const API_BASE = "http://localhost:8000";

  // Field type icons and colors
  const FIELD_TYPES = {
    email: { icon: "at", color: "primary" },
    password: { icon: "shield-lock", color: "warning" },
    phone: { icon: "telephone", color: "info" },
    url: { icon: "globe", color: "secondary" },
    datetime: { icon: "calendar", color: "danger" },
    status_code: { icon: "hash", color: "success" },
    name: { icon: "person", color: "primary" },
    address: { icon: "geo-alt", color: "secondary" },
    title: { icon: "type-h3", color: "info" },
    text: { icon: "file-text", color: "secondary" },
  };

  /**
   * Initialize generator modal and event listeners
   */
  async function init() {
    createModal();
    setupEventListeners();
    await loadSchemaHints();
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
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-shuffle me-2"></i>Test Data Generator
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="generator-fields" class="row g-3"></div>
            <div class="mt-4 p-3 bg-dark rounded">
              <label class="form-label fw-bold">Generated Data Preview:</label>
              <pre id="generator-preview" class="mb-0" style="max-height: 200px; overflow-y: auto;"></pre>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-warning" id="regenerate-btn">
              <i class="bi bi-arrow-clockwise me-2"></i>Regenerate
            </button>
            <button type="button" class="btn btn-success" id="apply-btn">
              <i class="bi bi-check-circle me-2"></i>Apply to Current Tab
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    const btn = document.getElementById("data-generator-btn");
    if (btn) {
      btn.addEventListener("click", () => showModal());
    }

    document.getElementById("regenerate-btn")?.addEventListener("click", generateData);
    document.getElementById("apply-btn")?.addEventListener("click", applyToTab);
  }

  /**
   * Load schema hints from backend
   */
  async function loadSchemaHints() {
    try {
      const response = await fetch(`${API_BASE}/generate-schema`);
      const hints = await response.json();
      renderFieldsUI(hints);
      await generateData();
    } catch (error) {
      console.error("Failed to load schema hints:", error);
      renderFieldsUI({});
    }
  }

  /**
   * Render field controls in modal
   */
  function renderFieldsUI(hints) {
    const container = document.getElementById("generator-fields");
    container.innerHTML = "";

    Object.entries(hints).forEach(([fieldName, fieldType]) => {
      const typeInfo = FIELD_TYPES[fieldType] || FIELD_TYPES.text;
      const col = document.createElement("div");
      col.className = "col-md-6";
      col.innerHTML = `
        <div class="input-group">
          <span class="input-group-text">
            <i class="bi bi-${typeInfo.icon} text-${typeInfo.color}"></i>
          </span>
          <input type="text" class="form-control generator-field" 
            data-field="${fieldName}" placeholder="${fieldName}" readonly>
          <button class="btn btn-sm btn-outline-info" type="button" 
            data-field="${fieldName}" title="Regenerate this field">
            <i class="bi bi-shuffle"></i>
          </button>
        </div>
        <small class="text-muted d-block mt-1">${fieldType}</small>
      `;
      container.appendChild(col);

      col.querySelector("button").addEventListener("click", (e) => {
        regenerateField(e.target.closest("button").dataset.field);
      });
    });
  }

  /**
   * Generate all test data
   */
  async function generateData() {
    try {
      const response = await fetch(`${API_BASE}/generate`, { method: "POST" });
      const data = await response.json();

      // Update all fields and preview
      Object.entries(data).forEach(([field, value]) => {
        const input = document.querySelector(`input[data-field="${field}"]`);
        if (input) {
          input.value = typeof value === "string" ? value : JSON.stringify(value);
        }
      });

      updatePreview(data);
    } catch (error) {
      console.error("Failed to generate data:", error);
      alert("Error generating test data");
    }
  }

  /**
   * Regenerate single field
   */
  async function regenerateField(fieldName) {
    try {
      const response = await fetch(`${API_BASE}/generate`, { method: "POST" });
      const data = await response.json();

      if (data[fieldName]) {
        const input = document.querySelector(`input[data-field="${fieldName}"]`);
        const value = data[fieldName];
        input.value = typeof value === "string" ? value : JSON.stringify(value);

        // Update preview
        updatePreview(getCurrentData());
      }
    } catch (error) {
      console.error("Failed to regenerate field:", error);
    }
  }

  /**
   * Update preview pane
   */
  function updatePreview(data) {
    const preview = document.getElementById("generator-preview");
    preview.textContent = JSON.stringify(data, null, 2);
  }

  /**
   * Get current form data
   */
  function getCurrentData() {
    const data = {};
    document.querySelectorAll(".generator-field").forEach((input) => {
      const field = input.dataset.field;
      const value = input.value;
      try {
        data[field] = value.startsWith("{") || value.startsWith("[")
          ? JSON.parse(value)
          : value;
      } catch {
        data[field] = value;
      }
    });
    return data;
  }

  /**
   * Apply generated data to current tab's body field
   */
  function applyToTab() {
    const activeTab = App.getActiveTab?.();
    if (!activeTab) {
      alert("No active tab found");
      return;
    }

    const data = getCurrentData();
    const bodyInput = document.querySelector("textarea[name='body']");
    if (bodyInput) {
      bodyInput.value = JSON.stringify(data, null, 2);
      bodyInput.dispatchEvent(new Event("input"));
      closeModal();
      alert("Data applied to request body!");
    } else {
      alert("Could not find request body field");
    }
  }

  /**
   * Show modal
   */
  function showModal() {
    const modal = new bootstrap.Modal(document.getElementById("generator-modal"));
    modal.show();
  }

  /**
   * Close modal
   */
  function closeModal() {
    const modal = bootstrap.Modal.getInstance(document.getElementById("generator-modal"));
    if (modal) modal.hide();
  }

  return {
    init,
    generateData,
    applyToTab,
    showModal,  // Export showModal for button onclick
  };
})();

// Initialize when DOM ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("Initializing Generator...");
  Generator.init().catch(err => console.error("Generator init error:", err));
});

// Fallback if already loaded
if (document.readyState !== "loading") {
  console.log("DOM already loaded, initializing Generator...");
  Generator.init().catch(err => console.error("Generator init error:", err));
}
