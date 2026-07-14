# 🔄 Setup Automático de Backups - Ridera

Este guía te ayuda a configurar backups automáticos de toda tu base de datos y Storage en tu PC.

## ¿Qué se respalda?

- ✅ Base de datos (PostgreSQL)
- ✅ Archivos de Storage (motos-venta, pasaporte-ridera, riders, etc.)
- ✅ Se guarda automáticamente cada semana
- ✅ Se almacena en tu PC en `D:\Backups-Ridera\` (disco D)

---

## Instalación Rápida

### Paso 1: Instalar Supabase CLI

```bash
npm install -g supabase
```

### Paso 2: Autenticar con Supabase

```bash
supabase login
```

Se abrirá el navegador. Login con tu cuenta (multiservicioslavina@gmail.com) y autoriza.

### Paso 3: Hacer backup manual (prueba)

**En Windows:**
```bash
backup-script.bat
```

**En Mac/Linux:**
```bash
bash backup-script.sh
```

Esto descargará todos tus archivos en el **disco D**:
```
D:\Backups-Ridera\
├── storage\
│   ├── motos-venta\
│   ├── pasaporte-ridera\
│   ├── riders\
│   └── ride-photos\
├── database\
└── logs\
```

✅ Los backups se guardan automáticamente en **D:\Backups-Ridera\**

---

## Automatizar (ejecutar cada semana)

### En Mac/Linux (Cron):

```bash
# Abre el editor de cron
crontab -e

# Agrega esta línea (ejecuta cada domingo a las 2 AM):
0 2 * * 0 bash ~/gruas/backup-script.sh

# Guarda y cierra (Ctrl+X, luego Y, Enter)
```

### En Windows (Task Scheduler):

1. Abre **Task Scheduler**
2. Click **Create Basic Task**
3. Nombre: `Ridera Backup`
4. Trigger: **Weekly** (Domingo, 2:00 AM)
5. Action: **Start a program**
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `-e "require('child_process').execSync('bash ~/gruas/backup-script.sh')"`
6. Click OK

---

## Backup Manual de Base de Datos

Como el script necesita configuración avanzada de credenciales, por ahora puedes hacer backup manual:

### Opción A: Desde Supabase Dashboard
1. Ve a https://supabase.com/dashboard
2. Proyecto **ridera**
3. **SQL Editor** (esquina superior izquierda)
4. Click en **⋮** (menú tres puntos)
5. **Download SQL dump**
6. Guarda en `~/Backups-Ridera/database/`

### Opción B: Usar herramienta de línea de comandos
```bash
# Si tienes psql instalado:
PGPASSWORD="tu-password" pg_dump \
  -h db.vzzxsdtsaahhzyctvmhx.supabase.co \
  -U postgres \
  -d postgres > ~/Backups-Ridera/database/db-$(date +%Y%m%d).sql
```

(Obtén el password en Supabase → Project Settings → Database)

---

## Restaurar desde Backup

### Si necesitas restaurar la BD:

```bash
# Restaurar desde SQL dump
psql -h db.vzzxsdtsaahhzyctvmhx.supabase.co \
  -U postgres \
  -d postgres < ~/Backups-Ridera/database/db-20240714.sql
```

### Si necesitas restaurar archivos de Storage:

1. Ve a Supabase Dashboard → **Storage**
2. Selecciona el bucket
3. Click **Upload** → selecciona archivos de backup
4. Confirma

---

## Verificar Backups

```bash
# Ver tamaño de backups
du -sh ~/Backups-Ridera/*

# Ver últimos backups
ls -lh ~/Backups-Ridera/storage/*/

# Ver logs
tail -f ~/Backups-Ridera/logs/backup.log
```

---

## Próximos Pasos

1. ✅ Instala Supabase CLI
2. ✅ Ejecuta el script manualmente una vez
3. ✅ Configura automático (cron o Task Scheduler)
4. ✅ Verifica que funcione

**Una vez configurado:**
- Tus datos se respaldan automáticamente
- Si algo se borra, tienes copia en tu PC
- Puedes restaurar rápidamente

---

## Solución de Problemas

### Error: "supabase: command not found"
```bash
npm install -g supabase
```

### Error: "Authentication required"
```bash
supabase login
```

### Los backups no se crean
```bash
# Revisa los logs
tail ~/Backups-Ridera/logs/backup.log
```

### Espacio en disco
Los backups ocuparán ~100-500 MB según el tamaño de tu Storage.
Libera espacio si es necesario, o aumenta el intervalo de backup.

---

## Costo

✅ **GRATIS** - Solo necesitas:
- Supabase CLI (gratis)
- Espacio en tu PC
- 5 minutos de configuración

**No necesitas upgradar a Plan PRO** si haces backups locales regularmente.

---

¿Preguntas? Revisa el script en: `~/gruas/backup-script.sh`
