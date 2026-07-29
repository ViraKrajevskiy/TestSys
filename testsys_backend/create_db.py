"""
create_db.py
-----------
Инициализация SQLite БД (создание таблиц).
При запуске FastAPI таблицы создаются автоматически, но можно запустить это вручную.
"""

import os
import sys

# Добавляем текущую директорию в path для импорта
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, Base, DB_PATH
from models import User

def init_sqlite_db():
    """Создать все таблицы в SQLite БД."""
    try:
        print(f"🗄️  Инициализация SQLite: {DB_PATH}")

        # Создаём все таблицы на основе моделей
        Base.metadata.create_all(bind=engine)

        print("✓ Все таблицы созданы успешно!")
        print(f"✓ БД файл: {DB_PATH}")
        print("\n✅ Готово! Запусти FastAPI:")
        print("   uvicorn main:app --reload --host 0.0.0.0 --port 8000")

    except Exception as e:
        print(f"❌ Ошибка при инициализации БД: {e}")
        sys.exit(1)

if __name__ == "__main__":
    init_sqlite_db()