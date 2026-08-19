import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — Recibe el registro de la moto del cliente (CRM) y lo guarda en 'motos'.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}
function cleanDate(v: any): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function toInt(v: any): number | null {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const d = await req.json().catch(() => ({}));
    const contacto_nombre = String(d.contacto_nombre ?? d.nombre ?? "").trim();
    const contacto_whatsapp = normalizePhone(String(d.contacto_whatsapp ?? d.whatsapp ?? d.telefono ?? ""));
    const acepta = d.acepta_comunicaciones === true || d.acepta_comunicaciones === "true" || d.acepta === true;

    if (!contacto_nombre || !contacto_whatsapp) return json({ ok: false, error: "Faltan nombre o WhatsApp" }, 400);
    if (!acepta) return json({ ok: false, error: "Falta la autorización" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const fila = {
      contacto_nombre,
      contacto_whatsapp,
      contacto_email: String(d.contacto_email ?? d.email ?? "").trim() || null,
      placa: (String(d.placa ?? "").trim().toUpperCase().replace(/\s/g, "")) || null,
      marca: String(d.marca ?? "").trim() || null,
      linea: String(d.linea ?? d.modelo ?? "").trim() || null,
      anio: toInt(d.anio ?? d.año),
      cilindraje: String(d.cilindraje ?? "").trim() || null,
      soat_vence: cleanDate(d.soat_vence),
      tecno_vence: cleanDate(d.tecno_vence),
      ultimo_mantenimiento: cleanDate(d.ultimo_mantenimiento),
      km_actual: toInt(d.km_actual),
      propietario_nombre: String(d.propietario_nombre ?? "").trim() || null,
      acepta_comunicaciones: true,
      datos: d,
    };

    const { data: ins, error } = await supabase.from("motos").insert(fila).select("id").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, id: ins.id });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
