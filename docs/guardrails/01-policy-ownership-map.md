# Guardrail 1 — Policy Ownership Map

**Purpose:** Define exactly where each control rule lives and whether it can be changed through admin UI. Stop policy sprawl.

**Applies to:** All modules. Review when adding any new approval flow, override type, or admin setting.

---

## Non-Negotiable Hard Controls

These are enforced in code. No admin UI or configuration may override them.

| Rule | Lives In | Enforcement | Admin Configurable? | Notes |
|---|---|---|---|---|
| Signed document immutability | `db/middleware/signed-immutability.ts` | Prisma extension blocks update/delete on signed `DocumentVersion` | **NO — never** | Only supersession (supersededAt + supersededByVersionId) allowed |
| Append-only tables | `db/middleware/no-delete-on-immutable.ts` | Prisma extension blocks delete on `AuditLog`, `OverrideLog`, `PostingEvent`, `WorkflowAction`, `DocumentSignature` | **NO — never** | Deletions only via DBA raw SQL |
| Posting additive reversal only | `core/posting/reversal.ts` | Creates new reversal event; only mutation is setting `reversedByEventId` back-pointer | **NO — never** | `posting.reverse_silently` is in override `never` list |
| Project-scope isolation | `core/scope-binding.ts` + `projectProcedure` | `assertProjectScope()` on every fetched record; `projectProcedure` checks `ProjectAssignment` | **NO — never** | Mismatch → NOT_FOUND (not FORBIDDEN) |
| Entity-scope isolation | `core/scope-binding.ts` + `entityProcedure` | `assertEntityScope()` on every fetched record | **NO — never** | Master data never leaks across entities |
| Override never-list | `core/access-control/override-policy.ts` | `document.unsign`, `document.delete`, `posting.reverse_silently` permanently blocked | **NO — never** | Unclassified actions also denied by default |
| Self-approval prohibited | `core/audit/override.ts` | Pre-check: actor !== approver before transaction starts | **NO — never** | — |
| Status enum enforcement | Prisma schema (11 enums) + PostgreSQL | DB rejects any value not in the enum type | **NO — never** | Changing valid statuses requires a migration |
| FK integrity (category/catalog) | Prisma schema (9 relations) + PostgreSQL | `onDelete: Restrict` prevents orphaned records | **NO — never** | — |

---

## Configurable Controls

| Rule | Lives In | Secondary Support | Admin Configurable? | Owner | Review Trigger |
|---|---|---|---|---|---|
| Who can approve (by role/threshold) | Workflow template steps | `workflow_templates` DB rows | **Yes** — via workflow template editor | Contracts Manager / PD | New commercial type or approval tier added |
| Who can sign | Workflow template (step type = `sign`) | Permission `*.sign` | **Yes** — via template + role assignment | PD | New signatory role requested |
| Finance check mandatory | Workflow template variant (`*_with_finance`) | Template selection at record creation | **Yes** — by selecting appropriate template | Contracts Manager | New record type needs finance review |
| PD mandatory | Workflow template variant (`*_with_sign`, `*_with_pd`) | Template selection | **Yes** — by selecting appropriate template | PD | New high-value flow |
| Posting event schemas | `core/posting/event-registry.ts` | Zod schemas per event type | **No** — code only | Dev team | New posting event type added |
| Permission codes | `db/seed/procurement-permissions.ts` + M1 seed | 124 codes across 13+ resources | **No** — seed only | Dev team | New resource or action type |
| Role-permission mapping | `db/seed/role-permissions.ts` | `role_permissions` DB rows | **Partially** — master_admin can reassign via admin UI | Master Admin | New role created or scope expanded |
| Notification templates | `notification_templates` DB rows | Admin UI | **Yes** | Document Controller | New workflow or event type |
| Reference numbering rules | `core/commercial/reference-number.ts` | `reference_counters` DB table | **No** — code pattern only | Dev team | New numbered record type |
| Workflow escalation | Not yet implemented | — | — | — | Before Module 5 (budget/cashflow) |

---

## Override Policy Summary

| Category | Actions | Approver(s) Required |
|---|---|---|
| Solo allowed | `workflow.force_progress`, `workflow.reassign_approver`, `user.unlock_account`, `user.force_password_reset` | 1 Master Admin + reason |
| Requires second approver | `workflow.force_close`, `project_assignment.revoke_immediately`, `reference_data.bulk_edit` | 2 Master Admins + reason |
| Never allowed | `document.unsign`, `document.delete`, `posting.reverse_silently` | Blocked unconditionally |
| Unclassified | Any action not in the above lists | **Denied by default** |

---

## Dashboard Trust Boundaries

| Principle | Rule |
|---|---|
| Dashboards read from posted events, not from draft/operational records | If a posting event hasn't fired, the value doesn't exist for dashboards |
| Aggregates use `_sum` with null safety (`?? null`, not `?? 0`) | Zero and null are different — null means no data, not zero amount |
| Dashboards never write back | Dashboard endpoints are read-only; no mutations allowed |
| Informational events ≠ financial truth | See Guardrail 3 for event classification |

---

## AI/Agent Actions

| Principle | Rule |
|---|---|
| AI may draft | Generate document text, suggest workflow assignments |
| AI may NOT approve/sign/post | No override, no workflow progression, no posting events |
| AI may NOT bypass scope checks | All AI-initiated actions go through the same procedure tiers |
| AI may NOT self-authorize | Any AI action impersonating a user requires that user's active session |
