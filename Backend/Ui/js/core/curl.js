/**
 * curl.js — парсинг и генерация cURL-команд.
 *
 * Импорт: пользователь вставляет строку `curl -X POST 'https://...' -H '...' -d '...'`,
 * получает готовый {method, url, headers, body}. Поддерживаем оба стиля флагов:
 * длинные --header и короткие -H, --data и -d, --request и -X, и т.п.
 * Переносы строк через \ (unix) и ^ (windows) убираем перед парсингом.
 *
 * Экспорт: строим воспроизводимый curl из объекта вкладки. Одиночные
 * кавычки экранируем через '\'' (стандартный трюк для shell).
 */
window.App = window.App || {};

(function () {
  // ============================================================
  // ПАРСИНГ CURL
  // ============================================================
  App.parseCurl = function (text) {
    if (!text || typeof text !== "string") return { ok: false, error: "Пусто" };

    // Убираем переносы строк: \ (bash), ^ (cmd), плюс подряд идущие whitespace
    let s = text.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ").trim();

    // Обрезаем «curl» в начале если есть
    if (/^\s*curl\b/i.test(s)) s = s.replace(/^\s*curl\s+/i, "");

    const tokens = _tokenize(s);
    if (!tokens.length) return { ok: false, error: "Не удалось разобрать команду" };

    const out = {
      method: "GET", url: "",
      headers: [], params: [], body: "",
      userAgent: "",
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const next = () => tokens[++i];

      // Флаги, у которых есть значение
      if (t === "-X" || t === "--request") { out.method = (next() || "GET").toUpperCase(); continue; }
      if (t === "-H" || t === "--header")  { _addHeader(out, next()); continue; }
      if (t === "-A" || t === "--user-agent") { out.userAgent = next() || ""; continue; }
      if (t === "-u" || t === "--user")    {
        // basic auth → превращаем в Authorization
        const v = next(); if (v) out.headers.push({ key: "Authorization", value: "Basic " + btoa(v), enabled: true });
        continue;
      }
      if (t === "-b" || t === "--cookie")  { out.headers.push({ key: "Cookie", value: next() || "", enabled: true }); continue; }
      if (t === "-e" || t === "--referer") { out.headers.push({ key: "Referer", value: next() || "", enabled: true }); continue; }

      // Body-флаги (разные варианты)
      if (t === "-d" || t === "--data" || t === "--data-raw" ||
          t === "--data-ascii" || t === "--data-urlencode") {
        const v = next() || "";
        out.body = out.body ? out.body + "&" + v : v;
        if (out.method === "GET") out.method = "POST";      // curl тоже так делает
        continue;
      }
      if (t === "--data-binary" || t === "--data-raw-binary") {
        out.body = next() || ""; if (out.method === "GET") out.method = "POST"; continue;
      }
      if (t === "-G" || t === "--get") { out.method = "GET"; continue; }

      // Пропускаемые (не мешают)
      if (t === "-k" || t === "--insecure") continue;
      if (t === "-L" || t === "--location") continue;
      if (t === "-i" || t === "--include") continue;
      if (t === "-s" || t === "--silent") continue;
      if (t === "-v" || t === "--verbose") continue;
      if (t === "--compressed") continue;

      // Флаги, у которых есть значение, но нам не нужны
      if (t === "-o" || t === "--output" || t === "-K" || t === "--config" ||
          t === "--connect-timeout" || t === "-m" || t === "--max-time") {
        next(); continue;
      }

      // Всё остальное, что не флаг — считаем URL
      if (!t.startsWith("-") && !out.url) {
        out.url = _stripQuotes(t);
        continue;
      }
    }

    if (!out.url) return { ok: false, error: "URL в команде не найден" };

    // Если body похож на form-urlencoded (a=1&b=2), Content-Type обычно уже
    // задан пользователем; если нет — добавим для GET-конверсии
    if (out.body && !_hasHeader(out, "content-type")) {
      out.headers.push({
        key: "Content-Type",
        value: _looksLikeJson(out.body) ? "application/json" : "application/x-www-form-urlencoded",
        enabled: true,
      });
    }

    // Query-параметры вытаскиваем из URL в отдельный список — так удобнее
    const q = out.url.indexOf("?");
    if (q > -1) {
      const qs = out.url.slice(q + 1);
      out.url = out.url.slice(0, q);
      qs.split("&").forEach(pair => {
        const [k, v = ""] = pair.split("=");
        if (k) out.params.push({
          key: decodeURIComponent(k), value: decodeURIComponent(v), enabled: true,
        });
      });
    }

    return { ok: true, request: out };
  };

  function _addHeader(out, raw) {
    if (!raw) return;
    const s = _stripQuotes(raw);
    const idx = s.indexOf(":");
    if (idx < 0) return;
    const key = s.slice(0, idx).trim();
    const val = s.slice(idx + 1).trim();
    if (!key) return;
    out.headers.push({ key, value: val, enabled: true });
  }

  function _stripQuotes(s) {
    if (!s) return "";
    if ((s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function _hasHeader(out, name) {
    const n = name.toLowerCase();
    return out.headers.some(h => (h.key || "").toLowerCase() === n);
  }

  function _looksLikeJson(s) {
    s = s.trim();
    return (s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"));
  }

  /**
   * Токенизация с поддержкой кавычек. Не полноценный shell-парсер, но
   * покрывает 99% реальных curl-команд из документации.
   */
  function _tokenize(s) {
    const out = [];
    let cur = "";
    let inQuote = null;   // '\'', '"' or null
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuote) {
        if (c === inQuote) { inQuote = null; continue; }
        cur += c;
      } else {
        if (c === "'" || c === '"') { inQuote = c; continue; }
        if (/\s/.test(c)) {
          if (cur) { out.push(cur); cur = ""; }
        } else {
          cur += c;
        }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  // ============================================================
  // ГЕНЕРАЦИЯ CURL из вкладки
  // ============================================================
  App.toCurl = function (tab, opts) {
    if (!tab) return "";
    opts = opts || {};
    const platform = opts.platform || "bash";     // "bash" | "cmd"
    const q = platform === "cmd" ? '"' : "'";
    const esc = (v) => {
      const s = String(v ?? "");
      if (platform === "cmd") return s.replace(/"/g, '\\"');
      return s.replace(/'/g, "'\\''");             // bash-стандарт для одиночной
    };

    const resolve = App.resolveAll || App.resolveVariables || ((s) => s);
    const method = (tab.method || "GET").toUpperCase();
    let url = resolve(tab.url || "");
    // Пришиваем query-параметры
    const pick = App.activeRows || ((rows) => (rows || []).filter(r => r.enabled !== false && (r.key || "").trim()));
    const params = pick(tab.params);
    if (params.length) {
      const qs = params.map(p => encodeURIComponent(resolve(p.key)) + "=" +
                                 encodeURIComponent(resolve(p.value))).join("&");
      url += (url.includes("?") ? "&" : "?") + qs;
    }

    const parts = [`curl -X ${method} ${q}${esc(url)}${q}`];
    const hasFiles = Array.isArray(tab.files) && tab.files.length > 0;
    const headers = pick(tab.headers);
    headers.forEach(h => {
      // При multipart curl сам поставит Content-Type c boundary — не дублируем
      if (hasFiles && (h.key || "").toLowerCase() === "content-type") return;
      parts.push(`-H ${q}${esc(resolve(h.key) + ": " + resolve(h.value))}${q}`);
    });
    if (tab.userAgent) {
      parts.push(`-A ${q}${esc(resolve(tab.userAgent))}${q}`);
    }
    if (hasFiles) {
      tab.files.forEach(f => {
        if (!f || !f.path || !(f.field || "").trim()) return;
        parts.push(`-F ${q}${esc(resolve(f.field).trim() + "=@" + f.path)}${q}`);
      });
      (tab.formFields || [])
        .filter(f => (f.enabled !== false) && (f.key || "").trim())
        .forEach(f => {
          parts.push(`-F ${q}${esc(resolve(f.key).trim() + "=" + resolve(f.value || ""))}${q}`);
        });
    } else {
      const body = tab.body ? resolve(tab.body) : "";
      if (body && !["GET", "HEAD"].includes(method)) {
        parts.push(`--data-raw ${q}${esc(body)}${q}`);
      }
    }

    const sep = platform === "cmd" ? " ^\n  " : " \\\n  ";
    return parts.join(sep);
  };
})();
