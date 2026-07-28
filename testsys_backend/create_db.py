"""
create_db.py
-----------
Скрипт для создания БД testsys_db в PostgreSQL.
Использует .pgpass файл для аутентификации
"""

import psycopg2
from psycopg2 import sql
import os

# Параметры подключения (пароль из .pgpass)
DB_HOST = "127.0.0.1"
DB_PORT = "5432"
DB_USER = "postgres"

def create_database():
    """Создать БД testsys_db если её нет."""
    try:
        # Подключаемся БЕЗ явного пароля (берётся из .pgpass)
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            database="postgres",
            client_encoding="UTF8"
        )
        conn.autocommit = True

        cursor = conn.cursor()

        print("✓ Подключение к PostgreSQL установлено")

        # Проверяем есть ли уже БД
        cursor.execute(
            sql.SQL("SELECT 1 FROM pg_database WHERE datname = %s"),
            ["testsys_db"]
        )

        if cursor.fetchone():
            print("✓ БД testsys_db уже существует")
        else:
            print("Создаю БД testsys_db...")
            cursor.execute("CREATE DATABASE testsys_db WITH ENCODING 'UTF8'")
            print("✓ БД testsys_db создана успешно!")

        cursor.close()
        conn.close()
        print("\n✅ Всё готово!")

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        print("\nПроверь:")
        print("1. PostgreSQL запущен? (Get-Service postgresql*)")
        print("2. .pgpass файл создан? ($env:APPDATA\\postgresql\\.pgpass)")
        print("3. На каком порту? (текущий: 5432)")

if __name__ == "__main__":
    create_database()