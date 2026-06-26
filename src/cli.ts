#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGatewayServer } from './server.js';
import type { Gateway } from './core/gateway.js';

// Levanta un gateway desde un archivo de configuración:
//   sms-gateway ./mi.config.js
// El archivo debe exportar por defecto el objeto de defineGateway().

const arg = process.argv[2];
if (!arg) {
  console.error('Uso: sms-gateway <ruta-config>\nEj: sms-gateway ./examples/sos.config.js');
  process.exit(1);
}

const mod = await import(pathToFileURL(resolve(arg)).href);
const gateway: Gateway | undefined = mod.default ?? mod.gateway;
if (!gateway || typeof gateway.process !== 'function') {
  console.error(`El archivo "${arg}" debe exportar por defecto un gateway de defineGateway().`);
  process.exit(1);
}

const port = Number(process.env.PORT || 8080);
const secret = process.env.SMS_WEBHOOK_SECRET || '';
if (!secret) {
  console.warn('⚠  SMS_WEBHOOK_SECRET no está definido: el endpoint rechazará todo. Defínelo antes de producción.');
}

const server = createGatewayServer({ gateway, secret });
server.listen(port, () => {
  console.log(`✓ ${gateway.config.name} escuchando en http://localhost:${port}/sms`);
  console.log(`  Comandos: ${gateway.config.commands.map((c) => (Array.isArray(c.keyword) ? c.keyword[0] : c.keyword).toUpperCase()).join(', ')}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    gateway.config.storage.close?.().finally(() => process.exit(0));
  });
}
