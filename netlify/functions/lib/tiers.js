// lib/tiers.js
//
// Define los "niveles" de Rita. Se elige con la variable de entorno
// RITA_TIER (basico | avanzado | maximo). Default: basico.
//
// Cambiar de nivel es solo cambiar esta variable en Netlify, no requiere
// tocar código ni duplicar el proyecto.

const TIERS = {
  basico: {
    label: "Básico",
    model: "claude-haiku-4-5-20251001",
    maxTokens: 280,
    historyMessages: 4,
    description: "Rápido y económico. Ideal para volumen alto de mensajes simples.",
  },
  avanzado: {
    label: "Avanzado",
    // Haiku para búsquedas puntuales (taller/almacén), Sonnet para todo lo demás
    model: "claude-sonnet-5",
    searchModel: "claude-haiku-4-5-20251001",
    maxTokens: 450,
    historyMessages: 8,
    description: "Mejor razonamiento en preguntas abiertas, más memoria de conversación.",
  },
  maximo: {
    label: "Máximo",
    model: "claude-opus-4-8",
    searchModel: "claude-opus-4-8",
    maxTokens: 600,
    historyMessages: 12,
    description: "El mejor modelo disponible para todo. Mayor costo por mensaje.",
  },
};

function getTierConfig() {
  const tierName = (process.env.RITA_TIER || "basico").toLowerCase();
  return TIERS[tierName] || TIERS.basico;
}

module.exports = { TIERS, getTierConfig };
