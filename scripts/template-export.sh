#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DEFAULT="/tmp/kitzchat-template-${ts}"
OUT="${1:-$OUT_DEFAULT}"

mkdir -p "$OUT"

rsync -a \
  --exclude ".git" \
  --exclude ".next" \
  --exclude "node_modules" \
  --exclude "state" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude "*.db*" \
  --exclude "kitzchat-seed-fix.bundle" \
  "$ROOT/" "$OUT/"

printf "Exported template to: %s\\n" "$OUT"
printf "Next steps:\\n"
printf "  cd %s && pnpm install && cp .env.example .env\n" "$OUT"
