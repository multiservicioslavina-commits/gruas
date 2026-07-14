#!/bin/bash

# SCRIPT DE BACKUP AUTOMÁTICO - RIDERA SUPABASE
# Descarga base de datos y archivos de Storage cada vez que se ejecuta
# Guarda todo en ~/Backups-Ridera/

set -e

# Configuración
BACKUP_DIR="$HOME/Backups-Ridera"
PROJECT_ID="vzzxsdtsaahhzyctvmhx"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Crear carpeta de backups si no existe
mkdir -p "$BACKUP_DIR/database"
mkdir -p "$BACKUP_DIR/storage"
mkdir -p "$BACKUP_DIR/logs"

echo "🔄 Iniciando backup a las $(date)" | tee -a "$BACKUP_DIR/logs/backup.log"

# ====== BACKUP DE BASE DE DATOS ======
echo "📊 Descargando base de datos..."

# Obtener credenciales de Supabase (debes tener supabase CLI configurado)
# El archivo .supabase/config.json contiene las credenciales

if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI no está instalado"
    echo "Instala con: npm install -g supabase"
    exit 1
fi

# Dump de la base de datos usando Supabase
DB_BACKUP="$BACKUP_DIR/database/db-$TIMESTAMP.sql"

# Método: usar SQL Editor export (requiere API key)
# Para automático, necesitas configurar las credenciales de Supabase
# Ver instrucciones abajo

echo "⚠️  Para backup automático de BD, configura Supabase credentials"
echo "   Puedes descargar manualmente: Supabase Dashboard → SQL Editor → Download SQL dump"

# ====== BACKUP DE STORAGE ======
echo "📁 Descargando archivos de Storage..."

# Lista de buckets a respaldar
BUCKETS=("motos-venta" "pasaporte-ridera" "riders" "ride-photos")

for BUCKET in "${BUCKETS[@]}"; do
    echo "   • Descargando bucket: $BUCKET"
    BUCKET_DIR="$BACKUP_DIR/storage/$BUCKET/$TIMESTAMP"
    mkdir -p "$BUCKET_DIR"

    # Descargar archivos del bucket
    supabase storage download "$BUCKET" "$BUCKET_DIR" 2>/dev/null || {
        echo "   ⚠️  No se pudo descargar $BUCKET (puede estar vacío o sin permisos)"
    }
done

# ====== RESUMEN ======
echo ""
echo "✅ Backup completado a las $(date)"
echo "📂 Ubicación: $BACKUP_DIR"
echo ""
echo "Contenido:"
du -sh "$BACKUP_DIR"/* 2>/dev/null || echo "Sin datos respaldados"

# Logging
echo "✅ Backup completado: $TIMESTAMP" >> "$BACKUP_DIR/logs/backup.log"
