// ─────────────────────────────────────────────────────────────
// Drop-in para una app Next.js (App Router): copia esto a
// app/api/sms/route.ts. Reutiliza tu propia BD vía webhookStorage,
// postgresStorage, etc. No necesitas el servidor HTTP del paquete.
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  defineGateway, jsonFileStorage,
  genericTransport, androidTransport, cloudTransport,
  type RawRequest,
} from 'sms-data-gateway';

const gateway = defineGateway({
  name: 'SOS',
  storage: jsonFileStorage('data/sos.jsonl'), // o postgresStorage / webhookStorage
  commands: [
    {
      keyword: ['BIEN', 'ESTOY'],
      description: 'Reportarte a salvo',
      fields: [{ name: 'nombre', required: true, hint: 'nombre' }, { name: 'zona', hint: 'zona' }],
      reply: (f) => `Registrado: ${f.nombre} esta BIEN${f.zona ? ' en ' + f.zona : ''}.`,
    },
    // ...más comandos
  ],
});

const TRANSPORTS = [cloudTransport, androidTransport, genericTransport];
const SECRET = process.env.SMS_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-sms-key') || '';
  if (!SECRET || key !== SECRET) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const raw: RawRequest = {
    method: 'POST',
    contentType: req.headers.get('content-type') || '',
    query: req.nextUrl.searchParams,
    body: await req.text(),
  };

  const transport = TRANSPORTS.find((t) => t.match(raw)) ?? genericTransport;
  const msg = transport.parse(raw);
  if (!msg?.from) return NextResponse.json({ error: 'falta remitente' }, { status: 400 });

  const result = await gateway.process(msg);
  const out = transport.formatReply(result.delivered ? result.reply : '', msg);
  return new NextResponse(out.body, { status: out.status, headers: out.headers });
}
