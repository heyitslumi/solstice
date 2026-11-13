#!/usr/bin/env bash
# Solstice panel installer.
#
# One-liner:
#   curl -fsSL https://solstice.host/install.sh | sudo bash
#
# Or from a clone:
#   sudo ./install.sh --domain panel.example.com --admin-email you@example.com
#
# Flags (all optional; interactive prompts fill the gaps):
#   --domain HOST          public hostname (Caddy/nginx/Apache + automatic TLS)
#   --proxy NAME           reverse proxy: caddy (default) | nginx | apache | none
#   --tunnel               skip the proxy; expose via a Cloudflare quick tunnel
#   --tunnel-token TOKEN   Cloudflare named tunnel token (your own domain; create
#                          the tunnel in your CF dashboard pointing at localhost)
#   --admin-email EMAIL    operator email; becomes admin on first registration
#   --mail relay|smtp      email delivery (default: relay = Solstice Cloud Relay)
#   --smtp-host HOST       SMTP server hostname (with --mail smtp)
#   --smtp-port PORT       SMTP port (default 587)
#   --smtp-user USER       SMTP username (empty = no auth)
#   --smtp-pass PASS       SMTP password
#   --smtp-tls MODE        STARTTLS | TLS | None (default STARTTLS)
#   --db-url URL           reuse an existing Postgres (default: install local)
#   --no-incus             skip Incus install/init (panel only, no workloads)
#   --no-caddy             do not touch any proxy (alias of --proxy none)
#   --app-dir DIR          install target (default /opt/solstice, or the clone)
#   --branch NAME          git branch to install (default main)
#   --yes                  answer yes to every confirmation
#   --upgrade              update an existing install (pull, build, restart)
#   --uninstall            stop and remove services (add --purge to delete data)
#   -h, --help             show this help
set -Eeuo pipefail

REPO_URL="https://github.com/heyitslumi/solstice.git"
BRANCH="main"
SERVICE_USER="solstice"
API_PORT="${SOLSTICE_API_PORT:-8788}"
WEB_PORT="${SOLSTICE_WEB_PORT:-5173}"
# One log per run, with a stable symlink so docs and `solstice doctor` keep working.
LOG_STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOG_FILE="${SOLSTICE_LOG:-/var/log/solstice-install-${LOG_STAMP}.log}"
LOG_LINK="/var/log/solstice-install.log"

DOMAIN=""
TUNNEL=0
TUNNEL_TOKEN=""
TUNNEL_MODE="quick"
CERTBOT_OK=1 # set 0 when the nginx/apache TLS fallback stays on HTTP
ADMIN_EMAIL=""
DB_URL=""
INSTALL_INCUS=1
PROXY="" # resolved to caddy|nginx|apache|none after arg parsing
PROXY_EXPLICIT=0
APP_DIR=""
APP_DIR_FLAG=0
ASSUME_YES=0
MAIL_MODE="ask"
SMTP_HOST=""; SMTP_PORT="587"; SMTP_USER=""; SMTP_PASS=""; SMTP_TLS="STARTTLS"
UPGRADE=0
UNINSTALL=0
PURGE=0
CURRENT_STEP=""
INSTALL_STARTED=0
STEP_N=0
STEP_TOTAL=0
STEP_LABEL=""
STEP_STARTED=0
SPINNER_PID=""
# fd 3 is the terminal, fd 9 the original stderr. Steps redirect their own
# stdout/stderr into the log, so UI output has to bypass that redirect — which
# is what makes a failed step still show up on screen instead of only in the log.
exec 3>&1
exec 9>&2

# ---------------------------------------------------------------------------
# Output helpers
#
# Commands run by a step are noisy (apt, npm, psql) and go to the log; the
# terminal only ever gets the curated UI below. Everything user-facing goes
# through ui(), so a piped or redirected run stays a readable text log.
# ---------------------------------------------------------------------------
log_file() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG_FILE"; }
log() { printf '  %s\n' "$*" >&3; log_file "$*"; }
# Warnings are held until the current step finishes, so they never cut into the
# spinner line. Outside a step they print straight away.
UI_WARNINGS=()
warn() {
  log_file "WARN $*"
  UI_WARNINGS+=("$*")
  if [ -z "$CURRENT_STEP" ]; then ui_flush_warnings; fi
}
ui_flush_warnings() {
  local w
  for w in ${UI_WARNINGS[@]+"${UI_WARNINGS[@]}"}; do
    printf '  %s! %s%s\n' "$C_YELLOW" "$w" "$C_RESET" >&3
  done
  UI_WARNINGS=()
}
die() {
  ui_step_fail
  # fd 9, not fd 3: errors keep going to stderr like any other CLI, while the
  # step line itself lives on the UI fd.
  printf '\n  %s%serror%s %s\n' "$C_BOLD" "$C_RED" "$C_RESET" "$*" >&9
  log_file "ERROR $*"
  exit 1
}

# --- terminal capabilities -------------------------------------------------
UI_TTY=0
if [ -t 1 ]; then UI_TTY=1; fi
if [ "$UI_TTY" -eq 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m' C_BOLD=$'\033[1m' C_DIM=$'\033[2m'
  C_ACCENT=$'\033[38;5;214m' C_GREEN=$'\033[32m' C_RED=$'\033[31m' C_YELLOW=$'\033[33m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_ACCENT="" C_GREEN="" C_RED="" C_YELLOW=""
fi

UI_WIDTH="$(tput cols 2>/dev/null || echo 80)"
case "$UI_WIDTH" in ''|*[!0-9]*) UI_WIDTH=80 ;; esac
if [ "$UI_WIDTH" -gt 100 ]; then UI_WIDTH=100; fi
if [ "$UI_WIDTH" -lt 60 ]; then UI_WIDTH=60; fi
UI_WIDTH=$((UI_WIDTH - 1))

ui_duration() { # $1=seconds
  local s=$1
  if [ "$s" -lt 60 ]; then printf '%ds' "$s"; else printf '%dm %02ds' "$((s / 60))" "$((s % 60))"; fi
}

ui_step_line() { # $1=trailing glyph ('' hides it)
  local tail="$1" dots pad num tot
  printf -v tot '%d' "$STEP_TOTAL"
  printf -v num "%${#tot}d" "$STEP_N"
  # 2 spaces + "[" + num + "/" + tot + "]" + space + label
  local plain_left=$((2 + 1 + ${#num} + 1 + ${#tot} + 1 + 1 + ${#STEP_LABEL}))
  pad=$((UI_WIDTH - plain_left - ${#tail} - 2))
  if [ "$pad" -lt 3 ]; then pad=3; fi
  printf -v dots '%*s' "$pad" ''
  dots="${dots// /.}"
  printf '  %s[%s/%s]%s %s%s%s %s%s%s%s' \
    "$C_DIM" "$num" "$tot" "$C_RESET" "$C_BOLD" "$STEP_LABEL" "$C_RESET" \
    "$C_DIM" "$dots" "$C_RESET" "$tail"
}

ui_spinner() {
  local frames=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) i=0
  trap 'exit 0' TERM
  while :; do
    printf '\r\033[2K%s %s' "$(ui_step_line '')" "${C_ACCENT}${frames[i]}${C_RESET}" >&3
    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.12
  done
}

ui_step_start() {
  STEP_LABEL="$1"
  STEP_STARTED=$SECONDS
  log_file "--- step $STEP_N/$STEP_TOTAL: $1"
  [ "$UI_TTY" -eq 1 ] || return 0
  ui_spinner &
  SPINNER_PID=$!
}

ui_stop_spinner() {
  if [ -n "$SPINNER_PID" ]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    if [ "$UI_TTY" -eq 1 ]; then printf '\r\033[2K' >&3; fi
  fi
}

ui_step_done() {
  local elapsed=$((SECONDS - STEP_STARTED))
  ui_stop_spinner
  if [ "$UI_TTY" -eq 1 ]; then printf '\r\033[2K' >&3; fi
  printf '%s %s✓%s\n' "$(ui_step_line '')" "$C_GREEN" "$C_RESET" >&3
  ui_flush_warnings
  log_file "--- step $STEP_N/$STEP_TOTAL: $STEP_LABEL done in $(ui_duration "$elapsed")"
}

ui_step_fail() {
  [ -n "$CURRENT_STEP" ] || return 0
  ui_stop_spinner
  if [ "$UI_TTY" -eq 1 ]; then printf '\r\033[2K' >&3; fi
  printf '%s %s✗%s\n' "$(ui_step_line '')" "$C_RED" "$C_RESET" >&3
  ui_flush_warnings
  log_file "--- step $STEP_N/$STEP_TOTAL: $STEP_LABEL FAILED"
  CURRENT_STEP=""
}

run_step() { # $1=label, rest=command
  local label="$1"; shift
  STEP_N=$((STEP_N + 1))
  CURRENT_STEP="$label"
  ui_step_start "$label"
  if "$@" >>"$LOG_FILE" 2>&1; then
    ui_step_done
    CURRENT_STEP=""
    return 0
  else
    local rc=$?
    ui_step_fail
    exit "$rc"
  fi
}

# ---------------------------------------------------------------------------
# Prompt helpers (gum when interactive, plain read otherwise)
# ---------------------------------------------------------------------------
HAVE_GUM=0
have_tty() { [ -t 0 ] && [ -t 1 ]; }

ui_confirm() { # $1=question -> 0=yes
  [ "$ASSUME_YES" -eq 1 ] && return 0
  if [ "$HAVE_GUM" -eq 1 ]; then gum confirm "$1"; else
    local ans; read -rp "$1 [Y/n] " ans
    [[ "${ans:-Y}" =~ ^[Yy]$ ]]
  fi
}

ui_input() { # $1=prompt $2=placeholder $3=default
  local prompt="$1" placeholder="${2:-}" default="${3:-}"
  if [ "$HAVE_GUM" -eq 1 ]; then
    if [ -n "$default" ]; then
      gum input --prompt "$prompt " --placeholder "$placeholder" --value "$default"
    else
      gum input --prompt "$prompt " --placeholder "$placeholder"
    fi
  else
    local val
    if [ -n "$default" ]; then read -rp "$prompt [$default]: " val; echo "${val:-$default}"
    else read -rp "$prompt: " val; echo "$val"; fi
  fi
}

ui_password() { # $1=prompt
  if [ "$HAVE_GUM" -eq 1 ]; then gum input --password --prompt "$1 "
  else local val; read -rsp "$1: " val; echo; echo "$val"; fi
}

ui_choose() { # $1=header, rest=options -> prints choice
  local header="$1"; shift
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum choose --header "$header" "$@"
  else
    echo "$header" >&2
    local i=1 opt
    for opt in "$@"; do echo "  $i) $opt" >&2; i=$((i + 1)); done
    local pick; read -rp "> [1] " pick; pick="${pick:-1}"
    i=1
    for opt in "$@"; do [ "$i" = "$pick" ] && { echo "$opt"; return; }; i=$((i + 1)); done
    echo "$1"
  fi
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
usage() {
  cat <<'EOF'
Solstice panel installer

  curl -fsSL https://solstice.host/install.sh | sudo bash
  sudo ./install.sh --domain panel.example.com --admin-email you@example.com

Flags:
  --domain HOST          public hostname (Caddy/nginx/Apache + automatic TLS)
  --proxy NAME           reverse proxy: caddy (default) | nginx | apache | none
  --tunnel               skip the proxy; expose via a Cloudflare quick tunnel
  --tunnel-token TOKEN   Cloudflare named tunnel token (own domain; create the
                         tunnel in your CF dashboard pointing at localhost)
  --admin-email EMAIL    operator email; becomes admin on first registration
  --mail relay|smtp      email delivery (default: ask, relay when non-interactive)
  --smtp-host HOST       SMTP server hostname (with --mail smtp)
  --smtp-port PORT       SMTP port (default 587)
  --smtp-user USER       SMTP username (empty = no auth)
  --smtp-pass PASS       SMTP password
  --smtp-tls MODE        STARTTLS | TLS | None (default STARTTLS)
  --db-url URL           reuse an existing Postgres (default: install local)
  --no-incus             skip Incus install/init (panel only, no workloads)
  --no-caddy             do not touch any proxy (alias of --proxy none)
  --app-dir DIR          install target (default /opt/solstice, or the clone)
  --branch NAME          git branch to install (default main)
  --yes                  answer yes to every confirmation
  --upgrade              update an existing install (pull, build, restart)
  --uninstall            stop and remove services (add --purge to delete data)
  -h, --help             show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --tunnel) TUNNEL=1; shift ;;
    --tunnel-token) [ $# -ge 2 ] || die "unknown tunnel token: missing value (--tunnel-token TOKEN)"; TUNNEL_TOKEN="$2"; TUNNEL=1; shift 2 ;;
    --proxy) [ $# -ge 2 ] || die "unknown proxy: missing value (--proxy caddy|nginx|apache|none)"; PROXY="$2"; PROXY_EXPLICIT=1; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --mail) MAIL_MODE="${2:-}"; shift 2 ;;
    --smtp-host) SMTP_HOST="${2:-}"; shift 2 ;;
    --smtp-port) SMTP_PORT="${2:-587}"; shift 2 ;;
    --smtp-user) SMTP_USER="${2:-}"; shift 2 ;;
    --smtp-pass) SMTP_PASS="${2:-}"; shift 2 ;;
    --smtp-tls) SMTP_TLS="${2:-STARTTLS}"; shift 2 ;;
    --db-url) DB_URL="${2:-}"; shift 2 ;;
    --no-incus) INSTALL_INCUS=0; shift ;;
    --no-caddy) PROXY="none"; PROXY_EXPLICIT=1; shift ;;
    --app-dir) APP_DIR="${2:-}"; APP_DIR_FLAG=1; shift 2 ;;
    --branch) BRANCH="${2:-main}"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --upgrade) UPGRADE=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown flag: $1 (see --help)" ;;
  esac
done

# Resolve the reverse proxy choice (default caddy; --no-caddy = none).
case "${PROXY:-}" in
  "") PROXY="caddy" ;;
  caddy|nginx|apache|none) : ;;
  *) die "unknown proxy: '$PROXY' (expected caddy, nginx, apache or none)" ;;
esac

[ "$(id -u)" -eq 0 ] || die "run as root (or with sudo)"

mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"
chmod 600 "$LOG_FILE"
# Stable path for docs and `solstice doctor`; the dated file keeps history.
ln -sfn "$LOG_FILE" "$LOG_LINK" 2>/dev/null || true

# Every failure ends here: draw the failed step, then the only log tail the user sees.
on_exit() {
  local rc=$?
  ui_step_fail
  ui_flush_warnings
  ui_stop_spinner
  if [ "$rc" -ne 0 ] && [ "$STEP_N" -gt 0 ]; then
    {
      printf '\n  %sInstallation failed in step %d/%d (%s).%s\n\n' \
        "$C_BOLD$C_RED" "$STEP_N" "$STEP_TOTAL" "${STEP_LABEL:-setup}" "$C_RESET"
      printf '  Last 25 lines of the log:\n\n'
      tail -n 25 "$LOG_FILE" 2>/dev/null | sed 's/^/    /' || true
      printf '\n  %sFull log: %s%s\n\n' "$C_DIM" "$LOG_FILE" "$C_RESET"
    } >&3 2>&3
  fi
  exit "$rc"
}
trap on_exit EXIT

# Piped installs consume stdin; hand the terminal back so prompts still work.
if [ ! -t 0 ] && [ -c /dev/tty ] && { : </dev/tty; } 2>/dev/null; then
  exec </dev/tty
fi

# ---------------------------------------------------------------------------
# Resolve install directory
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd || true)"
if [ -z "$APP_DIR" ]; then
  if [ -n "${SCRIPT_DIR:-}" ] && [ -f "$SCRIPT_DIR/package.json" ] && [ -d "$SCRIPT_DIR/apps/api" ]; then
    APP_DIR="$SCRIPT_DIR"
  else
    APP_DIR="/opt/solstice"
  fi
fi

DATA_DIR="/var/lib/solstice"
CONFIG_DIR="/etc/solstice"
ENV_FILE="$CONFIG_DIR/api.env"
INSTALL_META="$CONFIG_DIR/install.env"

repo_present() { [ -f "$APP_DIR/package.json" ] && [ -d "$APP_DIR/apps/api" ]; }

# An upgrade, uninstall, or purge reuses the recorded install; explicit flags still win.
if { [ "$UPGRADE" -eq 1 ] || [ "$UNINSTALL" -eq 1 ] || [ "$PURGE" -eq 1 ]; } && [ -f "$INSTALL_META" ]; then
  _app_dir="$APP_DIR"
  # shellcheck source=/dev/null
  . "$INSTALL_META"
  [ "$APP_DIR_FLAG" -eq 1 ] && APP_DIR="$_app_dir"
fi

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
uninstall() {
  log "removing services"
  systemctl disable --now solstice-api.service solstice-web.service solstice-tunnel.service 2>/dev/null || true
  rm -f /etc/systemd/system/solstice-api.service \
        /etc/systemd/system/solstice-web.service \
        /etc/systemd/system/solstice-tunnel.service \
        /usr/local/bin/solstice-tunnel.sh \
        /usr/local/bin/solstice
  # Our proxy site files only; packages and other sites are left alone.
  if [ -f /etc/nginx/sites-available/solstice.conf ]; then
    rm -f /etc/nginx/sites-enabled/solstice.conf /etc/nginx/sites-available/solstice.conf
    if command -v nginx >/dev/null && nginx -t >/dev/null 2>&1; then systemctl reload nginx 2>/dev/null || true; fi
  fi
  if [ -f /etc/apache2/sites-available/solstice.conf ]; then
    a2dissite solstice.conf >/dev/null 2>&1 || true
    rm -f /etc/apache2/sites-available/solstice.conf
    if command -v apache2ctl >/dev/null; then systemctl reload apache2 2>/dev/null || true; fi
  fi
  # A token tunnel's cloudflared service is ours; quick tunnels don't use it.
  if [ "${TUNNEL_MODE:-quick}" = "token" ]; then
    systemctl disable --now cloudflared 2>/dev/null || true
    if command -v cloudflared >/dev/null; then cloudflared service uninstall >/dev/null 2>&1 || true; fi
  fi
  systemctl daemon-reload
  if [ "$PURGE" -eq 1 ]; then
    log "purging app + data"
    if [ "${DB_LOCAL:-0}" = "1" ] && command -v psql >/dev/null 2>&1; then
      log "dropping local database and role"
      su postgres -c "dropdb --if-exists panel" 2>/dev/null || true
      su postgres -c "psql -q -c 'DROP ROLE IF EXISTS panel'" 2>/dev/null || true
    fi
    rm -rf "$APP_DIR" "$DATA_DIR" "$CONFIG_DIR"
    userdel "$SERVICE_USER" 2>/dev/null || true
  else
    log "kept $APP_DIR, $DATA_DIR and $CONFIG_DIR (use --purge to delete)"
  fi
  log "done"
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
preflight() {
  [ -f /etc/os-release ] || die "unsupported system (no /etc/os-release)"
  . /etc/os-release
  case "${ID:-}" in
    debian|ubuntu) : ;;
    *) die "unsupported distro '${ID:-unknown}' (Debian 12/13 or Ubuntu 22.04/24.04 required)" ;;
  esac

  local arch; arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64|arm64) : ;;
    *) die "unsupported architecture: $arch" ;;
  esac

  command -v systemctl >/dev/null || die "systemd is required"

  local mem_mb disk_gb
  mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  disk_gb="$(df -Pk / | awk 'NR==2 {print int($4/1024/1024)}')"
  [ "$mem_mb" -ge 900 ] || warn "only ${mem_mb}MB RAM; 1GB+ recommended"
  [ "$disk_gb" -ge 4 ] || die "need at least 4GB free disk (have ${disk_gb}GB)"

  if [ -e /dev/kvm ]; then
    log "KVM available (/dev/kvm)"
  else
    warn "no /dev/kvm — KVM instances will not work (containers still will)"
  fi

  if [ "$TUNNEL" -eq 0 ] && [ "$PROXY" != "none" ]; then
    local p
    for p in 80 443; do
      if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p$"; then
        local owner
        owner="$(ss -ltnp 2>/dev/null | grep -E "[:.]$p\s" | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -1)"
        if [ "$owner" != "caddy" ] && [ "$owner" != "nginx" ] && [ "$owner" != "apache2" ]; then
          die "port $p is already in use${owner:+ by $owner}; stop it or pass --proxy none"
        fi
      fi
    done
  fi

  if [ -n "$DOMAIN" ]; then
    local resolved
    resolved="$(getent ahosts "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}')"
    if [ -z "$resolved" ]; then
      warn "$DOMAIN does not resolve yet; TLS issuance will fail until DNS points here"
    else
      log "$DOMAIN resolves to $resolved"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
install_deps() {
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates git gnupg lsb-release openssl jq postgresql-client

  if have_tty && ! command -v gum >/dev/null 2>&1; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://repo.charm.sh/apt/gpg.key | gpg --dearmor -o /etc/apt/keyrings/charm.gpg
    echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" > /etc/apt/sources.list.d/charm.list
    apt-get update -qq
    apt-get install -y -qq gum || warn "gum unavailable, using plain prompts"
  fi
  have_tty && command -v gum >/dev/null 2>&1 && HAVE_GUM=1

  if ! command -v node >/dev/null || ! node --version | grep -qE "^v(24|[3-9][0-9])"; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y -qq nodejs
  fi
  log "node $(node --version)"
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
setup_database() {
  if [ -z "$DB_URL" ]; then
    apt-get install -y -qq postgresql
    DB_LOCAL=1
    # A re-run must not rotate the password out from under a kept env file
    # (write_env keeps the existing one) — reuse the recorded credentials.
    if su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='panel'\"" | grep -q 1 && [ -f "$ENV_FILE" ]; then
      DB_URL="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE")"
      log "reusing database credentials from $ENV_FILE"
    else
      local pass; pass="$(openssl rand -hex 24)"
      su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='panel'\"" | grep -q 1 \
        || su postgres -c "psql -c \"CREATE USER panel WITH PASSWORD '$pass'\""
      su postgres -c "psql -c \"ALTER USER panel WITH PASSWORD '$pass'\""
      su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='panel'\"" | grep -q 1 \
        || su postgres -c "createdb -O panel panel"
      DB_URL="postgres://panel:${pass}@127.0.0.1:5432/panel"
    fi
  fi
  # Never echo the password half of the URL into scrollback or a ticket.
  psql "$DB_URL" -tAc 'SELECT 1' >/dev/null \
    || die "cannot connect to ${DB_URL%%:*}://${DB_URL#*://*@}"
}

# ---------------------------------------------------------------------------
# Incus
# ---------------------------------------------------------------------------
setup_incus() {
  [ "$INSTALL_INCUS" -eq 1 ] || { log "skipping Incus (--no-incus)"; return 0; }

  if ! command -v incus >/dev/null; then
    curl -fsSL https://pkgs.zabbly.com/key.asc -o /etc/apt/keyrings/zabbly.asc
    cat > /etc/apt/sources.list.d/zabbly-incus-stable.sources <<EOF
Enabled: yes
Types: deb
URIs: https://pkgs.zabbly.com/incus/stable
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/zabbly.asc
EOF
    apt-get update -qq
    apt-get install -y -qq incus
  fi

  if ! incus info >/dev/null 2>&1; then
    incus admin init --auto || true
  fi
  # init --auto can half-fail (esp. nested); ensure pool + network + profile exist.
  incus storage show default >/dev/null 2>&1 || incus storage create default dir
  incus network show incusbr0 >/dev/null 2>&1 || incus network create incusbr0
  incus profile device show default root >/dev/null 2>&1 \
    || incus profile device add default root disk path=/ pool=default
  incus profile device show default eth0 >/dev/null 2>&1 \
    || incus profile device add default eth0 nic network=incusbr0 name=eth0
}

# ---------------------------------------------------------------------------
# Service user + app
# ---------------------------------------------------------------------------
ensure_service_user() {
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  # Incus socket access for the panel.
  if getent group incus-admin >/dev/null 2>&1; then
    usermod -aG incus-admin "$SERVICE_USER"
  fi
}

fetch_app() {
  if repo_present; then
    log "existing install at $APP_DIR — updating"
    # The repo is owned by the service user, so root must opt in explicitly.
    git -c safe.directory="$APP_DIR" -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
    git -c safe.directory="$APP_DIR" -C "$APP_DIR" reset --hard "origin/$BRANCH"
  else
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

build_app() {
  cd "$APP_DIR"
  npm ci --no-audit --no-fund
  npm run build --workspace @solstice/web
  mkdir -p "$DATA_DIR/mail" "$DATA_DIR/uploads" "$CONFIG_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  chmod 750 "$DATA_DIR" "$CONFIG_DIR"
}

write_env() {
  if [ -f "$ENV_FILE" ]; then
    log "keeping existing $ENV_FILE"
    return 0
  fi
  umask 077
  cat > "$ENV_FILE" <<EOF
PORT=$API_PORT
DATABASE_URL=$DB_URL
ADMIN_EMAILS=$ADMIN_EMAIL
TRUST_PROXY=1
NODE_ENV=production
MAIL_DIR=$DATA_DIR/mail
STORAGE_LOCAL_DIR=$DATA_DIR/uploads
EOF
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

write_meta() {
  umask 077
  cat > "$INSTALL_META" <<EOF
APP_DIR=$APP_DIR
DOMAIN=$DOMAIN
TUNNEL=$TUNNEL
BRANCH=$BRANCH
API_PORT=$API_PORT
WEB_PORT=$WEB_PORT
MAIL_MODE=$MAIL_MODE
ADMIN_EMAIL=$ADMIN_EMAIL
SMTP_HOST=$SMTP_HOST
DB_LOCAL=${DB_LOCAL:-0}
PROXY=$PROXY
TUNNEL_MODE=$TUNNEL_MODE
EOF
  chmod 600 "$INSTALL_META"
}

install_units() {
  cd "$APP_DIR"
  sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__API_PORT__#$API_PORT#g" -e "s#__SERVICE_USER__#$SERVICE_USER#g" \
    deploy/solstice-api.service > /etc/systemd/system/solstice-api.service
  sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__WEB_PORT__#$WEB_PORT#g" -e "s#__SERVICE_USER__#$SERVICE_USER#g" \
    deploy/solstice-web.service > /etc/systemd/system/solstice-web.service
  sed -e "s#__APP_DIR__#$APP_DIR#g" \
    deploy/solstice-tunnel.service > /etc/systemd/system/solstice-tunnel.service
  sed -e "s#__APP_DIR__#$APP_DIR#g" scripts/tunnel.sh > /usr/local/bin/solstice-tunnel.sh
  chmod +x /usr/local/bin/solstice-tunnel.sh
  systemctl daemon-reload
}

start_api() {
  systemctl enable --now solstice-api.service
  local i
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then
      log "api healthy"
      return 0
    fi
    sleep 1
  done
  journalctl -u solstice-api.service -n 30 --no-pager >&2 || true
  die "API did not become healthy on port $API_PORT"
}

# ---------------------------------------------------------------------------
# Reverse proxy
# ---------------------------------------------------------------------------
setup_caddy() {
  if ! command -v caddy >/dev/null; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi

  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__API_PORT__#$API_PORT#g" deploy/Caddyfile > /etc/caddy/Caddyfile

  # Caddy runs as its own user: make sure it can actually read the build.
  if ! runuser -u caddy -- test -r "$APP_DIR/apps/web/dist/index.html" 2>/dev/null; then
    log "fixing read permissions for caddy"
    chmod -R a+rX "$APP_DIR/apps/web/dist"
    local d; d="$APP_DIR"
    while [ "$d" != "/" ]; do chmod a+x "$d" 2>/dev/null || true; d="$(dirname "$d")"; done
  fi

  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
    || { caddy validate --config /etc/caddy/Caddyfile; die "invalid Caddyfile"; }

  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
  systemctl is-active --quiet caddy || die "caddy failed to start (journalctl -u caddy)"
}

# Make the static build readable by the proxy user (www-data), like setup_caddy
# does for the caddy user.
fix_dist_permissions() {
  if runuser -u www-data -- test -r "$APP_DIR/apps/web/dist/index.html" 2>/dev/null; then return 0; fi
  log "fixing read permissions for www-data"
  chmod -R a+rX "$APP_DIR/apps/web/dist"
  local d; d="$APP_DIR"
  while [ "$d" != "/" ]; do chmod a+x "$d" 2>/dev/null || true; d="$(dirname "$d")"; done
}

# Issue a certificate via certbot; failure never kills the install — the vhost
# stays on HTTP and the manual command is printed.
certbot_issue() { # $1=plugin (nginx|apache)
  [ -n "$DOMAIN" ] || return 0
  if ! command -v certbot >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq certbot "python3-certbot-$1" \
      || { warn "certbot install failed; enable TLS manually (see below)"; return 0; }
  fi
  [ -d "/etc/letsencrypt/live/$DOMAIN" ] && { log "certificate for $DOMAIN already exists"; return 0; }
  if certbot "--$1" -d "$DOMAIN" --non-interactive --agree-tos -m "${ADMIN_EMAIL:-admin@$DOMAIN}" --redirect; then
    CERTBOT_OK=1
  else
    CERTBOT_OK=0
    warn "TLS issuance failed (is DNS pointed at this server?)"
    warn "run later: certbot --$1 -d $DOMAIN --non-interactive --agree-tos -m $ADMIN_EMAIL --redirect"
  fi
}

setup_nginx() {
  [ -n "$DOMAIN" ] || die "nginx needs a hostname (--domain HOST)"
  if ! command -v nginx >/dev/null; then
    apt-get install -y -qq nginx
  fi
  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__API_PORT__#$API_PORT#g" -e "s#__APP_DIR__#$APP_DIR#g" \
    deploy/nginx-vhost.conf.template > /etc/nginx/sites-available/solstice.conf
  ln -sf /etc/nginx/sites-available/solstice.conf /etc/nginx/sites-enabled/solstice.conf
  nginx -t || die "nginx config invalid (nginx -t)"
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
  systemctl is-active --quiet nginx || die "nginx failed to start (journalctl -u nginx)"
  fix_dist_permissions
  certbot_issue nginx
}

setup_apache() {
  [ -n "$DOMAIN" ] || die "apache needs a hostname (--domain HOST)"
  if ! command -v apache2ctl >/dev/null; then
    apt-get install -y -qq apache2
  fi
  sed -e "s#__DOMAIN__#$DOMAIN#g" -e "s#__API_PORT__#$API_PORT#g" -e "s#__APP_DIR__#$APP_DIR#g" \
    deploy/apache-vhost.conf.template > /etc/apache2/sites-available/solstice.conf
  a2enmod proxy proxy_http proxy_wstunnel rewrite >/dev/null
  a2ensite solstice.conf >/dev/null
  apache2ctl configtest || die "apache config invalid (apachectl configtest)"
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl reload apache2 2>/dev/null || systemctl restart apache2
  systemctl is-active --quiet apache2 || die "apache failed to start (journalctl -u apache2)"
  fix_dist_permissions
  certbot_issue apache
}

setup_tunnel() {
  if ! command -v cloudflared >/dev/null; then
    local arch; arch="$(dpkg --print-architecture)"
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch.deb" -o /tmp/cloudflared.deb
    dpkg -i /tmp/cloudflared.deb || apt-get install -f -y -qq
  fi
  systemctl enable --now solstice-web.service

  if [ "$TUNNEL_MODE" = "token" ]; then
    # Named tunnel: the token already carries the tunnel + ingress config the
    # user made in their dashboard (pointed at this panel's local port).
    cloudflared service install "$TUNNEL_TOKEN"
    systemctl enable --now cloudflared
    local i
    for i in $(seq 1 30); do
      systemctl is-active --quiet cloudflared && break
      sleep 2
    done
    systemctl is-active --quiet cloudflared || die "cloudflared did not come up (journalctl -u cloudflared)"
    log "tunnel registered for https://$DOMAIN"
    TUNNEL_URL="https://$DOMAIN"
    return 0
  fi

  systemctl enable --now solstice-tunnel.service
  TUNNEL_URL=""
  local i
  for i in $(seq 1 30); do
    TUNNEL_URL="$(journalctl -u solstice-tunnel.service --no-pager -n 80 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)"
    [ -n "$TUNNEL_URL" ] && break
    sleep 2
  done
  [ -n "$TUNNEL_URL" ] || die "quick tunnel did not come up (journalctl -u solstice-tunnel)"
  log "tunnel URL: $TUNNEL_URL"
}

# ---------------------------------------------------------------------------
# Settings (public URL + mail)
# ---------------------------------------------------------------------------
sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

write_settings() {
  local url="$1"
  [ -n "$url" ] || return 0
  local host="${url#https://}"
  psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES
    ('app_url', '$(sql_escape "$url")'),
    ('webauthn_origin', '$(sql_escape "$url")'),
    ('webauthn_rp_id', '$(sql_escape "$host")')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" \
    || warn "could not write public URL to settings (set it in Settings → Application)"
}

write_mail_settings() {
  local relay_domain="${DOMAIN:-$(echo "${TUNNEL_URL:-}" | sed -E 's#https://([^/]+).*#\1#')}"
  if [ "$MAIL_MODE" = "relay" ]; then
    log "registering with Solstice mail relay"
    local token
    token="$(curl -fsS -m 15 -X POST https://mail.solstice.host/v1/relay/register \
      -H 'Content-Type: application/json' \
      -d "{\"domain\": \"$(sql_escape "$relay_domain")\", \"adminEmail\": \"$(sql_escape "$ADMIN_EMAIL")\"}" 2>/dev/null \
      | jq -r '.token // empty' 2>/dev/null || true)"
    if [ -n "$token" ]; then
      psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES
        ('mail_provider', 'solstice'), ('mail_relay_token', '$(sql_escape "$token")')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" \
        || warn "relay token not saved; set it in Settings → Mail"
      log "mail relay configured"
    else
      warn "relay unreachable; configure Settings → Mail later"
    fi
  elif [ "$MAIL_MODE" = "smtp" ]; then
    psql "$DB_URL" -q -c "INSERT INTO system_settings (key, value) VALUES
      ('mail_provider', 'smtp'),
      ('mail_smtp_host', '$(sql_escape "$SMTP_HOST")'),
      ('mail_smtp_port', '$(sql_escape "$SMTP_PORT")'),
      ('mail_smtp_user', '$(sql_escape "$SMTP_USER")'),
      ('mail_smtp_pass', '$(sql_escape "$SMTP_PASS")'),
      ('mail_tls_mode', '$(sql_escape "$SMTP_TLS")')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" \
      || warn "SMTP settings not saved; configure Settings → Mail"
    log "SMTP configured"
  fi
}

# ---------------------------------------------------------------------------
# Verify + summary
# ---------------------------------------------------------------------------
verify() { # $1=public (default 1) also proves the HTTPS front door
  local i
  for i in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break
    [ "$i" = 30 ] && die "local API health check failed"
    sleep 1
  done
  systemctl is-active --quiet solstice-api.service || die "solstice-api is not active"

  [ "${1:-1}" = "1" ] || return 0
  if [ "$TUNNEL" -eq 0 ] && [ "$PROXY" != "none" ]; then
    # TLS fallback left the vhost on HTTP: the panel is up — don't fail the
    # install over a certificate that needs DNS pointed first.
    if [ "$CERTBOT_OK" != "1" ]; then
      warn "panel is live on http://$DOMAIN; run the certbot command above once DNS points here"
      return 0
    fi
    for i in $(seq 1 60); do
      if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
        log "https://$DOMAIN is live"
        return 0
      fi
      sleep 2
    done
    die "https://$DOMAIN/api/health is not reachable — check DNS, firewall and journalctl -u ${PROXY}"
  fi
}

summary() {
  local url
  if [ "$TUNNEL" -eq 1 ]; then
    url="${TUNNEL_URL:-quick tunnel}"
  elif [ "$CERTBOT_OK" = "0" ]; then
    url="http://${DOMAIN:-your domain}"
  else
    url="https://${DOMAIN:-your domain}"
  fi
  local proxy_line=""
  if [ "$TUNNEL" -eq 1 ]; then
    if [ "$TUNNEL_MODE" = "token" ]; then
      proxy_line="Tunnel: Cloudflare (own domain)"
    else
      proxy_line="Tunnel: Cloudflare quick tunnel"
    fi
  elif [ "$PROXY" = "none" ]; then
    proxy_line="Proxy:  none (your own setup)"
  else
    proxy_line="Proxy:  $PROXY"
  fi
  local elapsed
  elapsed=" in $(ui_duration $((SECONDS - INSTALL_STARTED)))"

  printf '\n' >&3
  if [ "$HAVE_GUM" -eq 1 ]; then
    gum style --border rounded --padding "0 2" --border-foreground 214 \
      "Solstice is installed${elapsed}." \
      "Panel:  $url" \
      "$proxy_line" \
      "Admin:  $ADMIN_EMAIL" \
      "Mail:   $([ "$MAIL_MODE" = relay ] && echo 'Solstice Cloud Relay' || echo "SMTP $SMTP_HOST")" \
      "Logs:   $LOG_LINK, journalctl -u solstice-api" \
      "CLI:    solstice status" >&3
  else
    printf '  %sSolstice is installed%s%s.\n\n' "$C_BOLD" "$C_RESET" "$elapsed" >&3
    printf '  %-8s %s\n' "Panel" "$url" >&3
    printf '  %-8s %s\n' "Admin" "$ADMIN_EMAIL" >&3
    printf '  %-8s %s\n' "Mail" "$([ "$MAIL_MODE" = relay ] && echo 'Solstice Cloud Relay' || echo "SMTP $SMTP_HOST")" >&3
    printf '  %-8s %s\n' "Proxy" "${proxy_line#*:  }" >&3
    printf '  %-8s %s\n' "Logs" "$LOG_LINK, journalctl -u solstice-api" >&3
    printf '  %-8s %s\n' "CLI" "solstice status" >&3
  fi
  printf '\n  Next: open %s and register with %s.\n\n' "$url" "$ADMIN_EMAIL" >&3
}

install_cli() {
  cat > /usr/local/bin/solstice <<'CLI'
#!/usr/bin/env bash
set -euo pipefail
META=/etc/solstice/install.env
[ -f "$META" ] || { echo "solstice is not installed" >&2; exit 1; }
# shellcheck disable=SC1090
. "$META"

case "${1:-status}" in
  status)
    if [ "${TUNNEL:-0}" = "1" ]; then
      if [ "${TUNNEL_MODE:-quick}" = "token" ]; then echo "Panel:  https://${DOMAIN:-localhost} (Cloudflare tunnel)"; else echo "Panel:  quick tunnel (see journalctl -u solstice-tunnel)"; fi
    else echo "Panel:  https://${DOMAIN:-localhost}"; fi
    for u in solstice-api solstice-web solstice-tunnel caddy nginx apache2 cloudflared; do
      if systemctl list-unit-files "$u.service" >/dev/null 2>&1 && systemctl cat "$u.service" >/dev/null 2>&1; then
        printf '  %-18s %s\n' "$u" "$(systemctl is-active "$u" 2>/dev/null || true)"
      fi
    done
    ;;
  doctor)
    echo "== services =="
    systemctl --no-pager --lines=0 status solstice-api 2>/dev/null | head -5 || true
    echo "== api =="
    curl -fsS "http://127.0.0.1:${API_PORT:-8788}/api/health" && echo || echo "API not responding"
    echo "== ports =="
    ss -ltn | grep -E ':(80|443|8788|5173)\b' || true
    ;;
  logs) journalctl -u "solstice-${2:-api}" -f ;;
  restart) systemctl restart solstice-api solstice-web 2>/dev/null || systemctl restart solstice-api; echo restarted ;;
  upgrade)
    bash "$APP_DIR/install.sh" --upgrade --yes --app-dir "$APP_DIR"
    ;;
  uninstall)
    shift
    bash "$APP_DIR/install.sh" --uninstall "$@"
    ;;
  *) echo "usage: solstice {status|doctor|logs [api|web]|restart|upgrade|uninstall [--purge]}" >&2; exit 1 ;;
esac
CLI
  chmod +x /usr/local/bin/solstice
}

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
prompt_config() {
  # Tunnel type: quick tunnel (no account) or the user's own domain via a
  # named-tunnel token. Non-interactive default stays quick tunnel.
  if [ "$TUNNEL" -eq 1 ] && [ -z "$TUNNEL_TOKEN" ] && have_tty && [ "$ASSUME_YES" -eq 0 ]; then
    local tunnel_pick
    tunnel_pick="$(ui_choose "Tunnel type" \
      "Quick tunnel (no account, random URL)" \
      "Own domain (paste a Cloudflare tunnel token)")"
    if [[ "$tunnel_pick" == Own* ]]; then
      TUNNEL_TOKEN="$(ui_password "Tunnel token (from your Cloudflare dashboard)")"
      if [ -n "$TUNNEL_TOKEN" ]; then TUNNEL_MODE="token"; else TUNNEL_TOKEN=""; warn "no token entered; using a quick tunnel"; fi
    fi
  elif [ -n "$TUNNEL_TOKEN" ]; then
    TUNNEL_MODE="token"
  fi

  # Token tunnels are named for a specific hostname — the panel needs it for
  # app_url / webauthn / mail, so ask (or require the flag) even in tunnel mode.
  if [ -n "$TUNNEL_TOKEN" ] && [ -z "$DOMAIN" ]; then
    if have_tty; then
      while [ -z "$DOMAIN" ]; do
        DOMAIN="$(ui_input "Public hostname (your tunnel's domain)" "panel.example.com")"
        [ -n "$DOMAIN" ] || warn "the tunnel's hostname is required"
      done
    else
      die "pass --domain HOST with --tunnel-token (it names your own domain)"
    fi
  fi

  # Web server choice (skipped when tunneling or the flag already picked one).
  if [ "$TUNNEL" -eq 0 ] && [ "$PROXY_EXPLICIT" -eq 0 ] && have_tty && [ "$ASSUME_YES" -eq 0 ]; then
    local proxy_pick
    proxy_pick="$(ui_choose "Web server" \
      "Caddy (recommended, automatic TLS)" \
      "Nginx" \
      "Apache" \
      "None - my own setup")"
    case "$proxy_pick" in
      Nginx*) PROXY="nginx" ;;
      Apache*) PROXY="apache" ;;
      None*) PROXY="none" ;;
      *) PROXY="caddy" ;;
    esac
  fi

  if [ "$TUNNEL" -eq 0 ] && [ "$PROXY" != "none" ] && [ -z "$DOMAIN" ]; then
    if have_tty; then
      while [ -z "$DOMAIN" ]; do
        DOMAIN="$(ui_input "Public hostname" "panel.example.com")"
        [ -n "$DOMAIN" ] || warn "a hostname is required (or pass --tunnel)"
      done
    else
      die "pass --domain HOST or --tunnel"
    fi
  fi

  if [ -z "$ADMIN_EMAIL" ]; then
    if have_tty; then
      while true; do
        ADMIN_EMAIL="$(ui_input "Operator email" "you@example.com")"
        [[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] && break
        warn "that doesn't look like an email address"
      done
    else
      die "pass --admin-email you@example.com"
    fi
  fi

  # Mail delivery (only ask when the caller didn't pick).
  if [ "$MAIL_MODE" = "ask" ]; then
    if have_tty && [ "$ASSUME_YES" -eq 0 ]; then
      MAIL_MODE="$(ui_choose "Email delivery" \
        "Solstice Cloud Relay (recommended, free)" \
        "Own SMTP server")"
      case "$MAIL_MODE" in
        Own*) MAIL_MODE="smtp" ;;
        *) MAIL_MODE="relay" ;;
      esac
    else
      MAIL_MODE="relay"
    fi
  fi
  case "$MAIL_MODE" in
    relay|smtp) : ;;
    *) die "--mail must be relay or smtp" ;;
  esac

  if [ "$MAIL_MODE" = "smtp" ] && [ -z "$SMTP_HOST" ]; then
    have_tty || die "pass --smtp-host (and --smtp-user/--smtp-pass) with --mail smtp"
    SMTP_HOST="$(ui_input "SMTP host" "smtp.example.com")"
    SMTP_PORT="$(ui_input "SMTP port" "587" "587")"
    SMTP_TLS="$(ui_choose "TLS mode" "STARTTLS" "TLS" "None")"
    SMTP_USER="$(ui_input "SMTP username (empty = no auth)" "user@example.com")"
    if [ -n "$SMTP_USER" ]; then SMTP_PASS="$(ui_password "SMTP password")"; fi
  fi

  if ! ui_confirm "Install into $APP_DIR ${DOMAIN:+with domain $DOMAIN}${TUNNEL:+via quick tunnel}?"; then
    echo "aborted" >&2; exit 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
banner() {
  printf '\n  %sSolstice installer%s  %s·  %s%s\n' \
    "$C_BOLD" "$C_RESET" "$C_DIM" "${1:-}" "$C_RESET" >&3
  printf '  %sLog: %s%s\n\n' "$C_DIM" "$LOG_FILE" "$C_RESET" >&3
}

main() {
  if [ "$UNINSTALL" -eq 1 ]; then uninstall; exit 0; fi

  INSTALL_STARTED=$SECONDS

  if [ "$UPGRADE" -eq 1 ]; then
    repo_present || die "no existing install at $APP_DIR"
    # 6 fixed steps, plus "restart web" when the web unit is enabled.
    STEP_TOTAL=6
    if systemctl is-enabled --quiet solstice-web.service 2>/dev/null; then STEP_TOTAL=7; fi
    banner "upgrade"
    ensure_service_user
    run_step "update sources" fetch_app
    run_step "build" build_app
    run_step "systemd units" install_units
    run_step "restart api" systemctl restart solstice-api.service
    if systemctl is-enabled --quiet solstice-web.service 2>/dev/null; then
      run_step "restart web" systemctl restart solstice-web.service
    fi
    run_step "health" verify 0
    run_step "cli" install_cli
    summary
    exit 0
  fi

  # 11 setup steps + the proxy/tunnel step (skipped by --proxy none) + 3 + cli.
  STEP_TOTAL=15
  if [ "$TUNNEL" -eq 1 ] || [ "$PROXY" != "none" ]; then STEP_TOTAL=16; fi
  banner "$( [ "$TUNNEL" -eq 1 ] && echo "tunnel" || echo "$PROXY") · $(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-linux}") · $(dpkg --print-architecture 2>/dev/null || uname -m)"

  run_step "preflight" preflight
  run_step "dependencies" install_deps
  prompt_config
  run_step "database" setup_database
  run_step "incus" setup_incus
  run_step "service user" ensure_service_user
  run_step "fetch sources" fetch_app
  run_step "build" build_app
  run_step "environment" write_env
  run_step "meta" write_meta
  run_step "systemd units" install_units
  run_step "start api" start_api

  if [ "$TUNNEL" -eq 1 ]; then
    run_step "quick tunnel" setup_tunnel
  else
    case "$PROXY" in
      caddy) run_step "caddy" setup_caddy ;;
      nginx) run_step "nginx" setup_nginx ;;
      apache) run_step "apache" setup_apache ;;
      none) log "skipping proxy (--proxy none); point your proxy at 127.0.0.1:$API_PORT" ;;
    esac
  fi

  run_step "settings" write_settings "${TUNNEL_URL:-https://$DOMAIN}"
  run_step "mail" write_mail_settings
  run_step "verify" verify
  run_step "cli" install_cli

  summary
}

main "$@"
