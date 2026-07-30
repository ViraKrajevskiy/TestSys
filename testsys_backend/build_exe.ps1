# 🚀 Сборка TestSys в standalone EXE (без Python!)
# Выполни: powershell -ExecutionPolicy Bypass -File build_exe.ps1

Set-Location -Path "D:\FLEET PROJECTS\NewTestSys"

Write-Host "✨ Начинаю сборку standalone EXE..." -ForegroundColor Green

# ⚙️ ШАГ 1: Установить/обновить зависимости
Write-Host "`n📦 ШАГ 1: Устанавливаю зависимости..." -ForegroundColor Cyan
pip install -q --upgrade pip
pip install -q pyinstaller
pip install -q -r requirements.txt

# 🧹 ШАГ 2: Очистить старые сборки
Write-Host "`n🗑️  ШАГ 2: Очищаю старые артефакты..." -ForegroundColor Cyan
Remove-Item dist -r -Force -ErrorAction SilentlyContinue
Remove-Item build -r -Force -ErrorAction SilentlyContinue
Remove-Item *.spec -Force -ErrorAction SilentlyContinue

# 🔨 ШАГ 3: Собрать в EXE
Write-Host "`n🔨 ШАГ 3: Собираю TestSys.exe..." -ForegroundColor Cyan
Write-Host "   (это может занять 2-5 минут)..." -ForegroundColor Gray

# Команда сборки для Windows с корректными путями
python -m PyInstaller `
  --onefile `
  --windowed `
  --name TestSys `
  --icon=Backend/Ui/icon.ico `
  --add-data "Backend/Ui;Ui" `
  --hidden-import=webview `
  --hidden-import=Backend.api `
  --hidden-import=Backend.network `
  --collect-all=pywebview `
  --distpath ./dist `
  --buildpath ./build `
  --specpath ./ `
  Backend/main.py

# ✅ ШАГ 4: Проверить результат
Write-Host "`n✅ ШАГ 4: Проверяю результат..." -ForegroundColor Cyan

if (Test-Path "dist/TestSys.exe") {
    $size = (Get-Item "dist/TestSys.exe").Length / 1MB
    Write-Host "🎉 Успешно!" -ForegroundColor Green
    Write-Host "   📁 Путь: dist/TestSys.exe" -ForegroundColor White
    Write-Host "   💾 Размер: $([Math]::Round($size, 2)) МБ" -ForegroundColor White
    Write-Host "`n🚀 Готово! Можешь запустить:" -ForegroundColor Green
    Write-Host "   .\dist\TestSys.exe" -ForegroundColor Yellow
    Write-Host "`n⚡ Никакой Python не требуется!" -ForegroundColor Green
} else {
    Write-Host "❌ Ошибка сборки!" -ForegroundColor Red
    Write-Host "   Проверь логи выше" -ForegroundColor Yellow
}
