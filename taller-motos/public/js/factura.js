// La factura impresa.
//
// Hasta aquí "Imprimir" imprimía otra cosa: en la orden, la orden de
// trabajo (con diagnóstico y notas, que es un documento interno); en la
// venta, un recibo que decía "Venta #7". Ninguno era la factura. Se emitía
// el documento, quedaba guardado con su consecutivo, y no había cómo
// imprimirlo como factura.
//
// Esto es esa factura, y sirve para los dos orígenes -- orden de trabajo y
// venta de mostrador -- porque el documento es el mismo: lo único que
// cambia son los renglones.
//
// Dos formatos, mismo documento: hoja carta y tirilla térmica. Cuál se usa
// lo decide el EQUIPO, no el taller: un taller puede tener una láser en la
// oficina y una térmica en el mostrador, y lo que manda es dónde está
// parado quien pulsa "Imprimir". Por eso vive en localStorage y no en la
// ficha del taller.
import { esc } from './ui.js';

const CLAVE_FORMATO = 'ridera.impresora';
export const FORMATOS = {
  carta: 'Hoja carta',
  '80':  'Tirilla 80 mm',
  '58':  'Tirilla 58 mm'
};

// localStorage puede lanzar (modo privado, cookies bloqueadas) o venir con
// basura de una versión anterior. Ante cualquier duda, hoja carta: es el
// formato que funciona en cualquier impresora.
export function formatoImpresora() {
  try {
    const guardado = localStorage.getItem(CLAVE_FORMATO);
    return FORMATOS[guardado] ? guardado : 'carta';
  } catch { return 'carta'; }
}

export function guardarFormatoImpresora(valor) {
  try {
    if (FORMATOS[valor]) localStorage.setItem(CLAVE_FORMATO, valor);
  } catch { /* sin almacenamiento: se queda en carta y ya */ }
}

function dinero(monto, moneda) {
  return Number(monto || 0).toLocaleString('es-CO', {
    style: 'currency', currency: moneda || 'COP', maximumFractionDigits: 0
  });
}

function fechaLarga(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString('es-CO',
    { day: 'numeric', month: 'long', year: 'numeric' });
}

// Los renglones llegan ya normalizados por quien llama: {descripcion,
// cantidad, precio, total}. La orden los arma de servicios + repuestos; la
// venta, de sus ítems.
function renglones(lineas, moneda) {
  return lineas.map((l) => `
    <tr>
      <td>${esc(l.descripcion)}</td>
      <td class="num">${Number(l.cantidad)}</td>
      <td class="num">${dinero(l.precio, moneda)}</td>
      <td class="num">${dinero(l.total, moneda)}</td>
    </tr>`).join('');
}

function facturaCartaHtml({ workshop, invoice, cliente, lineas, referencia, moto }) {
  const moneda = workshop.currency;
  const electronica = invoice.kind === 'electronic';

  // `invoice.subtotal` ya viene con el descuento aplicado -- así lo guardan
  // las dos rutas de emisión. La tabla no guarda el descuento por separado,
  // así que se deduce: suma de los renglones menos el subtotal. Es la única
  // forma de mostrarlo como renglón propio, que es como lo pide la
  // contabilidad, sin cambiar el esquema.
  const bruto = lineas.reduce((suma, l) => suma + Number(l.total), 0);
  const descuento = Math.max(0, Math.round(bruto - Number(invoice.subtotal)));

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(invoice.document_type_name || 'Factura')} ${esc(invoice.doc_number || '')}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2024;
       max-width:760px;margin:24px auto;padding:0 20px;font-size:13px;line-height:1.45}
  .cabecera{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;
            border-bottom:2px solid #1f2024;padding-bottom:14px;margin-bottom:18px}
  .emisor{font-size:12px;color:#555}
  .emisor .nombre{font-size:16px;font-weight:700;color:#1f2024;margin-bottom:2px}
  .logo{max-width:80px;max-height:80px;object-fit:contain;margin-bottom:8px}
  .doc{text-align:right;min-width:220px}
  .doc .titulo{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
  /* El codigo y el numero van en filas separadas y rotuladas. Pegarlos en
     una sola cadena es justo lo que habia que dejar de hacer. */
  .doc table{margin-left:auto;margin-top:8px;border-collapse:collapse;font-size:12px}
  .doc td{padding:2px 0 2px 12px;text-align:right}
  .doc td.k{color:#666;text-align:left;padding-left:0}
  .doc .numero{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
  .partes{display:flex;gap:28px;margin-bottom:16px;font-size:12px}
  .partes .bloque{flex:1}
  .partes .rotulo{text-transform:uppercase;font-size:10.5px;letter-spacing:.5px;
                  color:#666;font-weight:600;margin-bottom:3px}
  table.items{width:100%;border-collapse:collapse;margin-bottom:14px}
  table.items th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;
                 color:#666;border-bottom:1.5px solid #1f2024;padding:6px 8px}
  table.items td{padding:6px 8px;border-bottom:1px solid #eee}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  table.items th.num{text-align:right}
  .totales{width:280px;margin-left:auto;border-collapse:collapse}
  .totales td{padding:3px 0}
  .totales td.num{font-variant-numeric:tabular-nums}
  .totales tr.total td{border-top:2px solid #1f2024;padding-top:7px;font-weight:700;font-size:15px}
  .cufe{margin-top:22px;padding-top:10px;border-top:1px solid #ddd;
        font-size:10.5px;color:#666;word-break:break-all}
  .cufe b{color:#1f2024}
  .pie{margin-top:26px;font-size:11px;color:#888;text-align:center}
  @media print{ body{margin:0;max-width:none} }
</style></head><body>

<div class="cabecera">
  <div class="emisor">
    ${workshop.logo_url
      ? `<img class="logo" src="/api/public/workshop/${esc(workshop.id)}/logo" alt="">` : ''}
    <div class="nombre">${esc(workshop.legal_name || workshop.name || '')}</div>
    ${workshop.tax_id ? `<div>NIT ${esc(workshop.tax_id)}</div>` : ''}
    ${workshop.address ? `<div>${esc(workshop.address)}</div>` : ''}
    <div>${[workshop.city, workshop.phone].filter(Boolean).map(esc).join(' · ')}</div>
    ${workshop.email ? `<div>${esc(workshop.email)}</div>` : ''}
  </div>

  <div class="doc">
    <div class="titulo">${esc(invoice.document_type_name || 'Factura de venta')}</div>
    <table>
      <tr><td class="k">Código de facturación</td>
          <td>${esc(invoice.document_type_code || '—')}</td></tr>
      <tr><td class="k">Número</td>
          <td class="numero">${esc(invoice.doc_number || '')}</td></tr>
      <tr><td class="k">Fecha</td>
          <td>${esc(fechaLarga(invoice.issued_at || invoice.created_at))}</td></tr>
      ${electronica
        ? '<tr><td class="k">Validación</td><td>Electrónica ante la DIAN</td></tr>'
        : '<tr><td class="k">Validación</td><td>No enviada a la DIAN</td></tr>'}
    </table>
  </div>
</div>

<div class="partes">
  <div class="bloque">
    <div class="rotulo">Cliente</div>
    <div><b>${esc(cliente?.nombre || 'Consumidor final')}</b></div>
    ${cliente?.documento ? `<div>${esc(cliente.documento)}</div>` : ''}
    ${cliente?.direccion ? `<div>${esc(cliente.direccion)}</div>` : ''}
    ${cliente?.telefono ? `<div>${esc(cliente.telefono)}</div>` : ''}
    ${cliente?.email ? `<div>${esc(cliente.email)}</div>` : ''}
  </div>
  ${referencia || moto ? `
  <div class="bloque">
    <div class="rotulo">Referencia</div>
    ${referencia ? `<div>${esc(referencia)}</div>` : ''}
    ${moto ? `<div>${esc(moto)}</div>` : ''}
  </div>` : ''}
</div>

<table class="items">
  <thead><tr>
    <th>Descripción</th><th class="num">Cant.</th>
    <th class="num">Valor unitario</th><th class="num">Valor total</th>
  </tr></thead>
  <tbody>${renglones(lineas, moneda)}</tbody>
</table>

<table class="totales">
  <tr><td>Subtotal</td><td class="num">${dinero(bruto, moneda)}</td></tr>
  ${descuento ? `<tr><td>Descuento</td>
    <td class="num">− ${dinero(descuento, moneda)}</td></tr>` : ''}
  ${Number(invoice.tax_total) ? `<tr><td>IVA</td>
    <td class="num">${dinero(invoice.tax_total, moneda)}</td></tr>` : ''}
  <tr class="total"><td>Total</td><td class="num">${dinero(invoice.total, moneda)}</td></tr>
</table>

${electronica && invoice.cufe ? `
<div class="cufe">
  <b>CUFE:</b> ${esc(invoice.cufe)}<br>
  Documento validado electrónicamente por la DIAN.
</div>` : ''}

${!electronica ? `
<div class="pie">
  Este documento no constituye factura electrónica de venta ante la DIAN.
</div>` : ''}

<script>window.print()<\/script>
</body></html>`;

  return html;
}

// ── Tirilla térmica ───────────────────────────────────────────────────────
//
// Mismo documento, otra hoja. Aquí no caben columnas: en 58 mm entran unos
// 32 caracteres. Cada renglón va en dos líneas -- descripción arriba,
// "cantidad × precio" y total abajo -- en vez de apretar cuatro columnas
// hasta que no se lea nada.
//
// Sin logo: en una térmica de 203 ppp una imagen sale sucia y lenta, y el
// nombre en negrita cumple la misma función.
function facturaTirillaHtml({ workshop, invoice, cliente, lineas, referencia, moto }, mm) {
  const moneda = workshop.currency;
  const electronica = invoice.kind === 'electronic';
  const bruto = lineas.reduce((suma, l) => suma + Number(l.total), 0);
  const descuento = Math.max(0, Math.round(bruto - Number(invoice.subtotal)));

  // Ancho imprimible real: el papel siempre trae unos milímetros muertos a
  // cada lado. 72 de 80, y 48 de 58, son los valores que usan las térmicas
  // habituales.
  const ancho = mm === '58' ? 48 : 72;
  const cuerpo = mm === '58' ? 10 : 11.5;

  const fila = (etiqueta, valor, fuerte) => `
    <div class="fila${fuerte ? ' fuerte' : ''}"><span>${esc(etiqueta)}</span><span>${valor}</span></div>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(invoice.document_type_name || 'Factura')} ${esc(invoice.doc_number || '')}</title>
<style>
  @page { size: ${ancho}mm auto; margin: 0 }
  *{box-sizing:border-box}
  body{width:${ancho}mm;margin:0;padding:3mm 2mm;
       font-family:"Courier New",ui-monospace,monospace;
       font-size:${cuerpo}px;line-height:1.35;color:#000;-webkit-font-smoothing:none}
  .centro{text-align:center}
  .nombre{font-weight:700;font-size:${cuerpo + 2}px;text-transform:uppercase}
  .sep{border-top:1px dashed #000;margin:5px 0}
  .fila{display:flex;justify-content:space-between;gap:6px}
  .fila span:last-child{white-space:nowrap}
  .fuerte{font-weight:700;font-size:${cuerpo + 2}px}
  .item{margin-bottom:3px}
  .item .desc{word-break:break-word}
  .chico{font-size:${cuerpo - 1}px}
  .cufe{word-break:break-all}
  /* Un margen final: muchas térmicas cortan justo donde termina el papel y
     se comen la última línea. */
  .cola{height:12mm}
</style></head><body>

<div class="centro">
  <div class="nombre">${esc(workshop.legal_name || workshop.name || '')}</div>
  ${workshop.tax_id ? `<div class="chico">NIT ${esc(workshop.tax_id)}</div>` : ''}
  ${workshop.address ? `<div class="chico">${esc(workshop.address)}</div>` : ''}
  <div class="chico">${[workshop.city, workshop.phone].filter(Boolean).map(esc).join(' · ')}</div>
</div>

<div class="sep"></div>

<div class="centro nombre" style="font-size:${cuerpo + 1}px">
  ${esc(invoice.document_type_name || 'Factura de venta')}</div>
${fila('Código', esc(invoice.document_type_code || '—'))}
${fila('Número', `<b>${esc(invoice.doc_number || '')}</b>`)}
${fila('Fecha', esc(fechaLarga(invoice.issued_at || invoice.created_at)))}

<div class="sep"></div>

<div class="chico">
  <div><b>Cliente:</b> ${esc(cliente?.nombre || 'Consumidor final')}</div>
  ${cliente?.documento ? `<div>${esc(cliente.documento)}</div>` : ''}
  ${cliente?.telefono ? `<div>${esc(cliente.telefono)}</div>` : ''}
  ${referencia ? `<div>${esc(referencia)}</div>` : ''}
  ${moto ? `<div>${esc(moto)}</div>` : ''}
</div>

<div class="sep"></div>

${lineas.map((l) => `
  <div class="item">
    <div class="desc">${esc(l.descripcion)}</div>
    <div class="fila chico">
      <span>${Number(l.cantidad)} × ${dinero(l.precio, moneda)}</span>
      <span>${dinero(l.total, moneda)}</span>
    </div>
  </div>`).join('')}

<div class="sep"></div>

${fila('Subtotal', dinero(bruto, moneda))}
${descuento ? fila('Descuento', `− ${dinero(descuento, moneda)}`) : ''}
${Number(invoice.tax_total) ? fila('IVA', dinero(invoice.tax_total, moneda)) : ''}
<div class="sep"></div>
${fila('TOTAL', dinero(invoice.total, moneda), true)}

${electronica && invoice.cufe ? `
<div class="sep"></div>
<div class="chico cufe"><b>CUFE</b><br>${esc(invoice.cufe)}</div>
<div class="chico centro" style="margin-top:4px">Documento validado por la DIAN</div>` : ''}

${!electronica ? `
<div class="sep"></div>
<div class="chico centro">No constituye factura electrónica<br>de venta ante la DIAN.</div>` : ''}

<div class="cola"></div>
<script>window.print()<\/script>
</body></html>`;

  return html;
}

// Abre la ventana de impresión con el formato que tenga configurado este
// equipo. `forzar` deja pedir uno concreto sin tocar la preferencia, para
// el botón de prueba de Ajustes.
export function imprimirFactura(datos, forzar) {
  const formato = forzar || formatoImpresora();
  const html = formato === 'carta'
    ? facturaCartaHtml(datos)
    : facturaTirillaHtml(datos, formato);

  const ventana = window.open('', '_blank');
  // Un bloqueador de ventanas emergentes devuelve null. Decirlo vale más que
  // no hacer nada: quien pulsó "Imprimir" se queda mirando la pantalla.
  if (!ventana) return false;
  ventana.document.write(html);
  ventana.document.close();
  return true;
}
