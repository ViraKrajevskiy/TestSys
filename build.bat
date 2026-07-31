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

REM ============================================================
REM ВЕРСИЯ
REM ============================================================
REM Способы указать версию для сборки:
REM   build.bat 1.0.3        -> запишет "1.0.3" в Backend/version.py
REM   build.bat bump patch   -> 1.0.0 -> 1.0.1
REM   build.bat bump minor   -> 1.0.0 -> 1.1.0
REM   build.bat bump major   -> 1.0.0 -> 2.0.0
REM   build.bat              -> оставит текущую, но напомнит какая
REM ============================================================
if not "%~1"=="" (
    echo.
    echo Setting version...
    if /i "%~1"=="bump" (
        python set_version.py bump %~2
    ) else (
        python set_version.py %~1
    )
    if errorlevel 1 (
        echo [ERROR] Version update failed.
        pause
        exit /b 1
    )
) else (
    echo.
    echo No version argument passed. Current version:
    python set_version.py show
    echo.
    echo   Tip: run "build.bat 1.0.3" or "build.bat bump patch"
    echo        to update the version before building.
    echo.
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
for /f %%v in ('python set_version.py show') do set BUILT_VER=%%v
echo [OK] Built: dist\TestSys.exe   (version !BUILT_VER!)
echo.
echo Next step: create a GitHub Release with tag v!BUILT_VER! and attach
echo            dist\TestSys.exe (or dist.zip). Auto-update needs that.
echo.
echo Run now? (Y/N)
set /p run=
if /i "%run%"=="Y" (
    start "" "dist\TestSys.exe"
)

endlocal
