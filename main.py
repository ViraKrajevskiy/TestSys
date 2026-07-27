"""
main.py — точка входа приложения.

Запуск (из корня проекта NewTestSys):
    pip install -r requirements.txt
    python main.py

Сборка в exe:
    pip install pyinstaller
    pyinstaller --onefile --windowed main.py
"""

import sys
from PyQt5.QtWidgets import QApplication

from Ui.MainPage.main_window import PostmanApp


def main():
    app = QApplication(sys.argv)
    window = PostmanApp()
    window.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()