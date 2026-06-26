import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineGateway } from '../src/core/gateway.js';
import { memoryStorage } from '../src/storage/memory.js';
import { moderar } from '../src/core/moderation.js';
import { partirKeyword, partirCampos, prepararRespuesta } from '../src/core/text.js';

function nuevoGateway() {
  const storage = memoryStorage();
  const gw = defineGateway({
    name: 'SOS',
    storage,
    commands: [
      {
        keyword: ['BIEN', 'ESTOY'],
        description: 'a salvo',
        fields: [{ name: 'nombre', required: true, hint: 'nombre' }, { name: 'zona', hint: 'zona' }],
        reply: (f) => `Registrado: ${f.nombre} BIEN${f.zona ? ' en ' + f.zona : ''}`,
      },
      {
        keyword: 'BUSCAR',
        description: 'buscar',
        handler: async ({ text, storage }) => {
          const hits = (await storage.query?.('BIEN', text.trim(), 3)) ?? [];
          return hits.length ? hits.map((r) => r.fields.nombre).join('\n') : 'Sin resultados';
        },
      },
    ],
  });
  return { gw, storage };
}

test('texto: partir keyword y campos', () => {
  assert.deepEqual(partirKeyword('BIEN Ana, Catia'), { keyword: 'BIEN', rest: 'Ana, Catia' });
  assert.deepEqual(partirCampos('Ana, Catia'), ['Ana', 'Catia']);
  assert.deepEqual(partirCampos(''), []);
});

test('salida sin acentos y recorte por segmentos', () => {
  assert.equal(prepararRespuesta('acción ñoño'), 'accion nono');
  const largo = 'a'.repeat(500);
  assert.ok(prepararRespuesta(largo, 1).length <= 160);
});

test('AYUDA se genera desde los comandos', async () => {
  const { gw } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'AYUDA' });
  assert.match(r.reply, /SOS/);
  assert.match(r.reply, /BIEN nombre, zona/);
});

test('comando con campos guarda registro y responde', async () => {
  const { gw, storage } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'BIEN Ana, Catia' });
  assert.equal(r.command, 'BIEN');
  assert.match(r.reply, /Ana BIEN en Catia/);
  assert.equal(storage.all.length, 1);
  assert.equal(storage.all[0].fields.nombre, 'Ana');
});

test('tolera acentos y mayusculas en la entrada', async () => {
  const { gw } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'estóy Maria' });
  assert.equal(r.command, 'BIEN');
});

test('campo requerido faltante da instruccion', async () => {
  const { gw, storage } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'BIEN' });
  assert.match(r.reply, /Falta nombre/);
  assert.equal(storage.all.length, 0);
});

test('handler de lectura no guarda y consulta', async () => {
  const { gw, storage } = nuevoGateway();
  await gw.process({ from: '+58412', text: 'BIEN Ana, Catia' });
  const r = await gw.process({ from: '+58413', text: 'BUSCAR Ana' });
  assert.match(r.reply, /Ana/);
  assert.equal(storage.all.length, 1); // BUSCAR no añadió nada
});

test('anti-fraude bloquea datos de pago', async () => {
  const { gw, storage } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'BIEN Ana, mi zelle es ana@mail.com aporten' });
  assert.equal(r.blocked, true);
  assert.equal(storage.all.length, 0);
  assert.deepEqual(moderar('zelle ana@mail.com').bloqueado, true);
});

test('rate-limit ignora tras el tope', async () => {
  const storage = memoryStorage();
  const gw = defineGateway({
    name: 'X', storage, ratePerMinute: 3,
    commands: [{ keyword: 'PING', description: 'p', reply: 'pong' }],
  });
  const from = '+58999';
  for (let i = 0; i < 3; i++) {
    const r = await gw.process({ from, text: 'PING' });
    assert.equal(r.delivered, true);
  }
  const r = await gw.process({ from, text: 'PING' });
  assert.equal(r.delivered, false);
  assert.equal(r.reply, '');
});

test('comando desconocido cae en fallback', async () => {
  const { gw } = nuevoGateway();
  const r = await gw.process({ from: '+58412', text: 'xyz hola' });
  assert.match(r.reply, /AYUDA/);
});
