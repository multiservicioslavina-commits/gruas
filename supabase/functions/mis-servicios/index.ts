import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ","");
  if (!token) return json({ ok:false, error:"No autorizado" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data:{ user }, error:authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ ok:false, error:"Token inválido" }, 401);
  const { data:gruero } = await supabase.from("grueros").select("id").eq("auth_id",user.id).single();
  if (!gruero) return json({ ok:false, error:"Gruero no encontrado" }, 404);

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit")??"20");
  const offset = parseInt(url.searchParams.get("offset")??"0");
  const estado = url.searchParams.get("estado");

  let q = supabase.from("solicitudes")
    .select("id,cliente_nombre,ubicacion,municipio,estado,created_at,asignada_at,llego_at,finalizada_at,calificacion,comentario_cliente",{count:"exact"})
    .eq("gruero_asignado",gruero.id).order("created_at",{ascending:false}).range(offset, offset+limit-1);
  if (estado) q = q.eq("estado",estado);
  const { data:sols, count, error } = await q;
  if (error) return json({ ok:false, error:error.message }, 500);

  const { data:all } = await supabase.from("solicitudes").select("estado,calificacion,created_at").eq("gruero_asignado",gruero.id);
  const total = (all??[]).length;
  const finalizados = (all??[]).filter((s:any)=>s.estado==="finalizada").length;
  const cals = (all??[]).filter((s:any)=>s.calificacion).map((s:any)=>Number(s.calificacion));
  const avgCal = cals.length?(cals.reduce((a:number,b:number)=>a+b,0)/cals.length).toFixed(1):null;
  const hoy = new Date(); const inicioMes = new Date(hoy.getFullYear(),hoy.getMonth(),1);
  const esteMes = (all??[]).filter((s:any)=>new Date(s.created_at)>=inicioMes).length;

  return json({ ok:true, total:count, stats:{ total_servicios:total, finalizados, este_mes:esteMes, calificacion_promedio:avgCal }, servicios:sols });
});
