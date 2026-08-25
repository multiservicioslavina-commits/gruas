import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
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
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // GET público por slug
  if (req.method === "GET" && slug) {
    const { data, error } = await supabase.from("grueros")
      .select("id,nombre,slug,ciudad,municipios,datos,disponible,aprobado,email,telefono,created_at")
      .eq("slug", slug).eq("aprobado", "SI").single();
    if (error || !data) return json({ ok: false, error: "Gruero no encontrado" }, 404);

    // Calificación promedio pública
    const { data: sols } = await supabase.from("solicitudes")
      .select("calificacion")
      .eq("gruero_asignado", data.id)
      .not("calificacion", "is", null);
    const cals = (sols ?? []).map((s: any) => Number(s.calificacion)).filter(n => n > 0);
    const calificacion_promedio = cals.length
      ? Number((cals.reduce((a: number, b: number) => a + b, 0) / cals.length).toFixed(1))
      : null;
    const total_servicios = (await supabase.from("solicitudes").select("id", { count: "exact", head: true }).eq("gruero_asignado", data.id)).count ?? 0;

    return json({ ok: true, gruero: data, stats: { calificacion_promedio, total_calificaciones: cals.length, total_servicios } });
  }

  // Auth requerida para el resto
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return json({ ok: false, error: "No autorizado" }, 401);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ ok: false, error: "Token inválido" }, 401);

  const { data: gruero, error: gErr } = await supabase.from("grueros").select("*").eq("auth_id", user.id).single();
  if (gErr || !gruero) return json({ ok: false, error: "Gruero no encontrado" }, 404);

  if (req.method === "GET") {
    const { data: sols } = await supabase.from("solicitudes")
      .select("id,estado,calificacion,created_at,cliente_nombre,municipio,finalizada_at")
      .eq("gruero_asignado", gruero.id).order("created_at", { ascending: false });
    const all = sols ?? [];
    const total = all.length;
    const cals = all.filter((s:any) => s.calificacion).map((s:any) => Number(s.calificacion));
    const avgCal = cals.length ? (cals.reduce((a:number,b:number)=>a+b,0)/cals.length).toFixed(1) : null;
    const hoy = new Date(); const inicioMes = new Date(hoy.getFullYear(),hoy.getMonth(),1);
    const esteMes = all.filter((s:any) => new Date(s.created_at) >= inicioMes).length;
    return json({ ok:true, gruero, stats:{ total_servicios:total, este_mes:esteMes, calificacion_promedio:avgCal }, solicitudes_recientes: all.slice(0,10) });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(()=>({}));
    const update: any = {};
    const allowed = ["nombre","ciudad","municipios","disponible","datos","telefono","email"];
    for (const k of allowed) { if (body[k] !== undefined) update[k] = body[k]; }
    if (body.nombre) {
      const newSlug = toSlug(body.nombre);
      const { data: ex } = await supabase.from("grueros").select("id").eq("slug",newSlug).neq("id",gruero.id).single();
      update.slug = ex ? toSlug(body.nombre, String(Date.now()).slice(-4)) : newSlug;
    }
    const { error: upErr } = await supabase.from("grueros").update(update).eq("id", gruero.id);
    if (upErr) return json({ ok:false, error:upErr.message }, 500);
    const { data: updated } = await supabase.from("grueros")
      .select("id,nombre,slug,ciudad,municipios,datos,disponible,aprobado,email,telefono")
      .eq("id", gruero.id).single();
    return json({ ok:true, gruero: updated });
  }

  return json({ ok:false, error:"Método no permitido" }, 405);
});
