/**
 * postmanImport.js — импорт Postman Collection v2 / v2.1.
 *
 * Формат: { info: { name, schema }, item: [ ... ] }
 * Каждый item — либо папка (item[]), либо запрос (request: { method, url, header, body }).
 * Рекурсивно превращаем в TestSys-коллекцию.
 */
window.App = window.App || {};

(function () {

  /**
   * Разобрать Postman Collection JSON и вернуть TestSys-коллекцию.
   * Бросает ошибку если структура нераспознана.
   */
  function _parsePostman(raw) {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || !data.info || !Array.isArray(data.item)) {
      throw new Error("Не похоже на Postman Collection v2: нет поля info.name или item[]");
    }

    const colName = (data.info.name || "Postman Import").trim();
    const folders  = [];

    // Рекурсивный обход: item[] может содержать папки (у них есть item[])
    // или запросы (у них есть request {}).
    function _walk(items, parentFolderName) {
      const requests = [];
      (items || []).forEach(node => {
        if (Array.isArray(node.item) && node.item.length) {
          // Это папка — создаём отдельную папку в TestSys
          const folderName = (node.name || "Folder").trim();
          const sub = _walkRequests(node.item);
          if (sub.length) {
            folders.push({ name: _uniqueFolderName(folders, folderName), items: sub });
          }
          // Папки внутри папок (вложенность > 1) — плоско кладём под уровень коллекции
          _walkNestedFolders(node.item, colName, folders);
        } else if (node.request) {
          requests.push(_convertRequest(node));
        }
      });
      return requests;
    }

    function _walkNestedFolders(items, _colName, foldersArr) {
      (items || []).forEach(node => {
        if (Array.isArray(node.item) && node.item.length) {
          // Вложенные папки — дополняем верхний уровень с уточнённым именем
          const folderName = (node.name || "Folder").trim();
          const sub = _walkRequests(node.item);
          if (sub.length) {
            foldersArr.push({ name: _uniqueFolderName(foldersArr, folderName), items: sub });
          }
          _walkNestedFolders(node.item, _colName, foldersArr);
        }
      });
    }

    function _walkRequests(items) {
      const out = [];
      (items || []).forEach(node => {
        if (node.request) out.push(_convertRequest(node));
      });
      return out;
    }

    // Запросы верхнего уровня (без папки) — в папку «General»
    const topRequests = [];
    (data.item || []).forEach(node => {
      if (!Array.isArray(node.item) && node.request) {
        topRequests.push(_convertRequest(node));
      }
    });

    // Обработать папки из первого уровня
    (data.item || []).forEach(node => {
      if (Array.isArray(node.item) && node.item.length) {
        const folderName = (node.name || "Folder").trim();
        const sub = _walkRequests(node.item);
        if (sub.length) {
          folders.push({ name: _uniqueFolderName(folders, folderName), items: sub });
        }
        // Вложенные папки
        _walkNestedFolders(node.item, colName, folders);
      }
    });

    if (topRequests.length) {
      folders.unshift({ name: "General", items: topRequests });
    }

    if (!folders.length) {
      throw new Error("Коллекция пуста — запросов не найдено");
    }

    return { name: colName, folders };
  }

  function _uniqueFolderName(existing, name) {
    let n = name, i = 1;
    while (existing.find(f => f.name === n)) n = `${name} (${++i})`;
    return n;
  }

  /**
   * Конвертировать один Postman-запрос в TestSys-формат.
   */
  function _convertRequest(node) {
    const req = node.request || {};
    const method = (typeof req.method === "string" ? req.method : "GET").toUpperCase();
    const url    = _extractUrl(req.url);
    const name   = (node.name || url || "Request").trim();

    const entry = { name, method, url };

    // Описание (Notes) — в Postman лежит на request.description или на node
    const desc = (req.description && (typeof req.description === "string" ? req.description : req.description.content))
              || node.description || "";
    if (desc && String(desc).trim()) entry.description = String(desc).trim();

    // Заголовки
    if (Array.isArray(req.header) && req.header.length) {
      const hdrs = req.header
        .filter(h => !h.disabled)
        .map(h => ({ key: h.key || "", value: h.value || "" }));
      if (hdrs.length) entry.headers = hdrs;
    }

    // Тело
    if (req.body) {
      const body = req.body;
      if (body.mode === "raw" && body.raw) {
        entry.body = body.raw;
      } else if (body.mode === "urlencoded" && Array.isArray(body.urlencoded)) {
        // Сериализуем в строку key=value&...
        entry.body = body.urlencoded
          .filter(f => !f.disabled)
          .map(f => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value || "")}`)
          .join("&");
      } else if (body.mode === "formdata" && Array.isArray(body.formdata)) {
        // Сохраняем как JSON-мета — пользователь видит Body
        const fd = body.formdata.filter(f => !f.disabled).map(f => ({ key: f.key, value: f.value || "" }));
        if (fd.length) entry.formFields = fd;
      }
    }

    // Pre-request / Tests скрипты
    if (Array.isArray(node.event)) {
      node.event.forEach(ev => {
        const script = (ev.script && ev.script.exec)
          ? (Array.isArray(ev.script.exec) ? ev.script.exec.join("\n") : ev.script.exec)
          : "";
        if (!script.trim()) return;
        if (ev.listen === "prerequest") entry.preScript  = script;
        if (ev.listen === "test")       entry.testScript = script;
      });
    }

    // Авторизация
    if (req.auth) {
      const auth = _convertAuth(req.auth);
      if (auth) entry.auth = auth;
    }

    return entry;
  }

  function _extractUrl(u) {
    if (!u) return "";
    if (typeof u === "string") return u;
    // Postman v2.1: url = { raw, host, path, query, variable }
    if (u.raw) return u.raw;
    const host = Array.isArray(u.host) ? u.host.join(".") : (u.host || "");
    const path = Array.isArray(u.path) ? "/" + u.path.join("/") : (u.path || "");
    return host + path;
  }

  function _convertAuth(auth) {
    const t = (auth.type || "").toLowerCase();
    if (t === "bearer") {
      const tok = _authVal(auth.bearer, "token");
      return tok ? { type: "bearer", token: tok } : null;
    }
    if (t === "basic") {
      return {
        type: "basic",
        username: _authVal(auth.basic, "username") || "",
        password: _authVal(auth.basic, "password") || "",
      };
    }
    if (t === "apikey") {
      return {
        type: "apikey",
        key:   _authVal(auth.apikey, "key")   || "",
        value: _authVal(auth.apikey, "value") || "",
        in:    _authVal(auth.apikey, "in")    || "header",
      };
    }
    return null;
  }

  function _authVal(arr, key) {
    if (!Array.isArray(arr)) return arr && arr[key];
    const item = arr.find(x => x.key === key);
    return item ? item.value : undefined;
  }

  // ──────────────────────────────────────────────────────────────
  // Публичный API
  // ──────────────────────────────────────────────────────────────

  /**
   * Открыть файловый диалог, прочитать Postman JSON и импортировать.
   * Возвращает { ok, added, cancelled, error }.
   */
  App.importPostmanCollection = async function () {
    // Используем стандартный api.py диалог выбора файла
    let raw = null;
    if (window.pywebview && window.pywebview.api && window.pywebview.api.import_collection_file) {
      try {
        const res = await window.pywebview.api.import_collection_file();
        if (res && res.cancelled) return { ok: false, cancelled: true };
        if (res && res.ok && res.content) raw = res.content;
        else if (res && !res.ok) return { ok: false, error: res.error || "Ошибка чтения файла" };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    } else {
      // Фоллбэк: <input type="file">
      raw = await _pickFileWeb();
    }

    if (!raw) return { ok: false, cancelled: true };

    let parsed;
    try {
      parsed = _parsePostman(raw);
    } catch (e) {
      return { ok: false, error: String(e) };
    }

    // Добавляем в коллекции
    const existing = (App.USER_COLLECTIONS || []).find(c => c.name === parsed.name);
    if (existing) {
      // Слияние: добавляем папки с уникальными именами
      (parsed.folders || []).forEach(f => {
        const ex = existing.folders.find(ef => ef.name === f.name);
        if (ex) {
          ex.items = [...(ex.items || []), ...(f.items || [])];
        } else {
          existing.folders.push(f);
        }
      });
    } else {
      App.USER_COLLECTIONS = App.USER_COLLECTIONS || [];
      App.USER_COLLECTIONS.push(parsed);
    }

    App.saveCollections && App.saveCollections();
    App.renderCollections && App.renderCollections();

    return { ok: true, added: [parsed.name] };
  };

  function _pickFileWeb() {
    return new Promise(resolve => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".json";
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) { resolve(null); return; }
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = () => resolve(null);
        r.readAsText(f, "utf-8");
      };
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }
})();
