// ─────────────────────────────────────────────────────────────
// Núcleo del puente SMS ↔ plataforma. Es AGNÓSTICO del transporte
// (Twilio, android-sms-gateway/Gammu, etc.): solo recibe el texto
// crudo de un SMS y devuelve qué comando es, sus argumentos ya
// limpios, y construye las respuestas cortas (≤ ~160 chars).
//
// Diseñado para SMS reales en una emergencia: una sola palabra clave
// al inicio, sin acentos ni ñ en las respuestas (para no forzar UCS-2
// y partir el mensaje en más segmentos de los necesarios), tolerante
// a mayúsculas/minúsculas y acentos en la ENTRADA.
// ─────────────────────────────────────────────────────────────

export type SmsCommand =
  | 'AYUDA'
  | 'BIEN'
  | 'BUSCAR'
  | 'VISTO'
  | 'DANO'
  | 'ACOPIO'
  | 'DESCONOCIDO';

export interface ParsedSms {
  command: SmsCommand;
  /** Texto que sigue a la palabra clave, sin recortar (trim aplicado). */
  rest: string;
}

const KEYWORDS: Record<string, SmsCommand> = {
  ayuda: 'AYUDA', help: 'AYUDA', info: 'AYUDA', menu: 'AYUDA',
  bien: 'BIEN', estoy: 'BIEN', ok: 'BIEN', salvo: 'BIEN',
  buscar: 'BUSCAR', busco: 'BUSCAR', donde: 'BUSCAR',
  visto: 'VISTO', vi: 'VISTO', vista: 'VISTO',
  dano: 'DANO', danos: 'DANO', reporte: 'DANO', reportar: 'DANO',
  acopio: 'ACOPIO', acopios: 'ACOPIO', ayudaen: 'ACOPIO', refugio: 'ACOPIO',
};

/** Quita acentos, ñ→n y pasa a minúsculas. Solo para COMPARAR/normalizar entrada. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Detecta el comando a partir de la primera palabra del SMS. */
export function parseSms(body: string): ParsedSms {
  const raw = (body || '').trim();
  const firstSpace = raw.search(/\s/);
  const head = firstSpace === -1 ? raw : raw.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : raw.slice(firstSpace + 1).trim();
  const key = normalizar(head).replace(/[^a-z]/g, '');
  const command = KEYWORDS[key] || (raw === '' ? 'AYUDA' : 'DESCONOCIDO');
  return { command, rest };
}

/**
 * Parte "nombre, zona" usando la primera coma (o el primer ':' o '-').
 * Si no hay separador, todo es `nombre` y `zona` queda vacío.
 */
export function partirNombreZona(rest: string): { nombre: string; zona: string } {
  const m = rest.split(/\s*[,:;\-]\s*/);
  const nombre = (m[0] || '').trim();
  const zona = m.slice(1).join(', ').trim();
  return { nombre, zona };
}

const MAP_ESTADO: Record<string, string> = {
  seeking_info: 'SE BUSCA',
  found_alive: 'ENCONTRADO/A VIVO/A',
  found_deceased: 'FALLECIDO/A',
};

export function estadoLegible(status: string | null | undefined): string {
  return MAP_ESTADO[status || ''] || (status || 'SIN ESTADO').toUpperCase();
}

/** Recorta a `max` chars sin partir groseramente; añade "…" si recorta. */
export function recortar(texto: string, max = 306): string {
  if (texto.length <= max) return texto;
  return texto.slice(0, max - 1).trimEnd() + '…';
}

export const TEXTO_AYUDA = recortar(
  'SOS Venezuela. Envia:\n' +
  'BIEN nombre, zona (estoy a salvo)\n' +
  'BUSCAR nombre (persona)\n' +
  'VISTO nombre, zona (la vi)\n' +
  'DANO zona: que paso\n' +
  'ACOPIO zona (ayuda cerca)'
);

export const TEXTO_DESCONOCIDO = recortar(
  'No entendi el mensaje. Escribe AYUDA para ver los comandos disponibles.'
);

export const TEXTO_BLOQUEADO = recortar(
  'Mensaje no registrado: no incluyas correos, telefonos, cuentas, Zelle, Binance ni cripto. ' +
  'Es por tu seguridad y la de los demas.'
);
