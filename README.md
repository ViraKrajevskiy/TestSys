# TestSys

**TestSys** — десктопный клиент для тестирования REST API. Работает как автономное приложение без браузера и без облака: все данные хранятся локально.

---

## ✨ Возможности

### Основные
- **HTTP-запросы** — GET, POST, PUT, PATCH, DELETE с поддержкой Params, Headers, Body
- **Auth Tab** — Bearer Token, Basic Auth, API Key (header или query param)
- **Pre-request Scripts** — JavaScript, выполняется перед отправкой запроса
- **Tests** — автоматические проверки ответа с поддержкой `pm.test` / `expect`
- **Вкладки** — неограниченное количество, можно открыть в отдельном окне
- **Коллекции** — организация запросов по папкам, drag & drop для сортировки
- **Environments** — профили переменных (dev / staging / prod), мгновенное переключение
- **Динамические переменные** — `{{$randomEmail}}`, `{{$uuid}}`, `{{$isoTimestamp}}` и десятки других

### Инструменты
- **Collection Runner** — прогон всей коллекции по порядку с отчётом
- **Load Test** — нагрузочное тестирование с настройкой RPS и длительности
- **Parallel Test** — одновременный запуск нескольких запросов
- **Metrics** — история запросов с графиком времени ответа
- **Randomizer** — генерация случайных данных по шаблонам
- **Data Generator** — создание тестовых наборов данных
- **Cookie Manager** — просмотр и редактирование cookies
- **WebSocket** — поддержка WS-соединений
- **Script Editor** — Pre-request и Tests открываются в отдельном окне без UI

### Интерфейс
- **Тёмная / светлая тема** с кастомизацией цветов
- **i18n** — русский и английский узбекский интерфейс 
- **Sidebar** — дерево коллекций с поиском, плавная анимация
- **Response History** — история ответов по каждому запросу
- **Swagger / OpenAPI** — импорт и просмотр спецификаций
- **cURL** — импорт и экспорт запросов
- **Code Generator** — генерация кода запроса (Python, JS, Go и др.)
- **Hotkeys** — полный набор горячих клавиш

### Совместная работа
- **Sync** — синхронизация коллекций между участниками команды
- **Users** — управление пользователями через встроенный бэкенд
- **Shared Collections** — общие коллекции с разграничением прав

---

## 🗂 Структура проекта

```
TestSys/
├── Backend/                  # Desktop-приложение (pywebview)
│   ├── main.py               # Точка входа, запуск UI
│   ├── api.py                # Python ↔ JS bridge (все API-методы)
│   ├── network.py            # HTTP-запросы
│   ├── cli.py                # CLI-режим (CI/CD)
│   ├── sync_server.py        # Сервер совместной работы
│   └── Ui/                   # Фронтенд (vanilla JS)
│       ├── index.html
│       ├── style.css
│       ├── script-editor.html  # Отдельное окно редактора скриптов
│       └── js/
│           ├── core/           # i18n, state, hotkeys, scripting...
│           ├── features/       # auth, environments, loadTest...
│           └── components/     # tabContent, collections, tabBar
│
├── testsys_backend/          # FastAPI бэкенд (данные, пользователи)
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   ├── crud.py
│   └── schemas.py
│
├── TestSys.spec              # PyInstaller — сборка в .exe
├── build.bat                 # Скрипт сборки (Windows)
├── run.bat                   # Быстрый запуск (Windows)
└── run.sh                    # Быстрый запуск (Linux/macOS)
```

---

## 🚀 Быстрый старт

### Требования
- Python 3.10+
- Windows 10/11 (основная платформа), Linux/macOS поддерживаются

### Установка и запуск

```bash
# Клонировать репозиторий
git clone https://github.com/ViraKrajevskiy/TestSys.git
cd TestSys

# Windows — двойной клик или из терминала:
run.bat

# Linux / macOS:
chmod +x run.sh
./run.sh
```

`run.bat` / `run.sh` автоматически:
1. Создаёт виртуальное окружение
2. Устанавливает зависимости
3. Запускает FastAPI бэкенд на `http://127.0.0.1:8000`
4. Открывает десктопное окно приложения

### Ручной запуск (dev-режим)

```bash
cd Backend
python main.py
```

---

## 📦 Сборка .exe (Windows)

```bash
# Из корня проекта:
build.bat

# Или напрямую через PyInstaller:
pyinstaller TestSys.spec
```

Готовый `TestSys.exe` появится в папке `dist/`.

---

## 🧪 Scripting API

TestSys поддерживает pm-совместимые скрипты в Pre-request и Tests.

```javascript
// Pre-request: установить переменную
pm.variables.set("token", "abc123");
pm.request.headers.set("Authorization", "Bearer " + pm.variables.get("token"));

// Tests: проверить ответ
pm.test("Статус 200", () => pm.response.to.have.status(200));
pm.test("Есть id", () => {
  expect(pm.response.json().id).toBeDefined();
});

// Сохранить значение из ответа
pm.variables.set("userId", pm.response.json().id);
```

Скрипты открываются в **отдельном окне** (кнопка «Открыть отдельно ↗») с подсветкой, сниппетами и запуском по `Ctrl+Enter`.

---

## ⌨️ Горячие клавиши

| Действие | Клавиша |
|---|---|
| Новая вкладка | `Ctrl+T` |
| Отправить запрос | `Enter` (в поле URL) |
| Запустить скрипт | `Ctrl+Enter` |
| Сохранить скрипт | `Ctrl+S` |
| Терминал | `` Ctrl+` `` |
| Закрыть вкладку | `Ctrl+W` |

---

## 🛠 Технологии

| Слой | Стек |
|---|---|
| UI | Vanilla JS, Bootstrap 5.3, Bootstrap Icons |
| Desktop | Python 3, pywebview 6.x (WebView2 / WKWebView) |
| Backend | FastAPI, SQLAlchemy, SQLite, Uvicorn |
| Сборка | PyInstaller |

---

## 📄 Лицензия

MIT — используйте свободно.
