import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Diagnostico. Reporta si una variable esperada esta configurada; nunca su
// valor, y nunca la lista completa del entorno (esta funcion es publica).
const puesta = (nombre: string) => (Deno.env.get(nombre) ?? "").trim().length > 0;

const ESPERADAS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "WHATSAPP_TOKEN",
  "RITA_PHONE_ID",
  "MAPBOX_TOKEN",
  "REMOTION_SERVE_URL",
  "REMOTION_FUNCTION_NAME",
  "REMOTION_BUCKET",
  "REMOTION_REGION",
];

const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

Deno.serve(() => {
  const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  const ahora = new Date();

  return new Response(JSON.stringify({
    claves: Object.fromEntries(ESPERADAS.map(n => [n, puesta(n)])),
    // Sirve para saber si el codigo que hace new Date().getDay() esta
    // razonando sobre el dia colombiano o sobre el del servidor.
    reloj: {
      zona_del_servidor: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dia_segun_getDay: DIAS[ahora.getDay()],
      hora_local_servidor: ahora.toString(),
      dia_en_colombia: DIAS[Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Bogota", weekday: undefined, hour: "numeric", hour12: false,
      }).format(ahora)) >= 0 ? new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" })).getDay() : 0],
      hora_en_colombia: ahora.toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    },
  }, null, 2), { headers: CORS });
});
