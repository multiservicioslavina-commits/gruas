import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function sb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Always store marcas/rutas as comma-separated strings so the public widget can use .split(',')
function toCSV(val: unknown): string {
  if (Array.isArray(val)) return val.filter(Boolean).join(',');
  if (typeof val === 'string') return val.trim();
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Metodo no permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const nombre = (body.nombre || "").trim();
    if (!nombre) return json({ ok: false, error: "El nombre del club es obligatorio" }, 400);

    const datos: Record<string, any> = {
      lider: (body.lider || "").trim(),
      lider_tel: (body.lider_tel || body.whatsapp || "").trim(),
      whatsapp: (body.whatsapp || "").trim(),
      email: (body.email || "").trim(),
      descripcion: (body.descripcion || "").trim(),
      fundacion: (body.fundacion || "").trim(),
      miembros: (body.miembros || "").trim(),
      marcas: toCSV(body.marcas),
      rutas: toCSV(body.rutas),
      facebook: (body.facebook || "").trim(),
      instagram: (body.instagram || "").trim(),
      web: (body.web || "").trim(),
      notas: (body.notas || "").trim(),
    };
    for (const k of Object.keys(datos)) {
      if (datos[k] === "") delete datos[k];
    }

    const supabase = sb();

    // Check duplicate codigo
    const codigo = (body.codigo || "").trim().toUpperCase() || null;
    if (codigo) {
      const { data: existing } = await supabase.from("clubs").select("id").eq("codigo", codigo).maybeSingle();
      if (existing) return json({ ok: false, error: "Ya existe un club con ese codigo. Elige otro." }, 409);
    }

    const { data: club, error } = await supabase.from("clubs").insert({
      nombre,
      ciudad: (body.ciudad || "").trim() || null,
      codigo,
      logo_url: (body.logo_url || "").trim() || null,
      lider_id: body.lider_id || null,
      datos,
      aprobado: false,
    }).select("id, nombre").single();

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return json({ ok: false, error: "Ya existe un club con ese codigo. Elige otro." }, 409);
      }
      return json({ ok: false, error: error.message }, 500);
    }

    // Notify via webhook if configured
    const notifUrl = Deno.env.get("NOTIF_WEBHOOK");
    if (notifUrl) {
      fetch(notifUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "nuevo_club", nombre, ciudad: body.ciudad, lider: datos.lider }),
      }).catch(() => {});
    }

    return json({ ok: true, id: club.id, nombre: club.nombre, estado: "pendiente" });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
