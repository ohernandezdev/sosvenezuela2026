#!/usr/bin/env node
/* Estima el tiempo de carga del HOME en "Slow 3G" a partir de cantidades medidas
   (bytes gzip del critical path) y contadas (orígenes externos render-blocking,
   round-trips de API antes de ver datos). NO sustituye a un Lighthouse real:
   es un modelo simple y transparente para comparar ANTES (main) vs DESPUÉS de
   forma reproducible.

   Modelo "Slow 3G" (perfil de Lighthouse):
     - throughput efectivo: 50 KB/s  (≈ 400 kbps)
     - RTT: 400 ms
     - establecer una conexión TLS a un origen nuevo ≈ 3 RTT = 1.2 s
       (DNS asumido cacheado; conservador)

   Tiempo ≈ conexión_base
            + (orígenes_externos_render_blocking × 1.2s)   ← handshakes extra
            + (bytes_critical_path / 50KB/s)                ← descarga
            + (round_trips_api × RTT)                       ← latencia de datos

   Los BYTES de los reportes viajan igual en ambos casos (antes vía fetch,
   ahora incrustados en el HTML), así que el ahorro de mover los datos al
   servidor es de LATENCIA (round-trips), no de bytes. */

const THROUGHPUT_KBPS = 50;     // KB/s
const RTT = 0.4;                // s
const TLS_CONN = 3 * RTT;       // s, conexión a origen nuevo

// Perfiles. JS+CSS+HTML+fonts en KB (gzip / woff2 ya comprimido).
const BEFORE = {
  label: 'main (antes)',
  htmlKB: 8.9, jsCssKB: 245.8, fontsKB: 66.9,
  externalBlockingOrigins: 2,   // fonts.googleapis.com (CSS) + unpkg.com (CSS de Leaflet)
  extraOriginsForAssets: 1,     // fonts.gstatic.com (archivos de fuente)
  apiRoundTripsBeforeData: 2,   // /api/reports + /api/persons/stats tras hidratar
};
const AFTER = {
  label: 'esta rama (después)',
  htmlKB: 11.0, jsCssKB: 237.7, fontsKB: 66.9,  // HTML un poco mayor: lleva los datos
  externalBlockingOrigins: 0,
  extraOriginsForAssets: 0,
  apiRoundTripsBeforeData: 0,
};

function estimate(p) {
  const baseConn = TLS_CONN;                                  // origen propio
  const extraConns = (p.externalBlockingOrigins + p.extraOriginsForAssets) * TLS_CONN;
  const transfer = (p.htmlKB + p.jsCssKB + p.fontsKB) / THROUGHPUT_KBPS;
  const apiLatency = p.apiRoundTripsBeforeData * RTT;
  const total = baseConn + extraConns + transfer + apiLatency;
  return { baseConn, extraConns, transfer, apiLatency, total };
}

function fmt(n) { return n.toFixed(1) + 's'; }

const b = estimate(BEFORE), a = estimate(AFTER);
console.log('Estimación de carga del HOME en Slow 3G (50 KB/s, RTT 400 ms)\n');
console.log('Componente'.padEnd(34), BEFORE.label.padStart(16), AFTER.label.padStart(20));
console.log('-'.repeat(72));
const rows = [
  ['Conexión al origen propio', b.baseConn, a.baseConn],
  ['Handshakes a orígenes externos', b.extraConns, a.extraConns],
  ['Descarga (HTML+CSS+JS+fuentes)', b.transfer, a.transfer],
  ['Latencia de datos (round-trips API)', b.apiLatency, a.apiLatency],
];
for (const [k, bv, av] of rows) console.log(k.padEnd(34), fmt(bv).padStart(16), fmt(av).padStart(20));
console.log('-'.repeat(72));
console.log('TOTAL estimado'.padEnd(34), fmt(b.total).padStart(16), fmt(a.total).padStart(20));
const saved = b.total - a.total;
console.log(`\nMejora estimada: ${fmt(saved)} más rápido (${Math.round((saved / b.total) * 100)}%).`);
console.log('Principal ahorro: eliminar orígenes externos render-blocking y los round-trips de API.');
