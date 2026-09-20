@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ============================================
echo  Перенесення сторінок зі старого Google Sites
echo ============================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
  echo Python не знайдено. Встановіть його з python.org
  echo і в першому вікні інсталятора поставте галочку "Add Python to PATH".
  echo Потім запустіть цей файл ще раз.
  pause
  exit /b 1
)
echo Встановлюю потрібні пакети...
python -m pip install beautifulsoup4 requests
echo.
echo Переношу сторінки. Це може тривати кілька хвилин...
echo.
python tools\migrate_google_sites.py --all
echo.
echo Готово. Прочитайте повідомлення вище.
pause
