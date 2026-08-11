"""
network.py — отправка HTTP-запроса и человеко-понятный разбор ошибок.

Главная задача — не показывать пользователю простыню urllib3-стека вида
"NewConnectionError('<urllib3.connection.HTTPConnection object at 0x...>')".
Вместо этого распознаём типовые проблемы и объясняем, что делать.
"""

from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

import os
import re
import ssl
import time
import socket
import mimetypes
import requests


# Лимиты
MAX_BODY_SIZE     = 512 * 1024          # 512 КБ — макс. размер JSON-тела
MAX_RESPONSE      = 5 * 1024 * 1024     # 5 МБ — макс. размер ответа (обрезаем)
MAX_FILE_SIZE     = 50 * 1024 * 1024    # 50 МБ — на один загружаемый файл
MAX_TOTAL_UPLOAD  = 100 * 1024 * 1024   # 100 МБ — суммарно за один запрос
REQUEST_TIMEOUT   = 30                  # секунд

# Persistent session — сохраняет куки между запросами
_SESSION = requests.Session()


def get_cookies_by_domain() -> dict:
    """Возвращает куки из сессии сгруппированные по домену."""
    result: dict = {}
    for cookie in _SESSION.cookies:
        domain = cookie.domain or "unknown"
        result.setdefault(domain, [])
        result[domain].append({
            "name": cookie.name,
            "value": cookie.value,
            "path": cookie.path or "/",
            "secure": bool(cookie.secure),
        })
    return result


def set_cookie(domain: str, name: str, value: str, path: str = "/") -> None:
    _SESSION.cookies.set(name, value, domain=domain, path=path)


def delete_cookie(domain: str, name: str) -> None:
    _SESSION.cookies.clear(domain=domain, name=name)


def clear_all_cookies() -> None:
    _SESSION.cookies.clear()


def send_http_request(
    method: str,
    url: str,
    headers: dict,
    params: dict,
    body: Optional[str],
    files: Optional[List[Dict[str, Any]]] = None,
    form_fields: Optional[List[Dict[str, str]]] = None,
) -> dict:
    """Выполняет один HTTP-запрос, возвращает dict, готовый к JSON-сериализации.

    Если передан непустой ``files`` — запрос уходит как multipart/form-data:
    JSON-тело игнорируется, вместо него собираются поля из ``form_fields``
    и файлы читаются с диска. Заголовок Content-Type снимаем, чтобы requests
    сам поставил multipart с корректным boundary.
    """
    opened = []  # держим открытые файлы, чтобы закрыть их после отправки
    try:
        clean_headers = {k: v for k, v in (headers or {}).items() if k}
        clean_params = {k: v for k, v in (params or {}).items() if k}

        multipart_files, data_payload = None, None
        if files:
            prepared, err = _prepare_files(files, opened)
            if err:
                return _err(err)
            multipart_files = prepared
            data_payload = {}
            for f in (form_fields or []):
                key = (f.get("key") or "").strip()
                if not key:
                    continue
                data_payload[key] = f.get("value", "")
            # Убираем Content-Type — requests выставит multipart с boundary
            clean_headers = {k: v for k, v in clean_headers.items()
                             if k.lower() != "content-type"}
        else:
            if body and len(body.encode("utf-8")) > MAX_BODY_SIZE:
                return _err(f"Тело слишком большое (>{MAX_BODY_SIZE // 1024} КБ)")
            data_payload = body.encode("utf-8") if body else None

        start = time.time()
        resp = _SESSION.request(
            method, url,
            params=clean_params,
            headers=clean_headers,
            data=data_payload,
            files=multipart_files,
            timeout=REQUEST_TIMEOUT,
            stream=True,   # чтобы контролировать размер ответа
            allow_redirects=True,
        )
        # TTFB — время до первого байта (headers received)
        ttfb_ms = round((time.time() - start) * 1000)

        dl_start = time.time()
        content = resp.content[:MAX_RESPONSE]
        dl_ms = round((time.time() - dl_start) * 1000)

        elapsed_ms = round((time.time() - start) * 1000)

        text = content.decode("utf-8", errors="replace")
        if len(resp.content) > MAX_RESPONSE:
            text += f"\n\n... [ответ обрезан: >{MAX_RESPONSE // (1024*1024)} МБ]"

        # DNS + connect уже произошли — urllib3 не даёт их отдельно,
        # но resp.elapsed даёт время от отправки запроса до первого байта ответа
        connect_ms = round(resp.elapsed.total_seconds() * 1000) if resp.elapsed else ttfb_ms

        return {
            "ok": True,
            "status_code": resp.status_code,
            "reason": resp.reason,
            "text": text,
            "headers": dict(resp.headers),
            "elapsed_ms": elapsed_ms,
            "timing": {
                "total": elapsed_ms,
                "ttfb": connect_ms,     # time to first byte (server processing)
                "download": dl_ms,      # content download
                "size": len(content),   # response body size in bytes
            },
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
    finally:
        for fh in opened:
            try: fh.close()
            except Exception: pass


# ============================================================
# ХЕЛПЕРЫ
# ============================================================
def _prepare_files(files, opened):
    """
    Открывает файлы для multipart. Возвращает список кортежей вида
    (field, (filename, fileobj, content_type)) и None, либо (None, error).
    """
    result = []
    total = 0
    for i, entry in enumerate(files or []):
        field = (entry.get("field") or "").strip()
        path = entry.get("path") or ""
        if not field:
            return None, f"Файл #{i + 1}: не указано имя поля"
        if not path:
            return None, f"Файл #{i + 1} ({field}): не выбран файл"
        if not os.path.isfile(path):
            return None, f"Файл не найден: {path}"

        try:
            size = os.path.getsize(path)
        except OSError as e:
            return None, f"Не удалось прочитать {path}: {e}"

        if size > MAX_FILE_SIZE:
            return None, (f"Файл слишком большой: {os.path.basename(path)} "
                          f"({size // (1024*1024)} МБ, лимит {MAX_FILE_SIZE // (1024*1024)} МБ)")
        total += size
        if total > MAX_TOTAL_UPLOAD:
            return None, (f"Суммарный размер файлов больше "
                          f"{MAX_TOTAL_UPLOAD // (1024*1024)} МБ")

        filename = entry.get("filename") or os.path.basename(path)
        ctype = entry.get("content_type") or mimetypes.guess_type(filename)[0] \
                or "application/octet-stream"
        fh = open(path, "rb")
        opened.append(fh)
        result.append((field, (filename, fh, ctype)))
    return result, None


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
