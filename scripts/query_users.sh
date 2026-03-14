#!/bin/bash
set -euo pipefail
OUT=/opt/kitzchat/remaining_users.txt
DB=/opt/kitzchat/state/kitzchat.db
if [ ! -f "$DB" ]; then
  echo "DB not found: $DB" >&2
  exit 2
fi
sqlite3 -header -csv "$DB" "SELECT id,username,stripe_customer_id,wallet_balance_cents,payment_status FROM users ORDER BY id;" > "$OUT"
chmod 644 "$OUT"
echo "Wrote $OUT"
