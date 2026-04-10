# Module 1 — Closeout Pack

**Date:** 2026-04-10
**Status:** SIGNED OFF — approved for Module 2 development
**Branch:** `main` (all phases merged)

---

## 1. Final Module 1 Summary

Module 1 delivers the **Shared Core Platform** — the foundational infrastructure for all future business modules. It ships as a working internal product, not a scaffold. A user can sign in, see projects, upload and sign documents, run multi-step approval workflows, view audit logs, manage users and roles, and receive notifications — all without any business-specific module installed.

**What was built:**

- **Authentication & Authorization** — Auth.js v5 (JWT), password-based, account lockout, 14 roles, 47 permissions, project-scope isolation, screen-level gating
- **Entity & Project Management** — Entity hierarchy (parent/subsidiary), project CRUD, project assignments, project settings
- **Workflow Engine** — Template-based multi-step approvals, step actions (approve/reject/return/cancel), role-based approver resolution, SLA tracking
- **Document Management** — Versioned uploads, digital signing with SHA-256 integrity, signed immutability enforced at Prisma middleware level, supersession
- **Posting Engine** — Append-only event ledger, idempotency keys, Zod-validated payloads, additive reversal chain, exception tracking
- **Audit & Override Control** — Append-only audit log (30+ action types), override policy engine (allowed/requires-second-approver/never), dual-log system, self-approval prohibition
- **Notifications** — Template-based (in-app + email), user preferences, BullMQ async delivery, idempotent
- **Admin Tooling** — User/role management, audit log viewer, override log viewer, system health dashboard, posting exception management
- **Home Dashboard** — Actionable cards (pending approvals, projects, notifications, admin activity)
- **Command Palette** — Cmd+K global navigation
- **Infrastructure** — Docker Compose (Postgres 16, Redis 7, MinIO, MailHog), AWS CDK (7 stacks), CI-ready

**By the numbers:**

| Metric | Value |
|--------|-------|
| Source files (TS/TSX/Prisma) | 256 |
| Lines of code added | ~34,300 |
| Commits on main | 136 |
| Phases completed | 10 of 10 |
| Prisma models | 30 |
| tRPC routers | 11 |
| Core service modules | 13 |
| CDK stacks | 7 |
| Seeded roles | 14 |
| Permission codes | 47 |
| Tests passing | 332 |

---

## 2. Merged Commit References by Phase

| Phase | Description | Merge Commit | Branch |
|-------|-------------|-------------|--------|
| 1.1 | Scaffold Module 1 monorepo | `80e84a6` | `phase/1.1-scaffold` |
| 1.2 | Data Layer (schema, migration, seeds, middleware, audit) | `5cc3d0f` | `phase/1.2-data-layer` |
| 1.3 | Auth + Access Control | `b7454ac` | `phase/1.3-auth-access-control` |
| 1.4 | Projects + Entities + Reference Data | `dea7d00` | `phase/1.4-projects-entities-refdata` |
| 1.5 | Workflow Engine | `98236a0` | `phase/1.5-workflow-engine` |
| 1.6 | Documents + Signatures | `63bce11` | `phase/1.6-documents-signatures` |
| 1.7 | Posting Service | `ad10e3e` | `phase/1.7-posting-service` |
| 1.8 | Notifications | `8965f6f` | `phase/1.8-notifications` |
| 1.9 | Home + Command Palette + Polish | `4e88b6e` | `phase/1.9-polish` |
| 1.10 | Tests + Docs + Sign-off | `b9de91a` | `phase/1.10-signoff` |

---

## 3. Final Known Issues / Deferred Items

### Known Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| Notification preference test flakiness | Low | `core/tests/notifications/preferences.test.ts` occasionally fails in parallel due to counter race on shared rows. Passes in isolation. Not a correctness bug. |
| 33 document tests require MinIO | Low | Skipped without `STORAGE_*` env vars. All pass when MinIO is running. CI must include MinIO to run full suite. |
| CDK stacks use placeholder account IDs | Low | Synth works; real AWS account IDs needed before first deploy. |
| No automated browser E2E tests | Medium | tRPC caller tests cover all business logic; visual testing is manual. Playwright was scaffolded but no browser tests written. |
| Non-admin role permissions are stub-mapped | Low | `master_admin` has all 47 permissions. Other roles have stub mappings — fine-tuning is a Module 2 task per spec. |

### Deferred to Module 2+

| Item | Target | Reason |
|------|--------|--------|
| Commercial engine (IPA, IPC, VO, letters, claims, back charges, tax invoices) | Module 2 | First business domain module |
| OAuth/SSO (Google, Microsoft, Azure AD) | Module 2 | M1 uses password auth for internal users |
| Staging/production AWS stacks | Module 2 | Stamped when load is real |
| Role-permission fine-tuning | Module 2 | Non-admin roles need business-context permissions |
| File preview (PDF/image) | Module 2 | Enhancement to M1 document management |
| Bulk import/export | Module 2 | Enhancement, not core infrastructure |
| Multi-language (Arabic/English) | Module 2+ | UX enhancement |
| Full-text search | Module 2+ | Enhancement |
| Procurement engine | Module 3 | Depends on M2 cost foundations |
| Budget/cost/cashflow | Module 4 | Depends on M2 commercial engine |
| KPI dashboards, PMO rollups | Module 5 | Needs domain data from M2-4 |
| Contract intelligence (OCR, parsing) | Module 6 | Advanced AI features |
| Agent layer | Module 7 | Needs stable platform |
| Rate limiting / API throttling | Module 2+ | Not needed for internal-only M1 |

---

## 4. Test Summary

| Suite | Tests | Passed | Skipped | Failed |
|-------|-------|--------|---------|--------|
| Core (`@fmksa/core`) | 285 | 252 | 33 | 0 |
| Web (`apps/web`) | 59 | 59 | 0 | 0 |
| DB (`@fmksa/db`) | 21 | 21 | 0 | 0 |
| **Total** | **365** | **332** | **33** | **0** |

### Critical Scenario Coverage (18 scenarios)

- Workflow: start → 3-step approve → completed
- Workflow: approve → return → resubmit → complete
- Workflow: reject at step N → terminal
- Workflow: cancel mid-flow → terminal
- Workflow: terminal states cannot be re-opened
- Document: signed version cannot be modified (MinIO)
- Document: signed version cannot be deleted (MinIO)
- Document: supersession of signed version (MinIO)
- Override: dual-approval enforced
- Override: self-approval prohibited
- Override: never-overridable actions blocked
- Posting: idempotency across lifecycle
- Posting: reversal chain integrity
- Posting: double reversal blocked
- Project isolation: user A denied project B
- Project isolation: denial writes audit log
- Project isolation: cross_project.read bypass
- Auth: lockout after 5 failed attempts

### Permission Deny Coverage (37 tests)

All 11 tRPC routers verified for UNAUTHORIZED (unauthenticated) and FORBIDDEN (wrong role/missing permissions).

### Audit Coverage (12 tests)

Verified audit log generation for: posting post/reverse, workflow template create/instance start/step approve/reject/cancel, entity create, document create/upload/sign, override dual-log.

### Key Invariants Verified

| Invariant | Enforcement | Tests |
|-----------|-------------|-------|
| Project isolation | `projectProcedure` middleware + `verifyProjectAccess()` | 8 |
| Signed immutability | Prisma middleware | 4 |
| Append-only audit | Prisma middleware (no-delete-on-immutable) | 2 |
| Override control | `withOverride()` + policy engine | 10 |
| Posting idempotency | Unique constraint on `idempotencyKey` | 3 |
| Dual-log overrides | AuditLog + OverrideLog with FK | 3 |

---

## 5. Documentation Created

| Document | Path | Content |
|----------|------|---------|
| Architecture README | `docs/architecture.md` | Monorepo layout, 11 tRPC routers, 4 procedure tiers, 13 core modules, 30 models, 7 CDK stacks, 5 key invariants |
| Local Setup Guide | `docs/local-setup.md` | Prerequisites, Docker Compose, env vars, migrations, seed, default login |
| Migration Guide | `docs/migrations.md` | 2 migrations, schema conventions, running/creating migrations, production deployment |
| Permissions Guide | `docs/permissions.md` | 14 roles, 47 permissions, RBAC model, procedure tiers, project isolation, override policy |
| Module Boundaries | `docs/module-boundaries.md` | M1 scope, deferred items, M2 extension points, cross-cutting rules |
| Sign-off Checklist | `docs/module-1-signoff.md` | Full test results, critical scenarios, gap/risk analysis, APPROVE recommendation |
| Design Spec | `docs/superpowers/specs/2026-04-09-module-1-shared-core-platform-design.md` | Frozen Module 1 specification |
| Implementation Plan | `docs/superpowers/plans/2026-04-09-module-1-implementation-plan.md` | Phase-by-phase implementation plan |

---

## 6. Module 2 Entry Recommendation

**Recommendation: BEGIN Module 2 design spec.**

Module 1 provides a complete, tested, documented foundation. All five key invariants are enforced and verified. The extension points are documented and ready:

- **Workflow engine** accepts new `recordType` values — Module 2 adds IPA, IPC, VO, etc.
- **Posting engine** accepts new `eventType` values — Module 2 adds `IPA_APPROVED`, `IPC_CERTIFIED`, etc.
- **Notification templates** — Module 2 adds commercial-specific templates
- **Project settings** — Module 2 adds commercial configuration keys
- **RBAC** — Module 2 adds commercial permissions to existing roles

**Recommended approach:**

1. Write Module 2 design spec (same rigor as Module 1 spec)
2. Review and freeze spec before any implementation
3. Break into phases (same pattern as Module 1)
4. Execute phase-by-phase with the same test/review/merge discipline

---

## 7. Exact Proposed Scope for Module 2 — Commercial Engine

Per the frozen spec (line 104): **Commercial engine — IPA, IPC, VO, letters, claims, back charges, tax invoices.**

### Domain Records

| Record Type | Description |
|-------------|-------------|
| **IPA** (Interim Payment Application) | Contractor's periodic payment claim for work completed |
| **IPC** (Interim Payment Certificate) | Client-certified version of the IPA after review |
| **VO** (Variation Order) | Change to the original contract scope/cost |
| **Letters** | Formal correspondence (claims, notices, instructions, responses) with reference numbering |
| **Claims** | Formal claims for time extension, cost, or both |
| **Back Charges** | Charges levied against subcontractors for defects/non-compliance |
| **Tax Invoices** | VAT-compliant invoices generated from certified payments |

### M2 Deliverables (Proposed)

1. **Prisma schema extensions** — new models for each commercial record type, linked to existing Project, Entity, Workflow, Document, and Posting models
2. **Core services** — `packages/core/src/commercial/` with service per record type
3. **Workflow templates** — seeded templates for IPA approval, IPC certification, VO approval, claim resolution
4. **Posting event types** — registered in posting service event registry (e.g., `IPA_SUBMITTED`, `IPA_APPROVED`, `IPC_CERTIFIED`, `VO_APPROVED`)
5. **tRPC routers** — new `commercial` router with sub-routers per record type
6. **UI screens** — project-scoped commercial tabs (IPA list/detail, IPC list/detail, VO list/detail, letters, claims, back charges, invoices)
7. **Permission codes** — commercial-specific permissions added to role-permission seed
8. **Role-permission fine-tuning** — define what each of the 14 roles can do with commercial records
9. **Notification templates** — commercial workflow events
10. **Staging/production CDK stacks** — stamped from dev stack with environment-specific config

### M2 Does NOT Include

| Item | Why Not |
|------|---------|
| Procurement (RFQ, supplier invoices, equipment) | Module 3 — separate domain |
| Budget/cost/cashflow tables | Module 4 — depends on commercial data |
| KPI dashboards | Module 5 — needs M2-4 data |
| AI/OCR features | Module 6-7 |
| Real e-signature integration | Post-M2 procurement decision |
| Arabic/RTL | Post-M3 |
| Visual workflow designer | Module 7+ |

---

## 8. Top Risks to Control Before Module 2 Implementation

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Commercial domain knowledge gaps** | High | Ahmed must define IPA/IPC/VO/letter/claim field sets, statuses, and approval flows before spec is written. These are construction-industry-specific and cannot be inferred from code. |
| 2 | **Role-permission matrix undefined** | Medium | M1 stub-mapped non-admin roles. M2 spec must include the full permission matrix: which roles can create/edit/approve/view each commercial record type. This gates both seed data and UI gating. |
| 3 | **Posting event payload schemas** | Medium | Each commercial event type needs a Zod schema defining its payload. These must be specified in the M2 spec, not invented during implementation. |
| 4 | **Workflow template design** | Medium | IPA/IPC/VO approval flows may have complex routing (e.g., different approval chains by value threshold, or conditional steps). The M1 workflow engine supports linear multi-step — if M2 needs conditional branching, the engine must be extended. Clarify in spec. |
| 5 | **Tax invoice compliance** | Medium | Saudi VAT (15%) has specific invoice format requirements (ZATCA e-invoicing). M2 scope should clarify whether ZATCA Phase 2 compliance is in scope or deferred. |
| 6 | **Document-to-record linking** | Low | M1 documents are project-scoped but not record-scoped. M2 will need documents attached to specific IPAs, VOs, etc. The linking model (polymorphic FK vs. join table) should be decided in the M2 spec. |
| 7 | **Migration safety** | Low | M2 will add significant schema changes. Ensure all migrations are additive (new tables/columns only) — no destructive changes to M1 tables. Test migration path from current M1 state. |
| 8 | **CDK placeholder account IDs** | Low | Must be replaced with real AWS account IDs before staging/production stacks can deploy. Do this at M2 start, not during implementation crunch. |

### Recommended Pre-M2 Actions

1. **Ahmed defines commercial domain model** — record types, fields, statuses, approval flows, and business rules for IPA/IPC/VO/letters/claims/back charges/tax invoices
2. **Freeze role-permission matrix** — decide what each role can do with each commercial record type
3. **Decide on ZATCA scope** — in M2 or deferred
4. **Decide on workflow complexity** — linear-only (current engine) or conditional branching needed
5. **Write and freeze M2 design spec** — same rigor as M1 spec, reviewed before any code
