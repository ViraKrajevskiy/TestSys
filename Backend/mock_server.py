"""
mock_server.py — Встроенный mock-сервер.

Запускает локальный HTTP-сервер на заданном порту.
Маршруты задаются как список {method, path, status, headers, body, delay}.
"""

import json
import time
import threading
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

logger = logging.getLogger("testsys.mock")

_server = None
_routes = []
_port = 0
_log = []          # последние N запросов
_MAX_LOG = 200


class _MockHandler(BaseHTTPRequestHandler):
    """Обработчик запросов mock-сервера."""

    def log_message(self, fmt, *args):
        pass  # suppress default stderr logging

    def _handle(self):
        method = self.command
        path = self.path.split("?")[0]

        # Find matching route
        matched = None
        for r in _routes:
            if r.get("method", "GET").upper() == method.upper() and r.get("path") == path:
                matched = r
                break

        # Fallback: any method match
        if not matched:
            for r in _routes:
                if r.get("path") == path and r.get("method", "").upper() == "ANY":
                    matched = r
                    break

        ts = time.strftime("%H:%M:%S")

        if matched:
            delay = float(matched.get("delay", 0))
            if delay > 0:
                time.sleep(delay / 1000.0)

            status = int(matched.get("status", 200))
            body = matched.get("body", "")
            resp_headers = matched.get("headers", {})

            self.send_response(status)
            if "Content-Type" not in resp_headers:
                resp_headers["Content-Type"] = "application/json"
            resp_headers["Access-Control-Allow-Origin"] = "*"
            resp_headers["Access-Control-Allow-Methods"] = "*"
            resp_headers["Access-Control-Allow-Headers"] = "*"
            for k, v in resp_headers.items():
                self.send_header(k, v)
            self.end_headers()

            if isinstance(body, (dict, list)):
                body = json.dumps(body)
            self.wfile.write(body.encode("utf-8"))

            _log_entry(ts, method, path, status, "matched")
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = json.dumps({"error": "No mock route", "path": path, "method": method})
            self.wfile.write(resp.encode("utf-8"))
            _log_entry(ts, method, path, 404, "no route")

    # Handle all methods
    def do_GET(self):     self._handle()
    def do_POST(self):    self._handle()
    def do_PUT(self):     self._handle()
    def do_PATCH(self):   self._handle()
    def do_DELETE(self):  self._handle()
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()


def _log_entry(ts, method, path, status, note):
    _log.append({"time": ts, "method": method, "path": path, "status": status, "note": note})
    if len(_log) > _MAX_LOG:
        del _log[: len(_log) - _MAX_LOG]


def start_mock(port, routes):
    """Start mock server on given port with routes list."""
    global _server, _routes, _port
    stop_mock()
    _routes = routes or []
    _port = port
    _log.clear()
    _server = HTTPServer(("127.0.0.1", port), _MockHandler)
    t = threading.Thread(target=_server.serve_forever, daemon=True)
    t.start()
    logger.info(f"Mock server started on port {port} with {len(_routes)} routes")
    return {"ok": True, "port": port, "routes": len(_routes)}


def stop_mock():
    """Stop running mock server."""
    global _server
    if _server:
        _server.shutdown()
        _server = None
        logger.info("Mock server stopped")
    return {"ok": True}


def get_mock_status():
    """Return current mock server status."""
    return {
        "running": _server is not None,
        "port": _port if _server else 0,
        "routes": len(_routes),
        "log": list(_log[-50:]),
    }


def get_mock_log():
    """Return recent request log."""
    return list(_log[-50:])
