#!/usr/bin/env sh
set -eu

mkdir -p /app/state
chown -R node:node /app/state

exec su-exec node sh /app/scripts/start-standalone.sh