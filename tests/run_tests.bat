@echo off
cd /d "%~dp0"
echo ============================================================
echo  TestSys — запуск тестов
echo ============================================================

echo.
echo [1/2] Python тесты (pytest)...
python -m pytest . -v --tb=short --ignore=js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo PYTHON ТЕСТЫ: ПРОВАЛЕНЫ
    set PYERR=1
) else (
    echo PYTHON ТЕСТЫ: ОК
    set PYERR=0
)

echo.
echo [2/2] JS тесты (curl.js)...
node js/test_curl.js
if %ERRORLEVEL% NEQ 0 (
    echo JS ТЕСТЫ: ПРОВАЛЕНЫ
    set JSERR=1
) else (
    echo JS ТЕСТЫ: ОК
    set JSERR=0
)

echo.
echo ============================================================
if %PYERR%==0 if %JSERR%==0 (
    echo  ВСЕ ТЕСТЫ ПРОШЛИ
    exit /b 0
) else (
    echo  ЕСТЬ ПРОВАЛЫ — смотри вывод выше
    exit /b 1
)
