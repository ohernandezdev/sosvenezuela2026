import type {
  GatewayConfig, CommandSpec, InboundMessage, ProcessResult, DataRecord,
} from './types.js';
import { normalizar, partirKeyword, partirCampos, prepararRespuesta } from './text.js';
import { moderar } from './moderation.js';
import { permitir } from './ratelimit.js';

const AYUDA_KEYWORDS = new Set(['ayuda', 'help', 'info', 'menu', '?']);

export interface Gateway {
  config: GatewayConfig;
  /** Procesa un SMS entrante y devuelve qué responder. */
  process(msg: InboundMessage): Promise<ProcessResult>;
  /** Texto del AYUDA (generado a partir de los comandos). */
  help(): string;
}

/**
 * Construye un gateway a partir de la configuración declarativa.
 * No sabe NADA del transporte ni del HTTP: solo texto -> texto.
 */
export function defineGateway(config: GatewayConfig): Gateway {
  const rate = config.ratePerMinute ?? 12;

  // Índice keyword(normalizada) -> comando.
  const index = new Map<string, CommandSpec>();
  for (const cmd of config.commands) {
    for (const kw of toArray(cmd.keyword)) index.set(normalizar(kw), cmd);
  }

  function help(): string {
    const lineas = config.commands.map((c) => {
      const kw = toArray(c.keyword)[0].toUpperCase();
      const args = (c.fields || []).map((f) => f.hint || f.name).join(', ');
      return args ? `${kw} ${args}` : kw;
    });
    return [`${config.name}. Envia:`, ...lineas].join('\n');
  }

  async function process(msg: InboundMessage): Promise<ProcessResult> {
    const from = (msg.from || '').trim();
    const text = msg.text || '';

    // Rate-limit: si se excede, no respondemos (no gastamos SMS saliente).
    if (from && !permitir('rl:' + from, rate)) {
      return { reply: '', record: null, command: null, blocked: false, delivered: false };
    }

    const { keyword, rest } = partirKeyword(text);
    const kwNorm = normalizar(keyword).replace(/[^a-z?]/g, '');

    let reply = '';
    let record: DataRecord | null = null;
    let blocked = false;
    let commandName: string | null = null;

    if (text.trim() === '' || AYUDA_KEYWORDS.has(kwNorm)) {
      reply = help();
    } else {
      const cmd = index.get(kwNorm);
      if (!cmd) {
        reply = config.fallbackReply || 'No entendi. Escribe AYUDA para ver los comandos.';
      } else {
        commandName = toArray(cmd.keyword)[0].toUpperCase();

        // Campos por coma, mapeados a los nombres declarados.
        const partes = partirCampos(rest);
        const fields: Record<string, string> = {};
        (cmd.fields || []).forEach((f, i) => { fields[f.name] = (partes[i] || '').trim(); });

        // Anti-fraude sobre el texto libre (salvo que el comando lo desactive).
        if (cmd.moderate !== false && rest) {
          const m = moderar(rest);
          if (m.bloqueado) {
            blocked = true;
            reply = 'Mensaje no registrado: no incluyas correos, telefonos, cuentas, Zelle, Binance ni cripto. Es por seguridad.';
          }
        }

        if (!blocked) {
          try {
            if (cmd.handler) {
              // Comando de lectura/personalizado: él controla todo.
              reply = await cmd.handler({ from, text: rest, fields, storage: config.storage });
            } else {
              // Validación de campos requeridos.
              const falta = (cmd.fields || []).find((f) => f.required && !fields[f.name]);
              if (falta) {
                reply = `Falta ${falta.hint || falta.name}. Ej: ${ejemplo(cmd)}`;
              } else {
                if (cmd.store !== false && cmd.fields?.length) {
                  record = { command: commandName, fields, from, raw: text, at: Date.now() };
                  await config.storage.save(record);
                }
                reply = resolverReply(cmd, fields, from);
              }
            }
          } catch {
            reply = 'Hubo un error procesando tu mensaje. Intenta de nuevo en unos minutos.';
          }
        }
      }
    }

    reply = prepararRespuesta(reply);

    // Bitácora best-effort.
    if (config.storage.log) {
      config.storage.log({ from, text, command: commandName, reply, blocked, at: Date.now() })
        .catch(() => {});
    }

    return { reply, record, command: commandName, blocked, delivered: true };
  }

  return { config, process, help };
}

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

function resolverReply(cmd: CommandSpec, fields: Record<string, string>, from: string): string {
  if (typeof cmd.reply === 'function') return cmd.reply(fields, from);
  if (typeof cmd.reply === 'string') return cmd.reply;
  return 'Recibido. Gracias.';
}

function ejemplo(cmd: CommandSpec): string {
  const kw = toArray(cmd.keyword)[0].toUpperCase();
  const args = (cmd.fields || []).map((f) => f.hint || f.name).join(', ');
  return args ? `${kw} ${args}` : kw;
}
