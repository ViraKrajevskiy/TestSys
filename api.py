"""
api.py
------
Класс Api — мост между JS (index.html/app.js) и Python.
Методы этого класса становятся доступны в JS как
window.pywebview.api.<method_name>(...), вызовы асинхронные
(возвращают Promise) и выполняются pywebview в фоновом потоке —
поэтому долгий HTTP-запрос не подвешивает интерфейс.
"""

import os
import json

import webview

from Backend.network import send_http_request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_HTML = os.path.join(BASE_DIR, "ui", "index.html")


class Api:
    def __init__(self):
        # держим ссылки на дочерние окна, чтобы их не убрал GC
        self.child_windows = []

    # ---------- запросы ----------
    def send_request(self, method, url, headers, params, body):
        """Отправка HTTP-запроса. Вызывается из app.js."""
        return send_http_request(method, url, headers, params, body)

    # ---------- "открепление" вкладки в отдельное окно ----------
    def open_detached_window(self, tab_state):
        """
        tab_state — dict с данными вкладки (метод, url, params, headers, body).
        Открывает новое независимое окно ОС с этой вкладкой внутри.
        Пришедшее из JS значение уже десериализовано pywebview в dict.
        """
        new_api = Api()
        win = webview.create_window(
            title="PyPostman — detached",
            url=INDEX_HTML,
            js_api=new_api,
            width=1000,
            height=700,
        )
        payload = json.dumps(tab_state)

        def on_loaded():
            win.evaluate_js(f"window.loadDetachedTab({payload})")

        win.events.loaded += on_loaded
        self.child_windows.append(win)
        return True

    # ---------- тема ----------
    def save_theme(self, theme_json):
        try:
            path = os.path.join(BASE_DIR, "theme.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(theme_json)
            return True
        except Exception:
            return False

    def load_theme(self):
        path = os.path.join(BASE_DIR, "theme.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None