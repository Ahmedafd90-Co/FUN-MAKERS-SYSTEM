# Fun Makers KSA — Architecture

**Project:** FMKSA is the internal operations platform for Pico Play, a construction and project delivery company in Saudi Arabia. It manages projects, entities, documents, workflows, posting operations, commercial workflows, and procurement/purchasing with a full audit trail.

**Modules shipped:** Module 1 (Shared Core Platform), Module 2 (Commercial Engine), Module 3 (Procurement Engine — hardening complete, feature development paused).

---

## Monorepo Layout

Built with **pnpm workspaces** and **Turborepo**.

```
apps/
  web/                  Next.js 15 App Router (primary client)
packages/
  config/               Shared ESLint and TypeScript configs
  contracts/            Zod schemas used for tRPC input validation
  core/                 Domain service modules (see below)
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

### tRPC Routers

**Module 1:** `auth` · `projects` · `entities` · `referenceData` · `workflow` · `documents` · `posting` · `notifications` · `dashboard` · `audit` · `health`

**Module 2 (commercial):** `ipa` · `ipc` · `variation` · `costProposal` · `taxInvoice` · `correspondence` · `commercialDashboard`

**Module 3 (procurement):** `vendor` · `vendorContract` · `frameworkAgreement` · `rfq` · `quotation` · `catalog` · `category` · `projectVendor`

### Procedure Tiers

| Tier | Auth requirement |
|---|---|
| `publicProcedure` | None — used for `signIn` only |
| `protectedProcedure` | Valid session required |
| `adminProcedure` | `system.admin` permission required |
| `projectProcedure` | Project assignment OR `cross_project.read` permission |
| `entityProcedure` | Authenticated + entity assignment; used for master data (vendor, category, catalog, framework agreement) |

---

## Core Domain Services (`packages/core`)

Each module encapsulates its own business logic:

**Module 1:** `access-control` · `audit` · `auth` · `documents` · `entities` · `health` · `notifications` · `posting` · `projects` · `reference-data` · `workflow` · shared utils · `scope-binding`

**Module 2:** `commercial/ipa` · `commercial/ipc` · `commercial/variation` · `commercial/cost-proposal` · `commercial/tax-invoice` · `commercial/correspondence` · `commercial/dashboard`

**Module 3:** `procurement/vendor` · `procurement/vendor-contract` · `procurement/framework-agreement` · `procurement/rfq` · `procurement/quotation` · `procurement/catalog` · `procurement/category` · `procurement/project-vendor`

Each module is imported by the tRPC router layer. They do not call each other directly — cross-domain work is orchestrated at the router level.

---

## Database (`packages/db`)

- **Engine:** PostgreSQL 16
- **ORM:** Prisma 5, 54 models, 35 enums (including 11 status enums enforcing valid lifecycle states)
- **Middleware registered on the Prisma client:**
  - `signed-immutability` — blocks update/delete on signed document versions
  - `no-delete-on-immutable` — enforces append-only behavior for audit records
- **Referential integrity:** All foreign keys have `@relation` directives with `onDelete` policies. categoryId and itemCatalogId fields enforce `Restrict` to prevent orphaned records (added in H6 hardening).
- **Seed:** `packages/db/seed` — populates reference data, initial roles, and procurement permissions (77 codes across 13 resources)

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
- **Override atomicity** — `withOverride()` wraps fn + audit log + override log in a single `$transaction`. Pre-checks (policy, self-approval) reject before the transaction starts.
- **Posting idempotency** — All posting operations carry a unique idempotency key to prevent double-submission.
- **Project-scope isolation** — Access denials on cross-project reads are themselves audit-logged.
- **Record-level scope binding** — `assertProjectScope()` and `assertEntityScope()` verify every fetched record belongs to the caller's scope. Mismatches throw `ScopeMismatchError` which routers map to `NOT_FOUND` (never `FORBIDDEN`) to avoid leaking record existence.
- **Status enum enforcement** — All 11 lifecycle status fields use typed Prisma enums, enforced at the database level. No arbitrary string values allowed.
- **FK integrity for master data** — categoryId and itemCatalogId fields carry `@relation` with `onDelete: Restrict`, preventing orphaned line items.

---

## Input Validation

All tRPC inputs are validated against **Zod schemas** defined in `packages/contracts`. Do not define schemas inline in routers — add them to contracts and import.

---

## Testing

- **Framework:** Vitest, 3 configs: `core`, `db`, `web`
- **Count:** ~530 tests (191 pure unit tests pass without DB, remainder are integration tests)
- **Hardening tests:** 33 structural tests in `packages/core/tests/hardening/` validate scope-binding, permission alignment, and override atomicity without a database
- **Integration tests** connect to a real Postgres instance (not mocked)
- Run `pnpm test` from the repo root via Turborepo to execute all configs in dependency order
