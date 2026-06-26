// ─────────────────────────────────────────────────────────────
// Ejemplo: campaña "SOS" de recolección por SMS.
// Ejecuta:  npm run dev     (y prueba con examples/curl-test.sh)
//
// Esto es TODO lo que un dev necesita escribir para su propia página:
// declara comandos y elige a dónde van los datos. El gateway hace el resto.
// ─────────────────────────────────────────────────────────────
import { defineGateway, jsonFileStorage } from '../src/index.js';

// Datos a un archivo JSON-lines local (cero servicios). Para producción
// cambia por postgresStorage({...}) o webhookStorage({ url }).
const storage = jsonFileStorage('data/sos.jsonl');

export default defineGateway({
  name: 'SOS',
  storage,
  ratePerMinute: 12,
  fallbackReply: 'No entendi. Escribe AYUDA para ver que puedes enviar.',
  commands: [
    {
      keyword: ['BIEN', 'ESTOY'],
      description: 'Reportarte a salvo',
      fields: [
        { name: 'nombre', required: true, hint: 'nombre' },
        { name: 'zona', hint: 'zona' },
      ],
      reply: (f) =>
        `Registrado: ${f.nombre} esta BIEN${f.zona ? ' en ' + f.zona : ''}. Gracias. Tus seres queridos podran verlo.`,
    },
    {
      keyword: ['VISTO', 'VI'],
      description: 'Reportar que viste a alguien',
      fields: [
        { name: 'nombre', required: true, hint: 'nombre' },
        { name: 'zona', hint: 'zona' },
      ],
      reply: (f) => `Gracias. Registramos que viste a ${f.nombre}${f.zona ? ' en ' + f.zona : ''}.`,
    },
    {
      keyword: ['DANO', 'REPORTE'],
      description: 'Reportar un dano',
      fields: [
        { name: 'zona', required: true, hint: 'zona' },
        { name: 'detalle', required: true, hint: 'que paso' },
      ],
      reply: 'Reporte de dano recibido. Gracias por avisar.',
    },
    {
      // Comando de LECTURA: usa handler, no guarda nada. Busca entre los
      // "BIEN" y "VISTO" ya recopilados.
      keyword: ['BUSCAR', 'BUSCO'],
      description: 'Buscar a una persona',
      handler: async ({ text, storage }) => {
        const q = text.trim();
        if (q.length < 2) return 'Escribe el nombre a buscar. Ej: BUSCAR Maria';
        const bien = (await storage.query?.('BIEN', q, 3)) ?? [];
        const visto = (await storage.query?.('VISTO', q, 3)) ?? [];
        const hits = [...bien, ...visto].slice(0, 3);
        if (!hits.length) return `Sin resultados para "${q}". Si la viste: VISTO ${q}, zona`;
        return hits
          .map((r) => {
            const estado = r.command === 'BIEN' ? 'esta BIEN' : 'fue vista';
            const zona = r.fields.zona ? ' en ' + r.fields.zona : '';
            return `${r.fields.nombre} ${estado}${zona}`;
          })
          .join('\n');
      },
    },
  ],
});
