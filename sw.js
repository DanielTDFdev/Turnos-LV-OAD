// sw.js — Aeroclub Río Grande
// Service Worker mínimo para instalabilidad PWA.
// Estrategia: network-first para .html (siempre la última versión desplegada
// en GitHub/Cloudflare), cache-first para el resto (íconos, manifest, etc).
// Firebase (firebaseio.com, googleapis.com), EmailJS (emailjs.com) y
// cualquier otro dominio externo pasan directo a la red, sin caché.

const CACHE_NAME = 'acrg-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo GET y mismo origen; todo lo demás (Firebase, EmailJS, etc.) pasa
  // directo a la red sin intervención del Service Worker.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Network-first para los .html: así el usuario siempre ve la última
  // versión que subiste a GitHub/Cloudflare, y solo cae a caché si está offline.
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first para el resto (íconos, manifest, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
