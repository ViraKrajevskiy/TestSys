"""
database.py
-----------
SQLite БД для десктопного приложения.
Файл БД: testsys.db (в корне проекта или рядом с main.py)
"""

import os
import sys
import io

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# НЕ трогаем sys.stdout в frozen exe — там он уже перенаправлен в файл
# из Backend/main.py, и оборачивание в TextIOWrapper его сломает.
if not getattr(sys, "frozen", False):
    try:
        if sys.stdout is not None and hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    except Exception:
        pass

# БД должна лежать рядом с exe (в frozen) или в корне проекта (в dev),
# а не в _MEIPASS — иначе данные пропадут после закрытия exe.
IS_FROZEN = getattr(sys, "frozen", False)
_ENV_DATA_DIR = os.environ.get("TESTSYS_USER_DATA_DIR")

if _ENV_DATA_DIR:
    DB_DIR = _ENV_DATA_DIR
elif IS_FROZEN:
    DB_DIR = os.path.dirname(sys.executable)
else:
    DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

DB_PATH = os.path.join(DB_DIR, "testsys.db")

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