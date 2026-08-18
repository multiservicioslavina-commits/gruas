// Netlify Edge Function: genera sitemap.xml dinámico con grueros aprobados
export default async () => {
  const SUPABASE_URL = 'https://vzzxsdtsaahhzyctvmhx.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6enhzZHRzYWFoaHp5Y3R2bWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzU3NzIsImV4cCI6MjA5Njk1MTc3Mn0.5GZRCUuMx7fwmvoo48nXVCq9QJs0ysCzz0TPr9mmcNI';
  const BASE_URL = 'https://gruas.ridera.com.co';
  const today = new Date().toISOString().split('T')[0];

  // Páginas estáticas (lastmod = última edición real, no "hoy")
  const staticPages = [
    { url: '/',                    priority: '1.0', freq: 'daily',   mod: '2026-07-21' },
    { url: '/grueros',             priority: '0.9', freq: 'daily',   mod: '2026-07-21' },
    { url: '/app/',                priority: '0.8', freq: 'monthly', mod: '2026-07-21' },
    { url: '/garage-ridera.html',  priority: '0.7', freq: 'monthly', mod: '2026-07-17' },
    { url: '/blog/',               priority: '0.8', freq: 'weekly',  mod: '2026-08-18' },
    { url: '/blog/que-hacer-si-tu-moto-se-vara-en-medellin.html', priority: '0.7', freq: 'monthly', mod: '2026-08-18' },
    { url: '/blog/pico-y-placa-motos-medellin.html',              priority: '0.7', freq: 'monthly', mod: '2026-08-18' },
    { url: '/blog/como-elegir-grua-para-motos.html',               priority: '0.7', freq: 'monthly', mod: '2026-08-18' },
    { url: '/blog/rutas-moto-antioquia.html',                      priority: '0.7', freq: 'monthly', mod: '2026-08-18' },
    { url: '/almacenes',           priority: '0.7', freq: 'weekly',  mod: '2026-08-18' },
    { url: '/info',                priority: '0.5', freq: 'monthly', mod: '2026-08-18' },
  ];

  let grueroUrls: { url: string; mod: string; priority: string }[] = [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/grueros?aprobado=eq.SI&slug=not.is.null&select=slug,created_at&order=created_at.desc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const rows: { slug: string; created_at: string }[] = await res.json();
      grueroUrls = rows.map(r => ({
        url: `/grua/${r.slug}`,
        mod: r.created_at ? r.created_at.split('T')[0] : today,
        priority: '0.9',
      }));
    }
  } catch {
    // Si falla Supabase, el sitemap igual devuelve las páginas estáticas
  }

  const staticEntries = staticPages.map(p => `
  <url>
    <loc>${BASE_URL}${p.url}</loc>
    <lastmod>${p.mod}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('');

  const grueroEntries = grueroUrls.map(g => `
  <url>
    <loc>${BASE_URL}${g.url}</loc>
    <lastmod>${g.mod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${g.priority}</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${grueroEntries}
</urlset>`;

  return new Response(xml.trim(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

export const config = { path: '/sitemap.xml' };
