# Deploy

Backend + Postgres + Redis run on the droplet via `docker-compose.prod.yml`.
The frontend is on Vercel and redeploys itself on every push to `main`.

## Manual deploy (on the droplet)

```bash
cd ~/projects/school-os
./deploy/deploy.sh
```

It pulls `main` (fast-forward only), starts Postgres/Redis, **dumps the
database** to `~/gs-backups/` (keeps the last 10), rebuilds the backend image,
restarts it, and waits for it to answer. Then, if the pitch demo school
(Mirembe Hill — `backend/scripts/seed-demo-primary-school.ts`) isn't in the
database yet, it creates it; once it's there, deploys skip it. The backend container runs
`npm run migrate:up` before it boots, so migrations apply as part of the
restart.

Flags:
- `--no-pull`, `--no-backup`
- `--check` — verify plumbing (git remote, docker, DB), then stop
- `--demo-only` — refresh the pitch demo school's dates on the running stack
  (backs up first; no rebuild). Add `--demo-date=YYYY-MM-DD` to build it as of
  the pitch day. Keeps the demo's people and logins; replaces anything dated
  entered during an earlier pitch.
- `--status` — report **what's deployed vs `origin/main`** (commit, container,
  image age, health, latest migrations). Read-only, changes nothing. This is
  the "is prod in sync?" command.

If the backend never becomes healthy the script prints the last 60 log lines and
the exact `psql` restore command for the backup it just took.

### First run

`docker-compose.prod.yml` needs a `.env` beside it:

```
JWT_SECRET=<openssl rand -hex 32>          # must match the Vercel project
COOKIE_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<openssl rand -hex 32>

# Password-reset emails (Resend — https://resend.com). Without RESEND_API_KEY
# the backend logs the reset link instead of emailing it.
RESEND_API_KEY=<from the Resend dashboard>
RESEND_FROM=Good School <onboarding@resend.dev>   # until a domain is verified
APP_URL=https://<the Vercel frontend domain>       # no trailing slash
```

After editing `.env`, `./deploy/deploy.sh` picks the new values up on the next
restart (compose reads `.env` automatically).

`pg_dump` / `psql` are not on the host — always go through the container:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d school_os -c "select ..."
```

## Deploy from GitHub (optional)

`.github/workflows/deploy.yml` SSHes into the droplet and runs `deploy.sh`.
It is **manual-trigger only** (Actions tab → *Deploy to droplet* → *Run
workflow*) — merges to `main` don't auto-deploy, because migrations can be
destructive.

### Setup

1. Make a dedicated key for CI (don't reuse a personal one):
   ```bash
   ssh-keygen -t ed25519 -f gh-deploy -N "" -C "github-actions-deploy"
   ```
2. Put the **public** half on the droplet:
   ```bash
   ssh-copy-id -i gh-deploy.pub root@<droplet-ip>
   # or: cat gh-deploy.pub | ssh root@<ip> 'cat >> ~/.ssh/authorized_keys'
   ```
3. Add repo secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `DROPLET_HOST` | the droplet's IP or hostname |
   | `DROPLET_USER` | `root` (or a deploy user) |
   | `DROPLET_SSH_KEY` | contents of the **private** `gh-deploy` file (all of it, incl. the BEGIN/END lines) |
   | `DROPLET_REPO_PATH` | optional, defaults to `~/projects/school-os` |

### Verifying it works

1. **Test the SSH key by hand first** — from your machine:
   ```bash
   ssh -i gh-deploy <user>@<host> 'cd ~/projects/school-os && ./deploy/deploy.sh --check'
   ```
   If that prints "check passed", the CI job will too.
2. **Run the workflow in `check` mode**: Actions → *Deploy to droplet* →
   *Run workflow* → `mode: check`. It SSHes in, fast-forwards `main`, and runs
   `--check`. Green = SSH, path, docker and the DB are all reachable. Nothing
   was built or restarted.
3. Once check is green, run it again with `mode: deploy` for a real deploy —
   the live log streams the whole `deploy.sh` run.

To auto-deploy on merge instead, add `push: { branches: [main] }` to the
workflow's `on:` block (and set the default `mode` reasoning aside — a `push`
event ignores inputs, so it always runs a full deploy).

## Rollback

```bash
git checkout <previous-sha>
./deploy/deploy.sh --no-backup
# and if a migration changed data:
gunzip -c ~/gs-backups/school_os-<timestamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d school_os
```

## Troubleshooting

### `failed to resolve source metadata for docker.io/library/node…` / `can't resolve registry-1.docker.io`

The droplet can't look up or reach Docker Hub, which the build needs for the
Node base image (npm is needed too, for packages). `deploy.sh` now checks this
before backing up or building and stops early. The running site is never touched.

An error like `write udp 127.0.0.1:…->127.0.0.53:53: write: operation not permitted`
means the droplet's own firewall is blocking DNS:

```bash
getent hosts registry-1.docker.io        # no output = DNS is broken on the host
sudo ufw status verbose                  # "deny (outgoing)"? then:
sudo ufw allow out 53 && sudo ufw allow out 80/tcp && sudo ufw allow out 443/tcp
sudo iptables -S OUTPUT | head           # otherwise, look for a DROP/REJECT rule
sudo systemctl restart systemd-resolved docker   # stale DNS, or Docker's rules need rebuilding (restarts containers briefly)
```

Once `getent hosts registry-1.docker.io` prints an address, run `./deploy/deploy.sh`
again. `./deploy/deploy.sh --check` runs the same network check without deploying.
