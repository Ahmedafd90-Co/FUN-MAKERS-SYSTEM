# Module 1 — Shared Core Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared core platform for Pico Play Fun Makers KSA — auth, access-control, projects, entities, reference-data, workflow engine, document control, posting service skeleton, audit, and notifications — as a real, usable internal product that becomes the foundation for Modules 2–7.

**Architecture:** Modular monolith on Next.js 15 App Router with tRPC v11 typed APIs. Domain logic in `packages/core/`. Centralized posting service is the only mutator of financial/KPI state. Project isolation enforced at the tRPC middleware boundary. Signed records immutable via Prisma middleware. Audit and override logs append-only.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.x (strict), tRPC v11, Prisma 5, PostgreSQL 16, Auth.js v5, Tailwind CSS, shadcn/ui, Radix UI, React Hook Form, Zod, TanStack Table, Recharts, BullMQ, Redis, MinIO/S3, Pino, Vitest, Playwright, testcontainers, AWS CDK (TypeScript), pnpm + Turborepo, Docker Compose.

**Spec source of truth:** `docs/superpowers/specs/2026-04-09-module-1-shared-core-platform-design.md`

---

## Plan Metadata

| Field | Value |
|---|---|
| Module | 1 of 7 — Shared Core Platform |
| Phases | 10 (1.1 → 1.10) |
| Tasks | ~170 across all phases |
| Critical path | 1.1 → 1.2 → 1.3 → (1.4‖1.5‖1.6‖1.7) → 1.8 → 1.9 → 1.10 |
| Parallelism | Phases 1.4, 1.5, 1.6, 1.7 can run in parallel after 1.3 ships |
| Learning-mode pauses | 5 (see §11) |
| Branch strategy | One branch per phase, merged to `main` after phase exit criteria met |
| Commit cadence | Per task — every task ends with a commit |
| Test discipline | TDD for invariant-critical work; test-first for service methods; E2E added in 1.10 |

---

## How to Use This Plan

This plan is dense by design. Read it top-to-bottom once, then work phase-by-phase.

**Per-task format:**
- **Objective** — one sentence stating what this task achieves.
- **Type** — `[backend]`, `[frontend]`, `[database]`, `[infra]`, `[test]`, `[docs]`. Multiple tags allowed.
- **Files** — exact paths to create or modify.
- **Deps** — task IDs that must complete before this one starts. Empty = none.
- **Acceptance** — checklist a reviewer can verify in under 60 seconds.
- **Tests** — test files/cases this task introduces or extends.
- **Notes** — implementation hints, gotchas, code samples for the most invariant-critical tasks.

**TDD compression rule:** Mechanical CRUD/UI tasks get test signatures + implementation outlines. Invariant-critical tasks (Prisma middleware, posting service, project scope middleware, override helper, signed-document immutability) get full code blocks in TDD sequence (write failing test → run → implement → run → commit). The plan is a scaffold for execution, not a literal typing script.

**Pause discipline:** When a learning-mode pause is reached, **stop**, prepare the file with context + signature + TODO marker, and ask Ahmed to write the 5–10 lines. Do not guess.

---

## Prerequisites

### Local machine tools
| Tool | Min version | Install |
|---|---|---|
| Node.js | 20.x LTS | `brew install node@20` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| Docker Desktop | latest | from docker.com |
| Git | 2.40+ | already installed |
| AWS CLI v2 | latest | `brew install awscli` |
| AWS CDK | 2.x | `npm install -g aws-cdk@2` |
| psql client | 16.x | `brew install postgresql@16` (client only) |

### Accounts and access
- AWS account with `me-south-1` enabled (Bahrain region).
- IAM user/role for CDK bootstrap with `AdministratorAccess` (dev only) or scoped CDK deployment role.
- GitHub repository (to be created in Phase 1.1).
- SES sender domain (deferred — MailHog covers M1 local).

### Verification commands (run before Phase 1.1)
```bash
node --version          # → v20.x
pnpm --version          # → 9.x
docker --version        # → 24.x or later
docker compose version  # → v2.x
aws --version           # → 2.x
cdk --version           # → 2.x
git --version           # → 2.40+
```

---

## Repo Structure

```
fun-makers-ksa/
├── apps/
│   └── web/                              # Next.js 15 App Router (UI + tRPC API)
│       ├── app/
│       │   ├── (auth)/                   # sign-in, forgot-password (no chrome)
│       │   ├── (app)/                    # authenticated app shell
│       │   │   ├── home/
│       │   │   ├── approvals/
│       │   │   ├── projects/
│       │   │   ├── documents/
│       │   │   ├── notifications/
│       │   │   ├── profile/
│       │   │   └── admin/
│       │   │       ├── users/
│       │   │       ├── roles/
│       │   │       ├── assignments/
│       │   │       ├── entities/
│       │   │       ├── workflow-templates/
│       │   │       ├── reference-data/
│       │   │       ├── notification-templates/
│       │   │       ├── audit-log/
│       │   │       ├── override-log/
│       │   │       ├── posting-exceptions/
│       │   │       └── system-health/
│       │   ├── api/
│       │   │   ├── auth/[...nextauth]/
│       │   │   └── trpc/[trpc]/
│       │   └── layout.tsx
│       ├── components/                   # page-level components (not shared library)
│       ├── server/
│       │   ├── trpc.ts                   # base router, procedures, middleware
│       │   ├── routers/                  # one router per service
│       │   └── context.ts                # request context (session, db, services)
│       ├── lib/
│       │   ├── auth.ts                   # Auth.js config
│       │   └── trpc-client.ts            # client-side tRPC
│       └── tests/                        # Playwright E2E
├── packages/
│   ├── db/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── client.ts                 # Prisma client singleton
│   │   │   ├── middleware/               # signed-immutability, soft-delete-whitelist
│   │   │   └── seed/
│   │   │       ├── index.ts              # entry point — composes seed steps
│   │   │       ├── countries.ts
│   │   │       ├── currencies.ts
│   │   │       ├── permissions.ts        # ⚠️ LEARNING PAUSE #1
│   │   │       ├── roles.ts
│   │   │       ├── role-permissions.ts
│   │   │       ├── status-dictionaries.ts # ⚠️ LEARNING PAUSE #5
│   │   │       ├── notification-templates.ts
│   │   │       ├── workflow-templates.ts # ⚠️ LEARNING PAUSE #2
│   │   │       ├── sample-entity.ts
│   │   │       ├── sample-project.ts
│   │   │       └── master-admin.ts
│   │   └── package.json
│   ├── core/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   ├── service.ts
│   │   │   │   ├── password.ts
│   │   │   │   ├── session.ts
│   │   │   │   └── index.ts
│   │   │   ├── access-control/
│   │   │   │   ├── service.ts
│   │   │   │   ├── permissions.ts
│   │   │   │   ├── project-scope.ts
│   │   │   │   ├── screen-permissions.ts
│   │   │   │   ├── override-policy.ts    # ⚠️ LEARNING PAUSE #3
│   │   │   │   └── index.ts
│   │   │   ├── projects/
│   │   │   │   ├── service.ts
│   │   │   │   ├── settings.ts
│   │   │   │   ├── project-settings-defaults.ts # ⚠️ LEARNING PAUSE #4
│   │   │   │   ├── assignments.ts
│   │   │   │   └── index.ts
│   │   │   ├── entities/
│   │   │   │   ├── service.ts
│   │   │   │   ├── hierarchy.ts
│   │   │   │   └── index.ts
│   │   │   ├── reference-data/
│   │   │   │   ├── service.ts
│   │   │   │   └── index.ts
│   │   │   ├── workflow/
│   │   │   │   ├── service.ts
│   │   │   │   ├── templates.ts
│   │   │   │   ├── instances.ts
│   │   │   │   ├── steps.ts
│   │   │   │   ├── approver-resolution.ts
│   │   │   │   ├── events.ts             # pub/sub for later modules
│   │   │   │   └── index.ts
│   │   │   ├── documents/
│   │   │   │   ├── service.ts
│   │   │   │   ├── storage.ts            # S3/MinIO abstraction
│   │   │   │   ├── versions.ts
│   │   │   │   ├── signatures.ts
│   │   │   │   ├── categories.ts         # category enum
│   │   │   │   └── index.ts
│   │   │   ├── posting/
│   │   │   │   ├── service.ts
│   │   │   │   ├── event-registry.ts     # event-type Zod schemas
│   │   │   │   ├── exceptions.ts
│   │   │   │   ├── reversal.ts
│   │   │   │   └── index.ts
│   │   │   ├── audit/
│   │   │   │   ├── service.ts
│   │   │   │   ├── override.ts           # withOverride helper
│   │   │   │   └── index.ts
│   │   │   ├── notifications/
│   │   │   │   ├── service.ts
│   │   │   │   ├── templates.ts
│   │   │   │   ├── preferences.ts
│   │   │   │   ├── delivery.ts           # channel routing
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── tests/                        # Vitest unit + integration
│   │   └── package.json
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── auth.ts                   # Zod schemas for auth payloads
│   │   │   ├── projects.ts
│   │   │   ├── entities.ts
│   │   │   ├── workflow.ts
│   │   │   ├── documents.ts
│   │   │   ├── posting.ts
│   │   │   ├── notifications.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ui/
│   │   ├── src/
│   │   │   ├── components/               # shadcn/ui components
│   │   │   ├── primitives/               # raw Radix wrappers
│   │   │   ├── patterns/                 # composed patterns: header bar, context rail, status chip
│   │   │   ├── icons/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── config/
│   │   ├── eslint/
│   │   ├── tsconfig/
│   │   ├── tailwind/
│   │   └── package.json
│   └── jobs/
│       ├── src/
│       │   ├── workers/
│       │   │   ├── notifications.worker.ts
│       │   │   └── posting-retry.worker.ts
│       │   ├── queue.ts
│       │   └── index.ts
│       └── package.json
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   └── postgres/init.sql
│   └── cdk/
│       ├── bin/
│       │   └── app.ts
│       ├── lib/
│       │   ├── network-stack.ts
│       │   ├── database-stack.ts
│       │   ├── cache-stack.ts
│       │   ├── storage-stack.ts
│       │   ├── secrets-stack.ts
│       │   ├── compute-stack.ts          # ECS Fargate (web + worker)
│       │   └── monitoring-stack.ts
│       ├── cdk.json
│       └── package.json
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-04-09-module-1-shared-core-platform-design.md
│       └── plans/
│           └── 2026-04-09-module-1-implementation-plan.md      ← this file
├── tests/
│   └── e2e/                              # cross-app Playwright suites
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-dev.yml
├── .editorconfig
├── .gitignore
├── .nvmrc
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

---

## Environment Variables Plan

All env vars follow 12-factor. Local dev uses `.env.local` (gitignored). Each AWS environment loads from Secrets Manager + Parameter Store via the CDK compute stack.

### `apps/web` (`.env.local`)
```bash
# --- runtime ---
NODE_ENV=development
NEXT_PUBLIC_APP_NAME="Fun Makers KSA"
NEXT_PUBLIC_APP_ENV=local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- database ---
DATABASE_URL=postgresql://fmksa:fmksa@localhost:5432/fmksa_dev?schema=public
DATABASE_URL_TEST=postgresql://fmksa:fmksa@localhost:5432/fmksa_test?schema=public

# --- redis (BullMQ + sessions optional) ---
REDIS_URL=redis://localhost:6379

# --- file storage (S3-compatible) ---
STORAGE_PROVIDER=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=fmksa-dev-documents
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_FORCE_PATH_STYLE=true

# --- email ---
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
EMAIL_FROM="Fun Makers KSA <no-reply@local.dev>"

# --- auth ---
AUTH_SECRET=local-dev-secret-32-chars-minimum-xxxxxxxxxxxxx
AUTH_TRUST_HOST=true
AUTH_SESSION_MAX_AGE_SECONDS=28800   # 8h
AUTH_PASSWORD_MIN_LENGTH=12
AUTH_FAILED_LOGIN_LOCKOUT_THRESHOLD=5
AUTH_FAILED_LOGIN_LOCKOUT_MINUTES=15

# --- logging ---
LOG_LEVEL=debug
LOG_PRETTY=true

# --- feature flags (all off in M1, hooks only) ---
FEATURE_MFA_ENABLED=false
FEATURE_SSO_ENABLED=false
FEATURE_ARABIC_RTL_ENABLED=false
```

### `packages/jobs` (worker process — same `.env.local` reused)
Same DATABASE_URL, REDIS_URL, STORAGE_*, EMAIL_*, LOG_*. Adds:
```bash
WORKER_CONCURRENCY=4
WORKER_NAME=fmksa-worker-local
```

### AWS env (per environment, loaded from Secrets Manager + Parameter Store)
| Key | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Secrets Manager | RDS endpoint, auto-rotated credentials |
| `REDIS_URL` | Parameter Store | ElastiCache endpoint |
| `STORAGE_BUCKET` | Parameter Store | per-env bucket name |
| `STORAGE_REGION` | Parameter Store | `me-south-1` |
| `STORAGE_PROVIDER` | Parameter Store | `s3` |
| `EMAIL_PROVIDER` | Parameter Store | `ses` |
| `EMAIL_SES_REGION` | Parameter Store | `me-south-1` or fallback |
| `EMAIL_FROM` | Parameter Store | per-env verified sender |
| `AUTH_SECRET` | Secrets Manager | rotated quarterly |
| `LOG_LEVEL` | Parameter Store | `info` (dev/qa), `warn` (staging/prod) |
| `LOG_PRETTY` | Parameter Store | `false` |
| `NEXT_PUBLIC_APP_ENV` | build-time | baked into image: `dev`/`qa`/`staging`/`prod` |

CDK loads these at task definition time so the container starts with the right env block. Never hard-code secrets in the repo.

---

## Local Dev Startup Plan

**One-command startup** (after Phase 1.1 ships):
```bash
# 1. Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Install dependencies
pnpm install

# 3. Push schema and seed
pnpm db:migrate
pnpm db:seed

# 4. Run dev (web + worker concurrently)
pnpm dev
```

**Component breakdown of `docker-compose.yml`** (Phase 1.1 deliverable):
| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | Primary DB |
| `redis` | `redis:7-alpine` | 6379 | BullMQ + cache |
| `minio` | `minio/minio:latest` | 9000 (API), 9001 (console) | S3-compatible file storage |
| `mailhog` | `mailhog/mailhog:latest` | 1025 (SMTP), 8025 (UI) | Email capture for testing |

**`pnpm dev` script** (Turborepo task in `turbo.json`):
- Starts `apps/web` Next.js dev server on `:3000`
- Starts `packages/jobs` worker process
- Both reload on file changes

**Verification after startup:**
```bash
curl http://localhost:3000           # → Next.js home
open http://localhost:9001            # MinIO console (minioadmin/minioadmin)
open http://localhost:8025            # MailHog UI
psql $DATABASE_URL -c '\dt'           # → list of all M1 tables
```

---

## AWS Dev Deployment Plan (Module 1 thin slice)

**Goal for M1:** the dev CDK stack synthesizes cleanly and a dry-run deploy succeeds. Actual deployment to AWS is optional in M1 — we ship the capability, not necessarily the running environment.

### One-time bootstrap (per AWS account)
```bash
# 1. Configure AWS CLI for me-south-1
aws configure --profile fmksa-dev
# Enter: access key, secret, region=me-south-1

# 2. Bootstrap CDK in me-south-1
cdk bootstrap aws://<account-id>/me-south-1 --profile fmksa-dev
```

### CDK stack composition (Phase 1.1 + 1.10 deliverable)

| Stack | Resources | Dependencies |
|---|---|---|
| `NetworkStack` | VPC (2 AZ), public + private subnets, NAT gateway, security groups | none |
| `SecretsStack` | Secrets Manager entries for DB password, AUTH_SECRET; Parameter Store for non-secret config | none |
| `DatabaseStack` | RDS Postgres 16 (single-AZ dev), subnet group, parameter group, backup config | NetworkStack, SecretsStack |
| `CacheStack` | ElastiCache Redis (single-node dev), subnet group | NetworkStack |
| `StorageStack` | S3 bucket (versioning on, SSE-S3), bucket policy, lifecycle rules | none |
| `ComputeStack` | ECS cluster, ECR repos, Fargate task defs (web + worker), ALB, target groups, autoscaling | all above |
| `MonitoringStack` | CloudWatch log groups, alarms, SNS topic for ops email | ComputeStack |

### Deploy commands (M1 validation only — synth + dry-run)
```bash
cd infra/cdk
pnpm install
pnpm cdk synth          # generate CloudFormation, no AWS calls
pnpm cdk diff           # show what would change vs deployed (none, since first run)
# To actually deploy (deferred):
# pnpm cdk deploy --all --profile fmksa-dev
```

### CI/CD pipeline (Phase 1.1 skeleton, Phase 1.10 fully wired)
| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR + push to `main` | install → lint → typecheck → unit/integration tests → build |
| `deploy-dev.yml` | manual dispatch (M1) | build image → push to ECR → `cdk deploy --all` |

### Cost guard (M1 deliverable in `MonitoringStack`)
- Budget alarm at $50/day for the dev environment.
- SNS topic publishing to `ahmedafd90@gmail.com` on breach.
- This is non-negotiable for keeping dev costs sane during M1 build.

---

## Migration Order

Migrations are managed by Prisma Migrate. Phase 1.2 produces **one initial migration** containing all M1 tables. Subsequent modules add their own migrations on top.

**Migration sequence inside the initial migration** (Prisma applies in declaration order, but FK references must resolve at create time):

1. **Reference and lookup tables** (no FK dependencies):
   - `countries`
   - `currencies`
   - `app_settings`
   - `status_dictionaries`
2. **Identity tables**:
   - `departments`
   - `users`
   - `user_sessions`
   - `roles`
   - `permissions`
   - `role_permissions`
   - `user_roles`
3. **Multi-entity**:
   - `entities` (self-FK on `parent_entity_id`)
4. **Projects and scoping**:
   - `projects` (FK → entities, currencies)
   - `project_assignments` (FK → projects, users, roles)
   - `project_settings` (FK → projects)
5. **Screen permissions**:
   - `screen_permissions` (FK → roles, projects)
6. **Workflow engine**:
   - `workflow_templates`
   - `workflow_steps` (FK → workflow_templates)
   - `workflow_instances` (FK → workflow_templates, projects)
   - `workflow_actions` (FK → workflow_instances, workflow_steps, users)
7. **Documents**:
   - `documents` (FK → projects)
   - `document_versions` (FK → documents, users)
   - `document_signatures` (FK → document_versions, users)
   - Then back-fill `documents.current_version_id` FK
8. **Posting**:
   - `posting_events` (FK → projects, entities; self-FK on `reversed_by_event_id`)
   - `posting_exceptions` (FK → posting_events, users)
9. **Audit**:
   - `audit_logs` (FK → users, projects — both nullable)
   - `override_logs` (FK → audit_logs, users)
10. **Notifications**:
    - `notification_templates`
    - `notifications` (FK → users)
    - `notification_preferences` (FK → users)

**Index creation** is part of the same migration (Prisma generates the SQL).

**Subsequent module migrations** (out of M1 scope but reserved):
- M2 adds `ipas`, `ipcs`, `vos`, `tax_invoices`, `correspondence`, `claims`, `back_charges`, plus posting event types.
- M3 adds `rfqs`, `vendor_quotes`, `supplier_invoices`, etc.
- M4 adds `budget_lines`, `cost_codes`, `commitments`, `actuals`, `accruals`, `reallocations`, `transfers`, `receivables`, `payables`, `cashflow_periods`.

---

## Seed Strategy

**Composable seed steps.** `packages/db/src/seed/index.ts` is the orchestrator. Each step is idempotent (`upsert` by stable code), runnable individually for tests.

**Seed order (deterministic):**
1. `countries.ts` — ISO 3166 list (full ~250 rows from a static JSON dataset)
2. `currencies.ts` — ISO 4217 list (full ~180 rows from static JSON)
3. `app_settings.ts` — default platform settings (e.g., `default_currency=SAR`, `date_format=DD/MM/YYYY`, `timezone=Asia/Riyadh`)
4. `status_dictionaries.ts` — **⚠️ LEARNING PAUSE #5** — material/shop-drawing/fabrication/testing/notice/claim status sets
5. `permissions.ts` — **⚠️ LEARNING PAUSE #1** — full permission code list with descriptions
6. `roles.ts` — 14 business roles from project memory `project_fmksa_roles.md`
7. `role-permissions.ts` — assignment of permissions to roles (driven by Pause #1 input)
8. `notification-templates.ts` — workflow-step-assigned, workflow-approved, workflow-rejected, document-signed, posting-exception, user-invited
9. `sample-entity.ts` — one parent entity ("Pico Play KSA") + one operating subsidiary ("Fun Makers KSA Ops")
10. `sample-project.ts` — one project ("FMKSA-DEMO-001") attached to the operating subsidiary
11. `master-admin.ts` — one Master Admin user (`ahmedafd90@gmail.com`) with the Master Admin role and an assignment to the sample project
12. `workflow-templates.ts` — **⚠️ LEARNING PAUSE #2** — one representative "Document Approval" template

**Idempotency rule:** every seed step uses `prisma.<model>.upsert({ where: { code }, create: ..., update: ... })`. Re-running `pnpm db:seed` is safe.

**Test seed strategy:**
- Integration tests use **testcontainers** to spin up a fresh Postgres per test file.
- A `tests/setup/seed-test-db.ts` helper runs the migration + a minimal seed (countries, currencies, permissions, roles, role-permissions, master admin, sample project).
- Each test starts in a transaction that rolls back at end. No mutual contamination.

---

## Learning-Mode Pause Points

Five pauses where Ahmed writes 5–10 lines of business code. Each is prepared with full context, types, comments, and a `// TODO(ahmed):` marker before the pause is announced.

| # | Phase | File | Decision | Why it matters |
|---|---|---|---|---|
| **1** | 1.2 | `packages/db/src/seed/permissions.ts` | Permission code list — what each of the 14 roles can view, edit, approve, override | Drives RBAC for all 7 modules; wrong permissions here cascade into every screen |
| **2** | 1.5 | `packages/db/src/seed/workflow-templates.ts` | One "Document Approval" template — step sequence and approver rules | Becomes the reference template every module will copy and adapt |
| **3** | 1.3 | `packages/core/src/access-control/override-policy.ts` | Override policy — what requires reason, what triggers escalation, what's never overridable | Defines the boundary between flexibility and audit safety |
| **4** | 1.4 | `packages/core/src/projects/project-settings-defaults.ts` | Default `project_settings` for a new project | Later modules read these defaults; wrong defaults mean every project needs manual fix |
| **5** | 1.2 | `packages/db/src/seed/status-dictionaries.ts` | Status sets for material/shop-drawing/fabrication/testing/notice/claim | M3+ trackers display these statuses everywhere; wrong vocabulary now means refactor later |

**Pause protocol:**
1. The implementing agent (or me, in execution) prepares the file with imports, type definitions, comments, and a clear TODO block.
2. The agent stops, asks Ahmed to fill in the marked section.
3. Ahmed writes 5–10 lines.
4. The agent validates (typecheck + dry seed) and commits with `feat(seed): apply Ahmed's permission codes` (or similar).
5. Continue to the next task.

---

## Critical Path & Parallelism

```
            ┌─────┐
            │ 1.1 │ Scaffold
            └──┬──┘
               │
            ┌──▼──┐
            │ 1.2 │ Data layer + seed
            └──┬──┘
               │
            ┌──▼──┐
            │ 1.3 │ Auth + access-control
            └──┬──┘
               │
   ┌───────────┼───────────┬───────────┐
   │           │           │           │
┌──▼──┐    ┌──▼──┐    ┌──▼──┐    ┌──▼──┐
│ 1.4 │    │ 1.5 │    │ 1.6 │    │ 1.7 │
│Proj │    │ WF  │    │Docs │    │Post │
└──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘
   │          │          │          │
   └──────────┴────┬─────┴──────────┘
                   │
                ┌──▼──┐
                │ 1.8 │ Notifications (depends on workflow events from 1.5)
                └──┬──┘
                   │
                ┌──▼──┐
                │ 1.9 │ Home + cmd palette + nav polish
                └──┬──┘
                   │
                ┌──▼──┐
                │1.10 │ Tests + docs + sign-off
                └─────┘
```

**Critical path (sequential):** 1.1 → 1.2 → 1.3 → 1.5 → 1.8 → 1.9 → 1.10 (1.5 is on the critical path because 1.8 needs workflow events).

**Parallelizable after 1.3:** 1.4, 1.5, 1.6, 1.7 can run on separate branches. 1.5 stays on the critical path; 1.4/1.6/1.7 can complete in any order before merging.

**Parallelism limits:** if a single engineer/agent is executing, parallelism doesn't reduce calendar time but does reduce merge conflict risk by isolating concerns. If multiple agents are dispatched (subagent-driven), 1.4/1.5/1.6/1.7 can truly run concurrently after 1.3 merges.

---

## Risks & Blockers Summary

| Phase | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1.1 | pnpm/Turborepo version drift across machines | Low | Low | `.nvmrc` + `packageManager` field in root `package.json` |
| 1.2 | Initial migration too large to review | Medium | Medium | Split schema into logical files, generate one migration; document in plan |
| 1.2 | Learning Pause #1 (permissions) blocks downstream work | High | High | Surface pause early; agent prepares scaffold with sensible defaults Ahmed can amend |
| 1.3 | Auth.js v5 + tRPC v11 integration friction | Medium | Medium | Reference Auth.js docs + test thoroughly; isolate auth in own module |
| 1.3 | Project scope middleware leaks (cross-project bleed) | Medium | High | Permission deny test suite mandatory before merge |
| 1.5 | Workflow engine over-abstracted | Medium | High | Spec mandates "practical, not framework-heavy"; keep JSON simple, avoid DSL |
| 1.5 | Approver resolution edge cases (missing user, role rotation) | Medium | Medium | Default-deny with clear error; cover in tests |
| 1.6 | S3/MinIO abstraction leaks AWS specifics into domain | Medium | Medium | Strict interface in `documents/storage.ts`; only adapter knows AWS SDK |
| 1.6 | Signed-immutability middleware bypass | Low | High | Test with raw Prisma; cover update + delete paths |
| 1.7 | Posting service idempotency edge cases (retry storms) | Medium | High | Idempotency key UNIQUE constraint + Zod payload validation |
| 1.8 | BullMQ Redis connection flakiness | Low | Medium | Connection retry config; document recovery |
| 1.9 | Design polish drags out indefinitely | Medium | Low | Time-box; ship "good enough" with clear TODOs |
| 1.10 | E2E suite slow / flaky | Medium | Medium | Run E2E on CI in isolation; use testcontainers for DB; deterministic seed |
| 1.10 | CDK stack synth fails in CI runner | Medium | Medium | Test synth locally first; commit `cdk.context.json` |

---

## Phase 1.1 — Scaffold

**Goal:** A working monorepo skeleton — `pnpm dev` boots Next.js, the database container is up, CI runs lint+typecheck on a trivial commit.

**Dependencies:** none.
**Critical path:** YES.
**Parallelizable:** tasks 1.1.10–1.1.16 can run in parallel after 1.1.9 lands.
**Learning pauses:** none.
**Risks:** version drift (mitigated by `.nvmrc` + `packageManager` field), Docker Desktop not running locally, AWS profile not configured (CDK skeleton only — no deploy required).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.1.1 | Initialize root monorepo (`package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore`, `.editorconfig`, `README.md`) | infra | — | no |
| 1.1.2 | Add Turborepo (`turbo.json`) | infra | 1.1.1 | no |
| 1.1.3 | Create `packages/config` with shared TS, ESLint, Prettier, Tailwind presets | infra | 1.1.2 | no |
| 1.1.4 | Scaffold `apps/web` Next.js 15 App Router app with TypeScript strict | frontend | 1.1.3 | no |
| 1.1.5 | Install Tailwind + shadcn/ui in `apps/web` | frontend | 1.1.4 | no |
| 1.1.6 | Create `packages/db` with Prisma init | database | 1.1.3 | with 1.1.4 |
| 1.1.7 | Create `packages/core` skeleton with empty service folders | backend | 1.1.3 | with 1.1.4 |
| 1.1.8 | Create `packages/contracts` skeleton | backend | 1.1.3 | with 1.1.4 |
| 1.1.9 | Create `packages/ui` skeleton | frontend | 1.1.3 | with 1.1.4 |
| 1.1.10 | Create `packages/jobs` BullMQ worker stub | backend | 1.1.3 | yes |
| 1.1.11 | Author `infra/docker/docker-compose.yml` (Postgres, Redis, MinIO, MailHog) | infra | — | yes |
| 1.1.12 | GitHub Actions CI skeleton (`ci.yml`) — install, lint, typecheck | infra | 1.1.1 | yes |
| 1.1.13 | AWS CDK skeleton (`infra/cdk/`) with empty stacks | infra | — | yes |
| 1.1.14 | Wire `pnpm dev` Turborepo task that runs web + worker concurrently | infra | 1.1.4, 1.1.10 | no |
| 1.1.15 | Hello-world page in `apps/web` proves boot | frontend | 1.1.14 | no |
| 1.1.16 | Verification: `docker compose up`, `pnpm dev`, browser loads | test | 1.1.15 | no |

### Task 1.1.1 — Initialize root monorepo `[infra]`

**Objective:** Lay down the root files that define the workspace.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore` (extend the existing one — already committed)
- Create: `.editorconfig`
- Modify: `README.md`

**Deps:** none

**Acceptance:**
- [ ] `package.json` declares `"private": true`, `"packageManager": "pnpm@9.x.x"`, and a `"scripts"` block with `"dev"`, `"build"`, `"lint"`, `"test"`, `"db:migrate"`, `"db:seed"`.
- [ ] `pnpm-workspace.yaml` lists `apps/*`, `packages/*`, `infra/cdk`.
- [ ] `.nvmrc` contains `20`.
- [ ] `.editorconfig` enforces LF line endings, 2-space indent for JS/TS, trim trailing whitespace.
- [ ] `pnpm install` succeeds with no errors (no packages yet, but workspace lockfile is created).

**Tests:** none yet.

**Notes:** This is the only task in Phase 1.1 with no dependencies. Everything else builds on it. Use `"packageManager"` field so engineers don't get surprises from older pnpm versions.

### Task 1.1.2 — Add Turborepo `[infra]`

**Objective:** Add Turborepo for caching and orchestrating package tasks.

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (add `turbo` to devDependencies)

**Deps:** 1.1.1

**Acceptance:**
- [ ] `turbo.json` declares pipeline tasks: `build`, `dev` (with `cache: false, persistent: true`), `lint`, `typecheck`, `test`.
- [ ] `dev` depends on no upstream tasks (so it starts immediately).
- [ ] `build` depends on `^build` (upstream packages build first).
- [ ] Running `pnpm exec turbo run lint` succeeds (no-op since nothing to lint yet).

**Tests:** none.

**Notes:** Use Turborepo v2.x. Pipeline names should match the scripts in each package's `package.json` so Turborepo can discover them.

### Task 1.1.3 — Create `packages/config` `[infra]`

**Objective:** Centralize TS, ESLint, Prettier, Tailwind config so every package and app inherits the same rules.

**Files:**
- Create: `packages/config/package.json` (private, name: `@fmksa/config`)
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/nextjs.json`
- Create: `packages/config/tsconfig/node.json`
- Create: `packages/config/tsconfig/react.json`
- Create: `packages/config/eslint/base.cjs`
- Create: `packages/config/eslint/nextjs.cjs`
- Create: `packages/config/eslint/node.cjs`
- Create: `packages/config/prettier/index.cjs`
- Create: `packages/config/tailwind/preset.cjs`

**Deps:** 1.1.2

**Acceptance:**
- [ ] `packages/config` has `"main"` exports for each preset.
- [ ] `tsconfig/base.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `skipLibCheck: true`.
- [ ] `eslint/base.cjs` extends `eslint:recommended`, `@typescript-eslint/recommended`, includes the `import` plugin, and bans `console.log` (warn).
- [ ] `prettier/index.cjs` enforces 100-char width, single quotes, trailing commas, semicolons.
- [ ] `tailwind/preset.cjs` defines the neutral palette + accent color tokens from the spec, status chip colors, and the Inter font stack.

**Tests:** none.

**Notes:** Strict mode is non-negotiable per spec. `noUncheckedIndexedAccess` catches a class of bugs that cause production incidents — keep it on.

### Task 1.1.4 — Scaffold `apps/web` `[frontend]`

**Objective:** Create the Next.js 15 application that hosts the entire UI and tRPC API.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json` (extends `@fmksa/config/tsconfig/nextjs.json`)
- Create: `apps/web/.eslintrc.cjs` (extends `@fmksa/config/eslint/nextjs.cjs`)
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx` (placeholder)
- Create: `apps/web/app/globals.css`

**Deps:** 1.1.3

**Acceptance:**
- [ ] `apps/web/package.json` has Next.js 15, React 19, TypeScript 5.x as dependencies.
- [ ] Scripts: `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "next lint"`, `"typecheck": "tsc --noEmit"`.
- [ ] `pnpm --filter @fmksa/web typecheck` succeeds.
- [ ] `pnpm --filter @fmksa/web build` succeeds with the placeholder page.

**Tests:** none yet.

**Notes:** Use App Router only — no Pages Router. Enable `experimental.serverActions` if not already on by default in 15.x.

### Task 1.1.5 — Tailwind + shadcn/ui in `apps/web` `[frontend]`

**Objective:** Wire Tailwind CSS and initialize shadcn/ui so components can be generated.

**Files:**
- Create: `apps/web/tailwind.config.ts` (extends `@fmksa/config/tailwind/preset.cjs`)
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/components.json` (shadcn/ui config)
- Modify: `apps/web/app/globals.css` (add Tailwind directives)

**Deps:** 1.1.4

**Acceptance:**
- [ ] `pnpm --filter @fmksa/web exec shadcn@latest add button` adds a Button component to `apps/web/components/ui/button.tsx` (or to `packages/ui` once that exists — see 1.1.9).
- [ ] Placeholder page renders a styled button after restarting `pnpm dev`.
- [ ] No console warnings about missing Tailwind classes.

**Tests:** none yet.

**Notes:** Configure shadcn/ui to output to `packages/ui` (the shared package) — see 1.1.9 — so components are reusable across apps. Until 1.1.9 is done, the temporary `apps/web/components/ui/` location is fine.

### Task 1.1.6 — `packages/db` Prisma init `[database]`

**Objective:** Initialize the Prisma package with an empty schema and the client export.

**Files:**
- Create: `packages/db/package.json` (name: `@fmksa/db`)
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`

**Deps:** 1.1.3

**Acceptance:**
- [ ] `schema.prisma` has the postgres provider, `previewFeatures = ["driverAdapters"]` (optional), and an empty model placeholder so the file is valid.
- [ ] `src/client.ts` exports a singleton `PrismaClient` (one instance per process, with `globalThis` cache for hot-reload safety).
- [ ] `pnpm --filter @fmksa/db exec prisma generate` succeeds.
- [ ] `pnpm --filter @fmksa/db typecheck` succeeds.

**Tests:** none yet.

**Notes:** Singleton pattern is critical for Next.js dev mode — without `globalThis` caching, every hot-reload spawns a new Prisma client and exhausts the connection pool.

```typescript
// packages/db/src/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Task 1.1.7 — `packages/core` skeleton `[backend]`

**Objective:** Create the core domain package with empty folders matching the 10 services.

**Files:**
- Create: `packages/core/package.json` (name: `@fmksa/core`)
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/{auth,access-control,projects,entities,reference-data,workflow,documents,posting,audit,notifications}/index.ts` (one `index.ts` per service exporting an empty placeholder)

**Deps:** 1.1.3

**Acceptance:**
- [ ] All 10 service folders exist with an `index.ts` exporting at least an empty named object (`export const auth = {};` etc.).
- [ ] `packages/core/src/index.ts` re-exports each service.
- [ ] `pnpm --filter @fmksa/core typecheck` succeeds.

**Tests:** none yet.

**Notes:** This is intentional empty scaffolding so later phases have stable import paths from day 1.

### Task 1.1.8 — `packages/contracts` skeleton `[backend]`

**Objective:** Create the shared types/Zod schemas package consumed by both `apps/web` and `packages/core`.

**Files:**
- Create: `packages/contracts/package.json` (name: `@fmksa/contracts`)
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`

**Deps:** 1.1.3

**Acceptance:**
- [ ] `zod` is a dependency.
- [ ] `src/index.ts` exports a placeholder.
- [ ] Typecheck passes.

**Tests:** none.

### Task 1.1.9 — `packages/ui` skeleton `[frontend]`

**Objective:** Create the shared component library and reconfigure shadcn/ui to output here.

**Files:**
- Create: `packages/ui/package.json` (name: `@fmksa/ui`)
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Modify: `apps/web/components.json` to point shadcn/ui at `packages/ui/src/components`
- Move: any temp components from 1.1.5 into `packages/ui/src/components/`

**Deps:** 1.1.5

**Acceptance:**
- [ ] `pnpm --filter @fmksa/web exec shadcn@latest add card` puts the new component in `packages/ui/src/components/card.tsx`.
- [ ] `apps/web` imports it via `@fmksa/ui` and renders successfully.

**Tests:** none yet.

### Task 1.1.10 — `packages/jobs` BullMQ worker stub `[backend]`

**Objective:** Create the worker process package — BullMQ + queue config + a single placeholder worker.

**Files:**
- Create: `packages/jobs/package.json` (name: `@fmksa/jobs`)
- Create: `packages/jobs/tsconfig.json`
- Create: `packages/jobs/src/queue.ts`
- Create: `packages/jobs/src/workers/placeholder.worker.ts`
- Create: `packages/jobs/src/index.ts`

**Deps:** 1.1.3

**Acceptance:**
- [ ] `bullmq` and `ioredis` are dependencies.
- [ ] `queue.ts` exports a function `getQueue(name: string): Queue` that connects to `REDIS_URL`.
- [ ] `workers/placeholder.worker.ts` defines a worker on queue `placeholder` that logs the job and returns `{ ok: true }`.
- [ ] `src/index.ts` starts all workers and handles graceful shutdown on `SIGTERM`/`SIGINT`.
- [ ] `pnpm --filter @fmksa/jobs build` succeeds.

**Tests:** none yet.

**Notes:** Use a `Worker` per queue, not a router. Connection sharing is via a single `IORedis` instance with `maxRetriesPerRequest: null` (BullMQ requirement).

### Task 1.1.11 — Docker Compose `[infra]`

**Objective:** Stand up Postgres + Redis + MinIO + MailHog locally with one command.

**Files:**
- Create: `infra/docker/docker-compose.yml`
- Create: `infra/docker/postgres/init.sql` (creates `fmksa` user + `fmksa_dev` and `fmksa_test` databases)
- Create: `infra/docker/.env.example`

**Deps:** none

**Acceptance:**
- [ ] `docker compose -f infra/docker/docker-compose.yml up -d` starts all 4 services.
- [ ] `psql postgresql://fmksa:fmksa@localhost:5432/fmksa_dev -c '\l'` lists `fmksa_dev` and `fmksa_test`.
- [ ] `curl http://localhost:9000/minio/health/live` returns 200.
- [ ] `curl http://localhost:8025` returns the MailHog UI HTML.
- [ ] All containers have restart policies (`unless-stopped`) and named volumes.

**Tests:** none.

**Notes:** Use named volumes (`fmksa-postgres-data`, `fmksa-minio-data`) so data persists across container restarts. Pin image tags (`postgres:16-alpine`, `redis:7-alpine`, `minio/minio:RELEASE.2024-XX-XX`).

### Task 1.1.12 — GitHub Actions CI skeleton `[infra]`

**Objective:** A CI pipeline that runs lint, typecheck, and test on every PR.

**Files:**
- Create: `.github/workflows/ci.yml`

**Deps:** 1.1.1

**Acceptance:**
- [ ] Workflow triggers on `pull_request` and `push` to `main`.
- [ ] Jobs: `setup` (checkout + pnpm install) → `lint` → `typecheck` → `test` → `build`.
- [ ] Uses `pnpm/action-setup@v3` and `actions/setup-node@v4` with Node 20.
- [ ] Caches `~/.local/share/pnpm/store`.
- [ ] All jobs pass on a no-op commit.

**Tests:** the CI run itself is the test.

**Notes:** Don't add deploy job here — that's `deploy-dev.yml` in Phase 1.10.

### Task 1.1.13 — AWS CDK skeleton `[infra]`

**Objective:** An empty CDK app with all 7 stacks declared but not yet populated.

**Files:**
- Create: `infra/cdk/package.json`
- Create: `infra/cdk/tsconfig.json`
- Create: `infra/cdk/cdk.json`
- Create: `infra/cdk/bin/app.ts`
- Create: `infra/cdk/lib/{network,secrets,database,cache,storage,compute,monitoring}-stack.ts` (each exports an empty `Stack` subclass)

**Deps:** none

**Acceptance:**
- [ ] `aws-cdk-lib` and `constructs` are dependencies.
- [ ] `bin/app.ts` instantiates the 7 stacks for environment `dev` only (M1 scope).
- [ ] `pnpm --filter @fmksa/cdk exec cdk synth` succeeds and produces a `cdk.out/` directory with CloudFormation JSON.
- [ ] No AWS credentials needed for synth (only for deploy).

**Tests:** the synth itself is the test.

**Notes:** Use named environments via `cdk.json` context: `dev`, `qa`, `staging`, `prod`. Only `dev` is wired in M1.

### Task 1.1.14 — `pnpm dev` Turborepo task `[infra]`

**Objective:** One command boots both `apps/web` and `packages/jobs` with hot reload.

**Files:**
- Modify: `package.json` (root) — add `"dev": "turbo run dev"`
- Modify: `apps/web/package.json` — add `"dev": "next dev"`
- Modify: `packages/jobs/package.json` — add `"dev": "tsx watch src/index.ts"`
- Modify: `turbo.json` — set `dev` to `cache: false, persistent: true`

**Deps:** 1.1.4, 1.1.10

**Acceptance:**
- [ ] `pnpm dev` starts both services in parallel with interleaved output.
- [ ] `Ctrl+C` cleanly stops both.

**Tests:** none.

**Notes:** `tsx watch` is the simplest way to run TypeScript in dev with hot reload. For production builds, use `tsup` or `tsc` (added in Phase 1.10).

### Task 1.1.15 — Hello-world page `[frontend]`

**Objective:** Prove the whole stack boots.

**Files:**
- Modify: `apps/web/app/page.tsx`

**Deps:** 1.1.14

**Acceptance:**
- [ ] Page renders "Pico Play Fun Makers KSA — boot OK" with a Tailwind-styled card.
- [ ] No console errors.
- [ ] Lighthouse accessibility score ≥ 95 (trivial page should easily hit this).

**Tests:** none.

### Task 1.1.16 — Verification: end-to-end boot `[test]`

**Objective:** Document and prove the local dev startup works.

**Files:**
- Modify: `README.md` — add "Quick start" section with the exact commands

**Deps:** 1.1.15

**Acceptance:**
- [ ] Following the README on a fresh clone (or after `git clean -fdx`) gets you to a running app in under 5 minutes.
- [ ] Commit all of Phase 1.1 with message: `feat(scaffold): Module 1 Phase 1.1 — monorepo, Next.js, Prisma, Docker, CDK skeleton`.

**Tests:** manual smoke test.

**Phase 1.1 exit criteria:**
- [ ] All 16 tasks acceptance-checked.
- [ ] CI green on `main` after Phase 1.1 merge.
- [ ] `pnpm dev` boots end-to-end.
- [ ] `cdk synth` succeeds for the dev environment.
- [ ] Repo structure matches the layout in this plan.

---

## Phase 1.2 — Data Layer

**Goal:** A complete Prisma schema for all M1 tables, one initial migration, idempotent seed data, and the two Prisma middleware that enforce signed-document immutability and the soft-delete whitelist.

**Dependencies:** Phase 1.1.
**Critical path:** YES.
**Parallelizable:** schema authoring (1.2.1–1.2.9) is sequential because they share `schema.prisma`. Seed scripts (1.2.11–1.2.17) can be parallelized after the migration runs.
**Learning pauses:** **Pause #1** (permissions, in 1.2.13) and **Pause #5** (status dictionaries, in 1.2.16).
**Risks:** schema gets too large to review in one PR; learning pauses block the build; FK ordering bugs (mitigated by Prisma's automatic dependency resolution).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.2.1 | Schema: identity & access (users, sessions, roles, permissions, role_permissions, user_roles, departments) | database | 1.1.6 | no |
| 1.2.2 | Schema: screen permissions (with project override support) | database | 1.2.1 | no |
| 1.2.3 | Schema: entities (self-referencing parent/child) | database | 1.2.1 | no |
| 1.2.4 | Schema: projects, project_assignments, project_settings | database | 1.2.3 | no |
| 1.2.5 | Schema: workflow templates, steps, instances, actions | database | 1.2.4 | no |
| 1.2.6 | Schema: documents, document_versions, document_signatures | database | 1.2.4 | no |
| 1.2.7 | Schema: posting_events, posting_exceptions | database | 1.2.4 | no |
| 1.2.8 | Schema: audit_logs, override_logs | database | 1.2.4 | no |
| 1.2.9 | Schema: notification_templates, notifications, notification_preferences | database | 1.2.1 | no |
| 1.2.10 | Schema: reference (countries, currencies, app_settings, status_dictionaries) | database | 1.1.6 | no |
| 1.2.11 | Initial migration: `pnpm db:migrate dev --name init_module_1` | database | 1.2.1–1.2.10 | no |
| 1.2.12 | Seed orchestrator + countries + currencies + app_settings | database | 1.2.11 | no |
| 1.2.13 | Seed: permissions ⚠️ **LEARNING PAUSE #1** | database | 1.2.12 | no |
| 1.2.14 | Seed: roles + role_permissions | database | 1.2.13 | no |
| 1.2.15 | Seed: notification templates | database | 1.2.11 | with 1.2.16 |
| 1.2.16 | Seed: status dictionaries ⚠️ **LEARNING PAUSE #5** | database | 1.2.11 | with 1.2.15 |
| 1.2.17 | Seed: sample entity, sample project, Master Admin user, demo assignment | database | 1.2.14 | no |
| 1.2.18 | Prisma middleware: signed-version immutability | backend | 1.2.6, 1.2.11 | no |
| 1.2.19 | Prisma middleware: soft-delete whitelist (whitelist enforces append-only on audit, posting, workflow_actions, document_signatures) | backend | 1.2.11 | with 1.2.18 |
| 1.2.20 | Integration test: seed runs idempotently | test | 1.2.17 | yes |
| 1.2.21 | Integration test: signed-version middleware blocks updates | test | 1.2.18 | yes |
| 1.2.22 | Integration test: soft-delete whitelist enforced | test | 1.2.19 | yes |

### Task 1.2.1 — Schema: identity & access `[database]`

**Objective:** Define the core identity tables in `schema.prisma`.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Deps:** 1.1.6

**Acceptance:**
- [ ] Models exist for: `User`, `UserSession`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Department`.
- [ ] All use `String @id @default(uuid())` for primary keys.
- [ ] `User.email` is unique. `Role.code` is unique. `Permission.code` is unique.
- [ ] `UserRole` has `effectiveFrom DateTime`, `effectiveTo DateTime?`, `assignedBy String`, `assignedAt DateTime`.
- [ ] `UserSession.tokenHash` is unique. Index on `(userId, expiresAt)`.
- [ ] `User` has `failedLoginCount Int @default(0)` and `lockedUntil DateTime?`.
- [ ] `pnpm --filter @fmksa/db exec prisma format` rewrites cleanly.
- [ ] `pnpm --filter @fmksa/db exec prisma validate` passes.

**Tests:** validation only — formal tests come after migration in 1.2.20.

**Notes:** Use `@map` to convert camelCase Prisma fields to snake_case columns (`@map("token_hash")`). Use `@@map` to rename tables (`@@map("user_sessions")`).

### Task 1.2.2 — Schema: screen permissions `[database]`

**Objective:** Define `ScreenPermission` with optional `projectId` for project-level overrides.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.1

**Acceptance:**
- [ ] `ScreenPermission` model with: `id`, `roleId`, `screenCode`, `canView`, `canEdit`, `canApprove`, `projectId String?`, `createdAt`.
- [ ] Composite unique constraint on `(roleId, screenCode, projectId)` to prevent duplicate rows. Note that `projectId` being nullable means SQL UNIQUE will allow multiple null rows for the same `(roleId, screenCode)` — we accept this and enforce uniqueness at service layer for the role-default case.
- [ ] FK to `Role`. FK to `Project` (added after Task 1.2.4 lands; can use forward reference).

**Tests:** validation only.

**Notes:** Document the SQL nullable-unique caveat explicitly in a comment in the schema. Service layer enforces "max one role-default row per `(roleId, screenCode)`".

### Task 1.2.3 — Schema: entities `[database]`

**Objective:** Define the self-referencing entity hierarchy.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.1

**Acceptance:**
- [ ] `Entity` model with: `id`, `code @unique`, `name`, `type EntityType`, `parentEntityId String?`, `status`, `metadataJson Json?`, `createdAt`, `updatedAt`.
- [ ] Self-relation: `parent Entity? @relation("EntityParent", fields: [parentEntityId], references: [id])` and `children Entity[] @relation("EntityParent")`.
- [ ] Enum `EntityType { parent subsidiary sister_company branch operating_unit shared_service_entity }`.

**Tests:** validation only.

### Task 1.2.4 — Schema: projects, assignments, settings `[database]`

**Objective:** Project and project-scoping tables.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.3

**Acceptance:**
- [ ] `Project` model with: `id`, `code @unique`, `name`, `entityId`, `status`, `currencyCode`, `startDate`, `endDate DateTime?`, `createdBy`, `createdAt`, `updatedAt`.
- [ ] `ProjectAssignment` model with: `id`, `projectId`, `userId`, `roleId`, `effectiveFrom`, `effectiveTo DateTime?`, `assignedBy`, `assignedAt`, `revokedAt DateTime?`, `revokedBy String?`, `reason String?`.
- [ ] `ProjectSetting` model with composite PK `(projectId, key)`, `valueJson`, `updatedAt`, `updatedBy`.
- [ ] FK from `Project.entityId → Entity.id`, `Project.currencyCode → Currency.code`.
- [ ] FK from `ProjectAssignment.projectId → Project.id`, `userId → User.id`, `roleId → Role.id`.
- [ ] Indexes: `ProjectAssignment(projectId, userId, effectiveFrom, effectiveTo)`, `Project(entityId)`.

**Tests:** validation only.

### Task 1.2.5 — Schema: workflow tables `[database]`

**Objective:** Generic workflow engine tables.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.4

**Acceptance:**
- [ ] `WorkflowTemplate`: `id`, `code @unique`, `name`, `recordType`, `version`, `isActive`, `configJson Json`, `createdBy`, `createdAt`.
- [ ] `WorkflowStep`: `id`, `templateId`, `orderIndex`, `name`, `approverRuleJson Json`, `slaHours`, `isOptional`, `requirementFlagsJson Json`.
- [ ] `WorkflowInstance`: `id`, `templateId`, `recordType`, `recordId`, `projectId`, `status`, `currentStepId String?`, `startedBy`, `startedAt`, `completedAt DateTime?`.
- [ ] `WorkflowAction`: `id`, `instanceId`, `stepId`, `actorUserId`, `action`, `comment String?`, `actedAt`, `metadataJson Json?`. **Append-only — no `updatedAt`.**
- [ ] Indexes: `WorkflowInstance(projectId, status)`, `WorkflowInstance(currentStepId)`, `WorkflowAction(instanceId, actedAt)`.

**Tests:** validation only.

### Task 1.2.6 — Schema: documents `[database]`

**Objective:** Document, version, and signature tables.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.4

**Acceptance:**
- [ ] `Document`: `id`, `projectId`, `recordType String?`, `recordId String?`, `title`, `category DocumentCategory`, `status`, `currentVersionId String?`, `createdBy`, `createdAt`, `updatedAt`.
- [ ] `DocumentVersion`: `id`, `documentId`, `versionNo Int`, `fileKey`, `fileHash`, `fileSize Int`, `mimeType`, `uploadedBy`, `uploadedAt`, `isSigned Boolean @default(false)`, `signedAt DateTime?`, `signedBy String?`, `supersededAt DateTime?`, `supersededByVersionId String?`. Composite unique `(documentId, versionNo)`.
- [ ] `DocumentSignature`: `id`, `versionId`, `signerUserId`, `signatureType`, `signedAt`, `ip`, `userAgent`, `hashAtSign`. **Append-only.**
- [ ] Enum `DocumentCategory { shop_drawing material_submittal test_certificate contract_attachment vendor_document letter drawing specification general }`.
- [ ] Index: `Document(projectId, category)`.

**Tests:** validation only.

**Notes:** `Document.currentVersionId` is a forward FK — declare with `@relation("CurrentVersion")` and resolve after both models exist. Prisma handles this automatically.

### Task 1.2.7 — Schema: posting `[database]`

**Objective:** Posting events and exception queue.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.4

**Acceptance:**
- [ ] `PostingEvent`: `id`, `eventType`, `sourceService`, `sourceRecordType`, `sourceRecordId`, `projectId`, `entityId String?`, `idempotencyKey String @unique`, `payloadJson Json`, `status PostingStatus`, `postedAt DateTime?`, `reversedByEventId String?`, `failureReason String?`, `createdAt`. Self-relation for reversal.
- [ ] `PostingException`: `id`, `eventId`, `reason`, `assignedTo String?`, `resolvedAt DateTime?`, `resolvedBy String?`, `resolutionNote String?`, `createdAt`.
- [ ] Enum `PostingStatus { pending posted reversed failed }`.
- [ ] Index: `PostingEvent(projectId, eventType, status)`, `PostingEvent(idempotencyKey)`.

**Tests:** validation only.

### Task 1.2.8 — Schema: audit + override `[database]`

**Objective:** Append-only audit log and the override-log materialized view.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.4

**Acceptance:**
- [ ] `AuditLog`: `id`, `actorUserId String?`, `actorSource AuditActorSource`, `action`, `resourceType`, `resourceId`, `projectId String?`, `beforeJson Json`, `afterJson Json`, `reason String?`, `ip String?`, `userAgent String?`, `createdAt`. **No `updatedAt`. No soft-delete.**
- [ ] `OverrideLog`: `id`, `auditLogId`, `overrideType`, `overriderUserId`, `reason`, `beforeJson Json`, `afterJson Json`, `approvedBy String?`, `createdAt`.
- [ ] Enum `AuditActorSource { user system agent job }`.
- [ ] Indexes: `AuditLog(resourceType, resourceId, createdAt)`, `AuditLog(projectId, createdAt)`.

**Tests:** validation only.

### Task 1.2.9 — Schema: notifications `[database]`

**Objective:** Notification templates, instances, and per-user preferences.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.2.1

**Acceptance:**
- [ ] `NotificationTemplate`: `id`, `code @unique`, `channel NotificationChannel`, `subjectTemplate`, `bodyTemplate`, `defaultEnabled`, `createdAt`, `updatedAt`.
- [ ] `Notification`: `id`, `userId`, `templateCode`, `payloadJson Json`, `channel`, `status NotificationStatus`, `sentAt DateTime?`, `readAt DateTime?`, `createdAt`.
- [ ] `NotificationPreference`: composite PK `(userId, templateCode, channel)`, `enabled Boolean`.
- [ ] Enums: `NotificationChannel { in_app email }`, `NotificationStatus { pending sent failed read }`.
- [ ] Index: `Notification(userId, status, createdAt)`.

**Tests:** validation only.

### Task 1.2.10 — Schema: reference data `[database]`

**Objective:** Static lookup tables and the configurable status dictionaries.

**Files:** Modify `packages/db/prisma/schema.prisma`

**Deps:** 1.1.6

**Acceptance:**
- [ ] `Country`: `code String @id` (ISO 3166-1 alpha-2), `name`, `iso3`, `phonePrefix`.
- [ ] `Currency`: `code String @id` (ISO 4217), `name`, `symbol`, `decimalPlaces Int`.
- [ ] `AppSetting`: `key String @id`, `valueJson Json`, `updatedAt`, `updatedBy`.
- [ ] `StatusDictionary`: `id`, `dictionaryCode`, `statusCode`, `label`, `orderIndex Int`, `colorHint String?`, `isTerminal Boolean`. Composite unique `(dictionaryCode, statusCode)`.

**Tests:** validation only.

### Task 1.2.11 — Initial migration `[database]`

**Objective:** Generate the first migration containing every M1 table.

**Files:** Create `packages/db/prisma/migrations/<timestamp>_init_module_1/migration.sql`

**Deps:** 1.2.1–1.2.10

**Acceptance:**
- [ ] `pnpm --filter @fmksa/db exec prisma migrate dev --name init_module_1` succeeds against the local Postgres container.
- [ ] Migration file is committed.
- [ ] `\dt` in psql shows all M1 tables.
- [ ] `prisma migrate status` reports "Database schema is up to date!"

**Tests:** the migration application is the test.

### Task 1.2.12 — Seed orchestrator + reference data `[database]`

**Objective:** Set up the seed orchestrator and seed countries, currencies, and app settings.

**Files:**
- Create: `packages/db/src/seed/index.ts`
- Create: `packages/db/src/seed/countries.ts` (uses a static JSON dataset bundled with the package — `data/iso-3166.json`)
- Create: `packages/db/src/seed/currencies.ts` (uses `data/iso-4217.json`)
- Create: `packages/db/src/seed/app-settings.ts`
- Create: `packages/db/data/iso-3166.json` and `packages/db/data/iso-4217.json` (committed)
- Modify: `packages/db/package.json` — add `"db:seed": "tsx src/seed/index.ts"`
- Modify: root `package.json` — add `"db:seed": "pnpm --filter @fmksa/db db:seed"`

**Deps:** 1.2.11

**Acceptance:**
- [ ] `pnpm db:seed` populates `countries`, `currencies`, `app_settings`.
- [ ] Re-running `pnpm db:seed` is a no-op (idempotent via `upsert`).
- [ ] `app_settings` contains: `default_currency=SAR`, `date_format=DD/MM/YYYY`, `timezone=Asia/Riyadh`, `default_language=en`, `platform_name=Pico Play Fun Makers KSA`.

**Tests:** integration test in 1.2.20.

### Task 1.2.13 — Seed: permissions ⚠️ **LEARNING PAUSE #1** `[database]`

**Objective:** Define the permission code list. **Ahmed writes the meaningful content here.**

**Files:**
- Create: `packages/db/src/seed/permissions.ts`

**Deps:** 1.2.12

**Pause protocol:**
1. The implementing agent prepares the file with imports, the `Permission` type from Prisma, an array structure with `code`, `description`, `resource`, `action` fields, and one fully-worked example for clarity.
2. The agent adds a `// TODO(ahmed): fill the permission list` block with comments explaining what each role should be able to do.
3. The agent stops and asks Ahmed to fill the array with the permission codes for the 14 roles.
4. After Ahmed writes the list, the agent runs `pnpm --filter @fmksa/db typecheck` and `pnpm db:seed` to validate.
5. Commit: `feat(seed): apply Ahmed's permission codes`.

**Prepared scaffold (what the agent puts in the file before pausing):**

```typescript
// packages/db/src/seed/permissions.ts
import type { PrismaClient } from '@prisma/client';

/**
 * Permission codes for Pico Play Fun Makers KSA.
 *
 * Format: <resource>.<action>
 * Resources: project, document, workflow, posting, audit, user, role, entity,
 *            reference_data, notification, system, override
 * Actions:   view, edit, approve, sign, override, admin
 *
 * Roles (see project_fmksa_roles.md):
 *   1. Master Admin            — full access; only role with `*.override`
 *   2. Project Director        — approves cross-project transfers, signs commercial records
 *   3. Project Manager         — operates assigned projects, same-project reallocation only
 *   4. Site Team               — raises material requests, uploads site docs
 *   5. Design                  — uploads/reviews shop drawings and technical items
 *   6. QA/QC                   — reviews/approves quality items
 *   7. Contracts Manager       — controls commercial workflows
 *   8. QS / Commercial         — drafts and operates commercial records
 *   9. Procurement             — controls procurement workflows
 *  10. Finance                 — validates payment aspects
 *  11. Cost Controller         — operates cost data, no approval rights
 *  12. Document Controller     — manages document library and version control
 *  13. PMO                     — read-only KPI rollups, no operational edit
 *  14. Executive Approver      — high-authority approvals as configured
 *
 * TODO(ahmed): fill the PERMISSIONS array below. 5–10 lines is fine for M1
 * — list the high-level permission codes you want to exist. Detailed
 * role-permission mapping happens in role-permissions.ts (next task).
 */
export const PERMISSIONS: Array<{
  code: string;
  description: string;
  resource: string;
  action: string;
}> = [
  // Example to copy:
  { code: 'project.view', description: 'View project workspace and metadata', resource: 'project', action: 'view' },
  // TODO(ahmed): add the rest of the permissions you want for M1.
  // Suggested minimum set for M1 (you can edit, expand, or replace):
  //   project.edit, project.admin
  //   document.view, document.upload, document.sign, document.supersede
  //   workflow.start, workflow.approve, workflow.reject, workflow.return, workflow.override
  //   posting.view, posting.retry, posting.resolve_exception
  //   audit.view, audit.export
  //   user.view, user.edit, user.admin
  //   role.view, role.edit
  //   entity.view, entity.edit
  //   reference_data.view, reference_data.edit
  //   notification.view
  //   system.health, system.admin
  //   override.* (Master Admin only — gives the right to use withOverride())
];

export async function seedPermissions(prisma: PrismaClient) {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { description: p.description, resource: p.resource, action: p.action },
    });
  }
}
```

**Acceptance:**
- [ ] File is committed with Ahmed's filled-in permission list.
- [ ] `pnpm db:seed` populates the `permissions` table.
- [ ] Permission count matches what Ahmed declared.

**Tests:** verified in 1.2.20.

### Task 1.2.14 — Seed: roles + role_permissions `[database]`

**Objective:** Insert the 14 roles and link permissions to roles. The role list is locked (see `project_fmksa_roles.md`); the role-permission mapping is straightforward once Ahmed's permission codes from Pause #1 exist.

**Files:**
- Create: `packages/db/src/seed/roles.ts`
- Create: `packages/db/src/seed/role-permissions.ts`

**Deps:** 1.2.13

**Acceptance:**
- [ ] `roles.ts` upserts the 14 roles with stable codes (`master_admin`, `project_director`, `project_manager`, `site_team`, `design`, `qa_qc`, `contracts_manager`, `qs_commercial`, `procurement`, `finance`, `cost_controller`, `document_controller`, `pmo`, `executive_approver`). `is_system = true`.
- [ ] `role-permissions.ts` defines a mapping object keyed by role code with the permission codes from Pause #1 grouped by role intent (Master Admin gets all; PMO gets only `*.view` codes; etc.).
- [ ] If Ahmed's permission list is incomplete to populate a role, the agent stops and asks for clarification rather than guessing.
- [ ] `pnpm db:seed` populates `roles`, `role_permissions`.

**Tests:** verified in 1.2.20.

**Notes:** The role-permission mapping should be conservative — when in doubt, deny rather than grant. Cross-check against the spec's role authority rules.

### Task 1.2.15 — Seed: notification templates `[database]`

**Objective:** Insert the M1 notification template set.

**Files:**
- Create: `packages/db/src/seed/notification-templates.ts`

**Deps:** 1.2.11

**Acceptance:**
- [ ] Templates inserted: `workflow_step_assigned`, `workflow_approved`, `workflow_rejected`, `document_signed`, `posting_exception`, `user_invited`. Each has a subject template and body template (Handlebars-style placeholders like `{{projectName}}`, `{{actorName}}`).
- [ ] `pnpm db:seed` populates `notification_templates`.

**Tests:** verified in 1.2.20.

### Task 1.2.16 — Seed: status dictionaries ⚠️ **LEARNING PAUSE #5** `[database]`

**Objective:** Insert the configurable status sets that later modules will display. **Ahmed writes the canonical status vocabularies.**

**Files:**
- Create: `packages/db/src/seed/status-dictionaries.ts`

**Deps:** 1.2.11

**Pause protocol:**
1. Agent prepares the file with the dictionary structure and one fully-worked example (`material_request_review`).
2. Agent adds TODOs for the other dictionaries listed in the spec.
3. Agent stops, asks Ahmed to fill the dictionaries.
4. Validate + commit.

**Prepared scaffold:**

```typescript
// packages/db/src/seed/status-dictionaries.ts
import type { PrismaClient } from '@prisma/client';

type StatusDictEntry = {
  dictionaryCode: string;
  statusCode: string;
  label: string;
  orderIndex: number;
  colorHint: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'darkgreen';
  isTerminal: boolean;
};

/**
 * Configurable status dictionaries for Pico Play Fun Makers KSA.
 *
 * These power the status chips and filters on M3+ trackers (materials,
 * shop drawings, fabrication, testing, notices, claims). Defining them
 * now means later modules read from one source of truth instead of
 * hardcoding strings.
 *
 * TODO(ahmed): fill in the dictionaries below. The example shows the
 * structure. Add as many statuses as you need per dictionary; you can
 * always edit later via the admin reference-data screen.
 */
export const STATUS_DICTIONARIES: StatusDictEntry[] = [
  // === Example: material request review (already filled) ===
  { dictionaryCode: 'material_request_review', statusCode: 'draft',                   label: 'Draft',                  orderIndex: 10, colorHint: 'gray',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'submitted_by_site',       label: 'Submitted by Site',      orderIndex: 20, colorHint: 'blue',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_pm_review',         label: 'Under PM Review',        orderIndex: 30, colorHint: 'blue',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_procurement_review',label: 'Under Procurement',      orderIndex: 40, colorHint: 'blue',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_design_review',     label: 'Under Design',           orderIndex: 50, colorHint: 'blue',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'under_qaqc_review',       label: 'Under QA/QC',            orderIndex: 60, colorHint: 'blue',  isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'returned_for_correction', label: 'Returned for Correction',orderIndex: 70, colorHint: 'amber', isTerminal: false },
  { dictionaryCode: 'material_request_review', statusCode: 'rejected',                label: 'Rejected',               orderIndex: 80, colorHint: 'red',   isTerminal: true  },
  { dictionaryCode: 'material_request_review', statusCode: 'approved',                label: 'Approved',               orderIndex: 90, colorHint: 'green', isTerminal: true  },
  { dictionaryCode: 'material_request_review', statusCode: 'approved_with_comments',  label: 'Approved with Comments', orderIndex: 95, colorHint: 'green', isTerminal: true  },

  // TODO(ahmed): shop_drawing
  // TODO(ahmed): fabrication
  // TODO(ahmed): delivery
  // TODO(ahmed): testing_certification
  // TODO(ahmed): notice
  // TODO(ahmed): claim
];

export async function seedStatusDictionaries(prisma: PrismaClient) {
  for (const s of STATUS_DICTIONARIES) {
    await prisma.statusDictionary.upsert({
      where: {
        dictionaryCode_statusCode: { dictionaryCode: s.dictionaryCode, statusCode: s.statusCode },
      },
      create: s,
      update: s,
    });
  }
}
```

**Acceptance:**
- [ ] Ahmed has filled in the remaining dictionaries (or explicitly deferred them with a comment).
- [ ] `pnpm db:seed` populates `status_dictionaries`.
- [ ] Each dictionary has a `terminal` status to anchor "complete" / "rejected" states.

**Tests:** verified in 1.2.20.

### Task 1.2.17 — Seed: sample entity, project, Master Admin `[database]`

**Objective:** Insert one entity, one project, one Master Admin user, and an assignment so the dev environment is immediately usable after `pnpm db:seed`.

**Files:**
- Create: `packages/db/src/seed/sample-entity.ts`
- Create: `packages/db/src/seed/sample-project.ts`
- Create: `packages/db/src/seed/master-admin.ts`

**Deps:** 1.2.14

**Acceptance:**
- [ ] One parent entity `PICOPLAY-KSA` ("Pico Play KSA") and one operating subsidiary `FMKSA-OPS` ("Fun Makers KSA Operations") with `parentEntityId` referencing the parent.
- [ ] One project `FMKSA-DEMO-001` linked to `FMKSA-OPS`, currency `SAR`.
- [ ] One Master Admin user `ahmedafd90@gmail.com` with a bcrypt-hashed password (read from env var `SEED_MASTER_ADMIN_PASSWORD` or default `ChangeMe!Demo2026` with a console warning).
- [ ] One `UserRole` record linking the user to `master_admin` role with `effectiveFrom = now()` and `effectiveTo = null`.
- [ ] One `ProjectAssignment` linking the user to `FMKSA-DEMO-001` with the `master_admin` role.
- [ ] Idempotent: re-seeding does not duplicate.

**Tests:** verified in 1.2.20.

**Notes:** The seed password is **never** committed in plaintext. The default falls back only when the env var is missing, with a loud console warning telling the operator to change it before any non-local environment.

### Task 1.2.18 — Prisma middleware: signed-version immutability `[backend]`

**Objective:** Block any UPDATE on a `DocumentVersion` row where `is_signed = true`. Block DELETE on signed versions outright. **TDD this one — it's an invariant.**

**Files:**
- Create: `packages/db/src/middleware/signed-immutability.ts`
- Create: `packages/db/tests/middleware/signed-immutability.test.ts`
- Modify: `packages/db/src/client.ts` — register the middleware

**Deps:** 1.2.6, 1.2.11

**TDD sequence:**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/tests/middleware/signed-immutability.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/client';
import { setupTestDb } from '../setup/test-db';

describe('signed-version immutability middleware', () => {
  beforeEach(async () => { await setupTestDb(); });

  it('rejects UPDATE on a signed document version', async () => {
    const version = await prisma.documentVersion.create({
      data: {
        documentId: 'doc-1',
        versionNo: 1,
        fileKey: 'k',
        fileHash: 'h',
        fileSize: 1,
        mimeType: 'application/pdf',
        uploadedBy: 'u-1',
        uploadedAt: new Date(),
        isSigned: true,
        signedAt: new Date(),
        signedBy: 'u-1',
      },
    });
    await expect(
      prisma.documentVersion.update({
        where: { id: version.id },
        data: { fileKey: 'new-key' },
      }),
    ).rejects.toThrow(/signed document version/i);
  });

  it('allows UPDATE on an unsigned document version', async () => { /* mirror */ });
  it('allows setting `supersededAt` on a signed version', async () => { /* exception path */ });
  it('rejects DELETE on a signed document version', async () => { /* mirror */ });
});
```

- [ ] **Step 2: Run test — expect FAIL** (`pnpm --filter @fmksa/db test signed-immutability`)

- [ ] **Step 3: Implement the middleware**

```typescript
// packages/db/src/middleware/signed-immutability.ts
import type { Prisma } from '@prisma/client';

const ALLOWED_FIELDS_ON_SIGNED = new Set(['supersededAt', 'supersededByVersionId']);

export const signedImmutabilityExtension = {
  name: 'signed-immutability',
  query: {
    documentVersion: {
      async update({ args, query }: { args: Prisma.DocumentVersionUpdateArgs; query: Function }) {
        // Fetch current state to know if signed
        const current = await (this as any).findUnique({ where: args.where });
        if (current?.isSigned) {
          const updateKeys = Object.keys((args.data ?? {}) as Record<string, unknown>);
          const violating = updateKeys.filter((k) => !ALLOWED_FIELDS_ON_SIGNED.has(k));
          if (violating.length > 0) {
            throw new Error(
              `Cannot modify signed document version (id=${current.id}). ` +
              `Disallowed fields: ${violating.join(', ')}. ` +
              `Only supersession (supersededAt, supersededByVersionId) is allowed.`,
            );
          }
        }
        return query(args);
      },
      async delete({ args, query }: { args: Prisma.DocumentVersionDeleteArgs; query: Function }) {
        const current = await (this as any).findUnique({ where: args.where });
        if (current?.isSigned) {
          throw new Error(`Cannot delete signed document version (id=${current.id}).`);
        }
        return query(args);
      },
    },
  },
} satisfies Prisma.Extension;
```

- [ ] **Step 4: Register the extension** in `packages/db/src/client.ts`:

```typescript
import { signedImmutabilityExtension } from './middleware/signed-immutability';
// ...
export const prisma = (globalForPrisma.prisma ?? new PrismaClient()).$extends(signedImmutabilityExtension);
```

- [ ] **Step 5: Run test — expect PASS**
- [ ] **Step 6: Commit**

```bash
git add packages/db/src/middleware packages/db/src/client.ts packages/db/tests/middleware
git commit -m "feat(db): enforce signed-version immutability via Prisma extension"
```

**Acceptance:**
- [ ] All four test cases pass.
- [ ] Trying to update `fileKey` on a signed version throws.
- [ ] Trying to set `supersededAt` on a signed version succeeds.
- [ ] Trying to delete a signed version throws.

### Task 1.2.19 — Prisma middleware: soft-delete whitelist `[backend]`

**Objective:** Reject any `delete` call on tables that must be append-only: `auditLog`, `overrideLog`, `postingEvent`, `workflowAction`, `documentSignature`. Also reject `deleteMany` on these tables. TDD.

**Files:**
- Create: `packages/db/src/middleware/no-delete-on-immutable.ts`
- Create: `packages/db/tests/middleware/no-delete-on-immutable.test.ts`
- Modify: `packages/db/src/client.ts`

**Deps:** 1.2.11

**TDD sequence:**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/tests/middleware/no-delete-on-immutable.test.ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/client';
import { setupTestDb } from '../setup/test-db';

describe('immutable-table delete rejection', () => {
  it('rejects delete on auditLog', async () => {
    await setupTestDb();
    const log = await prisma.auditLog.create({
      data: {
        actorSource: 'system',
        action: 'test',
        resourceType: 'test',
        resourceId: 't-1',
        beforeJson: {},
        afterJson: {},
      },
    });
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(
      /immutable table/i,
    );
  });

  it.each(['postingEvent', 'workflowAction', 'documentSignature', 'overrideLog'])(
    'rejects delete on %s', async (table) => { /* parameterized */ },
  );

  it('rejects deleteMany on auditLog', async () => { /* mirror */ });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// packages/db/src/middleware/no-delete-on-immutable.ts
import type { Prisma } from '@prisma/client';

const IMMUTABLE_MODELS = new Set([
  'AuditLog',
  'OverrideLog',
  'PostingEvent',
  'WorkflowAction',
  'DocumentSignature',
]);

export const noDeleteOnImmutableExtension = {
  name: 'no-delete-on-immutable',
  query: {
    $allModels: {
      async delete({ model, args, query }: any) {
        if (IMMUTABLE_MODELS.has(model)) {
          throw new Error(`Cannot delete row from immutable table: ${model}`);
        }
        return query(args);
      },
      async deleteMany({ model, args, query }: any) {
        if (IMMUTABLE_MODELS.has(model)) {
          throw new Error(`Cannot deleteMany from immutable table: ${model}`);
        }
        return query(args);
      },
    },
  },
} satisfies Prisma.Extension;
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Commit**

**Acceptance:**
- [ ] All immutable tables reject `delete` and `deleteMany`.
- [ ] Non-immutable tables (e.g., `User`) still allow delete.
- [ ] Tests pass.

### Task 1.2.20 — Integration test: seed runs idempotently `[test]`

**Objective:** Run the full seed twice in a row and assert no errors and no duplicates.

**Files:**
- Create: `packages/db/tests/seed/idempotency.test.ts`

**Deps:** 1.2.17

**Acceptance:**
- [ ] Test creates a fresh test DB, runs the seed, asserts row counts, runs the seed again, asserts identical row counts.
- [ ] Asserts that `master_admin` user has 1 active project assignment after both runs (not 2).

### Task 1.2.21 — Integration test: signed-version immutability E2E `[test]`

**Objective:** Test the middleware end-to-end through Prisma's normal API with realistic data.

**Files:** Create `packages/db/tests/middleware/signed-immutability.e2e.test.ts`

**Deps:** 1.2.18

**Acceptance:**
- [ ] Seeds a project, document, and version. Signs it. Asserts update fails. Asserts supersession succeeds.

### Task 1.2.22 — Integration test: no-delete-on-immutable E2E `[test]`

**Files:** Create `packages/db/tests/middleware/no-delete-on-immutable.e2e.test.ts`

**Deps:** 1.2.19

**Acceptance:**
- [ ] All immutable tables tested under realistic data shapes.

**Phase 1.2 exit criteria:**
- [ ] All schema files committed; `prisma validate` clean.
- [ ] Initial migration applies cleanly to a fresh DB.
- [ ] Seed populates dev DB with reference data, permissions (Pause #1 done), roles, role-permissions, status dictionaries (Pause #5 done), notification templates, sample entity, sample project, Master Admin.
- [ ] Re-running seed is a no-op.
- [ ] Both Prisma middleware tests green.
- [ ] CI green on the phase branch.

---

## Phase 1.3 — Auth + Access Control

**Goal:** A user can sign in, get a session, see only their assigned projects, and trigger a permission-denied error when accessing anything else. The `projectScope` tRPC middleware is the gatekeeper for the entire platform.

**Dependencies:** Phase 1.2.
**Critical path:** YES.
**Parallelizable:** auth (1.3.1–1.3.5) and access-control (1.3.6–1.3.11) can run in parallel after 1.2 lands. UI tasks (1.3.13–1.3.16) depend on both.
**Learning pauses:** **Pause #3** (override policy, in 1.3.11).
**Risks:** Auth.js v5 + tRPC v11 integration is the highest-friction part of this phase; project scope leak is the highest-impact risk.

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.3.1 | Install Auth.js v5 + configure credentials provider | backend | 1.2 | no |
| 1.3.2 | `auth` service: password hash + verify (bcrypt) | backend | 1.3.1 | with 1.3.6 |
| 1.3.3 | `auth` service: session creation, revocation, rotation | backend | 1.3.1 | with 1.3.6 |
| 1.3.4 | tRPC base router + context with session | backend | 1.3.3 | no |
| 1.3.5 | `auth` tRPC procedures: signIn, signOut, me | backend | 1.3.4 | no |
| 1.3.6 | `access-control` service: role + permission resolution | backend | 1.2 | with 1.3.2 |
| 1.3.7 | `access-control` service: project assignment lookup (effective-dated) | backend | 1.3.6 | no |
| 1.3.8 | `access-control` service: screen permission resolution (with project overrides) | backend | 1.3.6 | with 1.3.7 |
| 1.3.9 | `access-control` service: cross-project read check | backend | 1.3.7 | no |
| 1.3.10 | `access-control` service: requirePermission helper | backend | 1.3.6 | no |
| 1.3.11 | `access-control` service: override policy ⚠️ **LEARNING PAUSE #3** | backend | 1.3.10 | no |
| 1.3.12 | `projectScope` tRPC middleware | backend | 1.3.5, 1.3.7, 1.3.10 | no |
| 1.3.13 | Sign-in screen UI | frontend | 1.3.5 | with 1.3.14, 1.3.15 |
| 1.3.14 | Forgot-password stub screen UI | frontend | 1.3.5 | with 1.3.13, 1.3.15 |
| 1.3.15 | User profile screen UI | frontend | 1.3.5 | with 1.3.13, 1.3.14 |
| 1.3.16 | Auth layout + protected route wrapper | frontend | 1.3.5 | no |
| 1.3.17 | Permission deny test suite scaffold | test | 1.3.12 | yes |
| 1.3.18 | E2E test: sign in + see assigned projects | test | 1.3.13, 1.3.16 | yes |
| 1.3.19 | E2E test: cross-project access denied | test | 1.3.12, 1.3.16 | yes |

### Task 1.3.1 — Install Auth.js v5 + credentials provider `[backend]`

**Objective:** Wire Auth.js v5 with email/password credentials and a custom Prisma adapter.

**Files:**
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Modify: `apps/web/package.json` — add `next-auth@^5`, `@auth/prisma-adapter`, `bcryptjs`, `@types/bcryptjs`

**Deps:** Phase 1.2

**Acceptance:**
- [ ] `lib/auth.ts` exports `auth`, `signIn`, `signOut`, `handlers` from `NextAuth(...)`.
- [ ] Configured with `Credentials` provider that calls into `@fmksa/core/auth`.
- [ ] JWT strategy is **not** used — sessions go to the `user_sessions` Prisma table via the adapter.
- [ ] `AUTH_SECRET` is read from env, fails fast if absent in production.
- [ ] Login redirects to `/home` on success, stays on `/sign-in?error=...` on failure.

**Tests:** integration test in 1.3.18.

**Notes:** Auth.js v5 has breaking changes from v4 — read the migration guide. Use the new config-export-default pattern.

### Task 1.3.2 — `auth` service: password hashing `[backend]`

**Objective:** Pure functions for password hash + verify, used by Auth.js callbacks.

**Files:**
- Create: `packages/core/src/auth/password.ts`
- Create: `packages/core/tests/auth/password.test.ts`

**Deps:** 1.3.1

**TDD:**

- [ ] **Test:**

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('CorrectHorse9!Battery');
    expect(await verifyPassword('CorrectHorse9!Battery', hash)).toBe(true);
  });
  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('CorrectHorse9!Battery');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
  it('produces different hashes for the same password (salt)', async () => {
    const a = await hashPassword('x');
    const b = await hashPassword('x');
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Implementation:**

```typescript
// packages/core/src/auth/password.ts
import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

**Acceptance:**
- [ ] Tests pass.
- [ ] Round count is 12 (production-appropriate).

### Task 1.3.3 — `auth` service: sessions `[backend]`

**Objective:** Session creation, revocation, rotation, lockout-on-failed-login.

**Files:**
- Create: `packages/core/src/auth/session.ts`
- Create: `packages/core/src/auth/service.ts`
- Create: `packages/core/tests/auth/session.test.ts`

**Deps:** 1.3.1, 1.3.2

**Acceptance:**
- [ ] `signIn(email, password, ip, userAgent)` → returns `{ user, session }` or throws typed error (`InvalidCredentials`, `AccountLocked`).
- [ ] On failed login, increments `failedLoginCount`. After 5 failures, sets `lockedUntil = now + 15min`.
- [ ] Successful login resets `failedLoginCount` and updates `lastLoginAt`.
- [ ] Sessions stored in `user_sessions` with `tokenHash` (the cookie value is hashed before storage — never store the raw token).
- [ ] `signOut(sessionToken)` revokes by setting `revokedAt`.
- [ ] `getSession(token)` returns null for revoked or expired sessions.
- [ ] `rotateSession(oldToken, ip, userAgent)` revokes the old and issues a new one (used after password change).
- [ ] Tests cover all paths.

**Notes:** Hash session tokens with SHA-256 before DB storage, not bcrypt — bcrypt is too slow for per-request lookups. The cookie carries the raw token; the DB only sees the hash.

### Task 1.3.4 — tRPC base router + context `[backend]`

**Objective:** Set up tRPC v11 with a request context that resolves the current user/session from the cookie.

**Files:**
- Create: `apps/web/server/trpc.ts`
- Create: `apps/web/server/context.ts`
- Create: `apps/web/server/routers/_app.ts`
- Create: `apps/web/app/api/trpc/[trpc]/route.ts`
- Create: `apps/web/lib/trpc-client.ts`

**Deps:** 1.3.3

**Acceptance:**
- [ ] `context.ts` exports `createContext(req)` that resolves session via `auth/session.ts` and exposes `{ db, session, user, services }`.
- [ ] `trpc.ts` exports: `router`, `publicProcedure`, `protectedProcedure` (rejects if no session), `projectProcedure` (placeholder for now — implemented in 1.3.12).
- [ ] `routers/_app.ts` is the root `appRouter` that merges all sub-routers (empty in 1.3.4, populated in later phases).
- [ ] tRPC HTTP handler mounted at `/api/trpc/[trpc]`.
- [ ] Client-side tRPC hooks set up via `@trpc/react-query`.

**Tests:** none yet — covered in 1.3.18 E2E.

### Task 1.3.5 — `auth` tRPC procedures `[backend]`

**Objective:** Expose `auth.signIn`, `auth.signOut`, `auth.me` over tRPC.

**Files:**
- Create: `apps/web/server/routers/auth.ts`
- Create: `packages/contracts/src/auth.ts` (Zod schemas)
- Modify: `apps/web/server/routers/_app.ts`

**Deps:** 1.3.4

**Acceptance:**
- [ ] `auth.signIn` is a `publicProcedure.input(SignInInputSchema).mutation(...)` that calls `coreAuth.signIn` and sets the session cookie.
- [ ] `auth.signOut` is a `protectedProcedure.mutation(...)` that revokes the current session and clears the cookie.
- [ ] `auth.me` is a `protectedProcedure.query(...)` that returns the current user with role list.
- [ ] All three procedures have integration tests in `apps/web/server/routers/auth.test.ts` against a real DB via testcontainers.

### Task 1.3.6 — `access-control` service: role + permission resolution `[backend]`

**Objective:** Given a user, return the effective role list and permission code set at the current moment.

**Files:**
- Create: `packages/core/src/access-control/service.ts`
- Create: `packages/core/src/access-control/permissions.ts`
- Create: `packages/core/tests/access-control/permissions.test.ts`

**Deps:** Phase 1.2

**Acceptance:**
- [ ] `getEffectiveRoles(userId, at = now)` returns roles where `effectiveFrom <= at AND (effectiveTo IS NULL OR effectiveTo > at)`.
- [ ] `getPermissionCodes(userId, at = now)` returns the union of permission codes from all effective roles.
- [ ] `hasPermission(userId, permissionCode, at = now)` returns boolean.
- [ ] Tests cover: future-dated role (denied), expired role (denied), revoked role (denied), multiple roles union, Master Admin shortcut.

### Task 1.3.7 — `access-control` service: project assignment lookup `[backend]`

**Objective:** Check whether a user has an active assignment to a project.

**Files:**
- Create: `packages/core/src/access-control/project-scope.ts`
- Create: `packages/core/tests/access-control/project-scope.test.ts`

**Deps:** 1.3.6

**Acceptance:**
- [ ] `isAssignedToProject(userId, projectId, at = now)` returns boolean — uses `effectiveFrom`/`effectiveTo`/`revokedAt` semantics.
- [ ] `getAssignedProjects(userId, at = now)` returns the array of project IDs the user can currently see.
- [ ] Tests cover: active assignment, future assignment, expired assignment, revoked assignment, no assignment.

### Task 1.3.8 — `access-control` service: screen permission resolution `[backend]`

**Objective:** Resolve a user's effective screen permissions for a given screen + project, respecting project-level overrides.

**Files:**
- Create: `packages/core/src/access-control/screen-permissions.ts`
- Create: `packages/core/tests/access-control/screen-permissions.test.ts`

**Deps:** 1.3.6

**Acceptance:**
- [ ] `getScreenPermissions(userId, screenCode, projectId?)` returns `{ canView, canEdit, canApprove }`.
- [ ] Resolution order: most-specific wins → project override > role default. If multiple roles grant differing permissions, the union (most permissive) wins.
- [ ] Tests cover: role-default only, project override, multiple-role union, override more restrictive than default (override wins anyway — admin can lock down per-project).

### Task 1.3.9 — `access-control` service: cross-project read `[backend]`

**Objective:** Centralize the "is this user allowed to bypass project isolation for read?" check.

**Files:**
- Create: `packages/core/src/access-control/cross-project.ts`

**Deps:** 1.3.7

**Acceptance:**
- [ ] `canReadAcrossProjects(userId)` returns true only when the user has the `cross_project_read` permission (Master Admin and PMO by default).
- [ ] Test covers Master Admin (yes), PMO (yes), PM (no), Site (no).

### Task 1.3.10 — `requirePermission` helper `[backend]`

**Objective:** A throw-on-deny helper used by services and tRPC middleware.

**Files:**
- Modify: `packages/core/src/access-control/service.ts`

**Deps:** 1.3.6

**Acceptance:**
- [ ] `requirePermission(userId, permissionCode, projectId?)` throws `PermissionDeniedError` (with `code`, `permissionCode`, `projectId`) when the user lacks the permission.
- [ ] Returns void on success.
- [ ] Tests cover both paths.

### Task 1.3.11 — Override policy ⚠️ **LEARNING PAUSE #3** `[backend]`

**Objective:** Define which actions can be overridden by Master Admin, which require additional escalation, and which are never overridable. **Ahmed writes the policy.**

**Files:**
- Create: `packages/core/src/access-control/override-policy.ts`

**Deps:** 1.3.10

**Pause protocol:**
1. Agent prepares the file with the type signatures and example entries.
2. Agent stops, asks Ahmed to fill the policy.
3. Validate + commit.

**Prepared scaffold:**

```typescript
// packages/core/src/access-control/override-policy.ts

/**
 * Master Admin override policy for Pico Play Fun Makers KSA.
 *
 * Every override action passes through `withOverride()` (audit/override.ts).
 * This file defines:
 *   1. Which action types Master Admin can override at all.
 *   2. Which require an extra approval (a second Master Admin).
 *   3. Which are never overridable (signed records, posted financial events).
 *
 * Reference: spec §3 (Non-Negotiable Principles), §7.5 (Audit & Override).
 *
 * TODO(ahmed): fill the policy below. The agent has provided sensible
 * defaults that match the spec — adjust the lists to your operational
 * preference. 5–10 lines of edits is enough.
 */

export type OverrideActionType =
  | 'workflow.force_progress'
  | 'workflow.force_close'
  | 'workflow.reassign_approver'
  | 'document.unsign'              // NEVER allowed by spec — keep in NEVER list
  | 'document.delete'              // critical record — keep in NEVER
  | 'posting.reverse_silently'     // NEVER — must use additive reversal
  | 'project_assignment.revoke_immediately'
  | 'user.unlock_account'
  | 'user.force_password_reset'
  | 'reference_data.bulk_edit';

export type OverridePolicy = {
  /** Override types Master Admin can perform alone, with reason note. */
  allowed: OverrideActionType[];
  /** Override types requiring a second Master Admin approval before execution. */
  requiresSecondApprover: OverrideActionType[];
  /** Override types that are NEVER permitted, even by Master Admin. */
  never: OverrideActionType[];
};

export const OVERRIDE_POLICY: OverridePolicy = {
  allowed: [
    // TODO(ahmed): confirm this list. Defaults below are spec-aligned.
    'workflow.force_progress',
    'workflow.reassign_approver',
    'user.unlock_account',
    'user.force_password_reset',
  ],
  requiresSecondApprover: [
    // TODO(ahmed): confirm. These need 2 Master Admins.
    'workflow.force_close',
    'project_assignment.revoke_immediately',
    'reference_data.bulk_edit',
  ],
  never: [
    // Spec mandates — do not edit unless you really mean it.
    'document.unsign',
    'document.delete',
    'posting.reverse_silently',
  ],
};

export function isOverrideAllowed(action: OverrideActionType): boolean {
  return OVERRIDE_POLICY.allowed.includes(action) ||
         OVERRIDE_POLICY.requiresSecondApprover.includes(action);
}

export function requiresSecondApprover(action: OverrideActionType): boolean {
  return OVERRIDE_POLICY.requiresSecondApprover.includes(action);
}

export function isNeverOverridable(action: OverrideActionType): boolean {
  return OVERRIDE_POLICY.never.includes(action);
}
```

**Acceptance:**
- [ ] Ahmed has confirmed or edited the three lists.
- [ ] Tests cover all three branches (allowed, requiresSecondApprover, never).
- [ ] `isNeverOverridable` returns true for `document.unsign`, `document.delete`, `posting.reverse_silently`.

### Task 1.3.12 — `projectScope` tRPC middleware `[backend]`

**Objective:** Wrap every project-scoped tRPC procedure so unauthorized cross-project access is impossible. **TDD this — it's the most invariant-critical piece of M1.**

**Files:**
- Modify: `apps/web/server/trpc.ts`
- Create: `apps/web/server/trpc-middleware/project-scope.ts`
- Create: `apps/web/server/trpc-middleware/project-scope.test.ts`

**Deps:** 1.3.5, 1.3.7, 1.3.10

**TDD sequence:**

- [ ] **Step 1: Test (failing)**

```typescript
// apps/web/server/trpc-middleware/project-scope.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createInnerTRPCContext } from '../context';
import { appRouter } from '../routers/_app';
import { TRPCError } from '@trpc/server';
import { setupTestDb, makeUserAssignedTo } from '../../tests/helpers';

describe('projectScope middleware', () => {
  beforeEach(async () => { await setupTestDb(); });

  it('allows access when user is assigned to the project', async () => {
    const { user, projectId } = await makeUserAssignedTo('project-A');
    const caller = appRouter.createCaller(createInnerTRPCContext({ user }));
    await expect(caller.projects.get({ projectId })).resolves.toBeDefined();
  });

  it('denies access when user is not assigned to the project', async () => {
    const { user } = await makeUserAssignedTo('project-A');
    const caller = appRouter.createCaller(createInnerTRPCContext({ user }));
    await expect(caller.projects.get({ projectId: 'project-B' })).rejects.toThrow(TRPCError);
    await expect(caller.projects.get({ projectId: 'project-B' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('denies access when user has no session', async () => { /* unauth path */ });
  it('allows cross-project read for users with cross_project_read permission', async () => { /* PMO/Master Admin */ });
  it('writes an audit log entry on denial', async () => { /* spec §7.1 */ });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// apps/web/server/trpc-middleware/project-scope.ts
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { t } from '../trpc';   // base tRPC instance
import { isAssignedToProject, canReadAcrossProjects } from '@fmksa/core';
import { auditLog } from '@fmksa/core';

const projectIdInput = z.object({ projectId: z.string().uuid() });

export const projectScopeMiddleware = t.middleware(async ({ ctx, next, input, path }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  const parsed = projectIdInput.safeParse(input);
  if (!parsed.success) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'projectScope procedure requires a projectId in the input.',
    });
  }
  const { projectId } = parsed.data;

  const allowed =
    (await isAssignedToProject(ctx.user.id, projectId)) ||
    (await canReadAcrossProjects(ctx.user.id));

  if (!allowed) {
    await auditLog.log({
      actorUserId: ctx.user.id,
      actorSource: 'user',
      action: 'access_denied',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
      beforeJson: {},
      afterJson: { path, reason: 'not_assigned' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "You don't have access to this project.",
    });
  }

  return next({ ctx: { ...ctx, projectId } });
});

// Compose into a procedure type:
export const projectProcedure = t.procedure.use(projectScopeMiddleware);
```

- [ ] **Step 4: Wire `projectProcedure` into `apps/web/server/trpc.ts`** so all later phase routers can use it.
- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit:** `feat(auth): projectScope tRPC middleware enforces project isolation`

**Acceptance:**
- [ ] All test cases pass.
- [ ] Denied access writes an audit log entry every time.
- [ ] Error message is user-friendly, not technical.

### Task 1.3.13 — Sign-in screen `[frontend]`

**Objective:** A clean sign-in form using shadcn/ui.

**Files:**
- Create: `apps/web/app/(auth)/sign-in/page.tsx`
- Create: `apps/web/app/(auth)/layout.tsx` (no chrome, centered card)
- Create: `apps/web/components/sign-in-form.tsx`

**Deps:** 1.3.5

**Acceptance:**
- [ ] Form has email + password fields with React Hook Form + Zod resolver.
- [ ] Submits via tRPC `auth.signIn` mutation.
- [ ] Shows polite error message on failure (not technical).
- [ ] Redirects to `/home` on success.
- [ ] Lockout error shows "Account temporarily locked. Try again in X minutes."
- [ ] Loading state on submit.
- [ ] Visual: centered card, single accent button, neutral palette.

### Task 1.3.14 — Forgot-password stub `[frontend]`

**Objective:** Minimal UI that fires a password-reset email via SES/MailHog. Token flow is wired but the reset page itself is a stub for M1.

**Files:**
- Create: `apps/web/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web/server/routers/auth-recovery.ts`
- Create: `packages/core/src/auth/recovery.ts`

**Deps:** 1.3.5

**Acceptance:**
- [ ] User enters email → tRPC `authRecovery.requestReset` mutation → token generated, hashed, stored, email sent.
- [ ] Always returns success (don't leak whether the email exists).
- [ ] Token is one-time use, expires in 1 hour.
- [ ] Reset page itself just shows "Reset functionality available in M1 hardening phase" and accepts the token.

### Task 1.3.15 — User profile screen `[frontend]`

**Objective:** A user can view their profile and change their password.

**Files:**
- Create: `apps/web/app/(app)/profile/page.tsx`
- Create: `apps/web/components/profile-form.tsx`
- Create: `apps/web/components/change-password-form.tsx`

**Deps:** 1.3.5

**Acceptance:**
- [ ] Shows email, name, last login, role list (read-only).
- [ ] Change password form with old + new + confirm. Calls `auth.changePassword` (add this to the auth router).
- [ ] After password change, all sessions except current are revoked. Current session is rotated.
- [ ] MFA setup section is a stub: "MFA setup coming in hardening phase".

### Task 1.3.16 — Auth layout + protected route wrapper `[frontend]`

**Objective:** App-level layout that redirects to `/sign-in` if there's no session.

**Files:**
- Create: `apps/web/app/(app)/layout.tsx`
- Create: `apps/web/components/app-shell.tsx`
- Create: `apps/web/components/top-nav.tsx`

**Deps:** 1.3.5

**Acceptance:**
- [ ] Server component reads session via `auth()`. Redirects to `/sign-in` if missing.
- [ ] Renders top nav with: Home, My Approvals, Projects, Documents, Admin (if user has admin permission), user menu.
- [ ] Other nav items (Commercial, Procurement, etc.) appear as subtle "coming soon" placeholders per spec §8.2.
- [ ] User menu shows name, email, profile link, sign out.

### Task 1.3.17 — Permission deny test suite scaffold `[test]`

**Objective:** Set up the test file pattern that asserts every protected procedure denies unauthorized callers.

**Files:**
- Create: `apps/web/tests/permission-deny.test.ts`
- Create: `apps/web/tests/helpers/auth-test-callers.ts`

**Deps:** 1.3.12

**Acceptance:**
- [ ] Helpers exist for: `unauthenticatedCaller()`, `userAssignedToCaller(projectId)`, `userNotAssignedCaller()`, `pmoCaller()`, `masterAdminCaller()`.
- [ ] Suite asserts: `auth.me` requires authentication, `projects.get` requires assignment unless cross-project read, `documents.list` requires project assignment.
- [ ] More cases added in later phases as new procedures land.

### Task 1.3.18 — E2E: sign in + see projects `[test]`

**Objective:** Playwright test that signs in as Master Admin and verifies the home page renders the seeded sample project.

**Files:**
- Create: `apps/web/tests/e2e/sign-in.spec.ts`

**Deps:** 1.3.13, 1.3.16

**Acceptance:**
- [ ] Test boots a clean test DB, runs minimal seed, opens browser, signs in, asserts redirect to `/home`, asserts seeded project name visible.
- [ ] Wrong password shows polite error, stays on sign-in page.

### Task 1.3.19 — E2E: cross-project access denied `[test]`

**Objective:** Playwright test asserting a user assigned to project A cannot navigate to or query project B.

**Files:**
- Create: `apps/web/tests/e2e/cross-project-isolation.spec.ts`

**Deps:** 1.3.12, 1.3.16

**Acceptance:**
- [ ] Creates two projects + two users (one assigned to each).
- [ ] User-A tries to navigate to `/projects/<project-B-id>` → sees a polite "no access" page, audit log entry created.
- [ ] User-A tries to call `projects.get({ projectId: B })` directly via tRPC → FORBIDDEN.

**Phase 1.3 exit criteria:**
- [ ] Sign-in works end-to-end.
- [ ] `projectScope` middleware blocks cross-project access in tests.
- [ ] Override policy applied (Pause #3 done).
- [ ] Permission deny test suite has at least 5 cases.
- [ ] Master Admin can sign in, see the seeded project, change password.
- [ ] CI green.

---

## Phase 1.4 — Projects + Entities + Reference Data

**Goal:** Master Admin can create entities, create projects, assign users to projects, and manage reference data (countries, currencies, app settings, status dictionaries) through admin screens. Project list and project workspace work end-to-end.

**Dependencies:** Phase 1.3.
**Critical path:** runs in parallel with 1.5, 1.6, 1.7 — none of those depend on 1.4 strictly.
**Parallelizable:** backend service tasks (1.4.1–1.4.8) and UI tasks (1.4.9–1.4.15) can interleave once their direct deps are met.
**Learning pauses:** **Pause #4** (project settings defaults, in 1.4.3).
**Risks:** entity hierarchy UI complexity (mitigated by keeping it as a tree view, not a graph editor); project_settings shape drift (mitigated by Pause #4 locking defaults early).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.4.1 | `projects` service: CRUD methods | backend | 1.3 | with 1.4.5 |
| 1.4.2 | `projects` service: settings CRUD | backend | 1.4.1 | no |
| 1.4.3 | `projects` service: project-settings defaults ⚠️ **LEARNING PAUSE #4** | backend | 1.4.2 | no |
| 1.4.4 | `projects` service: assign / unassign users (with effective dates) | backend | 1.4.1 | with 1.4.5 |
| 1.4.5 | `entities` service: CRUD methods | backend | 1.3 | with 1.4.1 |
| 1.4.6 | `entities` service: hierarchy helpers | backend | 1.4.5 | no |
| 1.4.7 | `reference-data` service: read APIs | backend | 1.3 | yes |
| 1.4.8 | `reference-data` service: app_settings + status_dictionaries CRUD | backend | 1.4.7 | no |
| 1.4.9 | tRPC routers: projects, entities, refData | backend | 1.4.4, 1.4.6, 1.4.8 | no |
| 1.4.10 | Admin → Users screen | frontend | 1.4.9, 1.3 | yes |
| 1.4.11 | Admin → Roles & Permissions screen | frontend | 1.4.9 | yes |
| 1.4.12 | Admin → Project Assignments screen | frontend | 1.4.9 | yes |
| 1.4.13 | Admin → Entities screen | frontend | 1.4.9 | yes |
| 1.4.14 | Admin → Reference Data screen | frontend | 1.4.9 | yes |
| 1.4.15 | Projects list + Project workspace screens | frontend | 1.4.9 | no |
| 1.4.16 | Integration tests: projects service | test | 1.4.4 | yes |
| 1.4.17 | Integration tests: entities service | test | 1.4.6 | yes |
| 1.4.18 | E2E test: full project setup flow | test | 1.4.10–1.4.15 | no |

### Task 1.4.1 — `projects` service: CRUD `[backend]`

**Objective:** Create, read, update, archive projects. No hard delete.

**Files:**
- Create: `packages/core/src/projects/service.ts`
- Create: `packages/core/tests/projects/service.test.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `createProject({ code, name, entityId, currencyCode, startDate, endDate?, createdBy })` → returns project. Code is unique. Audit log written.
- [ ] `getProject(id, requestingUserId)` → enforces project scope. Returns project + linked entity + currency.
- [ ] `updateProject(id, data, updatedBy)` → audit log captures before/after diff.
- [ ] `archiveProject(id, reason, archivedBy)` → sets `status = 'archived'`. **Never deletes.** Audit log + reason required.
- [ ] `listProjects({ userId, includeArchived? })` → returns projects the user is assigned to (or all if cross-project read).
- [ ] All methods write audit logs.
- [ ] Tests cover happy path + permission deny + duplicate code + scoping.

### Task 1.4.2 — Project settings CRUD `[backend]`

**Objective:** Read/write per-project settings (key-value with JSON value).

**Files:**
- Create: `packages/core/src/projects/settings.ts`

**Deps:** 1.4.1

**Acceptance:**
- [ ] `getSetting(projectId, key)` → returns parsed value or default from `project-settings-defaults.ts`.
- [ ] `setSetting(projectId, key, value, updatedBy)` → upsert + audit log with before/after.
- [ ] `getAllSettings(projectId)` → returns full settings object merged with defaults.
- [ ] Tests cover all paths.

### Task 1.4.3 — Project settings defaults ⚠️ **LEARNING PAUSE #4** `[backend]`

**Objective:** Define the default `project_settings` for any new project. **Ahmed writes the defaults.**

**Files:**
- Create: `packages/core/src/projects/project-settings-defaults.ts`

**Deps:** 1.4.2

**Pause protocol:**
1. Agent prepares the file with type signatures and an example.
2. Agent stops, asks Ahmed to fill the defaults.
3. Validate + commit.

**Prepared scaffold:**

```typescript
// packages/core/src/projects/project-settings-defaults.ts

/**
 * Default project_settings applied to every new project.
 *
 * Later modules (Materials in M3, Budget in M4, etc.) read these defaults
 * to know how to behave. Setting them once here means new projects work
 * out of the box without manual configuration.
 *
 * TODO(ahmed): fill in the defaults below. The agent has provided suggested
 * values aligned with the spec — adjust to your standard project setup.
 * Edit any value, add new keys, or remove keys you don't want.
 */

export type ProjectSettingsDefaults = {
  // === Workflow toggles ===
  requireDocumentApprovalWorkflow: boolean;     // default: true
  requireMaterialReviewWorkflow: boolean;       // default: true (M3)
  requireRfqWorkflow: boolean;                  // default: true (M3)
  requireIpaWorkflow: boolean;                  // default: true (M2)
  requireVoWorkflow: boolean;                   // default: true (M2)

  // === Material tracking flags (M3) ===
  defaultRequiresPmReview: boolean;
  defaultRequiresProcurementReview: boolean;
  defaultRequiresQaqcReview: boolean;
  defaultRequiresDesignReview: boolean;
  defaultRequiresShopDrawing: boolean;
  defaultRequiresSampleApproval: boolean;
  defaultRequiresMockup: boolean;
  defaultRequiresThirdPartyTesting: boolean;
  defaultRequiresCertification: boolean;
  defaultLongLeadThresholdDays: number;        // e.g., 60

  // === Document categories enabled for this project ===
  enabledDocumentCategories: string[];

  // === Notification toggles ===
  notifyOnWorkflowStepAssigned: boolean;
  notifyOnDocumentSigned: boolean;
  notifyOnPostingException: boolean;
};

export const PROJECT_SETTINGS_DEFAULTS: ProjectSettingsDefaults = {
  // TODO(ahmed): confirm or edit these defaults.
  requireDocumentApprovalWorkflow: true,
  requireMaterialReviewWorkflow: true,
  requireRfqWorkflow: true,
  requireIpaWorkflow: true,
  requireVoWorkflow: true,

  defaultRequiresPmReview: true,
  defaultRequiresProcurementReview: true,
  defaultRequiresQaqcReview: true,
  defaultRequiresDesignReview: true,
  defaultRequiresShopDrawing: true,
  defaultRequiresSampleApproval: false,
  defaultRequiresMockup: false,
  defaultRequiresThirdPartyTesting: false,
  defaultRequiresCertification: true,
  defaultLongLeadThresholdDays: 60,

  enabledDocumentCategories: [
    'shop_drawing',
    'material_submittal',
    'test_certificate',
    'contract_attachment',
    'vendor_document',
    'letter',
    'drawing',
    'specification',
    'general',
  ],

  notifyOnWorkflowStepAssigned: true,
  notifyOnDocumentSigned: true,
  notifyOnPostingException: true,
};

export function getDefaultSetting<K extends keyof ProjectSettingsDefaults>(
  key: K,
): ProjectSettingsDefaults[K] {
  return PROJECT_SETTINGS_DEFAULTS[key];
}
```

**Acceptance:**
- [ ] Ahmed has confirmed or edited the defaults.
- [ ] `createProject` automatically writes the defaults into `project_settings` rows for the new project.
- [ ] Tests assert defaults are applied to every new project.

### Task 1.4.4 — Project assignments `[backend]`

**Objective:** Assign and unassign users to projects with effective dates.

**Files:**
- Create: `packages/core/src/projects/assignments.ts`

**Deps:** 1.4.1

**Acceptance:**
- [ ] `assign({ projectId, userId, roleId, effectiveFrom, effectiveTo?, assignedBy })` → creates `project_assignments` row, audit log written.
- [ ] `revoke({ assignmentId, reason, revokedBy })` → sets `revokedAt`, `revokedBy`, `reason`. **Never deletes.** Audit log + reason required.
- [ ] `listAssignments({ projectId, at? })` → returns active assignments at the given time.
- [ ] Tests cover: assign, revoke, future-dated assignment, expired assignment, revoke without reason (rejected).

### Task 1.4.5 — `entities` service: CRUD `[backend]`

**Objective:** Create, read, update entities. Validate parent-child relationships.

**Files:**
- Create: `packages/core/src/entities/service.ts`
- Create: `packages/core/tests/entities/service.test.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `createEntity({ code, name, type, parentEntityId?, status, metadata? })` → creates row, audit log written. Code unique.
- [ ] `getEntity(id)` → returns entity with parent and children.
- [ ] `updateEntity(id, data, updatedBy)` → audit log with before/after.
- [ ] `archiveEntity(id, reason, archivedBy)` → sets status. **No hard delete.**
- [ ] Validation: a `parent` type cannot have a parent. A `subsidiary` must have a parent. A `sister_company` must have the same parent as another entity (validated in service, not enforced as FK).
- [ ] Tests cover validation rules + happy paths.

### Task 1.4.6 — Entity hierarchy helpers `[backend]`

**Objective:** Tree-walking helpers — list ancestors, descendants, siblings.

**Files:**
- Create: `packages/core/src/entities/hierarchy.ts`
- Create: `packages/core/tests/entities/hierarchy.test.ts`

**Deps:** 1.4.5

**Acceptance:**
- [ ] `getAncestors(entityId)` returns ordered list from root to immediate parent.
- [ ] `getDescendants(entityId)` returns flat list (with depth field).
- [ ] `getSiblings(entityId)` returns entities with the same parent.
- [ ] Tests cover deep trees and entities with no parent.

**Notes:** For M1, recursive queries are fine. If entity counts grow into thousands later, we can swap to a Postgres recursive CTE.

### Task 1.4.7 — `reference-data` service: read APIs `[backend]`

**Objective:** Public-read APIs for countries, currencies, app settings, status dictionaries.

**Files:**
- Create: `packages/core/src/reference-data/service.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `listCountries()`, `listCurrencies()`, `getAppSetting(key)`, `getStatusDictionary(code)` all exist.
- [ ] All cached in-memory for the request lifetime (simple memoization).
- [ ] Tests verify caching works (only one DB call per request).

### Task 1.4.8 — `reference-data` service: write APIs `[backend]`

**Objective:** Master Admin can edit `app_settings` and `status_dictionaries`. Countries and currencies are read-only (changing ISO standards is a code change, not a runtime config).

**Files:**
- Modify: `packages/core/src/reference-data/service.ts`

**Deps:** 1.4.7

**Acceptance:**
- [ ] `setAppSetting(key, value, updatedBy)` → upsert with audit log.
- [ ] `addStatusDictEntry(...)`, `updateStatusDictEntry(...)`, `archiveStatusDictEntry(...)` — never hard delete.
- [ ] Permission check: only `reference_data.edit` permission allowed.
- [ ] Tests cover all paths.

### Task 1.4.9 — tRPC routers: projects, entities, refData `[backend]`

**Objective:** Expose all the service methods over tRPC with proper procedure types (project-scoped vs admin-scoped).

**Files:**
- Create: `apps/web/server/routers/projects.ts`
- Create: `apps/web/server/routers/entities.ts`
- Create: `apps/web/server/routers/reference-data.ts`
- Create: `packages/contracts/src/projects.ts`
- Create: `packages/contracts/src/entities.ts`
- Create: `packages/contracts/src/reference-data.ts`
- Modify: `apps/web/server/routers/_app.ts`

**Deps:** 1.4.4, 1.4.6, 1.4.8

**Acceptance:**
- [ ] All service methods have a corresponding tRPC procedure with Zod input validation from `@fmksa/contracts`.
- [ ] Project-scoped procedures use `projectProcedure` (the middleware from 1.3.12).
- [ ] Admin-only procedures check `system.admin` permission.
- [ ] Each router has integration tests in `apps/web/server/routers/<name>.test.ts` against a real DB.

### Task 1.4.10 — Admin → Users screen `[frontend]`

**Objective:** Master Admin can list, create, activate/deactivate, and reset passwords for users.

**Files:**
- Create: `apps/web/app/(app)/admin/users/page.tsx`
- Create: `apps/web/app/(app)/admin/users/[id]/page.tsx`
- Create: `apps/web/components/admin/user-list.tsx`
- Create: `apps/web/components/admin/user-form.tsx`

**Deps:** 1.4.9, 1.3

**Acceptance:**
- [ ] List view: TanStack Table with email, name, status, last login, role count. Filters by status. CSV export.
- [ ] Create user opens a sheet with form (email, name, initial password, send invite email).
- [ ] User detail page shows profile + role assignments + project assignments + audit trail.
- [ ] Deactivate sets `status = 'inactive'` (audit log + reason). Never deletes.

### Task 1.4.11 — Admin → Roles & Permissions screen `[frontend]`

**Objective:** View role list, view permission matrix, edit screen permissions per role (with project override option).

**Files:**
- Create: `apps/web/app/(app)/admin/roles/page.tsx`
- Create: `apps/web/components/admin/role-permission-matrix.tsx`

**Deps:** 1.4.9

**Acceptance:**
- [ ] Lists 14 roles with permission counts.
- [ ] Permission matrix view: rows = permissions, columns = roles, checkboxes for membership.
- [ ] Screen permissions sub-tab: per-role default with project-override option.
- [ ] All edits go through admin tRPC procedures with audit logging.

### Task 1.4.12 — Admin → Project Assignments screen `[frontend]`

**Objective:** Master Admin assigns users to projects with effective dates.

**Files:**
- Create: `apps/web/app/(app)/admin/assignments/page.tsx`
- Create: `apps/web/components/admin/assignment-form.tsx`

**Deps:** 1.4.9

**Acceptance:**
- [ ] Filterable list of assignments by project, user, role, status.
- [ ] Add assignment sheet: project + user + role + effectiveFrom + effectiveTo (optional).
- [ ] Revoke action requires reason.

### Task 1.4.13 — Admin → Entities screen `[frontend]`

**Objective:** Tree view of entity hierarchy with create/edit/archive.

**Files:**
- Create: `apps/web/app/(app)/admin/entities/page.tsx`
- Create: `apps/web/components/admin/entity-tree.tsx`
- Create: `apps/web/components/admin/entity-form.tsx`

**Deps:** 1.4.9

**Acceptance:**
- [ ] Tree view shows parent → children expansion.
- [ ] Click an entity → drawer with detail, edit, archive.
- [ ] New entity form with type validation.

### Task 1.4.14 — Admin → Reference Data screen `[frontend]`

**Objective:** View countries (read-only), currencies (read-only), app settings (editable), status dictionaries (editable).

**Files:**
- Create: `apps/web/app/(app)/admin/reference-data/page.tsx`
- Create: `apps/web/components/admin/app-settings-form.tsx`
- Create: `apps/web/components/admin/status-dictionary-editor.tsx`

**Deps:** 1.4.9

**Acceptance:**
- [ ] Tabs: Countries, Currencies, App Settings, Status Dictionaries.
- [ ] Status dictionary editor lets Master Admin add/edit/archive entries per dictionary code.
- [ ] App settings editor renders form fields based on declared types.

### Task 1.4.15 — Projects list + workspace screens `[frontend]`

**Objective:** Real users can browse their assigned projects and open the project workspace with stubbed tabs for later modules.

**Files:**
- Create: `apps/web/app/(app)/projects/page.tsx`
- Create: `apps/web/app/(app)/projects/[id]/page.tsx`
- Create: `apps/web/app/(app)/projects/[id]/layout.tsx`
- Create: `apps/web/components/project-workspace-tabs.tsx`

**Deps:** 1.4.9

**Acceptance:**
- [ ] Projects list shows only projects the user is assigned to (uses `projects.list` tRPC query).
- [ ] Project workspace has tabs: Overview, Documents (stub until 1.6), Team, Settings, plus subtle "Coming in Module 2: Commercial", "Coming in Module 3: Procurement", etc.
- [ ] Project switcher in top nav lets user jump between projects.
- [ ] Empty states are helpful and clean (per spec UX rules).

### Task 1.4.16 — Integration tests: projects `[test]`

**Files:** `packages/core/tests/projects/service.test.ts`

**Acceptance:** Cover all CRUD paths, permission denies, audit log entries.

### Task 1.4.17 — Integration tests: entities `[test]`

**Files:** `packages/core/tests/entities/{service,hierarchy}.test.ts`

**Acceptance:** Cover validation rules and tree helpers.

### Task 1.4.18 — E2E: full project setup `[test]`

**Files:** `apps/web/tests/e2e/admin-project-setup.spec.ts`

**Deps:** 1.4.10–1.4.15

**Acceptance:**
- [ ] Test creates a user via admin UI, assigns role, creates entity, creates project, assigns user to project, verifies user can sign in and see the project.

**Phase 1.4 exit criteria:**
- [ ] Admin can fully set up users, roles, entities, projects, assignments through the UI.
- [ ] Project settings defaults applied (Pause #4 done).
- [ ] Reference data screens working.
- [ ] Project list and workspace render with assignment-based filtering.
- [ ] CI green.

---

## Phase 1.5 — Workflow Engine

**Goal:** A generic, record-type-agnostic workflow engine that later modules will register against. Master Admin can author templates via JSON form, instances run end-to-end with approvals, every action writes to `workflow_actions` and audit log. The "My Approvals" screen shows pending instances assigned to the current user.

**Dependencies:** Phase 1.3.
**Critical path:** YES (Phase 1.8 needs workflow events).
**Parallelizable:** Engine internals (1.5.1–1.5.8) are sequential. UI (1.5.9, 1.5.10) and seed (1.5.11) follow.
**Learning pauses:** **Pause #2** (workflow template seed, in 1.5.11).
**Risks:** **highest single risk in M1** — over-abstraction. Spec mandates "practical, not framework-heavy". Avoid rule DSLs, avoid template inheritance, avoid plugin systems.

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.5.1 | `workflow` service: template CRUD | backend | 1.3 | no |
| 1.5.2 | `workflow` service: template JSON schema validation | backend | 1.5.1 | no |
| 1.5.3 | `workflow` service: instance creation | backend | 1.5.2 | no |
| 1.5.4 | `workflow` service: step progression (approve/reject/return) | backend | 1.5.3 | no |
| 1.5.5 | `workflow` service: action logging + audit | backend | 1.5.4 | no |
| 1.5.6 | `workflow` service: approver resolution (role / user / expression) | backend | 1.5.4 | no |
| 1.5.7 | `workflow` service: SLA tracking (countdown, breach flag) | backend | 1.5.4 | yes |
| 1.5.8 | `workflow` service: event publication (in-process pub/sub for 1.8 + later modules) | backend | 1.5.4 | no |
| 1.5.9 | tRPC router: workflow | backend | 1.5.4–1.5.8 | no |
| 1.5.10 | Admin → Workflow Templates screen | frontend | 1.5.9 | yes |
| 1.5.11 | My Approvals screen | frontend | 1.5.9 | yes |
| 1.5.12 | Seed: sample "Document Approval" template ⚠️ **LEARNING PAUSE #2** | database | 1.5.2 | no |
| 1.5.13 | Integration tests: happy path | test | 1.5.4 | yes |
| 1.5.14 | Integration tests: returned + resubmit | test | 1.5.4 | yes |
| 1.5.15 | Integration tests: approver resolution edge cases | test | 1.5.6 | yes |
| 1.5.16 | E2E: template → instance → approve → audit | test | 1.5.10, 1.5.11 | no |

### Task 1.5.1 — `workflow` service: template CRUD `[backend]`

**Objective:** Create, read, update, deactivate workflow templates.

**Files:**
- Create: `packages/core/src/workflow/templates.ts`
- Create: `packages/core/tests/workflow/templates.test.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `createTemplate({ code, name, recordType, config, steps, createdBy })` → creates template + steps in a transaction. Code unique. `version = 1`.
- [ ] `updateTemplate(id, data, updatedBy)` → bumps `version`, never modifies the old row (immutable templates by version). Old version stays for instances already started against it.
- [ ] `deactivateTemplate(id)` → sets `isActive = false`. Cannot start new instances; existing ones continue.
- [ ] `listTemplates({ recordType?, isActive? })` → filtered list.
- [ ] All operations write audit logs.
- [ ] Tests cover CRUD + version bump + permission deny.

**Notes:** Versioning matters because Module 2's IPA workflow may evolve over time, and old in-flight instances must continue under their original template version.

### Task 1.5.2 — Template JSON schema validation `[backend]`

**Objective:** Validate the `configJson` and `approverRuleJson` shapes via Zod before persistence.

**Files:**
- Create: `packages/contracts/src/workflow.ts`

**Deps:** 1.5.1

**Acceptance:**
- [ ] `WorkflowTemplateConfigSchema` validates the template-level config (allowComment, allowReturn, allowOverride, requirementFlagsSchema).
- [ ] `ApproverRuleSchema` validates: `{ type: 'role', roleCode: string }` | `{ type: 'user', userId: string }` | `{ type: 'project_role', roleCode: string, projectScoped: true }` | `{ type: 'any_of', rules: ApproverRule[] }`.
- [ ] `WorkflowStepSchema` validates step shape including `approverRuleJson`.
- [ ] Invalid templates throw clear validation errors.

**Notes:** Don't build a DSL. The four `ApproverRule` shapes above are enough for M1 — Modules 2/3 can extend if needed.

### Task 1.5.3 — Instance creation `[backend]`

**Objective:** Start a workflow instance for a business record.

**Files:**
- Create: `packages/core/src/workflow/instances.ts`

**Deps:** 1.5.2

**Acceptance:**
- [ ] `startInstance({ templateCode, recordType, recordId, projectId, startedBy })` → creates instance, sets `currentStepId` to the first step, status `in_progress`. Returns instance.
- [ ] Validates: template exists + active, project exists, user has permission, no existing in-progress instance for the same `(recordType, recordId)`.
- [ ] Writes audit + workflow_action.
- [ ] Publishes `workflow.started` event.
- [ ] Tests cover happy path + rejections.

### Task 1.5.4 — Step progression `[backend]`

**Objective:** The core action handler — approve, reject, return.

**Files:**
- Create: `packages/core/src/workflow/steps.ts`

**Deps:** 1.5.3

**Acceptance:**
- [ ] `approveStep({ instanceId, stepId, actorUserId, comment? })` → validates actor is a valid approver for the step → writes action → advances `currentStepId` to next step (or sets `status = 'approved', completedAt = now` if last step) → publishes `workflow.stepApproved` and possibly `workflow.approved` events.
- [ ] `rejectStep({ instanceId, stepId, actorUserId, comment })` → comment required → status `rejected`, completedAt → action logged → events published.
- [ ] `returnStep({ instanceId, stepId, actorUserId, comment, returnToStepId })` → comment required → moves currentStepId backwards to specified step → action logged → events published.
- [ ] `cancelInstance({ instanceId, actorUserId, reason })` → status `cancelled`, action logged.
- [ ] All actions write to `workflow_actions` (append-only).
- [ ] Permission check: actor must match approver rule.
- [ ] Tests cover all paths + invalid actors.

### Task 1.5.5 — Action logging + audit `[backend]`

**Objective:** Every workflow action writes to both `workflow_actions` (domain log) and `audit_logs` (cross-cutting log).

**Files:**
- Modify: `packages/core/src/workflow/steps.ts`

**Deps:** 1.5.4

**Acceptance:**
- [ ] Each action call writes one row to `workflow_actions` and one to `audit_logs` in the same transaction.
- [ ] Audit log captures actor, action, resource (`workflow_instance:<id>`), before (current step), after (next step), comment.
- [ ] Test: count rows in both tables after a 3-step approval — exactly 3 rows in each.

### Task 1.5.6 — Approver resolution `[backend]`

**Objective:** Given an `approverRule`, return the set of users who can act on the step.

**Files:**
- Create: `packages/core/src/workflow/approver-resolution.ts`

**Deps:** 1.5.4

**Acceptance:**
- [ ] `resolveApprovers(rule, projectId)` returns an array of user IDs.
- [ ] For `type: 'role'` → all users with that role in the project (via `project_assignments`).
- [ ] For `type: 'user'` → just that user (verified to be assigned to the project).
- [ ] For `type: 'project_role'` → role-restricted to the specific project.
- [ ] For `type: 'any_of'` → union of all sub-rule resolutions.
- [ ] If resolution returns empty set → throws `NoApproversFoundError` (caught upstream and surfaced as a configuration warning).
- [ ] Tests cover all rule types + empty set.

### Task 1.5.7 — SLA tracking `[backend]`

**Objective:** Compute remaining SLA hours, flag breach, expose via instance read.

**Files:**
- Modify: `packages/core/src/workflow/instances.ts`

**Deps:** 1.5.4

**Acceptance:**
- [ ] `getInstance(id)` returns instance with `slaRemainingHours` (derived from current step's `slaHours - hoursSinceCurrentStepStarted`) and `slaBreached: boolean`.
- [ ] Tests cover: under SLA, exactly at SLA, breached.
- [ ] No background job in M1 — derived on read. Background SLA breach notifications can come in 1.8 if time permits, otherwise post-M1.

### Task 1.5.8 — Event publication `[backend]`

**Objective:** A simple in-process pub/sub for workflow events that 1.8 (notifications) and later modules can subscribe to.

**Files:**
- Create: `packages/core/src/workflow/events.ts`

**Deps:** 1.5.4

**Acceptance:**
- [ ] `events.on('workflow.started', handler)`, `events.on('workflow.stepApproved', handler)`, etc. (typed event names).
- [ ] `events.emit(name, payload)` calls all handlers in order. Handlers can be async.
- [ ] Errors in handlers are caught and logged but don't crash the emitter.
- [ ] Tests cover registration, emission, error handling.

**Notes:** This is a deliberate "boring" event bus — no Kafka, no Redis pub/sub. It's a typed `EventEmitter` wrapper. Cross-process events (when 1.8 worker subscribes from a different process) go through BullMQ jobs, not this emitter.

### Task 1.5.9 — tRPC router: workflow `[backend]`

**Files:**
- Create: `apps/web/server/routers/workflow.ts`
- Modify: `apps/web/server/routers/_app.ts`

**Deps:** 1.5.4–1.5.8

**Acceptance:**
- [ ] Procedures: `workflow.templates.list`, `.create`, `.update`, `.deactivate`; `workflow.instances.start`, `.get`, `.approve`, `.reject`, `.return`, `.cancel`; `workflow.myApprovals` (list of instances awaiting current user).
- [ ] All project-scoped procedures use `projectProcedure`.
- [ ] Integration tests against real DB.

### Task 1.5.10 — Admin → Workflow Templates screen `[frontend]`

**Objective:** A functional (not pretty) form-based template editor.

**Files:**
- Create: `apps/web/app/(app)/admin/workflow-templates/page.tsx`
- Create: `apps/web/app/(app)/admin/workflow-templates/[id]/page.tsx`
- Create: `apps/web/components/admin/workflow-template-form.tsx`
- Create: `apps/web/components/admin/workflow-step-editor.tsx`

**Deps:** 1.5.9

**Acceptance:**
- [ ] List all templates with filter by `recordType`, `isActive`.
- [ ] Edit form: code, name, recordType, config (JSON textarea with Zod validation on submit), steps array.
- [ ] Step editor: order, name, approver rule (rule type dropdown + role/user picker), SLA hours, optional flag, requirement flags JSON.
- [ ] Form is functional. No drag-and-drop. No visual canvas.
- [ ] Validation errors are shown inline.

### Task 1.5.11 — My Approvals screen `[frontend]`

**Objective:** Pending workflow steps where the current user is an approver.

**Files:**
- Create: `apps/web/app/(app)/approvals/page.tsx`
- Create: `apps/web/components/approvals/approval-list.tsx`
- Create: `apps/web/components/approvals/approval-actions.tsx`

**Deps:** 1.5.9

**Acceptance:**
- [ ] Lists instances where the current user resolves as an approver for the current step.
- [ ] Each item shows: project, record type, record reference, current step name, time waited, SLA status.
- [ ] Action buttons: Approve, Return, Reject. All require optional comment (required for return/reject).
- [ ] Action submit shows toast and refreshes the list.
- [ ] Empty state: "No approvals waiting for you".

### Task 1.5.12 — Seed: workflow template ⚠️ **LEARNING PAUSE #2** `[database]`

**Objective:** Insert one representative "Document Approval" template that becomes the reference template for all later modules. **Ahmed writes the steps.**

**Files:**
- Create: `packages/db/src/seed/workflow-templates.ts`

**Deps:** 1.5.2

**Pause protocol:**
1. Agent prepares the file with a documented scaffold and one step example.
2. Agent stops, asks Ahmed to define the step sequence and approver rules.
3. Validate (run seed, start an instance, walk the steps in dev) + commit.

**Prepared scaffold:**

```typescript
// packages/db/src/seed/workflow-templates.ts
import type { PrismaClient } from '@prisma/client';

/**
 * Reference workflow template: Document Approval
 *
 * This is the canonical template that demonstrates how Pico Play workflows
 * are structured. Modules 2/3 will copy this pattern for IPA, RFQ, etc.
 *
 * TODO(ahmed): define the step sequence and approver rules. The example
 * below shows the structure. 5–10 lines of editing should be enough.
 *
 * Approver rule shapes:
 *   { type: 'role', roleCode: 'project_manager' }
 *   { type: 'project_role', roleCode: 'qs_commercial', projectScoped: true }
 *   { type: 'user', userId: '...' }
 *   { type: 'any_of', rules: [...] }
 */

export const DOCUMENT_APPROVAL_TEMPLATE = {
  code: 'document_approval_v1',
  name: 'Document Approval',
  recordType: 'document',
  version: 1,
  isActive: true,
  config: {
    allowComment: true,
    allowReturn: true,
    allowOverride: true,
  },
  steps: [
    // TODO(ahmed): edit / extend the step list below.
    {
      orderIndex: 10,
      name: 'Document Controller Review',
      approverRule: { type: 'role', roleCode: 'document_controller' },
      slaHours: 24,
      isOptional: false,
      requirementFlags: { requires_metadata_check: true },
    },
    {
      orderIndex: 20,
      name: 'PM Approval',
      approverRule: { type: 'project_role', roleCode: 'project_manager', projectScoped: true },
      slaHours: 48,
      isOptional: false,
      requirementFlags: {},
    },
    {
      orderIndex: 30,
      name: 'PD Sign-off',
      approverRule: { type: 'project_role', roleCode: 'project_director', projectScoped: true },
      slaHours: 72,
      isOptional: true,
      requirementFlags: { final_signature: true },
    },
  ],
};

export async function seedWorkflowTemplates(prisma: PrismaClient) {
  const t = DOCUMENT_APPROVAL_TEMPLATE;
  const template = await prisma.workflowTemplate.upsert({
    where: { code: t.code },
    create: {
      code: t.code,
      name: t.name,
      recordType: t.recordType,
      version: t.version,
      isActive: t.isActive,
      configJson: t.config,
      createdBy: 'system',
    },
    update: {
      name: t.name,
      isActive: t.isActive,
      configJson: t.config,
    },
  });
  // delete + recreate steps for idempotency (templates are immutable per version,
  // but this is fine for seed because version is part of the code)
  await prisma.workflowStep.deleteMany({ where: { templateId: template.id } });
  for (const s of t.steps) {
    await prisma.workflowStep.create({
      data: {
        templateId: template.id,
        orderIndex: s.orderIndex,
        name: s.name,
        approverRuleJson: s.approverRule,
        slaHours: s.slaHours,
        isOptional: s.isOptional,
        requirementFlagsJson: s.requirementFlags,
      },
    });
  }
}
```

**Acceptance:**
- [ ] Ahmed has confirmed or edited the step sequence.
- [ ] Seed runs cleanly.
- [ ] A workflow instance can be started against this template in dev and walked end-to-end.

### Task 1.5.13–1.5.15 — Integration tests `[test]`

**Files:** `packages/core/tests/workflow/{instances,steps,approver-resolution}.test.ts`

**Acceptance:** Cover happy path, returned + resubmit, all approver rule shapes, edge cases (no approvers found, cancelled mid-flow, deactivated template).

### Task 1.5.16 — E2E: template → instance → approve `[test]`

**Files:** `apps/web/tests/e2e/workflow-end-to-end.spec.ts`

**Deps:** 1.5.10, 1.5.11

**Acceptance:**
- [ ] Test signs in as admin, opens template list, verifies seeded template exists.
- [ ] Signs in as a user with the right role, opens My Approvals, approves the instance step by step.
- [ ] Asserts audit log captured every action.

**Phase 1.5 exit criteria:**
- [ ] Workflow engine functional end-to-end.
- [ ] Sample template seeded (Pause #2 done).
- [ ] My Approvals screen working.
- [ ] Audit captures every workflow action.
- [ ] Events published for 1.8 to consume.
- [ ] CI green.

---

## Phase 1.6 — Documents + Signatures

**Goal:** Users can upload documents to a project, version them, sign them (internal sign intent with hash capture), supersede them, and filter by category. Signed versions are immutable end-to-end.

**Dependencies:** Phase 1.3 (project scoping), Phase 1.4 (projects exist), Phase 1.2 (signed-immutability middleware in place).
**Critical path:** parallel with 1.4, 1.5, 1.7 — but 1.10 E2E suite needs 1.6 for the document scenarios.
**Parallelizable:** storage abstraction (1.6.1), service methods (1.6.2–1.6.7), and UI (1.6.9–1.6.11) can interleave.
**Learning pauses:** none.
**Risks:** S3/MinIO abstraction leaking AWS specifics into domain code (mitigated by strict storage interface); signed-immutability bypass (already covered by Phase 1.2 middleware + integration test in 1.6.13).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.6.1 | Storage abstraction (S3/MinIO interface) | backend | 1.3 | yes |
| 1.6.2 | `documents` service: createDocument | backend | 1.6.1 | no |
| 1.6.3 | `documents` service: uploadVersion | backend | 1.6.2 | no |
| 1.6.4 | `documents` service: list by project + category | backend | 1.6.2 | with 1.6.3 |
| 1.6.5 | `documents` service: signVersion (internal sign intent) | backend | 1.6.3 | no |
| 1.6.6 | `documents` service: supersedeVersion | backend | 1.6.5 | no |
| 1.6.7 | `documents` service: getDocument with versions | backend | 1.6.3 | with 1.6.5 |
| 1.6.8 | DocumentCategory enum exposed via contracts | backend | 1.2 | yes |
| 1.6.9 | tRPC router: documents | backend | 1.6.2–1.6.7 | no |
| 1.6.10 | Document library screen | frontend | 1.6.9 | yes |
| 1.6.11 | Document viewer screen | frontend | 1.6.9 | yes |
| 1.6.12 | Upload widget component | frontend | 1.6.9 | with 1.6.10, 1.6.11 |
| 1.6.13 | Integration tests: full document lifecycle | test | 1.6.6 | yes |
| 1.6.14 | Integration tests: signed-immutability through service layer | test | 1.6.5 | yes |
| 1.6.15 | Integration tests: supersession | test | 1.6.6 | yes |
| 1.6.16 | Integration tests: category filter + cross-project isolation | test | 1.6.4 | yes |
| 1.6.17 | E2E: upload → sign → cannot edit | test | 1.6.10–1.6.12 | no |
| 1.6.18 | E2E: cross-project document isolation | test | 1.6.10–1.6.12 | no |

### Task 1.6.1 — Storage abstraction `[backend]`

**Objective:** A clean interface for file storage that domain code uses, with adapters for MinIO (local) and S3 (AWS).

**Files:**
- Create: `packages/core/src/documents/storage.ts`
- Create: `packages/core/src/documents/storage/minio.ts`
- Create: `packages/core/src/documents/storage/s3.ts`
- Create: `packages/core/tests/documents/storage.test.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] Interface `Storage` with: `upload({ key, body, contentType, contentLength, sha256? }) → { fileKey, etag }`, `download(key) → ReadableStream`, `getSignedUrl(key, expiresInSeconds) → string`, `delete(key) → void` (used only for unsigned-version cleanup; signed versions are never deletable from DB anyway).
- [ ] MinioAdapter and S3Adapter both implement `Storage` using `@aws-sdk/client-s3` (which works against MinIO via `endpoint` + `forcePathStyle`).
- [ ] Adapter selection via `STORAGE_PROVIDER` env var.
- [ ] No AWS SDK types leak out of `storage/`. The rest of `documents/` only knows the `Storage` interface.
- [ ] Tests use a real MinIO container (testcontainers) for the upload/download/sign-url roundtrip.

### Task 1.6.2 — `createDocument` `[backend]`

**Objective:** Create the parent `documents` row (without an initial version yet).

**Files:**
- Create: `packages/core/src/documents/service.ts`

**Deps:** 1.6.1

**Acceptance:**
- [ ] `createDocument({ projectId, recordType?, recordId?, title, category, createdBy })` → returns document. Status `draft`. `currentVersionId = null`.
- [ ] Permission check: `document.upload` permission on the project.
- [ ] Audit log written.

### Task 1.6.3 — `uploadVersion` `[backend]`

**Objective:** Upload a file, hash it, store it, and create a `document_versions` row.

**Files:**
- Modify: `packages/core/src/documents/service.ts`
- Create: `packages/core/src/documents/versions.ts`

**Deps:** 1.6.2

**Acceptance:**
- [ ] `uploadVersion({ documentId, fileBuffer, mimeType, uploadedBy })` → computes SHA-256 → uploads to storage → creates version row → updates `documents.currentVersionId` → audit log.
- [ ] Auto-increments `versionNo` (from 1).
- [ ] Updates `documents.status` to `in_review` if it was `draft`.
- [ ] Tests cover happy path + storage failure rollback.

### Task 1.6.4 — List by project + category `[backend]`

**Objective:** Query documents with filters.

**Files:**
- Modify: `packages/core/src/documents/service.ts`

**Deps:** 1.6.2

**Acceptance:**
- [ ] `listDocuments({ projectId, category?, status?, search? })` → paginated list with current version metadata.
- [ ] Project scope enforced (uses requesting user from ctx).
- [ ] Search uses `ilike` on `title`.
- [ ] Tests cover filter combinations and project isolation.

### Task 1.6.5 — `signVersion` `[backend]`

**Objective:** Sign a document version (internal sign intent — captures signer, time, IP, user agent, hash). After this, the version is immutable (Prisma middleware enforces).

**Files:**
- Create: `packages/core/src/documents/signatures.ts`

**Deps:** 1.6.3

**Acceptance:**
- [ ] `signVersion({ versionId, signerUserId, ip, userAgent })` → loads version → fetches the file from storage → recomputes SHA-256 → asserts it matches stored `fileHash` → sets `isSigned = true`, `signedAt`, `signedBy` → creates `document_signatures` row with `hashAtSign` → audit log → `documents.status = 'signed'`.
- [ ] Hash mismatch throws `IntegrityError` with clear message.
- [ ] Permission check: `document.sign` permission.
- [ ] Tests cover happy path, hash mismatch, double-sign rejection (signed version cannot be re-signed).

### Task 1.6.6 — `supersedeVersion` `[backend]`

**Objective:** Upload a new version that supersedes an existing (possibly signed) one.

**Files:**
- Modify: `packages/core/src/documents/service.ts`

**Deps:** 1.6.5

**Acceptance:**
- [ ] `supersedeVersion({ documentId, oldVersionId, fileBuffer, mimeType, uploadedBy, reason })` → uploads new file → creates new version → on the OLD version, sets `supersededAt`, `supersededByVersionId` (this is the only allowed update on a signed version, per Phase 1.2 middleware) → updates `documents.currentVersionId` to the new version → audit log with reason.
- [ ] Reason is required.
- [ ] Tests cover supersede-signed and supersede-unsigned paths.

### Task 1.6.7 — `getDocument` with versions `[backend]`

**Objective:** Read the document with full version history.

**Files:** Modify `packages/core/src/documents/service.ts`

**Deps:** 1.6.3

**Acceptance:**
- [ ] `getDocument(id, requestingUserId)` → returns document + ordered version array + signature info per version.
- [ ] Project scope enforced.
- [ ] Returns presigned URLs for download (15-minute expiry).

### Task 1.6.8 — DocumentCategory enum in contracts `[backend]`

**Files:** `packages/contracts/src/documents.ts` — re-export the Prisma enum and provide a Zod equivalent for input validation.

**Acceptance:** All document tRPC procedures accept the category via Zod validation.

### Task 1.6.9 — tRPC router: documents `[backend]`

**Files:**
- Create: `apps/web/server/routers/documents.ts`

**Deps:** 1.6.2–1.6.7

**Acceptance:**
- [ ] Procedures: `documents.create`, `.list`, `.get`, `.uploadVersion`, `.sign`, `.supersede`, `.getDownloadUrl`.
- [ ] All project-scoped via `projectProcedure`.
- [ ] Multipart upload via Next.js API route (not tRPC) for the file body — tRPC handles metadata only. Use a paired endpoint pattern: `POST /api/upload` returns a `fileKey`, then `documents.uploadVersion` references it.
- [ ] Integration tests against real DB + MinIO.

### Task 1.6.10 — Document library screen `[frontend]`

**Files:**
- Create: `apps/web/app/(app)/projects/[id]/documents/page.tsx`
- Create: `apps/web/components/documents/document-list.tsx`

**Deps:** 1.6.9

**Acceptance:**
- [ ] Lists documents in the current project with TanStack Table.
- [ ] Filters: category, status, search.
- [ ] Sticky header, CSV export.
- [ ] "Upload" button opens the upload widget (1.6.12).
- [ ] Each row links to the viewer (1.6.11).

### Task 1.6.11 — Document viewer screen `[frontend]`

**Files:**
- Create: `apps/web/app/(app)/projects/[id]/documents/[docId]/page.tsx`
- Create: `apps/web/components/documents/document-viewer.tsx`
- Create: `apps/web/components/documents/version-history.tsx`
- Create: `apps/web/components/documents/signature-panel.tsx`

**Deps:** 1.6.9

**Acceptance:**
- [ ] Shows current version metadata + download button (uses presigned URL).
- [ ] PDF preview via iframe (or `<object>`) for PDFs; download fallback for other types.
- [ ] Version history sidebar with sign / supersede actions where permitted.
- [ ] Signature panel shows current signature info (signer, time, hash).
- [ ] "Sign this version" button visible if user has permission and version is unsigned.
- [ ] "Upload new version (supersede)" button always visible if user has permission.

### Task 1.6.12 — Upload widget `[frontend]`

**Files:**
- Create: `apps/web/components/documents/upload-widget.tsx`

**Deps:** 1.6.9

**Acceptance:**
- [ ] Drag-and-drop or click-to-pick.
- [ ] Shows file name, size, mime type.
- [ ] Category dropdown.
- [ ] Title field.
- [ ] Submits to `/api/upload` then `documents.create` + `documents.uploadVersion`.
- [ ] Progress indicator.
- [ ] Error handling for storage failures.

### Task 1.6.13–1.6.16 — Integration tests `[test]`

**Files:** `packages/core/tests/documents/{lifecycle,immutability,supersession,filters}.test.ts`

**Acceptance:**
- [ ] Lifecycle: create → upload v1 → sign v1 → supersede with v2 → assert v1 is signed+superseded, v2 is current, both retrievable.
- [ ] Immutability: try to update a signed version through the service → rejected.
- [ ] Supersession: assert chain integrity, audit logs, reason captured.
- [ ] Filters: assert category filter works, assert cross-project isolation (user with project A cannot see project B documents).

### Task 1.6.17 — E2E: upload → sign → cannot edit `[test]`

**Files:** `apps/web/tests/e2e/document-sign-immutability.spec.ts`

**Acceptance:**
- [ ] Browser test signs in, opens project, uploads a PDF, signs it, tries to upload a "new file" with same version (rejected — must use supersede), supersedes successfully, asserts v1 still retrievable.

### Task 1.6.18 — E2E: cross-project isolation `[test]`

**Files:** `apps/web/tests/e2e/document-cross-project-isolation.spec.ts`

**Acceptance:**
- [ ] Two users, two projects. User A uploads to project A. User B tries to view → denied. User B switches to their assigned project B → no leak.

**Phase 1.6 exit criteria:**
- [ ] Full document lifecycle works end-to-end through UI.
- [ ] Signed versions immutable (verified through both service tests and E2E).
- [ ] Categories filter correctly.
- [ ] Cross-project isolation verified.
- [ ] Storage abstraction passes against real MinIO.
- [ ] CI green.

---

## Phase 1.7 — Posting Service Skeleton

**Goal:** A working centralized posting service. Module 1 has no financial tables yet, but the service is fully functional with idempotency, validation, exceptions, retry, and reversal — so Module 2 (which will issue `IPA_APPROVED` events) can plug in without changes. **The single most important invariant in the entire platform.**

**Dependencies:** Phase 1.3.
**Critical path:** parallel with 1.4, 1.5, 1.6 — but must complete before 1.10.
**Parallelizable:** independent of other parallel phases.
**Learning pauses:** none.
**Risks:** highest correctness risk in M1. Idempotency edge cases (retry storms), payload validation drift, reversal semantics. **All TDD.**

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.7.1 | `posting` service: event-type registry (Zod schemas) | backend | 1.3 | no |
| 1.7.2 | `posting` service: post() with idempotency | backend | 1.7.1 | no |
| 1.7.3 | `posting` service: failure → exception | backend | 1.7.2 | no |
| 1.7.4 | `posting` service: reverse() (additive reversal) | backend | 1.7.2 | no |
| 1.7.5 | `posting` service: exception retry + resolve | backend | 1.7.3 | no |
| 1.7.6 | `audit` service + `withOverride` helper | backend | 1.3 | yes |
| 1.7.7 | tRPC router: posting (admin only) | backend | 1.7.5 | no |
| 1.7.8 | Admin → Posting Exceptions screen | frontend | 1.7.7 | yes |
| 1.7.9 | Integration tests: happy path | test | 1.7.2 | yes |
| 1.7.10 | Integration tests: idempotency | test | 1.7.2 | yes |
| 1.7.11 | Integration tests: failure → exception → retry | test | 1.7.5 | yes |
| 1.7.12 | Integration tests: reversal additivity | test | 1.7.4 | yes |
| 1.7.13 | E2E: exception retry flow | test | 1.7.8 | no |

### Task 1.7.1 — Event-type registry `[backend]`

**Objective:** A registry mapping event types to their Zod payload schemas. Validates payloads at post time.

**Files:**
- Create: `packages/core/src/posting/event-registry.ts`
- Create: `packages/contracts/src/posting.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `EVENT_REGISTRY` is a `Record<EventType, ZodSchema>`.
- [ ] M1 ships with at least one test event type registered for testing: `TEST_EVENT_M1` with payload `{ amount: number, currency: string, description: string }`. **No real business event types in M1** — those land in M2/M3/M4.
- [ ] Function `getSchema(eventType)` returns the schema or throws `UnknownEventTypeError`.
- [ ] Function `validatePayload(eventType, payload)` validates and returns the parsed payload.
- [ ] Tests cover registered + unregistered + invalid payload.

**Notes:** When Module 2 lands, it adds entries to `EVENT_REGISTRY` for `IPA_APPROVED`, `IPC_SIGNED`, etc. The registry pattern keeps the posting service business-agnostic.

### Task 1.7.2 — `post()` with idempotency `[backend]`

**Objective:** The core entry point. Validates the payload, deduplicates by `idempotencyKey`, persists the event, returns. **TDD this thoroughly.**

**Files:**
- Create: `packages/core/src/posting/service.ts`
- Create: `packages/core/tests/posting/post.test.ts`

**Deps:** 1.7.1

**TDD sequence:**

- [ ] **Step 1: Failing test**

```typescript
// packages/core/tests/posting/post.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { postingService } from '../../src/posting';
import { setupTestDb } from '../setup/test-db';

describe('postingService.post', () => {
  beforeEach(async () => { await setupTestDb(); });

  it('persists a valid event with status "posted"', async () => {
    const result = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test',
      sourceRecordType: 'test',
      sourceRecordId: 'rec-1',
      projectId: 'proj-1',
      idempotencyKey: 'key-1',
      payload: { amount: 100, currency: 'SAR', description: 'test' },
    });
    expect(result.status).toBe('posted');
    expect(result.id).toBeDefined();
    expect(result.postedAt).toBeInstanceOf(Date);
  });

  it('returns the existing event on duplicate idempotency key (does not create a new row)', async () => {
    const first = await postingService.post({ /* same as above */ });
    const second = await postingService.post({ /* same as above, same key */ });
    expect(second.id).toEqual(first.id);
    // Assert only one row in DB:
    const count = await prisma.postingEvent.count({ where: { idempotencyKey: 'key-1' } });
    expect(count).toBe(1);
  });

  it('rejects an unknown event type', async () => { /* throws UnknownEventTypeError */ });
  it('rejects an invalid payload', async () => { /* throws ValidationError */ });
  it('writes an audit log entry on successful post', async () => { /* assert audit_logs row */ });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// packages/core/src/posting/service.ts
import { prisma } from '@fmksa/db';
import { auditService } from '../audit';
import { validatePayload, getSchema } from './event-registry';
import { UnknownEventTypeError, ValidationError } from './errors';

type PostInput = {
  eventType: string;
  sourceService: string;
  sourceRecordType: string;
  sourceRecordId: string;
  projectId: string;
  entityId?: string;
  idempotencyKey: string;
  payload: unknown;
  actorUserId?: string;
};

export const postingService = {
  async post(input: PostInput) {
    // 1. Validate event type and payload
    let parsed: unknown;
    try {
      parsed = validatePayload(input.eventType, input.payload);
    } catch (e) {
      // Try to record as failed event for traceability
      const event = await prisma.postingEvent.create({
        data: {
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId,
          idempotencyKey: input.idempotencyKey,
          payloadJson: input.payload as any,
          status: 'failed',
          failureReason: e instanceof Error ? e.message : String(e),
        },
      });
      await prisma.postingException.create({
        data: { eventId: event.id, reason: 'payload_validation_failed' },
      });
      throw new ValidationError(e instanceof Error ? e.message : 'Invalid payload');
    }

    // 2. Idempotency check
    const existing = await prisma.postingEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    // 3. Persist
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.postingEvent.create({
        data: {
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId,
          idempotencyKey: input.idempotencyKey,
          payloadJson: parsed as any,
          status: 'posted',
          postedAt: new Date(),
        },
      });
      await auditService.log({
        actorUserId: input.actorUserId ?? null,
        actorSource: input.actorUserId ? 'user' : 'system',
        action: 'posting_event_posted',
        resourceType: 'posting_event',
        resourceId: created.id,
        projectId: input.projectId,
        beforeJson: {},
        afterJson: { eventType: input.eventType, idempotencyKey: input.idempotencyKey },
      }, tx);
      return created;
    });

    return event;
  },
};
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit**

**Acceptance:**
- [ ] All test cases pass.
- [ ] Failed validation creates a `failed` event row + exception (so the operator can see it in admin).
- [ ] Successful post is in a transaction with the audit log write — both commit or both roll back.
- [ ] Idempotency duplicate is a no-op (returns existing event).

### Task 1.7.3 — Failure → exception `[backend]`

**Objective:** When `post()` succeeds at validation but fails downstream (e.g., FK violation, future module-specific check), the event row is marked `failed` and a `posting_exceptions` row is created.

**Files:** Modify `packages/core/src/posting/service.ts`, create `packages/core/src/posting/exceptions.ts`

**Deps:** 1.7.2

**Acceptance:**
- [ ] Catches downstream errors, updates event to `failed`, creates exception row, throws.
- [ ] Tests cover the path.

**Notes:** In Module 1 there is no downstream consumer, but the structure must be in place for M2+.

### Task 1.7.4 — Reversal `[backend]`

**Objective:** Additive reversal — never destructive.

**Files:**
- Create: `packages/core/src/posting/reversal.ts`
- Create: `packages/core/tests/posting/reversal.test.ts`

**Deps:** 1.7.2

**Acceptance:**
- [ ] `reverse({ originalEventId, reason, actorUserId })` → creates a NEW event with the same `eventType` + payload negated (caller-provided reverse semantics) + `status = 'reversed'` + `reversedByEventId = original.id` → updates the original event's `reversedByEventId` to point at the reversal → audit log.
- [ ] Reason required.
- [ ] Cannot reverse a `failed` or `pending` event.
- [ ] Cannot reverse an already-reversed event.
- [ ] Tests cover all paths.

### Task 1.7.5 — Exception retry + resolve `[backend]`

**Objective:** Allow Master Admin to retry a failed event or mark an exception as resolved.

**Files:**
- Modify: `packages/core/src/posting/exceptions.ts`

**Deps:** 1.7.3

**Acceptance:**
- [ ] `retryException(exceptionId, actorUserId)` → re-runs `post()` for the original payload → updates exception status → audit log.
- [ ] `resolveException(exceptionId, note, actorUserId)` → marks `resolvedAt`, `resolvedBy`, `resolutionNote` → audit log.
- [ ] Permission check: `posting.resolve_exception`.
- [ ] Tests cover both paths.

### Task 1.7.6 — `audit` service + `withOverride` helper `[backend]`

**Objective:** The audit service that all other services use to write logs, plus the `withOverride` wrapper that captures override actions in the dedicated `override_logs` table.

**Files:**
- Create: `packages/core/src/audit/service.ts`
- Create: `packages/core/src/audit/override.ts`
- Create: `packages/core/tests/audit/{service,override}.test.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `auditService.log(entry, tx?)` writes a row to `audit_logs`. Accepts optional Prisma transaction.
- [ ] `withOverride({ overrideType, reason, actorUserId, fn })` runs `fn`, then writes both the standard audit log and an `override_logs` row referencing it.
- [ ] If `overrideType` is in the `never` list (from override-policy.ts), throws `OverrideNotPermittedError`.
- [ ] If `overrideType` requires a second approver and no `approvedBy` is provided, throws `SecondApproverRequiredError`.
- [ ] Tests cover all paths.

**Notes:** This task lives in Phase 1.7 even though `audit` is its own service because the override helper is the natural counterpart to posting reversal — both deal with sensitive operations that must leave a trail.

### Task 1.7.7 — tRPC router: posting `[backend]`

**Files:**
- Create: `apps/web/server/routers/posting.ts`

**Deps:** 1.7.5

**Acceptance:**
- [ ] Procedures: `posting.events.list` (filterable), `.get`, `.exceptions.list`, `.exceptions.retry`, `.exceptions.resolve`. **No `.post` endpoint** — only services call `postingService.post()` directly. tRPC exposes admin/read operations only.
- [ ] All require `posting.view` or `posting.resolve_exception` permission.
- [ ] Integration tests.

### Task 1.7.8 — Admin → Posting Exceptions screen `[frontend]`

**Files:**
- Create: `apps/web/app/(app)/admin/posting-exceptions/page.tsx`
- Create: `apps/web/components/admin/posting-exception-list.tsx`
- Create: `apps/web/components/admin/posting-exception-detail.tsx`

**Deps:** 1.7.7

**Acceptance:**
- [ ] Lists open exceptions with filters by event type, project, age.
- [ ] Detail drawer shows event payload, failure reason, related audit logs.
- [ ] Retry button → calls `posting.exceptions.retry` → toast result.
- [ ] Resolve button → opens form (requires note) → calls `posting.exceptions.resolve`.

### Task 1.7.9–1.7.12 — Integration tests `[test]`

Files: `packages/core/tests/posting/{post,idempotency,exceptions,reversal}.test.ts`

**Acceptance:** All paths covered.

### Task 1.7.13 — E2E: exception retry `[test]`

**Files:** `apps/web/tests/e2e/posting-exception-retry.spec.ts`

**Acceptance:** Test creates a failed event, opens exceptions page, clicks retry, verifies success and audit trail.

**Phase 1.7 exit criteria:**
- [ ] Posting service fully tested and working with `TEST_EVENT_M1`.
- [ ] Idempotency rock-solid.
- [ ] Reversal additive.
- [ ] Exception queue + admin screen working.
- [ ] `withOverride` helper integrated with `override_logs` table.
- [ ] CI green.

---

## Phase 1.8 — Notifications

**Goal:** When workflow events fire (started, stepAssigned, approved, rejected) or a posting exception occurs, the right users get an in-app notification and (optionally) an email. User preferences are respected. Idempotency prevents double-sends.

**Dependencies:** Phase 1.5 (workflow events), Phase 1.7 (posting events), Phase 1.1 (BullMQ worker stub from `packages/jobs`).
**Critical path:** YES (consumes 1.5 events).
**Parallelizable:** service (1.8.1–1.8.5) and worker (1.8.6) can interleave; UI (1.8.7–1.8.9) follows.
**Learning pauses:** none.
**Risks:** BullMQ Redis flakiness (mitigated by retry config); template rendering errors crashing the worker (mitigated by try/catch + dead-letter queue); duplicate sends (mitigated by idempotency key per `(event, recipient, channel)`).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.8.1 | `notifications` service: template rendering | backend | 1.3 | yes |
| 1.8.2 | `notifications` service: notify() with idempotency | backend | 1.8.1 | no |
| 1.8.3 | `notifications` service: user preferences read/write | backend | 1.3 | yes |
| 1.8.4 | `notifications` service: in-app delivery | backend | 1.8.2 | no |
| 1.8.5 | BullMQ worker: email delivery (SES + SMTP/MailHog) | backend | 1.8.2 | no |
| 1.8.6 | Hook into workflow events (1.5.8) and posting exceptions (1.7) | backend | 1.5, 1.7, 1.8.4 | no |
| 1.8.7 | tRPC router: notifications | backend | 1.8.4 | no |
| 1.8.8 | Notifications screen (in-app list) | frontend | 1.8.7 | yes |
| 1.8.9 | Admin → Notification Templates screen | frontend | 1.8.7 | yes |
| 1.8.10 | Notification preferences in user profile | frontend | 1.8.7 | yes |
| 1.8.11 | Integration tests: lifecycle | test | 1.8.6 | yes |
| 1.8.12 | Integration tests: idempotency | test | 1.8.2 | yes |
| 1.8.13 | E2E: workflow event → notification visible | test | 1.8.8 | no |

### Task 1.8.1 — Template rendering `[backend]`

**Files:**
- Create: `packages/core/src/notifications/templates.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `renderTemplate(templateCode, payload)` returns `{ subject, body }`.
- [ ] Uses Handlebars with a tiny helper set (`{{name}}`, `{{date helper}}`).
- [ ] Throws `TemplateNotFoundError` for unknown codes.
- [ ] Throws `TemplateRenderError` on missing required fields.
- [ ] Tests cover happy path + missing fields.

### Task 1.8.2 — `notify()` with idempotency `[backend]`

**Files:**
- Create: `packages/core/src/notifications/service.ts`

**Deps:** 1.8.1

**Acceptance:**
- [ ] `notify({ templateCode, recipients: User[], payload, idempotencyKey, channels?: NotificationChannel[] })` → for each recipient × channel:
  - Check user preference → skip if disabled.
  - Check existing notification with same `(idempotencyKey, userId, channel)` → skip if exists.
  - Render template.
  - Create `notifications` row with `status = pending`.
  - For in-app: mark `status = sent` immediately.
  - For email: enqueue BullMQ job.
- [ ] Tests cover all branches.

### Task 1.8.3 — User preferences `[backend]`

**Files:**
- Create: `packages/core/src/notifications/preferences.ts`

**Deps:** Phase 1.3

**Acceptance:**
- [ ] `getPreferences(userId)` returns full preference set with defaults.
- [ ] `setPreference(userId, templateCode, channel, enabled)` upsert + audit.
- [ ] Tests cover.

### Task 1.8.4 — In-app delivery `[backend]`

**Files:** Modify `packages/core/src/notifications/service.ts`

**Deps:** 1.8.2

**Acceptance:**
- [ ] In-app notifications are written to the `notifications` table with `status = sent` immediately.
- [ ] `markAsRead(notificationId, userId)` updates `readAt` (only if owned by user).
- [ ] `listForUser(userId, { unreadOnly?, limit?, cursor? })` paginated.
- [ ] Tests cover.

### Task 1.8.5 — BullMQ email worker `[backend]`

**Files:**
- Create: `packages/jobs/src/workers/notifications.worker.ts`
- Create: `packages/core/src/notifications/delivery.ts`

**Deps:** 1.8.2

**Acceptance:**
- [ ] Worker subscribes to queue `notifications-email`.
- [ ] On job: loads notification by id, renders template (if not pre-rendered), sends via SMTP (MailHog locally, SES adapter in AWS).
- [ ] On success: updates notification `status = sent`, `sentAt = now`.
- [ ] On failure: BullMQ retry (3 attempts, exponential backoff), then move to DLQ + mark `status = failed`.
- [ ] Worker handles graceful shutdown.
- [ ] Tests cover happy path + failure path with a mock SMTP.

### Task 1.8.6 — Hook into events `[backend]`

**Files:**
- Create: `apps/web/server/event-handlers.ts`
- Modify: `apps/web/server/init.ts` (subscribes handlers on app boot)

**Deps:** 1.5, 1.7, 1.8.4

**Acceptance:**
- [ ] On `workflow.stepApproved` → notify all approvers of the next step (if any).
- [ ] On `workflow.approved` → notify the workflow starter.
- [ ] On `workflow.rejected` → notify the workflow starter.
- [ ] On `workflow.returned` → notify the workflow starter and the previous approver.
- [ ] On posting exception created → notify Master Admin role.
- [ ] Tests cover each handler.

### Task 1.8.7 — tRPC router: notifications `[backend]`

**Files:** `apps/web/server/routers/notifications.ts`

**Acceptance:** Procedures `notifications.list`, `.markRead`, `.markAllRead`, `.getPreferences`, `.setPreference`. Templates admin: `notifications.templates.list`, `.update`.

### Task 1.8.8 — Notifications screen `[frontend]`

**Files:**
- Create: `apps/web/app/(app)/notifications/page.tsx`
- Create: `apps/web/components/notifications/notification-list.tsx`
- Create: `apps/web/components/notifications/notification-bell.tsx` (top nav)

**Acceptance:**
- [ ] List with read/unread states.
- [ ] Click notification → navigate to source resource.
- [ ] "Mark all read" action.
- [ ] Bell icon in top nav with unread count badge (real-time-ish via polling or revalidation; no websockets in M1).

### Task 1.8.9 — Admin → Notification Templates screen `[frontend]`

**Files:** `apps/web/app/(app)/admin/notification-templates/page.tsx`

**Acceptance:**
- [ ] List + edit templates with subject/body fields and a preview (rendered with sample payload).

### Task 1.8.10 — Notification preferences in profile `[frontend]`

**Files:** Modify `apps/web/components/profile-form.tsx`

**Acceptance:**
- [ ] Per-template, per-channel toggles.
- [ ] Persists via `notifications.setPreference`.

### Task 1.8.11–1.8.12 — Integration tests `[test]`

**Files:** `packages/core/tests/notifications/{lifecycle,idempotency}.test.ts`

**Acceptance:** Cover all branches.

### Task 1.8.13 — E2E: workflow → notification `[test]`

**Files:** `apps/web/tests/e2e/notification-from-workflow.spec.ts`

**Acceptance:**
- [ ] Approve a workflow step. Verify the next approver receives an in-app notification AND an email captured by MailHog.

**Phase 1.8 exit criteria:**
- [ ] Notifications fire on workflow events and posting exceptions.
- [ ] Idempotency prevents duplicates.
- [ ] User preferences respected.
- [ ] In-app + email both work.
- [ ] Admin can edit templates.
- [ ] CI green.

---

## Phase 1.9 — Home + Command Palette + Nav Polish + Remaining Admin Screens

**Goal:** The platform feels cohesive. The home dashboard surfaces what matters, the command palette lets users jump anywhere, navigation is clean, empty states are helpful, and the remaining admin screens (System Health, Audit Log Viewer, Override Log) ship.

**Dependencies:** Phases 1.3, 1.4, 1.5, 1.6, 1.7, 1.8.
**Critical path:** YES.
**Parallelizable:** all UI tasks can be parallelized after the supporting tRPC endpoints (1.9.1, 1.9.12) land.
**Learning pauses:** none.
**Risks:** design polish drags out (mitigated by time-boxing each polish item to one commit and explicit "good enough" criteria).

### Tasks

| # | Task | Type | Deps | Parallel? |
|---|---|---|---|---|
| 1.9.1 | tRPC: home dashboard data aggregator | backend | 1.4, 1.5 | no |
| 1.9.2 | Home dashboard: my projects card | frontend | 1.9.1 | yes |
| 1.9.3 | Home dashboard: my approvals card | frontend | 1.9.1 | yes |
| 1.9.4 | Home dashboard: recent activity card (audit-driven) | frontend | 1.9.1 | yes |
| 1.9.5 | Home dashboard: notifications card | frontend | 1.8.7 | yes |
| 1.9.6 | Command palette component | frontend | — | yes |
| 1.9.7 | Command palette: project/document/admin actions | frontend | 1.9.6 | yes |
| 1.9.8 | Top nav with placeholder tabs (Commercial, Procurement, Materials, Contracts, Budget, Cashflow, Reports, PMO KPIs) | frontend | 1.3.16 | yes |
| 1.9.9 | Project switcher in header | frontend | 1.4.15 | yes |
| 1.9.10 | Empty-state polish across all screens | frontend | all | yes |
| 1.9.11 | tRPC: system health + jobs introspection | backend | 1.8 | no |
| 1.9.12 | Admin → System Health / Jobs screen | frontend | 1.9.11 | yes |
| 1.9.13 | Admin → Audit Log Viewer screen | frontend | 1.7.6 | yes |
| 1.9.14 | Admin → Override Log screen | frontend | 1.7.6 | yes |
| 1.9.15 | Design polish pass (spacing, typography, status chip palette) | frontend | all | no |
| 1.9.16 | E2E: home dashboard renders | test | 1.9.2–1.9.5 | yes |
| 1.9.17 | E2E: command palette navigation | test | 1.9.7 | yes |

### Task 1.9.1 — Home dashboard data aggregator `[backend]`

**Files:**
- Create: `apps/web/server/routers/home.ts`

**Deps:** 1.4, 1.5

**Acceptance:**
- [ ] `home.summary` query returns: `assignedProjects` (count + first 5), `pendingApprovals` (count + first 5), `recentActivity` (last 10 audit logs visible to the user, scoped by project assignment), `unreadNotifications` (count).
- [ ] All filters respect project scope.

### Tasks 1.9.2–1.9.5 — Home dashboard cards `[frontend]`

**Files:**
- Create: `apps/web/app/(app)/home/page.tsx`
- Create: `apps/web/components/home/{projects-card,approvals-card,activity-card,notifications-card}.tsx`

**Deps:** 1.9.1, 1.8.7

**Acceptance:**
- [ ] 4-card grid using shadcn/ui Card.
- [ ] Each card has a clear title, the most-relevant data, and a "View all" link to the full screen.
- [ ] Empty states are helpful: "No pending approvals — your queue is clear" not "No data".
- [ ] Cards load in parallel (not waterfall).

### Task 1.9.6 — Command palette component `[frontend]`

**Files:**
- Create: `apps/web/components/command-palette.tsx`

**Acceptance:**
- [ ] Built on `cmdk` library (shadcn/ui has a wrapper).
- [ ] Opens with `⌘K` / `Ctrl+K`.
- [ ] Focuses input, escape closes.
- [ ] Action groups: Projects, Documents, Admin, Quick Actions.

### Task 1.9.7 — Command palette actions `[frontend]`

**Files:** Modify `apps/web/components/command-palette.tsx`

**Acceptance:**
- [ ] Project actions: "Go to project: <name>" for each assigned project.
- [ ] Document search: type to search documents in the current project.
- [ ] Admin shortcuts: "Open Users", "Open Roles", etc. (only if admin permission).
- [ ] Quick actions: "Sign out", "Open profile", "Open my approvals".

### Task 1.9.8 — Top nav with placeholder tabs `[frontend]`

**Files:** Modify `apps/web/components/top-nav.tsx`

**Acceptance:**
- [ ] Active tabs: Home, My Approvals, Projects, Documents, Admin (admin only).
- [ ] Subtle, clean placeholder buttons for: Commercial, Procurement, Materials, Contracts Intelligence, Budget & Cost, Cashflow, Reports, PMO KPIs. Each opens a small "Coming in Module X" tooltip on hover. **Not noisy.**
- [ ] Avatar + user menu on the right.

### Task 1.9.9 — Project switcher `[frontend]`

**Files:**
- Create: `apps/web/components/project-switcher.tsx`

**Acceptance:**
- [ ] Dropdown in the top nav showing assigned projects + search.
- [ ] "Switch to project" sets a context value (URL-based, no client state).
- [ ] Recent projects shown first.

### Task 1.9.10 — Empty-state polish `[frontend]`

**Files:** Touch every list/screen to ensure helpful empty states.

**Acceptance:**
- [ ] Every list view has: an icon, a one-sentence explanation, a primary action (or info link if no action makes sense).
- [ ] No "No data" or "Empty" placeholder text anywhere.

### Task 1.9.11 — System health backend `[backend]`

**Files:**
- Create: `packages/core/src/system-health/service.ts`
- Create: `apps/web/server/routers/system-health.ts`

**Acceptance:**
- [ ] Returns: queue depths from BullMQ (per queue), failed job counts, last successful job timestamps, env summary (env name, app version, DB version, Redis version), DB connection count.
- [ ] Permission: `system.health`.

### Task 1.9.12 — Admin → System Health / Jobs `[frontend]`

**Files:** `apps/web/app/(app)/admin/system-health/page.tsx`

**Acceptance:**
- [ ] Shows queue health cards, failed job table, retry/cancel actions.
- [ ] Refreshes every 10 seconds (auto).
- [ ] Env info section.

### Task 1.9.13 — Admin → Audit Log Viewer `[frontend]`

**Files:** `apps/web/app/(app)/admin/audit-log/page.tsx`

**Acceptance:**
- [ ] TanStack Table with: actor, action, resource type, resource id, project, time.
- [ ] Filters: actor, resource type, project, date range.
- [ ] Detail drawer shows before/after JSON diff.
- [ ] CSV export.
- [ ] Permission: `audit.view`.

### Task 1.9.14 — Admin → Override Log `[frontend]`

**Files:** `apps/web/app/(app)/admin/override-log/page.tsx`

**Acceptance:**
- [ ] Same UX as audit log but filtered to override actions only.
- [ ] Shows override type, reason, second-approver if applicable, before/after.
- [ ] Permission: `audit.view` + Master Admin.

### Task 1.9.15 — Design polish pass `[frontend]`

**Acceptance:**
- [ ] Status chip colors consistent across all screens (per spec §8.3).
- [ ] Spacing rhythm consistent: 8/16/24/32px.
- [ ] All forms use the same submit-button position and loading state.
- [ ] All sheets/drawers use the same header pattern (title + close button).
- [ ] All toasts use the same pattern (success/error/info icons).
- [ ] One commit per polish theme (chips, spacing, forms, sheets, toasts).

### Task 1.9.16–1.9.17 — E2E `[test]`

**Files:** `apps/web/tests/e2e/{home-dashboard,command-palette}.spec.ts`

**Acceptance:** Home renders with all 4 cards; ⌘K opens palette; navigation via palette works.

**Phase 1.9 exit criteria:**
- [ ] App feels cohesive and credible.
- [ ] Home dashboard renders with real data.
- [ ] ⌘K palette functional.
- [ ] All admin screens shipped.
- [ ] Empty states helpful.
- [ ] CI green.

---

## Phase 1.10 — Tests + Docs + Sign-off

**Goal:** Module 1 is **done**. All critical E2E scenarios pass. Permission deny suite covers every protected procedure. Audit coverage suite verifies every mutating procedure writes audit. Documentation is complete. CDK dev stack synthesizes cleanly. The Definition of Done in the spec is met.

**Dependencies:** Phases 1.1–1.9.
**Critical path:** YES (final phase).
**Parallelizable:** test scenarios (1.10.1–1.10.17) can be parallelized; docs (1.10.20–1.10.24) can be parallelized.
**Learning pauses:** none.
**Risks:** flaky E2E tests (mitigated by deterministic seed + isolated DB per test); CDK synth fails in CI runner (mitigated by committing `cdk.context.json`).

### Tasks

| # | Task | Type | Deps |
|---|---|---|---|
| 1.10.1 | E2E Scenario 1: sign-in + scoped project visibility | test | 1.3, 1.4 |
| 1.10.2 | E2E Scenario 2: unassigned project denied | test | 1.3 |
| 1.10.3 | E2E Scenario 3: full user setup flow | test | 1.4 |
| 1.10.4 | E2E Scenario 4: workflow template + instance + approve | test | 1.5 |
| 1.10.5 | E2E Scenario 5: document upload + sign | test | 1.6 |
| 1.10.6 | E2E Scenario 6: signed version edit rejected | test | 1.6 |
| 1.10.7 | E2E Scenario 7: override writes audit + override log | test | 1.7.6 |
| 1.10.8 | E2E Scenario 8: posting idempotency | test | 1.7 |
| 1.10.9 | E2E Scenario 9: posting exception resolved | test | 1.7 |
| 1.10.10 | E2E Scenario 10: PMO read-only | test | 1.4, 1.5, 1.6 |
| 1.10.11 | E2E Scenario 11: supersession | test | 1.6 |
| 1.10.12 | E2E Scenario 12: effective-dated role activation | test | 1.3, 1.4 |
| 1.10.13 | E2E Scenario 13: document categories | test | 1.6 |
| 1.10.14 | E2E Scenario 14: cross-project document isolation | test | 1.6 |
| 1.10.15 | E2E Scenario 15: role permission change takes effect immediately | test | 1.3, 1.4 |
| 1.10.16 | E2E Scenario 16: workflow event → notification | test | 1.5, 1.8 |
| 1.10.17 | E2E Scenario 17: posting exception retry | test | 1.7 |
| 1.10.18 | Audit coverage test suite | test | all |
| 1.10.19 | Permission deny test suite (full) | test | all |
| 1.10.20 | Architecture README | docs | all |
| 1.10.21 | Local setup guide | docs | 1.1 |
| 1.10.22 | Migration guide | docs | 1.2 |
| 1.10.23 | Permissions guide | docs | 1.3 |
| 1.10.24 | Module boundary notes | docs | all |
| 1.10.25 | CDK dev stack: synth + dry-run deploy validation | infra | 1.1.13 |
| 1.10.26 | CI: full test run green | test | all |
| 1.10.27 | Module 1 sign-off checklist | docs | all |

### Tasks 1.10.1–1.10.17 — E2E scenarios `[test]`

**Files:** `apps/web/tests/e2e/scenario-<NN>-<name>.spec.ts` (one file per scenario)

**Acceptance per scenario:**
- [ ] Scenario file exists and runs in CI.
- [ ] Each scenario follows the spec §9.2 description exactly.
- [ ] Each scenario uses isolated test DB (per-suite testcontainer).
- [ ] Each scenario asserts both UI behavior and DB state.

### Task 1.10.18 — Audit coverage test suite `[test]`

**Objective:** Programmatically verify that every mutating service method writes an audit log entry.

**Files:**
- Create: `packages/core/tests/audit-coverage.test.ts`

**Acceptance:**
- [ ] Iterates every public method of every service in `packages/core` that mutates state.
- [ ] For each, runs the method, asserts at least one audit log row was created with the matching `resourceType`.
- [ ] Uses a small registry of "expected to mutate" methods to avoid false positives from query methods.

**Notes:** This is a meta-test. Maintain the registry as new services are added.

### Task 1.10.19 — Permission deny test suite (full) `[test]`

**Objective:** Every protected tRPC procedure has a corresponding deny test.

**Files:** Modify `apps/web/tests/permission-deny.test.ts`

**Acceptance:**
- [ ] At least one deny test per protected tRPC procedure.
- [ ] Tests use `unauthenticatedCaller` + `userNotAssignedCaller` + `pmoCaller` (for write paths).
- [ ] Asserts `TRPCError` with code `UNAUTHORIZED` or `FORBIDDEN`.
- [ ] Asserts an audit log entry was written for each deny.

### Task 1.10.20 — Architecture README `[docs]`

**Files:** `README.md` (root)

**Acceptance:**
- [ ] One-page architecture overview with the layered diagram.
- [ ] Tech stack table.
- [ ] Repo structure tree.
- [ ] Links to spec + this plan + setup guide.

### Task 1.10.21 — Local setup guide `[docs]`

**Files:** `docs/setup/local-development.md`

**Acceptance:**
- [ ] Step-by-step from `git clone` to `pnpm dev`.
- [ ] Prerequisites + verification commands.
- [ ] Troubleshooting section (Docker not running, port conflicts, Prisma client out of date).

### Task 1.10.22 — Migration guide `[docs]`

**Files:** `docs/database/migrations.md`

**Acceptance:**
- [ ] How to add a migration (`prisma migrate dev`).
- [ ] How migrations are applied in CI.
- [ ] How to rebase migrations safely.
- [ ] How to roll back (and when not to).

### Task 1.10.23 — Permissions guide `[docs]`

**Files:** `docs/access-control/permissions.md`

**Acceptance:**
- [ ] Lists all permission codes (auto-generated from seed).
- [ ] Describes each role and its default permissions.
- [ ] Explains screen permissions and project overrides.
- [ ] Override policy explained in plain language.

### Task 1.10.24 — Module boundary notes `[docs]`

**Files:** `docs/architecture/module-boundaries.md`

**Acceptance:**
- [ ] Explains the contract surface that Modules 2–7 will consume (per spec §12).
- [ ] Lists "do not change without coordinated migration" interfaces.
- [ ] Documents the schema extension pattern (`metadata_json` columns).

### Task 1.10.25 — CDK dev stack validation `[infra]`

**Files:** Modify `infra/cdk/lib/*.ts`

**Acceptance:**
- [ ] All 7 stacks have populated resources matching the spec §5.3.
- [ ] `cdk synth` succeeds with no errors.
- [ ] `cdk diff` against an empty environment shows the expected resources.
- [ ] `cdk deploy --all --profile fmksa-dev --require-approval never --hotswap-fallback false` is documented but **not run** in M1 (deferred until Ahmed authorizes deployment).

### Task 1.10.26 — CI: full test run `[test]`

**Acceptance:**
- [ ] CI pipeline runs lint + typecheck + unit + integration + E2E + build.
- [ ] All green on `main` after Phase 1.10 merge.
- [ ] CI run time documented (no estimate of "should be X minutes" — just record what it actually is).

### Task 1.10.27 — Module 1 sign-off checklist `[docs]`

**Files:** `docs/superpowers/specs/2026-04-09-module-1-sign-off.md`

**Acceptance:**
- [ ] Re-confirms every item from spec §15 (Definition of Done).
- [ ] Lists what was built vs. what was deferred (with reasons).
- [ ] Lists all 5 learning-mode contributions Ahmed made (commit refs).
- [ ] Lists known issues + assumptions for Module 2 to inherit.
- [ ] Ahmed's sign-off line at the bottom.

**Phase 1.10 exit criteria:**
- [ ] All E2E scenarios pass.
- [ ] Permission deny suite covers every protected procedure.
- [ ] Audit coverage suite green.
- [ ] All docs written.
- [ ] CDK dev stack synthesizes cleanly.
- [ ] CI green on `main`.
- [ ] Sign-off checklist signed by Ahmed.

---

## Definition of Done for Module 1

Module 1 is **done** when all of the following are true. These mirror spec §15.

- [ ] All 10 phases complete with phase exit criteria met.
- [ ] All critical E2E scenarios listed in spec §9.2 pass in CI.
- [ ] Permission deny suite: 100% of protected tRPC procedures tested for unauthorized access.
- [ ] Audit coverage suite: 100% of mutating procedures verified to write audit entries.
- [ ] `packages/core` test coverage ≥ 80% statements and branches.
- [ ] CDK dev stack synthesizes cleanly and `cdk diff` passes.
- [ ] Docker Compose local dev stack starts end-to-end with `pnpm dev`.
- [ ] Documentation complete: architecture README, local setup guide, migration guide, permissions guide, module boundary notes.
- [ ] Ahmed has completed all 5 learning-mode contribution points.
- [ ] Module 2 (Commercial / Contracts Engine) spec can be written against this foundation without surprises.
- [ ] CI green on `main`.
- [ ] Module 1 sign-off checklist signed by Ahmed.

---

## Execution Handoff

When you (Ahmed) approve this plan, the next step is to start executing it. Two execution options exist:

**1. Subagent-Driven (recommended)** — A fresh subagent is dispatched per task. Each subagent gets the relevant slice of this plan + the spec, executes the task in isolation, returns a summary, and the orchestrator (me) reviews before merging to the phase branch. Pros: cleaner context per task, easier parallelism, lower risk of context pollution. Cons: slightly more overhead per task.

**2. Inline Execution** — All tasks executed in the current session sequentially with checkpoint reviews. Pros: tighter feedback loop. Cons: one big context that risks pollution and rate limits.

You don't need to decide now — I'll ask after you approve the plan.










