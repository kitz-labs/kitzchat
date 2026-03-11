# Systemd Template Notes

Goal: keep `kitzchat` "plug-and-play" across local workspace instances by avoiding:

- hardcoded home directories (`/home/<user>/...`)
- secrets inside unit files

## Recommended Layout

- App code: `/opt/kitzchat`
- Runtime data:
  - DB: `/var/lib/kitzchat/kitzchat.db`
  - State: `/var/lib/kitzchat/state/`
- Env file (secrets + config): `/etc/kitzchat/kitzchat.env`

## Unit File

Use `ops/systemd/kitzchat.service` as a starting point.

Important: update these to match your deployment:

- `WorkingDirectory=...`
- `EnvironmentFile=...`
- `ReadWritePaths=...` (must cover your DB and state dirs)
- `User=` / `Group=`

## Env File

Minimal required values:

- `AUTH_USER`, `AUTH_PASS`
- `API_KEY`

Template-safe defaults:

- `KITZCHAT_DB_PATH=/var/lib/kitzchat/kitzchat.db`
- `KITZCHAT_STATE_DIR=/var/lib/kitzchat/state`

Workspace instance discovery:

- Single instance:
  - `KITZCHAT_WORKSPACE_ROOT=/srv/kitzchat/runtime/default`
  - `KITZCHAT_DEFAULT_INSTANCE=default`
- Multi instance:
  - `KITZCHAT_WORKSPACE_INSTANCES=[{"id":"default","label":"Default Workspace","workspaceRoot":"..."}]`

## Secrets Hygiene

If you currently have a systemd drop-in (e.g. `override.conf`) that sets secrets via `Environment=...`,
move those values into the env file and remove them from the drop-in.


## Build Notes

Use `pnpm build:standalone` for deployments that run `.next/standalone/server.js`, so `/_next/static/*` assets are copied into the standalone bundle.

## 1Password (Recommended)

If you deploy with 1Password, the standalone entrypoint supports resolving secrets at runtime via op run.

- Non-secret config: /etc/kitzchat/kitzchat.env
- op:// references (non-secret template): /etc/kitzchat/kitzchat.op.env
- Required secret for op: OP_SERVICE_ACCOUNT_TOKEN (set via systemd EnvironmentFile or another secret store)
- Optional mode flag:
  - `KITZCHAT_1PASSWORD_MODE=off` (never use op)
  - `KITZCHAT_1PASSWORD_MODE=auto` (default; try op then fallback to env)
  - `KITZCHAT_1PASSWORD_MODE=required` (fail startup if op cannot run)

A template for the op env file lives at: ops/1password/kitzchat.op.env.example

Notes:
- Analytics keys like PLAUSIBLE_SITE_ID / PLAUSIBLE_API_KEY should live in 1Password and be referenced from the op env template.
- scripts/start-standalone.sh uses op run according to `KITZCHAT_1PASSWORD_MODE` and `KITZCHAT_OP_ENV_FILE`.
