#!/usr/bin/env bash
set -euo pipefail

# Usage: run this on the server from the project root (/opt/kitzchat)
# Creates a backup tarball in /tmp/kitzchat-backups, removes users (and related rows)
# except username 'markus', deletes referenced upload files and runtime dirs.

TS=$(date +%Y%m%d%H%M%S)
BACKUP_DIR=/tmp/kitzchat-backups
mkdir -p "$BACKUP_DIR"

echo "Creating backup..."
tar czf "$BACKUP_DIR/kitzchat-backup-$TS.tar.gz" state db uploads .env || true
echo "Backup: $BACKUP_DIR/kitzchat-backup-$TS.tar.gz"

DB_PATH=state/kitzchat.db
if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found at $DB_PATH" >&2
  exit 2
fi

# Export storage paths for uploads belonging to users we'll delete, and remove the files
sqlite3 "$DB_PATH" "PRAGMA foreign_keys=OFF; BEGIN; CREATE TEMP TABLE to_delete(id INTEGER PRIMARY KEY); INSERT INTO to_delete(id) SELECT id FROM users WHERE username != 'markus'; SELECT storage_path FROM chat_uploads WHERE user_id IN (SELECT id FROM to_delete); COMMIT; PRAGMA foreign_keys=ON;" > /tmp/to_delete_storage_paths.txt || true
if [ -s /tmp/to_delete_storage_paths.txt ]; then
  echo "Removing referenced upload files..."
  xargs -d '\n' -r rm -f < /tmp/to_delete_storage_paths.txt || true
else
  echo "No upload files to remove."
fi

# Run deletion SQL (removes sessions, support_messages, customer_preferences, chat_uploads entries, usage events, messages, conversations, and users)
sqlite3 "$DB_PATH" "PRAGMA foreign_keys=OFF; BEGIN; CREATE TEMP TABLE to_delete(id INTEGER PRIMARY KEY); INSERT INTO to_delete(id) SELECT id FROM users WHERE username != 'markus'; DELETE FROM sessions WHERE user_id IN (SELECT id FROM to_delete); DELETE FROM support_messages WHERE user_id IN (SELECT id FROM to_delete); DELETE FROM customer_preferences WHERE user_id IN (SELECT id FROM to_delete); DELETE FROM chat_uploads WHERE user_id IN (SELECT id FROM to_delete); DELETE FROM chat_usage_events WHERE user_id IN (SELECT id FROM to_delete); DELETE FROM messages WHERE owner_user_id IN (SELECT id FROM to_delete); DELETE FROM chat_conversations WHERE owner_user_id IN (SELECT id FROM to_delete); DELETE FROM users WHERE id IN (SELECT id FROM to_delete); DROP TABLE to_delete; COMMIT; PRAGMA foreign_keys=ON;"

# Remove runtime directories that do NOT reference 'markus'
if [ -d state/runtime ]; then
  echo "Cleaning state/runtime directories (keeping those referencing 'markus')..."
  for d in state/runtime/*; do
    [ -d "$d" ] || continue
    if grep -R -q "markus" "$d" 2>/dev/null; then
      echo "KEEP: $d"
    else
      rm -rf "$d" && echo "REMOVED: $d" || echo "FAIL_REMOVE: $d"
    fi
  done
else
  echo "No state/runtime directory found; skipping runtime cleanup."
fi

echo "__DELETE_DONE__"
