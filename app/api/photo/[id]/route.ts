import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import pool from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const r = await pool.query('SELECT mime, data FROM person_photos WHERE id = $1', [id]);
  if (!r.rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { mime, data } = r.rows[0];

  // ?w=<px>: redimensiona on-the-fly y entrega WebP. Las fotos se guardan a
  // tamaño completo pero se muestran como miniaturas; en 3G descargar el original
  // (cientos de KB) es carísimo. Sólo se reduce (withoutEnlargement), nunca se
  // agranda. Es fail-safe: si sharp falla por cualquier motivo se sirve el
  // original — nunca empeora respecto al comportamiento anterior.
  const wRaw = req.nextUrl.searchParams.get('w');
  const w = wRaw ? parseInt(wRaw, 10) : 0;
  if (Number.isFinite(w) && w >= 16 && w <= 2000) {
    try {
      const out = await sharp(data as Buffer)
        .rotate() // respeta orientación EXIF
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();
      return new Response(new Uint8Array(out), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      // cae al original
    }
  }

  return new Response(data, {
    headers: {
      'Content-Type': mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
