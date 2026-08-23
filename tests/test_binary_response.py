"""
Бинарные ответы, SSL-проверка и прокси в network.py.

- Картинки/PDF/архивы отдаются как base64 (is_binary), а не декодируются
  в «текст» с кашей из символов.
- verify_ssl и proxy из настроек доходят до requests.
"""
import base64
import network


def _fake(content, ctype):
    class R:
        pass
    r = R()
    r.content = content; r.status_code = 200; r.reason = "OK"
    r.headers = {"Content-Type": ctype}; r.elapsed = None
    return r


PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def test_is_texty():
    assert network._is_texty("application/json")
    assert network._is_texty("text/html; charset=utf-8")
    assert network._is_texty("")            # без типа — считаем текстом
    assert network._is_texty("image/svg+xml")   # svg это XML
    assert not network._is_texty("image/png")
    assert not network._is_texty("application/pdf")
    assert not network._is_texty("application/octet-stream")


def test_image_response_is_base64(monkeypatch):
    monkeypatch.setattr(network._SESSION, "request",
                        lambda *a, **k: _fake(PNG, "image/png"))
    r = network.send_http_request("GET", "http://x/img", {}, {}, None)
    assert r["is_binary"] is True
    assert r["is_image"] is True
    assert base64.b64decode(r["base64"]) == PNG
    assert r["content_type"] == "image/png"


def test_pdf_binary_not_image(monkeypatch):
    monkeypatch.setattr(network._SESSION, "request",
                        lambda *a, **k: _fake(b"%PDF-1.4", "application/pdf"))
    r = network.send_http_request("GET", "http://x/f", {}, {}, None)
    assert r["is_binary"] is True
    assert r["is_image"] is False


def test_json_stays_text(monkeypatch):
    monkeypatch.setattr(network._SESSION, "request",
                        lambda *a, **k: _fake(b'{"ok":true}', "application/json"))
    r = network.send_http_request("GET", "http://x/api", {}, {}, None)
    assert r["is_binary"] is False
    assert r["text"] == '{"ok":true}'
    assert "base64" not in r


def test_ssl_and_proxy_reach_requests(monkeypatch):
    seen = {}
    def fake(method, url, **kw):
        seen.update(kw)
        return _fake(b"{}", "application/json")
    monkeypatch.setattr(network._SESSION, "request", fake)

    network.send_http_request("GET", "http://x/", {}, {}, None,
                              verify_ssl=False, proxy="http://127.0.0.1:9")
    assert seen["verify"] is False
    assert seen["proxies"] == {"http": "http://127.0.0.1:9", "https": "http://127.0.0.1:9"}

    network.send_http_request("GET", "http://x/", {}, {}, None, verify_ssl=True)
    assert seen["verify"] is True
    assert seen["proxies"] is None
