# Module 1 — Shared Core Platform — Design

**Project:** Pico Play Fun Makers KSA — Internal Operations Platform
**Module:** 1 of 7 — Shared Core Platform
**Date:** 2026-04-09
**Owner:** Ahmed Al-Dossary (Project Director, Pico Play)
**Status:** Draft — pending spec review and final approval
**Target build order:** Module 1 → 2 (Commercial) → 3 (Procurement) → 4 (Budget/Cost/Cashflow) → 5 (KPI/PMO) → 6 (Contract Intelligence) → 7 (Agent Layer & Admin Enhancements)

---

## 1. Executive Summary

Module 1 delivers the **shared foundation** on which every business module (Commercial, Procurement, Budget, KPI, Contract Intelligence, Agents) will be built. It is **not** an "empty shell"; it ships as a real, usable internal product for project teams on day one, providing working project workspaces, document control, workflow-driven approvals on stub records, admin control, notifications, audit visibility, and a centralized posting service skeleton.

This module establishes the non-negotiable engineering and product invariants that the entire platform will rely on:

- **Project isolation** is enforced at the service boundary, not by convention.
- **Signed records are immutable**, enforced in code.
- **Every financial or KPI effect** flows through a single centralized posting service — no exceptions.
- **Critical records cannot be hard-deleted**; audit and posting trails are append-only.
- **Master Admin override** is possible but requires reason capture and full audit.
- **AI/agents support users**, they do not bypass authority.

The UX target is "serious operational platform, light to use" — not a cluttered ERP, not a fragile admin panel. Clean, modern, fast.

---

## 2. Context & Goals

### 2.1 Business context

Pico Play delivers large-scale themed entertainment and construction projects in Saudi Arabia. Project teams (Project Directors, Project Managers, Site, Design, QA/QC, Commercial, Procurement, Finance, Cost Control, Document Control, PMO, Executive Approvers, Master Admins) currently operate across disconnected tools. The platform must unify internal approvals, workflow, commercial, procurement, document control, budget, cashflow, KPI, and contract intelligence under one shared architecture.

### 2.2 Module 1 goals

1. Establish the shared architecture, repo, and tooling every later module depends on.
2. Ship auth, access control, project isolation, workflow engine, document control, posting skeleton, audit, and notifications.
3. Deliver a usable experience: sign in → see your projects → upload/sign documents → run approvals → view audit → manage users — all without any business-specific module.
4. Make the platform deployable to AWS me-south-1 with four environments (Dev, QA/Test, Staging/UAT, Production) without requiring a rewrite.
5. Leave clean, typed extension points for Modules 2–7.

### 2.3 Non-goals for Module 1

- No business-module-specific services (Commercial, Procurement, Budget, KPI, Contract Intelligence, Agents).
- No visual workflow designer (form-based JSON admin only).
- No real third-party e-signature integration (DocuSign/Adobe Sign) — internal sign intent with hash capture only.
- No TOTP/WebAuthn MFA — hook-point stubbed.
- No corporate SSO (Azure AD / Google Workspace / Okta) — Auth.js v5 provider slot exists but is not wired in M1.
- No Arabic/RTL content — infra wired, translations arrive later.
- No staging/production AWS stack — only local Docker Compose and a deployable dev CDK stack.
- No load tests, chaos tests, or security pen-tests.

---

## 3. Non-Negotiable Principles

These apply to Module 1 and every later module. They are not adjustable without explicit Project Director approval.

1. Internal-only system. No public access, no external users.
2. Project isolation is a hard rule, enforced in code, not by convention.
3. PMO gets KPI/report visibility only, never unrestricted project editing.
4. Only Project Director can approve cross-project transfers (later module — M1 reserves the hook).
5. Project Manager can only reallocate within the same project (M4).
6. All reallocations and transfers require mandatory reason notes and permanent history.
7. Posting is centralized. Business services never mutate financial/KPI state directly.
8. Signed records are immutable.
9. No hard delete for critical records.
10. All critical actions are auditable with actor, source, action, before/after, reason, and project context.
11. AI and agents support users and never bypass authority, auto-approve, auto-sign, or silently overwrite posted values.
12. Master Admin override actions require confirmation, reason, and full audit.
13. Every override writes a dedicated override log entry, visible to Master Admin independently of the main audit log.

---

## 4. Scope

### 4.1 In scope for Module 1

- Monorepo scaffolding (pnpm + Turborepo)
- Next.js 15 App Router application with tRPC v11 API layer
- PostgreSQL 16 via Prisma 5
- Ten core domain services (listed in §6.1)
- Full Prisma schema and migrations for the core domain
- Seed data (roles, permissions, reference data, sample entity, sample project, Master Admin)
- Auth.js v5 with email/password and MFA hook-point
- Project scope middleware and screen permission enforcement
- Workflow engine (generic, record-type agnostic, JSON templates)
- Document library with versioning, signature, supersession, and category support
- Posting service skeleton with idempotency and exception queue
- Audit and override logging
- Notifications (in-app + email via SES/MailHog)
- 21 core screens (listed in §9.1)
- Testing scaffolding (Vitest, Playwright, testcontainers) and full test suites for M1 functionality
- Docker Compose local dev stack
- AWS CDK dev stack (TypeScript) — stamped and deployable, not yet deployed
- GitHub Actions CI skeleton
- Documentation (README, local setup, migration guide, permissions guide, module boundary notes)

### 4.2 Out of scope for Module 1 (explicitly deferred)

| Item | When it lands |
|---|---|
| Commercial engine (IPA, IPC, VO, letters, claims, back charges, tax invoices) | Module 2 |
| Procurement engine (RFQ, supplier invoices, expenses, equipment, contracts) | Module 3 |
| Budget, cost, cashflow, reallocations, transfers | Module 4 |
| KPI dashboards, PMO rollups, project health scores | Module 5 |
| OCR, contract parser, clause extraction, letter analysis | Module 6 |
| Intake/extraction/validation/reporting/admin agents | Module 7 |
| Visual workflow designer | Module 7 or later |
| Real e-signature provider integration | Post-M2, pending procurement decision |
| TOTP / WebAuthn MFA implementation | Hardening phase before production cutover |
| Corporate SSO provider | Hardening phase |
| Arabic/RTL translations | Post-M3 content freeze |
| Staging/production AWS stacks | Stamped during Module 2 |

---

## 5. Architecture Overview

### 5.1 Application architecture

**Modular monolith**, shipped as a Next.js 15 App Router application with tRPC v11 as the typed API layer. Domain logic lives in `packages/core/` as isolated services communicating through typed interfaces. No microservices in M1.

The monolith is designed for **future extraction**: each domain service has clean boundaries, no shared mutable state, and all cross-service communication is explicit. When (if) the platform needs to scale horizontally per service, extraction to a separate deployable is a mechanical refactor, not a rewrite.

### 5.2 Technology stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 App Router + React 19 | Full-stack TypeScript, server components, server actions, mature tooling |
| API layer | tRPC v11 | End-to-end type safety, zero codegen, aligns with modular monolith |
| Language | TypeScript 5.x (strict) | Shared types across FE/BE, compile-time guarantees |
| DB | PostgreSQL 16 | Specification mandate, transactional, battle-tested |
| ORM | Prisma 5 | Reliable migrations, type-safe queries, middleware for invariant enforcement |
| Auth | Auth.js v5 (NextAuth) | Standard, extensible, supports sessions + future SSO providers |
| Access control | Custom layer on top of Auth.js | Business-specific authority rules live in `packages/core/access-control` |
| UI | Tailwind CSS + shadcn/ui + Radix | Clean, professional, accessible primitives, not flashy |
| Forms | React Hook Form + Zod | Type-safe validation, same Zod schemas shared with tRPC |
| Tables | TanStack Table v8 | Industry standard for data-dense lists |
| Charts | Recharts | Dashboard-appropriate, not flashy |
| Queues | BullMQ on Redis | Retry/DLQ, priority, delayed jobs, production-grade |
| File storage | S3-compatible abstraction | MinIO locally, AWS S3 on deploy, swappable |
| i18n | next-intl (wired day 1, English-first) | Arabic/RTL added later without refactor |
| Testing | Vitest (unit/integration) + Playwright (E2E) + testcontainers | Fast, typed, modern, real DB in integration |
| Logging | Pino (structured JSON) | Production-grade, CloudWatch-friendly |
| Validation | Zod | Shared schemas on client + server, composable |
| IaC | AWS CDK (TypeScript) | Matches codebase language, cleanest for teams already in TS |
| CI/CD | GitHub Actions | Standard, free for private repos at small scale |
| Monorepo | pnpm workspaces + Turborepo | Fast, simple, good caching |

### 5.3 Hosting & environments

**Primary hosting:** AWS me-south-1 (Bahrain) for KSA data residency.

**Environments:** Dev, QA/Test, Staging/UAT, Production.

| Concern | Local dev | AWS (dev/qa/staging/prod) |
|---|---|---|
| Compute | Next.js `pnpm dev` + worker node process | ECS Fargate — two services: `web` (ALB-fronted) and `worker` (BullMQ, private) |
| Database | Postgres in Docker | RDS Postgres 16 — single-AZ dev/qa, Multi-AZ staging/prod, PITR prod |
| Cache/queue | Redis in Docker | ElastiCache Redis — small nodes dev/qa, cluster mode staging/prod |
| Files | MinIO in Docker | S3 bucket per env, versioning on, SSE-S3, signed URLs only |
| Secrets | `.env.local` (never committed) | AWS Secrets Manager + Parameter Store |
| Email | MailHog (local SMTP capture) | AWS SES (me-south-1 if supported, eu-south-1 fallback) |
| Logs | Pino pretty to console | CloudWatch Logs via awslogs driver + Logs Insights |
| Monitoring | — | CloudWatch Alarms (CPU/mem/5xx/queue depth/DB conns) → SNS email |
| Backups | — | RDS automated backups; S3 versioning; weekly snapshot export to Glacier (prod) |
| DNS/TLS | localhost | Route53 + ACM |
| CI/CD | — | GitHub Actions → ECR → ECS service update, env-gated deployments |

**Module 1 infra deliverable is intentionally thin:** Docker Compose for local dev, and a CDK `dev` stack that deploys cleanly when ready. Staging/prod CDK stacks are stamped out during Module 2 when load is real.

### 5.4 Repo layout

```
fun-makers-ksa/
├── apps/
│   └── web/                        # Next.js 15 App Router (UI + tRPC API routes)
│       ├── app/                    # App Router routes and pages
│       ├── components/             # Page-level components
│       ├── server/                 # tRPC routers, server actions
│       └── tests/                  # Playwright E2E suites
├── packages/
│   ├── db/                         # Prisma schema, migrations, seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/seed/
│   ├── core/                       # Domain services (the heart of the platform)
│   │   └── src/
│   │       ├── auth/
│   │       ├── access-control/
│   │       ├── projects/
│   │       ├── entities/
│   │       ├── reference-data/
│   │       ├── workflow/
│   │       ├── documents/
│   │       ├── posting/
│   │       ├── audit/
│   │       └── notifications/
│   ├── contracts/                  # Shared TypeScript types + Zod schemas (API contracts)
│   ├── ui/                         # Shared component library (shadcn/ui based)
│   ├── config/                     # ESLint, TS, Tailwind presets
│   └── jobs/                       # BullMQ workers (notifications, posting retries, future OCR/agents)
├── infra/
│   ├── docker/                     # docker-compose.yml (Postgres, Redis, MinIO, MailHog)
│   └── cdk/                        # AWS CDK TypeScript stacks (dev first)
├── docs/
│   └── superpowers/specs/          # Design docs (this file and future module specs)
├── tests/
│   └── e2e/                        # Cross-app Playwright suites
├── .github/
│   └── workflows/                  # CI pipelines
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 6. Domain Model

### 6.1 Core services

Ten services live in `packages/core/`. Each has a clean boundary, a documented public interface, and its own tests.

| # | Service | Responsibility | Key invariants |
|---|---|---|---|
| 1 | **auth** | Sessions, login, logout, password policy, MFA hook-point, password reset | Session rotation on privilege change, no plaintext passwords, failed-login lockout |
| 2 | **access-control** | Roles, permissions, screen permissions (with per-project overrides), project assignments, override authority, cross-project read rules | Deny-by-default, project scope always checked, permissions are additive never subtractive |
| 3 | **projects** | Project lifecycle, workspace metadata, project settings (supports workflow toggles and future material/procurement tracking flags) | Only Master Admin creates projects; assignments are effective-dated |
| 4 | **entities** | Parent/subsidiary/sister/branch/operating-unit/shared-service-entity model with self-reference | Hierarchy integrity, effective-dated changes, extensible type system |
| 5 | **reference-data** | Countries, currencies, app settings, static enumerations, configurable status dictionaries | Single source of truth for static data; avoids polluting project/admin logic |
| 6 | **workflow** | Workflow templates, instances, steps, actions, SLA tracking, approver resolution | Generic and record-type agnostic; signed/completed actions immutable; instance actions append-only |
| 7 | **documents** | Upload, versioning, supersession, signature foundation, category tagging (shop drawing, material submittal, test certificate, contract attachment, vendor document, general) | Signed versions immutable; supersession is explicit (new version row); file hash stored; category extensible |
| 8 | **posting** | **The only service allowed to mutate financial/KPI state.** Posting events in, validated posts out, idempotency keys, reversal primitive, exception queue | No direct dashboard mutation; reversals additive; duplicate events rejected; failed posts → exception queue |
| 9 | **audit** | Append-only audit log writer with actor, source, action, before/after, reason, project context | Never updated, never deleted; every override writes audit; override log is a filtered view |
| 10 | **notifications** | In-app and email fan-out, templated, per-user preferences, idempotent per (event, recipient) | Respects user preferences; no duplicate sends for same event |

### 6.2 Data model (Prisma schema, ~30 core tables)

All tables use UUID primary keys. Transactional tables have `created_at` and `updated_at`. Soft delete (`deleted_at`) is allowed only on explicitly whitelisted tables; `audit_logs`, `posting_events`, `workflow_actions`, and `document_signatures` reject deletion entirely.

```
-- identity & access
users                 (id, email UNIQUE, name, password_hash, mfa_secret_nullable, status, last_login_at, failed_login_count, locked_until, created_at, updated_at)
departments           (id, code UNIQUE, name, description)
roles                 (id, code UNIQUE, name, description, is_system, created_at, updated_at)
permissions           (id, code UNIQUE, description, resource, action)
role_permissions      (role_id, permission_id, PRIMARY KEY composite)
user_roles            (id, user_id, role_id, effective_from, effective_to_nullable, assigned_by, assigned_at)
user_sessions         (id, user_id, token_hash UNIQUE, ip, user_agent, expires_at, revoked_at_nullable)

-- screen-level permissions (with project overrides)
screen_permissions    (id, role_id, screen_code, can_view, can_edit, can_approve, project_id_nullable, created_at)
  -- project_id NULL = role-level default; non-null = project-specific override

-- multi-entity
entities              (id, code UNIQUE, name, type, parent_entity_id_nullable, status, metadata_json, created_at, updated_at)
  -- type: parent | subsidiary | sister_company | branch | operating_unit | shared_service_entity

-- projects & scoping
projects              (id, code UNIQUE, name, entity_id, status, currency_code, start_date, end_date_nullable, created_by, created_at, updated_at)
project_assignments   (id, project_id, user_id, role_id, effective_from, effective_to_nullable, assigned_by, assigned_at, revoked_at_nullable, revoked_by_nullable, reason_nullable)
project_settings      (project_id, key, value_json, updated_at, updated_by)
  -- PK (project_id, key). Keys include workflow_toggles, material_tracking_flags, procurement_flags, etc.

-- workflow engine (generic)
workflow_templates    (id, code UNIQUE, name, record_type, version, is_active, config_json, created_by, created_at)
  -- config_json includes requirement flags that will drive material/procurement/doc workflows in later modules
workflow_steps        (id, template_id, order_index, name, approver_rule_json, sla_hours, is_optional, requirement_flags_json)
workflow_instances    (id, template_id, record_type, record_id, project_id, status, current_step_id_nullable, started_by, started_at, completed_at_nullable)
workflow_actions      (id, instance_id, step_id, actor_user_id, action, comment_nullable, acted_at, metadata_json)
  -- APPEND-ONLY; no updates, no deletes

-- documents & versions
documents             (id, project_id, record_type_nullable, record_id_nullable, title, category, status, current_version_id_nullable, created_by, created_at, updated_at)
  -- category: shop_drawing | material_submittal | test_certificate | contract_attachment | vendor_document | general | letter | drawing | specification
document_versions     (id, document_id, version_no, file_key, file_hash, file_size, mime_type, uploaded_by, uploaded_at, is_signed, signed_at_nullable, signed_by_nullable, superseded_at_nullable, superseded_by_version_id_nullable)
  -- is_signed=true → Prisma middleware rejects updates
document_signatures   (id, version_id, signer_user_id, signature_type, signed_at, ip, user_agent, hash_at_sign)
  -- APPEND-ONLY

-- posting (centralized)
posting_events        (id, event_type, source_service, source_record_type, source_record_id, project_id, entity_id, idempotency_key UNIQUE, payload_json, status, posted_at_nullable, reversed_by_event_id_nullable, failure_reason_nullable, created_at)
  -- status: pending | posted | reversed | failed
posting_exceptions    (id, event_id, reason, assigned_to_nullable, resolved_at_nullable, resolved_by_nullable, resolution_note_nullable, created_at)

-- audit (append-only)
audit_logs            (id, actor_user_id_nullable, actor_source, action, resource_type, resource_id, project_id_nullable, before_json, after_json, reason_nullable, ip_nullable, user_agent_nullable, created_at)
  -- actor_source: user | system | agent | job
  -- NEVER updated, NEVER deleted
override_logs         (id, audit_log_id, override_type, overrider_user_id, reason, before_json, after_json, approved_by_nullable, created_at)
  -- A filtered, denormalized view of audit_logs rows where an override occurred. Materialized on write for fast admin visibility.

-- notifications
notification_templates (id, code UNIQUE, channel, subject_template, body_template, default_enabled, created_at, updated_at)
notifications         (id, user_id, template_code, payload_json, channel, status, sent_at_nullable, read_at_nullable, created_at)
notification_preferences (user_id, template_code, channel, enabled, PRIMARY KEY composite)

-- reference
countries             (code PRIMARY KEY, name, iso3, phone_prefix)
currencies            (code PRIMARY KEY, name, symbol, decimal_places)
app_settings          (key PRIMARY KEY, value_json, updated_at, updated_by)
status_dictionaries   (id, dictionary_code, status_code, label, order_index, color_hint, is_terminal)
  -- Seeds for future module status sets (material statuses, shop drawing statuses, fabrication statuses, etc.)
```

### 6.3 Indexes

At minimum:
- `users(email)` — unique
- `user_sessions(token_hash)` — unique
- `user_sessions(user_id, expires_at)`
- `project_assignments(project_id, user_id, effective_from, effective_to)`
- `workflow_instances(project_id, status)`
- `workflow_instances(current_step_id)`
- `workflow_actions(instance_id, acted_at)`
- `documents(project_id, category)`
- `document_versions(document_id, version_no)` — unique
- `posting_events(idempotency_key)` — unique
- `posting_events(project_id, event_type, status)`
- `audit_logs(resource_type, resource_id, created_at)`
- `audit_logs(project_id, created_at)`
- `notifications(user_id, status, created_at)`

---

## 7. Key Subsystem Designs

### 7.1 Access control & project isolation

**Project scope middleware** wraps every tRPC procedure. Each procedure declares its scope at definition time:

```
procedure.input(...).scope('project').query(...)
procedure.input(...).scope('global').query(...)   // admin only
procedure.input(...).scope('cross-project').query(...)  // requires explicit permission
```

The middleware:
1. Resolves the caller's session and role set.
2. Resolves the target `project_id` from procedure input.
3. Verifies there is an active `project_assignment` for (user, project, role) at `now()`.
4. Verifies the user's effective screen permissions allow the action.
5. If the procedure is scoped `cross-project`, verifies the user has the `cross_project_read` permission (Master Admin, PMO, or explicit grant).
6. Writes an access-denied audit log entry if denied, with clear error to caller ("You don't have access to this project" — never technical jargon).

**Screen permission model:**
- `screen_permissions` stores role-level defaults when `project_id` is null.
- A row with a specific `project_id` overrides the default for that project only.
- Effective permission = project override if present, else role default.

**Effective-dated assignments:**
- `project_assignments.effective_from` is the activation time.
- `effective_to` is nullable; a null means "indefinite until revoked".
- Future-dated assignments don't grant access until their `effective_from` passes.
- Revocations set `revoked_at` and `revoked_by` and require a `reason` — the row is never deleted.

### 7.2 Workflow engine

**Generic, record-type agnostic.** The engine has no knowledge of IPA, IPC, RFQ, or any other business record type. It operates on:
- **Templates** — named workflows tied to a `record_type` string (e.g., `"document.approve"` in M1; `"ipa.approve"` in M2).
- **Steps** — ordered, each with an approver rule (role, specific user, or dynamic expression) and SLA.
- **Instances** — one per record, tracking current step, status, and history.
- **Actions** — append-only log of what happened at each step (approved, rejected, returned, commented).

**Requirement flags.** Templates carry a `config_json` and each step carries a `requirement_flags_json`. These are opaque to the engine — they're passed back to the caller for module-specific logic. In Module 1 the engine reads them but doesn't act on them; Modules 3 and later will use them to drive material workflow toggles (requires PM review, requires QA/QC review, etc.).

**Status vocabulary (generic):** `draft`, `in_progress`, `returned`, `approved`, `rejected`, `cancelled`, `completed`, `on_hold`. Business-specific statuses (material submittal statuses, fabrication statuses) live in `status_dictionaries` and are read by business modules, not the workflow engine.

**Admin UI in M1:** form-based JSON template editor with validation. Not a visual designer. Functional, not pretty — admins fill in fields, save, and test on a stub record.

### 7.3 Document model & signatures

**Documents belong to a project.** Optionally linked to a specific `record_type` and `record_id` for deep-linking back to the business record in later modules.

**Categories** (extensible enum) include:
- `shop_drawing`
- `material_submittal`
- `test_certificate`
- `contract_attachment`
- `vendor_document`
- `letter`
- `drawing`
- `specification`
- `general`

**Versioning:**
- Every upload creates a new `document_versions` row.
- `current_version_id` on the parent `documents` row points at the active version.
- Versions carry file key (S3/MinIO), file hash (SHA-256), size, mime type, uploader, upload time.
- A version can be `signed` — this captures signer, time, IP, user agent, and the file hash at the moment of signing.

**Immutability enforcement:** a Prisma middleware rejects any `update` on a `document_versions` row where `is_signed = true`. The only operation allowed on signed versions is supersession (creating a new version and setting `superseded_at` on the old one).

**Supersession:** explicit action — upload v2, v1 gets `superseded_at` and `superseded_by_version_id`, v2 becomes current. v1 remains retrievable forever.

**Signature foundation in M1:** an internal "sign intent" with hash capture. Real e-signature integration (DocuSign, Adobe Sign) is deferred but the model already supports it — `signature_type` column distinguishes `internal_hash`, `docusign`, `adobe_sign`, etc.

### 7.4 Posting service

**The only service allowed to mutate financial or KPI state.** In Module 1 there are no financial tables to mutate yet — Module 4 introduces them. But the posting service ships fully functional with its event log, idempotency, and exception queue so that Module 2 (which will issue `IPA_APPROVED` events) can plug in without change.

**Interface:**

```ts
postingService.post({
  eventType: 'IPA_APPROVED',
  sourceService: 'commercial',
  sourceRecordType: 'ipa',
  sourceRecordId: '...',
  projectId: '...',
  entityId: '...',
  idempotencyKey: '...',          // caller-provided, unique per logical event
  payload: { ... },               // event-specific data
})
```

**Rules:**
1. Idempotency key is `UNIQUE`. Duplicate calls return the original event without creating a new row.
2. The service validates the payload against an event-type-specific Zod schema.
3. On success, the row is marked `posted` and returns.
4. On failure, the row is marked `failed`, a `posting_exception` row is created with reason, and the service returns an error. The exception appears in the admin panel.
5. Reversals are additive: a new event with `status = reversed` and `reversed_by_event_id` pointing at the original. The original row is never deleted or mutated.
6. Business modules **never** call the posting service's internal writers directly — only through `.post()`.

**Enforcement in M1:** service layer only. DB-level role separation (separate Postgres role with write access to financial tables) is designed for but deferred to a hardening phase. The schema and code are structured so DB-level hardening can be added without refactoring business logic.

### 7.5 Audit & override

**Audit logging is append-only.** Every service that mutates state calls `auditService.log({ actor, action, resourceType, resourceId, before, after, reason, projectId })`. The log writer is transactional with the mutation — either both commit or both roll back.

**Override log** is a separate, denormalized, fast-query view of audit entries where an override occurred. When a Master Admin uses `withOverride({ reason })(() => ...)`, the helper:
1. Runs the action.
2. Writes a standard audit log entry.
3. Writes an `override_logs` row referencing the audit log, with override type, reason, and before/after snapshot.

This gives the admin panel fast filtered access to override actions without scanning the full audit log.

**Retention:** audit and override logs are permanent in Module 1. A retention policy can be added later if legal requires it, but "keep everything" is safer until told otherwise.

### 7.6 Notifications

**Delivery channels:** in-app (always), email (optional per template and per user preference).

**Idempotency:** one notification per (event, recipient, channel) — driven by a composite deduplication key from the calling service.

**Templates:** stored in `notification_templates`, rendered server-side with a simple templating engine (Handlebars or Mustache — decision made in implementation).

**User preferences:** `notification_preferences` row per (user, template, channel) — default enabled.

**Delivery via BullMQ worker:** when a service fires a notification, it enqueues a job. The worker picks it up, renders, and sends. In-app delivery is instant via the DB row; email goes via SES (or MailHog locally).

---

## 8. UI Surface

### 8.1 Module 1 screen set

| # | Screen | Scope in M1 | Notes |
|---|---|---|---|
| 1 | Sign in | Full | Email + password, MFA hook-point stubbed |
| 2 | Forgot password | Minimal | Email reset link via SES/MailHog |
| 3 | Home | Skeleton data | Assigned projects, pending approvals count, recent activity, notifications bell |
| 4 | My Approvals | Full | Workflow instances where user is current approver; empty until business records exist |
| 5 | Projects list | Full | Only shows projects user is assigned to |
| 6 | Project workspace | Full | Header + tabs: Overview, Documents, Team, Settings, (stubbed tabs for Commercial/Procurement/Materials/Budget/Cashflow — subtle, clean, not noisy) |
| 7 | Document library | Full | Scoped to current project; upload, version, sign, supersede, filter by category |
| 8 | Document viewer | Full | Preview + version history + signature panel + audit shortcut |
| 9 | Notifications | Full | In-app list, mark read, deep-link to source |
| 10 | User profile | Full | Name, password change, MFA setup (stub), notification preferences |
| 11 | Command palette (⌘K) | Full | Quick-jump to projects, documents, admin screens; extensible per future module |
| 12 | Admin → Users | Full | CRUD, activate/deactivate, reset password, view audit trail |
| 13 | Admin → Roles & Permissions | Full | Role management, permission matrix, screen permissions (with project overrides) |
| 14 | Admin → Project Assignments | Full | Assign users to projects with effective dates |
| 15 | Admin → Entities | Full | Entity CRUD, hierarchy viewer |
| 16 | Admin → Workflow Templates | Functional | Form-based JSON template editor with validation |
| 17 | Admin → Reference Data | Full | Countries, currencies, app settings, status dictionaries |
| 18 | Admin → Notification Templates | Full | Template CRUD with preview |
| 19 | Admin → Audit Log Viewer | Full | Filter by actor, resource, date, project |
| 20 | Admin → Posting Exceptions | Full | Exception queue, retry, resolve with note |
| 21 | Admin → System Health / Jobs | Full | Background jobs, queue health, failed jobs, retry status, environment info summary |
| 22 | Admin → Override Log | Full | Filtered view of override actions, separate from general audit log |

### 8.2 Navigation (Module 1)

Top navigation: **Home · My Approvals · Projects · Documents · Admin** plus user menu (profile, notifications, sign out).

Other business nav items from the full spec (Commercial, Procurement, Materials, Contracts, Budget, Cashflow, Reports, PMO KPIs) appear as **subtle, clean placeholders** ("Coming in Module X") — visible so users see the roadmap, not noisy.

### 8.3 Design language

- **Palette:** neutral base (grays), single accent color for primary actions, semantic colors only for status.
- **Status chips:** consistent colors across the platform — `draft` (gray), `in review` (blue), `approved` (green), `rejected` (red), `signed` (dark green), `superseded` (amber), `exception` (purple).
- **Typography:** Inter for Latin, IBM Plex Arabic lazy-loaded when i18n switches to `ar`.
- **Spacing:** Tailwind default scale. Generous whitespace. Density only where data volume demands it.
- **Feedback:** toast notifications, not blocking dialogs. Skeleton loaders, not spinners.
- **Forms:** sheets/drawers for secondary forms; modals only for confirmations.
- **Tables:** sticky headers, column visibility toggle, CSV export, filter bar. Never overbuilt in M1.
- **Mobile:** responsive, desktop-first. Approvals and notifications should work on mobile; admin screens are desktop-only.

### 8.4 UX principles (product-level)

- **Every empty state is helpful**, not generic. Explains what goes here, how to create it, and links to the create action.
- **Permission failures are polite and clear**, never technical ("You don't have access to this project" not "403 Forbidden").
- **Project switching is easy and obvious** — a project switcher in the header with search and recent.
- **Filters never feel overbuilt** in Module 1. One filter bar per list, basic facets, no faceted-search bloat.
- **Admin pages are powerful but not ugly.** Same design language as the rest of the product, just more data density.
- **Optimize for clarity over density.** When in doubt, show less and let users expand.
- **Shallow navigation.** Every action reachable in ≤3 clicks from Home.
- **Obvious "next action" and "current owner"** on every record with a workflow.
- **⌘K command palette** — first-class, extensible per module. M1 ships project jump, document search, and admin shortcuts.

### 8.5 Accessibility & i18n readiness

- WCAG 2.1 AA target for Module 1.
- Radix primitives provide keyboard nav and ARIA out of the box.
- `next-intl` is wired from day 1; all user-facing strings go through `t()` calls, never hardcoded. English-first content, Arabic content added in a later phase without refactor.
- RTL-aware Tailwind classes (`ltr:` / `rtl:`) used in layout primitives from day 1.

---

## 9. Testing Strategy

### 9.1 Layers

| Layer | Tool | Target |
|---|---|---|
| Unit | Vitest | 80%+ coverage on `packages/core` pure logic |
| Integration | Vitest + testcontainers (real Postgres per suite) | Every service method against real DB |
| API | tRPC callable router tests | Every procedure + every permission deny path |
| E2E | Playwright | Critical flows (see §9.2) |
| Permission deny | Dedicated suite | Every protected procedure tested for unauthorized access |
| Workflow | Dedicated suite | Template → instance → step → action → audit flow |
| Audit coverage | Dedicated suite | Every mutating operation verified to write audit |

### 9.2 Critical E2E scenarios (Module 1)

1. User signs in with valid credentials → sees only assigned projects.
2. User attempts to access an unassigned project → denied with a polite error, audit log written.
3. Master Admin creates user → assigns role → assigns to project → user can log in and see the project.
4. Master Admin creates a workflow template → starts an instance on a stub record → progresses through approvals → audit log captures every action.
5. User uploads a document to a project → version 1 created → user signs it → version becomes immutable.
6. User attempts to edit a signed version → rejected with a clear error.
7. Override action (Master Admin force-progresses a workflow) → requires reason → writes full audit and override-log entry with before/after.
8. Posting service receives a test event → creates event → duplicate rejected by idempotency key.
9. Posting event fails validation → exception queue row created → visible in admin panel → can be resolved with note and a resolution audit entry.
10. PMO user is denied operational edit access to project-scoped records but allowed approved reporting/KPI visibility only.
11. Supersession: upload v2 of a signed document → v1 marked `superseded`, v2 becomes current, v1 still retrievable.
12. Effective-dated role: assign a user role with a future `effective_from` → user doesn't have that permission until the date passes; audit captures the scheduled change.
13. Document categories: upload a shop drawing, a material submittal, and a test certificate — each is categorized correctly and retrievable via category filter.
14. User with a project assignment can view that project's documents but cannot see documents from another project — tested with two users and two projects.
15. Document category filters work correctly for shop drawing, material submittal, and test certificate.
16. Role permission change takes effect correctly after save and is reflected in access behavior without requiring a re-login.
17. Notification generated from a workflow event appears in-app and respects read/unread state.
18. Posting exception retry succeeds and writes an audit trail of the resolution.

### 9.3 Coverage targets

- `packages/core`: 80%+ statement and branch coverage.
- All tRPC procedures: 100% happy-path + 100% permission-deny tests.
- All Prisma middleware (signed immutability, soft-delete whitelist): 100% tested.
- Audit coverage suite: asserts every mutating procedure writes an audit log entry.

### 9.4 Out of scope for M1 testing

- Load tests, chaos tests, security pen-tests (pre-production hardening phase).
- Performance regression suites (added when real usage patterns exist).

---

## 10. Delivery Plan

Module 1 ships in **10 phases** on one branch with per-phase commits. Each phase has acceptance criteria and is verifiable before proceeding.

| Phase | Scope | Acceptance |
|---|---|---|
| **1.1 Scaffold** | Monorepo (pnpm + Turborepo), Next.js 15, Prisma, Docker Compose (Postgres + Redis + MinIO + MailHog), ESLint/Prettier/TS/Tailwind/shadcn init, GitHub Actions CI skeleton, AWS CDK skeleton (dev stack, undeployed), README scaffold | `pnpm dev` starts; DB migrates; hello-world page loads; CI green on a trivial commit |
| **1.2 Data layer** | Full Prisma schema for all M1 tables; initial migration; seed script producing: 14 roles, base permissions, role-permission links, user-project assignments (empty + hooks), reference data (countries, currencies, status dictionaries seed, app settings), sample entity, sample project, Master Admin user | `pnpm db:seed` produces a working dev DB that supports all downstream phases |
| **1.3 Auth + access-control** | Auth.js v5 with credentials provider; session management; `access-control` service with role resolution, permission checks, effective-dated assignment lookup; `projectScope` tRPC middleware; cross-project read control; screen permission enforcement (including project overrides); sign-in screen; forgot-password stub; user profile screen | Can log in as Master Admin; seeded project visible; protected routes enforce scope; permission deny tests pass |
| **1.4 Projects + entities + reference-data** | Project CRUD + assignment UI; entity CRUD + hierarchy viewer; reference-data admin (countries, currencies, app settings, status dictionaries) | Admin can set up a full project with team, entities, and reference data |
| **1.5 Workflow engine** | Generic engine; JSON template admin form with validation; instance lifecycle; step progression; action logging; My Approvals screen; realistic test record to validate end-to-end progression (e.g., `document.approve` workflow running over a real uploaded document) | Can create a template and run an instance end-to-end on a real document |
| **1.6 Documents + signatures** | S3/MinIO upload; versioning; internal sign intent with hash capture; supersession; document library screen; viewer; category support for shop drawing, material submittal, test certificate, contract attachment, vendor document, general | Full document lifecycle works; categories filter correctly; signed versions immutable |
| **1.7 Posting service skeleton** | `posting_events` table + idempotency logic; ingestion API; exception queue; admin review screen; reversal primitive; no actual financial tables yet | Event-in → posted-or-exception; retry path works; reversal creates additive event |
| **1.8 Notifications** | In-app notification list; email via SES/MailHog; template engine; user preferences; idempotent per (event, recipient); notifications fire on workflow events | Notifications appear in-app and email (MailHog captured) on a workflow action |
| **1.9 Home + command palette + nav polish** | Home dashboard; ⌘K command palette; empty-state polish across all screens; placeholder tabs for future modules (subtle, clean); design polish pass | App feels cohesive and credible; all empty states are helpful, not generic |
| **1.10 Tests + docs** | Complete E2E suites (all 18 scenarios); permission deny tests; audit coverage suite; README, local setup guide, migration guide, permissions guide, module boundary notes; CDK dev stack validated (synth + deploy dry-run) | All tests green; documentation complete; Module 1 ready for sign-off |

**Explicitly deferred** (reaffirmed): visual workflow designer, real e-signature, TOTP/WebAuthn MFA, corporate SSO, Arabic/RTL translations, staging/prod AWS stacks, load tests.

---

## 11. Learning-Mode Contribution Points

Five pauses during Module 1 build where Ahmed writes 5–10 meaningful lines of code. Each is a business decision his domain knowledge defines better than mine.

| # | File | Phase | Decision |
|---|---|---|---|
| 1 | `packages/db/src/seed/permissions.ts` | 1.2 | Permission codes for each of the 14 roles: what each role can view, edit, approve, override |
| 2 | `packages/db/src/seed/workflow-templates.ts` | 1.5 | One representative workflow template (e.g., "Document Approval") with steps and approver rules used at Pico Play |
| 3 | `packages/core/src/access-control/override-policy.ts` | 1.3 | Rules for Master Admin override: what requires reason, what triggers escalation, what's never overridable |
| 4 | `packages/core/src/projects/project-settings-defaults.ts` | 1.4 | Default `project_settings` for a new project (workflow toggles, doc requirements, material tracking flags — even if later modules use them) |
| 5 | `packages/db/src/seed/status-dictionaries.ts` | 1.2 | Status dictionaries and document categories for later modules (material statuses, shop drawing statuses, fabrication statuses, testing statuses, notice/claim statuses) |

Each contribution point gets a prepared file with types, comments, and `// TODO(ahmed):` markers before Ahmed is asked.

---

## 12. Module Boundaries & Future-Module Contracts

Module 1 exposes the following typed contracts for Modules 2–7 to consume. These are fixed interfaces that must not change without coordinated migration.

| Contract | Consumer modules | Description |
|---|---|---|
| `workflowService.startInstance(templateCode, recordType, recordId, projectId)` | 2, 3, 4 | Starts a workflow for any business record |
| `workflowService.on<T>(event, handler)` | 2, 3, 4, 7 | Subscribes to workflow lifecycle events (started, stepCompleted, approved, rejected) |
| `postingService.post(event)` | 2, 3, 4, 5 | The only way to post a financial/KPI event |
| `postingService.reverse(eventId, reason)` | 2, 3, 4 | The only way to reverse a posted event |
| `documentService.attach(projectId, category, file, metadata)` | 2, 3, 6 | The only way to attach files to business records |
| `auditService.log(entry)` | All | The only way to write an audit entry |
| `auditService.withOverride(reason, fn)` | All | The only way to perform an override action |
| `notificationService.notify(templateCode, recipients, payload)` | All | The only way to send notifications |
| `accessControl.requirePermission(user, permission, projectId?)` | All | The only way to check permissions in business code |

**Schema extension pattern:** later modules add their own tables but never modify core tables except through documented extension columns (`metadata_json` on key tables).

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Over-engineering the workflow engine in M1 | Painful to use, slows M2/M3 | JSON templates only in M1, no visual designer, generic but practical |
| Project isolation leak (cross-project data bleed) | Serious trust violation | Enforced at tRPC middleware; permission deny test suite covers every procedure; RLS is the belt-and-braces backup planned for a later hardening phase |
| Posting service coupling to business logic | Makes later modules brittle | Posting service knows nothing about business record types in M1; event types are opaque strings validated by Zod schemas |
| Signed document tampering | Legal and audit risk | Prisma middleware blocks updates; hash captured at sign; supersession is the only forward path |
| Audit log gaps | Can't reconstruct incidents | Audit coverage test suite asserts every mutating procedure writes an audit entry |
| Configuration drift across environments | Bugs reproducing locally but not in prod | Single source of truth: environment variables via 12-factor; CDK stacks parameterized per env; no divergent config files |
| AWS cost surprise on dev stack | Budget overrun | Dev stack sized minimally; CloudWatch budget alerts on any environment spending > $X/day |
| Users perceive Module 1 as "empty" | Loss of stakeholder confidence | Ship working projects, documents, workflows, admin, notifications, approvals, audit — real usable product on day 1 |

---

## 14. Assumptions & Open Questions

### Assumptions
- Ahmed is the sole Master Admin in the seeded dev environment until real users are onboarded.
- English is the primary language for M1 content; Arabic content arrives post-M3.
- Internal sign intent (hash capture) is acceptable for M1 — real e-signature provider to be chosen during M2.
- BullMQ on Redis is acceptable for all async processing; no SQS for M1.
- `next-intl` is the i18n choice; no other i18n library will be introduced later.

### Open questions (non-blocking for spec approval, to be resolved during implementation)
- Exact email sender domain for SES (requires Pico Play IT input).
- Exact AWS account and IAM roles for the dev CDK stack (requires AWS onboarding).
- Whether Master Admin password reset should require a second-admin approval — deferred to hardening phase unless Ahmed wants it in M1.
- Exact set of `notification_templates` to seed in M1 (probably: workflow-step-assigned, workflow-approved, workflow-rejected, document-signed, posting-exception, user-invited).

---

## 15. Definition of Done for Module 1

Module 1 is **done** when:

1. All 10 phases complete with acceptance criteria met.
2. All 18 critical E2E scenarios pass in CI.
3. Permission deny suite: 100% of protected tRPC procedures tested for unauthorized access.
4. Audit coverage suite: 100% of mutating procedures verified to write audit entries.
5. `packages/core` coverage ≥ 80% statements and branches.
6. CDK dev stack synthesizes cleanly and deploys dry-run without errors.
7. Docker Compose local dev stack starts end-to-end with `pnpm dev`.
8. Documentation complete: architecture README, local setup guide, migration guide, permissions guide, module boundary notes.
9. Ahmed has completed the 5 learning-mode contribution points.
10. Spec for Module 2 (Commercial / Contracts Engine) can be written against this foundation without surprises.
