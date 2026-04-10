# Module Boundaries

## Module 1 — Shared Core Platform (Current)

Module 1 delivers the foundational infrastructure that all future modules depend on. It is intentionally scope-limited to shared services and does not include domain-specific business logic for construction operations.

### What Module 1 Includes

**Authentication and Authorization**
- Password-based auth with Auth.js v5 (JWT)
- Account lockout after failed attempts
- Role-based access control (14 roles, hierarchical permissions)
- Project-scope isolation with assignment checks
- Screen-level permission gating

**Entity and Project Management**
- Entity hierarchy (parent/subsidiary with tree navigation)
- Project CRUD with status lifecycle
- Project assignments (user + role + date range)
- Project settings (key-value per project)

**Workflow Engine**
- Template-based multi-step approval workflows
- Step actions: approve, reject, return (to any prior step), cancel
- Approver resolution by role (within project scope)
- SLA tracking per step
- Event system for cross-service integration

**Document Management**
- Document creation, version upload, version supersession
- Digital signing with SHA-256 integrity hashing
- Signed version immutability (enforced at Prisma middleware level)
- S3-compatible storage via MinIO/AWS S3

**Posting Engine**
- Append-only event ledger with idempotency keys
- Event type registry with Zod payload validation
- Additive reversal chain (no silent deletes)
- Exception tracking with retry/resolve workflow

**Audit and Override Control**
- Append-only audit log for all mutations (30+ action types)
- Override policy engine (allowed / requires-second-approver / never)
- Dual-log system (AuditLog + OverrideLog with FK reference)
- Self-approval prohibition

**Notifications**
- Template-based notifications (in-app + email)
- User preference management (channel opt-out)
- BullMQ job queue for async email delivery
- Idempotent delivery to prevent duplicates

**Admin Tooling**
- User management, role management
- Audit log viewer with filters
- Override log viewer
- System health dashboard (DB, Redis, queue stats)
- Posting exception management

**Reference Data**
- Countries, currencies
- App settings (key-value)
- Status dictionaries

### What Module 1 Does NOT Include

These are intentionally deferred to future modules:

| Feature | Target Module | Why Deferred |
|---------|--------------|--------------|
| OAuth/SSO (Google, Microsoft) | Module 2 | M1 focuses on password auth for internal users |
| Cost management / budgets | Module 2 | Domain-specific, depends on M1 posting engine |
| Schedule management | Module 2 | Domain-specific, depends on M1 workflow engine |
| Procurement workflows | Module 3+ | Complex domain, needs M2 cost foundations |
| Subcontractor management | Module 3+ | Depends on procurement and cost modules |
| Report generation / dashboards | Module 2 | Needs domain data from M2 |
| File preview (PDF/image viewer) | Module 2 | Enhancement to M1 document management |
| Bulk operations (import/export) | Module 2 | Enhancement, not core infrastructure |
| Webhooks / external integrations | Module 3+ | Needs stable API surface |
| Mobile app | Module 3+ | Needs stable API surface |
| Multi-language (Arabic/English) | Module 2 | UX enhancement |
| Advanced search / full-text search | Module 2 | Enhancement |

### Extension Points for Module 2

Module 1 provides these integration surfaces:

- **Workflow engine**: New `recordType` values and templates for M2 approval flows
- **Posting engine**: New `eventType` values in the event registry for M2 financial events
- **Notification templates**: New templates for M2-specific events
- **Project settings**: New setting keys for M2 project configuration
- **Audit logging**: All M2 services use `auditService.log()` for consistency
- **RBAC**: New permissions added to existing roles for M2 operations

### Cross-Cutting Rules

1. **No direct DB access from `apps/web`** — all data goes through `@fmksa/core` services or `@fmksa/db` client
2. **All mutations write audit logs** — no exception
3. **Project isolation is universal** — every project-scoped operation checks assignment
4. **Immutable records stay immutable** — audit logs, override logs, workflow actions, document signatures
5. **Overrides are dual-logged** — never silently bypass controls
