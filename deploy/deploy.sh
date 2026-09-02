#!/usr/bin/env bash
#
# Deploy the latest main to this droplet.
#
#   ./deploy/deploy.sh              # pull, back up, rebuild + restart the backend
#   ./deploy/deploy.sh --no-pull    # skip git pull (deploy what's already checked out)
#   ./deploy/deploy.sh --no-backup  # skip the pre-deploy DB dump (not recommended)
#   ./deploy/deploy.sh --check      # verify plumbing only (git remote, docker, DB) — no build, no restart
#   ./deploy/deploy.sh --status     # report what's deployed vs origin/main — no changes at all
#
# The frontend is on Vercel and redeploys itself on push — this script only
# touches the backend + Postgres + Redis stack.
#
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$HOME/gs-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4000/api/v1/auth/me}"   # 401 = alive

DO_PULL=1
DO_BACKUP=1
CHECK_ONLY=0
STATUS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)   DO_PULL=0 ;;
    --no-backup) DO_BACKUP=0 ;;
    --check)     CHECK_ONLY=1 ;;
    --status)    STATUS_ONLY=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
mark() { [ "$1" = 1 ] && printf '\033[1;32m✓\033[0m' || printf '\033[1;31m✗\033[0m'; }

# ── --status: is this droplet in sync with origin/main? read-only ────────────
if [ "$STATUS_ONLY" = 1 ]; then
  say "deployment status"
  git fetch -q origin main
  LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse origin/main)
  IN_SYNC=$([ "$LOCAL" = "$REMOTE" ] && echo 1 || echo 0)
  printf '  %s code checked out : %s — %s\n' "$(mark "$IN_SYNC")" "$(git rev-parse --short HEAD)" "$(git log -1 --pretty=%s)"
  [ "$IN_SYNC" = 1 ] || printf '      origin/main is at : %s — %s  (run ./deploy/deploy.sh)\n' "$(git rev-parse --short origin/main)" "$(git log -1 --pretty=%s origin/main)"

  RUNNING=$($COMPOSE ps --status running --services 2>/dev/null | tr '\n' ' ')
  BE_UP=$(echo "$RUNNING" | grep -qw backend && echo 1 || echo 0)
  printf '  %s backend container : %s\n' "$(mark "$BE_UP")" "${RUNNING:-none running}"

  # image built after the last commit?
  IMG=$(docker inspect --format '{{.Created}}' "$($COMPOSE images -q backend 2>/dev/null | head -1)" 2>/dev/null | cut -c1-19 || true)
  [ -n "$IMG" ] && printf '      backend image built: %s   (last commit: %s)\n' "$IMG" "$(git log -1 --format=%cd --date=format:'%Y-%m-%dT%H:%M:%S')"

  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || echo "-")
  printf '  %s backend responding : HTTP %s on :4000\n' "$([ "$CODE" = 401 ] || [ "$CODE" = 200 ] && echo 1 || echo 0)" "$CODE"

  if [ "$BE_UP" = 1 ]; then
    LAST=$($COMPOSE exec -T postgres psql -U postgres -d school_os -tAc \
      "select string_agg(name, E'\n      ' order by run_on desc) from (select name, run_on from pgmigrations order by run_on desc limit 3) t" 2>/dev/null || echo "?")
    printf '    latest migrations  : %s\n' "$LAST"
  fi
  echo
  echo "  Frontend is on Vercel — check its dashboard shows a Ready deploy for $(git rev-parse --short origin/main)."
  exit 0
fi

# ── --check: prove the pipeline can reach everything, then stop ───────────────
if [ "$CHECK_ONLY" = 1 ]; then
  say "connectivity check (no build, no restart)"
  echo "  host        : $(hostname)"
  echo "  repo        : $(pwd)"
  echo "  checked out : $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
  git ls-remote --exit-code origin HEAD >/dev/null 2>&1 \
    && echo "  git remote  : reachable" || die "git remote unreachable (SSH/token/network)"
  docker version --format '{{.Server.Version}}' >/dev/null 2>&1 \
    && echo "  docker      : $(docker version --format '{{.Server.Version}}')" || die "docker not usable by this user"
  $COMPOSE config -q && echo "  compose file: valid" || die "docker-compose.prod.yml invalid"
  [ -f .env ] && echo "  .env        : present" || echo "  .env        : MISSING (needed on first real deploy)"
  $COMPOSE up -d postgres >/dev/null 2>&1 || true
  for _ in $(seq 1 15); do $COMPOSE exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  $COMPOSE exec -T postgres pg_isready -U postgres >/dev/null 2>&1 \
    && echo "  postgres    : accepting connections" || die "postgres not reachable"
  N=$($COMPOSE exec -T postgres psql -U postgres -d school_os -tAc "select count(*) from pgmigrations" 2>/dev/null || echo "?")
  echo "  migrations  : $N applied"
  say "check passed — a real deploy would run now"
  exit 0
fi

# ── 1. Pull ──────────────────────────────────────────────────────────────────
if [ "$DO_PULL" = 1 ]; then
  say "git pull (fast-forward only)"
  git fetch origin
  git merge --ff-only origin/main || die "main has diverged — resolve by hand, then re-run with --no-pull"
fi
echo "  at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# ── 2. Make sure Postgres + Redis are up ─────────────────────────────────────
say "starting postgres + redis"
$COMPOSE up -d postgres redis
for _ in $(seq 1 30); do
  $COMPOSE exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
$COMPOSE exec -T postgres pg_isready -U postgres >/dev/null 2>&1 || die "postgres did not come up"

# ── 3. Back up the database ──────────────────────────────────────────────────
if [ "$DO_BACKUP" = 1 ]; then
  say "backing up the database"
  mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/school_os-$(date +%F-%H%M%S).sql.gz"
  $COMPOSE exec -T postgres pg_dump -U postgres school_os | gzip > "$BACKUP"
  SIZE=$(stat -c%s "$BACKUP" 2>/dev/null || stat -f%z "$BACKUP")
  [ "$SIZE" -gt 500 ] || die "backup looks empty ($SIZE bytes) — aborting: $BACKUP"
  echo "  $BACKUP ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "$SIZE B"))"
  # prune old ones
  ls -1t "$BACKUP_DIR"/school_os-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm --
fi

# ── 4. Build the backend image (alone — the droplet has little RAM) ──────────
say "building the backend image"
$COMPOSE build backend

# ── 5. Restart — the container runs migrate:up before it boots ───────────────
say "restarting the backend (migrations run first)"
$COMPOSE up -d backend

# ── 6. Health check ─────────────────────────────────────────────────────────
say "waiting for the backend"
OK=0
for _ in $(seq 1 40); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)
  if [ "$CODE" = "401" ] || [ "$CODE" = "200" ]; then OK=1; break; fi
  sleep 2
done

if [ "$OK" != 1 ]; then
  echo
  $COMPOSE logs --tail=60 backend
  die "backend did not become healthy. Migrations may have failed (see logs above). Restore with:
     gunzip -c ${BACKUP:-<latest backup>} | $COMPOSE exec -T postgres psql -U postgres -d school_os"
fi

say "deployed"
$COMPOSE ps
echo
echo "  Frontend: Vercel redeploys on push — check its dashboard."
echo "  Rollback: git checkout <prev sha> && ./deploy/deploy.sh --no-backup"
