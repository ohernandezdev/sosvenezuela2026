# SMS Data Gateway — un archivo, cero dependencias

Recopila datos por SMS cuando el ciudadano **no tiene internet** (solo SMS). El SMS viaja por la red celular, así que funciona aunque caiga internet — solo el gateway necesita conexión. Nació tras el terremoto de Venezuela 2026. **MIT.**

Todo está en **[`sms-gateway.ts`](./sms-gateway.ts)**: parseo de comandos, `AYUDA` automático, anti-fraude (Zelle/Binance/cripto), rate-limit por número, multi-proveedor (Twilio / android-sms-gateway / JSON) y respuestas que gastan pocos SMS.

## Cómo usarlo (con tu agente: Claude Code / Cursor / Codex)

1. Copia `sms-gateway.ts` a tu proyecto.
2. Pégale a tu agente este prompt:

> Acabo de añadir `sms-gateway.ts` (un gateway SMS de un solo archivo). **No reimplementes nada de su lógica.** Haz esto:
> 1. Adapta la `CONFIG DE EJEMPLO` del final a los comandos de **mi** proyecto.
> 2. Conecta `storage` a **mi** base de datos implementando `StorageAdapter`, o usa `webhookStorage({ url })` para reenviar cada registro a mi API existente.
> 3. Monta el endpoint `POST /sms` en **mi** framework (Next.js / Express / Hono) llamando a `handleRequest(gateway, { contentType, body })`. Protégelo con `SMS_WEBHOOK_SECRET` (query `?key=` o cabecera `x-sms-key`).
> 4. Dime cómo apuntar el webhook de mi proveedor de SMS a ese endpoint.

## Probarlo en 1 minuto (sin hardware, sin pagar)

```bash
SMS_WEBHOOK_SECRET=secreto npx tsx sms-gateway.ts
# en otra terminal:
curl 'localhost:8080/sms?key=secreto' -H 'content-type: application/json' \
     -d '{"from":"+58412","text":"BIEN Ana, Catia"}'
# -> {"reply":"Registrado: Ana esta BIEN en Catia. Gracias.","to":"+58412"}
```

## Conectar SMS de verdad (mismo código, elige uno)

- **Número en la nube** (Twilio/compatible): webhook → `/sms?key=...`; recibe `From`/`Body`, responde TwiML (auto-reply). Sin hardware.
- **Android** ([android-sms-gateway](https://github.com/capcom6/android-sms-gateway)) con SIM local: número nacional, barato, buena entrega dentro de Venezuela.
- **Genérico (JSON)**: para módem USB (Gammu) o cualquier proveedor; POST `{ "from", "text" }`.

## Storage

`memoryStorage()` (pruebas) · `jsonFileStorage(path)` (cero servicios) · `webhookStorage({ url })` (reenvía a tu API, no tocas tu BD) · o implementa `StorageAdapter` (`save`, opcional `query`/`log`).

---

> ¿Necesitas la versión en paquete (npm, Docker, tests, adaptador Postgres)? Está en el repo: estructura modular del mismo gateway.
