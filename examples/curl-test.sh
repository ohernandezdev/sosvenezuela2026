#!/usr/bin/env bash
# Prueba el gateway SIN hardware ni cuentas de SMS. Simula que llegan
# mensajes de distintos números usando el transporte genérico (JSON).
#
# 1) En una terminal:   SMS_WEBHOOK_SECRET=secreto npm run dev
# 2) En otra:           ./examples/curl-test.sh
set -euo pipefail

BASE="${BASE:-http://localhost:8080/sms}"
KEY="${SMS_WEBHOOK_SECRET:-secreto}"

sms() {
  local from="$1" text="$2"
  echo "→ [$from] $text"
  curl -s "$BASE?key=$KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"from\":\"$from\",\"text\":\"$text\"}" \
    | sed 's/^/← /'
  echo
}

sms "+584120000001" "AYUDA"
sms "+584120000001" "BIEN Ana Perez, Catia"
sms "+584120000002" "VISTO Ana Perez, Petare"
sms "+584120000003" "BUSCAR Ana"
sms "+584120000003" "DANO Catia, edificio agrietado en la calle 5"
sms "+584120000004" "BIEN Pedro. Mi zelle es pedro@mail.com aporten"   # bloqueado por anti-fraude
sms "+584120000004" "hola que es esto"                                  # fallback
