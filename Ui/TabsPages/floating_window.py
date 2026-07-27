"""
floating_window.py
-------------------
FloatingRequestWindow — независимое top-level окно ОС с одной
"оторванной" вкладкой запроса. Можно свободно таскать по всему
экрану, в том числе за пределы главного окна и на другой монитор.
"""

from PyQt5.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton
from PyQt5.QtCore import Qt, pyqtSignal


class FloatingRequestWindow(QMainWindow):
    dockRequested = pyqtSignal(QWidget, str)
    closedWithoutDock = pyqtSignal(QWidget)

    def __init__(self, tab_widget, title: str, theme, parent=None):
        super().__init__(parent, Qt.Window)
        self.tab_widget = tab_widget
        self.theme = theme
        self._docked_back = False

        self.setWindowTitle(f"{title} — PyQt Postman Pro")
        self.resize(950, 650)

        central = QWidget()
        layout = QVBoxLayout(central)
        layout.setContentsMargins(6, 6, 6, 6)

        top_bar = QHBoxLayout()
        hint = QLabel("Плавающее окно — перетащите или закройте")
        hint.setStyleSheet("color: gray; font-style: italic;")
        dock_btn = QPushButton("⇦ Вернуть во вкладку")
        dock_btn.clicked.connect(self.dock_back)
        top_bar.addWidget(hint)
        top_bar.addStretch()
        top_bar.addWidget(dock_btn)
        layout.addLayout(top_bar)

        layout.addWidget(self.tab_widget)
        # ВАЖНО: когда виджет вкладки убирают из QTabWidget через removeTab(),
        # Qt помечает его как явно скрытый (hide()). Просто переложить его
        # в новый layout недостаточно — Qt не покажет явно скрытый виджет
        # автоматически. Поэтому показываем его руками.
        self.tab_widget.setVisible(True)
        self.tab_widget.show()

        self.setCentralWidget(central)
        self.setStyleSheet(theme.stylesheet())

    def dock_back(self):
        self._docked_back = True
        self.dockRequested.emit(self.tab_widget, self.windowTitle().replace(" — PyQt Postman Pro", ""))
        self.close()

    def closeEvent(self, event):
        if not self._docked_back:
            self.closedWithoutDock.emit(self.tab_widget)
        event.accept()