#!/bin/bash
set -euo pipefail
OUT=/opt/kitzchat/stripe_customers.json
ENV=/opt/kitzchat/.env
STRIPE_KEY=""
if [ -f "$ENV" ]; then
  STRIPE_KEY=$(grep -E '^STRIPE_SECRET_KEY=' "$ENV" | tail -n1 | cut -d= -f2-)
fi
if [ -z "$STRIPE_KEY" ]; then
  echo "Missing STRIPE_SECRET_KEY in $ENV" >&2
  exit 2
fi
# Request first page (up to 100 customers)
curl -s -u "$STRIPE_KEY:" "https://api.stripe.com/v1/customers?limit=100" > "$OUT"
chmod 644 "$OUT"
echo "Wrote $OUT"
