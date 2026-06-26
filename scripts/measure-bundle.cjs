#!/usr/bin/env node
/* Mide el "First Load JS" (gzipped) por página, parseando el HTML prerenderizado
   en .next/server/app/*.html y sumando el gzip de cada chunk referenciado.
   Aproxima lo que descarga el navegador en la primera carga de cada ruta.

   Uso:  node scripts/measure-bundle.cjs            (imprime tabla)
         node scripts/measure-bundle.cjs --json     (salida JSON) */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '.next');
const APP = path.join(ROOT, 'server', 'app');
const PAGES = {
  '/': 'index.html',
  '/buscar': 'buscar.html',
  '/reportes': 'reportes.html',
  '/recomendaciones': 'recomendaciones.html',
  '/reportar': 'reportar.html',
};

const gzCache = new Map();
function gzSize(rel) {
  if (gzCache.has(rel)) return gzCache.get(rel);
  const fp = path.join(ROOT, rel.replace('/_next/', ''));
  let n = 0;
  try { n = zlib.gzipSync(fs.readFileSync(fp), { level: 9 }).length; } catch { n = 0; }
  gzCache.set(rel, n);
  return n;
}

function chunksFor(htmlFile) {
  const h = fs.readFileSync(path.join(APP, htmlFile), 'utf8');
  const set = new Set();
  const re = /\/_next\/static\/[^"']+?\.(?:js|css)/g;
  let m;
  while ((m = re.exec(h))) set.add(m[0]);
  return [...set];
}

const rows = [];
for (const [route, file] of Object.entries(PAGES)) {
  if (!fs.existsSync(path.join(APP, file))) continue;
  const chunks = chunksFor(file);
  const js = chunks.filter(c => c.endsWith('.js'));
  const css = chunks.filter(c => c.endsWith('.css'));
  const jsBytes = js.reduce((a, c) => a + gzSize(c), 0);
  const cssBytes = css.reduce((a, c) => a + gzSize(c), 0);
  rows.push({ route, jsChunks: js.length, jsKB: +(jsBytes / 1024).toFixed(1), cssKB: +(cssBytes / 1024).toFixed(1), totalKB: +((jsBytes + cssBytes) / 1024).toFixed(1) });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('First Load (gzip) por página — JS + CSS referenciados en el HTML prerenderizado\n');
  console.log('Ruta'.padEnd(20), 'JS chunks'.padStart(10), 'JS KB'.padStart(9), 'CSS KB'.padStart(8), 'Total KB'.padStart(10));
  console.log('-'.repeat(60));
  for (const r of rows) {
    console.log(r.route.padEnd(20), String(r.jsChunks).padStart(10), String(r.jsKB).padStart(9), String(r.cssKB).padStart(8), String(r.totalKB).padStart(10));
  }
}
