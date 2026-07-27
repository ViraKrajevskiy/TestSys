"""
tab_bar.py
----------
DetachableTabBar / DetachableTabWidget — компоненты, которые умеют
"отрывать" вкладку в отдельное окно перетаскиванием мышью
(жест как в браузере: тянешь вкладку за пределы полосы табов).

"""

from PyQt5.QtWidgets import QTabBar, QTabWidget
from PyQt5.QtCore import Qt, pyqtSignal, QPoint


class DetachableTabBar(QTabBar):
    """
    Логика: пользователь тащит вкладку мышью. Если курсор уходит
    достаточно далеко за верхнюю/нижнюю границу полосы вкладок —
    считаем это жестом "вытащить вкладку", шлём сигнал с индексом
    вкладки и текущей глобальной позицией курсора (там появится
    новое окно).
    """
    tabDetachRequested = pyqtSignal(int, QPoint)

    DETACH_THRESHOLD = 35  # px за пределами полосы вкладок

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMovable(True)
        self._press_index = -1
        self._dragging = False

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._press_index = self.tabAt(event.pos())
            self._dragging = self._press_index >= 0
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if not self._dragging or self._press_index < 0:
            return
        if not (event.buttons() & Qt.LeftButton):
            return
        y = event.pos().y()
        h = self.rect().height()
        if y < -self.DETACH_THRESHOLD or y > h + self.DETACH_THRESHOLD:
            index = self._press_index
            self._dragging = False
            self._press_index = -1
            self.tabDetachRequested.emit(index, event.globalPos())

    def mouseReleaseEvent(self, event):
        self._dragging = False
        self._press_index = -1
        super().mouseReleaseEvent(event)


class DetachableTabWidget(QTabWidget):
    tabDetachRequested = pyqtSignal(int, QPoint)

    def __init__(self, parent=None):
        super().__init__(parent)
        bar = DetachableTabBar(self)
        self.setTabBar(bar)
        bar.tabDetachRequested.connect(self.tabDetachRequested)
        self.setTabsClosable(True)
        self.setMovable(True)