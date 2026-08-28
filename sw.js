// sw.js — Aeroclub Río Grande
// Service Worker mínimo para instalabilidad PWA.
// Estrategia: network-first para .html (siempre la última versión desplegada
// en GitHub/Cloudflare), cache-first para el resto (íconos, manifest, etc).
// Firebase (firebaseio.com, googleapis.com), EmailJS (emailjs.com) y
// cualquier otro dominio externo pasan directo a la red, sin caché.

// v2 (2026-08-28) — FIX reportado por Daniel: QuotaExceededError real en el
// dispositivo + "Failed to convert value to 'Response'" tirando la página
// entera con error de red. Causa raíz: cache.put() para .html usaba
// event.request TAL CUAL, con query string incluido — como
// chequearVersionNueva() cachebustea con ?_v=<timestamp> en cada
// actualización detectada, CADA recarga generaba una entrada NUEVA en el
// caché en vez de pisar la anterior. Con meses de uso esto termina llenando
// la cuota de storage del navegador; una vez llena, cache.put() falla en
// silencio, y si además un fetch() de red falla una vez (señal mala), el
// respaldo a caches.match() no encuentra nada guardado para esa URL exacta →
// event.respondWith() resuelve a undefined → el navegador tira el TypeError
// y la página se cae con error de red, aunque sea vieja.
// Dos fixes: (1) la key de caché para .html es ahora la URL SIN query string
// — cachebustear ya no acumula entradas, pisa siempre la misma; (2) el
// fallback nunca devuelve undefined — si no hay nada cacheado, arma una
// Response de error explícita. CACHE_NAME bump (v1→v2) fuerza que el
// activate() de más abajo borre TODO el caché viejo ya acumulado en cada
// dispositivo — no alcanza con el fix de código solo, hay que vaciar lo que
// ya se juntó.
const CACHE_NAME = 'acrg-cache-v2';

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
    const cacheKey = url.pathname; // v2: SIN query string — ver nota de arriba
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(cacheKey, clone))
            .catch(() => {}); // cuota llena u otro error de caché: no bloquea la respuesta real
          return response;
        })
        .catch(() =>
          caches.match(cacheKey).then((cached) =>
            cached || new Response(
              'Sin conexión y sin versión guardada en caché para esta página.',
              { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            )
          )
        )
    );
    return;
  }

  // Cache-first para el resto (íconos, manifest, leaflet-rotate.js, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, clone))
          .catch(() => {}); // idem arriba
        return response;
      });
    })
  );
});
