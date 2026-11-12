#!/usr/bin/env bash
# Panel installer: Debian 12/13 or Ubuntu 22.04/24.04, run as root from the repo root.
#
#   sudo ./install.sh --domain panel.example.com --admin-email you@example.com
#   sudo ./install.sh --tunnel --admin-email you@example.com
#
# Flags (all optional in an interactive terminal — gum walks you through it):
#   --domain HOST     public hostname served by Caddy with automatic TLS
#   --tunnel          skip Caddy; expose via a Cloudflare quick tunnel instead
#   --admin-email     operator email; admin immediately after registering
#   --db-url URL      reuse an existing Postgres (default: create local one)
#   --no-incus        skip Incus install/init (panel only, no local workloads)
#   --app-dir DIR     install target (default: current repo directory)
#   --yes             answer yes to every confirmation (non-interactive)
set -euo pipefail

DOMAIN=""
TUNNEL=0
ADMIN_EMAIL=""
DB_URL=""
INSTALL_INCUS=1
APP_DIR="$(pwd)"
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --tunnel) TUNNEL=1; shift 1 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --db-url) DB_URL="$2"; shift 2 ;;
    --no-incus) INSTALL_INCUS=0; shift 1 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift 1 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then echo "run as root" >&2; exit 1; fi
if [ ! -f "$APP_DIR/package.json" ] || [ ! -d "$APP_DIR/apps/api" ]; then
  echo "run from the repo root (or pass --app-dir)" >&2; exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# --- Pretty prompts (gum when interactive, plain fallbacks otherwise) -------
HAVE_GUM=0
if [ -t 0 ] && [ -t 1 ]; then
  if ! command -v gum >/dev/null 2>&1; then
    echo "[install] gum (pretty prompts)"
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://repo.charm.sh/apt/gpg.key | gpg --dearmor -o /etc/apt/keyrings/charm.gpg
    echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" > /etc/apt/sources.list.d/charm.list
    apt-get update -qq
    apt-get install -y -qq gum || echo "[install] gum unavailable, using plain prompts"
  fi
  command -v gum >/dev/null 2>&1 && HAVE_GUM=1
fi

ui_header() {
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum style --border rounded --padding "0 2" --border-foreground 212 "VPS Panel installer"
  else
    echo "=== VPS Panel installer ==="
  fi
}

ui_choose() { # $1=header, $2...=options -> prints choice
  local header="$1"; shift
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum choose --header "$header" "$@"
  else
    echo "$header" >&2
    local i=1
    for opt in "$@"; do echo "  $i) $opt" >&2; i=$((i + 1)); done
    local pick
    read -rp "> [1] " pick
    pick="${pick:-1}"
    # print the Nth option
    i=1
    for opt in "$@"; do
      if [ "$i" = "$pick" ]; then echo "$opt"; return; fi
      i=$((i + 1))
    done
    echo "$1"
  fi
}

ui_input() { # $1=prompt $2=placeholder $3=default -> prints value
  local prompt="$1" placeholder="${2:-}" default="${3:-}"
  if [ "$HAVE_GUM" -eq 1 ]; then
    if [ -n "$default" ]; then
      gum input --prompt "$prompt " --placeholder "$placeholder" --value "$default"
    else
      gum input --prompt "$prompt " --placeholder "$placeholder"
    fi
  else
    local val
    if [ -n "$default" ]; then
      read -rp "$prompt [$default]: " val
      echo "${val:-$default}"
    else
      read -rp "$prompt: " val
      echo "$val"
    fi
  fi
}

ui_confirm() { # $1=question -> 0=yes
  if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum confirm "$1"
  else
    local ans
    read -rp "$1 [Y/n] " ans
    [[ "${ans:-Y}" =~ ^[Yy]$ ]]
  fi
}

ui_spin() { # $1=title, rest=command
  local title="$1"; shift
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum spin --title "$title" -- "$@"
  else
    echo "[install] $title"
    "$@"
  fi
}

ui_ok() {
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum style --foreground 82 "✓ $1"
  else
    echo "ok: $1"
  fi
}

ui_warn() {
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum style --foreground 214 "! $1"
  else
    echo "warn: $1" >&2
  fi
}

# --- Interactive answers for anything flags didn't cover ---------------------
ui_header

if [ -z "$DOMAIN" ] && [ "$TUNNEL" -eq 0 ]; then
  if [ -t 0 ]; then
    MODE=$(ui_choose "How should the panel be reachable?" "Custom domain (Caddy + automatic TLS)" "Quick tunnel (trycloudflare URL, zero setup)")
    if [[ "$MODE" == Quick* ]]; then
      TUNNEL=1
    else
      while [ -z "$DOMAIN" ]; do
        DOMAIN=$(ui_input "Public hostname" "panel.example.com")
      done
    fi
  else
    echo "pass --domain HOST or --tunnel" >&2; exit 1
  fi
fi

while [ -z "$ADMIN_EMAIL" ]; do
  if [ -t 0 ]; then
    ADMIN_EMAIL=$(ui_input "Operator email" "you@example.com")
    if ! [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
      ui_warn "that doesn't look like an email address"
      ADMIN_EMAIL=""
    fi
  else
    echo "pass --admin-email you@example.com" >&2; exit 1
  fi
done

# --- Email delivery --------------------------------------------------------
MAIL_MODE="skip"   # relay | smtp | skip
SMTP_HOST=""; SMTP_PORT="587"; SMTP_USER=""; SMTP_PASS=""; SMTP_TLS="STARTTLS"

echo
if [ "$HAVE_GUM" -eq 1 ]; then
  MAIL_MODE=$(gum choose --header "Email delivery — how should the panel send mail?" \
    "relay" "smtp" "skip") || MAIL_MODE="skip"
else
  echo "Email delivery:"
  echo "  1) Solstice relay — instant, free, sends from noreply@solstice.host"
  echo "  2) Own SMTP server"
  echo "  3) Skip (mails land in $APP_DIR/data/mail/)"
  read -rp "> [1] " pick
  case "${pick:-1}" in
    2) MAIL_MODE="smtp" ;;
    3) MAIL_MODE="skip" ;;
    *) MAIL_MODE="relay" ;;
  esac
fi

if [ "$MAIL_MODE" = "smtp" ]; then
  SMTP_HOST=$(ui_input "SMTP host" "smtp.example.com")
  SMTP_PORT=$(ui_input "SMTP port" "587" "587")
  SMTP_TLS=$(ui_choice "TLS mode" "STARTTLS" "TLS" "None")
  SMTP_USER=$(ui_input "SMTP username (empty = no auth)" "user@example.com")
  if [ -n "$SMTP_USER" ]; then
    if [ "$HAVE_GUM" -eq 1 ]; then
      SMTP_PASS=$(gum input --password --prompt "SMTP password " )
    else
      read -rsp "SMTP password: " SMTP_PASS; echo
    fi
  fi
fi

if ! ui_confirm "Install into $APP_DIR ${DOMAIN:+with domain $DOMAIN}${TUNNEL:+via quick tunnel}?"; then
  echo "aborted" >&2; exit 1
fi

apt-get update -qq

# --- Node 24 ---------------------------------------------------------------
if ! command -v node >/dev/null || ! node --version | grep -qE "^v(24|[3-9][0-9])"; then
  ui_spin "Node 24" bash -c 'curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y -qq nodejs'
fi

# --- Postgres --------------------------------------------------------------
if [ -z "$DB_URL" ]; then
  ui_spin "Postgres" apt-get install -y -qq postgresql openssl
  DB_PASS="$(openssl rand -hex 24)"
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='panel'\"" | grep -q 1 \
    || su postgres -c "psql -c \"CREATE USER panel WITH PASSWORD '$DB_PASS'\""
  su postgres -c "psql -c \"ALTER USER panel WITH PASSWORD '$DB_PASS'\""
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='panel'\"" | grep -q 1 \
    || su postgres -c "createdb -O panel panel"
  DB_URL="postgres://panel:${DB_PASS}@127.0.0.1:5432/panel"
fi

# --- Incus -----------------------------------------------------------------
if [ "$INSTALL_INCUS" -eq 1 ]; then
  if ! command -v incus >/dev/null; then
    ui_spin "Incus (zabbly)" bash -c '
      curl -fsSL https://pkgs.zabbly.com/key.asc -o /etc/apt/keyrings/zabbly.asc
      cat > /etc/apt/sources.list.d/zabbly-incus-stable.sources <<EOF
Enabled: yes
Types: deb
URIs: https://pkgs.zabbly.com/incus/stable
Suites: {{ codename }}
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/zabbly.asc
EOF
      sed -i "s/{{ codename }}/$(. /etc/os-release && echo "$VERSION_CODENAME")/" /etc/apt/sources.list.d/zabbly-incus-stable.sources
      apt-get update -qq
      apt-get install -y -qq incus
    '
  fi
  if ! incus info >/dev/null 2>&1; then
    echo "[install] incus init (defaults: dir pool, incusbr0)"
    incus admin init --auto || true
  fi
  # init --auto can half-fail (esp. nested); ensure pool + network + profile exist.
  incus storage show default >/dev/null 2>&1 || incus storage create default dir
  incus network show incusbr0 >/dev/null 2>&1 || incus network create incusbr0
  incus profile device show default root >/dev/null 2>&1 \
    || incus profile device add default root disk path=/ pool=default
  incus profile device show default eth0 >/dev/null 2>&1 \
    || incus profile device add default eth0 nic network=incusbr0 name=eth0
fi

# --- App -------------------------------------------------------------------
cd "$APP_DIR"
ui_spin "Dependencies" sudo -u "${SUDO_USER:-root}" npm ci --no-audit --no-fund
ui_spin "Web build" sudo -u "${SUDO_USER:-root}" npm run build --workspace @solstice/web

if [ ! -f apps/api/.env ]; then
  echo "[install] writing apps/api/.env"
  cat > apps/api/.env <<EOF
PORT=8788
DATABASE_URL=$DB_URL
ADMIN_EMAILS=$ADMIN_EMAIL
TRUST_PROXY=1
EOF
  chmod 600 apps/api/.env
else
  echo "[install] apps/api/.env exists, leaving it alone"
fi

echo "[install] systemd units"
mkdir -p "$APP_DIR/data"
sed "s#__APP_DIR__#$APP_DIR#g" deploy/solstice-api.service > /etc/systemd/system/solstice-api.service
systemctl daemon-reload
systemctl enable --now solstice-api.service

# --- Frontend --------------------------------------------------------------
if [ "$TUNNEL" -eq 1 ]; then
  echo "[install] cloudflared quick tunnel"
  if ! command -v cloudflared >/dev/null; then
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
    dpkg -i /tmp/cloudflared.deb || apt-get install -f -y -qq
  fi
  sed "s#__APP_DIR__#$APP_DIR#g" deploy/solstice-web.service > /etc/systemd/system/solstice-web.service
  sed "s#__APP_DIR__#$APP_DIR#g" deploy/solstice-tunnel.service > /etc/systemd/system/solstice-tunnel.service
  sed "s#__APP_DIR__#$APP_DIR#g" scripts/tunnel.sh > /usr/local/bin/solstice-tunnel.sh
  chmod +x /usr/local/bin/solstice-tunnel.sh
  systemctl daemon-reload
  systemctl enable --now solstice-web.service
  systemctl enable --now solstice-tunnel.service
  echo "[install] waiting for tunnel URL..."
  TUNNEL_URL=""
  for _ in $(seq 1 30); do
    TUNNEL_URL=$(journalctl -u solstice-tunnel.service --no-pager -n 50 2>/dev/null | grep -aoE "https://[a-z0-9-]+\.trycloudflare\.com" | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 2
  done
  echo "TUNNEL_URL=$TUNNEL_URL"
else
  if [ -f /etc/caddy/Caddyfile ] && ! ui_confirm "Overwrite /etc/caddy/Caddyfile?"; then
    echo "[install] keeping existing Caddyfile; make sure it proxies ${DOMAIN} (see deploy/Caddyfile)"
  else
    echo "[install] caddy ($DOMAIN)"
    if ! command -v caddy >/dev/null; then
      curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq
      apt-get install -y -qq caddy
    fi
    sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP_DIR__#$APP_DIR#g" deploy/Caddyfile > /etc/caddy/Caddyfile
    systemctl enable --now caddy
    systemctl reload caddy
  fi
  TUNNEL_URL="https://$DOMAIN"
fi

# --- Public URL into settings ----------------------------------------------
if [ -n "${TUNNEL_URL:-}" ]; then
  echo "[install] recording public URL"
  PGPASSWORD="$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')" \
  psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES ('app_url', '$TUNNEL_URL'), ('webauthn_origin', '$TUNNEL_URL'), ('webauthn_rp_id', '${TUNNEL_URL#https://}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" 2>/dev/null \
    || echo "[install] (settings update deferred: API seeds them on boot, set Application URL in Settings)"
fi

# --- Mail provider into settings -------------------------------------------
if [ "$MAIL_MODE" = "relay" ]; then
  RELAY_DOMAIN="${DOMAIN:-$(echo "${TUNNEL_URL:-}" | sed -E 's#https://([^/]+).*#\1#')}"
  echo "[install] registering with Solstice mail relay"
  RELAY_TOKEN=$(curl -fsS -m 15 -X POST https://mail.solstice.host/v1/relay/register \
    -H 'Content-Type: application/json' \
    -d "{\"domain\": \"$RELAY_DOMAIN\", \"adminEmail\": \"$ADMIN_EMAIL\"}" 2>/dev/null \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).token||"")}catch{console.log("")}})' 2>/dev/null || true)
  if [ -n "$RELAY_TOKEN" ]; then
    PGPASSWORD="$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')" \
    psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES ('mail_provider', 'solstice'), ('mail_relay_token', '$RELAY_TOKEN') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" 2>/dev/null \
      || echo "[install] (relay token deferred: set Provider = Solstice Cloud Relay in Settings > Mail)"
  else
    echo "[install] (relay unreachable: set Provider = Solstice Cloud Relay in Settings > Mail later)"
  fi
elif [ "$MAIL_MODE" = "smtp" ]; then
  echo "[install] writing SMTP settings"
  PGPASSWORD="$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')" \
  psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES ('mail_provider', 'smtp'), ('mail_smtp_host', '$SMTP_HOST'), ('mail_smtp_port', '$SMTP_PORT'), ('mail_smtp_user', '$SMTP_USER'), ('mail_smtp_pass', '$SMTP_PASS'), ('mail_tls_mode', '$SMTP_TLS') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" 2>/dev/null \
    || echo "[install] (SMTP settings deferred: configure in Settings > Mail)"
fi

echo
if [ "$HAVE_GUM" -eq 1 ]; then
  gum style --border rounded --padding "0 2" --border-foreground 82 \
    "Done." \
    "Open ${TUNNEL_URL:-your domain} and register with $ADMIN_EMAIL" \
    $([ "$MAIL_MODE" = "relay" ] && echo "Emails send via Solstice relay (noreply@solstice.host)." || true) \
    "No SMTP yet? The sign-in code lands in $APP_DIR/data/mail/ on the host." \
    "Review Settings (name, mail, captcha, legal URLs) as admin."
else
  echo "Done. Next steps:"
  echo "  1. Open ${TUNNEL_URL:-your domain} and register with $ADMIN_EMAIL"
  echo "  2. No SMTP yet? The sign-in code lands in $APP_DIR/data/mail/ on the host."
  echo "  3. Review Settings (name, mail, captcha, legal URLs) as admin."
fi
