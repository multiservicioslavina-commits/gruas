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
function toSlug(s: string, suffix = ""): string {
  const base = s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,50)||"gruero";
  return suffix ? `${base}-${suffix}` : base;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok:false, error:"Method not allowed" }, 405);
  try {
    const data = await req.json().catch(()=>({}));
    const nombre = String(data.nombre??"?").trim();
    // Accept email from multiple field names sent by WordPress
    const emailIn = String(
      data.email ?? data.correo ?? data.email_gruero ?? data.correo_gruero ?? ""
    ).trim();
    if (!nombre) return json({ ok:false, error:"Falta nombre" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Buscar gruero por nombre (más reciente)
    const { data:gruero } = await supabase.from("grueros").select("id,nombre,email,slug,auth_id")
      .ilike("nombre",nombre).order("created_at",{ascending:false}).limit(1).single();
    if (!gruero) return json({ ok:false, error:"Gruero no encontrado" }, 404);

    // Slug único
    let slug = gruero.slug || toSlug(nombre);
    if (!gruero.slug) {
      const { data:ex } = await supabase.from("grueros").select("id").eq("slug",slug).neq("id",gruero.id).maybeSingle();
      if (ex) slug = toSlug(nombre, String(Date.now()).slice(-4));
    }

    // Crear cuenta Auth si tiene email y aún no tiene
    const grueroEmail = emailIn || gruero.email || "";
    let auth_id = gruero.auth_id;
    let auth_created = false;

    if (grueroEmail.includes("@") && !auth_id) {
      // inviteUserByEmail crea el usuario Y envía el email de bienvenida automáticamente
      const { data:inv, error:invErr } = await supabase.auth.admin.inviteUserByEmail(grueroEmail, {
        data: { nombre, gruero_id: gruero.id },
        redirectTo: "https://gruas.ridera.com.co/mi-cuenta.html",
      });
      if (!invErr && inv?.user) {
        auth_id = inv.user.id;
        auth_created = true;
      }
    }

    // Actualizar gruero
    await supabase.from("grueros").update({
      aprobado: "SI", disponible: true, slug,
      auth_id: auth_id ?? null,
      email: grueroEmail || gruero.email,
    }).eq("id", gruero.id);

    return json({ ok:true, gruero_id:gruero.id, slug, auth_created });
  } catch(e) {
    return json({ ok:false, error:String(e) }, 500);
  }
});
