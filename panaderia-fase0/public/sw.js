// Service Worker — Danny'sApp
// Estrategia: network-first para todo.
// Los recursos estáticos (JS, CSS, íconos) se cachean como respaldo;
// las rutas de datos (API, páginas dinámicas) van siempre a la red.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// Recursos estáticos que vale la pena cachear como respaldo
const RUTAS_ESTATICAS = [
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-icon-180.png",
];

// Prefijos de rutas que deben ir SIEMPRE a la red (datos dinámicos)
const SIEMPRE_RED = [
  "/api/",
  "/caja",
  "/facturas",
  "/dashboard",
  "/produccion",
  "/plan-semanal",
  "/campanias",
  "/chat-ia",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(RUTAS_ESTATICAS).catch(() => {
        // Si algún ícono no existe aún, no bloquear la instalación
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Solo manejar peticiones del mismo origen
  if (url.origin !== self.location.origin) return;

  // Solo GET
  if (event.request.method !== "GET") return;

  // Rutas dinámicas → siempre red, sin caché
  const esDinamica = SIEMPRE_RED.some((prefijo) => url.pathname.startsWith(prefijo));
  if (esDinamica) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Recursos estáticos → network-first con caché de respaldo
  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
