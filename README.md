<div align="center">

# KitzChat

**The local-first AI workspace for chat, automation, and team operations.**

Run chat, CRM, outreach, content, analytics, and automation workflows from one dashboard, powered by Next.js + SQLite.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

![KitzChat Overview](./public/kitzchat-mission-control.png)

</div>

---

> **Alpha Software** — KitzChat is under active development. APIs, data models, and configuration behavior can change between releases.

## Why KitzChat?

KitzChat is built for local-first AI teamwork where you need execution visibility and control, not disconnected tools.

- **Operations in one place** — Chat, CRM, outreach, content ops, analytics, experiments, and automations
- **Local runtime by default** — Dynamic agent discovery, cron templates, workspace browsing, and comms surfaces without external runtime coupling
- **Local-first stack** — Next.js + SQLite, no required external infra to run locally
- **Secure-by-default template posture** — Session auth, API key support, host lock, and writeback controls disabled by default
- **Production workflow support** — Deploy status, auditability, role-based access, and e2e-covered auth/API flows

## Screenshots

### Overview
![KitzChat CRM](./public/kitzchat-mission-control.png)

### CRM
![KitzChat Overview](./public/kitzchat-overview.png)



## Quick Start

> **Requires [pnpm](https://pnpm.io/installation)** — install with `npm install -g pnpm` or `corepack enable`.

```bash
git clone https://github.com/kitz-labs/dashboard_template.git
cd dashboard_template
pnpm install
pnpm env:bootstrap
pnpm dev
```

Open `http://localhost:3000`.

KitzChat runs as a single Next.js app on port `3000`. Admin and customer views are selected after login from the authenticated account type, so local dev and VPS hosting only need one process.

Initial admin access is seeded from `AUTH_USER` / `AUTH_PASS` on first run when the users table is empty.

## Project Status

### What Works

- CRM leads, pipeline funnel, source tracking, and engagement APIs
- Outreach sequencing, pause/audit endpoints, and suppression workflows
- Content operations with calendar, item, and performance APIs
- Analytics/KPI views with optional connectors (Plausible, GA4, social)
- Dynamic local agent discovery for agents and squads
- Cron jobs/templates with flexible schedule variants (`cron`, `every`, `at`)
- Deploy status endpoint with local runtime health checks
- Session auth + API key auth with role-based access controls

### Known Limitations

# KitzChat

![KitzChat Hero](./public/kitzchat-readme-hero.svg)

KitzChat ist eine modulare KI-Webapp fuer Betrieb, Kundenkommunikation, Agentensteuerung und Credit-Billing in einer einzigen Next.js-Anwendung. Das Projekt kombiniert ein lokales App-State- und Workspace-Modell mit PostgreSQL fuer Wallet, Ledger und Zahlungsfluesse.

Die App ist fuer zwei Perspektiven gebaut:

- Admin-Oberflaeche fuer Betrieb, Reporting, Content, CRM, Automationen und Compliance
- Customer-Oberflaeche fuer Chat, Verbrauch, Einstellungen, Billing und Self-Service

## Funktionsumfang

- Agenten, Kataloge und Workspace-basierte Laufzeitkonfiguration
- CRM, Kundenlisten, Customer Detail Views und Support-Zusammenfassungen
- Chat, Uploads, Session-Sync und agentenbezogene Konversationen
- Automationen, Cron-Jobs, Templates und Laufprotokolle
- Analytics, KPIs, Lead-Quellen, Benchmarks und OpenAI-Nutzungsanzeige
- Stripe Checkout, Wallet, Ledger, Entitlements und Top-up-Angebote
- Rollen, Session-Auth, API-Key-Zugaenge und optionales Google OAuth
- Lokale State-Dateien, Runtime-Ordner und optionale Multi-Instance-Konfiguration

## Architektur

![KitzChat Architektur](./public/kitzchat-readme-architecture.svg)

KitzChat trennt bewusst zwischen operativem App-State und finanziellem Billing-State:

- SQLite beziehungsweise lokale State-Dateien halten Dashboard-, Runtime- und Template-Zustand
- PostgreSQL haelt Wallet, Ledger, Entitlements, Checkout-Ergebnisse und Reporting-Daten
- Stripe bleibt Payment-Provider, waehrend Credits und Verrechnung intern in der App gefuehrt werden
- OpenAI, Plausible, GA4, E-Mail, Telegram oder weitere Integrationen koennen optional zugeschaltet werden

## Tech Stack

| Bereich | Stack |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| UI | App Router, Tailwind CSS 4, Recharts, Lucide |
| Lokaler Zustand | SQLite und Dateien unter `./state` |
| Billing | PostgreSQL, Stripe |
| Server | Next.js Runtime plus optionale Express-basierte Billing-Helfer |
| Tests | Node Test Runner, Playwright |

## Schnellstart lokal

Voraussetzungen:

- Node.js 20 oder neuer
- pnpm
- laufendes PostgreSQL, falls Billing, Wallet und Entitlements aktiv sein sollen

Installation:

```bash
git clone https://github.com/kitz-labs/kitzchat.git
cd kitzchat
pnpm install
pnpm env:bootstrap
```

Danach `.env` anpassen. Die minimal sinnvollen Werte sind:

```env
AUTH_USER=admin
AUTH_PASS=change-me-to-a-long-password
API_KEY=change-me-to-a-random-secret
AUTH_COOKIE_SECURE=false
DATABASE_URL=postgres://postgres:postgres@localhost:5432/kitzchat
```

Migrationen und Seeds fuer Billing:

```bash
pnpm billing:migrate
pnpm billing:seed
```

Entwicklungsserver starten:

```bash
pnpm dev
```

Die App laeuft danach unter `http://localhost:3000`.

## Docker-Deployment mit PostgreSQL

![KitzChat Deployment](./public/kitzchat-readme-deployment.svg)

Die mitgelieferte [docker-compose.yml](./docker-compose.yml) ist auf direkten VPS-Betrieb mit Docker Compose ausgelegt. Die App wird lokal aus dem Repo per [Dockerfile](./Dockerfile) gebaut, laeuft auf Container-Port `3001` und wird standardmaessig auf Host-Port `3001` veroeffentlicht.

Die aktuell hinterlegte PostgreSQL-Konfiguration ist:

- Datenbanktyp: PostgreSQL
- Host im Docker-Netz: `db`
- Port: `5432`
- Datenbankname: `kitzchat`
- Benutzer: `kitzchat`
- Passwort: `widauer`
- Connection String: `postgres://kitzchat:widauer@db:5432/kitzchat`

Start mit Docker Compose:

```bash
cp .env.example .env
docker compose up --build -d
```

Wichtig:

- Der App-Container verwendet `corepack` und `pnpm`, nicht `npm ci`
- Der Build laeuft ueber das lokale [Dockerfile](./Dockerfile); gestartet wird danach mit `sh scripts/start-standalone.sh`
- Der Compose-Stack braucht kein Traefik und kein Host-Bind-Mount des Repos
- Die App laeuft im Container auf Port `3001`; extern wird standardmaessig `${APP_PORT:-3001}` nach `3001` gemappt
- Der Postgres-Dienst nutzt das benannte Volume `kitzchat_db`
- App-Zustand und Workspace-Runtime liegen im benannten Volume `kitzchat_state`

Fuer den ersten Start solltest du in `.env` mindestens setzen:

```env
AUTH_USER=admin
AUTH_PASS=change-me-to-a-long-password
API_KEY=change-me-to-a-random-secret
AUTH_COOKIE_SECURE=true
PUBLIC_BASE_URL=https://your-domain.tld
KITZCHAT_HOST_LOCK=your-domain.tld
DATABASE_URL=postgres://kitzchat:widauer@db:5432/kitzchat
```

Danach ist die App direkt unter `http://SERVER_IP:3001` erreichbar. Fuer Domain + HTTPS solltest du auf dem VPS einen Reverse Proxy wie Caddy oder Nginx davorsetzen.

Falls du die App zunaechst direkt ueber eine oeffentliche IP statt ueber eine Domain testest, setze zusaetzlich:

```env
PUBLIC_BASE_URL=http://187.124.23.227:8080
KITZCHAT_HOST_LOCK=187.124.23.227,localhost,127.0.0.1
AUTH_COOKIE_SECURE=false
```

und mappe den App-Port direkt, z. B. `8080:8080`.

## Wichtige Umgebungsvariablen

Die komplette Vorlage steht in [.env.example](./.env.example).

Pflichtfelder fuer einen sinnvollen Start:

- `AUTH_USER`
- `AUTH_PASS`
- `API_KEY`
- `AUTH_COOKIE_SECURE`

Billing und Wallet:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `MIN_TOPUP_EUR`
- `MAX_TOPUP_EUR`
- `CREDIT_MULTIPLIER`

Workspace und Laufzeit:

- `KITZCHAT_STATE_DIR`
- `KITZCHAT_WORKSPACE_ROOT`
- `KITZCHAT_DEFAULT_INSTANCE`
- `KITZCHAT_WORKSPACE_INSTANCES`
- `KITZCHAT_HOST_LOCK`

Optionale Integrationen:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PLAUSIBLE_API_KEY`
- `GA4_PROPERTY_ID`
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Billing-Modell

KitzChat verwendet ein internes Credit-System:

- `1 EUR = 1000 Credits`
- Top-ups werden ueber Stripe ausgelost
- Wallet, Ledger und Entitlements liegen in PostgreSQL
- Kosten, Token-Nutzung und Kundenverbrauch werden im Admin-Bereich zusammengefuehrt

Wenn `OPENAI_API_KEY` fehlt, bleibt die App benutzbar; bestimmte agentenbezogene Antworten koennen dann auf lokale oder Mock-Pfade zurueckfallen.

## Verfuegbare Skripte

```bash
pnpm dev
pnpm dev:fresh
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm billing:migrate
pnpm billing:seed
pnpm billing:server
pnpm prepare:standalone
pnpm build:standalone
```

## Projektstruktur

```text
src/app/                 Next.js App Router, Pages und API Routes
src/components/          UI-Komponenten fuer Admin- und Customer-Surface
src/lib/                 Auth, Billing, Analytics, Runtime- und DB-Helfer
src/modules/             Domainennahe Services und Controller
src/config/              Umgebungs- und Anbieter-Konfiguration
src/db/                  SQL-Migrationen und Seed-Dateien
state/                   Lokale Runtime-, Upload- und Memory-Daten
ops/                     Deployment-Helfer, systemd und 1Password-Vorlagen
scripts/                 Bootstrap-, Seed- und Standalone-Skripte
tests/e2e/               End-to-End-Tests
```

## Qualitaet und Tests

Empfohlener Check vor Deployment:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fuer End-to-End-Tests:

```bash
pnpm test:e2e
```

## Sicherheit

- Standard-Credentials aus `.env` vor jedem externen Deployment ersetzen
- `KITZCHAT_HOST_LOCK` aktiv lassen, solange kein expliziter externer Zugriff benoetigt wird
- Schreibzugriffe auf Runtime- oder Policy-Dateien nur aktivieren, wenn sie wirklich gewollt sind
- Keine echten Secrets, Kundeninhalte oder Produktivdaten ins Repository committen

## Deployment-Hinweise

- Die App ist als einzelner Next.js-Prozess ausgelegt
- Admin- und Customer-Flows laufen in derselben Anwendung
- Billing und Wallet benoetigen PostgreSQL
- Fuer einen Standalone-Betrieb stehen [scripts/start-standalone.sh](./scripts/start-standalone.sh) sowie die Vorlagen unter [ops/](./ops/) bereit

## Weiterfuehrende Dateien

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [ops/systemd/README.md](./ops/systemd/README.md)

## Lizenz

[MIT](./LICENSE)
