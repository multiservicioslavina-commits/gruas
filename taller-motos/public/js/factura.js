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
import { esc } from './ui.js';

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

export function imprimirFactura({ workshop, invoice, cliente, lineas, referencia, moto }) {
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

  const ventana = window.open('', '_blank');
  // Un bloqueador de ventanas emergentes devuelve null. Decirlo vale más que
  // no hacer nada: quien pulsó "Imprimir" se queda mirando la pantalla.
  if (!ventana) return false;
  ventana.document.write(html);
  ventana.document.close();
  return true;
}
