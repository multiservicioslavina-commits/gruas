@echo off
REM SCRIPT DE BACKUP AUTOMÁTICO - RIDERA SUPABASE (Windows)
REM Descarga base de datos y archivos de Storage
REM Guarda todo en %USERPROFILE%\Backups-Ridera\

setlocal enabledelayedexpansion

REM Configuración
set BACKUP_DIR=%USERPROFILE%\Backups-Ridera
set PROJECT_ID=vzzxsdtsaahhzyctvmhx
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c%%a%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
set TIMESTAMP=%mydate%_%mytime%

REM Crear carpetas de backup si no existen
if not exist "%BACKUP_DIR%\database" mkdir "%BACKUP_DIR%\database"
if not exist "%BACKUP_DIR%\storage" mkdir "%BACKUP_DIR%\storage"
if not exist "%BACKUP_DIR%\logs" mkdir "%BACKUP_DIR%\logs"

echo. >> "%BACKUP_DIR%\logs\backup.log"
echo [%date% %time%] Iniciando backup... >> "%BACKUP_DIR%\logs\backup.log"
echo.
echo 🔄 Iniciando backup...
echo.

REM Verificar si Supabase CLI está instalado
where supabase >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Error: Supabase CLI no está instalado
    echo Instala con: npm install -g supabase
    echo.
    pause
    exit /b 1
)

REM ====== BACKUP DE STORAGE ======
echo 📁 Descargando archivos de Storage...
echo 📁 Descargando archivos de Storage... >> "%BACKUP_DIR%\logs\backup.log"

REM Lista de buckets a respaldar
set BUCKETS=motos-venta pasaporte-ridera riders ride-photos

for %%B in (%BUCKETS%) do (
    echo    - Descargando bucket: %%B
    set BUCKET_DIR=%BACKUP_DIR%\storage\%%B\%TIMESTAMP%

    if not exist "!BUCKET_DIR!" mkdir "!BUCKET_DIR!"

    call supabase storage download %%B "!BUCKET_DIR!" 2>nul
    if !errorlevel! neq 0 (
        echo    ⚠️  Bucket %%B vacío o sin acceso
    )
)

REM ====== RESUMEN ======
echo.
echo ✅ Backup completado: %date% %time%
echo 📂 Ubicación: %BACKUP_DIR%
echo.
echo [%date% %time%] Backup completado exitosamente >> "%BACKUP_DIR%\logs\backup.log"

pause
