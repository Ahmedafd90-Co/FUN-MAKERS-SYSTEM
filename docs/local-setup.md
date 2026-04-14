# Local Development Setup

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for Postgres, Redis, MinIO, MailHog)

## Steps

### 1. Install dependencies

```bash
pnpm install
```

This also runs `prisma generate` and copies the Prisma engine binary via the `postinstall` hook. You should see:

```
[copy-prisma-engine] Copied 2 file(s) to apps/web/.prisma/client
```

### 2. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

| Service     | Port(s)                     | Credentials                                        |
|-------------|-----------------------------|----------------------------------------------------|
| Postgres 16 | 5432                       | user: `fmksa`, password: `fmksa`, db: `fmksa_dev` |
| Redis 7     | 6379                       | (no auth)                                          |
| MinIO       | 9000 (API), 9001 (console) | `minioadmin` / `minioadmin`                        |
| MailHog     | 1025 (SMTP), 8025 (web UI) | (open)                                             |

MinIO auto-creates bucket `fmksa-dev-documents` on first start.

### 3. Create environment file

Create `apps/web/.env.local` with the values below. All values match docker-compose defaults:

```env
# Database (required)
DATABASE_URL=postgresql://fmksa:fmksa@localhost:5432/fmksa_dev?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# MinIO / S3 storage
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=fmksa-dev-documents
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true

# Email (MailHog captures all mail)
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
EMAIL_FROM="Fun Makers KSA <no-reply@local.dev>"

# Auth (Auth.js v5 — auto-generates in dev if omitted, but set explicitly to avoid warnings)
AUTH_SECRET=local-dev-secret-32-chars-minimum-xxxxxxxxxxxxx
AUTH_TRUST_HOST=true
```

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Seed the database

```bash
pnpm db:seed
```

Creates: master admin account, 14 roles, permissions, reference data, demo project.

### 6. Start the dev server

```bash
pnpm dev
```

Or start just the web app:

```bash
cd apps/web && pnpm dev
```

### 7. Open the app

http://localhost:3000

**Default login:**
- Email: `ahmedafd90@gmail.com`
- Password: `ChangeMe!Demo2026` (or value of `SEED_MASTER_ADMIN_PASSWORD` env var at seed time)

---

## Environment Variables Reference

| Variable | Required | Default | Used by |
|----------|----------|---------|---------|
| `DATABASE_URL` | **Yes** | — | Prisma (all DB access) |
| `REDIS_URL` | No | `redis://localhost:6379` | BullMQ job queues |
| `AUTH_SECRET` | Prod only | auto-generated in dev | Auth.js JWT signing |
| `AUTH_TRUST_HOST` | No | — | Auth.js host trust |
| `STORAGE_ENDPOINT` | Yes (for uploads) | — | S3/MinIO document storage |
| `STORAGE_BUCKET` | No | `fmksa-dev-documents` | S3 bucket name |
| `STORAGE_REGION` | No | `us-east-1` | S3 region |
| `STORAGE_ACCESS_KEY` | No | — | S3 credentials |
| `STORAGE_SECRET_KEY` | No | — | S3 credentials |
| `STORAGE_FORCE_PATH_STYLE` | No | `false` | Set `true` for MinIO |
| `EMAIL_SMTP_HOST` | No | `localhost` | Nodemailer SMTP |
| `EMAIL_SMTP_PORT` | No | `1025` | Nodemailer SMTP |
| `EMAIL_SMTP_USER` | No | — | SMTP auth |
| `EMAIL_SMTP_PASS` | No | — | SMTP auth |
| `EMAIL_FROM` | No | — | Sender address |
| `SEED_MASTER_ADMIN_PASSWORD` | No | `ChangeMe!Demo2026` | Seed script only |

---

## Runtime Verification Checklist

After setup, verify the app works end-to-end:

```
[ ] Docker services healthy          docker compose -f infra/docker/docker-compose.yml ps
[ ] App starts without CSS errors    pnpm dev  (no "class does not exist" errors)
[ ] /sign-in renders (HTTP 200)      curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sign-in
[ ] Login succeeds                   Use default credentials above, should redirect to /home
[ ] /home renders dashboard          Shows "Dashboard" header, project cards
[ ] /approvals renders               HTTP 200
[ ] /admin/users renders             HTTP 200 (admin route)
[ ] /admin/audit-log renders         HTTP 200 (admin route, has filter controls)
[ ] /admin/system-health renders     HTTP 200 (shows DB + Redis connection status)
[ ] No Prisma engine errors          Console has no "could not locate the Query Engine" messages
[ ] No unhandled rejections          Console has no red "unhandledRejection" errors
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all packages in dev mode (via Turborepo) |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check across workspace |
| `pnpm test` | Run all tests via Turborepo |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed reference data |
| `pnpm --filter @fmksa/db generate` | Regenerate Prisma client after schema changes |
| `DATABASE_URL=... pnpm --filter @fmksa/core exec vitest run` | Run core tests |
| `pnpm --filter web exec vitest run` | Run web tests (no DB needed) |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `border-border class does not exist` | Tailwind can't find its config. Ensure `apps/web/postcss.config.mjs` has the explicit `config` path. Delete `.next/` and restart. |
| `Prisma could not locate the Query Engine` | Run `node infra/scripts/copy-prisma-engine.mjs` from the repo root, or run `pnpm install` (triggers postinstall). |
| `MissingSecret` auth warning | Set `AUTH_SECRET` in `apps/web/.env.local`. Non-blocking in dev. |
| Document tests are skipped | Ensure MinIO is running and all `STORAGE_*` env vars are set. |
| Port conflicts | Run `docker ps` to check for existing containers. |
| Handlebars `require.extensions` warning | Non-blocking webpack warning from notification templates. Ignore. |
