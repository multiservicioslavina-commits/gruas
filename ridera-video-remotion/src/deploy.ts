/**
 * Script para desplegar Remotion Lambda en AWS.
 *
 * Pre-requisitos:
 * 1. AWS CLI configurado con credenciales
 * 2. Variables de entorno:
 *    - REMOTION_AWS_REGION (default: us-east-1)
 *    - MAPBOX_TOKEN
 *
 * Uso: npx tsx src/deploy.ts
 */
import {
  deploySite,
  deployFunction,
  getOrCreateBucket,
} from "@remotion/lambda";
import path from "path";

const REGION = (process.env.REMOTION_AWS_REGION || "us-east-1") as
  | "us-east-1"
  | "us-east-2"
  | "us-west-2"
  | "eu-central-1";

async function main() {
  console.log("1. Creando bucket S3...");
  const { bucketName } = await getOrCreateBucket({ region: REGION });
  console.log(`   Bucket: ${bucketName}`);

  console.log("2. Desplegando sitio (bundle)...");
  const { serveUrl } = await deploySite({
    bucketName,
    entryPoint: path.join(__dirname, "index.ts"),
    region: REGION,
    siteName: "ridera-video",
  });
  console.log(`   ServeUrl: ${serveUrl}`);

  console.log("3. Desplegando función Lambda...");
  const { functionName } = await deployFunction({
    region: REGION,
    timeoutInSeconds: 240,
    memorySizeInMb: 2048,
    createCloudWatchLogGroup: true,
  });
  console.log(`   Function: ${functionName}`);

  console.log("\n✅ Deploy completo!");
  console.log(`\nGuardar estos valores como secrets en Supabase:`);
  console.log(`  REMOTION_SERVE_URL=${serveUrl}`);
  console.log(`  REMOTION_FUNCTION_NAME=${functionName}`);
  console.log(`  REMOTION_BUCKET=${bucketName}`);
  console.log(`  REMOTION_REGION=${REGION}`);
}

main().catch(console.error);
