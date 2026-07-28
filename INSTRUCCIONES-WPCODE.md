# 🗺️ INSTALAR MAPA INTERACTIVO EN RIDERA.COM.CO

## ✅ Pasos rápidos (5 minutos)

### 1️⃣ Ve a WPCode
```
Tu sitio → WPCode → Code Snippets
```

### 2️⃣ Crea un NUEVO snippet
- Haz clic en **"+ Add Snippet"**
- Selecciona **"Add Your Custom Code"**

### 3️⃣ Configura el snippet
- **Name:** `Ridera Mapa Interactivo - Mejorado`
- **Code Type:** PHP
- **Location:** Site Wide (Everywhere)

### 4️⃣ Copia TODO el código
- Abre el archivo: `ridera-mapa-wpcode.php`
- Copia **TODO el contenido** (desde `<?php` hasta el final)
- Pégalo en la sección de código de WPCode

### 5️⃣ Guarda y activa
- Haz clic en **"Save Snippet"**
- Activa el toggle (debe estar en verde)

### 6️⃣ Listo ✨
El mapa se mostrará automáticamente donde tengas el shortcode:
```
[ridera_mapa_interactivo]
```

---

## 📌 Si ya tienes el shortcode en una página

Si ya existe `[ridera_mapa_interactivo]` en alguna página, solo necesitas:

1. Desactiva el **snippet antiguo** en WPCode
2. Agrega este **nuevo snippet**
3. Actívalo
4. Guarda la página (si es necesario)

---

## 🎯 ¿Qué hace el mapa?

✅ **Carga todas las 43+ rutas** desde WordPress  
✅ **Extrae destinos automáticamente** de los títulos  
✅ **Muestra ubicaciones reales** en el mapa  
✅ **Popups con información:**
   - Nombre de la ruta
   - Destino
   - Distancia (km)
   - Dificultad
   - Descripción corta
   - Link a la página completa

✅ **Panel lateral** con acordeón de departamentos  
✅ **Estadísticas en tiempo real** (total de rutas, kms, etc.)  
✅ **Interactivo:**
   - Haz clic en un departamento → ve los markers
   - Haz clic en una ruta → zoom al destino y abre popup

---

## 🔧 Si necesitas cambios después

- **Cambiar color del botón:** Busca `#E85D20` y reemplaza
- **Cambiar tamaño del mapa:** Busca `height: 85vh` y modifica
- **Agregar más coordenadas:** Busca `DEST_COORDS` y agrega: `'nombre-destino': [lat, lng],`

---

## ❌ Troubleshooting

**El mapa no carga:**
- Verifica que el snippet esté **activado** (toggle verde)
- Recarga la página (Ctrl+F5)
- Abre la consola (F12) y busca errores

**Las rutas no aparecen:**
- Verifica que haya rutas publicadas en WordPress
- Comprueba que la API REST esté activa: `/wp-json/wp/v2/rutas`

**El shortcode no funciona:**
- Asegúrate de tener `[ridera_mapa_interactivo]` en la página
- Verifica que el snippet esté en "Site Wide"

---

## 📞 ¿Preguntas?

Si algo no funciona, comparte:
1. Screenshot del error en la consola (F12)
2. La URL donde está el mapa
3. Si el shortcode está correctamente escrito
