import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")  ?? "BM1YuNBWGZsfKAxzDIzWjxvDIg-0uQ5j4kg0HUyj8MglbzvVgd3ExCExOyQglhvdBTKL3UoYLq1DyYhxAdtz1Fc";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")     ?? "mailto:soporte@ridera.com.co";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!VAPID_PRIVATE) return json({ error: "VAPID_PRIVATE_KEY not configured" }, 500);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const sol_id     = payload.sol_id     as string   | undefined;
  const municipio  = payload.municipio  as string   | undefined;
  const gruero_ids = payload.gruero_ids as string[] | undefined;
  let title = (payload.title as string | undefined) ?? "🏍️ Ridera Grús";
  let body  = (payload.body  as string | undefined) ?? "Nueva solicitud de grúa disponible";

  if (sol_id && !payload.title) {
    const { data: sol } = await sb
      .from("solicitudes")
      .select("municipio, ubicacion")
      .eq("id", sol_id)
      .maybeSingle();
    if (sol) {
      title = "🏍️ Nueva solicitud de grúa";
      const lugar = sol.municipio || municipio || "tu zona";
      body  = `Solicitud en ${lugar} — toca para aceptar`;
    }
  }

  let query = sb.from("push_subscriptions").select("endpoint, p256dh, auth, gruero_id");
  if (gruero_ids && gruero_ids.length > 0) {
    query = (query as any).in("gruero_id", gruero_ids);
  }

  const { data: subs, error: subErr } = await query;
  if (subErr) return json({ error: "DB error", detail: subErr.message }, 500);
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, msg: "No subscribers" });

  const pushData = JSON.stringify({
    title,
    body,
    sol_id: sol_id ?? null,
    url: "/mi-cuenta.html",
  });

  const results = await Promise.allSettled(
    subs.map((s: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        pushData,
        { TTL: 3600 }
      )
    )
  );

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;
  const errors = results
    .filter(r => r.status === "rejected")
    .map((r, i) => ({
      gruero_id: (subs[i] as { gruero_id: string })?.gruero_id,
      reason: (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason),
    }));

  return json({ ok: true, sent, failed, ...(errors.length ? { errors } : {}) });
});
