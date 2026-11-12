#!/usr/bin/env bash
# Prints the newest sign-in code for the demo account from the demo box's mail log.
# The code is written to email_logs before delivery, so no inbox is involved.
set -euo pipefail

ssh -p "${SSH_PORT:-2250}" "${DEMO_HOST:-aria}" \
  "incus exec ${DEMO_CONTAINER:-solstice-demo} -- bash -s" <<'INNER'
DB=$(sed -n 's/^DATABASE_URL=//p' /etc/solstice/api.env)
psql "$DB" -tAc "select body_text from email_logs where recipient = 'demo@solstice.host' order by created_at desc limit 1" \
  | grep -oE '[0-9]{6}' | head -1
INNER
