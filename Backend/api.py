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
from collections import deque
from datetime import datetime
import random
import string
import re
import requests

# Добавляем testsys_backend в sys.path до импорта runner/network,
# потому что main.py делает это позже (внутри _load_backend_app),
# а api.py грузится раньше — на строке `from api import Api`.
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_TESTSYS_BACKEND = os.path.join(os.path.dirname(_API_DIR), "testsys_backend")
for _p in (_API_DIR, _TESTSYS_BACKEND):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from network import send_http_request

# runner.py используется только для Collection Runner / Load Test / Parallel Test.
# Ленивый импорт: не ломаем старт приложения, если файл отсутствует.
_runner = None
def _get_runner():
    global _runner
    if _runner is None:
        import runner as _r
        _runner = _r
    return _runner

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
# Иконку окна задаёт main.py через webview.start(icon=...) — она применяется
# ко всем окнам, включая detached/randomizer/console из api.py.
MAIN_WINDOW_TITLE = "TestSys"
API_BASE_URL = "http://127.0.0.1:8000"

# Boot-CSS темы. Лежит рядом с остальными стилями и подключается в <head>,
# поэтому применяется синхронно — до первой отрисовки. localStorage для
# этого не годится: pywebview не сохраняет его между запусками.
THEME_BOOT_CSS = os.path.join(BASE_DIR, "Ui", "css", "theme-boot.css")


def _luma(hex_color, fallback=0):
    """Яркость цвета 0..255 по формуле ITU-R BT.601."""
    try:
        c = str(hex_color or "").lstrip("#")
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return (r * 299 + g * 587 + b * 114) / 1000
    except Exception:
        return fallback


def _rgba(hex_color, alpha):
    try:
        c = str(hex_color or "").lstrip("#")
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return f"rgba({r}, {g}, {b}, {alpha})"
    except Exception:
        return f"rgba(0, 0, 0, {alpha})"


def write_theme_boot_css(theme_json):
    """
    Генерирует Ui/css/theme-boot.css из темы. Файл подключён в index.html,
    браузер применяет его синхронно — флеша дефолтной темы не бывает.
    """
    try:
        t = json.loads(theme_json) if isinstance(theme_json, str) else (theme_json or {})
        if not isinstance(t, dict) or not t:
            return False

        accent = t.get("accent", "#6366f1")
        bg_app = t.get("bgApp", "#14151a")
        accent_text = "#1a1a1a" if _luma(accent) > 150 else "#ffffff"
        is_light = _luma(bg_app) > 128

        pairs = [
            ("--accent", accent),
            ("--bg-app", bg_app),
            ("--bg-panel", t.get("bgPanel")),
            ("--bg-input", t.get("bgInput")),
            ("--text-main", t.get("textMain")),
            ("--text-color", t.get("textMain")),
            ("--text-dim", t.get("textDim")),
            ("--border-color", t.get("borderColor")),
            ("--success", t.get("success")),
            ("--warn", t.get("warn")),
            ("--danger", t.get("danger")),
            ("--accent-text", accent_text),
            # 0.12 давало ~9 единиц RGB разницы поверх bg-panel —
            # человек эту разницу не видит. 0.22 = ~16 единиц, читается.
            ("--accent-soft", _rgba(accent, 0.22)),
            # Более насыщенный оттенок для активных состояний
            ("--accent-hover", _rgba(accent, 0.32)),
            ("--accent-focus", _rgba(accent, 0.35)),
            ("--success-soft", _rgba(t.get("success", "#22c55e"), 0.20)),
            ("--warn-soft", _rgba(t.get("warn", "#eab308"), 0.20)),
            ("--danger-soft", _rgba(t.get("danger", "#ef4444"), 0.20)),
        ]
        lines = [f"  {k}: {v};" for k, v in pairs if v]

        radius = t.get("borderRadius")
        if radius is not None:
            lines.append(f"  --radius: {int(radius)}px;")

        # Маркер режима — инлайн-скрипт в <head> прочитает его из CSS и
        # выставит data-bs-theme. Патчить сам index.html нельзя: перезапись
        # файла перед открытием окна ломает привязку js_api.
        lines.append(f'  --theme-mode: "{"light" if is_light else "dark"}";')

        css = ["/* Автогенерируется api.py при сохранении темы. Не редактировать. */",
               ":root {", *lines, "}"]

        font_size = t.get("fontSize")
        if font_size:
            css.append(f"html {{ font-size: {int(font_size)}px; }}")
        # Фон ставим сразу — иначе между применением :root и отрисовкой
        # body мелькает белый фон окна.
        css.append("html, body { background: var(--bg-app); }")

        os.makedirs(os.path.dirname(THEME_BOOT_CSS), exist_ok=True)
        tmp = THEME_BOOT_CSS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(css) + "\n")
        os.replace(tmp, THEME_BOOT_CSS)
        return True
    except Exception as e:
        logger.error(f"Failed to write theme boot CSS: {e}")
        return False

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
    # ========== COOKIE MANAGEMENT ==========
    def get_cookies(self):
        """Возвращает куки из сессии сгруппированные по домену."""
        try:
            from network import get_cookies_by_domain
            return {"ok": True, "cookies": get_cookies_by_domain()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def set_cookie(self, domain, name, value, path="/"):
        try:
            from network import set_cookie
            set_cookie(domain, name, value, path)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def delete_cookie(self, domain, name):
        try:
            from network import delete_cookie
            delete_cookie(domain, name)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def clear_cookies(self):
        try:
            from network import clear_all_cookies
            clear_all_cookies()
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def send_request(self, method, url, headers, params, body,
                     files=None, form_fields=None):
        """Отправка HTTP-запроса. Вызывается из app.js.

        ``files`` — список ``{field, path, filename?}``. Если непустой,
        запрос уходит как multipart/form-data вместе с ``form_fields``.
        """
        return send_http_request(method, url, headers, params, body,
                                 files=files, form_fields=form_fields)

    def pick_files(self, allow_multiple=True):
        """Открывает нативный диалог выбора файлов для мультипарт-загрузки.

        Возвращает ``{ok: true, files: [{path, name, size}, ...]}`` либо
        ``{cancelled: true}``. Читать содержимое не нужно — network.py
        откроет файлы сам в момент отправки.
        """
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}

            result = win.create_file_dialog(
                _dialog_type("OPEN"),
                allow_multiple=bool(allow_multiple),
                file_types=("All files (*.*)",),
            )
            if not result:
                return {"ok": False, "cancelled": True}

            paths = list(result) if isinstance(result, (list, tuple)) else [result]
            files = []
            for p in paths:
                try:
                    files.append({
                        "path": p,
                        "name": os.path.basename(p),
                        "size": os.path.getsize(p),
                    })
                except OSError as e:
                    logger.warning(f"pick_files: skip {p}: {e}")
            return {"ok": True, "files": files}
        except Exception as e:
            logger.error(f"pick_files failed: {e}")
            return {"ok": False, "error": str(e)}

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

    # ========== SCRIPT EDITOR WINDOW ==========
    SCRIPT_EDITOR_HTML = os.path.join(BASE_DIR, "Ui", "script-editor.html")

    def open_script_editor_window(self, tab_id, kind, script, tab_title=""):
        """Открывает минималистичное окно редактора скрипта (без navbar/sidebar)."""
        label = "Pre-request" if kind == "pre" else "Tests"
        win_title = f"TestSys — {label}" + (f" [{tab_title}]" if tab_title else "")

        # Не открывать второе окно для того же таба+вида
        for w in webview.windows:
            if w.title == win_title:
                try:
                    w.restore()
                    w.show()
                except Exception:
                    pass
                return True

        new_api = Api(window_kind="script_editor")
        new_api._script_editor_tab_id = tab_id
        new_api._script_editor_kind   = kind
        new_api._script_editor_script = script
        new_api._script_editor_main   = self   # ссылка на главный Api

        SCRIPT_EDITOR_HTML = os.path.join(BASE_DIR, "Ui", "script-editor.html")
        win = webview.create_window(
            title=win_title,
            url=SCRIPT_EDITOR_HTML,
            js_api=new_api,
            width=820,
            height=600,
            min_size=(560, 400),
        )

        payload = json.dumps({
            "tabId":  tab_id,
            "kind":   kind,
            "script": script,
            "title":  tab_title,
        })

        def on_loaded():
            win.evaluate_js(f"window.initScriptEditor({payload})")

        win.events.loaded += on_loaded
        self.child_windows.append(win)
        return True

    def update_script_from_editor(self, tab_id, kind, script):
        """Вызывается из окна редактора — обновляет скрипт в главном окне."""
        # self может быть Api script_editor — идём через _script_editor_main
        target = getattr(self, "_script_editor_main", self)
        # Сохраняем актуальное значение, чтобы при закрытии не затёрлось
        self._script_editor_script = script
        payload = json.dumps({"tabId": tab_id, "kind": kind, "script": script})
        main_win = webview.windows[0] if webview.windows else None
        if main_win:
            main_win.evaluate_js(f"window.receiveScriptFromEditor && window.receiveScriptFromEditor({payload})")
        return True

    def run_script_from_editor(self, tab_id, kind, script):
        """Главное окно запускает скрипт и шлёт результат обратно в редактор."""
        payload = json.dumps({"tabId": tab_id, "kind": kind, "script": script})
        main_win = webview.windows[0] if webview.windows else None
        if main_win:
            main_win.evaluate_js(f"window.runScriptFromEditor && window.runScriptFromEditor({payload})")
        return True

    def close_script_editor(self):
        """Закрывает окно редактора скрипта."""
        win = webview.active_window()
        if win:
            try:
                win.destroy()
            except Exception:
                pass
        return True

    def script_editor_result(self, results_json):
        """Главное окно шлёт результаты тестов в окно редактора."""
        # Вызывается из главного окна через JS bridge — ищем нужное окно
        for w in self.child_windows:
            if "script_editor" in (w.title or "").lower() or True:
                try:
                    w.evaluate_js(f"window.showScriptResult && window.showScriptResult({results_json})")
                except Exception:
                    pass
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

    # ========== CONSOLE WINDOW ==========
    CONSOLE_WINDOW_TITLE = "TestSys — Console"

    # Общий буфер записей консоли на всё приложение.
    # Кладёт сюда главное окно (через publish_console_entry),
    # читает окно-консоль (через read_console_entries). Ограничен, чтобы не
    # разрастался в долгих сессиях — REPL-выхлоп для отладки, не архив.
    _console_buffer = deque(maxlen=800)
    _console_lock = threading.Lock()

    def publish_console_entry(self, entry_json):
        """Положить одну запись консоли в общий буфер (вызывает main-окно)."""
        try:
            entry = json.loads(entry_json) if isinstance(entry_json, str) else entry_json
        except Exception:
            return False
        with Api._console_lock:
            Api._console_buffer.append(entry)
        return True

    def read_console_entries(self, since_ts=0):
        """Отдать записи новее since_ts (мс). Окно-консоль опрашивает раз в 400 мс."""
        try:
            ts = float(since_ts or 0)
        except Exception:
            ts = 0
        with Api._console_lock:
            return [e for e in Api._console_buffer if (e.get("ts") or 0) > ts]

    def clear_console_entries(self):
        """Полная очистка (кнопка «мусорка» и в main, и в окне-консоли)."""
        with Api._console_lock:
            Api._console_buffer.clear()
        # Транслируем очистку во все окна, чтобы список исчез синхронно.
        # Пометка ts=0 + kind=clear — сигнал слушателям.
        for w in list(webview.windows):
            try:
                w.evaluate_js("window.App && App.scriptConsole && App.scriptConsole.clear && App.scriptConsole.clear(true)")
            except Exception:
                pass
        return True

    def open_console_window(self):
        """Открыть консоль скриптов в отдельном окне ОС (аналог рандомайзера)."""
        for w in webview.windows:
            if w.title == self.CONSOLE_WINDOW_TITLE:
                try:
                    w.restore(); w.show()
                except Exception:
                    pass
                return True

        new_api = Api(window_kind="console")
        win = webview.create_window(
            title=self.CONSOLE_WINDOW_TITLE,
            url=INDEX_HTML,
            js_api=new_api,
            width=900,
            height=520,
            min_size=(500, 260),
        )

        def on_loaded():
            win.evaluate_js("window.loadConsoleWindow && window.loadConsoleWindow()")

        def on_closing():
            # ВАЖНО: evaluate_js из on_closing вызывать НЕЛЬЗЯ — pywebview
            # держит event-loop главного окна, получается дедлок, и весь
            # процесс аварийно завершается. Проверено на живом крашe.
            # Просто убираем окно из списка; JS-флаг «окно открыто» больше
            # не нужен — открытие идемпотентно через Python (см. проверку
            # по заголовку в начале open_console_window).
            try:
                self.child_windows.remove(win)
            except ValueError:
                pass
            return True

        win.events.loaded += on_loaded
        win.events.closing += on_closing
        self.child_windows.append(win)
        logger.info("Console window opened")
        return True

    def is_console_window_open(self):
        """Есть ли сейчас открытое окно консоли — для JS-логики pop-out."""
        return any(w.title == self.CONSOLE_WINDOW_TITLE for w in webview.windows)

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
    def sync_host_start(self, port=8777, token="", host_name="", host_client_id="",
                        require_login=False, admin_name="", admin_password=""):
        """Стать хостом: поднять LAN-сервер синхронизации.

        Если require_login=True — включён режим per-user авторизации. При
        первом запуске (пустой users.json) создаём владельца с указанными
        admin_name / admin_password — иначе никто не сможет войти.
        """
        import sync_server
        data_file  = os.path.join(USER_DATA_DIR, "shared_collections.json")
        users_file = os.path.join(USER_DATA_DIR, "shared_users.json")
        acl_file   = os.path.join(USER_DATA_DIR, "shared_acl.json")
        res = sync_server.start(
            port=port, data_file=data_file, token=token,
            host_name=host_name, host_client_id=host_client_id,
            users_file=users_file, acl_file=acl_file,
            require_login=bool(require_login),
            bootstrap_admin_name=admin_name,
            bootstrap_admin_password=admin_password,
        )
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
    def _sync_headers(self, token="", client_id="", client_name="", session_token=""):
        """Общий набор заголовков для клиентских запросов к хосту.

        В обычном режиме — shared X-Sync-Token. В режиме require_login на
        хосте — X-Session-Token из /api/auth/login. Клиент передаёт то,
        что у него есть; сервер сам выберет нужное.
        """
        h = {}
        if session_token: h["X-Session-Token"] = session_token
        if token:         h["X-Sync-Token"]   = token
        if client_id:     h["X-Client-Id"]    = client_id
        if client_name:   h["X-Client-Name"]  = client_name
        return h

    def sync_client_ping(self, base_url, token="", client_id="", client_name="", session_token=""):
        """Проверить доступность хоста + сообщить кто мы."""
        try:
            h = self._sync_headers(token, client_id, client_name, session_token)
            r = requests.get(f"{base_url.rstrip('/')}/api/ping", headers=h, timeout=5)
            if r.status_code == 403:
                return {"ok": False, "error": "kicked", "kicked": True}
            return {"ok": r.ok, "status": r.status_code, "data": r.json() if r.ok else None}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_client_pull(self, base_url, token="", client_id="", client_name="", session_token=""):
        """Забрать коллекции с хоста."""
        try:
            h = self._sync_headers(token, client_id, client_name, session_token)
            r = requests.get(f"{base_url.rstrip('/')}/api/collections", headers=h, timeout=10)
            if r.status_code == 401:
                return {"ok": False, "error": "Требуется вход", "need_login": True}
            if r.status_code == 403:
                return {"ok": False, "error": "kicked", "kicked": True}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "doc": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_client_push(self, base_url, token, payload_json, client_id="", client_name="", session_token=""):
        """Отправить коллекции на хост."""
        try:
            h = self._sync_headers(token, client_id, client_name, session_token)
            h["Content-Type"] = "application/json"
            r = requests.put(
                f"{base_url.rstrip('/')}/api/collections",
                headers=h,
                data=payload_json.encode("utf-8"),
                timeout=10,
            )
            if r.status_code == 401:
                return {"ok": False, "error": "Требуется вход", "need_login": True}
            if r.status_code == 403:
                return {"ok": False, "error": "kicked", "kicked": True}
            if r.status_code == 409:
                return {"ok": False, "conflict": True, "data": r.json()}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "data": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_session_list(self, base_url, token="", client_id="", client_name=""):
        """Получить список подключённых участников."""
        try:
            h = self._sync_headers(token, client_id, client_name)
            r = requests.get(f"{base_url.rstrip('/')}/api/session/list", headers=h, timeout=5)
            if r.status_code == 401:
                return {"ok": False, "error": "Неверный токен доступа"}
            return {"ok": r.ok, "data": r.json() if r.ok else None}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_session_leave(self, base_url, token="", client_id=""):
        """Явно выйти из сессии."""
        try:
            h = self._sync_headers(token, client_id)
            r = requests.post(f"{base_url.rstrip('/')}/api/session/leave", headers=h, timeout=5)
            return {"ok": r.ok}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_session_set_role(self, base_url, token, client_id, target_id, role):
        """Admin: сменить роль другому клиенту."""
        try:
            h = self._sync_headers(token, client_id)
            h["Content-Type"] = "application/json"
            body = json.dumps({"client_id": target_id, "role": role}).encode("utf-8")
            r = requests.post(f"{base_url.rstrip('/')}/api/session/role", headers=h, data=body, timeout=5)
            if r.status_code == 403:
                return {"ok": False, "error": "Только admin может менять роли"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ========== AUTH (per-user login) ==========
    def sync_auth_login(self, base_url, name, password, client_id=""):
        """Логин пользователя. Возвращает session_token при успехе."""
        try:
            h = self._sync_headers("", client_id, name)
            h["Content-Type"] = "application/json"
            body = json.dumps({"name": name, "password": password}).encode("utf-8")
            r = requests.post(f"{base_url.rstrip('/')}/api/auth/login", headers=h, data=body, timeout=10)
            if r.status_code == 401:
                return {"ok": False, "error": "Неверное имя или пароль"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "data": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_auth_logout(self, base_url, session_token, client_id=""):
        try:
            h = {"X-Session-Token": session_token, "X-Client-Id": client_id}
            r = requests.post(f"{base_url.rstrip('/')}/api/auth/logout", headers=h, timeout=5)
            return {"ok": r.ok}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_auth_users_list(self, base_url, session_token, client_id=""):
        """Список пользователей (admin видит всех, member — только себя)."""
        try:
            h = {"X-Session-Token": session_token, "X-Client-Id": client_id}
            r = requests.get(f"{base_url.rstrip('/')}/api/auth/users", headers=h, timeout=5)
            if r.status_code == 403:
                return {"ok": False, "error": "Только admin"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "users": r.json().get("users", [])}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_auth_users_save(self, base_url, session_token, name, password, role, client_id=""):
        """Создать/обновить пользователя (admin only). password="" — не менять."""
        try:
            h = {"X-Session-Token": session_token, "Content-Type": "application/json",
                 "X-Client-Id": client_id}
            body = json.dumps({"name": name, "password": password, "role": role}).encode("utf-8")
            r = requests.post(f"{base_url.rstrip('/')}/api/auth/users", headers=h, data=body, timeout=10)
            if r.status_code == 403:
                return {"ok": False, "error": "Только admin"}
            if not r.ok:
                try:
                    return {"ok": False, "error": r.json().get("error", f"HTTP {r.status_code}")}
                except Exception:
                    return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "data": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_acl_get(self, base_url, session_token, client_id=""):
        try:
            h = {"X-Session-Token": session_token, "X-Client-Id": client_id}
            r = requests.get(f"{base_url.rstrip('/')}/api/acl", headers=h, timeout=5)
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True, "acl": r.json().get("acl", {})}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_acl_save(self, base_url, session_token, acl, client_id=""):
        try:
            h = {"X-Session-Token": session_token, "Content-Type": "application/json",
                 "X-Client-Id": client_id}
            body = json.dumps({"acl": acl}).encode("utf-8")
            r = requests.post(f"{base_url.rstrip('/')}/api/acl", headers=h, data=body, timeout=10)
            if r.status_code == 403:
                return {"ok": False, "error": "Только admin"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def sync_session_kick(self, base_url, token, client_id, target_id, seconds=300):
        """Admin: выкинуть клиента на N секунд."""
        try:
            h = self._sync_headers(token, client_id)
            h["Content-Type"] = "application/json"
            body = json.dumps({"client_id": target_id, "seconds": int(seconds)}).encode("utf-8")
            r = requests.post(f"{base_url.rstrip('/')}/api/session/kick", headers=h, data=body, timeout=5)
            if r.status_code == 403:
                return {"ok": False, "error": "Только admin может кикать"}
            if not r.ok:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            return {"ok": True}
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

            # Отрезаем hash (`#/`, `#/route`) — Swagger UI использует его для
            # hash-роутинга, сервер игнорирует. Без этого все кандидаты
            # окажутся одним и тем же URL с разной постфикс-«косметикой».
            if "#" in u:
                u = u.split("#", 1)[0]

            candidates = list(self._swagger_candidates(u))

            headers = {
                # Многие фреймворки без Accept возвращают HTML или 406.
                # Django DRF без этого отдал бы страницу браузерного UI.
                "Accept": "application/json, application/yaml, text/yaml, */*;q=0.8",
                "User-Agent": "TestSys/1.0 (+swagger-import)",
            }

            tried = []
            # Пока идём по кандидатам, можем встретить HTML Swagger-UI и
            # вытащить из него ссылку на реальный JSON/YAML. Такие ссылки
            # проверим сразу после текущего кандидата — и запомним, чтобы
            # не пройти по кругу.
            queue = list(candidates)
            seen_urls = set(queue)
            html_scanned = False

            while queue:
                cand = queue.pop(0)
                try:
                    r = requests.get(cand, timeout=15, headers=headers, allow_redirects=True)
                    tried.append(f"{cand} → {r.status_code}")
                    if not r.ok:
                        continue

                    text = r.text
                    if not text or len(text) < 20:
                        continue

                    stripped = text.lstrip().lower()
                    is_html = stripped.startswith(("<!doctype", "<html")) or "<html" in stripped[:200]

                    # Swagger-UI / Redoc / Scalar страница — вытаскиваем ссылку
                    # на реальный документ и подставляем в очередь. Один раз
                    # за весь fetch, чтобы не набрать сотню перекрёстных URL.
                    if is_html and not html_scanned:
                        html_scanned = True
                        extracted = self._extract_spec_urls_from_html(text, cand)

                        # Если из самого HTML ничего не выжали — идём по
                        # внешним script src (типовой сценарий: агрегатор,
                        # у которого весь конфиг в swagger-ui-init.js).
                        if not extracted:
                            for js_url in self._same_origin_scripts(text, cand)[:3]:
                                try:
                                    jr = requests.get(js_url, timeout=10, headers=headers, allow_redirects=True)
                                    if jr.ok and jr.text:
                                        found = self._extract_spec_urls_from_html(jr.text, js_url)
                                        if found:
                                            tried.append(f"  ↳ пробовал {js_url} → {jr.status_code}, найдено ссылок: {len(found)}")
                                        for f in found:
                                            if f not in extracted:
                                                extracted.append(f)
                                        if extracted:
                                            break
                                except Exception:
                                    continue

                        added = 0
                        for eu in extracted:
                            if eu not in seen_urls:
                                seen_urls.add(eu)
                                queue.insert(added, eu)
                                added += 1
                        tried.append(
                            f"  ↳ HTML-документация; из неё извлечено ссылок: {added}"
                            + (f" ({', '.join(extracted[:3])}{'…' if len(extracted) > 3 else ''})" if extracted else "")
                        )
                        continue

                    if is_html:
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
            "/docs-json", "/api-json",      # NestJS SwaggerModule по умолчанию
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

    def _same_origin_scripts(self, html, base_url):
        """Ссылки <script src="...">, лежащие в том же origin — их безопасно
        загрузить, чтобы поискать конфиг вида swagger-ui-init.js.
        """
        import re
        from urllib.parse import urljoin, urlparse
        base = urlparse(base_url)
        out = []
        for m in re.finditer(r'<script[^>]+src=[\'"]([^\'"]+\.js[^\'"]*)[\'"]', html, re.I):
            src = m.group(1).strip()
            if src.startswith(("data:", "javascript:")):
                continue
            abs_u = urljoin(base_url, src)
            p = urlparse(abs_u)
            if p.netloc == base.netloc and p.scheme == base.scheme and abs_u not in out:
                out.append(abs_u)
        return out

    def _extract_spec_urls_from_html(self, html, base_url):
        """
        Пытаемся выкопать ссылку на openapi.json/yaml из HTML-страницы
        документации. Смотрим на типовые паттерны — Swagger-UI, Redoc, Scalar,
        Stoplight, Rapidoc — и относительные пути делаем абсолютными.
        """
        import re
        from urllib.parse import urljoin

        found = []

        def add(u):
            if not u:
                return
            u = u.strip().strip('"\'').strip()
            if not u or u.startswith(("javascript:", "data:", "#")):
                return
            abs_u = urljoin(base_url, u)
            if abs_u not in found:
                found.append(abs_u)

        # 1. SwaggerUIBundle({ url: "..." }) и JSON вида {"url": "..."} —
        #    drf-yasg/drf-spectacular часто вшивают JSON конфига в HTML.
        #    Ловим и obj-стиль (url: "..."), и JSON-стиль ("url": "..."),
        #    и присваивание (var/let/const url = "...").
        for m in re.finditer(r'["\']?\burl["\']?\s*[:=]\s*["\']([^"\']+\.(?:json|ya?ml)[^"\']*)["\']', html, re.I):
            add(m.group(1))
        # А также любой url, а не только *.json/*.yaml — фильтровать будем позже.
        for m in re.finditer(r'["\']?\burl["\']?\s*[:=]\s*["\']([^"\']+)["\']', html, re.I):
            u = m.group(1)
            low = u.lower()
            if any(x in low for x in ("openapi", "swagger", "schema", "api-docs", "spec")):
                add(u)
        for m in re.finditer(r'\bspec-?url\s*=\s*["\']([^"\']+)["\']', html, re.I):
            add(m.group(1))
        # <script id="..." type="application/json">{...}</script> — вытащим и
        # разберём JSON целиком: там может лежать {"url": "...", "urls": [...]}
        for m in re.finditer(
            r'<script[^>]+type=[\'"]application/json[\'"][^>]*>(.*?)</script>',
            html, re.I | re.S,
        ):
            try:
                cfg = json.loads(m.group(1).strip())
                if isinstance(cfg, dict):
                    if cfg.get("url"):
                        add(cfg["url"])
                    for entry in (cfg.get("urls") or []):
                        if isinstance(entry, dict) and entry.get("url"):
                            add(entry["url"])
            except Exception:
                pass

        # 2. Redoc: <redoc spec-url="..."> ; Scalar: data-configuration='{"spec":{"url":"..."}}'
        for m in re.finditer(r'data-configuration\s*=\s*[\'"]([^\'"]+)[\'"]', html):
            try:
                cfg = json.loads(m.group(1).replace("&quot;", '"'))
                spec = (cfg.get("spec") or {}) if isinstance(cfg, dict) else {}
                if spec.get("url"):
                    add(spec["url"])
            except Exception:
                pass

        # 3. Явный <link rel="alternate" type="application/openapi+json" href="...">
        for m in re.finditer(
            r'<link[^>]+rel=[\'"]?alternate[\'"]?[^>]+type=[\'"]?application/(?:openapi|json|yaml)[^\'"]*[\'"]?[^>]+href=[\'"]([^\'"]+)[\'"]',
            html, re.I,
        ):
            add(m.group(1))

        # 4. Fallback — просто любые ссылки на *.json/*.yaml/*.yml, лежащие
        #    в скриптах. Отсеиваем шум (bootstrap.min.css.map и т.п.).
        for m in re.finditer(r'["\']([^"\']+\.(?:json|ya?ml))(?:["\']|\?)', html):
            u = m.group(1)
            low = u.lower()
            if any(x in low for x in ("openapi", "swagger", "schema", "api-docs", "spec")):
                add(u)

        # 5. Микросервисный агрегатор: массив services / apis / apps c полем
        #    path/slug/name/id + template-строка вида `/${x}/docs-json`.
        #    Разворачиваем: для каждого сервиса подставляем в шаблон и
        #    добавляем как кандидата.
        paths = []
        for m in re.finditer(
            r'(?:services|apis|apps|specs|schemas)\s*=\s*\[(.+?)\]',
            html, re.S,
        ):
            arr = m.group(1)
            for pm in re.finditer(
                r'\b(?:path|slug|name|id|key)\s*:\s*["\']([\w\-./]+)["\']',
                arr,
            ):
                p = pm.group(1).strip("/")
                if p and p not in paths:
                    paths.append(p)
        # Шаблоны URL с ${...} — распространено в JS-инициализаторах
        # ("/${servicePath}/docs-json", `/${x}/openapi.json` и т.д.)
        templates = []
        for m in re.finditer(
            r'[`\'"]([/\w\-.]*\$\{[^}]+\}[/\w\-.]*)[`\'"]',
            html,
        ):
            t = m.group(1)
            if t and t not in templates:
                templates.append(t)

        if paths:
            expanded = []
            if templates:
                for tmpl in templates:
                    for p in paths:
                        expanded.append(re.sub(r'\$\{[^}]+\}', p, tmpl))
            # Даже если шаблонов не нашли — попробуем типовые суффиксы
            # NestJS/FastAPI/DRF, куда обычно кладут спеку каждого сервиса.
            for p in paths:
                for suf in ("/docs-json", "/api-json", "/openapi.json",
                            "/swagger.json", "/schema/", "/schema.json"):
                    expanded.append("/" + p + suf)
            for e in expanded:
                add(e)

        # Приоритет: сначала явные openapi/swagger/api-json/docs-json,
        # затем schema, затем всё что кончается на .json/.yaml.
        # Для агрегаторов может быть много кандидатов — не режем сильно.
        def priority(u):
            l = u.lower()
            if "openapi" in l or "swagger" in l: return 0
            if "docs-json" in l or "api-json" in l: return 0  # NestJS defaults
            if "schema" in l: return 1
            if l.endswith((".json", ".yaml", ".yml")): return 2
            return 3
        found.sort(key=priority)
        return found[:40]

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
        """
        Сохраняет пользовательские коллекции.

        Запись атомарная (temp + os.replace) и с бэкапом: обрыв процесса
        посреди записи больше не оставляет обрезанный файл. Плюс защита от
        затирания непустых коллекций пустыми — фронтенд мог не успеть
        загрузиться и прислать [].
        """
        path = os.path.join(USER_DATA_DIR, "collections.json")
        bak = path + ".bak"
        try:
            # Санити-чек: не даём пустому списку затереть непустой файл
            try:
                incoming = json.loads(collections_json)
                new_cols = incoming.get("collections", []) if isinstance(incoming, dict) else incoming
                if isinstance(new_cols, list) and len(new_cols) == 0 and os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        old = json.loads(f.read() or "{}")
                    old_cols = old.get("collections", []) if isinstance(old, dict) else old
                    if isinstance(old_cols, list) and len(old_cols) > 0:
                        logger.warning(
                            "Refused to overwrite %d collections with an empty list",
                            len(old_cols))
                        return False
            except Exception:
                pass  # проверка не удалась — не блокируем сохранение

            # Бэкап текущего файла перед перезаписью
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as src:
                        data = src.read()
                    if data.strip():
                        with open(bak, "w", encoding="utf-8") as dst:
                            dst.write(data)
                except Exception as e:
                    logger.warning(f"Collections backup failed: {e}")

            # Атомарная запись
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(collections_json)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)

            logger.info("Collections saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save collections: {e}")
            return False

    def load_collections(self):
        """
        Загружает коллекции. При повреждённом файле пробует .bak —
        лучше вернуться на одно сохранение назад, чем потерять всё.
        """
        path = os.path.join(USER_DATA_DIR, "collections.json")

        def _read_valid(p):
            if not os.path.exists(p):
                return None
            try:
                with open(p, "r", encoding="utf-8") as f:
                    raw = f.read()
                if not raw.strip():
                    return None
                json.loads(raw)   # проверяем, что это валидный JSON
                return raw
            except Exception as e:
                logger.warning(f"Collections file unreadable ({p}): {e}")
                return None

        raw = _read_valid(path)
        if raw is not None:
            return raw

        raw = _read_valid(path + ".bak")
        if raw is not None:
            logger.warning("Restored collections from backup")
            try:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(raw)
            except Exception:
                pass
            return raw

        return None

    # ========== GIT-FRIENDLY FOLDER SYNC ==========

    def pick_git_dir(self):
        """Диалог выбора папки для git-friendly синхронизации."""
        try:
            win = webview.active_window() or self._find_main_window()
            if not win:
                return {"ok": False, "error": "Окно не найдено"}
            result = win.create_file_dialog(webview.FOLDER_DIALOG)
            if not result:
                return {"ok": False, "cancelled": True}
            path = result[0] if isinstance(result, (list, tuple)) else result
            return {"ok": True, "path": path}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def export_git_dir(self, dir_path, collections_json):
        """Записывает каждую коллекцию в отдельный .json файл в папку dir_path.
        Имя файла = имя коллекции (sanitized) + .json.
        Возвращает список записанных файлов."""
        import re, json as _json
        try:
            os.makedirs(dir_path, exist_ok=True)
            collections = _json.loads(collections_json)
            written = []
            for col in collections:
                name = col.get("name", "collection")
                safe = re.sub(r'[\\/:*?"<>|]', "_", name).strip() or "collection"
                fpath = os.path.join(dir_path, safe + ".json")
                with open(fpath, "w", encoding="utf-8") as f:
                    _json.dump(col, f, ensure_ascii=False, indent=2)
                written.append(fpath)
            logger.info(f"Git export: {len(written)} collections → {dir_path}")
            return {"ok": True, "written": written, "count": len(written)}
        except Exception as e:
            logger.error(f"Git export failed: {e}")
            return {"ok": False, "error": str(e)}

    def import_git_dir(self, dir_path):
        """Читает все *.json из dir_path и возвращает их как массив коллекций."""
        import json as _json, glob as _glob
        try:
            pattern = os.path.join(dir_path, "*.json")
            files = sorted(_glob.glob(pattern))
            collections = []
            errors = []
            for fpath in files:
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = _json.load(f)
                    # Принимаем как одну коллекцию или массив коллекций
                    if isinstance(data, list):
                        collections.extend(data)
                    elif isinstance(data, dict) and "name" in data:
                        collections.append(data)
                except Exception as e:
                    errors.append(f"{os.path.basename(fpath)}: {e}")
            logger.info(f"Git import: {len(collections)} collections from {dir_path}")
            return {
                "ok": True,
                "collections": collections,
                "count": len(collections),
                "errors": errors,
            }
        except Exception as e:
            logger.error(f"Git import failed: {e}")
            return {"ok": False, "error": str(e)}

    def save_git_dir_setting(self, path):
        """Сохраняет путь к git-папке."""
        try:
            cfg_path = os.path.join(USER_DATA_DIR, "git_dir.txt")
            if path:
                with open(cfg_path, "w", encoding="utf-8") as f:
                    f.write(path)
            else:
                if os.path.exists(cfg_path):
                    os.remove(cfg_path)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def get_git_dir_setting(self):
        """Возвращает сохранённый путь к git-папке (или None)."""
        cfg_path = os.path.join(USER_DATA_DIR, "git_dir.txt")
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    p = f.read().strip()
                return {"ok": True, "path": p or None}
            except Exception:
                pass
        return {"ok": True, "path": None}

    # ========== THEME (existing) ==========
    def save_theme(self, theme_json):
        """Сохраняет тему в theme.json и генерирует boot-CSS."""
        try:
            path = os.path.join(USER_DATA_DIR, "theme.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(theme_json)
            write_theme_boot_css(theme_json)
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

    # ========== RANDOMIZER TEMPLATES ==========
    def save_rand_templates(self, templates_json):
        """Сохраняет пользовательские шаблоны рандомайзера в rand_templates.json."""
        try:
            path = os.path.join(USER_DATA_DIR, "rand_templates.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(templates_json)
            logger.info("Randomizer templates saved")
            return True
        except Exception as e:
            logger.error(f"Failed to save randomizer templates: {e}")
            return False

    def load_rand_templates(self):
        """Загружает пользовательские шаблоны рандомайзера."""
        path = os.path.join(USER_DATA_DIR, "rand_templates.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception as e:
                logger.error(f"Failed to load randomizer templates: {e}")
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

    # ============================================================
    # RUNNER — Collection Runner, Load Test, Parallel Test
    # ============================================================

    def run_collection(self, collection_json: str, variables_json: str,
                       options_json: str = "{}") -> str:
        """
        Прогоняет коллекцию запросов на Python.
        Возвращает JSON-список результатов.
        Вызывается из collectionRunner.js вместо JS-цикла по send_request.
        """
        try:
            import json as _json
            collection = _json.loads(collection_json) if isinstance(collection_json, str) else collection_json
            variables  = _json.loads(variables_json)  if isinstance(variables_json,  str) else (variables_json or {})
            options    = _json.loads(options_json)    if isinstance(options_json,    str) else (options_json or {})

            results = _get_runner().run_collection(collection, variables, options)
            return _json.dumps({"ok": True, "results": results}, ensure_ascii=False)
        except Exception as e:
            import traceback, json as _json
            logger.error(f"run_collection error: {e}\n{traceback.format_exc()}")
            return _json.dumps({"ok": False, "error": str(e)})

    # ---- Load Test ---------------------------------------------------

    _load_runs: dict = {}   # run_id → LoadTestRun

    def load_test_start(self, config_json: str) -> str:
        """
        Запускает нагрузочный тест.
        Возвращает {ok, run_id}.
        JS запрашивает прогресс через load_test_status(run_id).
        """
        try:
            import json as _json
            config = _json.loads(config_json) if isinstance(config_json, str) else config_json

            run = _get_runner().LoadTestRun(config)
            Api._load_runs[run.run_id] = run
            run.start()

            return _json.dumps({"ok": True, "run_id": run.run_id})
        except Exception as e:
            import json as _json
            logger.error(f"load_test_start error: {e}")
            return _json.dumps({"ok": False, "error": str(e)})

    def load_test_status(self, run_id: str, since_idx: int = 0) -> str:
        """
        Возвращает прогресс нагрузочного теста:
        {run_id, running, total, new_points, next_idx, elapsed_ms, stats, error}
        """
        import json as _json
        run = Api._load_runs.get(run_id)
        if run is None:
            return _json.dumps({"ok": False, "error": "run not found"})
        status = run.get_status(since_idx=since_idx)
        status["ok"] = True
        return _json.dumps(status, ensure_ascii=False)

    def load_test_stop(self, run_id: str) -> str:
        """Останавливает нагрузочный тест по run_id."""
        import json as _json
        run = Api._load_runs.get(run_id)
        if run is None:
            return _json.dumps({"ok": False, "error": "run not found"})
        run.stop()
        return _json.dumps({"ok": True})

    def load_test_cleanup(self, run_id: str) -> str:
        """Удаляет завершённый тест из памяти."""
        import json as _json
        Api._load_runs.pop(run_id, None)
        return _json.dumps({"ok": True})

    # ---- Parallel Test -----------------------------------------------

    def run_parallel_test(self, requests_json: str, variables_json: str,
                          config_json: str = "{}") -> str:
        """
        Параллельный запуск нескольких разных запросов.
        Цель — найти race conditions на сервере.
        Возвращает {ok, results, stats, total, rounds}.
        """
        try:
            import json as _json
            requests_list = _json.loads(requests_json) if isinstance(requests_json, str) else requests_json
            variables     = _json.loads(variables_json) if isinstance(variables_json, str) else (variables_json or {})
            config        = _json.loads(config_json)    if isinstance(config_json,    str) else (config_json or {})

            rounds      = max(1, config.get("rounds", 1))
            concurrency = max(1, config.get("concurrency", rounds))
            delay_ms    = max(0, config.get("delay_ms", 0))

            result = _get_runner().run_parallel_test(requests_list, variables,
                                               rounds=rounds,
                                               concurrency=concurrency,
                                               delay_ms=delay_ms)
            result["ok"] = True
            return _json.dumps(result, ensure_ascii=False)
        except Exception as e:
            import traceback, json as _json
            logger.error(f"run_parallel_test error: {e}\n{traceback.format_exc()}")
            return _json.dumps({"ok": False, "error": str(e)})