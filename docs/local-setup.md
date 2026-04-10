# Local Development Setup

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for Postgres, Redis, MinIO, MailHog)

## Steps

### 1. Clone the repo

```bash
git clone <repo-url>
cd fun-makers-system
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts:

| Service  | Port(s)        | Credentials                                   |
|----------|----------------|-----------------------------------------------|
| Postgres 16 | 5432        | user: `fmksa`, password: `fmksa`, db: `fmksa_dev` |
| Redis 7  | 6379           |                                               |
| MinIO    | 9000 (API), 9001 (console) | `minioadmin` / `minioadmin`, auto-creates bucket `fmksa-dev-documents` |
| MailHog  | 1025 (SMTP), 8025 (web UI) |                                               |

### 4. Set environment variables

Copy the following into a `.env` file at the project root:

```env
DATABASE_URL=postgresql://fmksa:fmksa@localhost:5432/fmksa_dev
REDIS_URL=redis://localhost:6379
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=fmksa-dev-documents
STORAGE_REGION=us-east-1
SMTP_HOST=localhost
SMTP_PORT=1025
AUTH_SECRET=dev-secret-change-in-production
NEXTAUTH_URL=http://localhost:3000
```

### 5. Run migrations

```bash
pnpm db:migrate
```

### 6. Seed the database

```bash
pnpm db:seed
```

Creates the master admin account, 14 roles, permissions, and reference data.

### 7. Start the dev server

```bash
pnpm dev
```

Turborepo runs all packages in parallel.

### 8. Open the app

http://localhost:3000

**Default login:** `ahmedafd90@gmail.com` / `Admin@123456` (master admin)

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all packages in dev mode |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check across workspace |
| `pnpm test` | Run all tests via Turborepo |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed reference data |
| `DATABASE_URL=... pnpm --filter @fmksa/core exec vitest run` | Run core package tests |
| `DATABASE_URL=... pnpm --filter web exec vitest run` | Run web package tests |
| `pnpm --filter @fmksa/db generate` | Regenerate Prisma client after schema changes |

---

## Troubleshooting

- **Prisma errors about missing client** — run `pnpm --filter @fmksa/db generate`
- **Document tests are skipped** — ensure MinIO is running and all `STORAGE_*` env vars are set
- **Port conflicts** — run `docker ps` to check for existing containers using the same ports
