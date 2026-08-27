// Redondeo a 2 decimales, evitando el error de coma flotante de JS
// (0.1 + 0.2 = 0.30000000000000004).
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Calcula los totales de una orden o cotización con la misma fórmula en
// todo el sistema: (base − descuento) + impuesto sobre esa base.
export function computeTotals({ laborTotal = 0, partsTotal = 0, discount = 0, taxRate = 0 }) {
  const subtotal = round2(Number(laborTotal) + Number(partsTotal));
  const taxable  = Math.max(round2(subtotal - Number(discount)), 0);
  const taxTotal = round2(taxable * (Number(taxRate) / 100));
  return {
    subtotal,
    labor_total: round2(laborTotal),
    parts_total: round2(partsTotal),
    discount:    round2(discount),
    tax_rate:    Number(taxRate),
    tax_total:   taxTotal,
    total:       round2(taxable + taxTotal)
  };
}
