import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { moderarTexto } from '@/lib/moderacion';
import { rateLimit } from '@/lib/ratelimit';
import {
  parseSms, partirNombreZona, estadoLegible, recortar,
  TEXTO_AYUDA, TEXTO_DESCONOCIDO, TEXTO_BLOQUEADO,
} from '@/lib/sms';

// ─────────────────────────────────────────────────────────────
// Puente SMS ↔ plataforma. AGNÓSTICO del transporte:
//   • Gateway local (android-sms-gateway/Gammu): manda JSON, le
//     respondemos JSON { reply, to } para que lo envíe.
//   • Twilio: manda form-urlencoded (From/Body), le respondemos TwiML.
//
// Protegido con un secreto compartido (SMS_WEBHOOK_SECRET) porque este
// endpoint escribe en la BD. Configura el webhook del gateway con
//   .../api/sms?key=EL_SECRETO   (o cabecera x-sms-key).
// ─────────────────────────────────────────────────────────────

const SECRET = process.env.SMS_WEBHOOK_SECRET || '';

interface Incoming { from: string; body: string; twilio: boolean }

// Normaliza los muchos formatos de webhook a { from, body, twilio }.
async function leerEntrante(req: NextRequest): Promise<Incoming | null> {
  const ct = req.headers.get('content-type') || '';

  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const f = await req.formData();
    const from = String(f.get('From') || f.get('from') || f.get('phoneNumber') || '');
    const body = String(f.get('Body') || f.get('body') || f.get('message') || '');
    return from || body ? { from, body, twilio: !!f.get('From') } : null;
  }

  if (ct.includes('application/json')) {
    const j = await req.json().catch(() => null);
    if (!j) return null;
    // Acepta {from,body} | {phone,message|text} | capcom6 {payload:{phoneNumber,message}}
    const p = j.payload || j;
    const from = String(p.from ?? p.phone ?? p.phoneNumber ?? p.sender ?? '');
    const body = String(p.body ?? p.text ?? p.message ?? p.content ?? '');
    return from || body ? { from, body, twilio: false } : null;
  }

  return null;
}

function responder(reply: string, to: string, twilio: boolean): NextResponse {
  if (twilio) {
    const esc = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
    return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  }
  return NextResponse.json({ reply, to });
}

export async function POST(req: NextRequest) {
  // Autenticación del webhook.
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-sms-key') || '';
  if (!SECRET || key !== SECRET) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const inc = await leerEntrante(req);
  if (!inc || !inc.from) {
    return NextResponse.json({ error: 'Falta remitente o cuerpo.' }, { status: 400 });
  }

  const phone = inc.from.trim().slice(0, 32);
  const bodyRaw = (inc.body || '').slice(0, 480);

  // Límite por número: 12 SMS/min. Si se pasa, respondemos vacío (no gastamos saliente).
  if (!rateLimit('sms:' + phone, 12, 60_000)) {
    return responder('', phone, inc.twilio);
  }

  const { command, rest } = parseSms(bodyRaw);
  let reply = '';
  let blocked = false;
  let categorias: string[] = [];

  // Modera el texto libre (no AYUDA ni BUSCAR/ACOPIO, que son consultas de solo lectura).
  if (command === 'BIEN' || command === 'VISTO' || command === 'DANO') {
    const mod = moderarTexto(rest);
    if (mod.bloqueado) { blocked = true; categorias = mod.categorias; reply = TEXTO_BLOQUEADO; }
  }

  try {
    if (!blocked) {
      switch (command) {
        case 'AYUDA':
          reply = TEXTO_AYUDA;
          break;

        case 'BIEN': {
          const { nombre, zona } = partirNombreZona(rest);
          if (!nombre) { reply = 'Falta el nombre. Ej: BIEN Juan Perez, Catia'; break; }
          await pool.query(
            `INSERT INTO sms_checkin (from_phone, nombre, zona) VALUES ($1,$2,$3)`,
            [phone, nombre.slice(0, 80), zona.slice(0, 80) || null]
          );
          reply = `Registrado: ${nombre} esta BIEN${zona ? ' en ' + zona : ''}. Gracias. Tus seres queridos podran verlo.`;
          break;
        }

        case 'BUSCAR': {
          const q = rest.trim();
          if (q.length < 2) { reply = 'Escribe el nombre a buscar. Ej: BUSCAR Maria Gomez'; break; }
          const r = await pool.query(
            `SELECT status, cedula_masked, display_name, municipio
             FROM person_public
             WHERE display_name ILIKE $1
             ORDER BY (status='found_alive') DESC, source_date DESC
             LIMIT 3`,
            ['%' + q.slice(0, 60) + '%']
          );
          if (!r.rows.length) {
            reply = `Sin resultados para "${q}". Si la viste, envia: VISTO ${q}, zona`;
          } else {
            const lineas = r.rows.map((p) => {
              const ced = p.cedula_masked ? ` ${p.cedula_masked}` : '';
              const mun = p.municipio ? ` (${p.municipio})` : '';
              return `${p.display_name}${ced}: ${estadoLegible(p.status)}${mun}`;
            });
            reply = lineas.join('\n');
          }
          break;
        }

        case 'VISTO': {
          const { nombre, zona } = partirNombreZona(rest);
          if (!nombre) { reply = 'Falta el nombre. Ej: VISTO Maria Gomez, Maracay'; break; }
          await pool.query(
            `INSERT INTO sms_sighting (from_phone, nombre, zona) VALUES ($1,$2,$3)`,
            [phone, nombre.slice(0, 80), zona.slice(0, 80) || null]
          );
          reply = `Gracias. Registramos que viste a ${nombre}${zona ? ' en ' + zona : ''}. El equipo lo revisara.`;
          break;
        }

        case 'DANO': {
          const { nombre: zona, zona: desc } = partirNombreZona(rest);
          const descripcion = (desc || zona).trim();
          if (!descripcion) { reply = 'Describe el daño. Ej: DANO Catia: edificio agrietado calle 5'; break; }
          await pool.query(
            `INSERT INTO sms_damage (from_phone, zona, descripcion) VALUES ($1,$2,$3)`,
            [phone, desc ? zona.slice(0, 80) : null, descripcion.slice(0, 300)]
          );
          reply = 'Reporte de daño recibido. Gracias por avisar. El equipo lo revisara.';
          break;
        }

        case 'ACOPIO': {
          const q = rest.trim();
          const like = '%' + q.slice(0, 60) + '%';
          const r = await pool.query(
            `SELECT title, municipio
             FROM hazard_reports
             WHERE category IN ('aid_point','shelter','water_point')
               AND ($1 = '%%' OR municipio ILIKE $1 OR title ILIKE $1 OR description ILIKE $1)
             ORDER BY title
             LIMIT 3`,
            [like]
          );
          if (!r.rows.length) {
            reply = q ? `Sin centros registrados cerca de "${q}".` : 'Indica tu zona. Ej: ACOPIO Valencia';
          } else {
            reply = r.rows.map((c) => `${c.title}${c.municipio ? ' - ' + c.municipio : ''}`).join('\n');
          }
          break;
        }

        default:
          reply = TEXTO_DESCONOCIDO;
      }
    }
  } catch {
    reply = 'Hubo un error procesando tu mensaje. Intenta de nuevo en unos minutos.';
  }

  reply = recortar(reply);

  // Bitácora (best-effort: no debe tumbar la respuesta al ciudadano).
  pool.query(
    `INSERT INTO sms_inbox (from_phone, body_raw, command, reply, blocked, categorias)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [phone, bodyRaw, command, reply, blocked, categorias.length ? categorias : null]
  ).catch(() => {});

  return responder(reply, phone, inc.twilio);
}

// GET simple para verificar despliegue / configurar webhooks.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'sms-bridge' });
}
