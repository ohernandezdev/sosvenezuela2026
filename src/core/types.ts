// ─────────────────────────────────────────────────────────────
// Tipos del núcleo. Todo el gateway gira en torno a tres piezas
// desacopladas y reemplazables:
//
//   Transport  ── recibe el SMS físico y lo normaliza a { from, text }
//   Gateway    ── parsea el comando, valida, modera, y arma la respuesta
//   Storage    ── decide a dónde van los datos recopilados
//
// El dev solo declara sus `commands` y elige un Storage. El resto
// (parseo, AYUDA, rate-limit, anti-fraude, segmentación) viene hecho.
// ─────────────────────────────────────────────────────────────

/** Un SMS entrante ya normalizado, sea cual sea el proveedor. */
export interface InboundMessage {
  /** Número del remitente (E.164 o como lo entregue el proveedor). */
  from: string;
  /** Texto del SMS. */
  text: string;
}

/** Un registro de dato recopilado, listo para almacenar. */
export interface DataRecord {
  /** Keyword canónica del comando que lo originó (p.ej. "BIEN"). */
  command: string;
  /** Campos extraídos, en el orden declarado. */
  fields: Record<string, string>;
  /** Número del remitente. */
  from: string;
  /** Texto crudo original (para auditoría). */
  raw: string;
  /** Epoch ms. Lo inyecta el gateway. */
  at: number;
}

/** A dónde van los datos. Implementa al menos `save`. */
export interface StorageAdapter {
  /** Persiste un registro recopilado. */
  save(record: DataRecord): Promise<void>;
  /**
   * Opcional: consulta registros previos (lo usan comandos de lectura
   * tipo BUSCAR). Devuelve coincidencias para `query` dentro de `command`.
   */
  query?(command: string, query: string, limit: number): Promise<DataRecord[]>;
  /** Opcional: bitácora cruda de TODO mensaje entrante (auditoría). */
  log?(entry: InboundLog): Promise<void>;
  /** Opcional: cierre de conexiones al apagar. */
  close?(): Promise<void>;
}

export interface InboundLog {
  from: string;
  text: string;
  command: string | null;
  reply: string;
  blocked: boolean;
  at: number;
}

/** Definición declarativa de un campo de un comando. */
export interface FieldSpec {
  name: string;
  required?: boolean;
  /** Texto de ejemplo para el AYUDA (p.ej. "nombre"). */
  hint?: string;
}

/** Contexto que recibe un handler personalizado. */
export interface HandlerContext {
  from: string;
  /** Texto que sigue a la keyword, sin recortar. */
  text: string;
  /** Campos ya partidos por coma (si declaraste `fields`). */
  fields: Record<string, string>;
  storage: StorageAdapter;
}

/** Un comando declarado por el dev. */
export interface CommandSpec {
  /** Palabra(s) clave que lo activan. Insensible a mayúsculas/acentos. */
  keyword: string | string[];
  /** Descripción corta (aparece en AYUDA). */
  description: string;
  /** Campos a extraer del resto del mensaje, partidos por coma. */
  fields?: FieldSpec[];
  /**
   * Respuesta a enviar. Si devuelves `string` se usa tal cual; si es
   * función, recibe los campos extraídos. Para comandos de SOLO LECTURA
   * (no guardan dato) usa `handler` en su lugar.
   */
  reply?: string | ((fields: Record<string, string>, from: string) => string);
  /**
   * Handler personalizado para comandos que LEEN datos (BUSCAR, etc.).
   * Si lo defines, el comando NO guarda automáticamente; tú controlas todo
   * y devuelves el texto de respuesta.
   */
  handler?: (ctx: HandlerContext) => Promise<string> | string;
  /** Desactiva el filtro anti-fraude para este comando (por defecto: activo). */
  moderate?: boolean;
  /** No guardar el registro automáticamente (por defecto guarda si hay `fields`). */
  store?: boolean;
}

/** Configuración completa de un gateway. */
export interface GatewayConfig {
  /** Nombre del proyecto (aparece en AYUDA). */
  name: string;
  storage: StorageAdapter;
  commands: CommandSpec[];
  /** Respuesta cuando no se entiende el comando. */
  fallbackReply?: string;
  /** Máximo de SMS por número y minuto (anti-abuso). Por defecto 12. */
  ratePerMinute?: number;
}

/** Resultado de procesar un mensaje. */
export interface ProcessResult {
  reply: string;
  record: DataRecord | null;
  command: string | null;
  blocked: boolean;
  /** false si se ignoró por rate-limit (no enviar nada). */
  delivered: boolean;
}
