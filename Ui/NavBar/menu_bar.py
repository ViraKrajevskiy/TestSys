

from PyQt5.QtWidgets import QAction


def build_menus(main_window):
    menubar = main_window.menuBar()

    file_menu = menubar.addMenu("File")
    new_action = QAction("Новая вкладка", main_window)
    new_action.setShortcut("Ctrl+T")
    new_action.triggered.connect(main_window.new_tab)
    file_menu.addAction(new_action)

    view_menu = menubar.addMenu("View")
    theme_action = QAction("Настроить тему...", main_window)
    theme_action.triggered.connect(main_window.customize_theme)
    view_menu.addAction(theme_action)