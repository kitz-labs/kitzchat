#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

copy_tree() {
  src="$1"
  dest="$2"

  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$src/" "$dest/"
    return
  fi

  cp -R "$src/." "$dest/"
}

# Ensure Next.js standalone has latest static/public assets before boot.
mkdir -p .next/standalone/.next/static
if [ -d .next/static ]; then
  copy_tree .next/static .next/standalone/.next/static
fi
if [ -d public ]; then
  copy_tree public .next/standalone/public
fi
