"""
updater.py — обновление приложения через GitHub Releases.

Как это работает на Windows: запущенный exe нельзя перезаписать, но можно
переименовать. Поэтому установка идёт так:
  1. новая версия качается во временный файл;
  2. пишется .bat, который ждёт выхода приложения;
  3. приложение закрывается, скрипт переносит старый exe в backup/,
     ставит новый на его место и запускает обратно.

Старые версии складываются в backup/ — оттуда можно откатиться мгновенно,
без скачивания. Откатиться можно и на любой релиз с GitHub.
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

import requests

IS_FROZEN = getattr(sys, "frozen", False)

# Куда складываем предыдущие версии
def _app_dir():
    return os.path.dirname(sys.executable) if IS_FROZEN else os.path.dirname(os.path.abspath(__file__))

def _backup_dir():
    d = os.path.join(_app_dir(), "backup")
    os.makedirs(d, exist_ok=True)
    return d


# ============================================================
# СРАВНЕНИЕ ВЕРСИЙ
# ============================================================
def parse_version(v):
    """'v1.2.3-beta' -> (1, 2, 3). Нечисловые хвосты отбрасываем."""
    if not v:
        return (0, 0, 0)
    s = str(v).strip().lstrip("vV")
    nums = re.findall(r"\d+", s.split("-")[0].split("+")[0])
    parts = [int(n) for n in nums[:3]]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def is_newer(candidate, current):
    return parse_version(candidate) > parse_version(current)


# ============================================================
# ПРОВЕРКА РЕЛИЗОВ
# ============================================================
def fetch_releases(repo, asset_name="TestSys.exe", include_prerelease=False, limit=20, token=""):
    """
    Список релизов с GitHub.
    Возвращает {ok, releases:[{version, name, notes, published, url, size, prerelease}]}
    """
    if not repo or "/" not in repo:
        return {"ok": False, "error": "Не задан репозиторий в формате владелец/имя"}

    url = f"https://api.github.com/repos/{repo}/releases"
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        r = requests.get(url, headers=headers, timeout=15, params={"per_page": limit})

        if r.status_code == 404:
            return {"ok": False, "error": f"Репозиторий {repo} не найден или закрыт"}
        if r.status_code == 403 and "rate limit" in r.text.lower():
            return {"ok": False, "error": "Превышен лимит запросов к GitHub. Попробуйте позже или укажите токен."}
        if not r.ok:
            return {"ok": False, "error": f"GitHub вернул {r.status_code}"}

        releases = []
        for item in r.json():
            if item.get("draft"):
                continue
            if item.get("prerelease") and not include_prerelease:
                continue

            # Ищем нужный файл среди вложений релиза
            asset = None
            for a in item.get("assets", []):
                if a.get("name", "").lower() == asset_name.lower():
                    asset = a
                    break
            # Если точного совпадения нет — берём первый .exe
            if not asset:
                for a in item.get("assets", []):
                    if a.get("name", "").lower().endswith(".exe"):
                        asset = a
                        break
            if not asset:
                continue

            # Необязательный файл с контрольной суммой
            sha = ""
            for a in item.get("assets", []):
                if a.get("name", "").lower() in (asset["name"].lower() + ".sha256", "sha256.txt", "checksums.txt"):
                    sha = a.get("browser_download_url", "")
                    break

            releases.append({
                "version": (item.get("tag_name") or "").lstrip("vV"),
                "name": item.get("name") or item.get("tag_name") or "",
                "notes": item.get("body") or "",
                "published": (item.get("published_at") or "")[:10],
                "url": asset.get("browser_download_url", ""),
                "size": asset.get("size", 0),
                "asset": asset.get("name", ""),
                "prerelease": bool(item.get("prerelease")),
                "sha_url": sha,
            })

        return {"ok": True, "releases": releases}

    except requests.exceptions.Timeout:
        return {"ok": False, "error": "GitHub не ответил вовремя"}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "error": "Нет соединения с GitHub"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================
# СКАЧИВАНИЕ
# ============================================================
_download_state = {"active": False, "done": 0, "total": 0, "path": "", "error": "", "finished": False}


def download_state():
    return dict(_download_state)


def download_release(url, expected_size=0, sha_url=""):
    """Скачать файл в фоне. Прогресс читается через download_state()."""
    if _download_state["active"]:
        return {"ok": False, "error": "Загрузка уже идёт"}

    _download_state.update({"active": True, "done": 0, "total": expected_size,
                            "path": "", "error": "", "finished": False})

    t = threading.Thread(target=_download_worker, args=(url, sha_url), daemon=True)
    t.start()
    return {"ok": True, "started": True}


def _download_worker(url, sha_url):
    try:
        tmp_dir = os.path.join(tempfile.gettempdir(), "testsys_update")
        os.makedirs(tmp_dir, exist_ok=True)
        target = os.path.join(tmp_dir, "TestSys_new.exe")

        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            total = int(r.headers.get("Content-Length", 0)) or _download_state["total"]
            _download_state["total"] = total

            done = 0
            with open(target, "wb") as f:
                for chunk in r.iter_content(chunk_size=256 * 1024):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    _download_state["done"] = done

        # Проверка контрольной суммы, если она опубликована
        if sha_url:
            try:
                expected = _fetch_expected_sha(sha_url)
                if expected:
                    actual = _sha256(target)
                    if actual.lower() != expected.lower():
                        os.remove(target)
                        _download_state["error"] = "Контрольная сумма не совпала — файл повреждён"
                        return
            except Exception:
                pass  # нет суммы — не критично, скачивали по HTTPS

        if os.path.getsize(target) < 1024:
            _download_state["error"] = "Скачанный файл слишком мал"
            return

        _download_state["path"] = target

    except Exception as e:
        _download_state["error"] = str(e)
    finally:
        _download_state["active"] = False
        _download_state["finished"] = True


def _fetch_expected_sha(url):
    r = requests.get(url, timeout=15)
    if not r.ok:
        return ""
    text = r.text.strip()
    m = re.search(r"\b([a-fA-F0-9]{64})\b", text)
    return m.group(1) if m else ""


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


# ============================================================
# УСТАНОВКА
# ============================================================
def install(new_exe_path, current_version="0.0.0"):
    """
    Поставить скачанную версию: старый exe уезжает в backup/,
    новый встаёт на его место, приложение перезапускается.
    """
    if not IS_FROZEN:
        return {"ok": False, "error": "Обновление работает только в собранном приложении"}
    if not new_exe_path or not os.path.exists(new_exe_path):
        return {"ok": False, "error": "Файл обновления не найден"}

    try:
        exe = sys.executable
        app_dir = _app_dir()
        backup = os.path.join(_backup_dir(), f"TestSys-{current_version}.exe")

        bat = _write_install_script(exe, new_exe_path, backup, os.getpid())
        # Скрипт стартует отдельно и переживает выход приложения
        subprocess.Popen(
            ["cmd", "/c", bat],
            cwd=app_dir,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
            close_fds=True,
        )
        return {"ok": True, "restarting": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _write_install_script(exe_path, new_path, backup_path, pid):
    """
    .bat ждёт выхода процесса, меняет файлы и запускает приложение.
    Ожидание по PID надёжнее паузы: не угадываем, сколько закрывается окно.
    """
    script = f"""@echo off
chcp 65001 >nul
setlocal

rem --- ждём, пока приложение закроется (до 60 секунд) ---
set /a tries=0
:wait
tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul
if errorlevel 1 goto ready
set /a tries+=1
if %tries% gtr 60 goto timeout
timeout /t 1 /nobreak >nul
goto wait

:timeout
echo Приложение не закрылось за 60 секунд. Обновление отменено.
pause
exit /b 1

:ready
rem небольшая пауза — Windows освобождает файл не мгновенно
timeout /t 1 /nobreak >nul

rem --- сохраняем текущую версию ---
if exist "{backup_path}" del /q "{backup_path}"
move /y "{exe_path}" "{backup_path}" >nul
if errorlevel 1 (
    echo Не удалось сохранить старую версию.
    pause
    exit /b 1
)

rem --- ставим новую ---
move /y "{new_path}" "{exe_path}" >nul
if errorlevel 1 (
    echo Не удалось установить новую версию, возвращаем прежнюю.
    move /y "{backup_path}" "{exe_path}" >nul
    pause
    exit /b 1
)

start "" "{exe_path}"
del "%~f0"
"""
    path = os.path.join(tempfile.gettempdir(), "testsys_update", "install.bat")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(script)
    return path


# ============================================================
# ОТКАТ
# ============================================================
def list_backups():
    """Версии, сохранённые локально — откат на них мгновенный."""
    out = []
    try:
        d = _backup_dir()
        for name in os.listdir(d):
            m = re.match(r"TestSys-(.+)\.exe$", name, re.I)
            if not m:
                continue
            p = os.path.join(d, name)
            out.append({
                "version": m.group(1),
                "path": p,
                "size": os.path.getsize(p),
                "date": datetime.fromtimestamp(os.path.getmtime(p)).strftime("%Y-%m-%d %H:%M"),
            })
        out.sort(key=lambda x: parse_version(x["version"]), reverse=True)
    except Exception:
        pass
    return out


def rollback(backup_path, current_version="0.0.0"):
    """Вернуться на сохранённую версию — тем же механизмом, что и установка."""
    if not IS_FROZEN:
        return {"ok": False, "error": "Откат работает только в собранном приложении"}
    if not backup_path or not os.path.exists(backup_path):
        return {"ok": False, "error": "Файл версии не найден"}

    try:
        # Копируем во временную папку: исходник в backup/ должен остаться
        tmp_dir = os.path.join(tempfile.gettempdir(), "testsys_update")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp = os.path.join(tmp_dir, "TestSys_rollback.exe")
        shutil.copy2(backup_path, tmp)
        return install(tmp, current_version)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def cleanup_backups(keep=3):
    """Оставить только несколько последних версий."""
    try:
        items = list_backups()
        removed = 0
        for it in items[keep:]:
            try:
                os.remove(it["path"])
                removed += 1
            except Exception:
                pass
        return {"ok": True, "removed": removed}
    except Exception as e:
        return {"ok": False, "error": str(e)}
