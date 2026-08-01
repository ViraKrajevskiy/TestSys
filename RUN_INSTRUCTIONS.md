# 🚀 Инструкция по запуску TestSys

## ❌ Почему данные не сохранялись?

**Проблема:** Фронт указывал на `https://jsonplaceholder.typicode.com` (fake API), который ничего не сохраняет.

**Решение:** Переключили на `http://localhost:8000` (твой реальный FastAPI сервер с PostgreSQL).

---

## ✅ Полный процесс запуска

### Требования
- Python 3.10+
- PostgreSQL 12+ (или WSL2 на Windows)
- pip

### Запуск

**Терминал 1 — API сервер:**
```bash
cd testsys_backend
pip install -r requirements.txt
python create_db.py
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Терминал 2 — TestSys приложение:**
```bash
cd Backend
pip install -r requirements.txt
python main.py
```

**Проверка:**
- Откройте `http://127.0.0.1:8000/docs` в браузере (Swagger UI)
- Откройте TestSys окно
- Кнопка 👥 → Users CRUD должна работать

---

## 📁 Что изменилось

1. `Backend/Ui/js/core/state.js` — baseUrl теперь `http://localhost:8000`
2. `requirements.txt` — добавлены `pywebview` и `requests`

---

## 🔧 Если не работает

**"Connection refused на 8000"**
- Проверь что API сервер запущен в Терминале 1
- Убедись что выписалось "Uvicorn running on..."

**"Database connection failed"**
- Проверь что PostgreSQL запущен
- Запусти `python create_db.py` в testsys_backend/
- Проверь пароль в `testsys_backend/database.py` (default: postgres)

**Окно приложения не открывается**
- Проверь Python версию: `python --version` (нужен 3.10+)
- Попробуй запустить с полным пути: `python Backend/main.py`

---

Теперь данные **будут** сохраняться! ✅
