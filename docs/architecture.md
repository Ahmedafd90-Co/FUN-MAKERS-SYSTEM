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

## Multi-Tenancy Schema Primitives (PIC-75, 2026-05-27)

ProjectLedger is multi-tenant-by-design but currently runs as a single-tenant deployment ("Pico Play KSA"). PIC-75 lands the canonical first application of SR-Multi-Tenancy as schema-level primitives that the rest of the codebase can reference when extending multi-tenant scope to additional surfaces.

### Organization model (tenant root)

`packages/db/prisma/schema.prisma` — `Organization` is the canonical tenant root. Each tenant is one Organization row keyed by UUID `id` with a human-readable `slug` (e.g. `picoplay-ksa`). The platform currently has a hardcoded singleton:

```
id   = '00000000-0000-0000-0000-000000000001'
slug = 'picoplay-ksa'
name = 'Pico Play KSA'
```

This singleton UUID is **byte-identical** across three sources:
1. `schema.prisma` — `@default("...")` on `orgId` for 10 transactional models
2. `prisma/migrations/20260527140000_pic75_multi_tenancy_org/migration.sql` — INSERT statement
3. `src/seed/organizations.ts` — `SINGLETON_ORG_ID` constant

Changing the singleton requires updating all three in lockstep. The `seedOrganizations` function runs first in the seed chain (before countries/currencies/etc.) so all FK-dependent seeds find the singleton.

### `referenceNumber` semantic constraints — per entity class

The 10 transactional models carrying a `referenceNumber String?` field have one of two constraint shapes:

| Entity class | Compound key | Rationale |
|---|---|---|
| `Ipa`, `Ipc`, `Variation`, `CostProposal`, `Correspondence`, `Rfq`, `EngineerInstruction`, `VendorContract`, `PurchaseOrder` | `@@unique([orgId, projectId, referenceNumber])` | Project-scoped sequential reference inside a tenant. Two tenants can both have an `IPA-001` against their own `FMKSA-2026-001` project — these are distinct because the tenant scope differs. |
| `TaxInvoice` | `@@unique([orgId, referenceNumber])` (no `projectId`) | ZATCA Phase 2 compliance: invoice numbers form one sequential space per tenant, not per project. A tenant's tax authority filing draws from one stream regardless of which project the invoice belongs to. |

**Identifier types on VendorContract + PurchaseOrder** — both carry two distinct unique identifiers:
- `contractNumber` (VC) / `poNumber` (PO) — customer-facing, externally referenced (e.g. on signed contracts, supplier portals). Stays globally `@unique` even after PIC-75.
- `referenceNumber` — internal sequential, per-tenant project-scoped via compound key.

Do not conflate the two — `contractNumber` / `poNumber` is the public ID; `referenceNumber` is the internal organizational ID.

### Transitional `@default` pattern

`orgId` on the 10 models carries `@default("00000000-0000-0000-0000-000000000001")`. This lets existing single-tenant service code create rows without supplying `orgId` explicitly — Prisma populates the singleton at create time.

When multi-tenancy ships:
1. Remove the `@default(...)` from `orgId` declarations
2. Require service code to provide `orgId` from the request context (e.g. `ctx.user.orgId` or the auth session)
3. Add an explicit `data: { orgId: ctx.user.orgId, ... }` to every `prisma.*.create({ data: ... })` call site
4. (Optionally) add a Prisma client extension that asserts `orgId` matches the caller's session, parallel to PIC-35 Step 7's status-write blocker

The `@default` pattern is INTENDED to be removed — it is a deliberate transitional shortcut, not a permanent design.

### Multi-tenancy migration path (future)

Surfaces NOT yet multi-tenant-scoped but candidates for the same compound-key treatment when their multi-tenant story is written:

- `Project`, `Entity`, `User`, `Role`, `UserRole`, `ProjectAssignment`, `ScreenPermission` — Layer 1 identity + project scaffolding
- `Vendor`, `ProcurementCategory`, `ItemCatalog`, `FrameworkAgreement` — procurement master data
- `Document`, `DocumentVersion`, `DocumentSignature` — document layer
- `WorkflowTemplate`, `WorkflowInstance` — workflow engine state

Each future multi-tenant extension follows the PIC-75 pattern: introduce `orgId` with singleton `@default`, add compound uniqueness, document the entity-class semantic in this section, eventually remove the `@default`.

### β1 — Row-counts CI failure (UNRESOLVED, deferred to PIC-76)

PIC-75 Phase B investigation showed `tests/seed/idempotency.test.ts > produces
identical row counts across all seeded tables` passes locally (State B: no
pre-seed before TRUNCATE→runFullSeed→snapshot pattern) but fails in CI
(State A: cluster 2's `db:seed` step runs before tests). The schema migration
landed in this PR resolved the demo-project-integrity SUITE FAIL but did NOT
resolve row-counts.

The original "concurrent-execution pollution" hypothesis (PIC-72 catch 17)
was retracted by PIC-75 Phase A (catch 18) because `packages/db/vitest.config.ts`
already has `fileParallelism: false`.

The most likely actual mechanisms per PIC-75 Phase A surface map:
- `cleanTestData` (16 tables) vs idempotency TRUNCATE (13 tables) scope mismatch
- `demo-project-integrity.test.ts` afterAll's `.catch(() => {})` silent FK leak

Both fall in PIC-76 scope (test-isolation hygiene β-track, filing pending PD ruling).

**Catch 19 lesson:** local State B stress test (42/42 across 3 runs) does NOT
predict CI State A behavior. Always verify CI parity before claiming "resolved"
for state-dependent failures.

---

## Standing Rules

Process-class invariants — these apply to how PRs are conducted, not what runtime code does. Each rule documents its provenance + a first-application example so the rule's authority is traceable.

### SR-1 — Doc-currency discipline (PIC-63, 2026-05-20)

**When a Phase A recon overturns a claim made in a roadmap / spec / decision doc, the source doc MUST be amended within the PR that surfaces the correction.** Correction-as-PR-body or correction-as-ticket-comment is not sufficient — a future reader of the original spec will not know to look elsewhere.

**Mechanics:**
1. The PR description includes a **"Source doc amendments"** section listing every doc touched by the recon correction.
2. The amendment is a header note at the top of the corrected section in the source doc, linking to the recon source (PR / Linear ticket / Decisions doc).
3. If the source doc is owned by a different team / system / Linear scope, the amendment may instead be a stub linking to the canonical correction venue, but the stub MUST be added — silent drift is the failure mode.

**Provenance:** PIC-63 (Pre-PR-5 Sweep Session 1, 2026-05-20). Lesson surfaced by the 2026-05-20 Functional Readiness Audit Phase 4 — three specs found stale, corrections living only in PR bodies / Layer 2.5 Decisions doc, never folded back into source. The Module Spec "RFQ Management is the missing module" claim (corrected by PIC-53 Phase A recon, four weeks unflagged in the source doc) is the RED-class example.

**Why it matters:** every recon-gated PR (PIC-50/51/52/53 Phase A pattern) has surfaced findings the ticket didn't anticipate. Each correction has to live somewhere. Without this rule, corrections accumulate in PR bodies and ticket comments — invisible to anyone who reads the source spec months later. The cumulative effect is the doc-currency cluster the 2026-05-20 audit surfaced.

**First application:** PIC-62 (Module Spec correction header for the RFQ-missing-premise drift), landed in the same Pre-PR-5 Sweep PR as this standing rule.

### SR-2 — PIC-50 atomic-add convention (extended 2026-05-20 with re-seed step)

**Adding a new workflow-managed entity requires an ATOMIC 4-step contract in a single PR:**

1. Add the model to `WORKFLOW_DRIVEN_MODELS` (in `packages/db/src/middleware/no-direct-status-write.ts`)
2. Add the entry to `WORKFLOW_TEMPLATE_REGISTRY` (in `packages/contracts/src/workflow.ts`)
3. If the entity attaches documents, add to `RECORD_TYPES_FOR_DOCUMENTS` (in `packages/contracts/src/documents.ts`)
4. Seed the `{prefix}_standard` template (in `packages/db/src/seed/*-workflow-templates.ts`)

**Plus, post-merge (added by PIC-64, 2026-05-20):**

5. **Re-seed every target environment** (dev DB minimum; staging + prod per deployment pipeline). The PIC-50 parity guard catches code-level drift, but NOT per-DB seed presence. PIC-64 surfaced this gap when both `drawing_revision_standard` (PIC-52) and `rfq.materialise` (PIC-53) were absent from dev DB despite the seed files being correct — the dev DB had not been re-seeded after merge.

**Failure mode if step 5 is skipped:** the entity ships code-clean (PIC-50 guard passes), but production runtime fails silently at workflow auto-start (`resolveTemplate` returns null because the template isn't in DB) or at permission-gate check (`ctx.user.permissions.includes('rfq.materialise')` returns false because the permission isn't in DB).

**Provenance:** PIC-50 (mechanism, 2026-05-19) extended by PIC-64 (Pre-PR-5 Sweep Session 1, 2026-05-20) to include step 5.

**Structural enforcement (PIC-72 cluster 2, 2026-05-22):** CI pipeline now invokes
`pnpm -F @fmksa/db db:seed` after `prisma db push` and before `Run tests`. Seed step
exits CI on failure. SR-2 step 5 ("re-seed every target environment") is now
structurally guaranteed for CI; remains documented discipline for staging + prod
per deployment pipeline.

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
