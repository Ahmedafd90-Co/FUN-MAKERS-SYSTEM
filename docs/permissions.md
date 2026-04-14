# Permissions and RBAC

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

## Permission Codes — Module 1 (47 codes)

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

---

## Permission Codes — Module 3 Procurement (79 codes, 13 resources)

All codes follow the `resource.action` pattern. Seeded in `packages/db/src/seed/procurement-permissions.ts`.

| Resource | Actions |
|---|---|
| `vendor` (7) | `view`, `create`, `edit`, `delete`, `activate`, `suspend`, `blacklist` |
| `vendor_contract` (9) | `view`, `create`, `edit`, `delete`, `submit`, `review`, `approve`, `sign`, `terminate` |
| `framework_agreement` (9) | `view`, `create`, `edit`, `delete`, `submit`, `review`, `approve`, `sign`, `terminate` |
| `rfq` (11) | `view`, `create`, `edit`, `delete`, `submit`, `review`, `approve`, `issue`, `evaluate`, `award`, `terminate` |
| `quotation` (9) | `view`, `create`, `edit`, `delete`, `review`, `shortlist`, `award`, `reject`, `terminate` |
| `purchase_order` (8) | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `supplier_invoice` (7) | `view`, `create`, `edit`, `submit`, `review`, `approve`, `prepare_payment` |
| `expense` (6) | `view`, `create`, `edit`, `submit`, `review`, `approve` |
| `credit_note` (6) | `view`, `create`, `edit`, `review`, `verify`, `apply` |
| `procurement_dashboard` (1) | `view` |
| `procurement_category` (2) | `view`, `manage` |
| `item_catalog` (2) | `view`, `manage` |
| `project_vendor` (2) | `view`, `manage` |

### Transition-to-Permission Mapping

Routers use `getTransitionPermission(resource, action)` (defined in `_helpers.ts`) to resolve the required permission for each workflow transition. The mapping avoids one-permission-per-transition by grouping related actions:

| Transition action | Maps to suffix | Example |
|---|---|---|
| `submit` | `.submit` | `rfq.submit` |
| `approve` | `.approve` | `vendor_contract.approve` |
| `sign` | `.sign` | `vendor_contract.sign` |
| `issue` | `.issue` | `rfq.issue` |
| `evaluate` | `.evaluate` | `rfq.evaluate` |
| `award` | `.award` | `rfq.award` |
| `shortlist` | `.shortlist` | `quotation.shortlist` |
| `activate`, `suspend`, `blacklist` | own suffix | `vendor.activate` |
| `verify`, `apply`, `prepare_payment` | own suffix | `credit_note.verify` |
| `reject`, `return`, `review`, `receive_responses` | `.review` | `rfq.review` |
| `terminate`, `supersede`, `expire`, `cancel`, `close` | `.terminate` | `vendor_contract.terminate` |
| Unknown action | `.edit` (fallback) | `rfq.edit` |

### Master data resources

`procurement_category`, `item_catalog`, and `project_vendor` use a single `.manage` permission instead of separate `create`/`edit`/`delete` codes, because these are entity-scoped reference data with simpler access patterns.

---

## Total Permission Count: 126

47 (Module 1) + 79 (Module 3 Procurement) = **126 permission codes**.

### Role-Permission Mapping Status

`master_admin` is seeded with all Module 1 permissions (wildcard `*`).
All other roles are stub-mapped in `packages/db/src/seed/role-permissions.ts` and will be fully defined in a subsequent module. PMO is documented to receive `*.view` + `cross_project.read`. Override permissions (`override.execute`, `system.admin`) are restricted to `master_admin` only.

### Procurement Role-Permission Grants (Stabilization Slice B)

Terminate-class permissions (`rfq.terminate`, `quotation.terminate`) are seeded in `packages/db/src/seed/procurement-role-permissions.ts`:

| Role | `rfq.terminate` | `quotation.terminate` |
|---|---|---|
| `master_admin` | ✓ | ✓ |
| `project_director` | ✓ | — |
| `project_manager` | ✓ | — |
| `procurement` | ✓ | ✓ |

These permissions gate `cancel`, `close`, and `expire` transitions. Roles without terminate permission (e.g. `site_team`, `finance`, `pmo`) cannot perform any terminate-class action on RFQs or quotations.

The shared permission mapping is the single source of truth at `packages/core/src/procurement/permission-map.ts`, imported by both backend routers and referenced by the UI component.

---

## tRPC Procedure Tiers

| Tier | Guard | Denial |
|---|---|---|
| `publicProcedure` | None — no auth required | — |
| `protectedProcedure` | Authenticated user in context | `UNAUTHORIZED` |
| `adminProcedure` | Authenticated + `system.admin` permission | `FORBIDDEN` |
| `projectProcedure` | Authenticated + active `ProjectAssignment` for the target project, OR `cross_project.read` | `FORBIDDEN` + audit log |
| `entityProcedure` | Authenticated + entity assignment for the target entity | `FORBIDDEN` |

`projectProcedure` extends `protectedProcedure`; it reads `projectId` from the parsed or raw input, calls `verifyProjectAccess`, and injects `ctx.projectId` for resolvers.

`entityProcedure` extends `protectedProcedure`; it reads `entityId` from input, verifies entity assignment, and injects `ctx.entityId`. Used for master data resources: vendor, procurement_category, item_catalog, framework_agreement.

---

## Scope Isolation

### Project-Scope

Every project-scoped operation (via `projectProcedure`) checks `ProjectAssignment` for the target `projectId`. Active assignment conditions: `effectiveFrom <= now`, (`effectiveTo IS NULL` OR `effectiveTo > now`), `revokedAt IS NULL`.

Users with `cross_project.read` bypass the assignment check entirely. Access denial writes an `AuditLog` entry with `action = "access_denied"`, `resourceType = "project"`, and `afterJson.reason = "not_assigned"`.

### Record-Level Scope Binding (H1 hardening)

Beyond procedure-level scope checks, every service that fetches a record must verify it belongs to the caller's scope:

- **`assertProjectScope(record, expectedProjectId, type, id)`** — throws `ScopeMismatchError` if `record.projectId !== expectedProjectId`
- **`assertEntityScope(record, expectedEntityId, type, id)`** — throws `ScopeMismatchError` if `record.entityId !== expectedEntityId`

Routers catch `ScopeMismatchError` and map it to `TRPCError({ code: 'NOT_FOUND' })` — never `FORBIDDEN` — to avoid leaking record existence across scope boundaries. Both functions are exported from `@fmksa/core/scope-binding`.

---

## Override Control

All overrides require `override.execute` (held only by `master_admin`). Every override writes both an `AuditLog` and an `OverrideLog`. Self-approval is prohibited (actor !== approver).

| Category | Actions |
|---|---|
| Allowed (solo) | `workflow.force_progress`, `workflow.reassign_approver`, `user.unlock_account`, `user.force_password_reset` |
| Requires second approver | `workflow.force_close`, `project_assignment.revoke_immediately`, `reference_data.bulk_edit` |
| Never allowed | `document.unsign`, `document.delete`, `posting.reverse_silently` |

Unclassified override actions are denied by default until explicitly added to the policy.
