// Ridera Grúas - Service Worker
const CACHE = 'ridera-v1';
const ASSETS = ['/', '/index.html', '/manifest.json',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo manejar lo de nuestro propio dominio (no Supabase, fuentes, etc.)
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Navegaciones: red primero, cae a caché si no hay internet
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Recursos: caché primero, si no, red
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => hit)));
});
