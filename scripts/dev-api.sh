#!/usr/bin/env bash
# Dev supervisor for the Solstice API: restarts `node apps/api/src/index.ts`
# on crash with backoff, and keeps timestamped logs in ./data/dev-api.log.
# Usage: ./scripts/dev-api.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/data"
LOG_FILE="$LOG_DIR/dev-api.log"
mkdir -p "$LOG_DIR"

# Stop restarting on intentional shutdown (Ctrl-C / kill of this script).
STOP=0
trap 'STOP=1; kill 0 2>/dev/null' SIGINT SIGTERM

restart_count=0

while [ "$STOP" -eq 0 ]; do
  echo "[$(date -u +%FT%TZ)] [supervisor] starting api (attempt $((restart_count + 1)))" | tee -a "$LOG_FILE"

  # Run in foreground so its exit code tells us whether it crashed.
  node --env-file=apps/api/.env apps/api/src/index.ts >>"$LOG_FILE" 2>&1
  code=$?

  if [ "$STOP" -eq 1 ]; then
    echo "[$(date -u +%FT%TZ)] [supervisor] intentional stop, not restarting" | tee -a "$LOG_FILE"
    break
  fi

  # Clean exit (e.g. graceful SIGTERM handling) still gets restarted in dev,
  # but a crash backs off to avoid a hot loop.
  restart_count=$((restart_count + 1))
  if [ "$code" -ne 0 ]; then
    backoff=$((restart_count > 5 ? 5 : restart_count))
    echo "[$(date -u +%FT%TZ)] [supervisor] api exited with code $code, restarting in ${backoff}s" | tee -a "$LOG_FILE"
    sleep "$backoff"
  else
    echo "[$(date -u +%FT%TZ)] [supervisor] api exited cleanly (code 0), restarting in 1s" | tee -a "$LOG_FILE"
    sleep 1
  fi
done
