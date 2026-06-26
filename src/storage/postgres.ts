import type { StorageAdapter, DataRecord, InboundLog } from '../core/types.js';

// Almacén en PostgreSQL. Requiere el paquete opcional `pg`
// (npm install pg). Crea las tablas la primera vez.
//
// Tablas: <prefix>records (datos recopilados) y <prefix>inbox (bitácora).
export async function postgresStorage(opts: {
  connectionString: string;
  prefix?: string;
}): Promise<StorageAdapter> {
  // Import dinámico: no es dependencia obligatoria del paquete.
  const pg = await import('pg').catch(() => {
    throw new Error('Falta el paquete "pg". Instala con: npm install pg');
  });
  const prefix = opts.prefix ?? 'sms_';
  const T = `${prefix}records`;
  const L = `${prefix}inbox`;
  const pool = new pg.default.Pool({ connectionString: opts.connectionString });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      command text NOT NULL,
      fields  jsonb NOT NULL,
      from_phone text NOT NULL,
      raw text,
      at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ${T}_cmd_idx ON ${T} (command, at DESC);
    CREATE TABLE IF NOT EXISTS ${L} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_phone text NOT NULL,
      text text,
      command text,
      reply text,
      blocked boolean DEFAULT false,
      at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return {
    async save(r: DataRecord) {
      await pool.query(
        `INSERT INTO ${T} (command, fields, from_phone, raw) VALUES ($1,$2,$3,$4)`,
        [r.command, JSON.stringify(r.fields), r.from, r.raw],
      );
    },
    async log(e: InboundLog) {
      await pool.query(
        `INSERT INTO ${L} (from_phone, text, command, reply, blocked) VALUES ($1,$2,$3,$4,$5)`,
        [e.from, e.text, e.command, e.reply, e.blocked],
      ).catch(() => {});
    },
    async query(command, query, limit) {
      const r = await pool.query(
        `SELECT command, fields, from_phone, raw, extract(epoch from at)*1000 AS at
         FROM ${T}
         WHERE command = $1 AND fields::text ILIKE $2
         ORDER BY at DESC LIMIT $3`,
        [command, '%' + query + '%', limit],
      );
      return r.rows.map((row): DataRecord => ({
        command: row.command,
        fields: row.fields,
        from: row.from_phone,
        raw: row.raw,
        at: Number(row.at),
      }));
    },
    async close() { await pool.end(); },
  };
}
