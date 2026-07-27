"""
main.py — точка входа PyPostman (pywebview + HTML/CSS/Bootstrap версия).

Запуск:
    pip install -r requirements.txt
    python main.py

Сборка в exe:
    pip install pyinstaller
    pyinstaller --onefile --windowed --add-data "ui;ui" main.py
    (на Mac/Linux вместо ";" используйте ":")
"""

import os
import webview

from api import Api

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_HTML = os.path.join(BASE_DIR, "Ui", "index.html")


def main():
    api = Api()
    webview.create_window(
        title="PyPostman",
        url=INDEX_HTML,
        js_api=api,
        width=1300,
        height=820,
        min_size=(900, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()