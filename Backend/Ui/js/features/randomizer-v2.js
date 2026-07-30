/**
 * Advanced Randomizer v2
 * 10 типов генерации с переключателями, загрузкой файлов и предпросмотром
 * Встроен в основной интерфейс (не отдельное окно)
 */

const RandomizerV2 = (() => {
  let settings = {
    textLength: 10,
    numberRange: [1, 1000],
    symbolsLength: 5,
    paddingSpaces: 2,
    elementCount: 5,
  };

  let customData = {
    texts: [],
    numbers: [],
    symbols: [],
    custom: []
  };

  const GENERATORS = {
    // 1. Рандомный текст
    randomText: () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      let result = '';
      for (let i = 0; i < settings.textLength; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    },

    // 2. Рандомный знак пунктуации
    randomPunctuation: () => {
      const symbols = '!?,;:."\'-()[]{}';
      return symbols.charAt(Math.floor(Math.random() * symbols.length));
    },

    // 3. Рандомный отступ
    randomPadding: () => {
      return ' '.repeat(Math.floor(Math.random() * settings.paddingSpaces) + 1);
    },

    // 4. Рандомное число
    randomNumber: () => {
      const [min, max] = settings.numberRange;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // 5. Текст + число
    textWithNumber: () => {
      return `${GENERATORS.randomText()}${GENERATORS.randomNumber()}`;
    },

    // 6. Текст + пунктуация
    textWithPunctuation: () => {
      return `${GENERATORS.randomText()}${GENERATORS.randomPunctuation()}`;
    },

    // 7. Текст + число + пунктуация + отступ
    textFull: () => {
      return `${GENERATORS.randomPadding()}${GENERATORS.randomText()}${GENERATORS.randomNumber()}${GENERATORS.randomPunctuation()}${GENERATORS.randomPadding()}`;
    },

    // 8. Рандомное количество элементов
    randomCombination: (count = settings.elementCount) => {
      const types = [
        GENERATORS.randomText,
        GENERATORS.randomNumber,
        GENERATORS.randomPunctuation,
        GENERATORS.randomPadding
      ];
      let result = '';
      const actualCount = Math.floor(Math.random() * count) + 1;
      for (let i = 0; i < actualCount; i++) {
        const randomType = types[Math.floor(Math.random() * types.length)];
        result += randomType();
      }
      return result;
    },

    // 9. Кастомное значение из файла
    customValue: () => {
      if (customData.custom.length === 0) return 'No custom data';
      return customData.custom[Math.floor(Math.random() * customData.custom.length)];
    },

    // 10. Кастомные списки (текст, число, символы)
    fromCustomLists: () => {
      const parts = [];
      if (customData.texts.length > 0) {
        parts.push(customData.texts[Math.floor(Math.random() * customData.texts.length)]);
      }
      if (customData.numbers.length > 0) {
        parts.push(customData.numbers[Math.floor(Math.random() * customData.numbers.length)]);
      }
      if (customData.symbols.length > 0) {
        parts.push(customData.symbols[Math.floor(Math.random() * customData.symbols.length)]);
      }
      return parts.join('');
    }
  };

  /**
   * Создать панель в DOM
   */
  function createPanel() {
    let panel = document.getElementById('randomizer-v2-panel');
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'randomizer-v2-panel';
    panel.className = 'randomizer-v2-panel';

    panel.innerHTML = `
      <div class="randomizer-v2-header">
        <div class="randomizer-v2-title">
          <span>🎲</span> Advanced Randomizer v2
        </div>
        <div class="randomizer-v2-controls">
          <button id="randomizer-v2-collapse" class="randomizer-btn" title="Свернуть">
            <i class="bi bi-chevron-up"></i>
          </button>
          <button id="randomizer-v2-close" class="randomizer-btn" title="Закрыть">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>

      <div class="randomizer-v2-content">
        <!-- TABS -->
        <div class="randomizer-v2-tabs">
          <button class="randomizer-v2-tab active" data-tab="generators">
            📊 Генераторы (10)
          </button>
          <button class="randomizer-v2-tab" data-tab="settings">
            ⚙️ Настройки
          </button>
          <button class="randomizer-v2-tab" data-tab="preview">
            👁️ Предпросмотр
          </button>
        </div>

        <!-- TAB: GENERATORS -->
        <div id="tab-generators" class="randomizer-v2-tab-content active">
          <div class="randomizer-v2-generators">
            
            <!-- 1. Random Text -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="randomText" checked>
                <span>📝 Рандомный текст</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="randomText">Generate</button>
            </div>

            <!-- 2. Random Punctuation -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="randomPunctuation" checked>
                <span>❗ Рандомный знак пунктуации</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="randomPunctuation">Generate</button>
            </div>

            <!-- 3. Random Padding -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="randomPadding" checked>
                <span>↔️ Рандомный отступ</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="randomPadding">Generate</button>
            </div>

            <!-- 4. Random Number -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="randomNumber" checked>
                <span>🔢 Рандомное число</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="randomNumber">Generate</button>
            </div>

            <!-- 5. Text + Number -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="textWithNumber" checked>
                <span>📝🔢 Текст + число</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="textWithNumber">Generate</button>
            </div>

            <!-- 6. Text + Punctuation -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="textWithPunctuation" checked>
                <span>📝❗ Текст + пунктуация</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="textWithPunctuation">Generate</button>
            </div>

            <!-- 7. Text Full -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="textFull" checked>
                <span>✨ Полный: текст+число+пункт+отступ</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="textFull">Generate</button>
            </div>

            <!-- 8. Random Combination -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="randomCombination" checked>
                <span>🎯 Рандомная комбинация элементов</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="randomCombination">Generate</button>
            </div>

            <!-- 9. Custom Value -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="customValue">
                <span>📦 Кастомное значение из файла</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="customValue">Generate</button>
            </div>

            <!-- 10. From Custom Lists -->
            <div class="randomizer-gen-item">
              <label>
                <input type="checkbox" class="randomizer-gen-toggle" value="fromCustomLists">
                <span>📋 Из кастомных списков</span>
              </label>
              <button class="randomizer-gen-btn" data-gen="fromCustomLists">Generate</button>
            </div>
          </div>

          <!-- BATCH GENERATION -->
          <div class="randomizer-batch">
            <div class="randomizer-batch-controls">
              <input type="number" id="batch-count" class="randomizer-input" value="5" min="1" max="100" placeholder="Количество">
              <button id="batch-generate-btn" class="randomizer-btn-primary">🔄 Генерировать набор</button>
            </div>
            <div id="batch-output" class="randomizer-output"></div>
          </div>
        </div>

        <!-- TAB: SETTINGS -->
        <div id="tab-settings" class="randomizer-v2-tab-content">
          <div class="randomizer-settings">
            <div class="randomizer-setting-item">
              <label>Длина текста:</label>
              <input type="number" id="text-length-input" class="randomizer-input" value="10" min="1" max="100">
            </div>

            <div class="randomizer-setting-item">
              <label>Диапазон чисел:</label>
              <div class="randomizer-range">
                <input type="number" id="number-min" class="randomizer-input" value="1" placeholder="Min">
                <span>-</span>
                <input type="number" id="number-max" class="randomizer-input" value="1000" placeholder="Max">
              </div>
            </div>

            <div class="randomizer-setting-item">
              <label>Длина символов:</label>
              <input type="number" id="symbols-length-input" class="randomizer-input" value="5" min="1" max="50">
            </div>

            <div class="randomizer-setting-item">
              <label>Количество отступов:</label>
              <input type="number" id="padding-spaces-input" class="randomizer-input" value="2" min="1" max="20">
            </div>

            <div class="randomizer-setting-item">
              <label>Количество элементов в комбо:</label>
              <input type="number" id="element-count-input" class="randomizer-input" value="5" min="1" max="20">
            </div>

            <!-- FILE UPLOAD -->
            <div class="randomizer-setting-item">
              <label>📁 Загрузить JSON/TXT:</label>
              <input type="file" id="custom-file-input" class="randomizer-input" accept=".json,.txt">
              <small>JSON: {"texts": [], "numbers": [], "symbols": []}</small>
            </div>
          </div>
        </div>

        <!-- TAB: PREVIEW -->
        <div id="tab-preview" class="randomizer-v2-tab-content">
          <div class="randomizer-preview">
            <h4>Результаты</h4>
            <div id="preview-output" class="randomizer-output-large"></div>
            <button id="copy-preview-btn" class="randomizer-btn-secondary">📋 Скопировать</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    attachEventListeners();
  }

  /**
   * Прикрепить слушатели событий
   */
  function attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.randomizer-v2-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        document.querySelectorAll('.randomizer-v2-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.randomizer-v2-tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
      });
    });

    // Individual generators
    document.querySelectorAll('.randomizer-gen-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const genType = btn.dataset.gen;
        if (GENERATORS[genType]) {
          const result = GENERATORS[genType]();
          displayPreview(result);
        }
      });
    });

    // Batch generation
    document.getElementById('batch-generate-btn')?.addEventListener('click', () => {
      const count = parseInt(document.getElementById('batch-count').value) || 5;
      const enabled = Array.from(document.querySelectorAll('.randomizer-gen-toggle:checked')).map(c => c.value);
      
      if (enabled.length === 0) {
        alert('Выбери хотя бы один генератор!');
        return;
      }

      const results = [];
      for (let i = 0; i < count; i++) {
        const randomGen = enabled[Math.floor(Math.random() * enabled.length)];
        results.push(GENERATORS[randomGen]());
      }

      document.getElementById('batch-output').innerHTML = `
        <div style="background: #444; padding: 12px; border-radius: 4px; color: #0f0; font-family: monospace; font-size: 12px;">
          ${results.map((r, i) => `<div>${i + 1}. <code>${escapeHtml(r)}</code></div>`).join('')}
        </div>
      `;
    });

    // Settings
    document.getElementById('text-length-input')?.addEventListener('change', (e) => {
      settings.textLength = parseInt(e.target.value) || 10;
    });

    document.getElementById('number-min')?.addEventListener('change', (e) => {
      settings.numberRange[0] = parseInt(e.target.value) || 1;
    });

    document.getElementById('number-max')?.addEventListener('change', (e) => {
      settings.numberRange[1] = parseInt(e.target.value) || 1000;
    });

    // File upload
    document.getElementById('custom-file-input')?.addEventListener('change', handleFileUpload);

    // Close/collapse
    document.getElementById('randomizer-v2-close')?.addEventListener('click', () => {
      const panel = document.getElementById('randomizer-v2-panel');
      if (panel) panel.style.display = 'none';
    });

    document.getElementById('randomizer-v2-collapse')?.addEventListener('click', () => {
      const content = document.querySelector('.randomizer-v2-content');
      if (content) content.style.display = content.style.display === 'none' ? 'flex' : 'none';
    });

    // Copy preview
    document.getElementById('copy-preview-btn')?.addEventListener('click', () => {
      const text = document.getElementById('preview-output').textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('✅ Скопировано!');
      });
    });
  }

  /**
   * Обработка загрузки файла
   */
  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(event.target.result);
          customData = data;
        } else if (file.name.endsWith('.txt')) {
          customData.custom = event.target.result.split('\n').filter(l => l.trim());
        }
        alert('✅ Данные загружены!');
      } catch (err) {
        alert('❌ Ошибка загрузки: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Показать предпросмотр
   */
  function displayPreview(value) {
    const preview = document.getElementById('preview-output');
    if (preview) {
      preview.innerHTML += `<div class="preview-item"><code>${escapeHtml(value)}</code></div>`;
      preview.scrollTop = preview.scrollHeight;
    }
  }

  /**
   * Экранировать HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  return {
    show: () => {
      createPanel();
      document.getElementById('randomizer-v2-panel').style.display = 'flex';
    },
    hide: () => {
      const panel = document.getElementById('randomizer-v2-panel');
      if (panel) panel.style.display = 'none';
    }
  };
})();

// Init
document.addEventListener('DOMContentLoaded', () => {
  RandomizerV2.show();
});
