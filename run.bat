@echo off
REM TestSys Quick Start Script for Windows
REM Запускает testsys_backend API и Backend приложение в двух окнах

echo.
echo ====================================
echo   TestSys - Postman on Python 🚀
echo ====================================
echo.

REM Проверяем что мы в правильной директории
if not exist "testsys_backend" (
    echo ❌ Ошибка: папка testsys_backend не найдена!
    echo Запустите этот скрипт из корня проекта (там где папки Backend/ и testsys_backend/)
    pause
    exit /b 1
)

if not exist "Backend" (
    echo ❌ Ошибка: папка Backend не найдена!
    pause
    exit /b 1
)

echo ✓ Структура проекта найдена

echo.
echo 📦 Проверяем зависимости Python...

REM Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python не установлен или не в PATH!
    echo Установите Python 3.10+ с https://python.org
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo ✓ Python %PYTHON_VERSION% найден

echo.
echo 🔧 Запускаем testsys_backend API на порту 8000...
echo.

REM Открываем новое окно и запускаем API
start "TestSys Backend API" cmd /k ^
    cd /d "%CD%\testsys_backend" ^& ^
    if not exist ".venv" ( ^
        echo Создаём virtual environment... ^& ^
        python -m venv .venv ^& ^
        call .venv\Scripts\activate ^& ^
        pip install -r requirements.txt ^
    ) else ( ^
        call .venv\Scripts\activate ^
    ) ^& ^
    echo. ^& ^
    echo ========== API ЗАПУЩЕН ========== ^& ^
    echo Доступен на http://127.0.0.1:8000 ^& ^
    echo Документация: http://127.0.0.1:8000/docs ^& ^
    echo ================================== ^& ^
    echo. ^& ^
    uvicorn main:app --reload --host 127.0.0.1 --port 8000

echo ⏳ Ожидание запуска API (3 секунды)...
timeout /t 3 /nobreak

echo.
echo 🎨 Запускаем Desktop приложение (Postman)...
echo.

REM Открываем второе окно и запускаем приложение
start "TestSys Desktop App" cmd /k ^
    cd /d "%CD%\Backend" ^& ^
    if not exist ".venv" ( ^
        echo Создаём virtual environment... ^& ^
        python -m venv .venv ^& ^
        call .venv\Scripts\activate ^& ^
        pip install -r requirements.txt ^
    ) else ( ^
        call .venv\Scripts\activate ^
    ) ^& ^
    echo. ^& ^
    echo ========== ПРИЛОЖЕНИЕ ЗАПУСКАЕТСЯ ========== ^& ^
    echo Вскоре откроется окно с интерфейсом. ^& ^
    echo Нажмите на кнопку 👥 в верхней панели для управления пользователями. ^& ^
    echo ============================================= ^& ^
    echo. ^& ^
    python main.py

echo.
echo ✅ Оба процесса запущены!
echo.
echo 📋 Что дальше:
echo   1. Оба окна должны остаться открытыми
echo   2. В окне приложения нажмите на кнопку 👥
echo   3. Управляйте пользователями из таблицы
echo   4. Или используйте обычный режим Postman (вкладки, URL, методы)
echo.
echo 🌐 Полезные ссылки:
echo   - API Swagger: http://127.0.0.1:8000/docs
echo   - API ReDoc:   http://127.0.0.1:8000/redoc
echo   - API Health:  http://127.0.0.1:8000/health
echo.
echo ⛔ Для остановки: закройте оба окна терминала
echo.
pause
