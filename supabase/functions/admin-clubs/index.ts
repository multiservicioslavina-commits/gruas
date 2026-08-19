import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function sb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function currentPassword(supabase: any): Promise<string> {
  const { data } = await supabase.from("admin_config").select("password").eq("id", 1).single();
  return data?.password ?? (Deno.env.get("ADMIN_KEY") ?? "ridera-admin-2026");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = sb();
    const pass = await currentPassword(supabase);
    if (body.key !== pass) return json({ ok: false, error: "Clave incorrecta" }, 401);

    if (body.action === "list") {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, nombre, codigo, ciudad, logo_url, aprobado, created_at, datos, foto1_url, foto2_url, foto3_url, lider_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return json({ ok: false, error: error.message }, 500);

      const clubIds = (data || []).map((c: any) => c.id);
      let memberMap: Record<string, number> = {};
      if (clubIds.length) {
        const { data: members } = await supabase.from("club_members").select("club_id").in("club_id", clubIds);
        for (const m of (members || [])) memberMap[m.club_id] = (memberMap[m.club_id] || 0) + 1;
      }

      const liderIds = (data || []).filter((c: any) => c.lider_id).map((c: any) => c.lider_id);
      let liderMap: Record<string, string> = {};
      if (liderIds.length) {
        const { data: riders } = await supabase.from("riders").select("id, nombre").in("id", liderIds);
        for (const r of (riders || [])) liderMap[r.id] = r.nombre;
      }

      const clubs = (data || []).map((c: any) => ({
        ...c,
        miembros: memberMap[c.id] || 0,
        lider_nombre: c.lider_id ? (liderMap[c.lider_id] || "\u2014") : (c.datos?.lider || "\u2014"),
      }));

      const total = clubs.length;
      const pendientes = clubs.filter((c: any) => !c.aprobado).length;
      const aprobados = clubs.filter((c: any) => c.aprobado).length;
      return json({ ok: true, clubs, total, pendientes, aprobados });
    }

    if (body.action === "approve") {
      if (!body.id) return json({ ok: false, error: "Falta id" }, 400);
      const { error } = await supabase.from("clubs").update({ aprobado: true }).eq("id", body.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (body.action === "reject") {
      if (!body.id) return json({ ok: false, error: "Falta id" }, 400);
      const { error } = await supabase.from("clubs").update({ aprobado: false }).eq("id", body.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (body.action === "edit") {
      if (!body.id) return json({ ok: false, error: "Falta id" }, 400);
      const { id, key, action, ...campos } = body;
      if (Object.keys(campos).length === 0) return json({ ok: false, error: "Nada que actualizar" }, 400);
      if (campos.datos && typeof campos.datos === "object") {
        const { data: existing } = await supabase.from("clubs").select("datos").eq("id", id).single();
        campos.datos = { ...(existing?.datos || {}), ...campos.datos };
      }
      const { error } = await supabase.from("clubs").update(campos).eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return json({ ok: false, error: "Falta id" }, 400);
      await supabase.from("club_members").delete().eq("club_id", body.id);
      const { error } = await supabase.from("clubs").delete().eq("id", body.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }

    if (body.action === "create") {
      const { nombre, ciudad, codigo, datos } = body;
      if (!nombre) return json({ ok: false, error: "Falta nombre" }, 400);
      const { data, error } = await supabase.from("clubs").insert({
        nombre, ciudad: ciudad || null, codigo: codigo || null,
        datos: datos || {}, aprobado: false,
      }).select("id").single();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, id: data.id });
    }

    return json({ ok: false, error: "Acción inválida" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
