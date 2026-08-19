import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ELEVEN_KEY = (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim();

const VOCES: Record<string, string> = {
  rachel: "21m00Tcm4TlvDq8ikWAM",
  drew: "29vD33N1CtxCmqQRPOHJ",
  clyde: "2EiwWnXFnvU5JabPnv8n",
  domi: "AZnzlk1XvdvUeBnXmlld",
  bella: "EXAVITQu4vr4xnSDxMaL",
  custom: "3Fx71T889APcHRu4VtQf",
};

async function probarVoz(nombre: string, voiceId: string, texto: string) {
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: texto,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (res.ok) {
      const audio = new Uint8Array(await res.arrayBuffer());
      return { nombre, voice_id: voiceId, ok: true, bytes: audio.length };
    }
    const err = await res.text();
    return { nombre, voice_id: voiceId, ok: false, status: res.status, error: err.slice(0, 200) };
  } catch (e) {
    return { nombre, voice_id: voiceId, ok: false, error: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req: Request) => {
  const texto = "Ey parce, todo bien? Lista pa rodar!";
  const resultados = [];
  for (const [nombre, id] of Object.entries(VOCES)) {
    resultados.push(await probarVoz(nombre, id, texto));
    if (resultados[resultados.length - 1].ok) break;
  }
  return new Response(JSON.stringify({ texto, resultados }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
