import type { Context, Config } from "@netlify/edge-functions";

// Reescribe título, meta description, Open Graph y canonical de /grua/:slug
// con los datos reales del gruero, en el servidor. Sin esto, WhatsApp/
// Facebook/Twitter (que no ejecutan JS) muestran siempre la preview
// genérica, y Google depende de renderizar JS para indexar bien.
//
// Nota: los patrones de reemplazo están acoplados al markup exacto de
// grua.html (atributos id="pageTitle", id="ogTitle", etc). Si ese markup
// cambia, hay que actualizar los regex aquí también.
export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop();

  const response = await context.next();
  if (!slug || slug === "grua.html") return response;

  const SUPABASE_URL = "https://vzzxsdtsaahhzyctvmhx.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI";

  let gruero: any;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/mi-perfil?slug=${encodeURIComponent(slug)}`,
      { headers: { apikey: SUPABASE_ANON_KEY } }
    );
    const data = await res.json();
    if (!data.ok || !data.gruero) return response;
    gruero = data.gruero;
  } catch {
    return response;
  }

  const fmt = (v: unknown) => (v && String(v).trim() ? String(v).trim() : null);
  const nombre = fmt(gruero.nombre) || "Gruero Ridera";
  const ciudad = fmt(gruero.ciudad) || "Colombia";
  const d = gruero.datos || {};
  const desc = fmt(d.descripcion) || "";
  const disp = gruero.disponible;
  const foto = fmt(d.foto_url) || fmt(gruero.foto_url) || "";

  const pageTitle = `${nombre} — Grúa para motos en ${ciudad} | Ridera`;
  const pageDesc = desc || `Servicio de grúa para motos en ${ciudad}. Disponible ${disp ? "ahora" : "bajo pedido"}.`;
  const pageUrl = url.href;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let html: string;
  try {
    html = await response.text();
  } catch {
    return response;
  }

  html = html
    .replace(/<title id="pageTitle">[^<]*<\/title>/, `<title id="pageTitle">${esc(pageTitle)}</title>`)
    .replace(
      /(<meta name="description" id="pageDesc" content=")[^"]*(")/,
      `$1${esc(pageDesc)}$2`
    )
    .replace(
      /(<meta property="og:title" id="ogTitle" content=")[^"]*(")/,
      `$1${esc(pageTitle)}$2`
    )
    .replace(
      /(<meta property="og:description" id="ogDesc" content=")[^"]*(")/,
      `$1${esc(pageDesc)}$2`
    )
    .replace(/(<meta property="og:url" id="ogUrl" content=")[^"]*(")/, `$1${esc(pageUrl)}$2`)
    .replace(/(<link rel="canonical" id="canonicalUrl" href=")[^"]*(")/, `$1${esc(pageUrl)}$2`);

  if (foto) {
    html = html.replace(/(<meta property="og:image" id="ogImage" content=")[^"]*(")/, `$1${esc(foto)}$2`);
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(html, { status: response.status, headers });
};

export const config: Config = { path: ["/grua/*", "/grua.html"] };
