#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

sh "$ROOT/scripts/prepare-standalone.sh"

# Optional 1Password mode:
# - off: never use op run
# - auto (default): use op run when available; otherwise fall back to existing env
# - required: fail startup unless op run succeeds
OP_MODE="$(printf '%s' "${KITZCHAT_1PASSWORD_MODE:-auto}" | tr '[:upper:]' '[:lower:]')"
OP_ENV_FILE="${KITZCHAT_OP_ENV_FILE:-/etc/kitzchat/kitzchat.op.env}"

run_with_op() {
  echo "[start] resolving runtime env via 1Password: $OP_ENV_FILE" >&2
  op run --env-file="$OP_ENV_FILE" -- node "$ROOT/.next/standalone/server.js"
}

can_use_op() {
  command -v op >/dev/null 2>&1 \
    && [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] \
    && [ -f "$OP_ENV_FILE" ]
}

case "$OP_MODE" in
  off|false|0|disabled)
    echo "[start] 1Password overlay disabled (KITZCHAT_1PASSWORD_MODE=$OP_MODE)" >&2
    ;;
  required)
    if can_use_op; then
      run_with_op
      exit $?
    fi
    echo "[start] 1Password required but unavailable. Ensure: op installed, OP_SERVICE_ACCOUNT_TOKEN set, and KITZCHAT_OP_ENV_FILE exists." >&2
    exit 1
    ;;
  auto|"")
    if can_use_op; then
      # If 1Password is temporarily rate-limiting/failing, fall back to existing env.
      if run_with_op; then
        exit 0
      fi
      echo "[start] op run failed; falling back to existing env" >&2
    else
      echo "[start] 1Password unavailable; using existing env" >&2
    fi
    ;;
  *)
    echo "[start] Invalid KITZCHAT_1PASSWORD_MODE='$OP_MODE'. Use: off|auto|required" >&2
    exit 1
    ;;
esac

exec node "$ROOT/.next/standalone/server.js"
