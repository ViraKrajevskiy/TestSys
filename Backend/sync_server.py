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

import json
import os
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
    "data_file": None,   # путь к shared_collections.json
    "token": "",         # опциональный пароль
    "host_name": "",     # имя хоста для отображения
}


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
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token")
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self):
        token = _config.get("token") or ""
        if not token:
            return True
        return self.headers.get("X-Sync-Token", "") == token

    # ---------- verbs ----------
    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path.startswith("/api/ping"):
            doc = _read_doc()
            self._send(200, {
                "ok": True,
                "host": _config.get("host_name", ""),
                "version": doc.get("version", 0),
                "protected": bool(_config.get("token")),
            })
            return

        if self.path.startswith("/api/collections"):
            if not self._auth_ok():
                self._send(401, {"error": "Неверный токен"})
                return
            with _state_lock:
                self._send(200, _read_doc())
            return

        self._send(404, {"error": "Not found"})

    def do_PUT(self):
        if not self.path.startswith("/api/collections"):
            self._send(404, {"error": "Not found"})
            return

        if not self._auth_ok():
            self._send(401, {"error": "Неверный токен"})
            return

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

            doc = {
                "version": current.get("version", 0) + 1,
                "updated_at": _now_iso(),
                "updated_by": incoming.get("client_name", "") or "unknown",
                "collections": incoming["collections"],
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


def start(port=8777, data_file=None, token="", host_name=""):
    """Запустить сервер синхронизации. Возвращает dict со статусом."""
    global _server, _thread

    if _server is not None:
        return {"ok": True, "already": True, "port": _server.server_address[1], "urls": _urls(_server.server_address[1])}

    _config["data_file"] = data_file
    _config["token"] = token or ""
    _config["host_name"] = host_name or socket.gethostname()

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
    }


def _urls(port):
    return [f"http://{ip}:{port}" for ip in get_local_ips()]


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
    return {"ok": True, "stopped": True}


def status():
    """Текущий статус сервера."""
    if _server is None:
        return {"running": False}
    port = _server.server_address[1]
    doc = _read_doc()
    return {
        "running": True,
        "port": port,
        "urls": _urls(port),
        "host_name": _config.get("host_name", ""),
        "protected": bool(_config.get("token")),
        "version": doc.get("version", 0),
        "updated_at": doc.get("updated_at", ""),
        "updated_by": doc.get("updated_by", ""),
    }
