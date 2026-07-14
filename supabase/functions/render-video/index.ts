import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

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

const aws = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: AWS_REGION,
  service: "lambda",
});

async function invokeLambda(
  payload: string,
  invocationType: "RequestResponse" | "Event" = "RequestResponse",
): Promise<{ status: number; body: string }> {
  const endpoint =
    `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${FUNCTION_NAME}/invocations`;

  const res = await aws.fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amz-Invocation-Type": invocationType,
    },
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
        framesPerLambda: 40,
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
