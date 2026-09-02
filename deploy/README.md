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

Flags: `--no-pull` (deploy the current checkout), `--no-backup` (skip the dump).

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

Add these repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DROPLET_HOST` | the droplet's IP or hostname |
| `DROPLET_USER` | `root` (or a deploy user) |
| `DROPLET_SSH_KEY` | private key whose public half is in the droplet's `~/.ssh/authorized_keys` |
| `DROPLET_REPO_PATH` | optional, defaults to `~/projects/school-os` |

To auto-deploy on merge instead, add `push: { branches: [main] }` to the
workflow's `on:` block.

## Rollback

```bash
git checkout <previous-sha>
./deploy/deploy.sh --no-backup
# and if a migration changed data:
gunzip -c ~/gs-backups/school_os-<timestamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d school_os
```
