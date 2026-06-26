/**
 * ─────────────────────────────────────────────────────────────────────────
 * SMS DATA GATEWAY · archivo único · cero dependencias (solo Node 18+)
 * Recopila datos por SMS cuando el ciudadano NO tiene internet (solo SMS).
 * Nació tras el terremoto de Venezuela 2026. Licencia MIT.
 *
 *   >>> PARA TU AGENTE DE IA (Claude Code / Cursor / Codex):
 *   Pega este archivo en mi proyecto y luego:
 *     1. Adapta la CONFIG DE EJEMPLO del fondo a MIS comandos.
 *     2. Conecta `storage` a MI base de datos, o usa webhookStorage({url})
 *        para reenviar cada registro a la API que ya tengo.
 *     3. Monta el endpoint POST /sms en MI framework (Next.js, Express,
 *        Hono, etc.) usando handleRequest(), o usa el server incluido.
 *     4. Define SMS_WEBHOOK_SECRET en mi entorno.
 *   NO reimplementes el parseo/anti-fraude/rate-limit: ya están aquí.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Qué trae hecho:
 *   • Comandos declarativos (keyword + campos) -> tú solo los listas.
 *   • AYUDA automático generado desde tus comandos.
 *   • Anti-fraude (bloquea Zelle/Binance/PagoMovil/cripto/telefonos/correos).
 *   • Rate-limit por número (anti-abuso, no malgasta SMS saliente).
 *   • Multi-proveedor: Twilio (TwiML), android-sms-gateway, JSON genérico.
 *   • Respuestas sin acentos y recortadas a 2 segmentos (gasta pocos SMS).
 *
 * Probar SIN hardware:
 *   SMS_WEBHOOK_SECRET=secreto npx tsx sms-gateway.ts
 *   curl 'localhost:8080/sms?key=secreto' -H 'content-type: application/json' \
 *        -d '{"from":"+58412","text":"BIEN Ana, Catia"}'
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

// ===== Tipos =======================================================
export interface InboundMessage { from: string; text: string }
export interface DataRecord {
  command: string; fields: Record<string, string>; from: string; raw: string; at: number;
}
export interface StorageAdapter {
  save(r: DataRecord): Promise<void>;
  query?(command: string, q: string, limit: number): Promise<DataRecord[]>;
  log?(e: { from: string; text: string; command: string | null; reply: string; blocked: boolean; at: number }): Promise<void>;
}
export interface FieldSpec { name: string; required?: boolean; hint?: string }
export interface CommandSpec {
  keyword: string | string[];
  description: string;
  fields?: FieldSpec[];
  reply?: string | ((f: Record<string, string>, from: string) => string);
  handler?: (ctx: { from: string; text: string; fields: Record<string, string>; storage: StorageAdapter }) => string | Promise<string>;
  moderate?: boolean;
  store?: boolean;
}
export interface GatewayConfig {
  name: string; storage: StorageAdapter; commands: CommandSpec[];
  fallbackReply?: string; ratePerMinute?: number;
}

// ===== Utilidades de texto =========================================
const arr = <T,>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const aSalida = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '');
function prepararRespuesta(t: string, maxSeg = 2): string {
  const limpio = aSalida(t);
  const max = maxSeg <= 1 ? 160 : 153 * maxSeg;
  return limpio.length <= max ? limpio : limpio.slice(0, max - 1).trimEnd() + '…';
}

// ===== Anti-fraude (estafas típicas en emergencias VE) =============
const FRAUDE: RegExp[] = [
  /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i,                                   // email
  /(?:\+?58[\s\-]?|0)(?:4(?:12|14|16|22|24|26))[\s\-]?\d{3}[\s\-]?\d{4}/,        // tel VE
  /\b(zelle|binance(?:\s?pay)?|pay\s?id|\buid\b|paypal|zinli|airtm|wally|cashea|pagom[oó]vil|pago\s?m[oó]vil)\b/i,
  /\b(usdt|usdc|trc-?20|erc-?20|tron|tether|cripto|wallet|metamask)\b/i,
  /\b(bc1[a-z0-9]{25,62}|0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})\b/,        // wallets
  /\b\d{20}\b/,                                                                  // cuenta bancaria
  /\bhttps?:\/\/|\b[a-z0-9.\-]+\.(com|net|org|me|io|app|ly)\b/i,                 // url
];
function esFraude(texto: string): boolean {
  const n = normalizar(texto).replace(/[_\-.]/g, ' ');
  return FRAUDE.some((re) => re.test(texto) || re.test(n));
}

// ===== Rate-limit en memoria =======================================
const _hits = new Map<string, number[]>();
function permitir(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const a = (_hits.get(key) || []).filter((t) => now - t < windowMs);
  a.push(now); _hits.set(key, a);
  return a.length <= max;
}

// ===== Núcleo: defineGateway =======================================
export interface Gateway {
  config: GatewayConfig;
  process(msg: InboundMessage): Promise<{ reply: string; record: DataRecord | null; command: string | null; blocked: boolean; delivered: boolean }>;
  help(): string;
}

export function defineGateway(config: GatewayConfig): Gateway {
  const rate = config.ratePerMinute ?? 12;
  const index = new Map<string, CommandSpec>();
  for (const c of config.commands) for (const k of arr(c.keyword)) index.set(normalizar(k), c);

  const help = () =>
    [`${config.name}. Envia:`, ...config.commands.map((c) => {
      const kw = arr(c.keyword)[0].toUpperCase();
      const a = (c.fields || []).map((f) => f.hint || f.name).join(', ');
      return a ? `${kw} ${a}` : kw;
    })].join('\n');

  async function process(msg: InboundMessage) {
    const from = (msg.from || '').trim();
    const text = msg.text || '';
    if (from && !permitir('rl:' + from, rate))
      return { reply: '', record: null, command: null, blocked: false, delivered: false };

    const raw = text.trim();
    const sp = raw.search(/\s/);
    const head = sp === -1 ? raw : raw.slice(0, sp);
    const rest = sp === -1 ? '' : raw.slice(sp + 1).trim();
    const kw = normalizar(head).replace(/[^a-z?]/g, '');

    let reply = '', blocked = false, command: string | null = null, record: DataRecord | null = null;

    if (raw === '' || ['ayuda', 'help', 'info', 'menu', '?'].includes(kw)) {
      reply = help();
    } else {
      const cmd = index.get(kw);
      if (!cmd) {
        reply = config.fallbackReply || 'No entendi. Escribe AYUDA para ver los comandos.';
      } else {
        command = arr(cmd.keyword)[0].toUpperCase();
        const partes = rest ? rest.split(/\s*[,;:]\s*/).map((s) => s.trim()) : [];
        const fields: Record<string, string> = {};
        (cmd.fields || []).forEach((f, i) => { fields[f.name] = (partes[i] || '').trim(); });

        if (cmd.moderate !== false && rest && esFraude(rest)) {
          blocked = true;
          reply = 'Mensaje no registrado: no incluyas correos, telefonos, cuentas, Zelle, Binance ni cripto. Es por seguridad.';
        } else {
          try {
            if (cmd.handler) {
              reply = await cmd.handler({ from, text: rest, fields, storage: config.storage });
            } else {
              const falta = (cmd.fields || []).find((f) => f.required && !fields[f.name]);
              if (falta) {
                reply = `Falta ${falta.hint || falta.name}.`;
              } else {
                if (cmd.store !== false && cmd.fields?.length) {
                  record = { command, fields, from, raw: text, at: Date.now() };
                  await config.storage.save(record);
                }
                reply = typeof cmd.reply === 'function' ? cmd.reply(fields, from)
                  : typeof cmd.reply === 'string' ? cmd.reply : 'Recibido. Gracias.';
              }
            }
          } catch { reply = 'Hubo un error. Intenta de nuevo en unos minutos.'; }
        }
      }
    }

    reply = prepararRespuesta(reply);
    config.storage.log?.({ from, text, command, reply, blocked, at: Date.now() }).catch(() => {});
    return { reply, record, command, blocked, delivered: true };
  }

  return { config, process, help };
}

// ===== Storage (elige uno o implementa StorageAdapter) =============
export function memoryStorage(): StorageAdapter & { all: DataRecord[] } {
  const all: DataRecord[] = [];
  return {
    all,
    async save(r) { all.push(r); },
    async query(command, q, limit) {
      const n = normalizar(q);
      return all.filter((r) => r.command === command && Object.values(r.fields).some((v) => normalizar(v).includes(n)))
        .slice(-limit).reverse();
    },
  };
}

/** Reenvía cada registro a una API que TU página ya tiene (no tocas tu BD). */
export function webhookStorage(o: { url: string; queryUrl?: string; headers?: Record<string, string> }): StorageAdapter {
  const headers = { 'Content-Type': 'application/json', ...(o.headers || {}) };
  return {
    async save(r) { const res = await fetch(o.url, { method: 'POST', headers, body: JSON.stringify(r) }); if (!res.ok) throw new Error('webhook ' + res.status); },
    async query(command, q, limit) {
      if (!o.queryUrl) return [];
      const u = new URL(o.queryUrl); u.searchParams.set('command', command); u.searchParams.set('q', q); u.searchParams.set('limit', String(limit));
      const res = await fetch(u, { headers }); if (!res.ok) return [];
      const d = await res.json().catch(() => []); return Array.isArray(d) ? d : [];
    },
  };
}

/** Archivo JSON-lines local (cero servicios). Bueno para empezar. */
export function jsonFileStorage(path = 'data/records.jsonl'): StorageAdapter {
  const fs = import('node:fs/promises');
  return {
    async save(r) { const m = await fs; await m.mkdir(path.replace(/\/[^/]*$/, '') || '.', { recursive: true }).catch(() => {}); await m.appendFile(path, JSON.stringify(r) + '\n'); },
    async query(command, q, limit) {
      const m = await fs; let txt = ''; try { txt = await m.readFile(path, 'utf8'); } catch { return []; }
      const n = normalizar(q); const out: DataRecord[] = []; const lines = txt.split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        if (!lines[i]) continue;
        try { const r = JSON.parse(lines[i]) as DataRecord; if (r.command === command && Object.values(r.fields).some((v) => normalizar(v).includes(n))) out.push(r); } catch { /**/ }
      }
      return out;
    },
  };
}

// ===== Transportes (proveedores de SMS) ============================
// handleRequest() es lo que llamas desde TU framework. Detecta el formato
// del proveedor, procesa, y te devuelve { status, headers, body } listo.
export async function handleRequest(gw: Gateway, req: {
  contentType: string; body: string;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const ct = req.contentType || '';
  let from = '', text = '', twilio = false;

  if (ct.includes('application/json')) {
    let j: any = {}; try { j = JSON.parse(req.body || '{}'); } catch { /**/ }
    const p = j.payload && typeof j.payload === 'object' ? j.payload : j;     // android-sms-gateway anida en payload
    from = p.from ?? p.phone ?? p.phoneNumber ?? p.sender ?? '';
    text = p.text ?? p.message ?? p.body ?? p.content ?? '';
  } else {
    const f = new URLSearchParams(req.body);
    from = f.get('From') ?? f.get('from') ?? '';
    text = f.get('Body') ?? f.get('body') ?? '';
    twilio = f.has('From') || f.has('Body');                                  // Twilio = form + From/Body
  }

  if (!from) return { status: 400, headers: { 'Content-Type': 'application/json' }, body: '{"error":"falta remitente"}' };

  const r = await gw.process({ from, text });
  const reply = r.delivered ? r.reply : '';
  if (twilio) {
    const esc = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: reply ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>` : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>' };
  }
  return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ reply, to: from }) };
}

// ===== Server HTTP incluido (opcional) =============================
export function startServer(gw: Gateway, opts: { port?: number; secret?: string; path?: string } = {}) {
  const port = opts.port ?? Number(process.env.PORT || 8080);
  const secret = opts.secret ?? process.env.SMS_WEBHOOK_SECRET ?? '';
  const path = opts.path ?? '/sms';
  const srv = createServer((req: any, res: any) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === path) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, name: gw.config.name })); }
    if (req.method !== 'POST' || url.pathname !== path) { res.writeHead(404); return res.end(); }
    const key = url.searchParams.get('key') || req.headers['x-sms-key'] || '';
    if (!secret || key !== secret) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"no autorizado"}'); }
    let body = '';
    req.on('data', (c: any) => { body += c; if (body.length > 64_000) req.destroy(); });
    req.on('end', async () => {
      const out = await handleRequest(gw, { contentType: req.headers['content-type'] || '', body });
      res.writeHead(out.status, out.headers); res.end(out.body);
    });
  });
  srv.listen(port, () => console.log(`✓ ${gw.config.name} en http://localhost:${port}${path}`));
  return srv;
}

// ===== CONFIG DE EJEMPLO (adapta esto a tu página) =================
// Reemplaza los comandos y el storage. Esto es TODO lo que escribes tú.
export const gateway = defineGateway({
  name: 'SOS',
  storage: jsonFileStorage('data/sos.jsonl'),       // o webhookStorage({ url: TU_API })
  ratePerMinute: 12,
  commands: [
    {
      keyword: ['BIEN', 'ESTOY'], description: 'Reportarte a salvo',
      fields: [{ name: 'nombre', required: true, hint: 'nombre' }, { name: 'zona', hint: 'zona' }],
      reply: (f) => `Registrado: ${f.nombre} esta BIEN${f.zona ? ' en ' + f.zona : ''}. Gracias.`,
    },
    {
      keyword: ['VISTO', 'VI'], description: 'Reportar que viste a alguien',
      fields: [{ name: 'nombre', required: true, hint: 'nombre' }, { name: 'zona', hint: 'zona' }],
      reply: (f) => `Gracias. Registramos que viste a ${f.nombre}${f.zona ? ' en ' + f.zona : ''}.`,
    },
    {
      keyword: 'BUSCAR', description: 'Buscar a una persona',     // comando de LECTURA: usa handler, no guarda
      handler: async ({ text, storage }) => {
        const q = text.trim(); if (q.length < 2) return 'Escribe el nombre. Ej: BUSCAR Maria';
        const hits = [...(await storage.query?.('BIEN', q, 3) ?? []), ...(await storage.query?.('VISTO', q, 3) ?? [])].slice(0, 3);
        if (!hits.length) return `Sin resultados para "${q}". Si la viste: VISTO ${q}, zona`;
        return hits.map((r) => `${r.fields.nombre} ${r.command === 'BIEN' ? 'esta BIEN' : 'fue vista'}${r.fields.zona ? ' en ' + r.fields.zona : ''}`).join('\n');
      },
    },
  ],
});

// Arranca el server si ejecutas este archivo directamente.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.SMS_WEBHOOK_SECRET) console.warn('⚠  Define SMS_WEBHOOK_SECRET (el endpoint rechaza todo sin el).');
  startServer(gateway);
}
