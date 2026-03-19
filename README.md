<div align="center">

# KitzChat

**Multi-tenant AI SaaS OS für Admins, Operatoren und Kunden.**

KitzChat bündelt Admin Console, Workspace und Customer Portal in einer kompatiblen Next.js-Plattform für CRM, Agenten, Billing, Support und operative AI-Workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

![Hermes Dashboard Overview](./public/hermes-dashboard-mission-control.png)

</div>

---

> **Live-ready Refactor** — Die Plattform wurde auf `admin / workspace / portal` umgestellt, ohne produktive ENV-, Auth-, Billing- oder Customer-Datenflüsse destruktiv zu verändern.

## Why KitzChat?

KitzChat ist für einen sauberen Multi-Tenant-Betrieb aufgebaut: interne Plattformsteuerung, operative Teamarbeit und externe Customer Experience laufen in klar getrennten Produktflächen.

- **Admin Console** — Tenants, billing, usage, compliance, logs, integrations, global settings
- **Workspace** — CRM, sales, marketing, support, docs, analytics, automations, agent operations
- **Customer Portal** — Chat, requests, documents, billing view, help, settings, agent access
- **Backward compatible rollout** — Legacy-Routen bleiben zunächst als Wrapper erhalten
- **Produktionssichere Leitplanken** — Bestehende ENV-Namen, Auth, Wallet, Stripe, OpenAI und DB-Strukturen bleiben ungebrochen

## Screenshots

### Overview
![Hermes Dashboard CRM](./public/hermes-dashboard-mission-control.png)

### CRM
![Hermes Dashboard Overview](./public/hermes-dashboard-overview.png)



## Quick Start

> **Requires [pnpm](https://pnpm.io/installation)** — install with `npm install -g pnpm` or `corepack enable`.

```bash
git clone https://github.com/builderz-labs/hermes-dashboard.git
cd hermes-dashboard
pnpm install
pnpm env:bootstrap
pnpm dev
```

Production runs on `https://dashboard.aikitz.at` (primary) with `https://nexora.aikitz.at` as the secondary UI domain.
See `docs/production.md` for VPS details and `docs/product-surfaces.md` for the new route structure.

Initial admin access is seeded from `AUTH_USER` / `AUTH_PASS` on first run when the users table is empty.

## BrowserAgent (browser-use)

This repo vendors upstream projects as Git submodules:

- `vendor/browser-use` (browser-use/browser-use)
- `vendor/browser-use-desktop` (browser-use/desktop)

Default remains **Operator Mode** (BrowserAgent produces step-by-step web workflows). Optional automation can be added later as a sidecar service without changing existing ENV/keys.

## Project Status

### Product Surfaces

- `/admin/*` — Plattform-Admins und internes Ops-Team
- `/workspace/*` — Tenant-Owner, Operatoren und Teams
- `/portal/*` — Externe Kunden und Endnutzer
- Legacy-Routen wie `/customers`, `/crm`, `/usage-token`, `/settings`, `/agents`, `/hilfe` bleiben als kompatible Entrypoints aktiv

### What Works

- CRM leads, pipeline funnel, source tracking, and engagement APIs
- Outreach sequencing, pause/audit endpoints, and suppression workflows
- Content operations with calendar, item, and performance APIs
- Analytics/KPI views with optional connectors (Plausible, GA4, social)
- Dynamic OpenClaw agent discovery for agents and squads
- Cron jobs/templates with OpenClaw-compatible schedule variants (`cron`, `every`, `at`)
- Deploy status endpoint with OpenClaw config validation preflight
- Session auth + API key auth with role-based access controls
- Multi-surface routing with audience-aware redirects for admin, workspace, and portal

### Known Limitations

- Alpha surface area is still evolving; expect occasional schema/UI shifts
- Certain integrations require external provider setup and credentials

### Security Considerations

- Change seeded credentials (`AUTH_USER`, `AUTH_PASS`, `API_KEY`) before network deployment
- Keep host lock enabled unless you explicitly need broader access (`HERMES_HOST_LOCK=local` by default)
- Keep writeback flags disabled unless required:
  - `HERMES_ALLOW_POLICY_WRITE=false`
  - `HERMES_ALLOW_CRON_WRITE=false`
  - `HERMES_ALLOW_WORKSPACE_WRITE=false`
- Never commit real credentials or personal data

## Architecture

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript |
| Data | SQLite (local state in `./state`) |
| Agent Runtime | OpenClaw CLI + filesystem integration |
| Auth | Session cookie + API key + optional Google OAuth |

## Additive ChatKit Surfaces (OpenAI)

This repo includes an **additive** OpenAI ChatKit integration that does not replace or refactor existing agents.

### Routes

- Internal staff/admin chat: `/internal/chat`
- Customer-facing chat: `/chat`

### Server endpoints

- `POST /api/chatkit/internal/session` (admin-only)
- `POST /api/chatkit/customer/session` (customer-only)

### Environment variables

Append these to your `.env` (see `.env.example`):

- `OPENAI_API_KEY` (or `OPENAI_ADMIN_KEY` as a fallback)
- `OPENAI_CHATKIT_INTERNAL_WORKFLOW_ID`
- `OPENAI_CHATKIT_CUSTOMER_WORKFLOW_ID`

### Local run

1. Set the env vars above.
2. `pnpm dev`
3. Visit `/internal/chat` or `/chat` after logging in.

## Route Overview

- `admin`: Plattform-Betrieb, Governance, globale Billing-/Usage-Sicht
- `workspace`: operative Arbeit für CRM, Marketing, Support und Agenten
- `portal`: kundensichtbare Experience für Chat, Requests, Dokumente und Billing
- Details: `docs/product-surfaces.md`

## Configuration

See [`.env.example`](.env.example) for the full list.

### Required

- `AUTH_USER`
- `AUTH_PASS` (minimum 10 chars)
- `API_KEY`
- `AUTH_COOKIE_SECURE` (`false` for HTTP local dev, `true` for HTTPS)

### OpenClaw / Multi-instance

- `HERMES_OPENCLAW_HOME`
- `HERMES_DEFAULT_INSTANCE`
- `HERMES_OPENCLAW_INSTANCES` (optional JSON array for multi-instance)

### Optional 1Password Runtime Overlay

- `HERMES_1PASSWORD_MODE=off|auto|required` (`auto` is default behavior)
- `HERMES_OP_ENV_FILE=/etc/hermes-dashboard/hermes-dashboard.op.env`
- Example mapping: `ops/1password/hermes-dashboard.op.env.example`

### Host Access Lock

- `HERMES_HOST_LOCK=local` (default)
- `HERMES_HOST_LOCK=off`
- `HERMES_HOST_LOCK=host1,host2`

## Development

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

## Template Export and Hygiene

Before publishing as a template or sharing broadly:

```bash
./scripts/template-audit.sh
./scripts/template-export.sh [output_dir]
```

Export excludes sensitive/runtime artifacts like `.env*`, database files, `.next`, and `node_modules`.

## Open Source

- License: [MIT](./LICENSE)
- Security: [SECURITY.md](./SECURITY.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Third-Party Notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

## License

[MIT](LICENSE) © 2026 [Builderz Labs](https://github.com/builderz-labs)
