@echo off
chcp 65001 > nul
REM TestSys Quick Start Script for Windows
REM Запускает testsys_backend API и Backend приложение в двух окнах

setlocal enabledelayedexpansion

cls
echo.
echo ====================================
echo   TestSys - Postman on Python
echo ====================================
echo.

REM Проверяем что мы в правильной директории
if not exist "testsys_backend" (
    echo ❌ Ошибка: папка testsys_backend не найдена!
    echo Запустите этот скрипт из корня проекта
    echo Текущая папка: %CD%
    pause
    exit /b 1
)

if not exist "Backend" (
    echo ❌ Ошибка: папка Backend не найдена!
    echo Текущая папка: %CD%
    pause
    exit /b 1
)

echo ✓ Структура проекта найдена
echo   - Backend: %CD%\Backend
echo   - testsys_backend: %CD%\testsys_backend

echo.
echo 📦 Проверяем Python...

REM Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python не установлен или не в PATH!
    echo Установите Python 3.10+ с https://python.org
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo ✓ Python !PYTHON_VERSION! найден

echo.
echo 🔧 Запускаем testsys_backend API на порту 8000...
echo.

REM Открываем новое окно и запускаем API
start "TestSys Backend API" cmd /k ^
    cd /d "!CD!\testsys_backend" ^& ^
    title TestSys Backend API - Порт 8000 ^& ^
    if not exist ".venv" ( ^
        echo Создаём virtual environment testsys_backend... ^& ^
        python -m venv .venv ^
    ) ^& ^
    call .venv\Scripts\activate.bat ^& ^
    echo Установка зависимостей... ^& ^
    pip install -q -r requirements.txt 2>nul ^& ^
    echo. ^& ^
    echo Инициализация БД... ^& ^
    python create_db.py 2>nul ^& ^
    echo. ^& ^
    echo ========== API ЗАПУЩЕН ========== ^& ^
    echo Доступен на http://127.0.0.1:8000 ^& ^
    echo Документация: http://127.0.0.1:8000/docs ^& ^
    echo ================================== ^& ^
    echo. ^& ^
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

echo ⏳ Ожидание запуска API (4 секунды)...
timeout /t 4 /nobreak

echo.
echo 🎨 Запускаем Desktop приложение...
echo.

REM Открываем второе окно и запускаем приложение
start "TestSys Desktop App" cmd /k ^
    cd /d "!CD!\Backend" ^& ^
    title TestSys Desktop - Postman ^& ^
    if not exist ".venv" ( ^
        echo Создаём virtual environment Backend... ^& ^
        python -m venv .venv ^
    ) ^& ^
    call .venv\Scripts\activate.bat ^& ^
    echo Установка зависимостей... ^& ^
    pip install -q -r requirements.txt 2>nul ^& ^
    echo. ^& ^
    echo ========== ПРИЛОЖЕНИЕ ЗАПУСКАЕТСЯ ========== ^& ^
    echo Вскоре откроется окно с интерфейсом. ^& ^
    echo Нажмите на кнопку ^^u263F (👥) в верхней панели. ^& ^
    echo ============================================= ^& ^
    echo. ^& ^
    python main.py

echo.
echo ✅ Оба процесса инициализированы!
echo.
echo 📋 Что дальше:
echo   1. Оба окна должны остаться открытыми
echo   2. Дождитесь "Uvicorn running..." в первом окне
echo   3. Дождитесь открытия приложения во втором окне
echo   4. Нажмите кнопку с юзером (👥) для управления пользователями
echo.
echo 🌐 Полезные ссылки:
echo   - API Swagger: http://127.0.0.1:8000/docs
echo   - API ReDoc:   http://127.0.0.1:8000/redoc
echo   - API Health:  http://127.0.0.1:8000/health
echo.
echo ⛔ Для остановки: закройте оба окна терминала (X в правом углу)
echo.
pause