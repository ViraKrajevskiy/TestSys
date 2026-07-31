"""
sync_server.py — LAN-сервер синхронизации коллекций.

Один компьютер становится хостом: поднимает HTTP-сервер на 0.0.0.0:<port>,
остальные подключаются по его IP. Использует только stdlib — никаких новых
зависимостей, безопасно для PyInstaller.

Endpoints:
    GET  /api/ping         -> {"ok": true, "host": "...", "version": N}
    GET  /api/collections  -> {"version": N, "updated_at": "...", "updated_by": "...", "collections": [...]}
    PUT  /api/collections  -> принимает то же тело, сохраняет, увеличивает version
"""

import hashlib
import json
import os
import secrets
import socket
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ============================================================
# STATE
# ============================================================
_server = None
_thread = None
_state_lock = threading.Lock()
_config = {
    "data_file": None,     # путь к shared_collections.json
    "users_file": None,    # users.json — учётки для режима require_login
    "acl_file": None,      # acl.json — права per-collection
    "token": "",           # опциональный shared-пароль (старый режим)
    "host_name": "",       # имя хоста для отображения
    "host_client_id": "",  # client_id владельца
    "require_login": False,# True → работает система users/ACL, shared-token отклоняется
}

# ============================================================
# СЕССИИ И ПОЛЬЗОВАТЕЛИ
# ============================================================
# _sessions хранит активные сессии — выдаются по login, живут N часов.
# Ключ — session_token (случайный hex 48 символов).
# Значение — {"user_id","name","role","expires_at","client_id"}.
# После рестарта сервера все сессии стираются — пользователям придётся
# войти заново. Это и безопасно, и просто (в файл сессии не пишем).
_sessions = {}
_sessions_lock = threading.Lock()
SESSION_TTL_SEC = 8 * 3600           # 8 часов
PBKDF2_ITER = 120_000                # itersions для хеша пароля

def _hash_password(password, salt):
    """PBKDF2-SHA256 — стандартный, стойкий, есть в stdlib."""
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITER
    ).hex()

def _load_users():
    """{user_id: {name, password_hash, salt, role, created_at}}"""
    path = _config.get("users_file")
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _save_users(users):
    path = _config.get("users_file")
    if not path:
        return False
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(users, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        return True
    except Exception:
        return False

def _load_acl():
    """{collection_name: {"read":[user_id|"*"], "write":[user_id|"*"]}}"""
    path = _config.get("acl_file")
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _save_acl(acl):
    path = _config.get("acl_file")
    if not path:
        return False
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(acl, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        return True
    except Exception:
        return False

def _find_user_by_name(name):
    users = _load_users()
    n = (name or "").strip().lower()
    for uid, u in users.items():
        if u.get("name", "").strip().lower() == n:
            return uid, u
    return None, None

def _create_session(user_id, user, client_id=""):
    token = secrets.token_hex(24)
    with _sessions_lock:
        _sessions[token] = {
            "user_id": user_id,
            "name": user.get("name", ""),
            "role": user.get("role", "member"),
            "expires_at": time.time() + SESSION_TTL_SEC,
            "client_id": client_id,
        }
    return token

def _get_session(token):
    if not token:
        return None
    with _sessions_lock:
        s = _sessions.get(token)
        if not s:
            return None
        if s["expires_at"] < time.time():
            _sessions.pop(token, None)
            return None
        return dict(s)

def _drop_session(token):
    with _sessions_lock:
        _sessions.pop(token, None)

def _can_read(collection_name, user_id, role):
    """Может ли пользователь читать эту коллекцию."""
    if role == "admin":
        return True
    acl = _load_acl().get(collection_name)
    if not acl:                      # без правил — по умолчанию доступно всем
        return True
    readers = acl.get("read", ["*"])
    return "*" in readers or user_id in readers

def _can_write(collection_name, user_id, role):
    if role == "admin":
        return True
    acl = _load_acl().get(collection_name)
    if not acl:
        return True
    writers = acl.get("write", ["*"])
    return "*" in writers or user_id in writers

def _filter_doc_for_user(doc, user_id, role):
    """Отфильтровать коллекции по правам чтения."""
    if role == "admin":
        return doc
    out = dict(doc)
    out["collections"] = [c for c in doc.get("collections", [])
                          if _can_read(c.get("name", ""), user_id, role)]
    return out

def _merge_write(current_doc, incoming, user_id, role):
    """
    Слить пуш от пользователя с текущим документом, применяя ACL:
      - коллекции, на которые нет write — берутся из current без изменений
      - остальные — из incoming
    Так member не может случайно затереть админскую коллекцию.
    """
    if role == "admin":
        return incoming.get("collections", [])
    cur_by_name = {c.get("name"): c for c in current_doc.get("collections", [])}
    inc_by_name = {c.get("name"): c for c in incoming.get("collections", [])}

    merged = []
    seen = set()
    # Сначала — те, что в incoming: применяем только с правом write, иначе current
    for name, inc in inc_by_name.items():
        seen.add(name)
        if _can_write(name, user_id, role):
            merged.append(inc)
        elif name in cur_by_name:
            merged.append(cur_by_name[name])
    # Плюс — то, что было в current и клиент вообще не прислал
    # (клиент может не иметь их в read-доступе, тогда просто сохраняем)
    for name, cur in cur_by_name.items():
        if name not in seen:
            merged.append(cur)
    return merged

# Активные клиенты. Ключ — client_id (UUID из клиента, живёт в его localStorage).
# Значение: {"name", "role", "first_seen", "last_seen", "ip"}. Клиент «онлайн»,
# если last_seen моложе LIVE_WINDOW_SEC. Старее — считается отвалившимся.
_clients = {}
_clients_lock = threading.Lock()
# Заблокированные client_id (после kick) до указанного unix-времени
_kicked = {}
LIVE_WINDOW_SEC = 30


def _now_iso():
    return datetime.now().isoformat(timespec="seconds")


def _empty_doc():
    return {
        "version": 0,
        "updated_at": _now_iso(),
        "updated_by": "",
        "collections": [],
        "variables": {},
    }


def _read_doc():
    """Прочитать документ с коллекциями из файла."""
    path = _config["data_file"]
    if not path or not os.path.exists(path):
        return _empty_doc()
    try:
        with open(path, "r", encoding="utf-8") as f:
            doc = json.load(f)
        if not isinstance(doc, dict):
            return _empty_doc()
        doc.setdefault("version", 0)
        doc.setdefault("collections", [])
        doc.setdefault("variables", {})
        doc.setdefault("updated_at", _now_iso())
        doc.setdefault("updated_by", "")
        return doc
    except Exception:
        return _empty_doc()


def _write_doc(doc):
    """Атомарная запись документа."""
    path = _config["data_file"]
    if not path:
        return False
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
        return True
    except Exception:
        return False


# ============================================================
# HTTP HANDLER
# ============================================================
class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # тишина в консоли

    # ---------- helpers ----------
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token, X-Client-Id, X-Client-Name")
        self.end_headers()
        self.wfile.write(body)

    def _session(self):
        """Достать сессию из X-Session-Token. None если нет/невалидна."""
        return _get_session(self.headers.get("X-Session-Token", "").strip())

    def _auth_ok(self):
        """
        Проверить авторизацию. Два режима:
          require_login=False (по умолчанию) — как раньше: shared X-Sync-Token.
          require_login=True — только по X-Session-Token из /api/auth/login.
        """
        if _config.get("require_login"):
            return self._session() is not None
        token = _config.get("token") or ""
        if not token:
            return True
        return self.headers.get("X-Sync-Token", "") == token

    def _current_user(self):
        """
        {user_id, role} — из сессии или синтетический для старого режима.
        В старом режиме все анонимы имеют role admin (обратная совместимость).
        """
        sess = self._session()
        if sess:
            return {"user_id": sess["user_id"], "role": sess["role"], "name": sess["name"]}
        # Владелец, входящий 127.0.0.1 — по умолчанию admin даже без сессии
        cid = self._client_id()
        if cid and cid == _config.get("host_client_id"):
            return {"user_id": cid, "role": "admin", "name": _config.get("host_name", "")}
        # В старом режиме — admin (нет ACL, нет ограничений)
        if not _config.get("require_login"):
            return {"user_id": cid or "anon", "role": "admin", "name": self._client_name()}
        return None

    def _client_id(self):
        return (self.headers.get("X-Client-Id") or "").strip()

    def _client_name(self):
        return (self.headers.get("X-Client-Name") or "").strip() or "user"

    def _client_ip(self):
        try:
            return self.client_address[0]
        except Exception:
            return ""

    def _track_client(self):
        """Отметить клиента как активного на каждом его запросе."""
        cid = self._client_id()
        if not cid:
            return
        with _clients_lock:
            # Проверка kick
            until = _kicked.get(cid, 0)
            if until and time.time() < until:
                return "kicked"
            elif until:
                _kicked.pop(cid, None)

            now = time.time()
            info = _clients.get(cid) or {
                "first_seen": now,
                "role": "admin" if cid == _config.get("host_client_id") else "member",
            }
            info["name"] = self._client_name()
            info["last_seen"] = now
            info["ip"] = self._client_ip()
            _clients[cid] = info
        return None

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return None

    def _is_admin_request(self):
        cid = self._client_id()
        with _clients_lock:
            info = _clients.get(cid)
        return bool(info and info.get("role") == "admin")

    # ---------- verbs ----------
    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        # Ping — единственный «дешёвый» эндпоинт. Не требует токена, чтобы
        # клиент мог понять «есть хост или нет» до ввода пароля.
        if self.path.startswith("/api/ping"):
            state = self._track_client()
            if state == "kicked":
                self._send(403, {"error": "kicked"}); return
            doc = _read_doc()
            self._send(200, {
                "ok": True,
                "host": _config.get("host_name", ""),
                "version": doc.get("version", 0),
                "protected": bool(_config.get("token")),
                "your_role": self._my_role(),
            })
            return

        # Список активных клиентов
        if self.path.startswith("/api/session/list"):
            if not self._auth_ok():
                self._send(401, {"error": "Неверный токен"}); return
            self._track_client()
            self._send(200, {"clients": _snapshot_clients(), "you": self._client_id()})
            return

        # GET users — admin видит всех, member — только себя
        if self.path.startswith("/api/auth/users"):
            u = self._current_user()
            if not u:
                self._send(401, {"error": "Неверный токен"}); return
            users = _load_users()
            if u["role"] == "admin":
                out = [{
                    "id": uid, "name": v.get("name", ""),
                    "role": v.get("role", "member"), "created_at": v.get("created_at", ""),
                } for uid, v in users.items()]
            else:
                v = users.get(u["user_id"], {})
                out = [{"id": u["user_id"], "name": v.get("name", ""), "role": v.get("role", "member")}]
            out.sort(key=lambda x: (x["role"] != "admin", x["name"].lower()))
            self._send(200, {"users": out}); return

        # GET acl (admin) или свой срез (member)
        if self.path.startswith("/api/acl"):
            u = self._current_user()
            if not u:
                self._send(401, {"error": "Неверный токен"}); return
            acl = _load_acl()
            if u["role"] != "admin":
                # member видит только записи, где он упомянут
                uid = u["user_id"]
                acl = {k: v for k, v in acl.items()
                       if uid in (v.get("read", []) + v.get("write", [])) or "*" in v.get("read", [])}
            self._send(200, {"acl": acl}); return

        if self.path.startswith("/api/collections"):
            if not self._auth_ok():
                self._send(401, {"error": "Неверный токен"}); return
            if self._track_client() == "kicked":
                self._send(403, {"error": "kicked"}); return
            u = self._current_user() or {"user_id": "anon", "role": "admin"}
            with _state_lock:
                doc = _read_doc()
                doc = _filter_doc_for_user(doc, u["user_id"], u["role"])
                self._send(200, doc)
            return

        self._send(404, {"error": "Not found"})

    def do_POST(self):
        # ---------- AUTH ----------
        # Логин: {name, password} -> {token, user_id, role}
        if self.path.startswith("/api/auth/login"):
            body = self._read_body() or {}
            name = (body.get("name") or "").strip()
            pw   = body.get("password") or ""
            if not name or not pw:
                self._send(400, {"error": "name и password обязательны"}); return
            uid, user = _find_user_by_name(name)
            if not user or _hash_password(pw, user.get("salt", "")) != user.get("password_hash"):
                # Специально общее сообщение — чтобы не намекать, есть юзер или нет
                self._send(401, {"error": "Неверное имя или пароль"}); return
            token = _create_session(uid, user, self._client_id())
            self._send(200, {
                "ok": True, "token": token,
                "user_id": uid, "name": user["name"], "role": user.get("role", "member"),
                "expires_at": time.time() + SESSION_TTL_SEC,
            })
            return

        # Logout: инвалидируем свой session token
        if self.path.startswith("/api/auth/logout"):
            token = self.headers.get("X-Session-Token", "").strip()
            _drop_session(token)
            self._send(200, {"ok": True}); return

        # ---------- USERS (admin only) ----------
        if self.path.startswith("/api/auth/users"):
            u = self._current_user()
            if not u or u["role"] != "admin":
                self._send(403, {"error": "Только admin"}); return
            body = self._read_body() or {}
            name = (body.get("name") or "").strip()
            pw   = body.get("password") or ""
            role = body.get("role") or "member"
            if not name or role not in ("admin", "member"):
                self._send(400, {"error": "name + role admin|member"}); return
            users = _load_users()
            # Апдейт по имени (уникально) или создание
            uid, existing = _find_user_by_name(name)
            if existing:
                if pw:      # смена пароля — только если передали
                    salt = existing.get("salt") or secrets.token_hex(16)
                    existing["salt"] = salt
                    existing["password_hash"] = _hash_password(pw, salt)
                existing["role"] = role
                users[uid] = existing
            else:
                if not pw:
                    self._send(400, {"error": "Для нового пользователя нужен пароль"}); return
                uid = "u-" + secrets.token_hex(8)
                salt = secrets.token_hex(16)
                users[uid] = {
                    "name": name, "role": role,
                    "salt": salt,
                    "password_hash": _hash_password(pw, salt),
                    "created_at": _now_iso(),
                }
            _save_users(users)
            self._send(200, {"ok": True, "user_id": uid}); return

        # ---------- ACL (admin only) ----------
        if self.path.startswith("/api/acl"):
            u = self._current_user()
            if not u or u["role"] != "admin":
                self._send(403, {"error": "Только admin"}); return
            body = self._read_body() or {}
            acl = body.get("acl")
            if not isinstance(acl, dict):
                self._send(400, {"error": "acl должен быть объектом"}); return
            # Нормализуем: каждой коллекции — {read:[], write:[]}
            clean = {}
            for name, perms in acl.items():
                if not isinstance(perms, dict): continue
                clean[str(name)] = {
                    "read":  list(perms.get("read")  or ["*"]),
                    "write": list(perms.get("write") or ["*"]),
                }
            _save_acl(clean)
            self._send(200, {"ok": True}); return

        # Отдельно выйти из сессии — освободить своё место в списке
        if self.path.startswith("/api/session/leave"):
            cid = self._client_id()
            if cid:
                with _clients_lock:
                    _clients.pop(cid, None)
            self._send(200, {"ok": True}); return

        # Admin: сменить роль другому клиенту
        if self.path.startswith("/api/session/role"):
            if not self._auth_ok():
                self._send(401, {"error": "Неверный токен"}); return
            if not self._is_admin_request():
                self._send(403, {"error": "Только admin может менять роли"}); return
            body = self._read_body() or {}
            target = str(body.get("client_id") or "").strip()
            new_role = body.get("role")
            if new_role not in ("admin", "member"):
                self._send(400, {"error": "role: admin|member"}); return
            with _clients_lock:
                if target not in _clients:
                    self._send(404, {"error": "нет такого клиента"}); return
                _clients[target]["role"] = new_role
            self._send(200, {"ok": True}); return

        # Admin: kick — блок на N секунд (по умолчанию 300)
        if self.path.startswith("/api/session/kick"):
            if not self._auth_ok():
                self._send(401, {"error": "Неверный токен"}); return
            if not self._is_admin_request():
                self._send(403, {"error": "Только admin может кикать"}); return
            body = self._read_body() or {}
            target = str(body.get("client_id") or "").strip()
            secs = int(body.get("seconds") or 300)
            if not target:
                self._send(400, {"error": "нет client_id"}); return
            if target == _config.get("host_client_id"):
                self._send(400, {"error": "нельзя кикнуть владельца"}); return
            with _clients_lock:
                _clients.pop(target, None)
                _kicked[target] = time.time() + max(30, secs)
            self._send(200, {"ok": True}); return

        self._send(404, {"error": "Not found"})

    def do_DELETE(self):
        # Явный logout — синоним POST /session/leave
        if self.path.startswith("/api/session/leave"):
            return self.do_POST()
        self._send(404, {"error": "Not found"})

    def _my_role(self):
        cid = self._client_id()
        with _clients_lock:
            info = _clients.get(cid)
        return (info or {}).get("role", "member")

    def do_PUT(self):
        if not self.path.startswith("/api/collections"):
            self._send(404, {"error": "Not found"})
            return

        if not self._auth_ok():
            self._send(401, {"error": "Неверный токен"})
            return
        if self._track_client() == "kicked":
            self._send(403, {"error": "kicked"}); return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8")
            incoming = json.loads(raw)
        except Exception as e:
            self._send(400, {"error": f"Некорректное тело: {e}"})
            return

        if not isinstance(incoming, dict) or not isinstance(incoming.get("collections"), list):
            self._send(400, {"error": "Ожидается {collections: [...]}"})
            return

        u = self._current_user() or {"user_id": "anon", "role": "admin"}
        with _state_lock:
            current = _read_doc()

            # Проверка конфликта: клиент присылает base_version — версию, от которой правил
            base = incoming.get("base_version")
            if base is not None and base != current.get("version", 0):
                self._send(409, {
                    "error": "conflict",
                    "server_version": current.get("version", 0),
                    "your_base": base,
                    "updated_by": current.get("updated_by", ""),
                    "updated_at": current.get("updated_at", ""),
                })
                return

            # Применяем ACL: не даём member затереть чужое
            merged_collections = _merge_write(current, incoming, u["user_id"], u["role"])

            doc = {
                "version": current.get("version", 0) + 1,
                "updated_at": _now_iso(),
                "updated_by": u.get("name") or incoming.get("client_name", "") or "unknown",
                "collections": merged_collections,
                "variables": incoming.get("variables", current.get("variables", {})),
            }
            ok = _write_doc(doc)

        if ok:
            self._send(200, {"ok": True, "version": doc["version"], "updated_at": doc["updated_at"]})
        else:
            self._send(500, {"error": "Не удалось сохранить файл"})


# ============================================================
# PUBLIC API
# ============================================================
def get_local_ips():
    """Список локальных IP-адресов машины (для показа участникам)."""
    ips = []
    try:
        # Трюк: подключаемся к внешнему адресу, чтобы узнать «свой» IP в LAN
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass

    return ips or ["127.0.0.1"]


def start(port=8777, data_file=None, token="", host_name="", host_client_id="",
          users_file=None, acl_file=None, require_login=False,
          bootstrap_admin_name="", bootstrap_admin_password=""):
    """
    Запустить сервер синхронизации.

    Новые параметры для системы логинов:
      users_file    — путь к users.json (обычно shared_users.json рядом с data)
      acl_file      — путь к acl.json
      require_login — True → работает per-user login (клиенты обязаны /api/auth/login)
      bootstrap_admin_* — если users_file пуст, создаём первого admin с этими кредами
    """
    global _server, _thread

    if _server is not None:
        return {"ok": True, "already": True, "port": _server.server_address[1], "urls": _urls(_server.server_address[1])}

    _config["data_file"] = data_file
    _config["users_file"] = users_file
    _config["acl_file"] = acl_file
    _config["require_login"] = bool(require_login)
    _config["token"] = token or ""
    _config["host_name"] = host_name or socket.gethostname()
    _config["host_client_id"] = host_client_id or ""

    # Bootstrap: если включён логин, но users.json пуст — создаём владельца
    if require_login and users_file:
        existing = _load_users()
        if not existing and bootstrap_admin_name and bootstrap_admin_password:
            salt = secrets.token_hex(16)
            existing["u-owner"] = {
                "name": bootstrap_admin_name,
                "role": "admin",
                "salt": salt,
                "password_hash": _hash_password(bootstrap_admin_password, salt),
                "created_at": _now_iso(),
            }
            _save_users(existing)
    # Владелец сразу попадает в список как admin — иначе он будет виден
    # только после своего первого ping, и до тех пор без прав.
    if host_client_id:
        with _clients_lock:
            _clients[host_client_id] = {
                "name": host_name or socket.gethostname(),
                "role": "admin",
                "first_seen": time.time(),
                "last_seen": time.time(),
                "ip": "127.0.0.1",
            }

    try:
        _server = ThreadingHTTPServer(("0.0.0.0", int(port)), _Handler)
    except OSError as e:
        return {"ok": False, "error": f"Порт {port} занят или недоступен: {e}"}

    _thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _thread.start()

    # Создаём файл, если его нет
    if data_file and not os.path.exists(data_file):
        _write_doc(_empty_doc())

    return {
        "ok": True,
        "port": int(port),
        "urls": _urls(int(port)),
        "host_name": _config["host_name"],
        "protected": bool(token),
        "require_login": _config["require_login"],
    }


def _urls(port):
    return [f"http://{ip}:{port}" for ip in get_local_ips()]


def _snapshot_clients():
    """Слепок активных клиентов для UI. Отсеиваем тех, кто давно молчит."""
    now = time.time()
    with _clients_lock:
        # Чистим протухших параллельно — не растим словарь бесконечно
        stale = [cid for cid, info in _clients.items() if now - info["last_seen"] > LIVE_WINDOW_SEC * 3]
        for cid in stale:
            _clients.pop(cid, None)

        out = []
        for cid, info in _clients.items():
            age = now - info["last_seen"]
            if age > LIVE_WINDOW_SEC:
                continue     # молчит > 30с — считаем отвалившимся
            out.append({
                "client_id": cid,
                "name": info["name"],
                "role": info["role"],
                "ip": info.get("ip", ""),
                "online_for": int(now - info["first_seen"]),
                "last_seen_ago": int(age),
            })
    out.sort(key=lambda x: (x["role"] != "admin", x["name"].lower()))
    return out


def stop():
    """Остановить сервер."""
    global _server, _thread
    if _server is None:
        return {"ok": True, "stopped": False}
    try:
        _server.shutdown()
        _server.server_close()
    except Exception:
        pass
    _server = None
    _thread = None
    with _clients_lock:
        _clients.clear()
        _kicked.clear()
    with _sessions_lock:
        _sessions.clear()
    return {"ok": True, "stopped": True}


def status():
    """Текущий статус сервера."""
    if _server is None:
        return {"running": False}
    port = _server.server_address[1]
    doc = _read_doc()
    users = _load_users() if _config.get("require_login") else {}
    return {
        "running": True,
        "port": port,
        "urls": _urls(port),
        "host_name": _config.get("host_name", ""),
        "protected": bool(_config.get("token")),
        "require_login": bool(_config.get("require_login")),
        "users_count": len(users),
        "version": doc.get("version", 0),
        "updated_at": doc.get("updated_at", ""),
        "updated_by": doc.get("updated_by", ""),
        "clients": _snapshot_clients(),
    }
