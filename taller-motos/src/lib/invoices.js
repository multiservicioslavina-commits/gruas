// Código de factura a mostrar: la electrónica ya trae el suyo (el que le
// asignó Factus); la normal no tiene autoridad externa, así que se arma uno
// con su consecutivo interno, con el tipo de documento como prefijo
// (10 = venta normal), igual que en un ERP tradicional.
export function docCode(invoice) {
  return invoice.kind === 'electronic'
    ? invoice.external_id
    : `10-${String(invoice.number).padStart(6, '0')}`;
}
