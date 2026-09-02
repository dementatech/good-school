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
restarts it, and waits for it to answer. The backend container runs
`npm run migrate:up` before it boots, so migrations apply as part of the
restart.

Flags: `--no-pull`, `--no-backup`, `--check` (verify plumbing — git remote,
docker, DB reachability — then stop; no build, no restart).

If the backend never becomes healthy the script prints the last 60 log lines and
the exact `psql` restore command for the backup it just took.

### First run

`docker-compose.prod.yml` needs a `.env` beside it:

```
JWT_SECRET=<openssl rand -hex 32>          # must match the Vercel project
COOKIE_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<openssl rand -hex 32>
```

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
