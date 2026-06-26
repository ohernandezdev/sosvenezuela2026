import type { InboundMessage } from '../core/types.js';
import { type RawRequest, type Transport, type TransportReply, parseBody } from './types.js';

// Transporte genérico: JSON simple. Es el camino para PROBAR con curl
// (sin hardware ni cuentas) y para integrar cualquier proveedor a mano.
//
//   Entrada:  { "from": "+58412...", "text": "BIEN Ana, Catia" }
//             (también acepta phone/sender y message/body/content)
//   Salida:   { "reply": "Registrado...", "to": "+58412..." }
export const genericTransport: Transport = {
  name: 'generic',

  // Catch-all: si ningún otro transporte reclamó la petición, este la toma.
  match() { return true; },

  parse(req: RawRequest): InboundMessage | null {
    const b = parseBody(req);
    const from = b.from ?? b.phone ?? b.phoneNumber ?? b.sender ?? '';
    const text = b.text ?? b.message ?? b.body ?? b.content ?? '';
    return from || text ? { from, text } : null;
  },

  formatReply(reply: string, msg: InboundMessage): TransportReply {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ reply, to: msg.from }),
    };
  },
};
