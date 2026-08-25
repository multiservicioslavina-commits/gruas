import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Proxy hacia Railway — funciona con CUALQUIER versión del app:
// v1 (antigua): POST /render-video  +  GET /render-video?renderId=uuid
// v2 (nueva):   POST /render-video/render  +  GET /render-video/status/uuid
const RAILWAY_URL = (Deno.env.get("RAILWAY_VIDEO_URL") || "https://insightful-love-production-12c1.up.railway.app").trim();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // ── POST: iniciar render ────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { rideId, routePoints } = body;
      if (!rideId || !routePoints?.length) {
        return new Response(JSON.stringify({ error: "rideId and routePoints required" }), { status: 400, headers: CORS });
      }

      const res = await fetch(`${RAILWAY_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await res.json();
      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.error || "Railway error" }), { status: 500, headers: CORS });
      }

      const jobId = data.jobId;
      return new Response(JSON.stringify({
        jobId,
        renderId: jobId,
        status: "rendering",
      }), { status: 200, headers: CORS });

    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
    }
  }

  // ── GET: consultar estado ───────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      let jobId: string | null = null;

      const pathMatch = pathname.match(/\/status\/([^/]+)$/);
      if (pathMatch) {
        jobId = pathMatch[1];
      }
      if (!jobId) {
        jobId = url.searchParams.get("renderId");
      }

      if (!jobId) {
        return new Response(JSON.stringify({ version: "railway-proxy-v2", status: "idle" }), { headers: CORS });
      }

      const res = await fetch(`${RAILWAY_URL}/status/${jobId}`, {
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ status: "rendering", progress: 0 }), { headers: CORS });
      }

      const data = await res.json();
      const status = data.state === "done" ? "done"
        : data.state === "error" ? "error"
        : "rendering";

      return new Response(JSON.stringify({
        status,
        state: data.state,
        progress: data.progress ?? 0,
        url: data.url ?? null,
        error: data.error ?? null,
      }), { headers: CORS });

    } catch (e) {
      return new Response(JSON.stringify({ status: "rendering", progress: 0 }), { headers: CORS });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
