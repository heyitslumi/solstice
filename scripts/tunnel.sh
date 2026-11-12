#!/usr/bin/env bash
# Tunnel supervisor: runs cloudflared, then records each fresh public URL in
# system_settings (app_url / webauthn_origin / webauthn_rp_id) so sign-in links,
# passkeys and OAuth keep working across URL rotations. Managed by install.sh.
set -euo pipefail

LOG=/tmp/solstice-tunnel.log

CF_BIN="$(command -v cloudflared || echo /usr/local/bin/cloudflared)"
"$CF_BIN" tunnel --url http://127.0.0.1:5173 --no-autoupdate >"$LOG" 2>&1 &
CF_PID=$!

cleanup() { kill "$CF_PID" 2>/dev/null || true; }
trap cleanup INT TERM EXIT

# shellcheck disable=SC2034
LAST_URL=""
for _ in $(seq 1 60); do
  URL=$(grep -aoE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG" 2>/dev/null | head -1 || true)
  if [ -n "$URL" ]; then
    if [ "$URL" != "$LAST_URL" ]; then
      echo "[tunnel] public URL: $URL"
      # shellcheck disable=SC1091
      if [ -f /etc/solstice/api.env ]; then
        set -a
        # shellcheck source=/dev/null
        . /etc/solstice/api.env
        set +a
        if [ -n "${DATABASE_URL:-}" ]; then
          HOST="${URL#https://}"
          psql "$DATABASE_URL" -q -c "INSERT INTO system_settings (key, value) VALUES ('app_url', '$URL'), ('webauthn_origin', '$URL'), ('webauthn_rp_id', '$HOST') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" 2>/dev/null \
            && echo "[tunnel] settings updated" \
            || echo "[tunnel] settings update failed (API will seed on boot)"
        fi
      fi
      LAST_URL="$URL"
    fi
    break
  fi
  sleep 2
done

wait "$CF_PID"
