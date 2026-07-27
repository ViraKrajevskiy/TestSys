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
import webview
import os

from Backend.network import send_http_request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_HTML = os.path.join(BASE_DIR, "ui", "index.html")


class Api:
    def __init__(self):
        # Держим ссылки на дочерние окна, чтобы их не убрал сборщик мусора
        self.child_windows = []

    # ---------- HTTP-запросы ----------
    def send_request(self, method, url, headers, params, body):
        """Отправка HTTP-запроса. Вызывается из app.js."""
        return send_http_request(method, url, headers, params, body)

    # ---------- Управление откреплёнными вкладками ----------
    def open_detached_window(self, tab_state):
        """
        Создаёт новое окно ОС с копией вкладки.
        При закрытии дочернего окна вкладка автоматически возвращается в главное.
        tab_state — dict с полями method, url, params, headers, body.
        """
        new_api = Api()  # у дочернего окна свой экземпляр Api
        win = webview.create_window(
            title="PyPostman — detached",
            url=INDEX_HTML,
            js_api=new_api,
            width=1000,
            height=700,
        )
        payload = json.dumps(tab_state)

        def on_loaded():
            # Передаём данные вкладки в дочернее окно
            win.evaluate_js(f"window.loadDetachedTab({payload})")

        def on_closing():
            # При закрытии окна возвращаем вкладку в главное окно
            try:
                state_json = win.evaluate_js(
                    "JSON.stringify(window.getDetachedTabState())"
                )
                if state_json:
                    # Ищем главное окно (по заголовку) и передаём вкладку
                    for w in webview.windows:
                        if w.title == "PyPostman" and w != win:
                            w.js_api.receive_returned_tab(state_json)
                            break
            except Exception:
                pass  # окно уже могло быть разрушено
            return True  # разрешаем закрытие

        win.events.loaded += on_loaded
        win.events.closing += on_closing
        self.child_windows.append(win)
        return True

    def receive_returned_tab(self, tab_state_json):
        """
        Принимает JSON-строку состояния вкладки из дочернего окна
        и добавляет её обратно в главное окно.
        Вызывается из дочернего окна через родительский js_api.
        """
        main_window = webview.active_window()
        if main_window:
            main_window.evaluate_js(
                f"window.addReturnedTab({tab_state_json})"
            )
        return True

    def return_to_parent(self):
        """
        Действие по кнопке «Вернуть в главное окно» в дочернем окне.
        Забирает состояние вкладки, отправляет в главное окно и закрывает дочернее.
        """
        win = webview.active_window()
        try:
            state_json = win.evaluate_js(
                "JSON.stringify(window.getDetachedTabState())"
            )
            if state_json:
                for w in webview.windows:
                    if w.title == "PyPostman" and w != win:
                        w.js_api.receive_returned_tab(state_json)
                        # Даём главному окну фокус
                        w.evaluate_js("window.focus()")
                        break
        except Exception:
            pass
        win.destroy()
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