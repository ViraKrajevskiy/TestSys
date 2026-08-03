"""
tests/test_network.py
Тесты вспомогательных функций network.py (без реальных сетевых запросов).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Backend"))

from network import _err, _host, _short, _extract_core, _connection_err


# ─── _err ────────────────────────────────────────────────────
class TestErr:
    def test_ok_false(self):
        r = _err("что-то пошло не так")
        assert r["ok"] is False

    def test_message_present(self):
        r = _err("ошибка соединения")
        assert "ошибка соединения" in r["error"]

    def test_hint_appended(self):
        r = _err("проблема", hint="попробуй ещё раз")
        assert "попробуй ещё раз" in r["error"]

    def test_no_hint(self):
        r = _err("проблема")
        assert "💡" not in r["error"]


# ─── _host ───────────────────────────────────────────────────
class TestHost:
    def test_simple_url(self):
        assert _host("http://localhost:8000/api") == "localhost:8000"

    def test_https(self):
        assert _host("https://example.com/path?q=1") == "example.com"

    def test_no_path(self):
        assert _host("http://127.0.0.1") == "127.0.0.1"

    def test_garbage(self):
        # не падаем на мусоре
        result = _host("not-a-url")
        assert isinstance(result, str)


# ─── _short ──────────────────────────────────────────────────
class TestShort:
    def test_short_string_unchanged(self):
        s = "hello"
        assert _short(s) == s

    def test_long_string_truncated(self):
        s = "x" * 300
        result = _short(s)
        assert len(result) <= 203   # 200 + "…"
        assert result.endswith("…")

    def test_exact_limit_unchanged(self):
        s = "a" * 200
        assert _short(s) == s

    def test_custom_limit(self):
        s = "abcdef"
        assert _short(s, limit=3) == "abc…"

    def test_none_input(self):
        assert isinstance(_short(None), str)


# ─── _extract_core ───────────────────────────────────────────
class TestExtractCore:
    def test_winerror(self):
        text = ("HTTPConnectionPool(host='127.0.0.1', port=8001): "
                "Max retries exceeded (Caused by NewConnectionError("
                "'<urllib3.connection.HTTPConnection object at 0x1234>: "
                "Failed: [WinError 10061] Подключение отклонено'))")
        result = _extract_core(text)
        assert "10061" in result

    def test_errno(self):
        text = "Failed to establish connection: [Errno 111] Connection refused"
        result = _extract_core(text)
        assert "111" in result

    def test_empty_string(self):
        # не падаем на пустой строке
        result = _extract_core("")
        assert isinstance(result, str)

    def test_no_object_addresses_in_output(self):
        text = "<urllib3.connection.HTTPConnection object at 0xDEAD>: refused"
        result = _extract_core(text)
        assert "0xDEAD" not in result


# ─── _connection_err ─────────────────────────────────────────
class TestConnectionErr:
    def _exc(self, msg):
        class E(Exception): pass
        return E(msg)

    def test_refused_returns_not_ok(self):
        r = _connection_err(self._exc("WinError 10061"), "http://localhost:9999/api")
        assert r["ok"] is False

    def test_refused_mentions_port(self):
        r = _connection_err(self._exc("[Errno 111] Connection refused"),
                            "http://localhost:5000/test")
        assert "5000" in r["error"]

    def test_dns_error(self):
        r = _connection_err(self._exc("getaddrinfo failed"),
                            "http://nosuchthing.invalid/")
        assert r["ok"] is False
        assert "nosuchthing.invalid" in r["error"]

    def test_reset_by_peer(self):
        r = _connection_err(self._exc("Connection reset by peer [10054]"),
                            "http://example.com/")
        assert r["ok"] is False

    def test_ssl_inside_connection_error(self):
        r = _connection_err(self._exc("SSL handshake failed"),
                            "https://example.com/")
        assert r["ok"] is False
