# Guardrail 2 — Master Data Governance Map

**Purpose:** Define ownership and control for all master/reference data objects before Modules 4-7 depend on them. Stop data chaos.

**Applies to:** All modules. Review when adding any new reference table, category hierarchy, or shared lookup.

---

## Scope Definitions

| Scope | Meaning | Procedure Tier | Example |
|---|---|---|---|
| **Global** | Shared across all entities and projects. Seeded, not user-created. | `protectedProcedure` or `adminProcedure` | Countries, Currencies, Permissions, Roles |
| **Entity** | Belongs to one entity (legal company). Shared across its projects. | `entityProcedure` | Vendors, Procurement Categories, Item Catalog, Framework Agreements |
| **Project** | Belongs to one project. Cannot be accessed from other projects. | `projectProcedure` | IPAs, IPCs, RFQs, Purchase Orders, Posting Events |

---

## Master Data Objects

| Data Object | Scope | DB Table | Create Owner | Edit Owner | Approve Changes | Financial Critical? | Reporting Critical? | Constraints |
|---|---|---|---|---|---|---|---|---|
| **Entity** | Global | `entities` | Master Admin | Master Admin | Master Admin | Yes | Yes | FK target for entity-scoped data. Cannot delete if child records exist. |
| **Project** | Global | `projects` | PD / Master Admin | PM / PD | PD | Yes | Yes | FK target for project-scoped data. `project.archive` permission required to close. |
| **Vendor** | Entity | `vendors` | Procurement | Procurement | Procurement (activate) | Yes — payable counterparty | Yes | Status enum enforced. Entity-scope binding via `assertEntityScope`. |
| **Vendor Contract** | Project | `vendor_contracts` | Procurement | Procurement | PD (sign) | Yes — commitment | Yes | Linked to Vendor. Project-scope binding. |
| **Framework Agreement** | Entity | `framework_agreements` | Procurement | Procurement | PD (sign) | Yes — commitment ceiling | Yes | Entity-scoped. Items link to Item Catalog via FK. |
| **Procurement Category** | Entity | `procurement_categories` | Procurement | Procurement | — (manage perm) | No | Yes — grouping | Hierarchical (parent_id). FK target for 5 tables. `onDelete: Restrict`. |
| **Item Catalog** | Entity | `item_catalogs` | Procurement | Procurement | — (manage perm) | No | Yes — line items | FK to Procurement Category. FK target for 4 tables. `onDelete: Restrict`. |
| **Project-Vendor Link** | Project | `project_vendors` | Procurement / PM | Procurement | — (manage perm) | No | No | Links project to entity vendor. Project-scope binding. |
| **Workflow Template** | Global | `workflow_templates` | Master Admin | Master Admin | Master Admin | No | No | Defines approval steps, roles, SLAs. Immutable once instances exist (create new version). |
| **Notification Template** | Global | `notification_templates` | Master Admin | Master Admin | — | No | No | Referenced by event handlers. |
| **Reference Counter** | Project | `reference_counters` | System (auto) | — (append-only) | — | No | Yes — sequence integrity | Atomic increment. Never reset. One row per project + type. |
| **Country** | Global | `countries` | Seed | — | — | No | No | Read-only reference. |
| **Currency** | Global | `currencies` | Seed | — | — | Yes — exchange rates | Yes | Read-only reference. |
| **Department** | Global | `departments` | Seed / Admin | Admin | — | No | No | Organizational structure. |
| **Status Dictionary** | Global | `status_dictionaries` | Seed | — | — | No | Yes | Human labels for enum status values. |
| **Roles** | Global | `roles` | Seed | Master Admin | — | No | No | 14 seeded roles. Can add but not delete seeded ones. |
| **Permissions** | Global | `permissions` | Seed | — | — | No | No | 124 codes. Code-only changes. |

---

## Data That Does Not Exist Yet But Will (Modules 4-7)

These should follow the same pattern. Pre-declaring scope now to prevent drift.

| Future Data Object | Expected Scope | Expected Owner | Financial Critical? | Notes |
|---|---|---|---|---|
| Cost Codes | Entity or Project | Cost Controller | Yes | Must be locked before M4 budget module |
| Budget Lines | Project | Cost Controller / PM | Yes | Must link to cost codes and project |
| Packages (work packages) | Project | PM / Contracts Manager | Yes | Grouping for BOQ/budget |
| BOQ Items | Project | QS / Commercial | Yes | Links to packages and cost codes |
| Payment Certificates | Project | Finance | Yes | Links to IPC, Tax Invoice |
| KPI Dimensions | Global | PMO | No | If created, must be stable — changing dimensions breaks historical dashboards |
| Allocation Rules | Project | Cost Controller | Yes | Defines how costs spread across cost codes |

---

## Governance Rules

| Rule | Enforcement |
|---|---|
| Entity-scoped data is never visible across entities | `assertEntityScope()` + `entityProcedure` |
| Project-scoped data is never visible across projects | `assertProjectScope()` + `projectProcedure` |
| Deleting a category or catalog item is blocked if child records exist | `onDelete: Restrict` FK constraint |
| Changing a workflow template after instances exist requires creating a new template version | Application logic (not yet enforced at DB level — **watch item**) |
| Reference counters must never be decremented or reset | No update/delete API exists; only `increment()` |
| Financial-critical master data changes should eventually require approval workflow | Not yet implemented — **pre-M4 decision needed** |
| Reporting-critical data must not change meaning silently | Changing category names or hierarchies after posting events reference them should be audited |
