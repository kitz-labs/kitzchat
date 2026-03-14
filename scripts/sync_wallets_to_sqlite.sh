#!/usr/bin/env bash
set -euo pipefail
# Backup sqlite DB
DB_HOME=/opt/kitzchat/state
SQLITE_DB="$DB_HOME/kitzchat.db"
BACKUP="$DB_HOME/kitzchat.db.bak"
cp "$SQLITE_DB" "$BACKUP" || true
# For each wallet in Postgres, compute cents = ROUND(balance_credits * 100 / CREDIT_MULTIPLIER)
# Default CREDIT_MULTIPLIER=1000
CREDIT_MULTIPLIER=1000
# Query Postgres for user_id and computed cents
docker compose -f /opt/kitzchat/docker-compose.yml exec -T db psql -U kitzchat -d kitzchat -t -A -F"," -c "SELECT user_id, ROUND(balance_credits * 100.0 / ${CREDIT_MULTIPLIER}) FROM wallets;" | \
while IFS=, read -r uid cents; do
  cents=${cents:-0}
  echo "Setting user $uid wallet_balance_cents=$cents"
  sqlite3 "$SQLITE_DB" "UPDATE users SET wallet_balance_cents = $cents WHERE id = $uid;"
done
# Show a sample of updated users
echo '--- sample users ---'
sqlite3 "$SQLITE_DB" 'SELECT id,username,wallet_balance_cents FROM users ORDER BY id LIMIT 20;'
exit 0
