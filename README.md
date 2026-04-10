# Fun Makers KSA

Internal operations platform for Pico Play construction and project delivery in the Kingdom of Saudi Arabia. Fun Makers KSA is a pnpm + Turborepo monorepo containing the shared core platform (Module 1) and the eventual domain modules (commercial, procurement, materials, contracts, budget, cashflow, reports, PMO KPIs) that power Pico Play's end-to-end project lifecycle — from handover through closeout — with role-based access, approval workflows, document versioning, auditability, and the posting service that keeps operational records in lockstep with downstream finance.

## Quick Start

### Prerequisites

- Node.js 20+ (check with `node --version`)
- pnpm 9+ (install with `npm install -g pnpm@9`)
- Docker Desktop (for local Postgres, Redis, MinIO, MailHog)

### Local Development

```bash
# 1. Clone the repository
git clone <repo-url>
cd fun-makers-ksa

# 2. Install dependencies
pnpm install

# 3. Start infrastructure (Postgres, Redis, MinIO, MailHog)
docker compose -f infra/docker/docker-compose.yml up -d

# 4. Copy environment variables
cp infra/docker/.env.example apps/web/.env.local

# 5. Generate Prisma client
pnpm --filter @fmksa/db exec prisma generate

# 6. Run database migration (Phase 1.2+)
# pnpm db:migrate

# 7. Seed database (Phase 1.2+)
# pnpm db:seed

# 8. Start development servers
pnpm dev

# 9. Open the app
open http://localhost:3000
```

> **Note:** You can run `pnpm dev` without Docker. The Next.js app will start
> normally on port 3000, but the BullMQ worker (`packages/jobs`) will log Redis
> connection errors — this is expected and does not affect the web app.

### Useful URLs (when Docker is running)

| Service | URL | Credentials |
|---------|-----|-------------|
| Web App | http://localhost:3000 | — |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |
| MailHog | http://localhost:8025 | — |
| Postgres | localhost:5432 | fmksa / fmksa |
| Redis | localhost:6379 | — |

## Repository layout

```
apps/                 Next.js application (added in Group 1.1-B)
packages/
  config/             Shared TS / ESLint / Prettier / Tailwind config
  core/               Domain services (auth, access-control, workflow, ...)
  db/                 Prisma schema + client
  contracts/          Shared Zod schemas and types
  jobs/               BullMQ worker process
  ui/                 Shared UI kit (added in Group 1.1-B)
infra/cdk/            AWS CDK infrastructure (added in Group 1.1-C)
docs/superpowers/     Spec and implementation plan
```

## Documentation

- Module 1 design spec: `docs/superpowers/specs/2026-04-09-module-1-shared-core-platform-design.md`
- Module 1 implementation plan: `docs/superpowers/plans/2026-04-09-module-1-implementation-plan.md`
