// Devuelve una variante redimensionada (WebP) para las fotos servidas por
// /api/photo/<id> (ver app/api/photo/[id]/route.ts). Las URLs externas se dejan
// intactas. Mantén el MISMO width para el fondo difuminado y la imagen principal
// de una tarjeta: así comparten una sola descarga (el navegador la cachea).
export function thumb(src: string | null | undefined, w: number): string {
  if (!src) return '';
  return src.startsWith('/api/photo/') ? `${src}?w=${w}` : src;
}
