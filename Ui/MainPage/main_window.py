"""
Ui/MainPage/main_window.py
----------------------------
PostmanApp — главное окно: панель коллекций (Ui.NavBar) слева,
вкладки запросов (Ui.TabsPages) справа, меню (Ui.NavBar),
управление откреплением/докингом вкладок.
"""

from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QSplitter, QPushButton, QMenu, QDialog
)
from PyQt5.QtCore import Qt, QPoint, QSize

from Ui.Methods.theme import ThemeManager, ThemeDialog
from Ui.NavBar.collections_panel import CollectionsPanel
from Ui.NavBar.menu_bar import build_menus
from Ui.TabsPages.tab_bar import DetachableTabWidget
from Ui.TabsPages.request_tab import RequestTab
from Ui.TabsPages.floating_window import FloatingRequestWindow


class PostmanApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PyQt Postman Pro")
        self.setGeometry(100, 100, 1250, 780)

        self.theme = ThemeManager()
        self.floating_windows = []  # ссылки на живые плавающие окна, чтобы их не убрал GC

        main_splitter = QSplitter(Qt.Horizontal)

        # --- Панель коллекций (NavBar) ---
        self.collections_panel = CollectionsPanel()
        self.collections_panel.requestSelected.connect(self.open_request_from_collection)

        # --- Вкладки запросов (TabsPages) ---
        right_w = QWidget()
        rl = QVBoxLayout(right_w)
        rl.setContentsMargins(0, 0, 0, 0)

        self.request_tabs = DetachableTabWidget()
        self.request_tabs.tabCloseRequested.connect(self.close_tab)
        self.request_tabs.tabDetachRequested.connect(self.detach_tab)

        add_btn = QPushButton("+")
        add_btn.setFixedSize(QSize(28, 24))
        add_btn.clicked.connect(self.new_tab)
        self.request_tabs.setCornerWidget(add_btn, Qt.TopRightCorner)

        self.request_tabs.tabBar().setContextMenuPolicy(Qt.CustomContextMenu)
        self.request_tabs.tabBar().customContextMenuRequested.connect(self.show_tab_context_menu)

        rl.addWidget(self.request_tabs)

        main_splitter.addWidget(self.collections_panel)
        main_splitter.addWidget(right_w)
        main_splitter.setStretchFactor(1, 1)
        self.setCentralWidget(main_splitter)

        build_menus(self)
        self.new_tab()
        self.apply_theme()

    # ---------- тема ----------
    def apply_theme(self):
        self.setStyleSheet(self.theme.stylesheet())
        for win in self.floating_windows:
            win.setStyleSheet(self.theme.stylesheet())

    def customize_theme(self):
        dialog = ThemeDialog(self.theme, self)
        if dialog.exec_() == QDialog.Accepted:
            self.theme.colors = dialog.get_result()
            self.theme.save()
            self.apply_theme()

    # ---------- коллекции ----------
    def open_request_from_collection(self, method, name):
        tab = RequestTab()
        tab.method_combo.setCurrentText(method)
        base = "https://jsonplaceholder.typicode.com/users"
        if "create" in name.lower():
            tab.url_input.setText(base)
            tab.add_table_row(tab.headers_table, "Content-Type", "application/json")
            tab.body_edit.setPlainText('{"name": "Test", "email": "test@test.com"}')
        elif "update" in name.lower():
            tab.url_input.setText(base + "/1")
            tab.add_table_row(tab.headers_table, "Content-Type", "application/json")
            tab.body_edit.setPlainText('{"name": "Updated"}')
        elif "delete" in name.lower():
            tab.url_input.setText(base + "/1")
        else:
            tab.url_input.setText(base)
            if method == "GET":
                tab.add_table_row(tab.params_table, "_limit", "5")
        idx = self.request_tabs.addTab(tab, f"{method} {name}")
        self.request_tabs.setCurrentIndex(idx)

    # ---------- вкладки: создание / закрытие ----------
    def new_tab(self):
        tab = RequestTab()
        tab.url_input.setText("https://jsonplaceholder.typicode.com/users")
        tab.add_table_row(tab.headers_table, "Content-Type", "application/json")
        idx = self.request_tabs.addTab(tab, "Request")
        self.request_tabs.setCurrentIndex(idx)

    def close_tab(self, index):
        if self.request_tabs.count() > 1:
            self.request_tabs.removeTab(index)

    def show_tab_context_menu(self, pos: QPoint):
        tab_idx = self.request_tabs.tabBar().tabAt(pos)
        if tab_idx < 0:
            return
        menu = QMenu()
        detach_action = menu.addAction("Открепить в отдельное окно")
        action = menu.exec_(self.request_tabs.tabBar().mapToGlobal(pos))
        if action == detach_action:
            global_pos = self.request_tabs.tabBar().mapToGlobal(pos)
            self.detach_tab(tab_idx, global_pos)

    # ---------- отрывание / возврат вкладок ----------
    def detach_tab(self, index, global_pos: QPoint):
        if index < 0 or index >= self.request_tabs.count():
            return
        widget = self.request_tabs.widget(index)
        title = self.request_tabs.tabText(index)
        self.request_tabs.removeTab(index)

        win = FloatingRequestWindow(widget, title, self.theme)
        win.dockRequested.connect(self.dock_tab)
        win.closedWithoutDock.connect(self._cleanup_floating)
        win.move(global_pos.x() - 60, max(global_pos.y() - 20, 0))
        win.show()
        self.floating_windows.append(win)

        if self.request_tabs.count() == 0:
            self.new_tab()

    def dock_tab(self, widget, title):
        widget.setVisible(True)
        widget.show()
        idx = self.request_tabs.addTab(widget, title)
        self.request_tabs.setCurrentIndex(idx)
        self._cleanup_floating(widget)
        self.activateWindow()
        self.raise_()

    def _cleanup_floating(self, widget):
        self.floating_windows = [w for w in self.floating_windows if w.tab_widget is not widget]

    def closeEvent(self, event):
        for win in list(self.floating_windows):
            win._docked_back = True  # чтобы не триггерить closedWithoutDock повторно
            win.close()
        event.accept()