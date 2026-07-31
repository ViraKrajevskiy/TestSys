"""
api.py — UPDATED
Добавлены методы для Data Generator с логированием в файл.
"""

import json
import os
import sys
import threading
import webview
import logging
from datetime import datetime
import random
import string
import re
import requests

from network import send_http_request

IS_FROZEN = getattr(sys, "frozen", False)

if IS_FROZEN:
    BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Папка для пользовательских файлов (log, theme) — рядом с exe / корень проекта
USER_DATA_DIR = os.environ.get(
    "TESTSYS_USER_DATA_DIR",
    os.path.dirname(sys.executable) if IS_FROZEN else os.path.dirname(BASE_DIR),
)

INDEX_HTML = os.path.join(BASE_DIR, "Ui", "index.html")
MAIN_WINDOW_TITLE = "TestSys"
API_BASE_URL = "http://127.0.0.1:8000"

# ============================================================
# LOGGING SETUP
# ============================================================

LOG_FILE = os.path.join(USER_DATA_DIR, "testsys.log")

logger = logging.getLogger("TestSys")
logger.setLevel(logging.DEBUG)
logger.propagate = False

# Модуль может быть импортирован повторно (дочерние окна) — не плодим
# обработчики, иначе каждая строка пишется в файл по нескольку раз.
if not logger.handlers:
    # RotatingFileHandler вместо FileHandler:
    #  * mode="a" — дописываем, а не затираем при каждом запуске
    #  * ротация — файл не растёт бесконечно, старое уезжает в .1/.2/.3
    try:
        from logging.handlers import RotatingFileHandler

        file_handler = RotatingFileHandler(
            LOG_FILE,
            mode="a",
            maxBytes=5 * 1024 * 1024,   # 5 МБ на файл
            backupCount=3,               # храним 3 предыдущих
            encoding="utf-8",
            delay=False,
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        )
        logger.addHandler(file_handler)
    except Exception as e:
        print(f"Failed to setup file logging: {e}")

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter("%(levelname)s - %(message)s"))
    logger.addHandler(console_handler)

    # Разделитель сессий — видно, где начался новый запуск
    logger.info("=" * 60)
    logger.info(f"НОВЫЙ ЗАПУСК · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)


def _flush_log():
    """Принудительно сбросить буферы — чтобы просмотрщик видел свежие записи."""
    for h in logger.handlers:
        try:
            h.flush()
        except Exception:
            pass


# ============================================================
# DATA GENERATOR UTILS
# ============================================================

class DataGenUtils:
    """Utilities for generating random test data"""

    @staticmethod
    def random_text(length=10):
        """Generate random text"""
        chars = string.ascii_letters
        return ''.join(random.choice(chars) for _ in range(length))

    @staticmethod
    def random_number(min_val=1, max_val=1000):
        """Generate random number"""
        return random.randint(min_val, max_val)

    @staticmethod
    def random_email():
        """Generate random email"""
        return f"{DataGenUtils.random_text(8)}@{DataGenUtils.random_text(6)}.com"

    @staticmethod
    def random_phone():
        """Generate random phone"""
        return f"+1{random.randint(2000000000, 9999999999)}"

    @staticmethod
    def random_password(length=12):
        """Generate strong password"""
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(random.choice(chars) for _ in range(length))

    @staticmethod
    def random_status(statuses=None):
        """Generate random status"""
        if statuses is None:
            statuses = ['active', 'inactive', 'pending', 'approved', 'rejected']
        return random.choice(statuses)

    @staticmethod
    def random_date(days_ago=365):
        """Generate random date"""
        from datetime import datetime, timedelta
        date = datetime.now() - timedelta(days=random.randint(0, days_ago))
        return date.strftime("%Y-%m-%d")

    @staticmethod
    def detect_field_type(field_name):
        """Detect field type by name"""
        name = field_name.lower()
        if 'email' in name:
            return 'email'
        if 'password' in name:
            return 'password'
        if 'phone' in name or 'tel' in name:
            return 'phone'
        if 'status' in name or 'state' in name:
            return 'status'
        if 'date' in name or 'time' in name:
            return 'date'
        if 'age' in name or 'count' in name or 'id' in name or 'number' in name:
            return 'number'
        return 'text'

    @staticmethod
    def smart_fill(field_name):
        """Smart fill based on field name"""
        field_type = DataGenUtils.detect_field_type(field_name)

        if field_type == 'email':
            return DataGenUtils.random_email()
        elif field_type == 'password':
            return DataGenUtils.random_password()
        elif field_type == 'phone':
            return DataGenUtils.random_phone()
        elif field_type == 'status':
            return DataGenUtils.random_status()
        elif field_type == 'date':
            return DataGenUtils.random_date()
        elif field_type == 'number':
            return DataGenUtils.random_number()
        else:
            return DataGenUtils.random_text()


# ============================================================
# VALIDATION
# ============================================================

def validate_field(field_name, value):
    """Validate field data"""
    field_lower = field_name.lower()
    value_str = str(value).strip()

    # Email
    if 'email' in field_lower:
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', value_str):
            return False, "Invalid email format"
        return True, ""

    # Phone
    if 'phone' in field_lower or 'tel' in field_lower:
        digits = ''.join(c for c in value_str if c.isdigit())
        if len(digits) < 9 or len(digits) > 15:
            return False, "Invalid phone (9-15 digits)"
        return True, ""

    # Number
    if any(x in field_lower for x in ['id', 'count', 'age', 'number']):
        try:
            int(value_str)
            return True, ""
        except:
            return False, "Must be a number"

    # Status
    if 'status' in field_lower:
        valid = ['active', 'inactive', 'pending', 'approved', 'rejected']
        if value_str.lower() not in valid:
            return False, f"Must be: {', '.join(valid)}"
        return True, ""

    # Date
    if 'date' in field_lower:
        if not re.match(r'^\d{4}-\d{2}-\d{2}', value_str):
            return False, "Use YYYY-MM-DD format"
        return True, ""

    # Required
    if not value_str:
        return False, "Cannot be empty"

    return True, ""


# ============================================================
# API CLASS
# ============================================================

def _dialog_type(name):
    """
    Совместимость pywebview: в новых версиях webview.FileDialog.SAVE,
    в старых webview.SAVE_DIALOG. Без этого сыплются deprecation-warning.
    """
    fd = getattr(webview, "FileDialog", None)
    if fd is not None and hasattr(fd, name):
        return getattr(fd, name)
    return getattr(webview, f"{name}_DIALOG")


class Api:
    def __init__(self, window_kind="main"):
        self.child_windows = []
        self._detached_tab_state_json = None
        # Тип окна: main | randomizer | detached.
        # Раньше он передавался через #hash в URL, но pywebview отдаёт
        # страницу через свой http-сервер и хеш до JS не доезжал —
        # дочернее окно считало себя главным и ломало вставку данных.
        self.window_kind = window_kind
        logger.info(f"=== TestSys API Initialized (window={window_kind}) ===")

    def get_window_kind(self):
        """Какому окну принадлежит этот экземпляр API."""
        return self.window_kind

    # ========== LOGGING ==========
    def log_message(self, message, level="INFO"):
        """Log message to file and console"""
        if level == "ERROR":
            logger.error(message)
        elif level == "WARNING":
            logger.warning(message)
        elif level == "DEBUG":
            logger.debug(message)
        else:
            logger.info(message)
        return {"logged": True, "message": message}

    def get_log_file(self):
        """Return path to log file"""
        return LOG_FILE

    def log_client_error(self, entry_json):
        """Записать ошибку из UI (JS) в общий лог-файл."""
        try:
            e = json.loads(entry_json) if isinstance(entry_json, str) else entry_json
            level = (e.get("level") or "ERROR").upper()
            src = e.get("source") or "UI"
            msg = e.get("message") or ""
            stack = e.get("stack") or ""
            line = f"[{src}] {msg}"
            if stack:
                line += f"\n{stack}"
            if level == "WARN" or level == "WARNING":
                logger.warning(line)
            elif level == "INFO":
                logger.info(line)
            else:
                logger.error(line)
            return True
        except Exception as ex:
            logger.error(f"log_client_error failed: {ex}")
            return False

    def read_log(self, max_lines=3000):
        """Прочитать хвост лог-файла."""
        try:
            # Без этого свежие записи могут ещё сидеть в буфере
            # и просмотрщик покажет неполную картину.
            _flush_log()

            if not os.path.exists(LOG_FILE):
                return {"ok": True, "lines": [], "path": LOG_FILE, "size": 0, "total": 0}

            size = os.path.getsize(LOG_FILE)
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                if size > 5_000_000:
                    f.seek(size - 5_000_000)
                    f.readline()  # пропустить обрезанную строку
                lines = f.readlines()

            total = len(lines)
            tail = [ln.rstrip("\n") for ln in lines[-int(max_lines):]]
            return {
                "ok": True, "lines": tail, "path": LOG_FILE,
                "size": size, "total": total, "shown": len(tail),
            }
        except Exception as e:
            return {"ok": False, "error": str(e), "path": LOG_FILE}

    def configure_log_rotation(self, max_mb=5, backup_count=3):
        """
        Перенастроить ротацию лога на лету.
        Пользователь задаёт размер в настройках — применяем без перезапуска.
        """
        try:
            max_bytes = int(max(1, min(200, max_mb))) * 1024 * 1024
            backups = int(max(0, min(20, backup_count)))
            changed = False

            for h in logger.handlers:
                if hasattr(h, "maxBytes"):
                    if h.maxBytes != max_bytes or h.backupCount != backups:
                        h.maxBytes = max_bytes
                        h.backupCount = backups
                        changed = True

            if changed:
                logger.info(f"Ротация лога: {max_mb} МБ, архивов {backups}")
            return {"ok": True, "max_mb": max_mb, "backups": backups}
        except Exception as e:
            logger.error(f"configure_log_rotation failed: {e}")
            return {"ok": False, "error": str(e)}

    def get_log_stats(self):
        """Размер лога и количество архивных файлов — для UI."""
        try:
            _flush_log()
            size = os.path.getsize(LOG_FILE) if os.path.exists(LOG_FILE) else 0
            backups = [f for f in os.listdir(USER_DATA_DIR)
                       if f.startswith("testsys.log.")]
            return {"ok": True, "size": size, "backups": len(backups), "path": LOG_FILE}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def clear_log(self, with_backups=True):
        """Очистить лог-файл (и архивы ротации)."""
        try:
            removed = 0

            # Через сам обработчик, чтобы не рассинхронизировать его позицию
            for h in logger.handlers:
                if hasattr(h, "baseFilename"):
                    try:
                        h.acquire()
                        if h.stream:
                            h.stream.close()
                            h.stream = None
                        with open(LOG_FILE, "w", encoding="utf-8"):
                            pass
                        h.stream = h._open()
                    finally:
                        h.release()

            if with_backups:
                for f in os.listdir(USER_DATA_DIR):
                    if f.startswith("testsys.log."):
                        try:
                            os.remove(os.path.join(USER_DATA_DIR, f))
                            removed += 1
                        except Exception:
                            pass

            logger.info(f"Лог очищен пользователем (архивов удалено: {removed})")
            _flush_log()
            return {"ok": True, "backups_removed": removed}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def export_log(self):
        """Сохранить копию лога через диалог."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}
            result = win.create_file_dialog(
                _dialog_type("SAVE"),
                save_filename="testsys_log.txt",
                file_types=("Text files (*.txt)", "Log files (*.log)"),
            )
            if not result:
                return {"ok": False, "cancelled": True}
            path = result if isinstance(result, str) else result[0]

            content = ""
            if os.path.exists(LOG_FILE):
                with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"ok": True, "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_log_folder(self):
        """Открыть папку с логом в проводнике."""
        try:
            folder = os.path.dirname(LOG_FILE)
            if sys.platform == "win32":
                os.startfile(folder)
            elif sys.platform == "darwin":
                import subprocess
                subprocess.Popen(["open", folder])
            else:
                import subprocess
                subprocess.Popen(["xdg-open", folder])
            return {"ok": True, "path": folder}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ========== DATA GENERATOR ==========
    def generate_field(self, field_name):
        """Generate value for a single field"""
        try:
            value = DataGenUtils.smart_fill(field_name)
            logger.debug(f"Generated {field_name}: {value}")
            return {"success": True, "field": field_name, "value": value}
        except Exception as e:
            logger.error(f"Error generating {field_name}: {e}")
            return {"success": False, "error": str(e)}

    def generate_data(self, field_names):
        """
        Generate test data for multiple fields
        Args:
            field_names: list of field names to generate
        Returns:
            dict with generated values
        """
        try:
            logger.info(f"Generating data for {len(field_names)} fields")
            result = {}

            for field_name in field_names:
                result[field_name] = DataGenUtils.smart_fill(field_name)

            logger.info(f"✅ Generated {len(result)} fields successfully")
            return {"success": True, "data": result}
        except Exception as e:
            logger.error(f"Error generating data: {e}")
            return {"success": False, "error": str(e)}

    def validate_data(self, data_dict):
        """
        Validate generated data
        Args:
            data_dict: dict with field names and values
        Returns:
            validation results
        """
        try:
            logger.info(f"Validating {len(data_dict)} fields")
            errors = []

            for field_name, value in data_dict.items():
                valid, error = validate_field(field_name, value)
                if not valid:
                    errors.append(f"{field_name}: {error}")

            if errors:
                logger.warning(f"Validation errors: {errors}")
                return {
                    "success": False,
                    "errors": errors
                }

            logger.info("✅ All fields validated successfully")
            return {"success": True, "message": "All fields valid"}
        except Exception as e:
            logger.error(f"Error validating data: {e}")
            return {"success": False, "error": str(e)}

    # ========== HTTP REQUESTS (existing) ==========
    def send_request(self, method, url, headers, params, body):
        """Отправка HTTP-запроса. Вызывается из app.js."""
        return send_http_request(method, url, headers, params, body)

    # ========== TAB MANAGEMENT (existing) ==========
    def sync_detached_state(self, state_json):
        """Кэширует состояние вкладки в дочернем окне."""
        if state_json:
            self._detached_tab_state_json = state_json
        return True

    def _find_main_window(self):
        for w in webview.windows:
            if w.title == MAIN_WINDOW_TITLE:
                return w
        return None

    def _deliver_returned_tab(self, state_json):
        if not state_json:
            return
        main_window = self._find_main_window()
        if not main_window:
            return
        try:
            main_window.evaluate_js(f"window.addReturnedTab({state_json})")
        except Exception:
            pass

    def _schedule_returned_tab(self, state_json):
        if state_json:
            threading.Timer(0.05, self._deliver_returned_tab, args=(state_json,)).start()

    def open_detached_window(self, tab_state):
        """Создаёт новое окно ОС с копией вкладки."""
        new_api = Api(window_kind="detached")
        state_json = json.dumps(tab_state)
        new_api._detached_tab_state_json = state_json

        win = webview.create_window(
            title="TestSys — detached",
            url=INDEX_HTML,
            js_api=new_api,
            width=1000,
            height=700,
        )
        payload = json.dumps(tab_state)

        def on_loaded():
            win.evaluate_js(f"window.loadDetachedTab({payload})")

        def on_closing():
            self._schedule_returned_tab(new_api._detached_tab_state_json)
            try:
                self.child_windows.remove(win)
            except ValueError:
                pass
            return True

        win.events.loaded += on_loaded
        win.events.closing += on_closing
        self.child_windows.append(win)
        return True

    def receive_returned_tab(self, tab_state_json):
        """Принимает JSON-строку состояния вкладки из дочернего окна."""
        self._deliver_returned_tab(tab_state_json)
        return True

    def return_to_parent(self):
        """Действие по кнопке «Вернуть в главное окно» в дочернем окне."""
        win = webview.active_window()
        state_json = self._detached_tab_state_json

        try:
            win.destroy()
        except Exception:
            pass

        self._schedule_returned_tab(state_json)
        return True

    # ========== SETTINGS ==========
    def save_settings(self, settings_json):
        """Сохраняет настройки в settings.json."""
        try:
            path = os.path.join(USER_DATA_DIR, "settings.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(settings_json)
            logger.info("Settings saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return False

    def load_settings(self):
        """Загружает настройки из settings.json."""
        path = os.path.join(USER_DATA_DIR, "settings.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None

    # ========== RANDOMIZER WINDOW ==========
    RANDOMIZER_WINDOW_TITLE = "TestSys — Randomizer"

    def open_randomizer_window(self):
        """Открывает рандомайзер в отдельном независимом окне ОС."""
        # Если окно уже открыто — не создаём второе
        for w in webview.windows:
            if w.title == self.RANDOMIZER_WINDOW_TITLE:
                try:
                    w.restore()
                    w.show()
                except Exception:
                    pass
                return True

        # Тип окна передаётся через сам объект API — надёжнее хеша в URL
        new_api = Api(window_kind="randomizer")
        win = webview.create_window(
            title=self.RANDOMIZER_WINDOW_TITLE,
            url=INDEX_HTML,
            js_api=new_api,
            width=560,
            height=760,
            min_size=(420, 500),
        )

        def on_loaded():
            win.evaluate_js("window.loadRandomizerWindow && window.loadRandomizerWindow()")

        def on_closing():
            try:
                self.child_windows.remove(win)
            except ValueError:
                pass
            return True

        win.events.loaded += on_loaded
        win.events.closing += on_closing
        self.child_windows.append(win)
        logger.info("Randomizer window opened")
        return True

    def insert_into_main_body(self, text):
        """Вставить текст в Body активной вкладки главного окна (из окна рандомайзера)."""
        main_window = self._find_main_window()
        if not main_window:
            return False
        try:
            payload = json.dumps(text)
            main_window.evaluate_js(f"window.insertIntoActiveBody && window.insertIntoActiveBody({payload})")
            return True
        except Exception as e:
            logger.error(f"insert_into_main_body failed: {e}")
            return False

    def set_main_body(self, text):
        """Заменить Body активной вкладки главного окна (из окна рандомайзера)."""
        main_window = self._find_main_window()
        if not main_window:
            return False
        try:
            payload = json.dumps(text)
            main_window.evaluate_js(f"window.setActiveBody && window.setActiveBody({payload})")
            return True
        except Exception as e:
            logger.error(f"set_main_body failed: {e}")
            return False

    def get_main_body(self):
        """Получить Body активной вкладки главного окна (для окна рандомайзера)."""
        main_window = self._find_main_window()
        if not main_window:
            return None
        try:
            return main_window.evaluate_js("window.getActiveBody ? window.getActiveBody() : null")
        except Exception as e:
            logger.error(f"get_main_body failed: {e}")
            return None

    # ========== SYNC: HOST MODE (этот комп = сервер) ==========
    def sync_host_start(self, port=8777, token="", host_name=""):
        """Стать хостом: поднять LAN-сервер синхронизации."""
        import sync_server
        data_file = os.path.join(USER_DATA_DIR, "shared_collections.json")
        res = sync_server.start(port=port, data_file=data_file, token=token, host_name=host_name)
        logger.info(f"Sync host start: {res}")
        return res

    def sync_host_stop(self):
        import sync_server
        res = sync_server.stop()
        logger.info("Sync host stopped")
        return res

    def sync_host_status(self):
        import sync_server
        return sync_server.status()

    def sync_get_local_ips(self):
        import sync_server
        return sync_server.get_local_ips()

    # ========== SYNC: CLIENT MODE (подключение к хосту) ==========
    def sync_client_ping(self, base_url, token=""):
        """Проверить доступность хоста."""
        try:
            headers = {"X-Sync-Token": token} if token else {}
            r = requests.get(f"{base_url.rstrip('/')}/api/ping", headers=headers, timeout=5)
            return {"ok": r.ok, "status": r.status_code, "data": r.json() if r.ok else None}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_client_pull(self, base_url, token=""):
        """Забрать коллекции с хоста."""
        try:
            headers = {"X-Sync-Token": token} if token else {}
            r = requests.get(f"{base_url.rstrip('/')}/api/collections", headers=headers, timeout=10)
            if r.status_code == 401:
                return {"ok": False, "error": "Неверный токен доступа"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "doc": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_client_push(self, base_url, token, payload_json):
        """Отправить коллекции на хост."""
        try:
            headers = {"Content-Type": "application/json"}
            if token:
                headers["X-Sync-Token"] = token
            r = requests.put(
                f"{base_url.rstrip('/')}/api/collections",
                headers=headers,
                data=payload_json.encode("utf-8"),
                timeout=10,
            )
            if r.status_code == 401:
                return {"ok": False, "error": "Неверный токен доступа"}
            if r.status_code == 409:
                return {"ok": False, "conflict": True, "data": r.json()}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "data": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ========== SYNC: SHARED FOLDER (Dropbox / Яндекс.Диск / OneDrive) ==========
    def pick_shared_folder(self):
        """Диалог выбора папки для общего файла коллекций."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}
            result = win.create_file_dialog(_dialog_type("FOLDER"))
            if not result:
                return {"ok": False, "cancelled": True}
            path = result if isinstance(result, str) else result[0]
            return {"ok": True, "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def shared_folder_read(self, folder_path):
        """Прочитать общий файл коллекций из папки."""
        try:
            path = os.path.join(folder_path, "testsys_shared.json")
            if not os.path.exists(path):
                return {"ok": True, "exists": False, "mtime": 0, "content": None}
            mtime = os.path.getmtime(path)
            with open(path, "r", encoding="utf-8") as f:
                return {"ok": True, "exists": True, "mtime": mtime, "content": f.read()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def shared_folder_write(self, folder_path, content):
        """Записать общий файл коллекций (атомарно)."""
        try:
            if not os.path.isdir(folder_path):
                return {"ok": False, "error": "Папка не найдена"}
            path = os.path.join(folder_path, "testsys_shared.json")
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp, path)
            return {"ok": True, "mtime": os.path.getmtime(path), "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def shared_folder_mtime(self, folder_path):
        """Время изменения общего файла — для отслеживания правок других."""
        try:
            path = os.path.join(folder_path, "testsys_shared.json")
            return os.path.getmtime(path) if os.path.exists(path) else 0
        except Exception:
            return 0

    # ========== ОБНОВЛЕНИЯ ==========
    def get_app_version(self):
        """Текущая версия и режим запуска."""
        try:
            import version as v
            return {
                "version": v.__version__,
                "repo": v.GITHUB_REPO,
                "asset": v.ASSET_NAME,
                "frozen": IS_FROZEN,   # в dev-режиме обновление недоступно
            }
        except Exception as e:
            return {"version": "0.0.0", "repo": "", "asset": "", "frozen": IS_FROZEN, "error": str(e)}

    def check_updates(self, repo="", include_prerelease=False, token=""):
        """Список релизов с GitHub + признак наличия обновления."""
        import updater
        try:
            import version as v
            cur = v.__version__
            repo = repo or v.GITHUB_REPO
            asset = v.ASSET_NAME
        except Exception:
            cur, asset = "0.0.0", "TestSys.exe"

        res = updater.fetch_releases(repo, asset, include_prerelease, token=token)
        if not res.get("ok"):
            logger.warning(f"Проверка обновлений: {res.get('error')}")
            return res

        releases = res["releases"]
        newest = releases[0] if releases else None
        has_update = bool(newest and updater.is_newer(newest["version"], cur))

        if has_update:
            logger.info(f"Доступна версия {newest['version']} (текущая {cur})")

        return {
            "ok": True,
            "current": cur,
            "has_update": has_update,
            "latest": newest,
            "releases": releases,
        }

    def download_update(self, url, size=0, sha_url=""):
        import updater
        logger.info(f"Скачивание обновления: {url}")
        return updater.download_release(url, size, sha_url)

    def download_progress(self):
        import updater
        return updater.download_state()

    def install_update(self, path=""):
        """Поставить скачанную версию и перезапуститься."""
        import updater
        try:
            import version as v
            cur = v.__version__
        except Exception:
            cur = "0.0.0"

        target = path or updater.download_state().get("path", "")
        res = updater.install(target, cur)
        if res.get("ok"):
            logger.info("Установка обновления — приложение закрывается")
            # Даём интерфейсу дорисовать сообщение и выходим
            threading.Timer(1.2, self._quit_all).start()
        return res

    def list_backups(self):
        import updater
        return {"ok": True, "backups": updater.list_backups()}

    def rollback_version(self, backup_path):
        """Откатиться на сохранённую локально версию."""
        import updater
        try:
            import version as v
            cur = v.__version__
        except Exception:
            cur = "0.0.0"

        res = updater.rollback(backup_path, cur)
        if res.get("ok"):
            logger.info(f"Откат на {backup_path}")
            threading.Timer(1.2, self._quit_all).start()
        return res

    def cleanup_backups(self, keep=3):
        import updater
        return updater.cleanup_backups(keep)

    def _quit_all(self):
        """Закрыть все окна — установщик ждёт выхода процесса."""
        try:
            for w in list(webview.windows):
                try:
                    w.destroy()
                except Exception:
                    pass
        except Exception:
            pass

    # ========== SWAGGER / OPENAPI ==========
    def fetch_swagger(self, url):
        """
        Скачать спецификацию OpenAPI/Swagger.

        Пробуем несколько мест сразу, потому что фреймворки называют их по-разному:
          * FastAPI     — /openapi.json
          * Django DRF (drf-spectacular) — /api/schema/  (по умолчанию YAML)
          * Django DRF (drf-yasg)        — /swagger.json, /swagger/?format=openapi
          * Django Ninja                 — /api/openapi.json
          * ASP.NET     — /swagger/v1/swagger.json
          * Spring      — /v3/api-docs

        Тянем из Python, а не из JS — иначе упрёмся в CORS.
        """
        try:
            u = url.strip()
            if not u.lower().startswith(("http://", "https://")):
                return {"ok": False, "error": "URL должен начинаться с http:// или https://"}

            candidates = list(self._swagger_candidates(u))

            headers = {
                # Многие фреймворки без Accept возвращают HTML или 406.
                # Django DRF без этого отдал бы страницу браузерного UI.
                "Accept": "application/json, application/yaml, text/yaml, */*;q=0.8",
                "User-Agent": "TestSys/1.0 (+swagger-import)",
            }

            tried = []
            for cand in candidates:
                try:
                    r = requests.get(cand, timeout=15, headers=headers, allow_redirects=True)
                    tried.append(f"{cand} → {r.status_code}")
                    if not r.ok:
                        continue

                    text = r.text
                    if not text or len(text) < 20:
                        continue

                    # Пришёл HTML (Swagger UI) — пропускаем, нам нужен JSON/YAML
                    stripped = text.lstrip().lower()
                    if stripped.startswith(("<!doctype", "<html")):
                        continue

                    parsed = self._parse_spec_text(text)
                    if not parsed:
                        continue

                    logger.info(f"Swagger загружен: {cand} ({len(text)} байт)")
                    # Отдаём в UI уже как JSON — парсер на стороне JS его разберёт
                    return {"ok": True, "content": parsed, "url": cand}
                except Exception as e:
                    tried.append(f"{cand} → {e}")
                    continue

            return {
                "ok": False,
                "error": "Спецификация не найдена по адресу. Проверьте, что сервер отдаёт "
                         "OpenAPI JSON/YAML — например /api/schema/, /openapi.json или /swagger.json",
                "tried": tried[:10],
            }
        except Exception as e:
            logger.error(f"fetch_swagger failed: {e}")
            return {"ok": False, "error": str(e)}

    def _swagger_candidates(self, u):
        """Список URL-кандидатов, где может лежать спецификация."""
        seen = set()

        def push(x):
            if x and x not in seen:
                seen.add(x)
                yield x

        # 1. Исходный адрес — как есть
        yield from push(u)

        low = u.lower().rstrip("/")
        base = u.rstrip("/")

        # Уже прямая ссылка на файл — дальше не варьируем
        if low.endswith((".json", ".yaml", ".yml")):
            return

        # 2. Явные форматы через query — универсальный трюк DRF/Ninja
        sep = "&" if "?" in base else "?"
        for q in ("format=openapi", "format=openapi-json", "format=json", "format=yaml"):
            yield from push(base + sep + q)

        # 3. Стандартные суффиксы поверх текущего пути
        suffixes = (
            "/openapi.json", "/openapi.yaml",
            "/swagger.json", "/swagger.yaml",
            "/schema/", "/schema.json", "/schema.yaml",
            "/api-docs", "/api-docs.json",
            "/v3/api-docs", "/v2/api-docs",
            "/swagger/v1/swagger.json",
            "/?format=openapi", "/?format=json",
        )
        for suf in suffixes:
            yield from push(base + suf)

        # 4. То же от родительских путей — на случай, если дали адрес UI:
        #    /api/docs/  →  пробуем /api/schema/, /api/openapi.json и т.д.
        #    /api/       →  пробуем /openapi.json
        from urllib.parse import urlparse, urlunparse
        pr = urlparse(u.split("?")[0])
        parts = [p for p in pr.path.split("/") if p]
        while parts:
            parts.pop()
            parent = urlunparse((pr.scheme, pr.netloc, "/" + "/".join(parts), "", "", ""))
            for suf in ("/openapi.json", "/swagger.json", "/schema/",
                        "/schema.json", "/api-docs", "/v3/api-docs",
                        "/swagger/v1/swagger.json"):
                yield from push(parent.rstrip("/") + suf)

    def _parse_spec_text(self, text):
        """
        Привести содержимое к JSON-строке. Принимаем и JSON, и YAML —
        Django DRF по умолчанию отдаёт YAML, и это норма.
        """
        stripped = text.lstrip()

        # Уже JSON
        if stripped.startswith(("{", "[")):
            try:
                obj = json.loads(text)
            except Exception:
                return None
        else:
            # YAML — но только если PyYAML установлен. В сборке он бывает не всегда.
            try:
                import yaml   # type: ignore
                obj = yaml.safe_load(text)
            except ImportError:
                logger.warning("Спецификация в YAML, но PyYAML не установлен. "
                               "Попросите сервер вернуть JSON (?format=json).")
                return None
            except Exception:
                return None

        if not isinstance(obj, dict):
            return None
        if "openapi" not in obj and "swagger" not in obj:
            return None
        return json.dumps(obj)

    def save_text_file(self, filename, content, file_types=None):
        """
        Сохранить произвольный текст через диалог.
        В вебвью ссылка с download не срабатывает — экспорт CSV и подобное
        нужно проводить через нативный диалог.
        """
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}

            types = tuple(file_types) if file_types else ("All files (*.*)",)
            result = win.create_file_dialog(
                _dialog_type("SAVE"),
                save_filename=filename,
                file_types=types,
            )
            if not result:
                return {"ok": False, "cancelled": True}

            path = result if isinstance(result, str) else result[0]
            # BOM — чтобы Excel не ломал кириллицу в CSV
            enc = "utf-8-sig" if path.lower().endswith(".csv") else "utf-8"
            with open(path, "w", encoding=enc, newline="") as f:
                f.write(content)

            logger.info(f"Файл сохранён: {path}")
            return {"ok": True, "path": path}
        except Exception as e:
            logger.error(f"save_text_file failed: {e}")
            return {"ok": False, "error": str(e)}

    def save_metrics(self, metrics_json):
        """Сохранить историю метрик, чтобы она пережила перезапуск."""
        try:
            path = os.path.join(USER_DATA_DIR, "metrics.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(metrics_json)
            return True
        except Exception as e:
            logger.error(f"save_metrics failed: {e}")
            return False

    def load_metrics(self):
        """Загрузить историю метрик."""
        path = os.path.join(USER_DATA_DIR, "metrics.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None

    def open_swagger_file(self):
        """Выбрать файл спецификации на диске."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}
            result = win.create_file_dialog(
                _dialog_type("OPEN"),
                allow_multiple=False,
                file_types=("OpenAPI (*.json;*.yaml;*.yml)", "All files (*.*)"),
            )
            if not result:
                return {"ok": False, "cancelled": True}
            path = result if isinstance(result, str) else result[0]
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                return {"ok": True, "content": f.read(), "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ========== COLLECTIONS EXPORT / IMPORT ==========
    def export_collection_file(self, filename, content):
        """Диалог сохранения: выгружает коллекцию в .json файл."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}

            result = win.create_file_dialog(
                _dialog_type("SAVE"),
                save_filename=filename,
                file_types=("JSON files (*.json)",),
            )
            if not result:
                return {"ok": False, "cancelled": True}

            path = result if isinstance(result, str) else result[0]
            if not path.lower().endswith(".json"):
                path += ".json"

            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            logger.info(f"Collection exported: {path}")
            return {"ok": True, "path": path}
        except Exception as e:
            logger.error(f"Export failed: {e}")
            return {"ok": False, "error": str(e)}

    def import_collection_file(self):
        """Диалог открытия: читает коллекцию из .json файла."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}

            result = win.create_file_dialog(
                _dialog_type("OPEN"),
                allow_multiple=False,
                file_types=("JSON files (*.json)", "All files (*.*)"),
            )
            if not result:
                return {"ok": False, "cancelled": True}

            path = result if isinstance(result, str) else result[0]
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            logger.info(f"Collection imported: {path}")
            return {"ok": True, "content": content, "path": path}
        except Exception as e:
            logger.error(f"Import failed: {e}")
            return {"ok": False, "error": str(e)}

    # ========== COLLECTIONS ==========
    def save_collections(self, collections_json):
        """Сохраняет пользовательские коллекции."""
        try:
            path = os.path.join(USER_DATA_DIR, "collections.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(collections_json)
            logger.info("Collections saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save collections: {e}")
            return False

    def load_collections(self):
        """Загружает коллекции из collections.json."""
        path = os.path.join(USER_DATA_DIR, "collections.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None

    # ========== THEME (existing) ==========
    def save_theme(self, theme_json):
        """Сохраняет тему в файл theme.json рядом с main.py / exe."""
        try:
            path = os.path.join(USER_DATA_DIR, "theme.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(theme_json)
            logger.info("Theme saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save theme: {e}")
            return False

    def load_theme(self):
        """Загружает тему из файла theme.json."""
        path = os.path.join(USER_DATA_DIR, "theme.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return None
        return None

    # ========== USERS CRUD (existing) ==========
    def get_users(self, skip=0, limit=10):
        """Получить список всех пользователей."""
        url = f"{API_BASE_URL}/users"
        result = send_http_request("GET", url, {}, {"skip": str(skip), "limit": str(limit)}, None)
        if result["ok"]:
            try:
                return json.loads(result["text"])
            except:
                return []
        else:
            return {"error": result.get("error", "Failed to fetch users")}

    def create_user(self, name, email, phone="", company="", website="", address=""):
        """Создать нового пользователя."""
        url = f"{API_BASE_URL}/users"
        body = json.dumps({
            "name": name,
            "email": email,
            "phone": phone,
            "company": company,
            "website": website,
            "address": address
        })
        result = send_http_request("POST", url, {"Content-Type": "application/json"}, {}, body)
        if result["ok"]:
            try:
                return json.loads(result["text"])
            except:
                return result
        else:
            return {"error": result.get("error", "Failed to create user")}

    def get_user(self, user_id):
        """Получить пользователя по ID."""
        url = f"{API_BASE_URL}/users/{user_id}"
        result = send_http_request("GET", url, {}, {}, None)
        if result["ok"]:
            try:
                return json.loads(result["text"])
            except:
                return result
        else:
            return {"error": result.get("error", "Failed to fetch user")}

    def update_user(self, user_id, name=None, email=None, phone=None, company=None, website=None, address=None):
        """Обновить пользователя."""
        url = f"{API_BASE_URL}/users/{user_id}"
        update_data = {}
        if name is not None:
            update_data["name"] = name
        if email is not None:
            update_data["email"] = email
        if phone is not None:
            update_data["phone"] = phone
        if company is not None:
            update_data["company"] = company
        if website is not None:
            update_data["website"] = website
        if address is not None:
            update_data["address"] = address

        body = json.dumps(update_data)
        result = send_http_request("PUT", url, {"Content-Type": "application/json"}, {}, body)
        if result["ok"]:
            try:
                return json.loads(result["text"])
            except:
                return result
        else:
            return {"error": result.get("error", "Failed to update user")}

    def delete_user(self, user_id):
        """Удалить пользователя."""
        url = f"{API_BASE_URL}/users/{user_id}"
        result = send_http_request("DELETE", url, {}, {}, None)
        return {"ok": result["ok"], "status": result.get("status_code", 0)}

    def check_api_health(self):
        """Проверить доступность API."""
        url = f"{API_BASE_URL}/health"
        result = send_http_request("GET", url, {}, {}, None)
        return result["ok"]