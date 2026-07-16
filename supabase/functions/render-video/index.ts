import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const AWS_REGION = (Deno.env.get("REMOTION_REGION") || "us-east-1").trim();
const FUNCTION_NAME = (Deno.env.get("REMOTION_FUNCTION_NAME") || "").trim();
const SERVE_URL = (Deno.env.get("REMOTION_SERVE_URL") || "").trim();
const BUCKET_NAME = (Deno.env.get("REMOTION_BUCKET") || "").trim();
const AWS_ACCESS_KEY = (Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
const AWS_SECRET_KEY = (Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
const MAPBOX_TOKEN = (Deno.env.get("MAPBOX_TOKEN") || "").trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

const lambdaClient = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: AWS_REGION,
  service: "lambda",
});

const s3Client = new AwsClient({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: AWS_REGION,
  service: "s3",
});

async function log(testName: string, result: Record<string, unknown>) {
  try {
    await supabase.from("_debug_results").insert({ test_name: testName, result });
  } catch (_) {}
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { rideId, rideName, elapsed, distanceKm, maxSpeedKmh, routePoints, municipios } = body;
      if (!rideId || !routePoints?.length) {
        return new Response(JSON.stringify({ error: "rideId and routePoints required" }), { status: 400, headers: CORS });
      }
      if (!MAPBOX_TOKEN) {
        return new Response(JSON.stringify({ error: "MAPBOX_TOKEN not configured" }), { status: 500, headers: CORS });
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

      const outName = `ridera-${rideId}-${Date.now()}.mp4`;
      const fn900 = "remotion-render-4-0-293-mem3072mb-disk2048mb-900sec";

      const serializedInputProps = JSON.stringify({ data: inputProps });

      const payload = JSON.stringify({
        type: "start",
        serveUrl: SERVE_URL,
        composition: "RideVideo",
        inputProps: { type: "payload", payload: serializedInputProps },
        codec: "h264",
        imageFormat: "jpeg",
        maxRetries: 1,
        framesPerLambda: 40,
        privacy: "public",
        outName,
        version: "4.0.293",
        rendererFunctionName: fn900,
        bucketName: BUCKET_NAME,
        timeoutInMilliseconds: 900000,
        logLevel: "info",
        frameRange: null,
        chromiumOptions: {},
        scale: 1,
        everyNthFrame: 1,
        numberOfGifLoops: null,
        concurrencyPerLambda: 1,
        downloadBehavior: { type: "play-in-browser" },
        muted: false,
        overwrite: true,
        audioBitrate: null,
        videoBitrate: null,
        encodingBufferSize: null,
        encodingMaxRate: null,
        webhook: null,
        forceHeight: null,
        forceWidth: null,
        audioCodec: null,
        offthreadVideoCacheSizeInBytes: null,
        deleteAfter: null,
        colorSpace: null,
        preferLossless: false,
        forcePathStyle: false,
        metadata: null,
        apiKey: null,
        offthreadVideoThreads: null,
        envVariables: {},
        pixelFormat: null,
        proResProfile: null,
        x264Preset: null,
        jpegQuality: 80,
        crf: null,
      });

      await log("render_async_start_v89", { rideId, outName, payloadSize: payload.length });

      const endpoint = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${fn900}/invocations`;

      const res = await lambdaClient.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Amz-Invocation-Type": "Event",
        },
        body: payload,
      });

      await log("render_async_result_v89", {
        rideId,
        outName,
        lambdaStatus: res.status,
      });

      if (res.status !== 202) {
        const errBody = await res.text();
        throw new Error(`Lambda Event invoke failed: ${res.status} ${errBody}`);
      }

      // Return outName as renderId — the client will poll GET with it
      return new Response(JSON.stringify({
        renderId: outName,
        bucketName: BUCKET_NAME,
        status: "rendering",
      }), { status: 200, headers: CORS });

    } catch (e) {
      await log("render_async_error_v89", { error: String(e) });
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
    }
  }

  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const renderId = url.searchParams.get("renderId");
      const bucketName = url.searchParams.get("bucketName") || BUCKET_NAME;

      if (!renderId) {
        return new Response(JSON.stringify({ version: "v89-s3-poll", info: "POST to start render, GET with ?renderId=outName&bucketName=X to poll" }), { headers: CORS });
      }

      // Remotion stores output at renders/{internalId}/{outName}.
      // List all render dirs and check each for our outName.
      const listUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/?list-type=2&max-keys=3000&prefix=renders/`;
      const listRes = await s3Client.fetch(listUrl, { method: "GET" });

      if (listRes.ok) {
        const xml = await listRes.text();
        const keyRegex = /<Key>([^<]*)<\/Key>/g;
        let match;
        while ((match = keyRegex.exec(xml)) !== null) {
          if (match[1].endsWith(`/${renderId}`)) {
            const fileUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${match[1]}`;
            return new Response(JSON.stringify({
              status: "done",
              progress: 100,
              url: fileUrl,
            }), { status: 200, headers: CORS });
          }
        }
      }

      return new Response(JSON.stringify({
        status: "rendering",
        progress: 0,
      }), { status: 200, headers: CORS });

    } catch (e) {
      await log("render_poll_error_v89", { error: String(e) });
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
