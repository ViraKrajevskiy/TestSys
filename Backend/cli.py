"""
cli.py — консольный режим TestSys.

Даёт три команды, работающие через тот же exe без GUI:

    testsys run <collection.json> [--env env.json] [--bail] [--json]
        Прогоняет все запросы коллекции. Возвращает exit code 0 (все прошли)
        или 1 (были провалы). Аналог Newman для Postman.

    testsys import <endpoint> <data.csv|data.json> [--method POST]
        Для каждой строки данных отправляет запрос. Полезно для массового
        засева базы или миграции.

    testsys request <METHOD> <URL> [--body body.json] [--header 'K: V']
        Одиночный запрос — удобно для скриптов.

Скрипты pre-request и tests из коллекций в CLI не выполняются
(нужен движок JS, тянуть его в дистрибутив дорого). Валидация в этом
режиме идёт только по HTTP-статусу: 2xx/3xx — успех, 4xx/5xx — провал.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from typing import Any

# Импортируем нашу же логику сети — та, что используется в GUI.
# Плюс — те же ошибки, то же поведение.
from network import send_http_request


# ============================================================
# ФОРМАТИРОВАНИЕ
# ============================================================
_USE_COLOR = sys.stdout.isatty() and os.name != "nt" or "ANSICON" in os.environ

def _c(text, color):
    if not _USE_COLOR:
        return text
    codes = {"green": "32", "red": "31", "yellow": "33", "blue": "34", "gray": "90", "bold": "1"}
    return f"\033[{codes.get(color, '0')}m{text}\033[0m"


def _fmt_ms(ms):
    if ms < 1000: return f"{ms}ms"
    return f"{ms/1000:.1f}s"


def _status_color(code):
    if code == 0: return "red"
    if code >= 500: return "red"
    if code >= 400: return "yellow"
    return "green"


# ============================================================
# ЗАМЕНА ПЕРЕМЕННЫХ (упрощённая версия из utils.js)
# ============================================================
_VAR_RE = re.compile(r"\{\{(\w+)\}\}")


def resolve_vars(text: str, variables: dict) -> str:
    if not text or not isinstance(text, str):
        return text
    return _VAR_RE.sub(lambda m: str(variables.get(m.group(1), m.group(0))), text)


def resolve_deep(obj, variables):
    """Рекурсивная подстановка в структурах."""
    if isinstance(obj, str):
        return resolve_vars(obj, variables)
    if isinstance(obj, list):
        return [resolve_deep(x, variables) for x in obj]
    if isinstance(obj, dict):
        return {k: resolve_deep(v, variables) for k, v in obj.items()}
    return obj


# ============================================================
# КОМАНДА: run — прогон коллекции
# ============================================================
def cmd_run(args):
    """testsys run collection.json"""
    try:
        with open(args.collection, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as e:
        print(_c(f"✗ Не удалось прочитать коллекцию: {e}", "red"))
        return 2

    # Принимаем два формата: наш экспорт с {collections, variables}
    # и голый объект коллекции {name, folders}.
    if isinstance(raw, dict) and "collections" in raw:
        collections = raw["collections"]
        variables = dict(raw.get("variables") or {})
    elif isinstance(raw, list):
        collections = raw
        variables = {}
    elif isinstance(raw, dict) and "folders" in raw:
        collections = [raw]
        variables = {}
    else:
        print(_c("✗ Не распознан формат файла — ожидается экспорт TestSys", "red"))
        return 2

    # Переменные окружения — из отдельного файла (перекрывают)
    if args.env:
        try:
            with open(args.env, "r", encoding="utf-8") as f:
                env = json.load(f)
            variables.update(env.get("variables", env))
        except Exception as e:
            print(_c(f"✗ Не удалось прочитать окружение: {e}", "red"))
            return 2

    # --var name=value — точечное переопределение из командной строки
    for pair in (args.var or []):
        if "=" not in pair:
            print(_c(f"⚠ пропущено: {pair} (нужен формат name=value)", "yellow"))
            continue
        k, v = pair.split("=", 1)
        variables[k.strip()] = v.strip()

    results = _run_collections(collections, variables, args)

    # ---- Сводка ----
    total = len(results)
    passed = sum(1 for r in results if r["ok"])
    failed = total - passed
    total_ms = sum(r["ms"] for r in results)

    if args.json:
        print(json.dumps({
            "total": total, "passed": passed, "failed": failed,
            "duration_ms": total_ms,
            "requests": results,
        }, ensure_ascii=False, indent=2))
    else:
        print()
        print(_c("━" * 60, "gray"))
        print(_c(f"  Всего:    {total}", "bold"))
        print(_c(f"  Прошло:   {passed}", "green"))
        if failed:
            print(_c(f"  Провалов: {failed}", "red"))
        print(_c(f"  Время:    {_fmt_ms(total_ms)}", "gray"))
        print(_c("━" * 60, "gray"))

    return 0 if failed == 0 else 1


def _run_collections(collections, variables, args):
    """Общий цикл: коллекция → папки → запросы."""
    results = []
    for col in collections:
        _log_group(f"📚 {col.get('name', 'collection')}", args)
        for folder in col.get("folders") or []:
            _log_group(f"  📁 {folder.get('name', 'folder')}", args)
            for item in folder.get("items") or []:
                result = _run_one(item, variables, args)
                results.append(result)
                if args.bail and not result["ok"]:
                    print(_c("→ прерывание по --bail", "yellow"))
                    return results
    return results


def _run_one(item, variables, args):
    """Один запрос коллекции."""
    method = (item.get("method") or "GET").upper()
    url = resolve_vars(item.get("url") or "", variables)
    body = resolve_vars(item.get("body") or "", variables) if item.get("body") else None
    name = item.get("name") or url

    started = time.time()
    resp = send_http_request(method, url, {"Content-Type": "application/json"}, {}, body)
    ms = int((time.time() - started) * 1000)

    ok = bool(resp.get("ok")) and (resp.get("status_code", 0) < 400)
    status = resp.get("status_code", 0)

    # ---- Вывод ----
    if not args.json:
        mark = _c("✓", "green") if ok else _c("✗", "red")
        st = _c(str(status) if status else "ERR", _status_color(status))
        line = f"    {mark} {method:6} {name}  {st}  {_c(_fmt_ms(ms), 'gray')}"
        print(line)
        if not ok and args.verbose:
            err = resp.get("error") or resp.get("text", "")[:200]
            for ln in str(err).splitlines()[:5]:
                print(_c(f"        {ln}", "gray"))

    return {
        "name": name, "method": method, "url": url,
        "ok": ok, "status": status, "ms": ms,
        "error": resp.get("error", ""),
    }


def _log_group(text, args):
    if not args.json:
        print(_c(text, "blue"))


# ============================================================
# КОМАНДА: import — массовая загрузка
# ============================================================
def cmd_import(args):
    """testsys import <endpoint> <data.csv|data.json> --method POST"""
    method = args.method.upper()
    endpoint = args.endpoint

    # Загружаем данные
    rows = _load_data(args.data)
    if rows is None:
        return 2
    if not rows:
        print(_c("⚠ файл пуст", "yellow"))
        return 0

    print(_c(f"→ Импорт {len(rows)} записей: {method} {endpoint}", "bold"))

    # Переменные из строки
    base_vars = {}
    for pair in (args.var or []):
        if "=" in pair:
            k, v = pair.split("=", 1)
            base_vars[k.strip()] = v.strip()

    ok_count = fail_count = 0
    started = time.time()

    for i, row in enumerate(rows, 1):
        # Каждая строка становится переменными для подстановки в URL и body
        variables = {**base_vars, **{str(k): str(v) for k, v in row.items()}}
        url = resolve_vars(endpoint, variables)

        if args.body_template:
            # Шаблон с {{col}} подставляется значениями строки
            body = resolve_vars(args.body_template, variables)
        elif method in ("POST", "PUT", "PATCH"):
            # По умолчанию отправляем всю строку как JSON
            body = json.dumps(row, ensure_ascii=False)
        else:
            body = None

        resp = send_http_request(method, url, {"Content-Type": "application/json"}, {}, body)
        ok = bool(resp.get("ok")) and resp.get("status_code", 0) < 400

        if ok:
            ok_count += 1
        else:
            fail_count += 1
            if not args.quiet:
                st = resp.get("status_code", 0) or "ERR"
                err = (resp.get("error") or resp.get("text", ""))[:120]
                print(_c(f"  ✗ #{i} → {st}: {err}", "red"))
                if args.bail:
                    print(_c("→ прерывание по --bail", "yellow"))
                    break

        # Прогресс каждые 10 строк
        if i % 10 == 0 and not args.quiet:
            print(_c(f"  … {i}/{len(rows)}  ({ok_count} ok, {fail_count} fail)", "gray"))

    elapsed = int((time.time() - started) * 1000)
    print()
    print(_c(f"Готово: {ok_count} успешно, {fail_count} провалов, {_fmt_ms(elapsed)}",
             "green" if fail_count == 0 else "yellow"))
    return 0 if fail_count == 0 else 1


def _load_data(path):
    """CSV → список dict, JSON-массив → как есть."""
    try:
        if path.lower().endswith(".csv"):
            with open(path, "r", encoding="utf-8-sig", newline="") as f:
                # Автоопределение разделителя (CSV или ;)
                sample = f.read(2048)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
                except csv.Error:
                    dialect = csv.excel
                return list(csv.DictReader(f, dialect=dialect))

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # {"items": [...]} и подобные — распаковываем
            for k in ("items", "data", "records", "rows"):
                if k in data and isinstance(data[k], list):
                    return data[k]
            return [data]
        print(_c(f"✗ Неожиданный формат данных: {type(data).__name__}", "red"))
        return None
    except FileNotFoundError:
        print(_c(f"✗ Файл не найден: {path}", "red"))
        return None
    except Exception as e:
        print(_c(f"✗ Ошибка чтения {path}: {e}", "red"))
        return None


# ============================================================
# КОМАНДА: request — одиночный запрос
# ============================================================
def cmd_request(args):
    """testsys request GET https://api.example.com/users"""
    headers = {}
    for h in (args.header or []):
        if ":" in h:
            k, v = h.split(":", 1)
            headers[k.strip()] = v.strip()

    body = None
    if args.body:
        if args.body.startswith("@"):
            # @file.json — прочитать из файла
            with open(args.body[1:], "r", encoding="utf-8") as f:
                body = f.read()
        else:
            body = args.body
    if body:
        headers.setdefault("Content-Type", "application/json")

    variables = {}
    for pair in (args.var or []):
        if "=" in pair:
            k, v = pair.split("=", 1)
            variables[k.strip()] = v.strip()

    url = resolve_vars(args.url, variables)
    if body:
        body = resolve_vars(body, variables)

    started = time.time()
    resp = send_http_request(args.method.upper(), url, headers, {}, body)
    ms = int((time.time() - started) * 1000)

    ok = bool(resp.get("ok")) and resp.get("status_code", 0) < 400
    status = resp.get("status_code", 0)

    if args.json:
        out = {
            "ok": ok, "status": status, "ms": ms,
            "url": url, "method": args.method.upper(),
        }
        if resp.get("ok"):
            out["headers"] = resp.get("headers", {})
            body_text = resp.get("text", "")
            try: out["body"] = json.loads(body_text)
            except Exception: out["body"] = body_text
        else:
            out["error"] = resp.get("error", "")
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        mark = _c("✓", "green") if ok else _c("✗", "red")
        st = _c(str(status) if status else "ERR", _status_color(status))
        print(f"{mark} {args.method.upper()} {url}  {st}  {_c(_fmt_ms(ms), 'gray')}")
        if resp.get("ok"):
            print(resp.get("text", ""))
        else:
            print(_c(resp.get("error", ""), "red"))

    return 0 if ok else 1


# ============================================================
# ТОЧКА ВХОДА
# ============================================================
def build_parser():
    p = argparse.ArgumentParser(
        prog="testsys",
        description="TestSys CLI — прогон коллекций, массовый импорт, одиночные запросы.",
    )
    sub = p.add_subparsers(dest="command", required=True)

    # --- run ---
    r = sub.add_parser("run", help="Прогнать коллекцию (для CI)")
    r.add_argument("collection", help="Путь к экспортированной коллекции .json")
    r.add_argument("--env", help="Файл с переменными окружения")
    r.add_argument("--var", action="append", help="Переменная name=value (можно несколько)")
    r.add_argument("--bail", action="store_true", help="Остановиться на первой ошибке")
    r.add_argument("--json", action="store_true", help="Вывод машиночитаемым JSON")
    r.add_argument("-v", "--verbose", action="store_true", help="Подробный вывод при ошибках")
    r.set_defaults(func=cmd_run)

    # --- import ---
    i = sub.add_parser("import", help="Массовая загрузка данных из CSV/JSON")
    i.add_argument("endpoint", help="URL эндпоинта, поддерживает {{имя_поля}}")
    i.add_argument("data", help="Файл с данными: .csv или .json (массив)")
    i.add_argument("--method", default="POST", help="HTTP-метод (по умолчанию POST)")
    i.add_argument("--body-template", help="Шаблон тела с {{имя_поля}} (иначе — вся строка как JSON)")
    i.add_argument("--var", action="append", help="Дополнительная переменная name=value")
    i.add_argument("--bail", action="store_true", help="Остановиться на первой ошибке")
    i.add_argument("--quiet", action="store_true", help="Только итог, без прогресса")
    i.set_defaults(func=cmd_import)

    # --- request ---
    q = sub.add_parser("request", help="Одиночный HTTP-запрос")
    q.add_argument("method", help="GET/POST/PUT/DELETE/…")
    q.add_argument("url", help="URL, поддерживает {{переменные}}")
    q.add_argument("--header", "-H", action="append", help="Заголовок 'Key: Value'")
    q.add_argument("--body", "-d", help="Тело или @file.json")
    q.add_argument("--var", action="append", help="Переменная name=value")
    q.add_argument("--json", action="store_true", help="Вывод машиночитаемым JSON")
    q.set_defaults(func=cmd_request)

    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print(_c("\n⚠ прервано", "yellow"))
        return 130
    except Exception as e:
        print(_c(f"✗ {e}", "red"))
        if getattr(args, "verbose", False):
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
