"""
set_version.py — записать номер версии в Backend/version.py перед сборкой.

Использование:
    python set_version.py 1.0.3
    python set_version.py bump patch     # 1.0.0 → 1.0.1
    python set_version.py bump minor     # 1.0.0 → 1.1.0
    python set_version.py bump major     # 1.0.0 → 2.0.0
    python set_version.py show           # напечатать текущую

Вызывается из build.bat, но можно и руками — на CI, из git-хука и т.п.
Возврат:
    0 — версия применена (или совпадает с текущей)
    1 — ошибка (плохой номер, файл не найден и т.п.)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VERSION_FILE = os.path.join(HERE, "Backend", "version.py")

VER_RE = re.compile(r'^\s*__version__\s*=\s*[\'"]([^\'"]+)[\'"]', re.M)


def read_current():
    if not os.path.exists(VERSION_FILE):
        print(f"[ERROR] Не найден {VERSION_FILE}", file=sys.stderr)
        sys.exit(1)
    text = open(VERSION_FILE, "r", encoding="utf-8-sig").read()
    m = VER_RE.search(text)
    if not m:
        print("[ERROR] Не найдена строка __version__ в version.py", file=sys.stderr)
        sys.exit(1)
    return m.group(1), text


def write_new(new_version):
    """Заменить только __version__, остальные строки (репо, ASSET_NAME) не трогаем."""
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][\w.]+)?", new_version):
        print(f"[ERROR] Неверный формат версии: {new_version}", file=sys.stderr)
        print("       Ожидается семвер, например 1.0.3 или 1.2.0-beta", file=sys.stderr)
        sys.exit(1)

    current, text = read_current()
    if current == new_version:
        print(f"[OK] Версия уже {new_version} — ничего не меняю")
        return

    new_text = VER_RE.sub(f'__version__ = "{new_version}"', text, count=1)
    with open(VERSION_FILE, "w", encoding="utf-8") as f:
        f.write(new_text)
    print(f"[OK] {current} -> {new_version}")


def bump(kind):
    current, _ = read_current()
    parts = re.findall(r"\d+", current)
    while len(parts) < 3:
        parts.append("0")
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    if kind == "major":
        major += 1; minor = 0; patch = 0
    elif kind == "minor":
        minor += 1; patch = 0
    elif kind == "patch":
        patch += 1
    else:
        print(f"[ERROR] bump: ожидается major/minor/patch, получено {kind}", file=sys.stderr)
        sys.exit(1)
    write_new(f"{major}.{minor}.{patch}")


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0

    cmd = argv[0]
    if cmd == "show":
        v, _ = read_current()
        print(v)
        return 0
    if cmd == "bump":
        if len(argv) < 2:
            print("[ERROR] Укажи что bump: patch/minor/major", file=sys.stderr)
            return 1
        bump(argv[1])
        return 0

    # Иначе — считаем что первый аргумент это версия
    write_new(cmd)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
