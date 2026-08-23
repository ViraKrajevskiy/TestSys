@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo  TestSys — запуск тестов
echo ============================================================

echo.
echo [1/2] Python тесты (pytest)...
set PYTHONPATH=%~dp0..\Backend
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
echo [2/2] JS тесты...
set JSERR=0
for %%F in (js\test_*.js) do (
    echo.
    echo --- %%F ---
    node "%%F"
    if errorlevel 1 set JSERR=1
)
if %JSERR% NEQ 0 (
    echo.
    echo JS ТЕСТЫ: ПРОВАЛЕНЫ
) else (
    echo JS ТЕСТЫ: ОК
)

echo.
echo ============================================================
if %PYERR%==0 if %JSERR%==0 (
    echo  ВСЕ ТЕСТЫ ПРОШЛИ
    exit /b 0
)
echo  ЕСТЬ ПРОВАЛЫ — смотри вывод выше
exit /b 1
