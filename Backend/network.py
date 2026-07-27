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


def send_http_request(method: str, url: str, headers: dict, params: dict, body: Optional[str]) -> dict:
    """Выполняет один HTTP-запрос и возвращает результат в виде словаря,
    готового к сериализации в JSON и отправке обратно в JS."""
    try:
        clean_headers = {k: v for k, v in (headers or {}).items() if k}
        clean_params = {k: v for k, v in (params or {}).items() if k}

        start = time.time()
        resp = requests.request(
            method,
            url,
            params=clean_params,
            headers=clean_headers,
            data=body.encode("utf-8") if body else None,
            timeout=20,
        )
        elapsed_ms = round((time.time() - start) * 1000)

        return {
            "ok": True,
            "status_code": resp.status_code,
            "reason": resp.reason,
            "text": resp.text,
            "headers": dict(resp.headers),
            "elapsed_ms": elapsed_ms,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}