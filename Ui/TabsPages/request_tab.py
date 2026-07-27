"""
request_tab.py
---------------
RequestTab — виджет одной вкладки запроса: URL, метод, Params/Headers/Body,
кнопка Send и блок Response. Это то, что "отрывается" в плавающее окно
и то, что позже получит вкладку автогенерации данных.
"""

import json

from PyQt5.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QComboBox, QLineEdit, QPushButton,
    QTabWidget, QTableWidget, QTableWidgetItem, QPlainTextEdit,
    QHeaderView, QLabel, QGroupBox, QMessageBox
)

from Backend.network import RequestWorker


class RequestTab(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.worker = None
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)

        req_line = QHBoxLayout()
        self.method_combo = QComboBox()
        self.method_combo.addItems(["GET", "POST", "PUT", "PATCH", "DELETE"])
        self.method_combo.setFixedWidth(90)
        self.url_input = QLineEdit()
        self.url_input.setPlaceholderText("https://jsonplaceholder.typicode.com/users")
        self.url_input.returnPressed.connect(self.send_request)
        self.send_btn = QPushButton("Send")
        self.send_btn.setObjectName("sendBtn")
        self.send_btn.setFixedWidth(90)
        self.send_btn.clicked.connect(self.send_request)
        req_line.addWidget(self.method_combo)
        req_line.addWidget(self.url_input)
        req_line.addWidget(self.send_btn)
        layout.addLayout(req_line)

        self.tabs = QTabWidget()

        self.params_table = self._make_kv_table()
        self.tabs.addTab(self._wrap_table(self.params_table, "+ Add param"), "Params")

        self.headers_table = self._make_kv_table()
        self.tabs.addTab(self._wrap_table(self.headers_table, "+ Add header"), "Headers")

        self.body_edit = QPlainTextEdit()
        self.body_edit.setPlaceholderText('{"name": "John"}')
        body_w = QWidget()
        bl = QVBoxLayout(body_w)
        bl.addWidget(QLabel("Raw JSON / Text:"))
        bl.addWidget(self.body_edit)
        self.tabs.addTab(body_w, "Body")

        layout.addWidget(self.tabs)

        resp_group = QGroupBox("Response")
        rl = QVBoxLayout(resp_group)
        self.status_label = QLabel("Status: —")
        self.response_text = QPlainTextEdit()
        self.response_text.setReadOnly(True)
        self.response_text.setPlaceholderText("Нажмите Send")
        rl.addWidget(self.status_label)
        rl.addWidget(self.response_text)
        layout.addWidget(resp_group, 1)

    def _make_kv_table(self):
        table = QTableWidget(0, 2)
        table.setHorizontalHeaderLabels(["Key", "Value"])
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        return table

    def _wrap_table(self, table, add_label):
        w = QWidget()
        l = QVBoxLayout(w)
        l.addWidget(table)
        btn = QPushButton(add_label)
        btn.clicked.connect(lambda: self.add_table_row(table))
        l.addWidget(btn)
        return w

    def add_table_row(self, table, key="", value=""):
        row = table.rowCount()
        table.insertRow(row)
        table.setItem(row, 0, QTableWidgetItem(key))
        table.setItem(row, 1, QTableWidgetItem(value))

    def get_table_data(self, table):
        data = {}
        for row in range(table.rowCount()):
            key_item = table.item(row, 0)
            val_item = table.item(row, 1)
            k = key_item.text().strip() if key_item else ""
            v = val_item.text().strip() if val_item else ""
            if k:
                data[k] = v
        return data

    def send_request(self):
        method = self.method_combo.currentText()
        url = self.url_input.text().strip()
        if not url:
            QMessageBox.warning(self, "Error", "URL пустой")
            return
        params = self.get_table_data(self.params_table)
        headers = self.get_table_data(self.headers_table)
        # Тело отправляем всегда, если заполнено — независимо от того,
        # какая под-вкладка сейчас открыта
        body = self.body_edit.toPlainText().strip() or None

        self.send_btn.setEnabled(False)
        self.send_btn.setText("...")
        self.status_label.setText("Отправка...")
        self.response_text.clear()

        self.worker = RequestWorker(method, url, params, headers, body)
        self.worker.finished.connect(self.handle_response)
        self.worker.error.connect(self.handle_error)
        self.worker.start()

    def handle_response(self, result):
        self.send_btn.setEnabled(True)
        self.send_btn.setText("Send")
        self.status_label.setText(
            f"Status: {result['status_code']} {result['reason']}   |   {result['elapsed_ms']} ms"
        )
        try:
            parsed = json.loads(result["text"])
            formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
        except Exception:
            formatted = result["text"]
        self.response_text.setPlainText(formatted)

    def handle_error(self, msg):
        self.send_btn.setEnabled(True)
        self.send_btn.setText("Send")
        self.status_label.setText("Error")
        self.response_text.setPlainText(f"Request failed:\n{msg}")