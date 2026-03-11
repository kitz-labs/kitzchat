# Contributing

## Development Setup

1. Install dependencies:
```bash
pnpm install
```
2. Copy env:
```bash
cp .env.example .env
```
3. Run app:
```bash
pnpm dev
```

Local development uses a single app on `http://localhost:3000`. Admin and customer flows share the same process and are switched by the signed-in account type.

## Required Checks

Before opening a PR, run:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
bash ./scripts/template-audit.sh
```

## Commit Style

Use Conventional Commits:
- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`
- `chore:`

## Pull Requests

Include:
- Problem statement
- Approach and key tradeoffs
- Test evidence (commands + results)
