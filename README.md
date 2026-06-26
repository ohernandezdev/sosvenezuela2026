# sms-data-gateway

**Gateway SMS plug-and-play para recopilar datos por SMS cuando no hay internet del lado del ciudadano.**

Pensado para emergencias y proyectos cívicos (nació tras el terremoto de Venezuela de 2026, donde gran parte del país quedó **solo con SMS**). El SMS viaja por el canal de señalización de la red celular, así que **sigue funcionando aunque caiga internet**. Solo el *gateway* necesita conexión: una persona sin datos manda un SMS normal y tú recopilas/respondes.

Cualquier página puede montarlo: **tú declaras tus comandos** (palabra clave + campos + a dónde van los datos) y el gateway se encarga de **parsear, validar, anti-fraude, rate-limit, generar el `AYUDA`, multi-proveedor y responder**.

```
Ciudadano sin internet        Gateway (1 nodo con          Tu almacén
(solo señal celular)          algo de conexión)            (JSON / Postgres / tu API)
       │  SMS "BIEN Ana, Catia"      │                          │
       ├────────────────────────────►│  POST /sms?key=SECRET    │
       │                             ├─────────────────────────►│ guarda
       │  "Registrado: Ana BIEN..."  │  reply                   │
       │◄────────────────────────────┤◄─────────────────────────┤
```

## Pruébalo en 1 minuto (sin hardware, sin pagar nada)

```bash
npm install
SMS_WEBHOOK_SECRET=secreto npm run dev      # levanta el gateway de ejemplo
# en otra terminal:
./examples/curl-test.sh                       # simula SMS entrantes con curl
```

Verás cómo entra `BIEN Ana, Catia`, se guarda y responde; cómo `BUSCAR Ana` la encuentra; y cómo un mensaje con un Zelle queda **bloqueado** por el anti-fraude. Los datos se guardan en `data/sos.jsonl`.

## Define tu propia campaña

Crea un archivo de config y declara tus comandos. Esto es **todo** lo que escribes:

```ts
import { defineGateway, jsonFileStorage } from 'sms-data-gateway';

export default defineGateway({
  name: 'SOS',
  storage: jsonFileStorage('data/sos.jsonl'),   // o postgresStorage / webhookStorage
  commands: [
    {
      keyword: ['BIEN', 'ESTOY'],
      description: 'Reportarte a salvo',
      fields: [
        { name: 'nombre', required: true, hint: 'nombre' },
        { name: 'zona', hint: 'zona' },
      ],
      reply: (f) => `Registrado: ${f.nombre} esta BIEN${f.zona ? ' en ' + f.zona : ''}.`,
    },
    {
      keyword: 'BUSCAR',                          // comando de LECTURA: usa handler
      description: 'Buscar a una persona',
      handler: async ({ text, storage }) => {
        const hits = (await storage.query?.('BIEN', text.trim(), 3)) ?? [];
        return hits.length ? hits.map((r) => r.fields.nombre).join('\n') : 'Sin resultados';
      },
    },
  ],
});
```

Arráncalo:

```bash
SMS_WEBHOOK_SECRET=$(openssl rand -hex 16) npx sms-gateway ./mi.config.js
```

El comando `AYUDA` se genera solo a partir de tus comandos. No tienes que escribirlo.

## Conectar SMS de verdad (elige uno)

El gateway es **agnóstico del proveedor**: el mismo código sirve para los tres. Apunta el webhook del proveedor a `https://TU-SERVIDOR/sms?key=$SMS_WEBHOOK_SECRET`.

### A) Número en la nube — lo más fácil, sin hardware
Compra un número en un proveedor tipo **Twilio** (o compatible). En su consola, configura el webhook de "mensaje entrante" hacia tu `/sms?key=...`. El proveedor recibe `From`/`Body` y el gateway responde **TwiML**, así que el SMS de respuesta se envía solo. Ideal para empezar y para avisar a la **diáspora** (números fuera del país).

### B) Android gateway — más barato y con mejor entrega dentro de Venezuela
Un teléfono **Android** con SIM local (número nacional) corriendo [`android-sms-gateway`](https://github.com/capcom6/android-sms-gateway). Configura su webhook de `sms:received` hacia tu `/sms?key=...`. El ciudadano escribe a un número **local** → SMS nacional barato y con buena entrega. El nodo solo necesita conexión donde esté el teléfono (Wi-Fi, Starlink, una línea que jale).
> Nota: la app del teléfono no auto-responde con el cuerpo del webhook; para devolver el SMS de respuesta, usa su API de envío con el `{ reply, to }` que devuelve el gateway.

### C) Módem USB / Gammu — sin smartphone (opcional, más técnico)
Un módem GSM USB en una Raspberry Pi/PC con [Gammu](https://wammu.eu/gammu/). Configura un pequeño reenviador que haga POST de cada SMS recibido a `/sms?key=...`. Mismo formato `{ from, text }` del transporte genérico.

## ¿A dónde van los datos? (storage adapters)

| Adapter | Uso |
|---|---|
| `jsonFileStorage(path)` | Archivo JSON-lines local. Cero servicios. Ideal para empezar. |
| `postgresStorage({ connectionString })` | PostgreSQL. Crea las tablas solo. Requiere `npm install pg`. |
| `webhookStorage({ url, queryUrl? })` | **Reenvía cada registro a la API que tu página YA tiene.** No tocas tu BD. |
| `memoryStorage()` | En memoria, para pruebas. |

¿Tu propia base de datos rara? Implementa la interfaz `StorageAdapter` (`save`, y opcional `query`/`log`).

## Desplegar

```bash
# Docker (un comando)
SMS_WEBHOOK_SECRET=$(openssl rand -hex 16) docker compose up --build

# o a mano
npm run build && SMS_WEBHOOK_SECRET=... node dist/src/cli.js dist/examples/sos.config.js
```

Detrás de un proxy con HTTPS (nginx/caddy). El endpoint exige `SMS_WEBHOOK_SECRET` (query `?key=` o cabecera `x-sms-key`).

## Integrar en Next.js (sin el servidor del paquete)

¿Ya tienes una app Next.js? Copia [`examples/nextjs-route.ts`](./examples/nextjs-route.ts) a `app/api/sms/route.ts` y usa el storage que prefieras. El núcleo (`defineGateway`, transportes) funciona igual fuera del servidor incluido.

## Por qué gasta pocos SMS

- Comandos de **una palabra**, una sola ida y vuelta por interacción.
- Respuestas **sin acentos ni ñ**: no fuerzan codificación UCS-2 (que partiría el SMS de 160 a 70 caracteres → más segmentos → más costo).
- Rate-limit por número: el abuso no consume tu saldo saliente.
- Recorte automático de la respuesta a 2 segmentos como máximo.

## Seguridad y privacidad

- **Anti-fraude** integrado: bloquea texto libre con correos, teléfonos, cuentas, Zelle, Binance, Pago Móvil y wallets cripto (vector típico de estafa en emergencias).
- Secreto compartido obligatorio en el webhook.
- Bitácora cruda opcional (`log`) para auditoría.
- Tú decides qué responde cada comando: no expongas datos sensibles en las respuestas.

## Desarrollo

```bash
npm run dev        # servidor de ejemplo con recarga
npm test           # tests del núcleo (sin hardware)
npm run typecheck
npm run build
```

## Licencia

MIT — ver [LICENSE](./LICENSE). Anti-fraude adaptado del proyecto SOS Venezuela 2026.
