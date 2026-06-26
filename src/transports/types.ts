import type { InboundMessage } from '../core/types.js';

/** Petición HTTP normalizada (independiente del framework). */
export interface RawRequest {
  method: string;
  contentType: string;
  query: URLSearchParams;
  /** Cuerpo crudo como string. */
  body: string;
}

/** Respuesta HTTP que el transporte le devuelve al proveedor. */
export interface TransportReply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Un transporte traduce el formato de UN proveedor de SMS a/desde el
 * mensaje normalizado del gateway. Añadir un proveedor = añadir uno de estos.
 */
export interface Transport {
  name: string;
  /** ¿Esta petición la maneja este transporte? */
  match(req: RawRequest): boolean;
  /** Extrae el SMS entrante, o null si no se puede. */
  parse(req: RawRequest): InboundMessage | null;
  /** Formatea la respuesta saliente en el formato del proveedor. */
  formatReply(reply: string, msg: InboundMessage): TransportReply;
}

export function parseBody(req: RawRequest): Record<string, string> {
  const ct = req.contentType;
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(req.body || '{}');
      return flatten(j);
    } catch { return {}; }
  }
  // form-urlencoded
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(req.body)) out[k] = v;
  return out;
}

// Aplana un nivel de anidación (p.ej. android-sms-gateway: { payload: {...} }).
function flatten(j: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const inner = (j.payload && typeof j.payload === 'object' ? j.payload : j) as Record<string, unknown>;
  for (const [k, v] of Object.entries({ ...j, ...inner })) {
    if (v != null && typeof v !== 'object') out[k] = String(v);
  }
  return out;
}
