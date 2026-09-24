// ─────────────────────────────────────────────────────────────────
// Rita v2 — Vision: fotos y documentos (PDF) que manda el rider
//
// Hasta ahora rita-v2 solo entendia texto, audio y ubicacion -- una foto
// (la luz del tablero prendida, una pieza dañada, el estado de una via) o
// un PDF (SOAT, tecnomecanica) caian en el "tipo no soportado" y se
// ignoraban por completo, sin avisarle nada al rider. La funcion hermana
// rita-whatsapp SI intenta fotos (via OpenAI) pero le dice explicitamente
// al rider "por ahora no puedo leer PDFs directamente" -- ese es un hueco
// real y confirmado, no hipotetico.
//
// Gemini es el especialista de esto: es el unico de los tres proveedores
// del orquestador (OpenAI primario, Claude auditor/fallback) que ya esta
// integrado con vision + su propio grounding de busqueda, y ademas
// entiende PDFs de forma nativa (cada pagina como imagen + su texto) sin
// pasar por un servicio de OCR aparte. Activarlo es opcional -- exactamente
// como la voz (ElevenLabs/OpenAI): sin GEMINI_API_KEY configurada, Rita
// simplemente no puede ver fotos ni leer PDFs y se lo dice al rider en vez
// de fallar en silencio.
//
// Lo que devuelve NO se trata como un hecho verificado: se marca
// explicitamente al entrar al resto del pipeline (ver los mensajeDesdeX
// de abajo -- lo consume buildSystemPrompt en index.ts) para que Rita
// nunca lo presente como un diagnostico o un dato confirmado.
//
// Cada llamada a Gemini queda registrada en rita_ai_logs via uso_ia.ts
// (tokens, costo estimado, tipo "vision_foto"/"vision_documento") -- antes
// de esto Gemini no dejaba ningun rastro de costo, y el tope de gasto
// diario de IA (verificarPresupuesto en ia.ts) no lo veia.
// ─────────────────────────────────────────────────────────────────

import { registrarUsoIA } from "./uso_ia.ts";

const GEMINI_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
const MODELO = "gemini-2.5-flash";

export const puedeVer = () => Boolean(GEMINI_KEY);

// PDF puro (application/pdf); una foto de un documento (JPEG/PNG) ya la
// cubre describirFoto -- no hace falta un camino aparte para eso.
export const MIME_PDF = "application/pdf";

// Prompt deliberadamente pide describir, no diagnosticar: un modelo de
// vision puede confundir piezas o no ver bien una foto oscura/borrosa, y
// una "certeza" inventada aca es tan peligrosa como cualquier otro dato
// inventado (misma REGLA ABSOLUTA que el resto de Rita).
const INSTRUCCION_FOTO = `Describe en espanol, en 2 a 4 lineas, lo que se ve en esta foto que un
motociclista colombiano le mando a un asistente de WhatsApp. Se concreto: marca/color/estado visible
de una moto o pieza, texto legible de un documento o tablero, gravedad aparente de un daño o
accidente. Si la foto esta borrosa, oscura o no se distingue bien algo, dilo explicitamente en vez de
adivinar. NUNCA des un diagnostico mecanico definitivo ("se dañó el kit de arrastre") -- describe lo
que se observa ("la cadena se ve floja/oxidada") y deja que un mecanico confirme la causa real.`;

// Los PDF que manda un rider suelen ser SOAT/tecnomecanica/licencia/factura/
// comparendo -- documentos donde una placa, fecha o valor mal leido puede
// costarle una multa o un tramite fallido. Por eso, a diferencia de la foto
// (donde "describe lo que ves" ya es suficientemente conservador), aca se le
// exige explicitamente no adivinar un dato que no se lea con claridad.
const INSTRUCCION_DOCUMENTO = `Este es un documento (PDF) que un motociclista colombiano le mando a un
asistente de WhatsApp -- probablemente SOAT, tecnomecanica, licencia de conduccion, tarjeta de
propiedad, una factura o un comparendo. Extrae en espanol, de forma concreta: tipo de documento,
numero de placa si aparece, fecha de vencimiento o expedicion, valores en pesos si aparecen, y
cualquier otro dato clave legible. Si el texto esta borroso, incompleto o el documento tiene varias
paginas y no alcanzas a leer alguna, dilo explicitamente. NUNCA inventes ni redondees una fecha, placa
o valor que no puedas leer con claridad -- un dato equivocado aca le puede costar una multa real al
rider.`;

// Uint8Array -> base64 en trozos: pasarle el arreglo completo a
// String.fromCharCode(...datos) revienta el limite de argumentos del
// motor JS con un archivo de varios MB (mismo patron ya usado en
// rita-whatsapp/index.ts para su propio describeImage).
function aBase64(bytes: Uint8Array): string {
  let binario = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binario);
}

// Llamada compartida a Gemini: misma forma para una foto o un PDF, solo
// cambia la instruccion y el mime_type del inline_data. Registra el uso
// (tokens/costo) en rita_ai_logs via uso_ia.ts -- antes de esto Gemini no
// dejaba ningun rastro de costo ahi, y verificarPresupuesto() (el tope de
// gasto diario en ia.ts) suma exactamente esa tabla.
async function llamarGeminiConArchivo(
  instruccion: string, datos: Uint8Array, mimeType: string, phone: string, tipo: string, caption?: string,
): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY no configurada");

  const base64 = aBase64(datos);
  const partes: Record<string, unknown>[] = [
    { text: caption ? `${instruccion}\n\nEl rider escribio junto al archivo: "${caption}"` : instruccion },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }] }),
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = await res.json();

  // Se registra el uso antes de validar el texto: Gemini ya cobro la
  // llamada aunque el resultado venga vacio, y si el texto vacio hace
  // que las lineas de abajo lancen, el registro ya quedo guardado.
  const usage = data.usageMetadata ?? {};
  await registrarUsoIA(phone, "gemini", MODELO, usage.promptTokenCount ?? 0, usage.candidatesTokenCount ?? 0, tipo);

  const texto = ((data.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
    .map(p => p.text ?? "")
    .join("")
    .trim();
  if (!texto) throw new Error("Gemini no devolvio texto");
  return texto;
}

export async function describirFoto(imagen: Uint8Array, mimeType: string, phone: string, caption?: string): Promise<string> {
  return await llamarGeminiConArchivo(INSTRUCCION_FOTO, imagen, mimeType, phone, "vision_foto", caption);
}

export async function describirDocumento(pdf: Uint8Array, mimeType: string, phone: string, caption?: string): Promise<string> {
  return await llamarGeminiConArchivo(INSTRUCCION_DOCUMENTO, pdf, mimeType, phone, "vision_documento", caption);
}

// Arma el mensaje que entra al resto del pipeline exactamente como si el
// rider lo hubiera escrito, pero marcado para que el system prompt y el
// auditor sepan que es una interpretacion de IA sobre una foto, no un
// dato verificado ni las palabras literales del rider.
export function mensajeDesdeFoto(descripcion: string, caption?: string): string {
  const partes = [
    caption ? caption.trim() : null,
    `[Foto adjunta -- descripcion generada por IA de vision (Gemini), puede tener errores: ${descripcion}]`,
  ].filter(Boolean);
  return partes.join("\n\n");
}

// Mismo principio que mensajeDesdeFoto, para un PDF: la lectura de Gemini
// nunca se confunde con las palabras del rider ni con un dato verificado.
export function mensajeDesdeDocumento(lectura: string, caption?: string): string {
  const partes = [
    caption ? caption.trim() : null,
    `[Documento adjunto (PDF) -- lectura generada por IA de vision (Gemini), puede tener errores: ${lectura}]`,
  ].filter(Boolean);
  return partes.join("\n\n");
}
