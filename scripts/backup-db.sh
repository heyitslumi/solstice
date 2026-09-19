#!/usr/bin/env bash
#
# Nightly logical backup of the Solstice database.
#
# Uses pg_dump's custom format rather than plain SQL so a restore can be selective
# and parallel, and so the archive carries its own table of contents. The dump is
# written to a temporary name and only moved into place on success, so a job that
# dies halfway cannot leave a truncated file that looks like a real backup.
#
# Credentials come from apps/api/.env, the same file the API reads, so there is one
# place to rotate them.

set -euo pipefail

REPO="/home/lumi/.kimaki/projects/solstice-host"
ENV_FILE="$REPO/apps/api/.env"
BACKUP_DIR="/home/lumi/backups/solstice"
KEEP_DAYS=7

if [ ! -f "$ENV_FILE" ]; then
  echo "backup: missing $ENV_FILE" >&2
  exit 1
fi

# Read the connection string without exporting the whole .env into this process.
DATABASE_URL="$(grep -aE '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
if [ -z "$DATABASE_URL" ]; then
  echo "backup: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# The API keeps its credentials in the URL; pg_dump wants them separately so the
# password never appears in the process list.
PGPASSWORD="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
PGHOST="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')"
PGPORT="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')"
PGUSER="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')"
PGDATABASE="$(printf '%s' "$DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')"
export PGPASSWORD PGHOST PGPORT PGUSER

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
TARGET="$BACKUP_DIR/solstice-$STAMP.dump"
TEMP="$TARGET.partial"

echo "backup: dumping $PGDATABASE from $PGHOST:$PGPORT"
pg_dump --format=custom --no-owner --no-privileges --file="$TEMP" "$PGDATABASE"

# A dump that cannot be listed is not a dump. pg_restore --list reads the archive
# table of contents, which is cheap and catches a truncated or empty file.
if ! pg_restore --list "$TEMP" > /dev/null 2>&1; then
  echo "backup: archive is unreadable, discarding" >&2
  rm -f "$TEMP"
  exit 1
fi

mv "$TEMP" "$TARGET"
echo "backup: wrote $(du -h "$TARGET" | cut -f1) to $TARGET"

echo "backup: pruning anything older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -name 'solstice-*.dump' -type f -mtime "+$KEEP_DAYS" -print -delete

echo "backup: done, $(find "$BACKUP_DIR" -maxdepth 1 -name 'solstice-*.dump' -type f | wc -l) archive(s) kept"