import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const AWS_REGION = (Deno.env.get("REMOTION_REGION") || "us-east-1").trim();
const FUNCTION_NAME = (Deno.env.get("REMOTION_FUNCTION_NAME") || "").trim();
const AWS_ACCESS_KEY = (Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
const AWS_SECRET_KEY = (Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
const BUCKET_NAME = (Deno.env.get("REMOTION_BUCKET") || "").trim();
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
const lambda = new AwsClient({ accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY, region: AWS_REGION, service: "lambda" });
const s3 = new AwsClient({ accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY, region: AWS_REGION, service: "s3" });
const logs = new AwsClient({ accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY, region: AWS_REGION, service: "logs" });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  if (action === "read") {
    const key = url.searchParams.get("key") || "";
    const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
    const res = await s3.fetch(s3Url, { method: "GET" });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, body: body.substring(0, 4000) }), { headers: CORS });
  }

  if (action === "logs") {
    const logGroup = `/aws/lambda/${FUNCTION_NAME}`;
    const logsUrl = `https://logs.${AWS_REGION}.amazonaws.com/`;
    const res = await logs.fetch(logsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "Logs_20140328.DescribeLogStreams" },
      body: JSON.stringify({ logGroupName: logGroup, orderBy: "LastEventTime", descending: true, limit: 3 }),
    });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, body: body.substring(0, 3000) }), { headers: CORS });
  }

  if (action === "log-events") {
    const stream = url.searchParams.get("stream") || "";
    const logGroup = `/aws/lambda/${FUNCTION_NAME}`;
    const logsUrl = `https://logs.${AWS_REGION}.amazonaws.com/`;
    const res = await logs.fetch(logsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "Logs_20140328.GetLogEvents" },
      body: JSON.stringify({ logGroupName: logGroup, logStreamName: stream, startFromHead: false, limit: 30 }),
    });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, body: body.substring(0, 4000) }), { headers: CORS });
  }

  if (action === "list") {
    const prefix = url.searchParams.get("prefix") || "";
    const s3Url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=50`;
    const res = await s3.fetch(s3Url, { method: "GET" });
    const body = await res.text();
    return new Response(JSON.stringify({ status: res.status, body: body.substring(0, 4000) }), { headers: CORS });
  }

  return new Response(JSON.stringify({actions: ["read","logs","log-events","list"]}), { headers: CORS });
});
