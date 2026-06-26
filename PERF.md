# Optimización de rendimiento para redes lentas (3G / Venezuela)

Este documento acompaña al PR de optimización. Explica **qué se cambió**, **por qué**
importa en una red 3G lenta e inestable, y **cómo medirlo** (antes/después) de forma
reproducible.

> Contexto: la mayoría de quienes usan el sitio durante la emergencia lo hacen desde
> móviles con señal mala e intermitente y datos caros/lentos. Cada origen nuevo
> (DNS + TCP + TLS), cada KB de JS y cada recurso render-blocking cuesta segundos.

## TL;DR — carga del home estimada en Slow 3G

| | main (antes) | esta rama (después) |
|---|:---:|:---:|
| **Tiempo estimado de carga (Slow 3G)** | **~12.0 s** | **~7.5 s** |
| Handshakes a orígenes externos render-blocking | 3.6 s (3 orígenes) | 0 s |
| Round-trips de API antes de ver datos | 2 | 0 |
| First Load JS (gzip) | 245.8 KB | 236.7 KB |

**≈ 4.5 s más rápido (−38 %)** según el modelo de `scripts/estimate-3g.cjs` (50 KB/s, RTT
400 ms). Reproducible: `node scripts/estimate-3g.cjs`. Detalle y supuestos abajo.

---

## 1. Cómo se miden las métricas (reproducible)

Hay **dos** cosas que medir, porque atacan dos cuellos de botella distintos:

### A) Peso del JS de primera carga ("First Load JS")
Determina el *Time To Interactive*. Se mide con el script incluido:

```bash
npm run build
node scripts/measure-bundle.cjs        # tabla; --json para datos crudos
```

El script parsea el HTML **prerenderizado** de cada ruta (`.next/server/app/*.html`),
extrae los `<script>`/`<link>` que el navegador descarga en la primera carga y suma su
tamaño **gzip** (nivel 9). Es decir, aproxima lo que realmente viaja por la red.

Para comparar contra `main`:
```bash
git checkout main && npm run build && node scripts/measure-bundle.cjs   # ANTES
git checkout <esta-rama> && npm run build && node scripts/measure-bundle.cjs   # DESPUÉS
```

### B) Recursos externos render-blocking en la ruta crítica
Determina el *First Contentful Paint*. No aparece en el peso del JS, pero es el factor
**más** dañino en 3G: cada hoja de estilos/origen externo bloquea el render hasta
completar DNS+TCP+TLS+descarga. Se cuenta inspeccionando el `<head>` y los recursos que
bloquean el primer pintado.

---

## 2. Resultados

### A) First Load JS (gzip) — por página

| Ruta              | main (antes) | esta rama (después) | Δ |
|-------------------|-------------:|--------------------:|----:|
| `/` (home)        | 245.8 KB     | 236.7 KB            | **−9.1 KB** |
| `/buscar`         | 237.8 KB     | 230.8 KB            | −7.0 KB |
| `/reportes`       | 236.8 KB     | 229.8 KB            | −7.0 KB |
| `/recomendaciones`| 237.9 KB     | 230.9 KB            | −7.0 KB |
| `/reportar`       | 236.1 KB     | 229.0 KB            | −7.1 KB |

El JS restante está dominado por React/React-DOM (~107 KB gzip, no reducible sin cambiar
de framework) y por el componente monolítico del home. Próximas iteraciones siguen
recortando (ver §4).

> Nota: el CSS sube ~0.9 KB porque al auto-hospedar las fuentes, next/font inyecta las
> reglas `@font-face` en el CSS same-origin. Es un costo mínimo a cambio de **eliminar
> una petición externa render-blocking** (ver abajo), un intercambio muy favorable en 3G.

### B) Recursos externos render-blocking / orígenes en la ruta crítica

| Recurso (antes, en `main`)                              | Tipo                      | Estado ahora |
|--------------------------------------------------------|---------------------------|--------------|
| `fonts.googleapis.com` (hoja de estilos de fuentes)    | **render-blocking**       | ✅ eliminado (fuentes self-hosted vía next/font) |
| `fonts.gstatic.com` (archivos de fuentes)              | origen extra (DNS/TCP/TLS)| ✅ eliminado (mismo-origen) |
| `unpkg.com` (CSS de Leaflet)                           | **render-blocking**       | ✅ eliminado (empaquetado en el chunk del mapa) |
| `platform.twitter.com/widgets.js` (~cientos de KB)     | script pesado de terceros | ✅ diferido hasta entrar en viewport |

**Antes:** 2 hojas de estilo externas render-blocking + 3 orígenes nuevos (cada uno con
su handshake) antes/alrededor del primer pintado, más el script de X compitiendo por el
ancho de banda.
**Después:** 0 hojas externas render-blocking (todo same-origen), y el script de X sólo
se descarga si el usuario llega a verlo.

En 3G (latencia alta), evitar 2–3 handshakes TLS adicionales suele ahorrar **varios
segundos** de FCP — más impacto que el propio recorte de JS.

### C) Round-trips de API antes de ver contenido (home)

En 3G la latencia (no el ancho de banda) domina. Cada petición secuencial cuesta un RTT.

| Cascada en la primera carga del home | main (antes) | esta rama (después) |
|--------------------------------------|:------------:|:-------------------:|
| Reportes del mapa (`/api/reports`)   | fetch cliente tras hidratar | **incrustado en el HTML** |
| Cifras de personas (`/api/persons/stats`) | fetch cliente tras hidratar | **incrustado en el HTML** |
| Round-trips bloqueantes hasta ver datos | **2** (tras descargar+hidratar ~230 KB de JS) | **0** |

`app/page.tsx` pasó a ser un Server Component con **ISR** (`revalidate = 20`): el HTML se
sirve cacheado (TTFB de página estática) pero ya **incluye** reportes y cifras. Antes el
usuario veía mapa y contadores vacíos hasta completar: *descargar JS → hidratar → fetch →
render*. La capa SSE sigue actualizando todo en vivo después. Si no hay BD (p.ej. en build)
el HTML sale vacío y el cliente hace el fetch de respaldo, sin romperse.

---

## 3. Cambios incluidos

**Carga / red**
- Fuentes self-hosted con `next/font` (elimina hoja externa render-blocking + 2 preconnect).
- CSS de Leaflet empaquetado local (en el chunk del mapa, no desde unpkg).
- `dns-prefetch` del CDN de tiles del mapa.
- `TweetFeed`: fetch + `widgets.js` de X diferidos hasta entrar en viewport (IntersectionObserver).
- `framer-motion` → `LazyMotion` + componente `m` (alias `Motion`): se eliminan del
  bundle crítico las piezas más pesadas (drag + layout projection) que el sitio no usa.
- Componentes bajo el pliegue (`FoundCarousel`, `NewsSection`, `TweetFeed`) cargados con
  `next/dynamic` (`ssr:false`): salen del bundle inicial.
- Home como Server Component con ISR (`revalidate=20`): reportes y cifras se renderizan en
  el servidor e incrustan en el HTML, eliminando 2 round-trips de API en la primera carga.

**Robustez en red inestable (prevención de bugs)**
- SSE: reconexión automática con backoff exponencial (1s→30s). Antes la conexión en vivo
  se cerraba para siempre al primer error de red.
- SSE: el array de `hazards` se acota (evita fuga de memoria en sesiones largas).
- `lib/realtime.ts`: limpieza correcta de conexiones SSE muertas (antes se borraban con
  una clave inexistente → fuga de memoria server-side y conteo de "en línea" inflado).
- `app/buscar`: filtros de URL con `useSearchParams`+`Suspense` (sin setState-en-effect,
  sin riesgo de mismatch de hidratación).

---

## 4. Pendiente / siguientes iteraciones

- Migrar también las secciones estáticas de marketing del home a Server Components (CTAs,
  primeros auxilios, footer) para recortar más JS de cliente.
- Proxy/redimensionado de imágenes externas (hoy se sirven a tamaño completo con `<img>`).
- Reducir pesos de fuente cargados si el diseño lo permite.
- Quitar la dependencia muerta `react-leaflet`.
- Limpiar la deuda de lint preexistente a nivel de proyecto.
