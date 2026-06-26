import LandingClient from './LandingClient';
import pool from '@/lib/db';
import type { HazardEvent } from './sse-provider';

// ISR: el HTML se cachea CON los datos y se regenera cada 20s. Así los usuarios
// reciben TTFB de página estática (servida desde caché) pero con los reportes y
// cifras ya incrustados — sin la cascada cliente "descargar JS → hidratar →
// fetch → render", que es lo más caro en una red 3G lenta.
export const revalidate = 20;

type PStats = { missing: number; found: number; total: number };

// Las queries son resilientes: si no hay BD disponible (p.ej. en build) devuelven
// vacío y el cliente hace el fetch de respaldo. En producción el HTML llega con datos.
async function getReports(): Promise<HazardEvent[]> {
  try {
    const res = await pool.query(
      `SELECT id, category, severity, resource_status, verification, title, description,
              lat_pub, lng_pub, municipio, parroquia, source_url, image_url,
              site_vs30, site_class, created_at
       FROM hazard_reports
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 500`
    );
    return res.rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) as HazardEvent[];
  } catch {
    return [];
  }
}

async function getPstats(): Promise<PStats | null> {
  try {
    const r = await pool.query(`SELECT status, count(*)::int AS n FROM person_public GROUP BY status`);
    let missing = 0, found = 0, total = 0;
    for (const row of r.rows) {
      total += row.n;
      if (row.status === 'seeking_info') missing += row.n;
      else if (['found_alive', 'self_safe', 'sheltered', 'hospitalized'].includes(row.status)) found += row.n;
    }
    return { missing, found, total };
  } catch {
    return null;
  }
}

export default async function Page() {
  const [initialReports, initialPstats] = await Promise.all([getReports(), getPstats()]);
  return <LandingClient initialReports={initialReports} initialPstats={initialPstats} />;
}
