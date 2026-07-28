// ─────────────────────────────────────────────────────────────────
// Rita v2 — Voz: transcripcion y sintesis
//
// Dos proveedores tras una sola interfaz. Se elige por las claves que
// haya configuradas, en este orden:
//
//   1. ElevenLabs  (ELEVENLABS_API_KEY)  — el que pide la spec
//   2. OpenAI      (OPENAI_API_KEY)      — respaldo
//   3. Ninguno                           — Rita responde por texto
//
// Si no hay ninguna clave, hablar por voz simplemente no ocurre y la
// conversacion sigue por escrito. Nada revienta.
// ─────────────────────────────────────────────────────────────────

const ELEVEN_KEY   = (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim();
const ELEVEN_VOICE = (Deno.env.get("ELEVENLABS_VOICE_ID") ?? "").trim();
const OPENAI_KEY   = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();

// Voz por defecto de ElevenLabs si no configuran una propia.
// "Sarah" — femenina, calida, sirve para espanol.
const VOZ_POR_DEFECTO = "EXAVITQu4vr4xnSDxMaL";

export type Proveedor = "elevenlabs" | "openai" | "ninguno";

export function proveedorVoz(): Proveedor {
  if (ELEVEN_KEY) return "elevenlabs";
  if (OPENAI_KEY) return "openai";
  return "ninguno";
}

export const puedeEscuchar = () => proveedorVoz() !== "ninguno";
export const puedeHablar   = () => proveedorVoz() !== "ninguno";

// ─── Transcripcion ──────────────────────────────────────────────
export async function transcribir(audio: Uint8Array, mimeType: string): Promise<string> {
  const ext = mimeType.includes("mp4") ? "m4a" : "ogg";
  const archivo = new Blob([audio], { type: mimeType });

  if (ELEVEN_KEY) {
    const form = new FormData();
    form.append("file", archivo, `audio.${ext}`);
    form.append("model_id", "scribe_v1");
    form.append("language_code", "spa");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json())?.text ?? "";
  }

  if (OPENAI_KEY) {
    const form = new FormData();
    form.append("file", archivo, `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`OpenAI STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json())?.text ?? "";
  }

  throw new Error("No hay proveedor de transcripcion configurado");
}

// ─── Sintesis ───────────────────────────────────────────────────
// WhatsApp exige las notas de voz en OGG con codec Opus.
export async function sintetizar(texto: string): Promise<Uint8Array> {
  if (ELEVEN_KEY) {
    const voz = ELEVEN_VOICE || VOZ_POR_DEFECTO;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: texto,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  if (OPENAI_KEY) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: texto,
        response_format: "opus",
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  throw new Error("No hay proveedor de sintesis configurado");
}