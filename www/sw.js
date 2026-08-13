// Ridera Grúas - Service Worker
const CACHE = 'ridera-v2';
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

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch(e) {}
  const title = data.title || '🏍️ Ridera Grúas';
  const options = {
    body: data.body || 'Nueva solicitud de grúa disponible',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: data.sol_id || 'ridera-push',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/mi-cuenta.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/mi-cuenta.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(url);
      }
      return clients.openWindow(url);
    })
  );
});
