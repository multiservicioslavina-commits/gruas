// Tipos de documento de facturación: el catálogo del taller (10, 1030, o los
// que tenga en su contabilidad).
//
// El código de facturación y el número de factura son dos cosas distintas y
// se muestran como tales: el código dice QUÉ documento es, el número es su
// consecutivo. Lo que antes era una sola cadena ("10-000123") ahora son dos
// campos, `document_type_code` y `doc_number`.
import { api, session } from './api.js';
import { esc, field, toast } from './ui.js';

// Se piden una vez por sesión: es un catálogo que cambia cada varios meses,
// no cada venta. `invalidar()` lo tira cuando Ajustes lo modifica.
let cache = null;

export async function documentTypes() {
  if (!cache) cache = api.get('/workshop/document-types').catch(() => []);
  return cache;
}

export function invalidarDocumentTypes() { cache = null; }

// El desplegable para elegir con qué código se factura, filtrado por si el
// documento va o no a la DIAN: no tiene sentido ofrecer el 1030 en el botón
// de factura normal.
//
// Con un solo tipo disponible no se muestra el desplegable -- que es el caso
// de casi todos los talleres: un campo con una sola opción no es una
// elección, es un estorbo. Se informa cuál se va a usar y ya.
export async function selectorDeCodigo(electronica) {
  const tipos = (await documentTypes()).filter((t) => t.active && t.sends_to_dian === electronica);

  if (!tipos.length) {
    return `<p class="small" style="color:var(--red);margin-bottom:12px">
              No tienes ningún código de facturación ${electronica ? 'electrónica' : 'de venta'}
              configurado. Agrégalo en Ajustes → Facturación.</p>`;
  }
  if (tipos.length === 1) {
    return `<p class="small muted" style="margin-bottom:12px">
              Código de facturación <b>${esc(tipos[0].code)}</b> · ${esc(tipos[0].name)}</p>`;
  }
  return field('document_type_code', 'Código de facturación', {
    value: tipos[0].code,
    options: tipos.map((t) => [t.code, `${t.code} · ${t.name}`]),
    hint: 'Cada código lleva su propia numeración.'
  });
}

// Cómo se muestra una factura ya emitida: código y número separados, que es
// como los pide la contabilidad.
export function etiquetaFactura(invoice) {
  const codigo = invoice.document_type_code
    ? `<span class="mono faint">${esc(invoice.document_type_code)}</span> ` : '';
  return `${codigo}<b>${esc(invoice.doc_number || '')}</b>`;
}

// Versión en texto plano, para un toast o un td sin HTML.
export function textoFactura(invoice) {
  return [invoice.document_type_code, invoice.doc_number].filter(Boolean).join(' · ');
}

// Descarga el PDF oficial que la DIAN le devolvió a Factus. No pasa por
// `api` porque eso devuelve JSON y esto es un archivo binario: hay que leer
// el blob y el nombre de la cabecera.
//
// Vive aquí y no en cada vista porque lo usan las órdenes y las ventas de
// mostrador, y era justamente lo que faltaba en ventas: se podía emitir la
// factura electrónica pero no había cómo bajar el documento.
export function conectarDescargaPdf(raiz = document) {
  raiz.querySelectorAll('[data-invoice-pdf]').forEach((button) => {
    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparando…';
      try {
        const res = await fetch(`/api/invoices/${button.dataset.invoicePdf}/pdf`, {
          headers: { Authorization: `Bearer ${session.token}` }
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo descargar');
        const cabecera = res.headers.get('Content-Disposition') || '';
        const nombre = (cabecera.match(/filename="([^"]+)"/) || [])[1] || 'factura.pdf';
        const url = URL.createObjectURL(await res.blob());
        const enlace = document.createElement('a');
        enlace.href = url; enlace.download = nombre;
        document.body.appendChild(enlace); enlace.click(); enlace.remove();
        URL.revokeObjectURL(url);
      } catch (err) { toast(err.message, true); }
      button.disabled = false;
      button.textContent = original;
    });
  });
}
