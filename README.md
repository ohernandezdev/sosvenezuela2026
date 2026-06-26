# SOS Venezuela 2026

Plataforma civil y humanitaria creada tras el terremoto del 24 de junio de 2026 en Venezuela (M7.2 / M7.5, costa de Falcón–Carabobo). Centraliza **reportes de daños estructurales**, un **directorio público de personas desaparecidas/encontradas**, **centros de acopio** y coordinación comunitaria, con datos agregados de múltiples plataformas ciudadanas.

En producción: **https://sosvenezuela2026.com**

> Proyecto sin fines de lucro, sin afiliación política. Los datos provienen de carteles públicos y registros comunitarios. Las coordenadas se truncan y los datos sensibles (cédulas, menores, contactos) se enmascaran para proteger a las personas (anti-saqueo / anti-scraping).

## Funcionalidades

- 🗺️ **Mapa en vivo** de sucesos (edificios colapsados/dañados, fugas de gas, vías bloqueadas, personas atrapadas) con SSE.
- 🔎 **Directorio de personas** público con buscador anti-scraping, fotos y aportes de la comunidad.
- 📦 **Centros de acopio** geolocalizados.
- ✅ **Validación** de daños estructurales (vecinos + ingenieros).
- 🔐 Login con **Google OAuth** + panel de administración.
- 📊 Estadísticas de tráfico y reportes.

## Stack

- **Next.js 16** (App Router, Turbopack, output standalone) + TypeScript
- **Tailwind v4**, framer-motion, Leaflet / react-leaflet
- **PostgreSQL** (Neon) vía `pg`
- Despliegue en **Docker** detrás de nginx/haproxy

## Desarrollo local

Requisitos: Node.js 22+, una base de datos PostgreSQL.

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local   # y rellena con tus valores

# 3. Levantar el servidor de desarrollo
npm run dev
```

Abre http://localhost:3000.

### Variables de entorno

Todas las variables están documentadas en [`.env.example`](./.env.example). Los secretos
(`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`) **solo** se leen del
entorno en el servidor y nunca se exponen al cliente. Únicamente las variables con prefijo
`NEXT_PUBLIC_` llegan al navegador, y ninguna de ellas contiene información sensible.

## Scripts de sincronización de datos

En [`scripts/`](./scripts) hay dos procesos opcionales (pensados para correr por cron) que
alimentan el mapa y el directorio con datos de plataformas ciudadanas:

- `sync.cjs` — importa personas (venezuelatebusca, desaparecidosterremotovenezuela,
  desaparecidosvenezuela), edificios y centros de acopio, con **deduplicación** por
  `ext_id` y firma de identidad. Requiere `DATABASE_URL` y, para algunas fuentes,
  `VTB_KEY` / `TVE_KEY` (ver `.env.example`).
- `newsweep.cjs` — barre Google News, geolocaliza con Ollama local + Nominatim e inserta
  reportes `unverified`. Requiere `DATABASE_URL` (y Ollama corriendo).

```bash
node scripts/sync.cjs
node scripts/newsweep.cjs
```

## Puente SMS (sin internet)

Tras el terremoto, gran parte de Venezuela quedó **sin datos móviles, solo con SMS**. El SMS
viaja por el canal de señalización de la red celular, así que sigue funcionando aunque caiga
internet. El endpoint `POST /api/sms` es un **puente agnóstico del transporte** que deja a
cualquier persona usar la plataforma por SMS:

| SMS que envía el ciudadano | Acción |
|---|---|
| `BIEN Juan Perez, Catia` | Se registra como **a salvo** (estoy bien) |
| `BUSCAR Maria Gomez` | Busca en el directorio de personas (datos enmascarados) |
| `VISTO Maria Gomez, Maracay` | Aporta un **avistamiento** de alguien |
| `DANO Catia: edificio agrietado` | Reporta un **daño estructural** |
| `ACOPIO Valencia` | Lista **centros de acopio/refugios** cercanos |
| `AYUDA` | Devuelve la lista de comandos |

Funciona con dos transportes (el núcleo en [`lib/sms.ts`](./lib/sms.ts) es el mismo):

- **Gateway local (recomendado para alcance dentro de Venezuela):** un Android viejo o una
  Raspberry Pi + módem GSM con SIM venezolana, corriendo `android-sms-gateway`/Gammu. El
  ciudadano escribe a un **número local** (SMS nacional barato y con buena entrega). El nodo
  apunta su webhook a `…/api/sms?key=$SMS_WEBHOOK_SECRET` y responde el JSON `{ reply, to }`.
- **Twilio:** manda `From`/`Body` (form-urlencoded) y recibe **TwiML** de vuelta. Mejor para
  avisar a la **diáspora** (números fuera de Venezuela); caro y poco fiable hacia Venezuela.

El endpoint exige el secreto `SMS_WEBHOOK_SECRET`, limita a 12 SMS/min por número, pasa el
texto libre por el filtro anti-fraude (`lib/moderacion.ts`) y nunca expone datos de contacto.
Aplica el esquema una vez con:

```bash
psql "$DATABASE_URL_UNPOOLED" -f scripts/sms.sql
```

## Build de producción

```bash
docker build -t sosvenezuela .
docker run -d --env-file .env.prod -p 3000:3000 sosvenezuela
```

## API pública

Los datos son abiertos para fines humanitarios. Endpoints de **solo lectura** con **CORS abierto**
(sin autenticación) — documentación completa en **https://sosvenezuela2026.com/docs**:

| Endpoint | Descripción |
|---|---|
| `GET /api/reports` | Reportes del mapa (daños, acopios) — últimos 500 |
| `GET /api/persons/list` | Directorio de personas (`?q=`, `?estado=`, `?limit=`, `?offset=`) |
| `GET /api/persons/stats` | Cifras agregadas (desaparecidos / encontrados) |
| `GET /api/damage/recent` | Últimos análisis de daño estructural |

Límite ~90 req/min por IP. Cita la fuente como «SOS Venezuela 2026» y respeta la privacidad
(no desanonimices cédulas, coordenadas ni menores). La escritura requiere iniciar sesión.

## Contribuir

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](./CONTRIBUTING.md) para empezar.

## Seguridad

- Ningún secreto se versiona: `.env*` está en `.gitignore` (excepto la plantilla `.env.example`).
- Si encuentras una vulnerabilidad, por favor repórtala de forma responsable antes de divulgarla.

## Licencia

MIT — ver [LICENSE](./LICENSE).
