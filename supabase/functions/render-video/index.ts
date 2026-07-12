import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const AWS_REGION = Deno.env.get("REMOTION_REGION") || "us-east-1";
const FUNCTION_NAME = Deno.env.get("REMOTION_FUNCTION_NAME") || "";
const SERVE_URL = Deno.env.get("REMOTION_SERVE_URL") || "";
const BUCKET_NAME = Deno.env.get("REMOTION_BUCKET") || "";
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
}

async function sha256(msg: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(msg));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function invokeLambda(
  payload: string,
  invocationType: "RequestResponse" | "Event" = "RequestResponse",
): Promise<{ status: number; body: string }> {
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");

  const service = "lambda";
  const host = `lambda.${AWS_REGION}.amazonaws.com`;
  const path = `/2015-03-31/functions/${FUNCTION_NAME}/invocations`;
  const payloadHash = await sha256(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "X-Amz-Invocation-Type": invocationType,
  };

  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-invocation-type:${invocationType}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-invocation-type";
  const canonicalRequest =
    `POST\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

  const kDate = await hmac(encoder.encode(`AWS4${AWS_SECRET_KEY}`), dateStamp);
  const kRegion = await hmac(kDate, AWS_REGION);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signatureBytes = await hmac(kSigning, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers["Host"] = host;

  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers,
    body: payload,
  });

  const body = await res.text();
  return { status: res.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // POST — start render
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { rideId, rideName, elapsed, distanceKm, maxSpeedKmh, routePoints, municipios } = body;

      if (!rideId || !routePoints?.length) {
        return new Response(
          JSON.stringify({ error: "rideId and routePoints required" }),
          { status: 400, headers: CORS },
        );
      }

      if (!MAPBOX_TOKEN) {
        return new Response(
          JSON.stringify({ error: "MAPBOX_TOKEN not configured" }),
          { status: 500, headers: CORS },
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
        outName: `ridera-${rideId}-${Date.now()}.mp4`,
      });

      const res = await invokeLambda(payload, "RequestResponse");

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Lambda invoke failed: ${res.status} ${res.body}`);
      }

      let lambdaResult: Record<string, unknown>;
      try {
        lambdaResult = JSON.parse(res.body);
      } catch {
        throw new Error(`Lambda response not JSON: ${res.body}`);
      }

      const renderId = lambdaResult.renderId as string;
      const bucketName = lambdaResult.bucketName as string;

      if (!renderId) {
        throw new Error(`Lambda did not return renderId: ${JSON.stringify(lambdaResult)}`);
      }

      return new Response(
        JSON.stringify({
          renderId,
          bucketName: bucketName || BUCKET_NAME,
          status: "rendering",
        }),
        { status: 200, headers: CORS },
      );
    } catch (e) {
      console.error("Render start error:", e);
      return new Response(
        JSON.stringify({ error: String(e) }),
        { status: 500, headers: CORS },
      );
    }
  }

  // GET — check render progress
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const renderId = url.searchParams.get("renderId");
      const bucketName = url.searchParams.get("bucketName") || BUCKET_NAME;

      if (!renderId) {
        return new Response(
          JSON.stringify({ error: "renderId query param required" }),
          { status: 400, headers: CORS },
        );
      }

      const payload = JSON.stringify({
        type: "status",
        bucketName,
        renderId,
      });

      const res = await invokeLambda(payload);

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Lambda status failed: ${res.status} ${res.body}`);
      }

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(res.body);
      } catch {
        throw new Error(`Lambda status response not JSON: ${res.body}`);
      }

      const overallProgress = result.overallProgress as number ?? 0;
      const fatalErrorEncountered = result.fatalErrorEncountered as boolean ?? false;
      const done = result.done as boolean ?? false;
      const outputUrl = (result.outputFile as string) ?? (result.outputUrl as string) ?? null;
      const errors = result.errors as unknown[] ?? [];

      if (fatalErrorEncountered) {
        return new Response(
          JSON.stringify({
            status: "error",
            progress: Math.round(overallProgress * 100),
            error: errors.length > 0 ? JSON.stringify(errors[0]) : "Render failed",
          }),
          { status: 200, headers: CORS },
        );
      }

      if (done && outputUrl) {
        return new Response(
          JSON.stringify({
            status: "done",
            progress: 100,
            url: outputUrl,
          }),
          { status: 200, headers: CORS },
        );
      }

      return new Response(
        JSON.stringify({
          status: "rendering",
          progress: Math.round(overallProgress * 100),
        }),
        { status: 200, headers: CORS },
      );
    } catch (e) {
      console.error("Render status error:", e);
      return new Response(
        JSON.stringify({ error: String(e) }),
        { status: 500, headers: CORS },
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
