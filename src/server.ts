import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Gateway } from './core/gateway.js';
import type { Transport, RawRequest } from './transports/types.js';
import { cloudTransport } from './transports/cloud.js';
import { androidTransport } from './transports/android.js';
import { genericTransport } from './transports/generic.js';

// Orden importa: el genérico es catch-all y va al final.
const DEFAULT_TRANSPORTS: Transport[] = [cloudTransport, androidTransport, genericTransport];

export interface ServerOptions {
  gateway: Gateway;
  /** Secreto compartido. El webhook debe traer ?key= o cabecera x-sms-key. */
  secret?: string;
  transports?: Transport[];
  path?: string;
}

export function createGatewayServer(opts: ServerOptions) {
  const transports = opts.transports ?? DEFAULT_TRANSPORTS;
  const path = opts.path ?? '/sms';
  const secret = opts.secret ?? process.env.SMS_WEBHOOK_SECRET ?? '';

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://localhost');

    // Healthcheck.
    if (req.method === 'GET' && url.pathname === path) {
      return json(res, 200, { ok: true, service: 'sms-data-gateway', name: opts.gateway.config.name });
    }
    if (req.method !== 'POST' || url.pathname !== path) {
      return json(res, 404, { error: 'not found' });
    }

    // Autenticación del webhook.
    const key = url.searchParams.get('key') || header(req, 'x-sms-key');
    if (!secret || key !== secret) {
      return json(res, 401, { error: 'no autorizado' });
    }

    const body = await readBody(req);
    const raw: RawRequest = {
      method: 'POST',
      contentType: header(req, 'content-type') || '',
      query: url.searchParams,
      body,
    };

    const transport = transports.find((t) => t.match(raw)) ?? genericTransport;
    const msg = transport.parse(raw);
    if (!msg || !msg.from) {
      return json(res, 400, { error: 'falta remitente o cuerpo' });
    }

    const result = await opts.gateway.process(msg);
    if (!result.delivered) {
      // Ignorado por rate-limit: respuesta vacía en el formato del transporte.
      const empty = transport.formatReply('', msg);
      res.writeHead(empty.status, empty.headers);
      return res.end(empty.body);
    }

    const out = transport.formatReply(result.reply, msg);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  });
}

function header(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : (v || '');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 64_000) req.destroy(); // límite anti-abuso
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });
}

function json(res: ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
