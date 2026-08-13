// netlify/functions/extraer-catalogo.js
//
// Recibe una URL (página/catálogo del almacén) o texto plano (pegado o
// extraído de un archivo) y le pide a Claude que lo convierta en una
// lista estructurada de productos. El dueño del almacén revisa/confirma
// el resultado en el navegador antes de que se guarde nada.
//
// Variables de entorno requeridas:
//   ANTHROPIC_API_KEY

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_INPUT_CHARS = 18000; // limite razonable de contenido a mandarle a Claude

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const { url, texto } = body;

  if (!url && !texto) {
    return json(400, { error: "Manda una URL o un texto para leer." });
  }

  try {
    let contenido = texto || "";

    if (url) {
      contenido = await fetchPageText(url);
    }

    contenido = contenido.slice(0, MAX_INPUT_CHARS);

    if (!contenido.trim()) {
      return json(400, { error: "No encontré contenido para leer ahí." });
    }

    const productos = await extraerProductos(contenido);

    if (!productos.length) {
      return json(200, { productos: [], warning: "No encontré productos reconocibles en ese contenido." });
    }

    return json(200, { productos });
  } catch (err) {
    console.error("extraer-catalogo error:", err);
    return json(500, { error: err.message || "No se pudo procesar el catálogo." });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

async function fetchPageText(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Esa URL no es válida.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Esa URL no es válida.");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RideraBot/1.0)" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`No pude abrir esa página (${res.status}).`);
  }

  const html = await res.text();
  return htmlToText(html);
}

// Conversion basica de HTML a texto: saca scripts/estilos y etiquetas,
// deja el contenido visible para que Claude lo interprete.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|p|div|li|tr|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function extraerProductos(contenido) {
  const systemPrompt = `Eres un extractor de catálogos de productos para repuestos y accesorios de motos.
Recibes texto (de una página web o un archivo) y debes encontrar los productos que se venden ahí.
Responde SOLO con un array JSON válido, sin texto antes ni después, sin markdown. Cada elemento:
{"nombre": string, "categoria": string, "precio": number|null, "descripcion": string|null, "stock": number|null}
Reglas:
- "precio" en pesos colombianos, solo el número (sin $, sin puntos de miles, sin texto). Si no hay precio claro, usa null.
- "categoria" corta (ej: "Filtros", "Cascos", "Lubricantes"). Si no es clara, usa "General".
- Si no encuentras productos reales, responde con un array vacío: []
- No inventes productos que no estén en el texto.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: `Contenido a analizar:\n\n${contenido}` }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude no pudo procesar el catálogo (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  const raw = textBlock?.text || "[]";

  return parseProductosJson(raw);
}

function parseProductosJson(raw) {
  // Claude a veces envuelve el JSON en ```json ... ``` a pesar de la instruccion.
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((p) => p && typeof p === "object" && p.nombre)
    .map((p) => ({
      nombre: String(p.nombre).slice(0, 200),
      categoria: p.categoria ? String(p.categoria).slice(0, 100) : "General",
      precio: typeof p.precio === "number" ? p.precio : null,
      descripcion: p.descripcion ? String(p.descripcion).slice(0, 500) : null,
      stock: typeof p.stock === "number" ? p.stock : null,
    }))
    .slice(0, 200); // limite de seguridad
}
