import type { StorageAdapter, DataRecord } from '../core/types.js';
import { normalizar } from '../core/text.js';

// Almacén en memoria. Ideal para pruebas y demos (se pierde al reiniciar).
export function memoryStorage(): StorageAdapter & { all: DataRecord[] } {
  const all: DataRecord[] = [];
  return {
    all,
    async save(r) { all.push(r); },
    async query(command, query, limit) {
      const q = normalizar(query);
      return all
        .filter((r) => r.command === command &&
          Object.values(r.fields).some((v) => normalizar(v).includes(q)))
        .slice(-limit)
        .reverse();
    },
  };
}
