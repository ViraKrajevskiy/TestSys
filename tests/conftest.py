"""
conftest.py — общие фикстуры и патчи для тестов TestSys.
Отключаем модули, требующие GUI/webview, до импорта тестируемого кода.
"""
import sys
from unittest.mock import MagicMock

# webview, pywebview — недоступны в CI/тест-окружении
sys.modules.setdefault("webview", MagicMock())
sys.modules.setdefault("pywebview", MagicMock())
