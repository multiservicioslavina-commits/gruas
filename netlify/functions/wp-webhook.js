// netlify/functions/wp-webhook.js
//
// Recibe un webhook desde WordPress cuando se publica/edita contenido,
// extrae el post completo vía REST API de WP, lo transforma y hace
// upsert en Supabase.
//
// Variables de entorno requeridas (configurar en Netlify > Site settings > Environment):
//   WP_BASE_URL          -> ej: https://ridera.com.co
//   WEBHOOK_SECRET        -> string secreta compartida con WordPress
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY  -> service role key (NUNCA la anon key, esto escribe datos)

const WP_BASE_URL = process.env.WP_BASE_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Ajusta estos slugs si tus custom post types tienen otro nombre en WP
const POST_TYPE_ENDPOINTS = {
  taller: "taller",
  almacen: "almacen",
  grua: "grua",
  post: "posts",
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // 1. Validar el secreto compartido
  const incomingSecret = event.headers["x-webhook-secret"];
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { post_id, post_type, event: wpEvent } = payload;

  if (!post_id || !post_type) {
    return { statusCode: 400, body: "Missing post_id or post_type" };
  }

  try {
    const wpData = await fetchFromWordPress(post_id, post_type);
    const row = transform(wpData, post_type);
    await upsertToSupabase(row);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, wp_id: post_id, type: post_type, event: wpEvent }),
    };
  } catch (err) {
    console.error("ETL error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};

// --- EXTRACT ---------------------------------------------------------

async function fetchFromWordPress(postId, postType) {
  const endpoint = POST_TYPE_ENDPOINTS[postType];
  if (!endpoint) {
    throw new Error(`post_type desconocido: ${postType}`);
  }

  // _embed trae la imagen destacada embebida
  const url = `${WP_BASE_URL}/wp-json/wp/v2/${endpoint}/${postId}?_embed`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`WP REST API respondió ${res.status} para ${url}`);
  }

  return res.json();
}

// --- TRANSFORM --------------------------------------------------------

function transform(wpData, postType) {
  const featuredImage =
    wpData._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;

  // Campos ACF (si el plugin ACF-to-REST-API está activo, vienen en wpData.acf)
  const meta = wpData.acf || {};

  return {
    wp_id: wpData.id,
    type: postType,
    title: wpData.title?.rendered || "",
    slug: wpData.slug,
    status: wpData.status,
    content: wpData.content?.rendered || "",
    excerpt: wpData.excerpt?.rendered || "",
    featured_image: featuredImage,
    link: wpData.link,
    meta,
    wp_modified_at: wpData.modified_gmt
      ? new Date(wpData.modified_gmt + "Z").toISOString()
      : null,
    synced_at: new Date().toISOString(),
  };
}

// --- LOAD ---------------------------------------------------------

async function upsertToSupabase(row) {
  const url = `${SUPABASE_URL}/rest/v1/wp_sync_content?on_conflict=wp_id,type`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert falló (${res.status}): ${text}`);
  }
}
