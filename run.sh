#!/bin/bash

# TestSys Quick Start Script for Linux/Mac
# Запускает testsys_backend API и Backend приложение

echo ""
echo "===================================="
echo "  TestSys - Postman on Python 🚀"
echo "===================================="
echo ""

# Проверяем что мы в правильной директории
if [ ! -d "testsys_backend" ] || [ ! -d "Backend" ]; then
    echo "❌ Ошибка: папки testsys_backend и/или Backend не найдены!"
    echo "Запустите этот скрипт из корня проекта"
    exit 1
fi

echo "✓ Структура проекта найдена"

echo ""
echo "📦 Проверяем Python..."

# Проверяем Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 не установлен!"
    echo "Установите Python 3.10+ с https://python.org"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python $PYTHON_VERSION найден"

echo ""
echo "🔧 Запускаем testsys_backend API на порту 8000..."
echo ""

# Функция для запуска API
run_api() {
    cd "$SCRIPT_DIR/testsys_backend"
    
    # Создаём virtual environment если нужно
    if [ ! -d ".venv" ]; then
        echo "Создаём virtual environment..."
        python3 -m venv .venv
    fi
    
    # Активируем venv и устанавливаем зависимости
    source .venv/bin/activate
    if [ -f "requirements.txt" ]; then
        pip install -q -r requirements.txt 2>/dev/null || pip install -r requirements.txt
    fi
    
    echo ""
    echo "========== API ЗАПУЩЕН =========="
    echo "Доступен на http://127.0.0.1:8000"
    echo "Документация: http://127.0.0.1:8000/docs"
    echo "=================================="
    echo ""
    
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
}

# Функция для запуска приложения
run_app() {
    sleep 2  # Даём API время на запуск
    
    echo ""
    echo "🎨 Запускаем Desktop приложение..."
    echo ""
    
    cd "$SCRIPT_DIR/Backend"
    
    # Создаём virtual environment если нужно
    if [ ! -d ".venv" ]; then
        echo "Создаём virtual environment..."
        python3 -m venv .venv
    fi
    
    # Активируем venv и устанавливаем зависимости
    source .venv/bin/activate
    if [ -f "requirements.txt" ]; then
        pip install -q -r requirements.txt 2>/dev/null || pip install -r requirements.txt
    fi
    
    echo ""
    echo "========== ПРИЛОЖЕНИЕ ЗАПУСКАЕТСЯ =========="
    echo "Вскоре откроется окно с интерфейсом."
    echo "Нажмите на кнопку 👥 в верхней панели для управления пользователями."
    echo "============================================="
    echo ""
    
    python3 main.py
}

# Получаем директорию скрипта
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Запускаем API в фоновом режиме
run_api &
API_PID=$!

# Запускаем приложение (основной процесс)
run_app
APP_PID=$!

# Убиваем API при выходе из приложения
trap "kill $API_PID 2>/dev/null" EXIT

echo ""
echo "✅ Оба процесса запущены!"
echo ""
echo "📋 Что дальше:"
echo "  1. В окне приложения нажмите на кнопку 👥"
echo "  2. Управляйте пользователями из таблицы"
echo "  3. Или используйте обычный режим Postman (вкладки, URL, методы)"
echo ""
echo "🌐 Полезные ссылки:"
echo "  - API Swagger: http://127.0.0.1:8000/docs"
echo "  - API ReDoc:   http://127.0.0.1:8000/redoc"
echo "  - API Health:  http://127.0.0.1:8000/health"
echo ""
echo "⛔ Для остановки: нажмите Ctrl+C"
echo ""

wait
