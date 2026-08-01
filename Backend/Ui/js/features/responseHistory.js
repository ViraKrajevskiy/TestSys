/**
 * responseHistory.js — история ответов + сравнение с эталоном (baseline diff).
 *
 * История: последние N (=20) ответов на активной вкладке. Кнопка в панели
 * ответа открывает выпадающий список — можно посмотреть предыдущий ответ.
 *
 * Diff: пользователь жмёт «Сохранить как эталон» — текущий ответ становится
 * `tab.baselineResponse`. Следующий раз, когда получаем ответ на этот запрос,
 * сравниваем и подсвечиваем добавленные/удалённые/изменённые ключи. Ловит
 * regression'ы, о которых сам бы не подумал.
 */
window.App = window.App || {};

(function () {
  const MAX_HISTORY = 20;

  /** Добавить ответ в историю вкладки. Копируем, не ссылка. */
  App.pushResponseHistory = function (tab, resp, meta) {
    if (!tab || !resp) return;
    tab.responseHistory = tab.responseHistory || [];
    const entry = {
      ts: Date.now(),
      method: meta && meta.method || tab.method,
      url:    meta && meta.url    || tab.url,
      response: resp,     // сам ответ (уже свежий объект от send_request)
    };
    tab.responseHistory.unshift(entry);
    if (tab.responseHistory.length > MAX_HISTORY) {
      tab.responseHistory.length = MAX_HISTORY;
    }
  };

  App.getResponseHistory = (tab) => (tab && tab.responseHistory) || [];

  /** Показать конкретный ответ из истории — просто подставляем в tab.response. */
  App.showHistoricResponse = function (tab, index) {
    const h = App.getResponseHistory(tab);
    if (!h[index]) return;
    // Помечаем что смотрим историю — иначе UI решит что это свежий ответ
    tab.response = h[index].response;
    tab.viewingHistoryIndex = index;
    App.renderTabContent && App.renderTabContent();
  };

  App.clearResponseHistory = function (tab) {
    if (!tab) return;
    tab.responseHistory = [];
    App.renderTabContent && App.renderTabContent();
  };

  // ============================================================
  // BASELINE + DIFF
  // ============================================================
  App.saveBaseline = function (tab) {
    if (!tab || !tab.response) return false;
    tab.baselineResponse = JSON.parse(JSON.stringify(tab.response));
    tab.baselineSavedAt = Date.now();
    App.renderTabContent && App.renderTabContent();
    App.syncToast && App.syncToast(App.t("baselineSaved") || "Эталон сохранён");
    return true;
  };

  App.clearBaseline = function (tab) {
    if (!tab) return;
    tab.baselineResponse = null;
    tab.baselineSavedAt = 0;
    App.renderTabContent && App.renderTabContent();
  };

  /**
   * Сравнить текущий ответ с эталоном. Работаем на структуре JSON, если оба
   * тела разбираются как JSON. Иначе — плоский текстовый diff по строкам.
   */
  App.diffWithBaseline = function (tab) {
    if (!tab || !tab.response || !tab.baselineResponse) return null;
    const cur = _parseSafe(tab.response.text);
    const base = _parseSafe(tab.baselineResponse.text);

    // Заголовок с общей информацией
    const meta = {
      statusChanged: tab.baselineResponse.status_code !== tab.response.status_code,
      baseStatus: tab.baselineResponse.status_code,
      curStatus:  tab.response.status_code,
      elapsedDelta: (tab.response.elapsed_ms || 0) - (tab.baselineResponse.elapsed_ms || 0),
    };

    if (cur && base && (typeof cur === "object" && typeof base === "object")) {
      return { meta, mode: "json", diff: _diffJson(base, cur) };
    }
    // Текстовый режим: по строкам
    const bLines = String(tab.baselineResponse.text || "").split("\n");
    const cLines = String(tab.response.text || "").split("\n");
    return { meta, mode: "text", diff: _diffLines(bLines, cLines) };
  };

  function _parseSafe(t) {
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  /**
   * Простой structural diff двух JSON. Возвращает плоский массив изменений:
   *   { path, kind: "added"|"removed"|"changed", from?, to? }
   */
  function _diffJson(base, cur, path = "$") {
    const out = [];
    const bIsObj = base && typeof base === "object" && !Array.isArray(base);
    const cIsObj = cur  && typeof cur  === "object" && !Array.isArray(cur);
    const bIsArr = Array.isArray(base);
    const cIsArr = Array.isArray(cur);

    if (bIsObj && cIsObj) {
      const keys = new Set([...Object.keys(base), ...Object.keys(cur)]);
      keys.forEach(k => {
        const p = `${path}.${k}`;
        if (!(k in cur))       out.push({ path: p, kind: "removed", from: base[k] });
        else if (!(k in base)) out.push({ path: p, kind: "added",   to: cur[k] });
        else out.push(..._diffJson(base[k], cur[k], p));
      });
    } else if (bIsArr && cIsArr) {
      const max = Math.max(base.length, cur.length);
      for (let i = 0; i < max; i++) {
        const p = `${path}[${i}]`;
        if (i >= cur.length)  out.push({ path: p, kind: "removed", from: base[i] });
        else if (i >= base.length) out.push({ path: p, kind: "added", to: cur[i] });
        else out.push(..._diffJson(base[i], cur[i], p));
      }
    } else {
      // Примитивы: сравниваем через JSON.stringify — универсально для чисел, строк, null, bool
      if (JSON.stringify(base) !== JSON.stringify(cur)) {
        out.push({ path, kind: "changed", from: base, to: cur });
      }
    }
    return out;
  }

  /** Простой диф по строкам — не оптимальный, но читаемый: помечаем что добавилось/убыло. */
  function _diffLines(base, cur) {
    const setB = new Set(base);
    const setC = new Set(cur);
    const out = [];
    base.forEach(l => { if (!setC.has(l)) out.push({ kind: "removed", line: l }); });
    cur.forEach(l  => { if (!setB.has(l)) out.push({ kind: "added",   line: l }); });
    return out;
  }
})();
