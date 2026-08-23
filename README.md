# TestSys

**TestSys** — десктопный клиент для тестирования REST API, вдохновлённый Postman. Работает как автономное приложение без браузера и без облака: все данные хранятся локально.

Версия 1.1.1 · Windows / Linux / macOS

---

## ✨ Возможности

### Запросы
- **HTTP-методы** — GET, POST, PUT, PATCH, DELETE с поддержкой Params, Headers, Body, User-Agent
- **Вкладки** — до 20 одновременно, любую можно оторвать в отдельное окно
- **Сессия** — открытые вкладки восстанавливаются после перезапуска
- **Коллекции** — организация запросов по папкам, drag & drop, поиск по дереву
- **Ctrl+S** — сохранить правки вкладки обратно в запрос коллекции
- **Environments** — профили переменных (dev / staging / prod), мгновенное переключение
- **Динамические переменные** — `{{$randomEmail}}`, `{{$uuid}}`, `{{$isoTimestamp}}` и десятки других
- **Multipart** — загрузка файлов (фото, видео) вместе с полями формы

### Авторизация
- **Типы** — Bearer Token, Basic Auth, API Key (в header или query)
- **Наследование** — запрос → папка → коллекция, как в Postman/Insomnia/Bruno.
  Задаёте авторизацию один раз на коллекции — все запросы внутри подхватывают её.
- **Авто-обновление токена** — при 401 TestSys сам дёргает refresh-эндпоинт,
  обновляет переменную с токеном и повторяет запрос. С защитой от штормов:
  одно обновление на все вкладки, пауза между попытками, предохранитель.
- **Диагностика** — при 401/403 под ответом объясняется причина: пустая
  переменная, No Auth или какой заголовок реально ушёл на сервер.

### Работа с ответом
- **Подсветка JSON** — ключи, строки, числа, bool, null
- **Клик по значению** — копирует его в буфер (строки — без кавычек)
- **Сворачивание узлов** со счётчиком: `[ … 12 элементов ]`
- **Ctrl+F** — поиск по ответу с подсветкой, счётчиком и навигацией
- **ПКМ по значению** — копировать значение / путь (`user.email`) / сохранить в переменную
- **Таблица** — CRUD-сущности из ответа рендерятся таблицей
- **Response History** — история ответов по каждому запросу

### Скрипты
- **Pre-request** — JavaScript перед отправкой запроса
- **Tests** — проверки ответа с `pm.test` / `expect`
- **pm-API** — `pm.variables`, `pm.request`, `pm.response`, консоль скриптов
- **Script Editor** — Pre-request и Tests открываются в отдельном окне

### Инструменты тестирования
- **Collection Runner** — прогон всей коллекции по порядку с отчётом
- **Load Test** — нагрузочное тестирование с настройкой RPS и длительности
- **Parallel Test** — одновременный запуск нескольких запросов
- **Metrics** — история запросов с графиком времени ответа

### Генерация данных
- **Randomizer** — случайные данные по шаблонам (User, Product, Order, Юрлицо РФ/UZ и др.)
- **Data Generator** — автозаполнение тела запроса по схеме

### Импорт / экспорт
- **Swagger / OpenAPI** — импорт спецификации (readOnly-поля не попадают в тело запроса)
- **cURL** — импорт и экспорт запросов
- **Code Generator** — генерация кода: Python (requests), JavaScript (fetch, axios), cURL
- **Экспорт коллекций** — в форматы Postman, Bruno, OpenAPI

### Ещё
- **WebSocket** — нативный WS-клиент (ws:// и wss://)
- **Cookie Manager** — просмотр и редактирование cookies
- **Встроенный терминал** — `` Ctrl+` ``
- **Тёмная / светлая тема** с кастомизацией цветов
- **i18n** — русский, английский и узбекский интерфейс
- **Hotkeys** — полный набор горячих клавиш с переназначением в настройках

### Совместная работа
- **Sync** — синхронизация коллекций по локальной сети (один компьютер — хост)
- **Users** — управление пользователями через встроенный бэкенд
- **Shared Collections** — общие коллекции с разграничением прав.
  Секретные переменные (токены, пароли) при синхронизации не передаются.

---

## 🗂 Структура проекта

```
TestSys/
├── Backend/                  # Desktop-приложение (pywebview)
│   ├── main.py               # Точка входа, запуск UI и бэкенда
│   ├── api.py                # Python ↔ JS bridge (все API-методы)
│   ├── network.py            # HTTP-запросы (requests)
│   ├── cli.py                # CLI-режим (CI/CD)
│   ├── sync_server.py        # LAN-сервер совместной работы
│   ├── updater.py            # Автообновление с GitHub Releases
│   └── Ui/                   # Фронтенд (vanilla JS)
│       ├── index.html
│       ├── style.css
│       ├── script-editor.html
│       └── js/
│           ├── core/         # state, i18n, hotkeys, scripting, swagger…
│           ├── features/     # authTab, environments, loadTest, sync…
│           └── components/   # tabContent, collections, tabBar
│
├── testsys_backend/          # Демо-API для тренировки (FastAPI + SQLite)
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── crud.py
│   └── schemas.py
│
├── tests/                    # Автотесты
│   ├── test_*.py             # Python (pytest)
│   ├── js/test_*.js          # JS (node)
│   ├── run_tests.bat         # Прогон всех тестов (Windows)
│   └── run_tests.sh          # Прогон всех тестов (Linux/macOS/CI)
│
├── TestSys.spec              # PyInstaller — сборка в .exe
├── build.bat                 # Скрипт сборки (Windows)
├── run.bat / run.sh          # Быстрый запуск
```

---

## 🚀 Быстрый старт

### Требования
- Python 3.10+
- Windows 10/11 (основная платформа), Linux/macOS поддерживаются

### Установка и запуск

```bash
git clone https://github.com/ViraKrajevskiy/TestSys.git
cd TestSys

# Windows:
run.bat

# Linux / macOS:
chmod +x run.sh
./run.sh
```

`run.bat` / `run.sh` автоматически создают виртуальное окружение,
ставят зависимости, поднимают демо-бэкенд и открывают окно приложения.

### Ручной запуск (dev-режим)

```bash
cd Backend
python main.py
```

---

## 🧪 Тесты

```bash
# Всё сразу:
cd tests
run_tests.bat        # Windows
./run_tests.sh       # Linux/macOS/CI

# По отдельности:
python -m pytest . --ignore=js     # Python
node js/test_auth.js               # конкретный JS-набор
```

Покрыто: наследование авторизации, авто-обновление токена и защита от
бесконечного цикла, фильтр readOnly при импорте OpenAPI, сессия вкладок,
настройка таймаута, сеть, cURL, синхронизация, автообновление.

---

## 📦 Сборка .exe (Windows)

```bash
build.bat
# или напрямую:
pyinstaller TestSys.spec
```

Готовый `TestSys.exe` появится в папке `dist/`.

---

## 🧩 Scripting API

TestSys поддерживает pm-совместимые скрипты в Pre-request и Tests.

```javascript
// Pre-request: подготовить запрос
pm.variables.set("token", "abc123");
pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));

// Tests: проверить ответ и сохранить токен
pm.test("Статус 200", () => pm.response.to.have.status(200));
if (pm.response.code === 200) {
  pm.variables.set("token", pm.response.json().access);
}
```

Скрипты можно открыть в **отдельном окне** с подсветкой, сниппетами и
запуском по `Ctrl+Enter`.

---

## ⌨️ Горячие клавиши

| Действие | Клавиша |
|---|---|
| Новая вкладка | `Ctrl+T` |
| Закрыть вкладку | `Ctrl+W` |
| Отправить запрос | `Ctrl+Enter` |
| Сохранить запрос в коллекцию | `Ctrl+S` |
| Поиск по ответу | `Ctrl+F` |
| Рандомайзер | `Ctrl+R` |
| Генератор данных | `Ctrl+G` |
| Терминал | `` Ctrl+` `` |
| Скрыть/показать сайдбар | `Ctrl+B` |
| Настройки | `Ctrl+,` |

Все сочетания переназначаются в настройках.

---

## 🛠 Технологии

| Слой | Стек |
|---|---|
| UI | Vanilla JS, Bootstrap 5.3, Bootstrap Icons |
| Desktop | Python 3, pywebview 6.x (WebView2 / WKWebView), requests |
| Демо-бэкенд | FastAPI, SQLAlchemy, SQLite, Uvicorn, Pydantic |
| Синхронизация | HTTP-сервер на стандартной библиотеке |
| Тесты | pytest, node |
| Сборка | PyInstaller |

---

## 📄 Лицензия

MIT — используйте свободно.
