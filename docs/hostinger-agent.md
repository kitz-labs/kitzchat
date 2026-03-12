# Hostinger Agent Deployment Brief for KitzChat

## Project

- Name: KitzChat
- Repository: https://github.com/kitz-labs/kitzchat
- Branch: main

## App Type

KitzChat is a Next.js 16 + React 19 + TypeScript application with PostgreSQL-backed billing and wallet features.

It should be deployed as a production Node.js app.
Preferred runtime:

- Node.js 20
- pnpm
- PostgreSQL

## Build and Start

Install:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Build:

```bash
pnpm run build:standalone
```

Start production app:

```bash
PORT=3001 HOSTNAME=0.0.0.0 sh scripts/start-standalone.sh
```

Development only:

```bash
pnpm dev
```

Optional billing helper server:

```bash
pnpm billing:server
```

## Database

Use PostgreSQL.

Connection settings:

- Host: db
- Port: 5432
- Database: kitzchat
- User: kitzchat
- Password: widauer

Connection string:

```env
DATABASE_URL=postgres://kitzchat:widauer@db:5432/kitzchat
```

## Minimum Required Environment Variables

```env
AUTH_USER=
AUTH_PASS=
API_KEY=
AUTH_COOKIE_SECURE=true
DATABASE_URL=postgres://kitzchat:widauer@db:5432/kitzchat
PUBLIC_BASE_URL=https://your-domain.tld
KITZCHAT_HOST_LOCK=your-domain.tld
```

## Recommended Safe Runtime Defaults

```env
KITZCHAT_STATE_DIR=./state
KITZCHAT_WORKSPACE_ROOT=./state/runtime/default
KITZCHAT_DEFAULT_INSTANCE=default
KITZCHAT_ALLOW_POLICY_WRITE=false
KITZCHAT_ALLOW_CRON_WRITE=false
KITZCHAT_ALLOW_WORKSPACE_WRITE=false
KITZCHAT_USE_DEFAULT_AGENT_META=false
PORT=4100
```

## Optional Environment Variables

### Stripe

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
STRIPE_SUCCESS_URL=https://your-domain.tld/usage-token?payment=success&session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://your-domain.tld/usage-token?payment=cancelled
MIN_TOPUP_EUR=5
MAX_TOPUP_EUR=500
CREDIT_MULTIPLIER=1000
API_BUDGET_RATIO=0.7
RESERVE_RATIO=0.3
LOW_BALANCE_THRESHOLD_RATIO=0.2
```

### OpenAI

```env
OPENAI_API_KEY=
OPENAI_ORG=
OPENAI_ORG_ID=
OPENAI_PROJECT=
```

### Google OAuth

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.tld/api/auth/google/callback
GOOGLE_AUTH_ALLOWED_EMAILS=
GOOGLE_AUTH_ALLOWED_DOMAINS=
GOOGLE_AUTH_DEFAULT_ROLE=viewer
```

### SMTP

```env
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_FROM=
KITZCHAT_ALERT_EMAILS=
```

### Telegram

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### Analytics

```env
PLAUSIBLE_BASE_URL=https://plausible.io
PLAUSIBLE_SITE_ID=
PLAUSIBLE_API_KEY=
GA4_PROPERTY_ID=
GA4_SERVICE_ACCOUNT_JSON=
GA4_SERVICE_ACCOUNT_JSON_B64=
KITZCHAT_ANALYTICS_WEBSITE_IFRAME_URL=
KITZCHAT_ANALYTICS_SOCIAL_IFRAME_URL=
```

## Important Callback and Webhook Routes

- Stripe webhook: `/api/stripe/webhook`
- Google OAuth callback: `/api/auth/google/callback`
- Billing success URL: `/usage-token?payment=success&session_id={CHECKOUT_SESSION_ID}`
- Billing cancel URL: `/usage-token?payment=cancelled`

## Important Deployment Notes

- Use `PUBLIC_BASE_URL`, not `APP_BASE_URL`
- The app uses pnpm, not npm
- The project supports standalone output
- PostgreSQL is required for wallet, ledger, entitlements, and billing features
- Persist the PostgreSQL volume
- Persist the app state directory if possible

## Docker Reference

If Hostinger supports Docker Compose, use the repo's `docker-compose.yml` as baseline.

App container command:

```bash
sh -lc "corepack enable && pnpm install --frozen-lockfile && pnpm run build:standalone && PORT=3001 HOSTNAME=0.0.0.0 sh scripts/start-standalone.sh"
```

## Relevant Project Files

- `package.json`
- `docker-compose.yml`
- `.env.example`
- `next.config.ts`
- `ops/systemd/README.md`

## Goal

Deploy KitzChat in production on Hostinger with:

- GitHub source connection
- Node.js 20
- pnpm install/build/start
- PostgreSQL attached
- HTTPS enabled
- required environment variables configured