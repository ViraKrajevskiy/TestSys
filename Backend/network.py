"""
Backend/network_core.py
-------------------------
Чистая логика отправки HTTP-запроса, без привязки к какому-либо UI-фреймворку.
В PyQt-версии это было обёрнуто в QThread; здесь это не нужно — pywebview
сам исполняет вызовы js_api в отдельном потоке, не блокируя интерфейс.
"""

from typing import Optional

import time
import requests


# Лимиты
MAX_BODY_SIZE   = 512 * 1024   # 512 КБ — макс. размер отправляемого body
MAX_RESPONSE    = 5 * 1024 * 1024  # 5 МБ — макс. размер ответа (обрезаем)
REQUEST_TIMEOUT = 30           # секунд


def send_http_request(method: str, url: str, headers: dict, params: dict, body: Optional[str]) -> dict:
    """Выполняет один HTTP-запрос и возвращает результат в виде словаря,
    готового к сериализации в JSON и отправке обратно в JS."""
    try:
        # Проверка размера body
        if body and len(body.encode("utf-8")) > MAX_BODY_SIZE:
            return {"ok": False, "error": f"Body слишком большой (>{MAX_BODY_SIZE // 1024} КБ)"}

        clean_headers = {k: v for k, v in (headers or {}).items() if k}
        clean_params = {k: v for k, v in (params or {}).items() if k}

        start = time.time()
        resp = requests.request(
            method,
            url,
            params=clean_params,
            headers=clean_headers,
            data=body.encode("utf-8") if body else None,
            timeout=REQUEST_TIMEOUT,
            stream=True,  # stream чтобы контролировать размер ответа
        )
        elapsed_ms = round((time.time() - start) * 1000)

        # Читаем ответ с лимитом
        content = resp.content[:MAX_RESPONSE]
        text = content.decode("utf-8", errors="replace")
        truncated = len(resp.content) > MAX_RESPONSE

        if truncated:
            text += f"\n\n... [ответ обрезан: >{MAX_RESPONSE // (1024*1024)} МБ]"

        return {
            "ok": True,
            "status_code": resp.status_code,
            "reason": resp.reason,
            "text": text,
            "headers": dict(resp.headers),
            "elapsed_ms": elapsed_ms,
        }
    except requests.exceptions.Timeout:
        return {"ok": False, "error": f"Таймаут: сервер не ответил за {REQUEST_TIMEOUT} сек"}
    except requests.exceptions.ConnectionError as e:
        return {"ok": False, "error": f"Не удалось подключиться: {e}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}