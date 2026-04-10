# Permissions and RBAC — Module 1

## Data Model

Users have Roles via `UserRole` (many-to-many, with `effectiveFrom`/`effectiveTo` dates).
Roles have Permissions via `RolePermission` (many-to-many).
`ScreenPermission` defines per-role screen access (`canView`, `canEdit`, `canApprove`) with an optional project-specific override row; the most permissive flags win across all effective roles.

Role effective-date window: `effectiveFrom <= now` AND (`effectiveTo IS NULL` OR `effectiveTo > now`).
Revocation is expressed by setting `effectiveTo`; there is no separate `revokedAt` on `UserRole`.

---

## 14 Seeded Roles

| Code | Name | Summary |
|---|---|---|
| `master_admin` | Master Admin | Full platform control, all permissions, all overrides |
| `project_director` | Project Director | Project approvals, signatures, cross-project transfer approval |
| `project_manager` | Project Manager | Project operations, same-project reallocation only |
| `site_team` | Site Team | Raises material requests, uploads site documents |
| `design` | Design | Uploads/reviews shop drawings and technical items |
| `qa_qc` | QA/QC | Reviews and approves quality and technical items |
| `contracts_manager` | Contracts Manager | Controls commercial and client-facing workflows |
| `qs_commercial` | QS / Commercial | Drafts and operates commercial records |
| `procurement` | Procurement | Controls procurement and vendor-facing workflows |
| `finance` | Finance | Validates payment and financial aspects |
| `cost_controller` | Cost Controller | Operates cost data and budget tracking |
| `document_controller` | Document Controller | Manages document library and version control |
| `pmo` | PMO | Read-only KPI/reporting visibility, portfolio rollups |
| `executive_approver` | Executive Approver | High-authority approvals as configured |

---

## Permission Codes (47 total)

| Resource | Codes |
|---|---|
| `project` | `project.view`, `project.create`, `project.edit`, `project.archive` |
| `document` | `document.view`, `document.upload`, `document.sign`, `document.supersede` |
| `workflow` | `workflow.view`, `workflow.start`, `workflow.approve`, `workflow.reject`, `workflow.return`, `workflow.override` |
| `posting` | `posting.view`, `posting.retry`, `posting.resolve` |
| `audit` | `audit.view`, `audit.export` |
| `user` | `user.view`, `user.create`, `user.edit`, `user.admin` |
| `role` | `role.view`, `role.edit` |
| `entity` | `entity.view`, `entity.edit` |
| `reference_data` | `reference_data.view`, `reference_data.edit` |
| `notification` | `notification.view`, `notification.edit` |
| `system` | `system.health`, `system.admin` |
| `override` | `override.execute` |
| `cross_project` | `cross_project.read` |
| `screen` | `screen.admin_users`, `screen.admin_roles_permissions`, `screen.admin_project_assignments`, `screen.admin_entities`, `screen.admin_workflow_templates`, `screen.admin_reference_data`, `screen.admin_notification_templates`, `screen.admin_audit_log`, `screen.admin_posting_exceptions`, `screen.admin_system_health`, `screen.admin_override_log` |

### Role-Permission Mapping Status

`master_admin` is seeded with all 47 permissions (wildcard `*`).
All other roles are stub-mapped in `packages/db/src/seed/role-permissions.ts` and will be fully defined in a subsequent module. PMO is documented to receive `*.view` + `cross_project.read`. Override permissions (`override.execute`, `system.admin`) are restricted to `master_admin` only.

---

## tRPC Procedure Tiers

| Tier | Guard | Denial |
|---|---|---|
| `publicProcedure` | None — no auth required | — |
| `protectedProcedure` | Authenticated user in context | `UNAUTHORIZED` |
| `adminProcedure` | Authenticated + `system.admin` permission | `FORBIDDEN` |
| `projectProcedure` | Authenticated + active `ProjectAssignment` for the target project, OR `cross_project.read` | `FORBIDDEN` + audit log |

`projectProcedure` extends `protectedProcedure`; it reads `projectId` from the parsed or raw input, calls `verifyProjectAccess`, and injects `ctx.projectId` for resolvers.

---

## Project-Scope Isolation

Every project-scoped operation (via `projectProcedure`) checks `ProjectAssignment` for the target `projectId`. Active assignment conditions: `effectiveFrom <= now`, (`effectiveTo IS NULL` OR `effectiveTo > now`), `revokedAt IS NULL`.

Users with `cross_project.read` bypass the assignment check entirely. Access denial writes an `AuditLog` entry with `action = "access_denied"`, `resourceType = "project"`, and `afterJson.reason = "not_assigned"`.

---

## Override Control

All overrides require `override.execute` (held only by `master_admin`). Every override writes both an `AuditLog` and an `OverrideLog`. Self-approval is prohibited (actor !== approver).

| Category | Actions |
|---|---|
| Allowed (solo) | `workflow.force_progress`, `workflow.reassign_approver`, `user.unlock_account`, `user.force_password_reset` |
| Requires second approver | `workflow.force_close`, `project_assignment.revoke_immediately`, `reference_data.bulk_edit` |
| Never allowed | `document.unsign`, `document.delete`, `posting.reverse_silently` |

Unclassified override actions are denied by default until explicitly added to the policy.
