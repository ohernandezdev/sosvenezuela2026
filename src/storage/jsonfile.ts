import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StorageAdapter, DataRecord, InboundLog } from '../core/types.js';
import { normalizar } from '../core/text.js';

// Almacén en archivo JSON-lines (un objeto por línea). Cero dependencias,
// cero servicios: el camino más plug-and-play para empezar. Cada registro
// se añade a `records.jsonl` y la bitácora cruda a `<base>.inbox.jsonl`.
export function jsonFileStorage(path = 'data/records.jsonl'): StorageAdapter {
  const inboxPath = path.replace(/\.jsonl$/, '') + '.inbox.jsonl';
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= mkdir(dirname(path), { recursive: true }).then(() => {}));

  return {
    async save(r: DataRecord) {
      await ensure();
      await appendFile(path, JSON.stringify(r) + '\n');
    },
    async log(e: InboundLog) {
      await ensure();
      await appendFile(inboxPath, JSON.stringify(e) + '\n').catch(() => {});
    },
    async query(command, query, limit) {
      let txt = '';
      try { txt = await readFile(path, 'utf8'); } catch { return []; }
      const q = normalizar(query);
      const out: DataRecord[] = [];
      const lines = txt.split('\n');
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        if (!lines[i]) continue;
        try {
          const r = JSON.parse(lines[i]) as DataRecord;
          if (r.command === command &&
              Object.values(r.fields).some((v) => normalizar(v).includes(q))) {
            out.push(r);
          }
        } catch { /* línea corrupta: ignorar */ }
      }
      return out;
    },
  };
}
