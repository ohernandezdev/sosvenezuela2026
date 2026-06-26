// Límite deslizante en memoria, por clave (número). Anti-abuso simple
// y sin dependencias. Un proceso = una ventana (suficiente para un
// gateway self-host de un solo nodo).

const hits = new Map<string, number[]>();

export function permitir(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
  }
  return arr.length <= max;
}
