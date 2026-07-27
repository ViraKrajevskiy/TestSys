"""
network.py
----------
Всё, что связано с реальной отправкой HTTP-запроса.
Работает в отдельном потоке (QThread), чтобы не подвешивать UI
на время ожидания ответа сервера.
"""

import time
import requests

from PyQt5.QtCore import QThread, pyqtSignal


class RequestWorker(QThread):
    """Отправляет один HTTP-запрос в фоновом потоке."""

    finished = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, method, url, params, headers, body):
        super().__init__()
        self.method = method
        self.url = url
        self.params = params
        self.headers = headers
        self.body = body

    def run(self):
        try:
            headers = {k: v for k, v in self.headers.items() if k}
            params = {k: v for k, v in self.params.items() if k}
            start = time.time()
            resp = requests.request(
                self.method, self.url,
                params=params, headers=headers,
                data=self.body.encode("utf-8") if self.body else None,
                timeout=20
            )
            elapsed_ms = round((time.time() - start) * 1000)
            self.finished.emit({
                "status_code": resp.status_code,
                "reason": resp.reason,
                "text": resp.text,
                "headers": dict(resp.headers),
                "elapsed_ms": elapsed_ms,
            })
        except Exception as e:
            self.error.emit(str(e))