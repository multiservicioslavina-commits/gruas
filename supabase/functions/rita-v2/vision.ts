// ─────────────────────────────────────────────────────────────────
// Rita v2 — Vision: describir fotos que manda el rider
//
// Hasta ahora rita-v2 solo entendia texto, audio y ubicacion -- una foto
// (la luz del tablero prendida, una pieza dañada, el estado de una via,
// el SOAT) caia en el "tipo no soportado" y se ignoraba por completo, sin
// avisarle nada al rider.
//
// Gemini es el especialista de esto: es el unico de los tres proveedores
// del orquestador (OpenAI primario, Claude auditor/fallback) que ya esta
// integrado con vision + su propio grounding de busqueda, y activarlo es
// opcional -- exactamente como la voz (ElevenLabs/OpenAI): sin
// GEMINI_API_KEY configurada, Rita simplemente no puede ver fotos y se
// lo dice al rider en vez de fallar en silencio.
//
// La descripcion que devuelve NO se trata como un hecho verificado: se
// marca explicitamente al entrar al resto del pipeline (ver el mensaje
// que arma describirFoto -- lo consume buildSystemPrompt en index.ts)
// para que Rita nunca la presente como un diagnostico confirmado.
// ─────────────────────────────────────────────────────────────────

const GEMINI_KEY = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();

export const puedeVer = () => Boolean(GEMINI_KEY);

// Prompt deliberadamente pide describir, no diagnosticar: un modelo de
// vision puede confundir piezas o no ver bien una foto oscura/borrosa, y
// una "certeza" inventada aca es tan peligrosa como cualquier otro dato
// inventado (misma REGLA ABSOLUTA que el resto de Rita).
const INSTRUCCION_VISION = `Describe en espanol, en 2 a 4 lineas, lo que se ve en esta foto que un
motociclista colombiano le mando a un asistente de WhatsApp. Se concreto: marca/color/estado visible
de una moto o pieza, texto legible de un documento o tablero, gravedad aparente de un daño o
accidente. Si la foto esta borrosa, oscura o no se distingue bien algo, dilo explicitamente en vez de
adivinar. NUNCA des un diagnostico mecanico definitivo ("se dañó el kit de arrastre") -- describe lo
que se observa ("la cadena se ve floja/oxidada") y deja que un mecanico confirme la causa real.`;

// Uint8Array -> base64 en trozos: pasarle el arreglo completo a
// String.fromCharCode(...imagen) revienta el limite de argumentos del
// motor JS con una foto de varios MB (mismo patron ya usado en
// rita-whatsapp/index.ts para su propio describeImage).
function aBase64(bytes: Uint8Array): string {
  let binario = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binario);
}

export async function describirFoto(imagen: Uint8Array, mimeType: string, caption?: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY no configurada");

  const base64 = aBase64(imagen);
  const partes: Record<string, unknown>[] = [
    { text: caption ? `${INSTRUCCION_VISION}\n\nEl rider escribio junto a la foto: "${caption}"` : INSTRUCCION_VISION },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }] }),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = await res.json();
  const texto = ((data.candidates?.[0]?.content?.parts ?? []) as { text?: string }[])
    .map(p => p.text ?? "")
    .join("")
    .trim();
  if (!texto) throw new Error("Gemini vision no devolvio texto");
  return texto;
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
