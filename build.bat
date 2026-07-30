@echo off
setlocal enabledelayedexpansion

cls
echo ====================================
echo   TestSys - Build EXE (PyInstaller)
echo ====================================
echo.

if not exist "TestSys.spec" (
    echo [ERROR] TestSys.spec not found. Run from project root.
    pause
    exit /b 1
)

if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
    echo [OK] Virtual environment activated
)

python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

echo.
echo Cleaning old build/dist...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul

echo.
echo Running build...
python -m PyInstaller --noconfirm --clean TestSys.spec
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Check log above.
    pause
    exit /b 1
)

echo.
echo [OK] Built: dist\TestSys.exe
echo.
echo Run now? (Y/N)
set /p run=
if /i "%run%"=="Y" (
    start "" "dist\TestSys.exe"
)

endlocal
