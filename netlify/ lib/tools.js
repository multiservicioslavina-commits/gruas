// lib/tools.js
//
// Herramientas que Rita puede usar via Tool Use de Claude.
// Haiku decide CUÁL herramienta usar, la ejecuta, y Sonnet/Opus redacta la respuesta final.
//

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// DEFINICIÓN DE HERRAMIENTAS (lo que le pasamos a Claude)
// ============================================================================

const TOOLS_DEFINITION = [
  {
    name: "search_taller",
    description:
      "Busca talleres en el directorio de Ridera. Devuelve hasta 5 resultados ordenados por relevancia o proximidad.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre del taller, ciudad, o tipo de servicio (ej: 'Bogotá', 'cambio aceite')",
        },
        latitude: {
          type: "number",
          description: "Latitud del usuario (opcional, para búsqueda por proximidad)",
        },
        longitude: {
          type: "number",
          description: "Longitud del usuario (opcional, para búsqueda por proximidad)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_almacen",
    description:
      "Busca almacenes de repuestos/motos en Ridera. Similar a search_taller pero para almacenes.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre del almacén, ciudad, o tipo de repuesto (ej: 'Medellín', 'neumáticos')",
        },
        latitude: {
          type: "number",
          description: "Latitud del usuario (opcional)",
        },
        longitude: {
          type: "number",
          description: "Longitud del usuario (opcional)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_grua",
    description: "Busca grúas de emergencia. Devuelve las más cercanas al usuario si tienes su ubicación.",
    input_schema: {
      type: "object",
      properties: {
        latitude: {
          type: "number",
          description: "Latitud del usuario (importante para emergencias)",
        },
        longitude: {
          type: "number",
          description: "Longitud del usuario (importante para emergencias)",
        },
        municipio: {
          type: "string",
          description: "Municipio (si no tienes coordenadas)",
        },
      },
      required: [],
    },
  },
  {
    name: "create_cita",
    description:
      "Crea una solicitud de cita en un taller. Guarda en BD para que el taller pueda verla.",
    input_schema: {
      type: "object",
      properties: {
        taller_wp_id: {
          type: "integer",
          description: "ID del taller en WordPress",
        },
        fecha_solicitada: {
          type: "string",
          description: "Fecha deseada (YYYY-MM-DD)",
        },
