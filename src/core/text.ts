// ─────────────────────────────────────────────────────────────
// Utilidades de texto para SMS. Dos reglas de oro:
//   • ENTRADA: tolerante (ignora acentos/mayúsculas al comparar keywords).
//   • SALIDA: sin acentos ni ñ, para no forzar codificación UCS-2 (que
//     reduce el SMS de 160 a 70 chars y lo parte en más segmentos).
// ─────────────────────────────────────────────────────────────

/** Quita acentos y pasa a minúsculas. Solo para COMPARAR entrada. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Quita acentos/ñ para SALIDA (mantiene mayúsculas y resto del texto). */
export function aSalida(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\x7F]/g, '');
}

/** Separa la primera palabra (keyword) del resto. */
export function partirKeyword(text: string): { keyword: string; rest: string } {
  const raw = (text || '').trim();
  const i = raw.search(/\s/);
  const keyword = i === -1 ? raw : raw.slice(0, i);
  const rest = i === -1 ? '' : raw.slice(i + 1).trim();
  return { keyword, rest };
}

/** Parte el resto en campos por coma / punto y coma / dos puntos. */
export function partirCampos(rest: string): string[] {
  if (!rest) return [];
  return rest.split(/\s*[,;:]\s*/).map((s) => s.trim());
}

/** GSM-7 cabe 160 chars/segmento (153 si va concatenado). */
const SEG_SIMPLE = 160;
const SEG_CONCAT = 153;

export function contarSegmentos(texto: string): number {
  const n = texto.length;
  if (n <= SEG_SIMPLE) return 1;
  return Math.ceil(n / SEG_CONCAT);
}

/**
 * Prepara la respuesta final: la convierte a salida segura (sin acentos)
 * y la recorta a `maxSegmentos` para no gastar SMS de más.
 */
export function prepararRespuesta(texto: string, maxSegmentos = 2): string {
  const limpio = aSalida(texto);
  const max = maxSegmentos <= 1 ? SEG_SIMPLE : SEG_CONCAT * maxSegmentos;
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max - 1).trimEnd() + '…';
}
