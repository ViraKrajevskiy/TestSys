"""
theme.py
--------

Всё, что касается внешнего вида приложения:
  - DEFAULT_THEME / THEME_FIELDS — набор настраиваемых параметров
  - ThemeManager — загрузка/сохранение темы в JSON + генерация QSS
  - ThemeDialog — окно "Настроить тему" с полной кастомизацией
"""

import os
import json

from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QFormLayout, QPushButton, QColorDialog,
    QDialogButtonBox, QSpinBox, QFontComboBox
)
from PyQt5.QtGui import QColor, QFont


DEFAULT_THEME = {
    "main_bg": "#1e1e1e",
    "main_text": "#d4d4d4",
    "input_bg": "#252526",
    "input_border": "#3c3c3c",
    "button_bg": "#3c3c3c",
    "button_hover": "#505050",
    "accent": "#0078d4",
    "tab_bg": "#2d2d2d",
    "tab_selected_bg": "#1e1e1e",
    "tree_bg": "#252526",
    "tree_text": "#d4d4d4",
    "menu_bg": "#2d2d2d",
    "menu_selected": "#094771",
    "groupbox_border": "#3c3c3c",
    "table_header_bg": "#333333",
    "font_family": "Segoe UI",
    "font_size": 10,
    "border_radius": 4,
}

# (ключ, человекочитаемая подпись для диалога настройки)
THEME_FIELDS = [
    ("main_bg", "Фон окна"),
    ("main_text", "Основной текст"),
    ("input_bg", "Фон полей ввода"),
    ("input_border", "Рамка полей ввода"),
    ("button_bg", "Фон кнопок"),
    ("button_hover", "Кнопка при наведении"),
    ("accent", "Акцентный цвет (Send, активная вкладка)"),
    ("tab_bg", "Фон неактивной вкладки"),
    ("tab_selected_bg", "Фон активной вкладки"),
    ("tree_bg", "Фон дерева коллекций"),
    ("tree_text", "Текст дерева коллекций"),
    ("menu_bg", "Фон меню"),
    ("menu_selected", "Выделение в меню"),
    ("groupbox_border", "Рамка блока Response"),
    ("table_header_bg", "Заголовок таблиц"),
]


class ThemeManager:
    """Загрузка / сохранение / генерация QSS для темы приложения."""

    def __init__(self, path="postman_theme.json"):
        self.path = path
        self.colors = self._load()

    def _load(self):
        data = DEFAULT_THEME.copy()
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data.update(json.load(f))
            except Exception:
                pass
        return data

    def save(self):
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.colors, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def stylesheet(self):
        c = self.colors
        fs = c.get("font_size", 10)
        ff = c.get("font_family", "Segoe UI")
        br = c.get("border_radius", 4)
        return f"""
            * {{
                font-family: '{ff}';
                font-size: {fs}pt;
            }}
            QMainWindow, QDialog, QWidget {{
                background-color: {c['main_bg']};
                color: {c['main_text']};
            }}
            QLineEdit, QPlainTextEdit, QTableWidget {{
                background-color: {c['input_bg']};
                color: {c['main_text']};
                border: 1px solid {c['input_border']};
                border-radius: {br}px;
                selection-background-color: {c['accent']};
            }}
            QComboBox {{
                background-color: {c['button_bg']};
                color: {c['main_text']};
                border: 1px solid {c['input_border']};
                border-radius: {br}px;
                padding: 4px;
            }}
            QPushButton {{
                background-color: {c['button_bg']};
                color: {c['main_text']};
                border: 1px solid {c['input_border']};
                border-radius: {br}px;
                padding: 6px 10px;
            }}
            QPushButton:hover {{ background-color: {c['button_hover']}; }}
            QPushButton#sendBtn {{
                background-color: {c['accent']};
                color: white;
                font-weight: bold;
            }}
            QPushButton#sendBtn:hover {{ background-color: {c['accent']}; }}
            QTreeWidget {{
                background-color: {c['tree_bg']};
                color: {c['tree_text']};
                border: 1px solid {c['input_border']};
                border-radius: {br}px;
            }}
            QTreeWidget::item:selected {{ background-color: {c['menu_selected']}; }}
            QGroupBox {{
                color: {c['main_text']};
                border: 1px solid {c['groupbox_border']};
                border-radius: {br}px;
                margin-top: 10px;
                padding-top: 10px;
                font-weight: bold;
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 8px;
                padding: 0 4px;
            }}
            QLabel {{ color: {c['main_text']}; }}
            QTabWidget::pane {{
                border: 1px solid {c['input_border']};
                background: {c['main_bg']};
                border-radius: {br}px;
            }}
            QTabBar::tab {{
                background: {c['tab_bg']};
                color: {c['main_text']};
                padding: 7px 14px;
                border-top-left-radius: {br}px;
                border-top-right-radius: {br}px;
                margin-right: 2px;
            }}
            QTabBar::tab:selected {{
                background: {c['tab_selected_bg']};
                border-bottom: 2px solid {c['accent']};
            }}
            QHeaderView::section {{
                background-color: {c['table_header_bg']};
                color: {c['main_text']};
                border: 1px solid {c['input_border']};
                padding: 4px;
            }}
            QMenuBar {{ background-color: {c['tab_bg']}; color: {c['main_text']}; }}
            QMenuBar::item:selected {{ background-color: {c['button_hover']}; }}
            QMenu {{
                background-color: {c['menu_bg']};
                color: {c['main_text']};
                border: 1px solid {c['input_border']};
            }}
            QMenu::item:selected {{ background-color: {c['menu_selected']}; }}
            QSplitter::handle {{ background-color: {c['input_border']}; }}
        """


class ThemeDialog(QDialog):
    """Диалог полной кастомизации темы."""

    def __init__(self, theme: ThemeManager, parent=None):
        super().__init__(parent)
        self.theme = theme
        self.working = theme.colors.copy()
        self.setWindowTitle("Настройка темы")
        self.setMinimumWidth(420)

        layout = QVBoxLayout(self)
        form = QFormLayout()
        self.color_buttons = {}

        for key, label in THEME_FIELDS:
            btn = QPushButton()
            btn.setFixedWidth(90)
            self._style_swatch(btn, self.working[key])
            btn.clicked.connect(lambda _, k=key, b=btn: self.pick_color(k, b))
            self.color_buttons[key] = btn
            form.addRow(label, btn)

        self.font_combo = QFontComboBox()
        self.font_combo.setCurrentFont(QFont(self.working.get("font_family", "Segoe UI")))
        form.addRow("Шрифт", self.font_combo)

        self.font_size_spin = QSpinBox()
        self.font_size_spin.setRange(8, 24)
        self.font_size_spin.setValue(self.working.get("font_size", 10))
        form.addRow("Размер шрифта", self.font_size_spin)

        self.radius_spin = QSpinBox()
        self.radius_spin.setRange(0, 20)
        self.radius_spin.setValue(self.working.get("border_radius", 4))
        form.addRow("Скругление углов", self.radius_spin)

        layout.addLayout(form)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def _style_swatch(self, btn, color_hex):
        btn.setStyleSheet(f"background-color: {color_hex}; border: 1px solid #666;")

    def pick_color(self, key, btn):
        color = QColorDialog.getColor(QColor(self.working[key]), self, "Выбор цвета")
        if color.isValid():
            self.working[key] = color.name()
            self._style_swatch(btn, color.name())

    def get_result(self):
        self.working["font_family"] = self.font_combo.currentFont().family()
        self.working["font_size"] = self.font_size_spin.value()
        self.working["border_radius"] = self.radius_spin.value()
        return self.working