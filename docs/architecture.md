# Fun Makers KSA — Module 1 Architecture

**Project:** FMKSA is the internal operations platform for Pico Play, a construction and project delivery company in Saudi Arabia. It manages projects, entities, documents, workflows, and posting operations with a full audit trail.

---

## Monorepo Layout

Built with **pnpm workspaces** and **Turborepo**.

```
apps/
  web/                  Next.js 15 App Router (primary client)
packages/
  config/               Shared ESLint and TypeScript configs
  contracts/            Zod schemas used for tRPC input validation
  core/                 13 domain service modules (see below)
  db/                   Prisma 5 client, schema, seed, middleware
  jobs/                 BullMQ background workers
  ui/                   shadcn/ui component library (17 components)
infra/
  cdk/                  AWS CDK infrastructure (7 stacks)
  docker/               Local dev services via docker-compose
```

---

## Application Layer (`apps/web`)

- **Framework:** Next.js 15 App Router
- **API:** tRPC v11 — all mutations and queries go through typed procedures
- **Auth:** Auth.js v5, JWT strategy, password-based only (no OAuth in Module 1)

### tRPC Routers (11)

`auth` · `projects` · `entities` · `referenceData` · `workflow` · `documents` · `posting` · `notifications` · `dashboard` · `audit` · `health`

### Procedure Tiers

| Tier | Auth requirement |
|---|---|
| `publicProcedure` | None — used for `signIn` only |
| `protectedProcedure` | Valid session required |
| `adminProcedure` | `system.admin` permission required |
| `projectProcedure` | Project assignment OR `cross_project.read` permission |

---

## Core Domain Services (`packages/core`)

13 modules, each encapsulating its own business logic:

`access-control` · `audit` · `auth` · `documents` · `entities` · `health` · `notifications` · `posting` · `projects` · `reference-data` · `workflow` · shared utils

Each module is imported by the tRPC router layer. They do not call each other directly — cross-domain work is orchestrated at the router level.

---

## Database (`packages/db`)

- **Engine:** PostgreSQL 16
- **ORM:** Prisma 5, 30 models, 2 migrations
- **Middleware registered on the Prisma client:**
  - `signed-immutability` — blocks update/delete on signed document versions
  - `no-delete-on-immutable` — enforces append-only behavior for audit records
- **Seed:** `packages/db/seed` — populates reference data and initial roles

---

## Background Jobs (`packages/jobs`)

- **Queue:** BullMQ (Redis-backed)
- Current workers: email delivery

---

## UI Library (`packages/ui`)

17 shadcn/ui components including `cmdk` (command palette). Consumed by `apps/web`.

---

## Infrastructure

### AWS CDK (`infra/cdk`) — 7 stacks

`network` · `database` · `cache` · `storage` · `secrets` · `compute` · `monitoring`

### Local Dev (`infra/docker`)

`docker-compose.yml` runs: **Postgres 16**, **Redis 7**, **MinIO** (S3-compatible object storage), **MailHog** (email capture).

---

## Key Invariants

These are enforced at the data and service layer — do not work around them.

- **Append-only audit logs** — Prisma middleware blocks all deletes on audit records.
- **Signed document immutability** — Prisma middleware blocks updates and deletes on signed document versions.
- **Override control** — Sensitive operations require dual-approval before execution.
- **Posting idempotency** — All posting operations carry a unique idempotency key to prevent double-submission.
- **Project-scope isolation** — Access denials on cross-project reads are themselves audit-logged.

---

## Input Validation

All tRPC inputs are validated against **Zod schemas** defined in `packages/contracts`. Do not define schemas inline in routers — add them to contracts and import.

---

## Testing

- **Framework:** Vitest, 3 configs: `core`, `db`, `web`
- **Count:** ~300 tests
- **Integration tests** connect to a real Postgres instance (not mocked)
- Run `pnpm test` from the repo root via Turborepo to execute all configs in dependency order
