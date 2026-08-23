"""
Настройка таймаута должна реально влиять на запросы.

Регрессия: поле «Таймаут (сек)» в настройках сохранялось в settings.json,
но до network.py не доходило — там стояла константа 30, и настройка
не делала ничего.
"""
import network


def teardown_function():
    network.set_request_timeout(30)


def test_default_is_30():
    assert network.REQUEST_TIMEOUT == 30


def test_setter_changes_value():
    network.set_request_timeout(120)
    assert network.REQUEST_TIMEOUT == 120


def test_string_from_ui_is_accepted():
    # Из формы значение приходит строкой
    network.set_request_timeout("45")
    assert network.REQUEST_TIMEOUT == 45


def test_garbage_does_not_break_anything():
    network.set_request_timeout(120)
    network.set_request_timeout("не число")
    assert network.REQUEST_TIMEOUT == 120, "мусор не должен сбрасывать значение"
    network.set_request_timeout(None)
    assert network.REQUEST_TIMEOUT == 120


def test_bounds():
    network.set_request_timeout(0)
    assert network.REQUEST_TIMEOUT == 1, "меньше секунды не имеет смысла"
    network.set_request_timeout(999999)
    assert network.REQUEST_TIMEOUT == 3600, "верхняя граница — час"


def test_request_reads_current_value(monkeypatch):
    """Запрос должен брать таймаут в момент вызова, а не при импорте."""
    seen = {}

    class FakeResp:
        status_code, reason, headers, content = 200, "OK", {}, b"{}"
        elapsed = None

    def fake_request(method, url, **kw):
        seen["timeout"] = kw.get("timeout")
        return FakeResp()

    monkeypatch.setattr(network._SESSION, "request", fake_request)
    network.set_request_timeout(77)
    network.send_http_request("GET", "http://example.test/", {}, {}, None)
    assert seen["timeout"] == 77
