const CACHE = "ridera125-v2";
const ASSETS = [
  "index.html","perfil.html","pasaporte.html","sello.html","album.html",
  "compartir.html","mapa.html","clubes.html","reset.html",
  "manifest.json","icon-192.png","icon-512.png","apple-touch-icon.png","og.png"
];
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  const req=e.request;
  if(req.method!=="GET") return;
  let url;
  try{ url=new URL(req.url); }catch(_){ return; }
  // Nunca cachear Supabase (datos/login): siempre red fresca
  if(url.hostname.endsWith("supabase.co")) return;
  if(url.origin===location.origin){
    // App: cache-first con respaldo a red
    e.respondWith(
      caches.match(req).then(r=> r || fetch(req).then(res=>{
        if(res && res.ok){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); }
        return res;
      }).catch(()=> caches.match("index.html")))
    );
  } else {
    // CDN (fuentes, librerías): cache-first
    e.respondWith(
      caches.match(req).then(cached=> cached || fetch(req).then(res=>{
        if(res && res.ok){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(req,c)); }
        return res;
      }).catch(()=> cached || new Response('',{status:503})))
    );
  }
});
