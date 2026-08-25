Deno.serve(async (req: Request) => {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !u.startsWith("https://") || !/(ridera\.com\.co|pasaporteridera\.netlify\.app)/.test(u)) {
    return new Response("bad url", { status: 400 });
  }
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    const body = await r.text();
    return new Response(JSON.stringify({ status: r.status, headers: Object.fromEntries(r.headers.entries()), body: body.slice(0, 60000) }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
