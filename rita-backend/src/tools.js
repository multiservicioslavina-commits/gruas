const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function searchMunicipios(query) {
  const url = `${SUPABASE_URL}/rest/v1/municipios?select=nombre,subregion,zona_dificultad,puntos_sello,historia,lat,lon,es_fluvial&nombre=ilike.*${encodeURIComponent(query)}*&limit=5`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getMunicipiosBySubregion(subregion) {
  const url = `${SUPABASE_URL}/rest/v1/municipios?select=nombre,zona_dificultad,puntos_sello&subregion=ilike.*${encodeURIComponent(subregion)}*&order=nombre&limit=20`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function webSearch(query) {
  // Use DuckDuckGo instant answer API (free, no key needed)
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' Colombia')}&format=json&no_html=1&skip_disambig=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.AbstractText) return data.AbstractText;
    if (data.RelatedTopics?.[0]?.Text) {
      return data.RelatedTopics.slice(0, 3).map(t => t.Text).join('\n');
    }
    return null;
  } catch {
    return null;
  }
}

// Tool definitions for Claude
export const TOOL_DEFINITIONS = [
  {
    name: 'buscar_municipio',
    description: 'Busca información sobre un municipio de Antioquia (Colombia): historia, subregión, dificultad de ruta, puntos de sello para el pasaporte motero.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del municipio a buscar' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'municipios_por_subregion',
    description: 'Lista los municipios de una subregión de Antioquia. Subregiones disponibles: Valle de Aburrá, Oriente, Occidente, Suroeste, Norte, Nordeste, Bajo Cauca, Magdalena Medio, Urabá.',
    input_schema: {
      type: 'object',
      properties: {
        subregion: { type: 'string', description: 'Nombre de la subregión' },
      },
      required: ['subregion'],
    },
  },
  {
    name: 'buscar_web',
    description: 'Busca información general en internet sobre un lugar, evento, restaurante, o cualquier tema relacionado con Colombia y motociclismo.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto de búsqueda' },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(name, input) {
  switch (name) {
    case 'buscar_municipio':
      return await searchMunicipios(input.nombre);
    case 'municipios_por_subregion':
      return await getMunicipiosBySubregion(input.subregion);
    case 'buscar_web':
      return await webSearch(input.query);
    default:
      return { error: 'Tool not found' };
  }
}
