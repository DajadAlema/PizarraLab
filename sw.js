/**
 * sw.js — Service Worker de PizarraLab
 *
 * Responsabilidades:
 * 1. Cachear assets estáticos para uso offline
 * 2. Manejar notificaciones push (cuando la app está cerrada)
 */

const CACHE_NAME = 'pizarralab-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap'
];

// ── Install: cachear assets ───────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Error cacheando assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: limpiar caches viejas ──────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: strategy Cache-first para assets estáticos ────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Las llamadas a /api/* siempre van a la red
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Solo cachear respuestas exitosas de nuestro mismo origen
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Si no hay red y no está en caché, devolver el index
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});

// ── Push: notificaciones cuando la app está cerrada ───────
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'PizarraLab', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'PizarraLab', {
      body:    payload.body   || '',
      icon:    payload.icon   || '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     payload.tag    || 'pizarralab',
      data:    payload.data   || {},
      vibrate: [200, 100, 200]
    })
  );
});

// ── Notification click: abrir la app ─────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
