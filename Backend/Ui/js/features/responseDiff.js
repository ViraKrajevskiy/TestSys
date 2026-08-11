/**
 * responseDiff.js — Сравнение двух ответов side-by-side
 */
window.App = window.App || {};

(function () {

  App.showResponseDiff = function () {
    const tab = App.getActiveTab();
    if (!tab) return;
    const history = App.getResponseHistory(tab);
    if (history.length < 2) {
      App.showAlert("Нужно минимум 2 ответа в истории для сравнения.");
      return;
    }

    document.getElementById("diff-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "diff-modal";
    modal.className = "app-modal-backdrop";

    const opts = history.map((h, i) => {
      const time = new Date(h.ts).toLocaleTimeString();
      const sc = h.response?.status_code || "err";
      return `<option value="${i}">${i === 0 ? "Текущий" : "#" + (i + 1)} — ${sc} (${time})</option>`;
    }).join("");

    modal.innerHTML = `
      <div class="app-modal" style="max-width:960px;width:96%;max-height:90vh;display:flex;flex-direction:column;">
        <div class="app-modal-header">
          <span><i class="bi bi-file-diff me-2"></i>Сравнение ответов</span>
          <button class="app-modal-close" id="diff-close">&times;</button>
        </div>
        <div class="app-modal-body" style="flex:1;overflow:hidden;display:flex;flex-direction:column;padding:0;">
          <div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center;">
            <label style="font-size:12px;color:var(--text-dim);">Левый:</label>
            <select id="diff-left" class="form-select form-select-sm" style="width:auto;flex:1;min-width:140px;">${opts}</select>
            <label style="font-size:12px;color:var(--text-dim);">Правый:</label>
            <select id="diff-right" class="form-select form-select-sm" style="width:auto;flex:1;min-width:140px;">${opts}</select>
            <button id="diff-go" class="btn send-btn btn-sm">Сравнить</button>
          </div>
          <div id="diff-result" style="flex:1;overflow:auto;padding:0;"></div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Default: 0 vs 1
    modal.querySelector("#diff-right").value = "1";

    modal.querySelector("#diff-close").onclick = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

    const doCompare = () => {
      const li = parseInt(modal.querySelector("#diff-left").value);
      const ri = parseInt(modal.querySelector("#diff-right").value);
      if (li === ri) {
        modal.querySelector("#diff-result").innerHTML =
          '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px;">Выберите разные ответы</div>';
        return;
      }
      const left = history[li];
      const right = history[ri];
      _renderDiff(modal.querySelector("#diff-result"), left, right);
    };

    modal.querySelector("#diff-go").addEventListener("click", doCompare);
    doCompare();
  };

  function _renderDiff(container, left, right) {
    const lText = _formatText(left.response);
    const rText = _formatText(right.response);
    const lLines = lText.split("\n");
    const rLines = rText.split("\n");

    // Simple LCS-based diff
    const diff = _diffLines(lLines, rLines);

    // Status comparison header
    const lSc = left.response?.status_code || "err";
    const rSc = right.response?.status_code || "err";
    const lTime = left.response?.elapsed_ms || "—";
    const rTime = right.response?.elapsed_ms || "—";

    let html = `
      <div style="display:flex;gap:0;font-size:11px;border-bottom:1px solid var(--border);">
        <div style="flex:1;padding:8px 12px;background:var(--bg-input);border-right:1px solid var(--border);">
          <span style="font-weight:600;">${lSc}</span> · ${lTime}ms · ${new Date(left.ts).toLocaleTimeString()}
        </div>
        <div style="flex:1;padding:8px 12px;background:var(--bg-input);">
          <span style="font-weight:600;">${rSc}</span> · ${rTime}ms · ${new Date(right.ts).toLocaleTimeString()}
        </div>
      </div>
      <div style="display:flex;gap:0;font-family:'Consolas',monospace;font-size:11px;">
        <pre class="diff-col diff-left" style="flex:1;margin:0;padding:8px;overflow-x:auto;border-right:1px solid var(--border);white-space:pre-wrap;word-break:break-all;">`;

    let leftHtml = "", rightHtml = "";
    diff.forEach(d => {
      if (d.type === "equal") {
        leftHtml  += _esc(d.line) + "\n";
        rightHtml += _esc(d.line) + "\n";
      } else if (d.type === "removed") {
        leftHtml  += `<span style="background:rgba(244,67,54,.15);display:block;">${_esc(d.line)}</span>`;
        rightHtml += "\n";
      } else if (d.type === "added") {
        leftHtml  += "\n";
        rightHtml += `<span style="background:rgba(76,175,80,.15);display:block;">${_esc(d.line)}</span>`;
      }
    });

    html += leftHtml + `</pre>
        <pre class="diff-col diff-right" style="flex:1;margin:0;padding:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">`;
    html += rightHtml + `</pre></div>`;

    container.innerHTML = html;

    // Sync scroll
    const leftCol = container.querySelector(".diff-left");
    const rightCol = container.querySelector(".diff-right");
    let syncing = false;
    const syncScroll = (source, target) => {
      if (syncing) return;
      syncing = true;
      target.scrollTop = source.scrollTop;
      syncing = false;
    };
    leftCol.addEventListener("scroll", () => syncScroll(leftCol, rightCol));
    rightCol.addEventListener("scroll", () => syncScroll(rightCol, leftCol));
  }

  function _formatText(resp) {
    if (!resp || !resp.text) return "(пусто)";
    try {
      return JSON.stringify(JSON.parse(resp.text), null, 2);
    } catch {
      return resp.text;
    }
  }

  // Simple line diff (Myers-like but simplified)
  function _diffLines(a, b) {
    const result = [];
    const m = a.length, n = b.length;

    // Build LCS table
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // Backtrack
    let i = m, j = n;
    const ops = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        ops.push({ type: "equal", line: a[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: "added", line: b[j - 1] });
        j--;
      } else {
        ops.push({ type: "removed", line: a[i - 1] });
        i--;
      }
    }
    return ops.reverse();
  }

  function _esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

})();
