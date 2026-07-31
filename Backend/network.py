"""
network.py — отправка HTTP-запроса и человеко-понятный разбор ошибок.

Главная задача — не показывать пользователю простыню urllib3-стека вида
"NewConnectionError('<urllib3.connection.HTTPConnection object at 0x...>')".
Вместо этого распознаём типовые проблемы и объясняем, что делать.
"""

from typing import Optional
from urllib.parse import urlparse

import re
import ssl
import time
import socket
import requests


# Лимиты
MAX_BODY_SIZE   = 512 * 1024        # 512 КБ — макс. размер отправляемого body
MAX_RESPONSE    = 5 * 1024 * 1024   # 5 МБ — макс. размер ответа (обрезаем)
REQUEST_TIMEOUT = 30                # секунд


def send_http_request(method: str, url: str, headers: dict, params: dict, body: Optional[str]) -> dict:
    """Выполняет один HTTP-запрос, возвращает dict, готовый к JSON-сериализации."""
    try:
        if body and len(body.encode("utf-8")) > MAX_BODY_SIZE:
            return _err(f"Тело слишком большое (>{MAX_BODY_SIZE // 1024} КБ)")

        clean_headers = {k: v for k, v in (headers or {}).items() if k}
        clean_params = {k: v for k, v in (params or {}).items() if k}

        start = time.time()
        resp = requests.request(
            method, url,
            params=clean_params,
            headers=clean_headers,
            data=body.encode("utf-8") if body else None,
            timeout=REQUEST_TIMEOUT,
            stream=True,   # чтобы контролировать размер ответа
            allow_redirects=True,
        )
        elapsed_ms = round((time.time() - start) * 1000)

        content = resp.content[:MAX_RESPONSE]
        text = content.decode("utf-8", errors="replace")
        if len(resp.content) > MAX_RESPONSE:
            text += f"\n\n... [ответ обрезан: >{MAX_RESPONSE // (1024*1024)} МБ]"

        return {
            "ok": True,
            "status_code": resp.status_code,
            "reason": resp.reason,
            "text": text,
            "headers": dict(resp.headers),
            "elapsed_ms": elapsed_ms,
        }

    except requests.exceptions.MissingSchema:
        return _err("URL без схемы. Добавьте http:// или https://",
                    hint="Пример: http://127.0.0.1:8000/api/users")

    except requests.exceptions.InvalidURL as e:
        return _err(f"Некорректный URL: {e}",
                    hint="Проверьте, что нет лишних пробелов и {{переменные}} корректно раскрылись")

    except requests.exceptions.InvalidSchema as e:
        return _err(f"Неподдерживаемая схема: {e}",
                    hint="Поддерживаются http:// и https://")

    except requests.exceptions.Timeout:
        host = _host(url)
        return _err(f"Таймаут: сервер {host} не ответил за {REQUEST_TIMEOUT} сек",
                    hint="Сервер запущен, но не отвечает. Проверьте его логи или увеличьте таймаут в настройках.")

    except requests.exceptions.SSLError as e:
        return _err(f"Ошибка SSL: {_short(str(e))}",
                    hint="Сертификат не проверился. Для локалок с самоподписанным сертификатом используйте http://.")

    except requests.exceptions.TooManyRedirects:
        return _err("Слишком много перенаправлений",
                    hint="Скорее всего в приложении настроен цикл редиректов.")

    except requests.exceptions.ConnectionError as e:
        # Тут самое интересное — распознаём конкретные типовые проблемы
        return _connection_err(e, url)

    except Exception as e:
        return _err(_short(str(e)))


# ============================================================
# ХЕЛПЕРЫ
# ============================================================
def _err(message, hint=""):
    """Стандартный формат ошибки: короткое сообщение + необязательная подсказка."""
    text = message
    if hint:
        text = f"{message}\n\n💡 {hint}"
    return {"ok": False, "error": text}


def _host(url):
    try:
        p = urlparse(url)
        return p.netloc or url
    except Exception:
        return url


def _short(s, limit=200):
    """Обрезаем длинные технические простыни до чего-то читаемого."""
    s = str(s or "").strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "…"


def _connection_err(exc, url):
    """
    Разбираем текст ConnectionError и подбираем понятное сообщение.
    Именно здесь превращается в человеческий язык та самая простыня
    с NewConnectionError / HTTPConnectionPool.
    """
    text = str(exc)
    host = _host(url)

    # WinError 10061 / [Errno 111] — connection refused
    if "10061" in text or "refused" in text.lower() or "ECONNREFUSED" in text:
        p = urlparse(url)
        port = p.port or (443 if p.scheme == "https" else 80)
        return _err(
            f"Сервер {host} не отвечает — порт {port} свободен, но никто на нём не слушает",
            hint=f"Проверьте, что бэкенд запущен на порту {port}.\n"
                 f"Например: python manage.py runserver {port} для Django."
        )

    # WinError 10060 / timeout — connection timed out
    if "10060" in text or "timed out" in text.lower():
        return _err(
            f"Не удалось достучаться до {host} — соединение отваливается по таймауту",
            hint="Сервер может быть недоступен из вашей сети или заблокирован файрволом."
        )

    # WinError 11001 / [Errno -2] — DNS не резолвится
    if "11001" in text or "getaddrinfo" in text.lower() or "Name or service not known" in text:
        return _err(
            f"Не удалось найти сервер: {host}",
            hint="Проверьте, что адрес написан правильно и есть интернет."
        )

    # WinError 10054 — соединение сброшено
    if "10054" in text or "reset" in text.lower():
        return _err(
            f"Сервер {host} разорвал соединение",
            hint="Возможно, приложение упало во время ответа или закрыло сокет."
        )

    # SSL handshake упал внутри ConnectionError
    if "SSL" in text or "tls" in text.lower():
        return _err(f"Ошибка SSL-рукопожатия с {host}",
                    hint="Проверьте, использует ли сервер HTTPS. Если нет — замените на http://")

    # Всё остальное — выцарапываем содержимое и обрезаем
    core = _extract_core(text)
    return _err(f"Не удалось подключиться к {host}",
                hint=core if core else _short(text))


def _extract_core(text):
    """
    Из строки типа:
        HTTPConnectionPool(host='127.0.0.1', port=8001): Max retries exceeded
        with url: /users/1 (Caused by NewConnectionError('<urllib3.connection
        .HTTPConnection object at 0x...>: Failed to establish a new connection:
        [WinError 10061] Подключение не установлено...'))
    достаём только последнюю содержательную часть после последнего ':'.
    """
    # Отрезаем адреса объектов, они не несут смысла
    text = re.sub(r"<[^>]*object at 0x[0-9a-fA-F]+>:?\s*", "", text)
    # Ищем сообщение WinError или Errno
    m = re.search(r"(\[WinError \d+\][^)']*)", text)
    if m:
        return m.group(1).strip()
    m = re.search(r"(\[Errno -?\d+\][^)']*)", text)
    if m:
        return m.group(1).strip()
    # Последняя строчка после последнего двоеточия
    tail = text.rsplit(":", 1)[-1].strip(" ')")
    return _short(tail, 160) if tail else ""
