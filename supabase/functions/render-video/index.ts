import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * render-video: Supabase Edge Function que invoca Remotion Lambda
 * para generar el video de una rodada.
 *
 * Reemplaza el backend de Railway (Puppeteer + FFmpeg).
 *
 * POST /render-video
 * Body: { rideId, rideName, elapsed, distanceKm, maxSpeedKmh, routePoints, municipios }
 *
 * Responde inmediatamente con { jobId } y el video se genera async.
 * GET /render-video?jobId=xxx para verificar estado.
 */

const AWS_REGION = Deno.env.get("REMOTION_REGION") || "us-east-1";
const FUNCTION_NAME = Deno.env.get("REMOTION_FUNCTION_NAME") || "";
const SERVE_URL = Deno.env.get("REMOTION_SERVE_URL") || "";
const BUCKET_NAME = Deno.env.get("REMOTION_BUCKET") || "";
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN") || "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Job {
  id: string;
  status: "rendering" | "done" | "error";
  url?: string;
  error?: string;
  startedAt: number;
}

// In-memory job tracking (edge functions are short-lived, so this is per-invocation)
// For production, store in Supabase table
const jobs = new Map<string, Job>();

async function invokeRemotionLambda(inputProps: Record<string, unknown>): Promise<string> {
  // Invoke AWS Lambda directly via REST API
  const endpoint = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${FUNCTION_NAME}/invocations`;

  const payload = JSON.stringify({
    type: "start",
    serveUrl: SERVE_URL,
    composition: "RideVideo",
    inputProps: { data: inputProps },
    codec: "h264",
    imageFormat: "jpeg",
    maxRetries: 1,
    framesPerLambda: 20,
    privacy: "public",
    outName: `ridera-${inputProps.rideId}-${Date.now()}.mp4`,
  });

  // AWS Signature V4 signing
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "X-Amz-Invocation-Type": "Event", // async invocation
  };

  // Simple signing (for production, use proper AWS SDK)
  const encoder = new TextEncoder();

  async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key instanceof Uint8Array ? key : new Uint8Array(key),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
  }

  async function sha256(msg: string): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(msg));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const service = "lambda";
  const host = `lambda.${AWS_REGION}.amazonaws.com`;
  const path = `/2015-03-31/functions/${FUNCTION_NAME}/invocations`;
  const payloadHash = await sha256(payload);

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-invocation-type:Event\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-invocation-type";
  const canonicalRequest = `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  const kDate = await hmac(encoder.encode(`AWS4${AWS_SECRET_KEY}`), dateStamp);
  const kRegion = await hmac(kDate, AWS_REGION);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signatureBytes = await hmac(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, "0")).join("");

  headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers["Host"] = host;

  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers,
    body: payload,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lambda invoke failed: ${res.status} ${errText}`);
  }

  return `ridera-${inputProps.rideId}-${Date.now()}`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // POST — start render
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const {
        rideId, rideName, elapsed, distanceKm, maxSpeedKmh,
        routePoints, municipios,
      } = body;

      if (!rideId || !routePoints?.length) {
        return new Response(
          JSON.stringify({ error: "rideId and routePoints required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const inputProps = {
        rideId,
        rideName: rideName || "Rodada",
        elapsed: elapsed || "00:00:00",
        distanceKm: distanceKm || "0",
        maxSpeedKmh: maxSpeedKmh || "0",
        routePoints,
        municipios: municipios || [],
        mapboxToken: MAPBOX_TOKEN,
      };

      const jobId = await invokeRemotionLambda(inputProps);

      return new Response(
        JSON.stringify({ jobId, status: "rendering" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    } catch (e) {
      console.error("Render error:", e);
      return new Response(
        JSON.stringify({ error: String(e) }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
