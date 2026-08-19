# Rita Auto-Response Setup

Rita responde automáticamente preguntas sobre motos usando Claude API.

## Requisitos

1. **Supabase CLI** instalado: https://supabase.com/docs/guides/cli/getting-started
2. **ANTHROPIC_API_KEY** configurada en Supabase

## Pasos para desplegar

### 1. Instalar CLI de Supabase

```bash
npm install -g supabase
```

### 2. Login en Supabase

```bash
supabase login
```

### 3. Configurar variable de entorno

En el dashboard de Supabase (Project Settings → Edge Functions):
- Añadir variable de entorno: `ANTHROPIC_API_KEY`
- Valor: tu API key de Anthropic (https://console.anthropic.com)

### 4. Desplegar la función

```bash
cd /path/to/gruas
supabase functions deploy rita-respond --project-id vzzxsdtsaahhzyctvmhx
```

### 5. Verificar que funciona

La función se ejecutará automáticamente cuando un usuario pregunte a Rita:
1. Usuario abre "Pregunta a Rita" (botón 🤖)
2. Escribe pregunta sobre motos
3. Rita responde automáticamente en 1-2 segundos

## Cómo funciona

- **Tabla**: `connect_rita_dms` (pregunta + respuesta)
- **Trigger**: Se ejecuta al insertar pregunta de usuario
- **Edge Function**: Llama Claude API con contexto de motos
- **Respuesta**: Se guarda automáticamente en la BD

## Temas que Rita puede responder

✅ Mecánica de motos
✅ Mantenimiento
✅ Seguridad
✅ Rutas y viajes en moto
✅ Marcas y modelos
✅ Equipamiento

## Temas fuera del alcance

❌ Si pregunta algo no relacionado, Rita responde educadamente que enfocarse en motos
