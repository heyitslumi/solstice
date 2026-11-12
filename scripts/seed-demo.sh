#!/usr/bin/env bash
# Seed a demo Solstice install: one account, three running instances, a couple of
# port forwards, 24h of metrics and some activity so every screen has content.
#
#   sudo bash scripts/seed-demo.sh
#
# Idempotent enough to re-run: existing instances are skipped, metrics are
# replaced, the account is reused.
set -euo pipefail

API="${API:-http://127.0.0.1:8788}"
EMAIL="${DEMO_EMAIL:-hi@lumis.moe}"
NAME="${DEMO_NAME:-Demo User}"
ENV_FILE=/etc/solstice/api.env

DB="${DATABASE_URL:-}"
if [ -z "$DB" ] && [ -f "$ENV_FILE" ]; then
  DB="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE")"
fi
[ -n "$DB" ] || { echo "no DATABASE_URL" >&2; exit 1; }

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

say() { printf '[seed] %s\n' "$*"; }

# The sign-in code is in the panel's own mail log, so no inbox is needed.
code_from_mail() {
  psql "$DB" -tAc \
    "select body_text from email_logs where recipient = '$EMAIL' order by created_at desc limit 1" \
    | grep -oE '[0-9]{6}' | head -1
}

say "account $EMAIL"
curl -fsS -X POST "$API/api/auth/register" -H 'content-type: application/json' \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\"}" >/dev/null 2>&1 || true

if ! psql "$DB" -tAc "select 1 from users where lower(email) = lower('$EMAIL') and email_verified_at is not null" | grep -q 1; then
  CODE="$(code_from_mail)"
  [ -n "$CODE" ] || { echo "no verification code in email_logs" >&2; exit 1; }
  curl -fsS -X POST "$API/api/auth/verify-email" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" -c "$JAR" >/dev/null
else
  CODE="$(code_from_mail)"
  curl -fsS -X POST "$API/api/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\"}" >/dev/null
  CODE="$(code_from_mail)"
  curl -fsS -X POST "$API/api/auth/login/verify" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" -c "$JAR" >/dev/null
fi

# The demo account owns the box, so the admin screens are populated too.
psql "$DB" -q -c "update users set is_admin = true where lower(email) = lower('$EMAIL')"

create_instance() { # name cores memoryMb diskGb
  local name="$1" cores="$2" mem="$3" disk="$4"
  if psql "$DB" -tAc "select 1 from instances where name = '$name'" | grep -q 1; then
    say "instance $name already exists"
    return 0
  fi
  say "instance $name"
  curl -fsS -X POST "$API/api/instances" -b "$JAR" -H 'content-type: application/json' \
    -d "{\"name\":\"$name\",\"type\":\"lxc\",\"os\":\"debian-12\",\"cores\":$cores,\"memoryMb\":$mem,\"diskGb\":$disk}" \
    >/dev/null
}

create_instance web-01 2 2048 20
create_instance db-01 4 4096 40
create_instance cache-01 1 1024 10

say "port forwards"
for spec in "web-01:8080:HTTP" "db-01:5432:Postgres" "web-01:3000:Grafana"; do
  IFS=: read -r name port label <<<"$spec"
  id="$(psql "$DB" -tAc "select id from instances where name = '$name'")"
  [ -n "$id" ] || continue
  curl -fsS -X POST "$API/api/instances/$id/port-forwards" -b "$JAR" \
    -H 'content-type: application/json' \
    -d "{\"containerPort\":$port,\"protocol\":\"tcp\",\"description\":\"$label\"}" \
    >/dev/null 2>&1 || say "forward $name:$port skipped"
done

say "metrics history"
psql "$DB" -q <<SQL
DELETE FROM node_metrics;
DELETE FROM instance_metrics;
INSERT INTO node_metrics (node_id, ts, cpu_pct, ram_pct, load_1, load_5, load_15)
SELECT n.id,
       now() - (i || ' minutes')::interval,
       6 + random() * 22,
       34 + random() * 18,
       0.15 + random() * 1.1,
       0.12 + random() * 0.9,
       0.10 + random() * 0.7
FROM nodes n, generate_series(1, 288) AS i;

INSERT INTO instance_metrics (instance_id, ts, cpu_pct, ram_pct, disk_pct, net_rx_bytes, net_tx_bytes)
SELECT i.id,
       now() - (m || ' minutes')::interval,
       3 + random() * 40,
       18 + random() * 55,
       12 + random() * 30,
       (random() * 900000)::bigint,
       (random() * 400000)::bigint
FROM instances i, generate_series(1, 288) AS m;
SQL

say "activity"
psql "$DB" -q <<SQL
INSERT INTO activity_logs (id, user_id, action, details, ip_address, created_at, status, progress, duration_ms)
SELECT gen_random_uuid(),
       u.id,
       a.action,
       a.details,
       '203.0.113.10',
       now() - (a.mins || ' minutes')::interval,
       'success',
       100,
       (a.mins * 120)
FROM users u
CROSS JOIN (VALUES
  ('instance.start', 'Started web-01', 14),
  ('instance.snapshot', 'Snapshot pre-upgrade on db-01', 92),
  ('port_forward.create', 'Forwarded 8080 -> web-01:8080', 180),
  ('instance.create', 'Created cache-01', 1500)
) AS a(action, details, mins)
WHERE lower(u.email) = lower('$EMAIL');
SQL

say "done: $EMAIL"
