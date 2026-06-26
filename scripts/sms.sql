-- ─────────────────────────────────────────────────────────────
-- Esquema del puente SMS. Aplica una sola vez contra la BD:
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/sms.sql
--
-- Las personas se consultan sobre la vista enmascarada `person_public`
-- y los acopios sobre `hazard_reports` (no se crean aquí). Estas tablas
-- guardan lo que ENTRA por SMS, desligado de la tabla de usuarios web
-- porque quien envia un SMS no tiene cuenta.
-- ─────────────────────────────────────────────────────────────

-- Bitacora de TODO SMS entrante (auditoria, anti-fraude y reintentos).
CREATE TABLE IF NOT EXISTS sms_inbox (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone text NOT NULL,
  body_raw   text NOT NULL,
  command    text,
  reply      text,
  blocked    boolean NOT NULL DEFAULT false,
  categorias text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_inbox_phone_idx ON sms_inbox (from_phone, created_at DESC);

-- "Estoy bien" — registro de personas a salvo reportado por ellas mismas.
CREATE TABLE IF NOT EXISTS sms_checkin (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone text NOT NULL,
  nombre     text NOT NULL,
  zona       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_checkin_nombre_idx ON sms_checkin USING gin (to_tsvector('spanish', nombre));

-- "La vi" — aportes de avistamientos de la comunidad (para reconciliar a mano).
CREATE TABLE IF NOT EXISTS sms_sighting (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone text NOT NULL,
  nombre     text NOT NULL,
  zona       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reportes de daño por SMS (sin foto; triage manual por el equipo).
CREATE TABLE IF NOT EXISTS sms_damage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone  text NOT NULL,
  zona        text,
  descripcion text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
