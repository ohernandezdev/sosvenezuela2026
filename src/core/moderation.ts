// ─────────────────────────────────────────────────────────────
// Filtro anti-fraude. En emergencias venezolanas proliferan estafas
// pidiendo dinero (Zelle, Binance, Pago Móvil, cripto). Este filtro
// bloquea texto libre que contenga datos de contacto/pago para que el
// canal no se convierta en vector de estafa ni de doxing.
//
// Adaptado del proyecto SOS Venezuela 2026 (MIT).
// ─────────────────────────────────────────────────────────────

const PATRONES = {
  email:      /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i,
  telefono:   /(?:\+?58[\s\-]?|0)(?:4(?:12|14|16|22|24|26))[\s\-]?\d{3}[\s\-]?\d{4}/,
  handlePago: /\b(zelle|binance(?:\s?pay)?|pay\s?id|\buid\b|paypal|zinli|airtm|wally|reserve|cashea|pagom[oó]vil|pago\s?m[oó]vil)\b/i,
  binanceId:  /\bbinance\b[\s\S]{0,30}?\b\d{8,10}\b|\b(?:pay\s?id|uid)\b[\s:]*\d{8,10}/i,
  cripto_btc: /\b(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/,
  cripto_eth: /\b0x[a-fA-F0-9]{40}\b/,
  cripto_trx: /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/,
  redCripto:  /\b(usdt|usdc|trc-?20|erc-?20|tron|tether|cripto|wallet|metamask)\b/i,
  cuentaBs:   /\b\d{20}\b/,
  url:        /\bhttps?:\/\/|\b[a-z0-9.\-]+\.(com|net|org|me|io|app|ly)\b/i,
  mendicidad: /\b(ay[uú]dame\s+con|col[aá]borame|env[ií]enme\s+(a|al)|mi\s+(cuenta|zelle|pago)\s+es|para\s+(una\s+)?recarga|me\s+depositen|acepto\s+(zelle|pago|binance|cripto)|aporten?\s+a|don[ae]ciones?\s+a)\b/i,
};

function norm(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_\-.]/g, ' ')
    .toLowerCase();
}

export interface ResultadoMod {
  bloqueado: boolean;
  categorias: string[];
}

export function moderar(texto: string): ResultadoMod {
  const n = norm(texto);
  const cats: string[] = [];
  if (PATRONES.email.test(n)) cats.push('email');
  if (PATRONES.telefono.test(texto)) cats.push('telefono');
  if (PATRONES.handlePago.test(n)) cats.push('pago');
  if (PATRONES.binanceId.test(n)) cats.push('binance_id');
  if (PATRONES.cripto_btc.test(texto)) cats.push('cripto_btc');
  if (PATRONES.cripto_eth.test(texto)) cats.push('cripto_eth');
  if (PATRONES.cripto_trx.test(texto)) cats.push('cripto_trx');
  if (PATRONES.redCripto.test(n)) cats.push('red_cripto');
  if (PATRONES.cuentaBs.test(texto)) cats.push('cuenta_bs');
  if (PATRONES.url.test(n)) cats.push('url');
  if (PATRONES.mendicidad.test(n)) cats.push('mendicidad');
  return { bloqueado: cats.length > 0, categorias: cats };
}
