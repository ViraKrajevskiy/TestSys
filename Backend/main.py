import os
import sys

# ============================================================
# STDOUT/STDERR FIX — ДОЛЖНО БЫТЬ ДО ЛЮБЫХ ДРУГИХ ИМПОРТОВ
# ============================================================
# В собранном exe с console=False sys.stdout/stderr == None (или закрыты).
# Любой print() тогда падает с "ValueError: I/O operation on closed file".
IS_FROZEN = getattr(sys, "frozen", False)

if IS_FROZEN:
    _USER_DATA_DIR = os.path.dirname(sys.executable)
else:
    _USER_DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _NullWriter:
    """Заглушка на случай, если и файл открыть не удалось."""
    def write(self, *a, **kw):
        return 0

    def flush(self):
        pass

    def isatty(self):
        return False

    def fileno(self):
        raise OSError("no fileno")

    def close(self):
        pass


def _setup_std_streams():
    """Перенаправить stdout/stderr в файл, если их нет (windowed exe)."""
    need_fix = False
    for stream in (sys.stdout, sys.stderr):
        if stream is None:
            need_fix = True
            break
        try:
            stream.write("")
            stream.flush()
        except Exception:
            need_fix = True
            break

    if not need_fix:
        return

    try:
        log_path = os.path.join(_USER_DATA_DIR, "testsys_stdout.log")
        f = open(log_path, "a", encoding="utf-8", buffering=1)
        sys.stdout = f
        sys.stderr = f
    except Exception:
        sys.stdout = _NullWriter()
        sys.stderr = _NullWriter()


_setup_std_streams()

# ============================================================
# Остальные импорты — теперь print() безопасен
# ============================================================
import subprocess
import time
import threading
import traceback
import importlib.util

import webview
from urllib.request import urlopen
from urllib.error import URLError

# Добавляем папку Backend в sys.path, чтобы найти api.py, network.py
BACKEND_DIR_LOCAL = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR_LOCAL not in sys.path:
    sys.path.insert(0, BACKEND_DIR_LOCAL)

from api import Api

# ============================================================
# PATHS (работает и в dev, и в PyInstaller onefile)
# ============================================================
if IS_FROZEN:
    # В собранном exe данные лежат в sys._MEIPASS
    BASE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    # testsys_backend бандлится в _MEIPASS/testsys_backend через .spec
    BACKEND_DIR = os.path.join(BASE_DIR, "testsys_backend")
    USER_DATA_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BACKEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "testsys_backend")
    USER_DATA_DIR = os.path.dirname(BASE_DIR)

INDEX_HTML = os.path.join(BASE_DIR, "Ui", "index.html")

# Пробрасываем в api.py / database.py, чтобы log/theme/db писались куда надо
os.environ["TESTSYS_USER_DATA_DIR"] = USER_DATA_DIR

backend_process = None


def _load_backend_app():
    """
    Загрузить FastAPI app из testsys_backend/main.py по прямому пути.

    Важно: НЕЛЬЗЯ делать `from main import app` — в проекте два файла main.py
    (Backend/main.py и testsys_backend/main.py), и в exe они конфликтуют.
    Грузим по абсолютному пути через importlib под уникальным именем.
    """
    backend_main = os.path.join(BACKEND_DIR, "main.py")

    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    spec = importlib.util.spec_from_file_location("testsys_backend_main", backend_main)
    if spec is None or spec.loader is None:
        raise ImportError(f"Не удалось загрузить {backend_main}")

    module = importlib.util.module_from_spec(spec)
    sys.modules["testsys_backend_main"] = module
    spec.loader.exec_module(module)
    return module.app


def _run_backend_inprocess():
    """Запустить uvicorn в этом же процессе (для frozen exe)."""
    try:
        os.chdir(BACKEND_DIR)

        import uvicorn
        app = _load_backend_app()

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.run()
    except Exception as e:
        print(f"[ERROR] Backend (in-process): {e}")
        traceback.print_exc()


def start_backend():
    """Запустить FastAPI backend в фоне через uvicorn"""
    global backend_process
    try:
        backend_main = os.path.join(BACKEND_DIR, "main.py")

        if not os.path.exists(backend_main):
            print(f"[WARN] Backend не найден: {backend_main}")
            return False

        print(f"[*] Запускаю backend: {backend_main}")

        # В собранном exe нельзя вызывать sys.executable -m uvicorn —
        # exe не понимает флаги python. Запускаем uvicorn в отдельном потоке.
        if IS_FROZEN:
            t = threading.Thread(target=_run_backend_inprocess, daemon=True)
            t.start()
        elif sys.platform == "win32":
            backend_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                cwd=BACKEND_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        else:
            backend_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                cwd=BACKEND_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                preexec_fn=lambda: os.setsid()
            )

        # Ждём Uvicorn запуска (60 попыток × 1 сек = 60 сек)
        print("[*] Ожидаю backend...")
        for i in range(60):
            try:
                resp = urlopen("http://127.0.0.1:8000/health", timeout=1)
                if resp.status == 200:
                    print("[OK] Backend готов на 127.0.0.1:8000")
                    return True
            except Exception:
                if i % 15 == 0:
                    print(f"  Попытка {i + 1}/60...")
                time.sleep(1)

        print("[WARN] Backend не ответил!")
        return False

    except Exception as e:
        print(f"[ERROR] Ошибка запуска backend: {e}")
        traceback.print_exc()
        return False


def stop_backend():
    """Остановить backend процесс"""
    global backend_process
    if backend_process:
        try:
            if sys.platform == "win32":
                backend_process.terminate()
            else:
                os.killpg(os.getpgid(backend_process.pid), 9)
        except Exception:
            pass


# Порты, которые Chromium/Edge считает «опасными» и блокирует.
# Полный список: chromium.googlesource.com/chromium/src/+/master/net/base/port_util.cc
# 4045 — NFS lockd, из-за него и была ошибка ERR_UNSAFE_PORT.
_CHROMIUM_UNSAFE_PORTS = frozenset([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
    79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
    135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526,
    530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
    995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665,
    6666, 6667, 6668, 6669, 6697, 10080,
])


def _find_safe_port(start=17800, tries=200):
    """
    Найти свободный TCP-порт, который не входит в блок-лист Chromium.
    Иначе Edge WebView2 отдаст ERR_UNSAFE_PORT — как это случилось на 4045.
    """
    import socket
    for offset in range(tries):
        port = start + offset
        if port > 65535 or port in _CHROMIUM_UNSAFE_PORTS:
            continue
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    # Крайний случай — отдаём стартовый, пусть pywebview падает с внятной ошибкой
    return start


# Список CLI-команд. Если первый аргумент один из них — запускаем консоль
# без GUI. Так пользователь может звать exe из CI: TestSys.exe run col.json
_CLI_COMMANDS = {"run", "import", "request", "-h", "--help"}


def _maybe_run_cli():
    """Проверить argv на CLI-команду и, если она есть, отработать и выйти."""
    argv = sys.argv[1:]
    if not argv or argv[0] not in _CLI_COMMANDS:
        return None

    # В onefile-режиме stdout/stderr перенаправлены в файл, чтобы print
    # не падал. Для CLI это плохо — пользователь хочет видеть вывод.
    # Возвращаем на консоль, если она есть.
    try:
        if sys.stdout is None or not hasattr(sys.stdout, "isatty"):
            sys.stdout = open("CON:" if os.name == "nt" else "/dev/tty", "w")
            sys.stderr = sys.stdout
    except Exception:
        pass

    try:
        from cli import main as cli_main
        return cli_main(argv)
    except Exception as e:
        print(f"CLI failed: {e}", file=sys.stderr)
        return 1


def main():
    # CLI-режим — не поднимаем GUI, отработали и вышли с exit code для CI
    exit_code = _maybe_run_cli()
    if exit_code is not None:
        sys.exit(exit_code)

    print("=" * 50)
    print("  TestSys запускается")
    print(f"  frozen={IS_FROZEN}")
    print(f"  BASE_DIR={BASE_DIR}")
    print(f"  BACKEND_DIR={BACKEND_DIR}")
    print(f"  INDEX_HTML={INDEX_HTML}")
    print(f"  exists(INDEX_HTML)={os.path.exists(INDEX_HTML)}")
    print("=" * 50)

    # Запустить backend в отдельном потоке
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # Ждём, пока backend поднимется (макс 15 сек, проверяем каждые 0.3 сек)
    print("[*] Жду backend...")
    for _attempt in range(50):
        try:
            resp = urlopen("http://127.0.0.1:8000/health", timeout=1)
            if resp.status == 200:
                print("[OK] Backend готов, запускаю UI")
                break
        except Exception:
            pass
        time.sleep(0.3)
    else:
        print("[WARN] Backend не ответил за 15 сек, запускаю UI без ожидания")

    try:
        print("[*] Запускаю UI...")
        api = Api()
        webview.create_window(
            title="TestSys",
            url=INDEX_HTML,
            js_api=api,
            width=1300,
            height=820,
            min_size=(900, 600),
        )
        # Явно выбираем HTTP-порт для встроенного сервера pywebview.
        # По умолчанию он берёт случайный — иногда попадает в «опасные»
        # порты Chromium (4045, 6000, 6666, ...) и Edge отдаёт ERR_UNSAFE_PORT.
        # 17800+ — сильно выше системных, вне блок-листа, вне HTTP-стандарта.
        webview.start(http_port=_find_safe_port(17800))
    except Exception as e:
        print(f"[ERROR] Ошибка UI: {e}")
        traceback.print_exc()
    finally:
        print("=" * 50)
        print("  Завершение TestSys")
        print("=" * 50)
        stop_backend()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
