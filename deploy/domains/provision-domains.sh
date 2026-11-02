#!/usr/bin/env bash
#
# Sets up and takes down schools' custom domains on this server. Run as root by
# the gs-domains systemd timer (see install.sh); it does nothing when there's
# nothing to do.
#
# The app decides WHAT should exist, in the school_domain table. Only this
# script touches nginx and certificates, so the app container never needs root.
# Every domain is treated as untrusted: it must match the pattern below, and a
# name another site on this server already serves is refused.
#
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

exec 9>/run/gs-domains.lock
flock -n 9 || exit 0

COMPOSE="docker compose -f docker-compose.prod.yml"
SITES_AVAILABLE="${SITES_AVAILABLE:-/etc/nginx/sites-available}"
SITES_ENABLED="${SITES_ENABLED:-/etc/nginx/sites-enabled}"
PREFIX="gs-domain-"
TEMPLATE="$REPO/deploy/nginx/school-domain.conf.template"
# Must stay in step with DOMAIN_PATTERN in school-domains.repository.ts.
VALID='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'

env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 || true; }
BACKEND_PORT="$(env_value BACKEND_PORT)"; BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="$(env_value FRONTEND_PORT)"; FRONTEND_PORT="${FRONTEND_PORT:-3000}"

psql_run() { $COMPOSE exec -T postgres psql -U postgres -d school_os -v ON_ERROR_STOP=1 -At "$@"; }
rows_with_status() { echo "select domain from school_domain where status = '$1'" | psql_run; }

mark() { # domain status error
  psql_run -v d="$1" -v s="$2" -v e="${3:-}" >/dev/null <<'SQL'
update school_domain
   set status = :'s', last_error = nullif(:'e', ''), updated_at = now(),
       activated_at = case when :'s' = 'active' then now() else activated_at end
 where domain = :'d' and status = 'provisioning'
SQL
}

reload_nginx() { nginx -t >/dev/null 2>&1 && systemctl reload nginx; }

take_down() {
  rm -f "$SITES_ENABLED/$PREFIX$1" "$SITES_AVAILABLE/$PREFIX$1"
  reload_nginx || echo "! nginx config test failed after removing $1" >&2
  certbot delete --cert-name "$1" --non-interactive >/dev/null 2>&1 || true
}

# Reads the whole list first: with pipefail, `grep -q` stopping early on a match
# would fail the pipeline and make a name in use look free.
served_elsewhere() {
  local names
  names="$(nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name[[:space:]]' | tr -s ' ;\t' '\n')"
  grep -Fxq "$1" <<<"$names"
}

set_up() {
  local d="$1" output
  if [[ ! "$d" =~ $VALID ]] || [ "${#d}" -gt 253 ]; then
    mark "$d" failed "That domain name isn't valid."
    return
  fi
  if [ ! -e "$SITES_AVAILABLE/$PREFIX$d" ] && served_elsewhere "$d"; then
    mark "$d" failed "Another site on this server already uses that domain."
    return
  fi
  sed -e "s/__DOMAIN__/$d/g" -e "s/__BACKEND_PORT__/$BACKEND_PORT/g" -e "s/__FRONTEND_PORT__/$FRONTEND_PORT/g" \
    "$TEMPLATE" > "$SITES_AVAILABLE/$PREFIX$d"
  ln -sf "$SITES_AVAILABLE/$PREFIX$d" "$SITES_ENABLED/$PREFIX$d"
  if ! reload_nginx; then
    take_down "$d"
    mark "$d" failed "The server's web configuration rejected this domain."
    return
  fi
  if output="$(certbot --nginx -d "$d" --redirect --non-interactive --agree-tos --keep-until-expiring 2>&1)"; then
    mark "$d" active
    echo "active: $d"
  else
    echo "$output" >&2
    take_down "$d"
    mark "$d" failed "The HTTPS certificate couldn't be issued. Check the DNS record, then try again."
  fi
}

for d in $(rows_with_status provisioning); do set_up "$d"; done

for d in $(rows_with_status removing); do
  take_down "$d"
  psql_run -v d="$d" >/dev/null <<'SQL'
delete from school_domain where domain = :'d'
SQL
  echo "removed: $d"
done

# A deleted school takes its row with it, so clear what it left behind. The
# query must succeed first: `set -e` stops here if the database can't answer,
# which keeps an outage from looking like "no domains exist".
known="$(echo "select domain from school_domain" | psql_run)"
shopt -s nullglob
for path in "$SITES_AVAILABLE/$PREFIX"*; do
  d="${path##*/$PREFIX}"
  if ! grep -Fxq "$d" <<<"$known"; then
    take_down "$d"
    echo "cleaned up: $d"
  fi
done
