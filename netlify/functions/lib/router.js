// lib/router.js
//
// Clasificacion simple por palabras clave. Es intencionalmente basica:
// rapida, gratis (no gasta tokens de Claude) y facil de ajustar.
// Si el volumen de mensajes crece y las reglas se quedan cortas,
// se puede reemplazar por una clasificacion con el propio Claude.

const GRUA_URGENTE_NUMBER = process.env.GRUA_RIDERA_PHONE || "+57 300 000 0000"; // ajustar

function classifyIntent(text) {
  const t = text.toLowerCase();

  if (/\b(grua|grúa|varad|accidente|emergencia|choque)\b/.test(t)) {
    return "emergency";
  }
  if (/\b(taller|mecanico|mecánico|reparaci[oó]n)\b/.test(t)) {
    return "taller_search";
  }
  if (/\b(almacen|almacén|repuesto|tienda)\b/.test(t)) {
    return "almacen_search";
  }
  if (/\b(pasaporte|sello|municipio|reto|challenge)\b/.test(t)) {
    return "pasaporte";
  }
  return "general";
}

// Extrae una posible ciudad/termino de busqueda del mensaje quitando
// las palabras de la intencion misma. Heuristica simple.
function extractSearchTerm(text, intent) {
  const stopwords = {
    taller_search: ["taller", "mecanico", "mecánico", "reparación", "reparacion", "en", "de", "cerca"],
    almacen_search: ["almacen", "almacén", "repuesto", "repuestos", "tienda", "en", "de", "cerca"],
  };
  const words = text
    .toLowerCase()
    .replace(/[¿?¡!.,]/g, "")
    .split(/\s+/)
    .filter((w) => !(stopwords[intent] || []).includes(w));

  return words.join(" ").trim();
}

const EMERGENCY_REPLY =
  `Entiendo, esto suena urgente. 🛵🚨\n\n` +
  `Contacta ya a Grúas Ridera: ${GRUA_URGENTE_NUMBER}\n\n` +
  `Cuéntame tu ubicación y qué pasó para poder ayudarte mientras te comunicas con ellos.`;

module.exports = { classifyIntent, extractSearchTerm, EMERGENCY_REPLY };
