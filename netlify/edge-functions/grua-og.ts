// Netlify Edge Function: reescribe título, meta description, Open Graph y
// canonical de /grua/:slug con los datos reales del gruero, en el servidor.
// Sin esto, WhatsApp/Facebook/Twitter (que no ejecutan JS) muestran siempre
// la preview genérica, y Google depende de renderizar JS para indexar bien.
export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || url.pathname.split('/').filter(Boolean).pop();

  const response = await context.next();
  if (!slug || slug === 'grua.html') return response;

  const SUPABASE_URL = 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI';

  let gruero: any, stats: any;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/mi-perfil?slug=${encodeURIComponent(slug)}`,
      { headers: { apikey: SUPABASE_ANON_KEY } }
    );
    const data = await res.json();
    if (!data.ok || !data.gruero) return response;
    gruero = data.gruero;
    stats = data.stats;
  } catch {
    return response;
  }

  const fmt = (v: unknown) => (v && String(v).trim() ? String(v).trim() : null);
  const nombre = fmt(gruero.nombre) || 'Gruero Ridera';
  const ciudad = fmt(gruero.ciudad) || 'Colombia';
  const d = gruero.datos || {};
  const desc = fmt(d.descripcion) || '';
  const disp = gruero.disponible;
  const foto = fmt(d.foto_url) || fmt(gruero.foto_url) || '';

  const pageTitle = `${nombre} — Grúa para motos en ${ciudad} | Ridera`;
  const pageDesc = desc || `Servicio de grúa para motos en ${ciudad}. Disponible ${disp ? 'ahora' : 'bajo pedido'}.`;
  const pageUrl = url.href;

  const rewriter = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(pageTitle); } })
    .on('meta#pageDesc', { element(el) { el.setAttribute('content', pageDesc); } })
    .on('meta#ogTitle', { element(el) { el.setAttribute('content', pageTitle); } })
    .on('meta#ogDesc', { element(el) { el.setAttribute('content', pageDesc); } })
    .on('meta#ogUrl', { element(el) { el.setAttribute('content', pageUrl); } })
    .on('link#canonicalUrl', { element(el) { el.setAttribute('href', pageUrl); } });

  if (foto) {
    rewriter.on('meta#ogImage', { element(el) { el.setAttribute('content', foto); } });
  }

  return rewriter.transform(response);
};

export const config = { path: ['/grua/*', '/grua.html'] };
