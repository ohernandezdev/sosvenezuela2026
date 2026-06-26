// API pública del paquete sms-data-gateway.

export { defineGateway, type Gateway } from './core/gateway.js';
export type {
  GatewayConfig, CommandSpec, FieldSpec, HandlerContext,
  StorageAdapter, DataRecord, InboundMessage, InboundLog, ProcessResult,
} from './core/types.js';

// Servidor HTTP listo para usar (sin framework).
export { createGatewayServer, type ServerOptions } from './server.js';

// Transportes (proveedores de SMS).
export type { Transport, RawRequest, TransportReply } from './transports/types.js';
export { genericTransport } from './transports/generic.js';
export { androidTransport } from './transports/android.js';
export { cloudTransport } from './transports/cloud.js';

// Almacenamiento.
export { memoryStorage } from './storage/memory.js';
export { jsonFileStorage } from './storage/jsonfile.js';
export { webhookStorage } from './storage/webhook.js';
export { postgresStorage } from './storage/postgres.js';

// Utilidades por si las necesitas en handlers.
export { moderar } from './core/moderation.js';
export { prepararRespuesta } from './core/text.js';
