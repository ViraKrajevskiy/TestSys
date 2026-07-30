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

# Create logger
logger = logging.getLogger("TestSys")
logger.setLevel(logging.DEBUG)

# File handler
try:
    file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
except Exception as e:
    print(f"Failed to setup file logging: {e}")

# Console handler (for development)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
logger.addHandler(console_handler)


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

class Api:
    def __init__(self):
        self.child_windows = []
        self._detached_tab_state_json = None
        logger.info("=== TestSys API Initialized ===")

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
        new_api = Api()
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