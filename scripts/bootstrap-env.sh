#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET_FILE=".env"
AUTH_USER_VALUE="${AUTH_USER_VALUE:-admin}"

if [[ ! -f ".env.example" ]]; then
  echo "Missing .env.example in repository root." >&2
  exit 1
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  cp .env.example "$TARGET_FILE"
fi

generate_secret() {
  local size="${1:-48}"
  local value=""

  if command -v openssl >/dev/null 2>&1; then
    value="$(openssl rand -base64 64 | tr -d '\n' | tr '/+' 'Aa' | cut -c1-"$size")"
  else
    value="$(head -c 96 /dev/urandom | base64 | tr -d '\n' | tr '/+' 'Aa' | cut -c1-"$size")"
  fi

  printf '%s' "$value"
}

upsert_kv() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v k="$key" -v v="$value" '
    BEGIN { updated=0 }
    index($0, k "=") == 1 { print k "=" v; updated=1; next }
    { print }
    END { if (!updated) print k "=" v }
  ' "$file" > "$tmp_file"

  mv "$tmp_file" "$file"
}

AUTH_PASS_VALUE="$(generate_secret 40)"
API_KEY_VALUE="$(generate_secret 48)"

upsert_kv "AUTH_USER" "$AUTH_USER_VALUE" "$TARGET_FILE"
upsert_kv "AUTH_PASS" "$AUTH_PASS_VALUE" "$TARGET_FILE"
upsert_kv "API_KEY" "$API_KEY_VALUE" "$TARGET_FILE"

echo "Updated $TARGET_FILE"
echo "AUTH_USER=$AUTH_USER_VALUE"
echo "AUTH_PASS=$AUTH_PASS_VALUE"
echo "API_KEY=$API_KEY_VALUE"
