# Promo — Registro de talleres

Piezas de promoción para que los talleres de motos se registren en
**taller.ridera.com.co** y reciban el software de administración.

## Qué hay

| Archivo | Pieza | Salida |
|---|---|---|
| `story.html` | Story vertical (Instagram, Facebook, estado de WhatsApp) | `out/story.png` — 1080×1920 |
| `post.html`  | Post cuadrado de feed | `out/post.png` — 1080×1080 |
| `flyer.html` | Volante A4 vertical | `out/flyer.png` — 2480×3508 (300 ppp) y `out/flyer.pdf` |

## Generar las imágenes

```bash
./render.sh
```

Renderiza las tres piezas en `out/` usando el Chromium headless que ya trae el
entorno. No hace falta instalar nada más.

Si el Chromium está en otra ruta, cambia la variable `CHROME` al principio de
`render.sh`.

## Editar

El texto está en los `.html`, en claro. Cambia la copia ahí y vuelve a correr
`./render.sh`.

Los colores y las tipografías salen de `base.css` y son los mismos de
`registro-taller.html`:

- Naranja `#E85D20` (y `#FF6B2B` para estados activos)
- Carbón `#111316`, `#1a1e23`, `#222830`
- Titulares en **Barlow Condensed** 900, mayúsculas
- Texto en **DM Sans**
- El enlace del pie en **JetBrains Mono**

Las tipografías están descargadas en `fonts/` para que el render no dependa de
la red y salga igual siempre.

## Contenido

Los beneficios que aparecen en las piezas son los del producto real, tal como
están en `taller-motos/README.md`: clientes, motos, agenda, recepción digital,
órdenes de trabajo, diagnóstico, cotizaciones con aprobación del cliente,
inventario de repuestos, pagos, historial y reportes.

La foto de fondo (`img/taller.jpg`) se puede reemplazar por otra del mismo
formato vertical sin tocar el CSS.
