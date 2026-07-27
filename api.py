"""
api.py
------
Класс Api — мост между JS (index.html/app.js) и Python.
Методы этого класса становятся доступны в JS как
window.pywebview.api.<method_name>(...), вызовы асинхронные
(возвращают Promise) и выполняются pywebview в фоновом потоке —
поэтому долгий HTTP-запрос не подвешивает интерфейс.

Добавлена поддержка «открепления» и «возврата» вкладок:
- open_detached_window — создаёт отдельное окно ОС с вкладкой
- receive_returned_tab — принимает вкладку обратно в главное окно
- return_to_parent — кнопка/действие в дочернем окне для возврата
"""

import json
import os
import threading
import webview

from Backend.network import send_http_request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_HTML = os.path.join(BASE_DIR, "Ui", "index.html")
MAIN_WINDOW_TITLE = "TestSys"


class Api:
    def __init__(self):
        # Держим ссылки на дочерние окна, чтобы их не убрал сборщик мусора
        self.child_windows = []
        self._detached_tab_state_json = None

    # ---------- HTTP-запросы ----------
    def send_request(self, method, url, headers, params, body):
        """Отправка HTTP-запроса. Вызывается из app.js."""
        return send_http_request(method, url, headers, params, body)

    # ---------- Управление откреплёнными вкладками ----------
    def sync_detached_state(self, state_json):
        """Кэширует состояние вкладки в дочернем окне (без блокировки UI при закрытии)."""
        if state_json:
            self._detached_tab_state_json = state_json
        return True

    def _find_main_window(self):
        for w in webview.windows:
            if w.title == MAIN_WINDOW_TITLE:
                return w
        return None

    def _deliver_returned_tab(self, state_json):
        if not state_json:
            return
        main_window = self._find_main_window()
        if not main_window:
            return
        try:
            main_window.evaluate_js(f"window.addReturnedTab({state_json})")
        except Exception:
            pass

    def _schedule_returned_tab(self, state_json):
        if state_json:
            threading.Timer(0.05, self._deliver_returned_tab, args=(state_json,)).start()

    def open_detached_window(self, tab_state):
        """
        Создаёт новое окно ОС с копией вкладки.
        При закрытии дочернего окна вкладка автоматически возвращается в главное.
        tab_state — dict с полями method, url, params, headers, body.
        """
        new_api = Api()
        state_json = json.dumps(tab_state)
        new_api._detached_tab_state_json = state_json

        win = webview.create_window(
            title="TestSys — detached",
            url=INDEX_HTML,
            js_api=new_api,
            width=1000,
            height=700,
        )
        payload = json.dumps(tab_state)

        def on_loaded():
            win.evaluate_js(f"window.loadDetachedTab({payload})")

        def on_closing():
            # Не вызываем evaluate_js здесь — это блокирует закрытие окна.
            self._schedule_returned_tab(new_api._detached_tab_state_json)
            try:
                self.child_windows.remove(win)
            except ValueError:
                pass
            return True

        win.events.loaded += on_loaded
        win.events.closing += on_closing
        self.child_windows.append(win)
        return True

    def receive_returned_tab(self, tab_state_json):
        """
        Принимает JSON-строку состояния вкладки из дочернего окна
        и добавляет её обратно в главное окно.
        """
        self._deliver_returned_tab(tab_state_json)
        return True

    def return_to_parent(self):
        """
        Действие по кнопке «Вернуть в главное окно» в дочернем окне.
        Забирает состояние вкладки, отправляет в главное окно и закрывает дочернее.
        """
        win = webview.active_window()
        state_json = self._detached_tab_state_json

        try:
            win.destroy()
        except Exception:
            pass

        self._schedule_returned_tab(state_json)
        return True

    # ---------- Настройки темы ----------
    def save_theme(self, theme_json):
        """Сохраняет тему в файл theme.json рядом с main.py."""
        try:
            path = os.path.join(BASE_DIR, "theme.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(theme_json)
            return True
        except Exception:
            return False

    def load_theme(self):
        """Загружает тему из файла theme.json."""
        path = os.path.join(BASE_DIR, "theme.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None
