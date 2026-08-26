import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Diagnóstico temporal: prueba combinaciones de service_id / template_id contra
// la API de EmailJS y devuelve la respuesta literal de cada una, para saber
// cuál identificador es el que la API no reconoce. Los casos inventados sirven
// de control: revelan qué error corresponde a cada tipo de identificador malo.
//
// Borrar una vez resuelta la configuración de EmailJS.

const PUB = Deno.env.get("EMAILJS_PUBLIC_KEY") ?? "SkP6UWJZThu9tdQCc";
const PRIV = Deno.env.get("EMAILJS_PRIVATE_KEY") ?? "";

async function probar(etiqueta: string, service: string, template: string) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: service,
      template_id: template,
      user_id: PUB,
      accessToken: PRIV,
      template_params: {
        from_name: "Diagnostico",
        from_email: "multiservicioslavina@gmail.com",
        to_name: "Diagnostico",
        to_email: "multiservicioslavina@gmail.com",
        telefono: "3226857835",
        asunto: "Diagnostico",
        mensaje: "Prueba de diagnostico.",
        fecha: new Date().toISOString(),
      },
    }),
  });
  const texto = await res.text().catch(() => "");
  return { etiqueta, service, template, status: res.status, respuesta: texto.slice(0, 200) };
}

Deno.serve(async () => {
  const casos: [string, string, string][] = [
    ["interno tal cual", "ridera-contacto", "7qkjo5c"],
    ["reply tal cual", "ridera-contacto", "8w8ecf8"],
    ["interno con prefijo", "ridera-contacto", "template_7qkjo5c"],
    ["servicio inexistente", "servicio_que_no_existe", "7qkjo5c"],
    ["plantilla inexistente", "ridera-contacto", "zzzzzzz"],
  ];
  const resultados = [];
  for (const [etiqueta, s, t] of casos) {
    try { resultados.push(await probar(etiqueta, s, t)); }
    catch (e) { resultados.push({ etiqueta, service: s, template: t, error: String(e) }); }
  }
  return new Response(JSON.stringify({ private_key_presente: PRIV.length > 0, resultados }, null, 1), {
    headers: { "Content-Type": "application/json" },
  });
});
