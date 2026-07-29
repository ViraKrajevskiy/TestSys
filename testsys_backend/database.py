"""
database.py
-----------
SQLite БД для десктопного приложения.
Файл БД: testsys.db (в корне проекта или рядом с main.py)
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Определяем путь к файлу БД
# Рекомендуется хранить рядом с main.py
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "testsys.db")

# SQLite URL (три слэша для абсолютного пути)
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Создаём engine для SQLite
engine = create_engine(
    DATABASE_URL,
    echo=False,  # Поменять на True для отладки
    connect_args={"check_same_thread": False},  # Нужно для многопоточности
)

# Сессия
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base для моделей
Base = declarative_base()


def get_db():
    """Dependency для получения сессии БД в эндпоинтах."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Создать все таблицы в БД."""
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ БД инициализирована успешно!")
    except Exception as e:
        print(f"❌ Ошибка при инициализации БД: {e}")
        print("\nСначала создай БД:")
        print("  python create_db.py")