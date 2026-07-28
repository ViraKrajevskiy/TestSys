# TestSys Backend — FastAPI + PostgreSQL

## Структура проекта

```
testsys_backend/
├── main.py              # FastAPI сервер с эндпоинтами
├── database.py          # Подключение к PostgreSQL
├── models.py            # SQLAlchemy модели
├── schemas.py           # Pydantic схемы валидации
├── crud.py              # CRUD операции
└── requirements.txt     # Зависимости
```

## Требования

- Python 3.10+
- PostgreSQL 12+
- pip

## Установка

### 1. Установить PostgreSQL

**Windows (WSL2 или PostgreSQL от postgresql.org):**
```powershell
# Если используешь WSL2 (Ubuntu):
wsl
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start

# Если установил PostgreSQL.org установщик — он запустится автоматически
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

### 2. Создать БД и пользователя

```bash
# Подключиться к PostgreSQL (по умолчанию юзер 'postgres')
psql -U postgres

# Создать БД
CREATE DATABASE testsys_db;

# Создать юзера (если нужен, по умолчанию используем 'postgres')
CREATE USER testsys_user WITH PASSWORD 'testsys_password';

# Дать права
ALTER ROLE testsys_user SET client_encoding TO 'utf8';
ALTER ROLE testsys_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE testsys_user SET default_transaction_deferrable TO on;
GRANT ALL PRIVILEGES ON DATABASE testsys_db TO testsys_user;

# Выход
\q
```

**Или просто используй встроенного пользователя 'postgres' (текущая конфигурация в database.py):**

### 3. Установить зависимости Python

```powershell
pip install -r requirements.txt
```

## Запуск сервера

```powershell
# Запустить FastAPI с автоперезагрузкой
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Сервер запустится на **http://localhost:8000**

## API документация

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

## CRUD эндпоинты

### Создать пользователя (POST)
```
POST /users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Acme Corp",
  "website": "https://example.com",
  "address": "123 Main St"
}

Response: 201
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  ...
}
```

### Получить всех пользователей (GET)
```
GET /users?skip=0&limit=10

Response: 200
[
  { "id": 1, "name": "John Doe", ... },
  { "id": 2, "name": "Jane Doe", ... }
]
```

### Получить пользователя по ID (GET)
```
GET /users/1

Response: 200
{
  "id": 1,
  "name": "John Doe",
  ...
}
```

### Обновить пользователя (PUT/PATCH)
```
PUT /users/1
Content-Type: application/json

{
  "name": "John Smith",
  "email": "john.smith@example.com"
}

Response: 200
{
  "id": 1,
  "name": "John Smith",
  "email": "john.smith@example.com",
  ...
}
```

### Удалить пользователя (DELETE)
```
DELETE /users/1

Response: 204 (No Content)
```

## Изменение параметров БД

Если хочешь использовать другого пользователя/пароль, отредактируй `database.py`:

```python
DB_USER = "testsys_user"
DB_PASSWORD = "testsys_password"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "testsys_db"
```

## Изменение порта

Чтобы запустить на другом порту (например, 5000):

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

## Проверка здоровья

```
GET /health

Response: 200
{
  "status": "ok",
  "message": "TestSys Backend работает"
}
```

## Примеры с curl/PowerShell

```powershell
# Создать пользователя
$body = @{
    name = "Alice"
    email = "alice@example.com"
    phone = "+7-999-000-00-00"
    company = "ONESEC"
    website = "https://onesec.uz"
    address = "Uzbekistan"
} | ConvertTo-Json

curl -X POST http://localhost:8000/users `
  -H "Content-Type: application/json" `
  -d $body

# Получить всех пользователей
curl http://localhost:8000/users

# Получить пользователя 1
curl http://localhost:8000/users/1

# Обновить пользователя 1
$update = @{ name = "Alice Smith" } | ConvertTo-Json
curl -X PUT http://localhost:8000/users/1 `
  -H "Content-Type: application/json" `
  -d $update

# Удалить пользователя 1
curl -X DELETE http://localhost:8000/users/1
```

## Управление БД через pgAdmin (GUI)

Установи pgAdmin:
```bash
# Windows/Mac: скачай с https://www.pgadmin.org/download/
# Linux:
sudo apt-get install pgadmin4
```

Подключись к PostgreSQL через pgAdmin:
- Host: localhost
- Port: 5432
- Username: postgres
- Password: postgres

Таблица `users` создастся автоматически при первом запуске сервера!
