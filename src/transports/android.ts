import type { InboundMessage } from '../core/types.js';
import { type RawRequest, type Transport, type TransportReply, parseBody } from './types.js';

// Transporte para android-sms-gateway (capcom6) y similares. El dispositivo
// envía un webhook JSON con el evento "sms:received" y un payload con
// { phoneNumber, message }.
//
// Nota: la app del teléfono no responde con el cuerpo del webhook; para el
// auto-reply se configura su API de envío. Aun así devolvemos { reply, to }
// para que un relay sencillo lo reenvíe (ver README).
export const androidTransport: Transport = {
  name: 'android',

  match(req: RawRequest): boolean {
    if (!req.contentType.includes('application/json')) return false;
    const b = parseBody(req);
    return ('phoneNumber' in b) || b.event === 'sms:received';
  },

  parse(req: RawRequest): InboundMessage | null {
    const b = parseBody(req);
    const from = b.phoneNumber ?? b.phone ?? b.from ?? '';
    const text = b.message ?? b.text ?? b.body ?? '';
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
