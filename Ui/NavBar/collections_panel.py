"""
Ui/NavBar/collections_panel.py
-------------------------------
CollectionsPanel — дерево сохранённых запросов слева от вкладок.
При клике на запрос эмитит сигнал requestSelected(method, name),
на который подписывается главное окно, чтобы создать вкладку
с предзаполненными данными.
"""

from PyQt5.QtWidgets import QTreeWidget, QTreeWidgetItem
from PyQt5.QtCore import Qt, pyqtSignal


class CollectionsPanel(QTreeWidget):
    requestSelected = pyqtSignal(str, str)  # method, name

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setHeaderLabel("Collections")
        self.setMaximumWidth(260)
        self._populate_demo_collection()
        self.itemClicked.connect(self._on_item_clicked)

    def _populate_demo_collection(self):
        coll = QTreeWidgetItem(["My API"])
        for method, name in [
            ("GET", "Users"), ("POST", "Create User"),
            ("PUT", "Update User"), ("DELETE", "Delete User"),
        ]:
            item = QTreeWidgetItem([f"{method} {name}"])
            item.setData(0, Qt.UserRole, method)
            coll.addChild(item)
        self.addTopLevelItem(coll)
        self.expandAll()

    def _on_item_clicked(self, item, _column):
        method = item.data(0, Qt.UserRole)
        if not method:
            return
        name = item.text(0).split(" ", 1)[-1]
        self.requestSelected.emit(method, name)