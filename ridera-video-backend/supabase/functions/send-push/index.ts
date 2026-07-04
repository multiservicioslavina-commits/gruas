// Supabase Edge Function: envía notificaciones push via OneSignal REST API.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//   supabase secrets set ONESIGNAL_APP_ID=... ONESIGNAL_REST_API_KEY=...
//
// Ejemplo de invocación desde Postgres trigger:
//   PERFORM net.http_post(
//     url := 'https://<project>.functions.supabase.co/send-push',
//     headers := jsonb_build_object('Content-Type','application/json'),
//     body := jsonb_build_object(
//       'to_uids', ARRAY['uuid-1','uuid-2'],
//       'title', '🚨 SOS en la rodada',
//       'body', 'Juan activó SOS. Toca para ver el mapa.',
//       'data', jsonb_build_object('type','sos','ride_id','K7P2M')
//     )
//   );

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface PushRequest {
  to_uids?: string[];       // uids de Supabase — targeted
  external_ids?: string[];  // OR: player_ids de OneSignal directos
  ride_id?: string;         // OR: todos los miembros de una rodada
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OneSignal not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { title, body, data } = payload;
  if (!title || !body) {
    return new Response("title and body are required", { status: 400 });
  }

  // Resolver los external_ids a notificar
  let externalIds: string[] = payload.external_ids ?? [];

  if (payload.to_uids && payload.to_uids.length > 0) {
    externalIds = [...externalIds, ...payload.to_uids];
  }

  if (payload.ride_id) {
    const { data: members } = await supabase
      .from("members")
      .select("uid")
      .eq("ride_id", payload.ride_id);
    if (members) {
      externalIds = [
        ...externalIds,
        ...members.map((m: { uid: string }) => m.uid),
      ];
    }
  }

  externalIds = Array.from(new Set(externalIds)).filter(Boolean);
  if (externalIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "No recipients" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const oneSignalPayload = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: externalIds },
    target_channel: "push",
    headings: { en: title, es: title },
    contents: { en: body, es: body },
    data: data ?? {},
    android_accent_color: "FFE85D20",
    android_channel_id: "ridera_alerts",
    small_icon: "ic_notification",
  };

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify(oneSignalPayload),
  });

  const responseText = await res.text();
  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "OneSignal error", details: responseText }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, recipients: externalIds.length, one_signal: responseText }),
    { headers: { "Content-Type": "application/json" } },
  );
});
