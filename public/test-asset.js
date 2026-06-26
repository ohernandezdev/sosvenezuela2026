/* Service Worker de SOS Venezuela 2026.
 *
 * Objetivo: en redes 3G lentas e inestables, hacer que las VISITAS REPETIDAS
 * carguen al instante (assets desde caché) y que las páginas ya vistas —sobre
 * todo /recomendaciones (primeros auxilios)— funcionen SIN CONEXIÓN.
 *
 * Diseño deliberadamente conservador para no degradar nunca el caso online:
 *   - Estáticos hasheados de Next (/_next/static/, inmutables) y fotos
 *     redimensionadas (/api/photo/...?w=) → cache-first. Sus URLs cambian en
 *     cada build, así que cache-first NUNCA sirve algo obsoleto.
 *   - Navegaciones (HTML) → network-first con respaldo a caché (offline).
 *     Estando online SIEMPRE se sirve la respuesta de red: el comportamiento
 *     online es idéntico al de no tener SW.
 *   - Todo lo demás (otras APIs, SSE, POST, orígenes externos) → se ignora y lo
 *     maneja el navegador por defecto. Un fallo del SW no puede romperlas.
 */
const VERSION = 'v1';
const STATIC_CACHE = `sos-static-${VERSION}`;
const PAGE_CACHE = `sos-pages-${VERSION}`;
const OFFLINE_URL = '/recomendaciones';

self.addEventListener('install', (event) => {
  // Precarga la guía de primeros auxilios para que esté disponible offline.
  event.waitUntil(
    caches.open(PAGE_CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isHashedStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    (url.pathname.startsWith('/api/photo/') && url.search.includes('w='))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // sólo mismo-origen

  // 1) Estáticos inmutables → cache-first (carga instantánea en repetición).
  if (isHashedStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // 2) Navegaciones (HTML) → network-first con respaldo a caché (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          return (await cache.match(req)) || (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }
  // 3) El resto: comportamiento por defecto del navegador.
});
