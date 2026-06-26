import type { StorageAdapter, DataRecord } from '../core/types.js';

// Reenvía cada registro a una API que la página YA tenga. Es la opción
// para integrar el gateway sin tocar tu base de datos: tú expones un
// endpoint y aquí le hacemos POST con el JSON del registro.
//
// Para comandos de lectura (BUSCAR) define `queryUrl`: se le hace GET
// con ?command=&q=&limit= y debe devolver un array de registros.
export function webhookStorage(opts: {
  url: string;
  queryUrl?: string;
  /** Cabeceras extra (p.ej. Authorization). */
  headers?: Record<string, string>;
}): StorageAdapter {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  return {
    async save(r: DataRecord) {
      const res = await fetch(opts.url, { method: 'POST', headers, body: JSON.stringify(r) });
      if (!res.ok) throw new Error(`webhook save ${res.status}`);
    },
    async query(command, query, limit) {
      if (!opts.queryUrl) return [];
      const u = new URL(opts.queryUrl);
      u.searchParams.set('command', command);
      u.searchParams.set('q', query);
      u.searchParams.set('limit', String(limit));
      const res = await fetch(u, { headers });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? (data as DataRecord[]) : [];
    },
  };
}
