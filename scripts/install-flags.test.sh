#!/usr/bin/env bash
# Flags/templates self-check for install.sh (no system side effects).
set -u
cd "$(dirname "$0")/.."
fails=0
t() { # t <name> <cmd...>
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "ok - $name"; else echo "FAIL - $name"; fails=$((fails + 1)); fi
}
t_err() { # t_err <name> <expected-substring> <cmd...>  (expects failure + stderr match)
  local name="$1" want="$2"; shift 2
  local out
  out="$("$@" 2>&1 >/dev/null || true)"
  if [[ "$out" == *"$want"* ]]; then echo "ok - $name"; else echo "FAIL - $name (stderr: $out)"; fails=$((fails + 1)); fi
}

# --proxy validation dies in arg parsing with a specific message
t_err "--proxy traefik rejected with 'unknown proxy'" "unknown proxy" bash install.sh --proxy traefik --yes
t_err "--proxy empty rejected" "unknown proxy" bash install.sh --proxy
t "--proxy nginx accepted (help exits 0)" bash install.sh --proxy nginx --help
t "--no-caddy alias still accepted" bash install.sh --no-caddy --help
t "--tunnel-token accepted" bash install.sh --tunnel-token eyJabc --help
t_err "--tunnel-token without value rejected" "unknown tunnel token" bash install.sh --tunnel-token
bash install.sh --help 2>&1 | grep -q -- '--proxy' \
  && echo "ok - help text mentions --proxy" || { echo "FAIL - help text mentions --proxy"; fails=$((fails + 1)); }

# `curl ... | bash` feeds the script in on stdin, so the script must never
# replace fd 0 — bash reads the remaining script from it and hangs mid-file.
if grep -qE 'exec[[:space:]]*<[[:space:]]*/dev/tty' install.sh; then
  echo "FAIL - install.sh reuses fd 0 (exec </dev/tty) and will hang when piped"
  fails=$((fails + 1))
else
  echo "ok - install.sh never replaces stdin (safe to pipe)"
fi
# Interactive detection must not depend on stdin (piped runs) nor be evaluated
# inside a step (stdout is the log there, so it always says "no tty").
if awk '/^have_tty\(\)/,/^}/' install.sh | grep -q -- '-t 0'; then
  echo "FAIL - have_tty requires stdin to be a tty"
  fails=$((fails + 1))
elif ! grep -q 'HAVE_TTY=1' install.sh; then
  echo "FAIL - terminal capability is never captured at startup"
  fails=$((fails + 1))
else
  echo "ok - have_tty is decided at startup, not per step"
fi
# A piped 40 KB script is the size that used to break; prove the real thing runs.
out="$(cat install.sh | bash -s -- --help 2>&1 | head -1)"
[[ "$out" == "Solstice panel installer" ]] \
  && echo "ok - piped run reaches usage without hanging" \
  || { echo "FAIL - piped run did not reach usage (got: $out)"; fails=$((fails + 1)); }

# Templates exist and carry the directives the panel needs
for f in deploy/nginx-vhost.conf.template deploy/apache-vhost.conf.template; do
  [ -f "$f" ] && echo "ok - $f exists" || { echo "FAIL - $f exists"; fails=$((fails + 1)); }
done
nginx=$(sed -e 's/__DOMAIN__/panel.example.com/g' -e 's/__API_PORT__/8788/g' -e 's|__APP_DIR__|/opt/solstice|g' deploy/nginx-vhost.conf.template 2>/dev/null || true)
apache=$(sed -e 's/__DOMAIN__/panel.example.com/g' -e 's/__API_PORT__/8788/g' -e 's|__APP_DIR__|/opt/solstice|g' deploy/apache-vhost.conf.template 2>/dev/null || true)
t "nginx template: no unrendered placeholders" env grep -vq '__' <<<"$nginx"
t "nginx template: API proxy with websockets" env grep -Eq 'proxy_pass http://127.0.0.1:8788|Upgrade' <<<"$nginx"
t "nginx template: SPA fallback" env grep -q 'index.html' <<<"$nginx"
t "apache template: no unrendered placeholders" env grep -vq '__' <<<"$apache"
t "apache template: directory permissions" env grep -q 'Require all granted' <<<"$apache"
t "apache template: websocket proxy modules" env grep -Eq 'proxy_wstunnel|ws://' <<<"$apache"

echo "$fails failures"
exit $((fails > 0))
