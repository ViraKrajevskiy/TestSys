"""
database.py
-----------
Подключение к PostgreSQL через SQLAlchemy.
Строка подключения: postgresql://user:password@localhost:5432/testsys_db
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Параметры подключения к Postgres
DB_USER = "postgres"
DB_PASSWORD = "postgres"
DB_HOST = "127.0.0.1"
DB_PORT = "5432"
DB_NAME = "testsys_db"

# URL с явной кодировкой (исправляет UnicodeDecodeError)
DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Создаём engine с правильными параметрами
engine = create_engine(
    DATABASE_URL,
    echo=True,
    connect_args={
        "client_encoding": "UTF8",  # Явно задаём кодировку UTF-8
    }
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
