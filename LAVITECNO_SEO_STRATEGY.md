# Estrategia SEO Completa - LaViTecno
**Objetivo**: Mejorar ranking en Google para "cámaras de seguridad Medellín" y keywords relacionadas

---

## 🎯 FASE 1: OPTIMIZACIÓN TÉCNICA (Inmediato)

### 1.1 Actualizar WordPress y Plugins (PRIMERO - Hacer backup)
```
1. Ir a wp-admin → Dashboard
2. Hacer backup completo de la BD y archivos
3. WordPress → Actualizar a versión 7.1
4. Plugins → Actualizar uno por uno después del backup
   - All in One SEO (AIOSEO)
   - WooCommerce
   - Elementor
   - WoodMart Theme
```

### 1.2 Configuración de AIOSEO - Página de Inicio
**Ruta**: wp-admin → All in One SEO → Escritorio → Editar página inicio

#### Título Meta (60 caracteres máx)
```
LaViTecno | Cámaras de Seguridad WiFi en Medellín
```

#### Meta Descripción (160 caracteres)
```
Cámaras de seguridad WiFi, DVR y CCTV en Medellín. Instalación profesional. Hikvision, Dahua, TP-Link. Envíos a toda Colombia. ¡Cotiza hoy!
```

#### URL Slug (si aplica)
```
/
(mantener como raíz)
```

#### Palabras Clave Objetivo
- cámaras de seguridad Medellín
- cámaras WiFi Colombia
- sistemas CCTV Medellín
- DVR Medellín
- vigilancia por IP

---

## 🎯 FASE 2: OPTIMIZACIÓN DE CONTENIDO (Semana 1)

### 2.1 Estructura de URLs - Unificar a "producto"
**Problema actual**: URLs usan `/product/` (inglés) y `/producto/` (español)
**Solución**: Estandarizar todo a `/producto/` con redirecciones 301

**En WooCommerce:**
1. WooCommerce → Ajustes → Permalinks
2. Cambiar Base de productos a: `producto`
3. Guardar cambios

**Redirecciones (en .htaccess o plugin Redirection):**
```apache
# Redirigir /product/ a /producto/ (301)
RedirectMatch 301 ^/product/(.*)$ /producto/$1
```

### 2.2 Optimizar Páginas de Categorías
**Para cada categoría de productos** (ej: Hikvision, Dahua, TP-Link):

#### Estructura SEO
```
Título: "[Marca] Cámaras de Seguridad en Medellín | LaViTecno"
Meta: "Cámaras [Marca] en Medellín. Instalación, garantía y soporte técnico. Encuentra [Tipo] al mejor precio."
```

**Ejemplos específicos**:

**Hikvision:**
- Título: `Cámaras Hikvision en Medellín | WiFi, Inalámbrica, IP | LaViTecno`
- Meta: `Cámaras de seguridad Hikvision en Medellín. Sistemas WiFi e IP de vigilancia. Instalación profesional. Garantía oficial.`

**Dahua:**
- Título: `Cámaras Dahua en Medellín | Sistemas de Vigilancia IP | LaViTecno`
- Meta: `Dahua cámaras de seguridad en Medellín. Vigilancia IP profesional. Instalación y soporte técnico. ¡Cotiza gratis!`

### 2.3 Optimizar Páginas de Productos
**Aplicar a TODOS los productos** (Template en AIOSEO):

#### Título Producto
```
[Nombre Producto] | Cámaras de Seguridad Medellín | LaViTecno
Ejemplo: "Hikvision DS-2CD2043G2-I - Cámara IP WiFi 4MP | LaViTecno"
```

#### Meta Descripción
```
[Nombre corto]. [Característica principal]. Disponible en Medellín.
Precio: $[XX]. Envío a toda Colombia. ¡Compra segura!

Ejemplo: "Hikvision 4MP IP WiFi. Visión nocturna, detección movimiento. Medellín.
$450.000. Envío gratis Colombia. ¡Garantía oficial!"
```

---

## 🎯 FASE 3: SCHEMA MARKUP (Semana 1-2)

### 3.1 Validar Schema de Producto
**En AIOSEO → Settings → Schema → Product**

Verificar que aparezca:
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "[Nombre Producto]",
  "image": "[URL imagen]",
  "description": "[Descripción]",
  "brand": {
    "@type": "Brand",
    "name": "Hikvision/Dahua/TP-Link"
  },
  "offers": {
    "@type": "Offer",
    "price": "[Precio]",
    "priceCurrency": "COP",
    "availability": "InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[X]",
    "reviewCount": "[N]"
  }
}
```

### 3.2 Schema de Organización
**En AIOSEO → Settings → Schema → Organization**

```json
{
  "@type": "Organization",
  "name": "LaViTecno",
  "url": "https://lavitecno.com",
  "telephone": "[Tu teléfono]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Dirección]",
    "addressLocality": "Medellín",
    "addressRegion": "Antioquia",
    "postalCode": "[Código]",
    "addressCountry": "CO"
  },
  "sameAs": [
    "https://www.facebook.com/lavitecno",
    "https://www.instagram.com/lavitecno"
  ]
}
```

### 3.3 Schema de LocalBusiness (Importante para Medellín)
**En AIOSEO → Settings → Schema → LocalBusiness**

```json
{
  "@type": "LocalBusiness",
  "name": "LaViTecno",
  "image": "[Logo]",
  "telephone": "[Teléfono]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Dirección física]",
    "addressLocality": "Medellín",
    "addressRegion": "Antioquia",
    "postalCode": "[Código]",
    "addressCountry": "CO"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "[Latitud]",
    "longitude": "[Longitud]"
  }
}
```

---

## 🎯 FASE 4: GOOGLE SEARCH CONSOLE (Semana 2)

### 4.1 Verificar Dominio
1. Ir a [Google Search Console](https://search.google.com/search-console)
2. Agregar propiedad: `https://lavitecno.com`
3. Verificar propiedad (método recomendado: DNS o archivo HTML)

### 4.2 Enviar Sitemap
1. En AIOSEO → Sitemap → Ver sitemap XML
2. En GSC → Sitemaps → Agregar nuevo sitemap
3. URL: `https://lavitecno.com/sitemap.xml`

### 4.3 Solicitar Indexación
1. GSC → URLs → Inspeccionar URL
2. Para cada página principal, solicitar indexación
3. Priorizar: Homepage, Categorías, Productos top

### 4.4 Monitorear Errores
- **Rastreo**: Buscar errores 404, SSL, timeout
- **Cobertura**: Verificar que URLs estén indexadas
- **Core Web Vitals**: Monitorear velocidad
- **Mobile Usability**: Revisar errores móviles

---

## 🎯 FASE 5: VELOCIDAD Y RENDIMIENTO (Semana 2-3)

### 5.1 Optimización de Imágenes
- Usar plugin: **Smush** o **Imagify**
- Comprimir todas las imágenes de productos
- Usar formato WebP cuando sea posible

### 5.2 Caching y Compresión
- **Plugin**: WP Super Cache o W3 Total Cache
- Habilitar compresión GZIP
- Establecer tiempo de cache: 24-48 horas

### 5.3 CDN (Si es posible con Hostinger)
- Activar CDN de Hostinger (si está disponible)
- O usar Cloudflare (versión gratuita)

### 5.4 Verificar PageSpeed
1. Ir a [Google PageSpeed Insights](https://pagespeed.web.dev)
2. Analizar `https://lavitecno.com`
3. Implementar recomendaciones críticas

---

## 🎯 FASE 6: CONTENIDO Y PALABRAS CLAVE (Semana 3-4)

### 6.1 Crear Contenido Pillar
**Página: "Guía Completa Cámaras de Seguridad Medellín"**
- URL: `/guia-camaras-seguridad-medellin/`
- Longitud: 2,000+ palabras
- Secciones:
  1. Qué son las cámaras de seguridad IP
  2. Tipos de cámaras (Bullet, Domo, Turbo, PTZ)
  3. Marcas recomendadas (Hikvision, Dahua, TP-Link)
  4. Instalación profesional en Medellín
  5. Precios y financiamiento
  6. FAQ

### 6.2 Blog Post Strategy
**Crear 1-2 artículos/mes** en blog:
- "Diferencias entre WiFi, IP y Análogo"
- "Cómo elegir cámara según tu negocio"
- "Instalación paso a paso"
- "Mantenimiento de sistemas de vigilancia"

---

## 🎯 FASE 7: LINKBUILDING LOCAL (Mes 2+)

### 7.1 Directorios Locales
- Google My Business (Verificar y completar 100%)
- Yelp (si aplica)
- DirectoriosColombia
- LocalBusiness directorios

### 7.2 Partnerships
- Contactar instaladores locales
- Empresas de seguridad en Medellín
- Asociaciones empresariales

### 7.3 Guest Posts
- Escribir en blogs de seguridad
- Participar en foros relevantes

---

## 📊 KEYWORDS OBJETIVO

### High Priority (Traffic alto + Conversión)
- cámaras de seguridad Medellín
- cámaras WiFi Medellín
- DVR Medellín
- vigilancia CCTV Medellín
- camaras IP Medellín

### Medium Priority
- Hikvision Medellín
- Dahua Medellín
- TP-Link cámaras Medellín
- instalación cámaras Medellín
- reparación CCTV Medellín

### Long Tail (Bajo volumen, alta conversión)
- cámaras seguridad WiFi baratas Medellín
- cámaras vigilancia casas Medellín
- sistemas seguridad negocios Medellín
- cámaras interior exterior Medellín

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Semana 1
- [ ] Backup completo de WordPress
- [ ] Actualizar WordPress a 7.1
- [ ] Actualizar plugins (AIOSEO, WooCommerce)
- [ ] Cambiar URLs a `/producto/`
- [ ] Actualizar Título + Meta homepage en AIOSEO
- [ ] Verificar Schema básico

### Semana 2
- [ ] Optimizar títulos y metas de todas las categorías
- [ ] Optimizar títulos y metas de productos (Top 20)
- [ ] Implementar Schema LocalBusiness
- [ ] Conectar Google Search Console
- [ ] Enviar sitemap a GSC

### Semana 3
- [ ] Optimizar imágenes de productos
- [ ] Activar caching y compresión
- [ ] Revisar PageSpeed Insights
- [ ] Crear página "Guía de Cámaras"
- [ ] Monitorear posiciones en GSC

### Semana 4+
- [ ] Publicar primer blog post
- [ ] Completar Google My Business
- [ ] Evaluar resultados y ajustar
- [ ] Planificar siguientes meses

---

## 📞 RECURSOS ÚTILES

- [AIOSEO Docs](https://aioseo.com/docs/)
- [Google Search Console](https://search.google.com/search-console)
- [Schema.org](https://schema.org)
- [PageSpeed Insights](https://pagespeed.web.dev)
- [Google Trends](https://trends.google.com) - Para validar keywords
- [SEMrush/Ubersuggest](https://ubersuggest.com) - Análisis competencia

---

## 🚨 PRIORIDADES CRÍTICAS

1. **URGENTE**: Actualizar plugins y WordPress (riesgo de seguridad)
2. **URGENTE**: Cambiar título y meta de homepage
3. **IMPORTANTE**: Unificar URLs a `/producto/`
4. **IMPORTANTE**: Conectar Google Search Console
5. **IMPORTANTE**: Implementar Schema LocalBusiness

---

**Última actualización**: 2026-08-24
**Responsable**: SEO Strategy
**Estado**: En desarrollo
