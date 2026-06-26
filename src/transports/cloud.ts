import type { InboundMessage } from '../core/types.js';
import { type RawRequest, type Transport, type TransportReply, parseBody } from './types.js';

// Transporte para números en la nube tipo Twilio (y compatibles): reciben
// el SMS como form-urlencoded con `From`/`Body` y esperan TwiML de vuelta.
// El proveedor envía el SMS de respuesta automáticamente con ese TwiML.
export const cloudTransport: Transport = {
  name: 'cloud',

  match(req: RawRequest): boolean {
    if (!req.contentType.includes('application/x-www-form-urlencoded')) return false;
    const b = parseBody(req);
    return 'Body' in b || 'From' in b;
  },

  parse(req: RawRequest): InboundMessage | null {
    const b = parseBody(req);
    const from = b.From ?? b.from ?? '';
    const text = b.Body ?? b.body ?? '';
    return from || text ? { from, text } : null;
  },

  formatReply(reply: string): TransportReply {
    const esc = reply
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = reply
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body,
    };
  },
};
