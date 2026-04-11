# Module 3 — Procurement / Purchasing Engine — Implementation Plan

**Project:** Pico Play Fun Makers KSA — Internal Operations Platform
**Module:** 3 of 7 — Procurement / Purchasing Engine
**Date:** 2026-04-11
**Owner:** Ahmed Al-Dossary (Project Director, Pico Play)
**Status:** AWAITING APPROVAL — do not begin coding until Ahmed approves
**Source of truth:** `docs/module-3-scope-lock.md` (12 locked decisions) + `docs/superpowers/specs/2026-04-11-module-3-procurement-engine-design.md` (23-section design spec)
**Prerequisite:** Module 2 merged to main (`1e4935d`), design spec committed (`c1e577e`)

---

## 1. Execution Phases

Module 3 is divided into **8 execution phases** delivered sequentially. Each phase is internally parallelizable but depends on the prior phase completing. Phases are sized to be reviewable as individual commits or small commit groups.

| Phase | Name | Est. Effort | Dependencies | Deliverables |
|-------|------|-------------|-------------|--------------|
| 1 | **Schema & Migration** | Large | None (starts from main) | Prisma schema + migration + enums |
| 2 | **Seed Data** | Medium | Phase 1 (schema) | Permissions, role mappings, workflow templates, categories, notification templates |
| 3 | **Infrastructure** | Medium | Phase 1 (schema) | Entity-scope RBAC middleware, posting event registration, Zod contracts |
| 4 | **Core Services — Tier 1** | Large | Phase 1, 3 | Vendor, ProcurementCategory, ItemCatalog, ProjectVendor (entity-scoped + supporting) |
| 5 | **Core Services — Tier 2** | XL | Phase 4 (Vendor exists) | VendorContract, FrameworkAgreement, RFQ, Quotation (contract + sourcing chain) |
| 6 | **Core Services — Tier 3** | XL | Phase 5 (RFQ/Quotation exist) | PurchaseOrder, SupplierInvoice, Expense, CreditNote (commitment + payable chain) |
| 7 | **Dashboard, Benchmark & Trackers** | Medium | Phase 6 (all services) | Dashboard aggregation, benchmark panel, 4 tracker queries |
| 8 | **UI Screens** | XL | Phase 2-7 (all backend) | 18 screens + navigation + entity-scoped views |

**Total estimated file count:** ~130 new files, ~20 modified files.

---

## 2. Task-by-Task Breakdown

### Phase 1: Schema & Migration (9 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1.1 | Add Prisma enums (`ExpenseSubtype`, `CreditNoteSubtype`, `VendorContractType`, `ProcurementCategoryLevel`, `TicketType`, `TransportRateType`) | `packages/db/prisma/schema.prisma` | 6 enums, additive only |
| 1.2 | Add `Vendor` model with entity relation + unique constraints + indexes | `schema.prisma` | Entity-scoped, `@@unique([entityId, vendorCode])` |
| 1.3 | Add `ProjectVendor` junction model | `schema.prisma` | Composite unique on `(projectId, vendorId)` |
| 1.4 | Add `ProcurementCategory` model (self-referencing hierarchy) | `schema.prisma` | `@@unique([entityId, code])`, `CategoryHierarchy` self-relation |
| 1.5 | Add `ItemCatalog` model | `schema.prisma` | Entity-scoped, `@@unique([entityId, itemCode])` |
| 1.6 | Add `VendorContract` and `FrameworkAgreement` + `FrameworkAgreementItem` models | `schema.prisma` | VendorContract: `parentContractId` self-ref; FA: nullable `projectId` |
| 1.7 | Add `RFQ` + `RFQItem` + `RFQVendor` + `Quotation` + `QuotationLineItem` models | `schema.prisma` | RFQVendor junction; QuotationLineItem: optional `itemCatalogId` + `rfqItemId` |
| 1.8 | Add `PurchaseOrder` + `PurchaseOrderItem` + `SupplierInvoice` + `Expense` + `CreditNote` models | `schema.prisma` | Expense: all subtype-nullable columns; CreditNote: optional `correspondenceId` FK to M2 |
| 1.9 | Add reciprocal relation arrays to `Project` and `Entity` models; run `prisma migrate dev` | `schema.prisma` | ~9 relation arrays on Project, ~3 on Entity; single migration `add_procurement_engine` |

**Verification:** `pnpm --filter @fmksa/db exec prisma validate` + `prisma migrate dev` succeeds.

### Phase 2: Seed Data (6 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 2.1 | Create procurement permission codes (~72 codes, 11 resources) | `packages/db/src/seed/procurement-permissions.ts` | Same pattern as `commercial-permissions.ts` |
| 2.2 | Create procurement role-permission mappings (14 roles x 11 resources) | `packages/db/src/seed/procurement-role-permissions.ts` | Per design spec section 17 matrix |
| 2.3 | Create procurement workflow templates (~14 templates) | `packages/db/src/seed/procurement-workflow-templates.ts` | Per design spec section 5 (VendorContract x2, FA x1, RFQ x2, PO x2, SI x2, Expense x2, CreditNote x1, +variants) |
| 2.4 | Create procurement notification templates (~10 templates) | `packages/db/src/seed/procurement-notification-templates.ts` | Per design spec section 21 |
| 2.5 | Create procurement category seed data (9 categories + subcategories) | `packages/db/src/seed/procurement-categories.ts` | Entity-scoped; uses the first entity from DB or sample entity |
| 2.6 | Register all procurement seed files in `packages/db/src/seed/index.ts` | `packages/db/src/seed/index.ts` | Order: permissions → role-permissions → workflow-templates → notification-templates → categories |

**Verification:** `pnpm --filter @fmksa/db exec tsx src/seed/index.ts` runs idempotently. Run twice, verify no duplicates.

### Phase 3: Infrastructure (7 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 3.1 | Create `entityProcedure` tRPC middleware | `apps/web/server/middleware/entity-procedure.ts` | Validates entityId, derives entity membership from ProjectAssignment, aggregates permissions from highest project role |
| 3.2 | Register 7 procurement posting event types | `packages/core/src/procurement/posting-hooks/register.ts` | Uses `registerEventType()` from M1; called at boot |
| 3.3 | Create Zod posting payload schemas | `packages/core/src/procurement/posting-hooks/schemas.ts` | 7 schemas per design spec section 8 |
| 3.4 | Create procurement posting hooks barrel export | `packages/core/src/procurement/posting-hooks/index.ts` | Exports register + schemas |
| 3.5 | Create Zod validation contracts for all procurement record types | `packages/contracts/src/procurement/*.ts` (12 files + index) | vendor, vendor-contract, framework-agreement, rfq, quotation, purchase-order, supplier-invoice, expense, credit-note, category, catalog, shared |
| 3.6 | Create procurement barrel export in contracts | `packages/contracts/src/procurement/index.ts` | Exports all validation schemas |
| 3.7 | Register procurement contracts in `packages/contracts/src/index.ts` | `packages/contracts/src/index.ts` | Add `export * from './procurement'` |

**Verification:** TypeScript compiles across `contracts` and `core` packages. Schemas validate test data correctly.

### Phase 4: Core Services — Tier 1 (8 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 4.1 | Create `ProcurementCategory` service (entity-scoped CRUD + hierarchy) | `packages/core/src/procurement/category/service.ts`, `validation.ts`, `index.ts` | 3-level hierarchy, entity-scoped; tree query for nested display |
| 4.2 | Create `ItemCatalog` service (entity-scoped CRUD + search) | `packages/core/src/procurement/catalog/service.ts`, `validation.ts`, `index.ts` | Text search + category filter for quotation memory |
| 4.3 | Create `Vendor` service (entity-scoped, status transitions, no workflow) | `packages/core/src/procurement/vendor/service.ts`, `validation.ts`, `index.ts` | Direct status changes (draft→active, active→suspended, etc.); audit log on each transition |
| 4.4 | Create `ProjectVendor` service (link/unlink vendors to projects) | `packages/core/src/procurement/vendor/project-vendor-service.ts` | Junction CRUD; validates vendor exists in entity |
| 4.5 | Create procurement barrel export | `packages/core/src/procurement/index.ts` | Exports all sub-modules |
| 4.6 | Create entity-scoped tRPC routers: `vendor`, `projectVendor`, `category`, `catalog` | `apps/web/server/routers/procurement/vendor.ts`, `project-vendor.ts`, `category.ts`, `catalog.ts` | Vendor/category/catalog use `entityProcedure`; projectVendor uses `projectProcedure` |
| 4.7 | Create procurement router barrel + register in `_app.ts` | `apps/web/server/routers/procurement/index.ts`, modify `_app.ts` | Same sub-router pattern as M2 commercial |
| 4.8 | Write tests: Vendor service, Category service, Catalog service, ProjectVendor service | `packages/core/tests/procurement/vendor-service.test.ts`, `category-service.test.ts`, `catalog-service.test.ts` | Status transitions, entity isolation, hierarchy queries |

**Verification:** All Tier 1 tests pass. Entity-scoped procedures return correct data. tRPC client can call vendor.list.

### Phase 5: Core Services — Tier 2 (10 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 5.1 | Create `VendorContract` service (CRUD + status transitions + workflow + posting) | `packages/core/src/procurement/vendor-contract/service.ts`, `validation.ts`, `index.ts` | Fires `VENDOR_CONTRACT_SIGNED` on `signed` status; `parentContractId` for amendments |
| 5.2 | Create `FrameworkAgreement` service (CRUD + status + utilization tracking) | `packages/core/src/procurement/framework-agreement/service.ts`, `validation.ts`, `index.ts` | Emits `FRAMEWORK_AGREEMENT_ACTIVE` as audit-only (non-ledger, see special handling below); line items via nested create |
| 5.3 | Create `RFQ` service (CRUD + status + vendor invitation + line items) | `packages/core/src/procurement/rfq/service.ts`, `validation.ts`, `index.ts` | RFQItem + RFQVendor managed via nested creates/updates; no posting event |
| 5.4 | Create `Quotation` service (CRUD + status + line items + comparison query) | `packages/core/src/procurement/quotation/service.ts`, `validation.ts`, `index.ts` | Lighter lifecycle; `compare` method aggregates QuotationLineItems across vendors for one RFQ |
| 5.5 | Create tRPC routers: `vendorContract`, `frameworkAgreement`, `rfq`, `quotation` | `apps/web/server/routers/procurement/vendor-contract.ts`, `framework-agreement.ts`, `rfq.ts`, `quotation.ts` | All use `projectProcedure`; FA may also support entity-scope for entity-wide agreements |
| 5.6 | Register Tier 2 routers in procurement index | `apps/web/server/routers/procurement/index.ts` | Additive |
| 5.7 | Write tests: VendorContract lifecycle + posting | `packages/core/tests/procurement/vendor-contract-service.test.ts` | Status transitions, posting event verification, amendment chain |
| 5.8 | Write tests: FrameworkAgreement lifecycle + utilization | `packages/core/tests/procurement/framework-agreement-service.test.ts` | Status transitions, informational event handling, line item CRUD, utilization computation |
| 5.9 | Write tests: RFQ lifecycle + vendor management | `packages/core/tests/procurement/rfq-service.test.ts` | Status transitions, RFQItem CRUD, RFQVendor link/unlink |
| 5.10 | Write tests: Quotation lifecycle + comparison | `packages/core/tests/procurement/quotation-service.test.ts` | Status transitions, line items, comparison query across vendors |

**FRAMEWORK_AGREEMENT_ACTIVE special handling:** This event does NOT call `postingService.post()`. Instead, the service writes an audit log entry and emits a notification directly. If this proves complex, it is the first event to **drop entirely** (locked directive from Ahmed).

**Verification:** All Tier 2 tests pass. VendorContract `signed` transition fires posting event. FA `active` emits audit-only event (or is dropped).

### Phase 6: Core Services — Tier 3 (12 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 6.1 | Create `PurchaseOrder` service (CRUD + status + line items + delivery tracking + framework suggestion) | `packages/core/src/procurement/purchase-order/service.ts`, `validation.ts`, `index.ts` | Fires `PO_ISSUED` on `issued`, `PO_DELIVERED` on `delivered`; pre-populates framework rates; sets `hasFrameworkDeviation` flag |
| 6.2 | Create `SupplierInvoice` service (CRUD + status + conditional PO validation + payment phase) | `packages/core/src/procurement/supplier-invoice/service.ts`, `validation.ts`, `index.ts` | Fires `SUPPLIER_INVOICE_APPROVED` on `approved`; PO required for goods categories (service-layer enforcement), optional for services/utilities; `noPOReason` required when PO null for goods |
| 6.3 | Create `Expense` service (CRUD + subtype-aware validation + status) | `packages/core/src/procurement/expense/service.ts`, `validation.ts`, `index.ts` | Fires `EXPENSE_APPROVED` on `approved` (subtype in payload); subtype-specific field validation |
| 6.4 | Create `CreditNote` service (CRUD + status + flexible linkage validation) | `packages/core/src/procurement/credit-note/service.ts`, `validation.ts`, `index.ts` | Fires `CREDIT_NOTE_APPLIED` on `applied`; validates vendor (required), optional invoice/PO/correspondence links |
| 6.5 | Create tRPC routers: `purchaseOrder`, `supplierInvoice`, `expense`, `creditNote` | `apps/web/server/routers/procurement/purchase-order.ts`, `supplier-invoice.ts`, `expense.ts`, `credit-note.ts` | All use `projectProcedure` |
| 6.6 | Register Tier 3 routers in procurement index | `apps/web/server/routers/procurement/index.ts` | Additive |
| 6.7 | Write tests: PurchaseOrder lifecycle + delivery + posting + framework suggestion | `packages/core/tests/procurement/purchase-order-service.test.ts` | Status transitions, `PO_ISSUED`/`PO_DELIVERED` posting, line items, framework rate pre-population, deviation flag |
| 6.8 | Write tests: SupplierInvoice lifecycle + conditional PO + posting | `packages/core/tests/procurement/supplier-invoice-service.test.ts` | Status transitions, `SUPPLIER_INVOICE_APPROVED` posting, PO-required-for-goods rule, `noPOReason` enforcement, payment phase |
| 6.9 | Write tests: Expense lifecycle + subtype validation + posting | `packages/core/tests/procurement/expense-service.test.ts` | Status transitions, `EXPENSE_APPROVED` posting (subtype in payload), subtype-specific field validation, all 5 subtypes |
| 6.10 | Write tests: CreditNote lifecycle + linkage + posting | `packages/core/tests/procurement/credit-note-service.test.ts` | Status transitions, `CREDIT_NOTE_APPLIED` posting, flexible linkage (vendor-only, vendor+invoice, vendor+PO, vendor+correspondence) |
| 6.11 | Write procurement posting hooks integration test | `packages/core/tests/procurement/posting-hooks.test.ts` | Verifies all 6 firm events registered, payload schemas validate, idempotency keys work |
| 6.12 | Write cross-model lifecycle integration test | `packages/core/tests/procurement/lifecycle-integration.test.ts` | Full chain: Vendor → RFQ → Quotation → Award → PO → Delivery → SupplierInvoice → Payment; Expense → Approval; CreditNote → Applied |

**Verification:** All Tier 3 tests pass. All 6 firm posting events fire correctly. Conditional PO rule enforced. Full lifecycle chain executes end-to-end.

### Phase 7: Dashboard, Benchmark & Trackers (6 tasks)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 7.1 | Create `benchmark` service (read-only queries) | `packages/core/src/procurement/benchmark/service.ts`, `index.ts` | Queries QuotationLineItem + PurchaseOrderItem + FrameworkAgreementItem entity-wide; returns last 3 prices, average, min/max, framework rate |
| 7.2 | Create `dashboard` service (9-section aggregation) | `packages/core/src/procurement/dashboard/service.ts`, `index.ts` | groupBy queries for commitments, payables, expenses, vendors, RFQ pipeline, credits, category spend, recent activity; pending approvals count |
| 7.3 | Create dashboard + benchmark tRPC routers | `apps/web/server/routers/procurement/dashboard.ts`, `benchmark.ts` | Both use `projectProcedure`; benchmark is read-only |
| 7.4 | Register dashboard + benchmark routers | `apps/web/server/routers/procurement/index.ts` | Additive |
| 7.5 | Write tests: benchmark service | `packages/core/tests/procurement/benchmark-service.test.ts` | Tests: by item code, by text search, by category; aggregation correctness |
| 7.6 | Write tests: dashboard service | `packages/core/tests/procurement/dashboard-service.test.ts` | Tests: each of 9 sections returns correct data; empty project returns zeros |

**Verification:** Dashboard returns complete summary object. Benchmark panel returns price comparison data. All tests pass.

### Phase 8: UI Screens (22 tasks)

All UI tasks reuse M2 components: `RegisterFilterBar`, `StatusBadge`, `TransitionActions`, `WorkflowTimeline`, `AuditTrail`, `DocumentPanel`.

| # | Task | Files | Notes |
|---|------|-------|-------|
| 8.1 | Create procurement navigation in project sidebar | Modify `apps/web/components/layout/project-sidebar.tsx` (or equivalent nav) | Add Procurement section with 9 nav items |
| 8.2 | Create entity-level procurement navigation | Modify entity settings layout | Add Procurement Categories, Item Catalog, Vendor Master links |
| 8.3 | Procurement Dashboard screen | `apps/web/app/(app)/projects/[projectId]/procurement/page.tsx`, `components/procurement/dashboard-cards.tsx` | 9 summary cards, drilldown links, 4 tracker mini-views |
| 8.4 | Vendor List screen (entity-scoped) | `apps/web/app/(app)/entities/[entityId]/procurement/vendors/page.tsx`, `components/procurement/vendor-list.tsx` | RegisterFilterBar, entity-scoped |
| 8.5 | Vendor Detail screen | `apps/web/app/(app)/entities/[entityId]/procurement/vendors/[vendorId]/page.tsx`, `components/procurement/vendor-detail.tsx` | Status badge, linked projects, action buttons |
| 8.6 | Vendor Contract List screen | `apps/web/app/(app)/projects/[projectId]/procurement/contracts/page.tsx`, `components/procurement/vendor-contract-list.tsx` | RegisterFilterBar, project-scoped |
| 8.7 | Vendor Contract Detail screen | `apps/web/app/(app)/projects/[projectId]/procurement/contracts/[contractId]/page.tsx`, `components/procurement/vendor-contract-detail.tsx` | WorkflowTimeline, amendment history, documents |
| 8.8 | Framework Agreement List screen | `apps/web/app/(app)/projects/[projectId]/procurement/framework-agreements/page.tsx`, `components/procurement/framework-agreement-list.tsx` | Utilization column |
| 8.9 | Framework Agreement Detail screen | `...framework-agreements/[agreementId]/page.tsx`, `components/procurement/framework-agreement-detail.tsx` | Line items table, utilization summary |
| 8.10 | RFQ List screen | `apps/web/app/(app)/projects/[projectId]/procurement/rfqs/page.tsx`, `components/procurement/rfq-list.tsx` | Status pipeline badges |
| 8.11 | RFQ Detail screen + Quotation Comparison section | `...rfqs/[rfqId]/page.tsx`, `components/procurement/rfq-detail.tsx`, `components/procurement/quotation-comparison.tsx` | Side-by-side comparison inline; invited vendors; RFQ items |
| 8.12 | Purchase Order List screen | `apps/web/app/(app)/projects/[projectId]/procurement/purchase-orders/page.tsx`, `components/procurement/purchase-order-list.tsx` | Delivery status + payment status columns |
| 8.13 | Purchase Order Detail screen + Benchmark panel | `...purchase-orders/[poId]/page.tsx`, `components/procurement/purchase-order-detail.tsx`, `components/procurement/benchmark-panel.tsx` | Line items, framework deviation flag, benchmark panel, delivery tracking |
| 8.14 | Supplier Invoice List screen | `apps/web/app/(app)/projects/[projectId]/procurement/invoices/page.tsx`, `components/procurement/supplier-invoice-list.tsx` | Overdue flag, payment status |
| 8.15 | Supplier Invoice Detail screen | `...invoices/[invoiceId]/page.tsx`, `components/procurement/supplier-invoice-detail.tsx` | PO link, VAT breakdown, payment phase tracking |
| 8.16 | Expense List screen (subtype tabs) | `apps/web/app/(app)/projects/[projectId]/procurement/expenses/page.tsx`, `components/procurement/expense-list.tsx` | Tab-based subtype filtering (All/Ticket/Accommodation/Transport/Equipment/General) |
| 8.17 | Expense Detail screen (subtype-aware) | `...expenses/[expenseId]/page.tsx`, `components/procurement/expense-detail.tsx` | Dynamic field layout per subtype |
| 8.18 | Credit Note List screen | `apps/web/app/(app)/projects/[projectId]/procurement/credit-notes/page.tsx`, `components/procurement/credit-note-list.tsx` | Subtype badge, linked invoice reference |
| 8.19 | Credit Note Detail screen | `...credit-notes/[creditNoteId]/page.tsx`, `components/procurement/credit-note-detail.tsx` | Flexible linkage display (vendor, invoice, PO, correspondence) |
| 8.20 | Procurement Category management screen (entity-scoped) | `apps/web/app/(app)/entities/[entityId]/procurement/categories/page.tsx`, `components/procurement/category-tree.tsx` | Hierarchical tree view, add/edit/archive |
| 8.21 | Item Catalog management screen (entity-scoped) | `apps/web/app/(app)/entities/[entityId]/procurement/catalog/page.tsx`, `components/procurement/item-catalog-list.tsx` | Search, category filter |
| 8.22 | 4 Tracker views (sub-pages or tabs of dashboard) | `apps/web/app/(app)/projects/[projectId]/procurement/trackers/rfq-to-po/page.tsx`, `po-delivery/page.tsx`, `invoice-payment/page.tsx`, `commitment-actual/page.tsx` | Read-only aggregation views using RegisterFilterBar |

**Verification:** All 18 screens render correctly. Navigation works. Entity-scoped screens enforce entity membership. Dashboard drilldown links work. Benchmark panel shows on PO creation and quotation evaluation.

---

## 3. Schema & Migration Order

### Single Migration Strategy

One Prisma migration: `{timestamp}_add_procurement_engine`. All additive -- no destructive changes to M1/M2 tables.

### Model Creation Order (within migration)

Prisma handles model ordering automatically, but logical dependency order for understanding:

```
1. Enums (6 enums)
2. ProcurementCategory (self-referencing, depends on Entity)
3. ItemCatalog (depends on Entity, ProcurementCategory)
4. Vendor (depends on Entity)
5. ProjectVendor (depends on Project, Vendor)
6. VendorContract (depends on Project, Vendor; self-ref parentContractId)
7. FrameworkAgreement (depends on Vendor; nullable Project, Entity)
8. FrameworkAgreementItem (depends on FrameworkAgreement, ItemCatalog)
9. RFQ (depends on Project, ProcurementCategory)
10. RFQItem (depends on RFQ, ItemCatalog)
11. RFQVendor (depends on RFQ, Vendor)
12. Quotation (depends on RFQ, Vendor)
13. QuotationLineItem (depends on Quotation, ItemCatalog, RFQItem)
14. PurchaseOrder (depends on Project, Vendor, RFQ, Quotation, VendorContract, FrameworkAgreement, ProcurementCategory)
15. PurchaseOrderItem (depends on PurchaseOrder, ItemCatalog)
16. SupplierInvoice (depends on Project, Vendor, PurchaseOrder, ProcurementCategory)
17. Expense (depends on Project, PurchaseOrder, ProcurementCategory)
18. CreditNote (depends on Project, Vendor, SupplierInvoice, PurchaseOrder, M2 Correspondence)
```

### Existing Model Modifications

Only relation arrays added (no DB columns):
- **Project**: +9 relation arrays (vendorContracts, frameworkAgreements, rfqs, quotations, purchaseOrders, supplierInvoices, expenses, creditNotes, projectVendors)
- **Entity**: +3 relation arrays (vendors, procurementCategories, itemCatalogs)
- **M2 Correspondence**: +1 relation array (creditNotes) for back_charge cross-reference

### Index Strategy

Per design spec section 19:
- All project-scoped: `@@index([projectId, status])` + `@@index([projectId, createdAt])`
- Entity-scoped: `@@index([entityId, status])`
- FK columns: individual indexes for join performance
- Composite uniques: `(entityId, vendorCode)`, `(entityId, code)` for categories, `(entityId, itemCode)` for catalog

---

## 4. Seed Strategy

### Seed Execution Order

```
1. procurement-permissions.ts       — ~72 permission codes
2. procurement-role-permissions.ts  — ~72 × 14 role mappings
3. procurement-workflow-templates.ts — ~14 templates with steps
4. procurement-notification-templates.ts — ~10 templates
5. procurement-categories.ts        — 9 top-level + subcategories (entity-scoped)
```

### Idempotency Rules

Same pattern as M2 seeds:
- Use `upsert` keyed on unique identifiers (permission code, template code, category code+entityId)
- Run twice, verify no duplicates
- Categories seeded per entity -- uses first entity from DB or creates none if no entities exist

### Permission Code Naming

Pattern: `{resource}.{action}` — e.g., `vendor.create`, `purchase_order.sign`, `expense.approve`

11 resources × 6-9 actions each = ~72 codes total (exact per design spec section 17).

### Workflow Template Structure

Each template follows M2 pattern:
```typescript
{
  code: 'po_standard',
  name: 'Purchase Order — Standard',
  resourceType: 'purchase_order',
  steps: [
    { order: 1, name: 'PM Review', approverRole: 'project_manager', action: 'review' },
    { order: 2, name: 'Procurement Manager Review', approverRole: 'procurement', action: 'review' },
    { order: 3, name: 'Finance Check', approverRole: 'finance', action: 'approve' },
    { order: 4, name: 'Contracts Manager Sign', approverRole: 'contracts_manager', action: 'sign' },
  ],
}
```

### Category Seed Data

9 top-level categories + subcategories per design spec section 19. Spend types (level 3) left for entity admin configuration -- not seeded.

---

## 5. Backend Service Breakdown

### Service Architecture

```
packages/core/src/procurement/
├── vendor/                      # Tier 1 — entity-scoped master
│   ├── service.ts               # CRUD + status transitions (no workflow)
│   ├── project-vendor-service.ts # Link/unlink vendors to projects
│   ├── validation.ts
│   └── index.ts
├── category/                    # Tier 1 — entity-scoped config
│   ├── service.ts               # 3-level hierarchy CRUD + tree query
│   ├── validation.ts
│   └── index.ts
├── catalog/                     # Tier 1 — entity-scoped master
│   ├── service.ts               # CRUD + text search for quotation memory
│   ├── validation.ts
│   └── index.ts
├── vendor-contract/             # Tier 2 — contract chain
│   ├── service.ts               # CRUD + workflow + posting (VENDOR_CONTRACT_SIGNED)
│   ├── validation.ts
│   └── index.ts
├── framework-agreement/         # Tier 2 — rate agreements
│   ├── service.ts               # CRUD + line items + utilization + audit-only event
│   ├── validation.ts
│   └── index.ts
├── rfq/                         # Tier 2 — sourcing
│   ├── service.ts               # CRUD + status + vendor invitation + line items
│   ├── validation.ts
│   └── index.ts
├── quotation/                   # Tier 2 — vendor responses
│   ├── service.ts               # CRUD + status + line items + comparison query
│   ├── validation.ts
│   └── index.ts
├── purchase-order/              # Tier 3 — commitment
│   ├── service.ts               # CRUD + line items + delivery + framework + posting
│   ├── validation.ts
│   └── index.ts
├── supplier-invoice/            # Tier 3 — payable
│   ├── service.ts               # CRUD + conditional PO + payment phase + posting
│   ├── validation.ts
│   └── index.ts
├── expense/                     # Tier 3 — direct costs
│   ├── service.ts               # CRUD + subtype validation + posting
│   ├── validation.ts
│   └── index.ts
├── credit-note/                 # Tier 3 — recoveries
│   ├── service.ts               # CRUD + flexible linkage + posting
│   ├── validation.ts
│   └── index.ts
├── benchmark/                   # Phase 7 — read-only
│   ├── service.ts               # Price comparison queries (entity-wide)
│   └── index.ts
├── dashboard/                   # Phase 7 — aggregation
│   ├── service.ts               # 9-section summary + 4 tracker queries
│   └── index.ts
├── posting-hooks/               # Phase 3 — infrastructure
│   ├── register.ts              # Registers 7 event types at boot
│   ├── schemas.ts               # Zod payload schemas
│   └── index.ts
└── index.ts                     # Barrel export
```

### Service Implementation Pattern (same as M2)

Each service exports:
- `create(ctx, input)` — validates input via Zod, creates record, writes audit log
- `update(ctx, id, input)` — validates, updates draft record, writes audit log
- `get(ctx, id)` — retrieves with includes
- `list(ctx, filters)` — paginated, filtered, sorted
- `transition(ctx, id, action, comment?)` — validates transition map, updates status, fires side effects (posting, workflow, audit)
- `delete(ctx, id)` — soft delete draft only

### Status Transition Pattern

```typescript
const TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved_internal', 'returned', 'rejected'],
  // ...
};

function validateTransition(current: string, next: string): void {
  const allowed = TRANSITIONS[current];
  if (!allowed?.includes(next)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot transition from ${current} to ${next}` });
  }
}
```

### Side Effect Orchestration (on transition)

```typescript
// 1. Validate transition
// 2. Update record status (in transaction)
// 3. Assign reference number (if applicable, in same transaction)
// 4. Write audit log (in same transaction)
// 5. Fire posting event (if applicable, idempotent)
// 6. Emit notification
// 7. Advance workflow instance (if applicable)
```

---

## 6. Router / API Breakdown

### tRPC Router Structure

```
apps/web/server/routers/procurement/
├── index.ts              # Barrel: merges all sub-routers into `procurement` router
├── vendor.ts             # entityProcedure — list, get, create, update, transition, delete
├── project-vendor.ts     # projectProcedure — list, link, unlink
├── vendor-contract.ts    # projectProcedure — list, get, create, update, transition, delete
├── framework-agreement.ts # projectProcedure (or entityProcedure for entity-wide)
├── rfq.ts                # projectProcedure — includes addVendor, removeVendor
├── quotation.ts          # projectProcedure — includes compare
├── purchase-order.ts     # projectProcedure
├── supplier-invoice.ts   # projectProcedure
├── expense.ts            # projectProcedure — list filterable by subtype
├── credit-note.ts        # projectProcedure
├── category.ts           # entityProcedure
├── catalog.ts            # entityProcedure — includes search
├── benchmark.ts          # projectProcedure — read-only (forItem, forLineItems)
└── dashboard.ts          # projectProcedure — summary
```

### Procedure Types

| Router | Middleware | Permission Check |
|--------|-----------|-----------------|
| vendor | `entityProcedure` | `vendor.*` checked against aggregated entity permissions |
| projectVendor | `projectProcedure` | `project_vendor.manage` for link/unlink |
| category | `entityProcedure` | `procurement_category.manage` for writes, `view` for reads |
| catalog | `entityProcedure` | `item_catalog.manage` for writes, `view` for reads |
| All others | `projectProcedure` | Resource-specific permission per action |

### Input/Output Pattern

Same as M2:
- Input: Zod schema from `@fmksa/contracts`
- Output: Prisma record with includes, serialized via tRPC superjson
- Pagination: `{ skip, take }` pattern; returns `{ items, total }`
- Filters: typed Zod object per list endpoint

---

## 7. UI / Screen Implementation Breakdown

### Component Architecture

**Shared components (reuse from M2):**
- `RegisterFilterBar` — all list screens
- `StatusBadge` — all record status display
- `TransitionActions` — all workflow action buttons
- `WorkflowTimeline` — all detail views
- `AuditTrail` — all detail views (if already extracted)
- `DocumentPanel` — all detail views

**New shared components (M3-specific):**
- `BenchmarkPanel` — shows on PO detail + quotation evaluation
- `QuotationComparison` — side-by-side comparison table within RFQ detail
- `CategoryTree` — hierarchical tree view for category management
- `SubtypeTabs` — tab-based subtype filtering for Expense list (reusable from M2 Correspondence tabs)
- `EntityScopeGuard` — wrapper for entity-scoped screens

### Screen Implementation Order

```
Phase 8a (entity-scoped screens):
  8.1  Navigation (project + entity)
  8.2  Entity navigation
  8.20 Procurement Category management
  8.21 Item Catalog management
  8.4  Vendor List
  8.5  Vendor Detail

Phase 8b (contract + sourcing screens):
  8.6  Vendor Contract List
  8.7  Vendor Contract Detail
  8.8  Framework Agreement List
  8.9  Framework Agreement Detail
  8.10 RFQ List
  8.11 RFQ Detail + Quotation Comparison

Phase 8c (commitment + payable screens):
  8.12 Purchase Order List
  8.13 Purchase Order Detail + Benchmark Panel
  8.14 Supplier Invoice List
  8.15 Supplier Invoice Detail
  8.16 Expense List (subtype tabs)
  8.17 Expense Detail (subtype-aware)
  8.18 Credit Note List
  8.19 Credit Note Detail

Phase 8d (dashboard + trackers):
  8.3  Procurement Dashboard
  8.22 4 Tracker views
```

### Route Structure

```
/projects/[projectId]/procurement/                          — Dashboard
/projects/[projectId]/procurement/contracts/                — Vendor Contract List
/projects/[projectId]/procurement/contracts/[id]            — Vendor Contract Detail
/projects/[projectId]/procurement/framework-agreements/     — FA List
/projects/[projectId]/procurement/framework-agreements/[id] — FA Detail
/projects/[projectId]/procurement/rfqs/                     — RFQ List
/projects/[projectId]/procurement/rfqs/[id]                 — RFQ Detail + Comparison
/projects/[projectId]/procurement/purchase-orders/          — PO List
/projects/[projectId]/procurement/purchase-orders/[id]      — PO Detail
/projects/[projectId]/procurement/invoices/                 — SI List
/projects/[projectId]/procurement/invoices/[id]             — SI Detail
/projects/[projectId]/procurement/expenses/                 — Expense List
/projects/[projectId]/procurement/expenses/[id]             — Expense Detail
/projects/[projectId]/procurement/credit-notes/             — CN List
/projects/[projectId]/procurement/credit-notes/[id]         — CN Detail
/projects/[projectId]/procurement/trackers/rfq-to-po        — Tracker
/projects/[projectId]/procurement/trackers/po-delivery      — Tracker
/projects/[projectId]/procurement/trackers/invoice-payment  — Tracker
/projects/[projectId]/procurement/trackers/commitment-actual — Tracker

/entities/[entityId]/procurement/vendors/                   — Vendor List
/entities/[entityId]/procurement/vendors/[id]               — Vendor Detail
/entities/[entityId]/procurement/categories/                — Category Management
/entities/[entityId]/procurement/catalog/                   — Item Catalog
```

---

## 8. Posting Event Tasks

### Event Registration (Phase 3, Task 3.2)

Register 7 event types via `registerEventType()` in `posting-hooks/register.ts`:

| Event | Firm/Informational | Registration |
|-------|-------------------|--------------|
| `PO_ISSUED` | Firm (ledger) | `registerEventType('PO_ISSUED', PO_ISSUED_SCHEMA)` |
| `PO_DELIVERED` | Firm (ledger) | `registerEventType('PO_DELIVERED', PO_DELIVERED_SCHEMA)` |
| `SUPPLIER_INVOICE_APPROVED` | Firm (ledger) | `registerEventType('SUPPLIER_INVOICE_APPROVED', ...)` |
| `EXPENSE_APPROVED` | Firm (ledger) | `registerEventType('EXPENSE_APPROVED', ...)` |
| `CREDIT_NOTE_APPLIED` | Firm (ledger) | `registerEventType('CREDIT_NOTE_APPLIED', ...)` |
| `VENDOR_CONTRACT_SIGNED` | Firm (ledger) | `registerEventType('VENDOR_CONTRACT_SIGNED', ...)` |
| `FRAMEWORK_AGREEMENT_ACTIVE` | Informational (NO ledger) | Audit log + notification only. If complex, drop entirely. |

### Posting Integration (Phase 5-6)

Each service's `transition()` method calls `postingService.post()` inside the status update transaction:

```typescript
// In PO service transition to 'issued':
await postingService.post({
  eventType: 'PO_ISSUED',
  resourceType: 'purchase_order',
  resourceId: po.id,
  payload: { purchaseOrderId: po.id, poNumber: po.poNumber, ... },
  projectId: po.projectId,
  idempotencyKey: `purchase_order:${po.id}:issued`,
});
```

### Idempotency Key Pattern

`{resourceType}:{recordId}:{targetStatus}` — ensures exactly-once posting even if transition is retried.

### FRAMEWORK_AGREEMENT_ACTIVE — Special Handling

```typescript
// In FA service transition to 'active':
// NO postingService.post() call
await auditService.log({
  action: 'FRAMEWORK_AGREEMENT_ACTIVE',
  resourceType: 'framework_agreement',
  resourceId: fa.id,
  // ...
});
// Optional: emit notification
```

If this proves complex to implement differently from the standard pattern, **drop the event entirely**. Do not force a non-standard code path that adds maintenance burden.

---

## 9. Workflow Template Tasks

### Template Creation (Phase 2, Task 2.3)

~14 workflow templates seeded:

| # | Code | Resource Type | Steps |
|---|------|--------------|-------|
| 1 | `vendor_contract_standard` | `vendor_contract` | 6 steps (Prepare → PM Review → Contracts Review → Finance Check → PD Sign → Active) |
| 2 | `vendor_contract_low_value` | `vendor_contract` | 4 steps (skip finance check) |
| 3 | `framework_agreement_standard` | `framework_agreement` | 5 steps (Prepare → Contracts Review → Finance Check → PD Approval → Sign → Active) |
| 4 | `rfq_standard` | `rfq` | 2 steps (Prepare → Procurement Manager Approval → Issue) |
| 5 | `rfq_with_pm` | `rfq` | 3 steps (Prepare → PM Review → Procurement Manager Approval → Issue) |
| 6 | `po_standard` | `purchase_order` | 5 steps (Prepare → PM Review → Procurement Mgr Review → Finance Check → Contracts Manager Sign → Issue) |
| 7 | `po_high_value` | `purchase_order` | 5 steps (... → PD Sign instead of Contracts Manager Sign) |
| 8 | `supplier_invoice_standard` | `supplier_invoice` | 4 steps (Received → Procurement Verify → Finance Review → Finance Manager Approval → Payment Prep) |
| 9 | `supplier_invoice_high_value` | `supplier_invoice` | 5 steps (+ PD Approval before Payment Prep) |
| 10 | `expense_standard` | `expense` | 3 steps (Submit → PM Review → Finance Review → Finance Approval) |
| 11 | `expense_high_value` | `expense` | 4 steps (+ PD Approval) |
| 12 | `credit_note_standard` | `credit_note` | 3 steps (Received → Finance Review → Finance Manager Verify → Applied) |

### Template Activation

Templates are activated per project via project settings (existing M1 mechanism). M3 templates use the same `WorkflowTemplate` and `WorkflowTemplateStep` models from M1 — no new workflow infrastructure needed.

### Finance Check = Workflow Step

Finance checks are standard workflow steps where `approverRole: 'finance'`. Low-value template variants simply omit the finance step. No special "finance check" mechanism needed beyond the existing workflow engine.

---

## 10. Permission / Role Tasks

### Permission Seeding (Phase 2, Tasks 2.1-2.2)

**11 permission resources:**
1. `vendor` (6 actions)
2. `vendor_contract` (8 actions)
3. `framework_agreement` (8 actions)
4. `rfq` (9 actions)
5. `quotation` (7 actions)
6. `purchase_order` (8 actions)
7. `supplier_invoice` (7 actions)
8. `expense` (6 actions)
9. `credit_note` (6 actions)
10. `procurement_dashboard` (1 action)
11. `procurement_category` (2 actions)
12. `item_catalog` (2 actions)
13. `project_vendor` (2 actions)

**Total: ~72 permission codes.**

**14 roles x 72 permissions = ~1,008 role-permission mappings** (most are grant: false). Only grant: true entries need seeding.

### Entity-Scope Permission Check (Phase 3, Task 3.1)

The `entityProcedure` middleware:

```typescript
// 1. Extract entityId from request
// 2. Query ProjectAssignment where project.entityId = entityId AND userId = ctx.user.id
// 3. If no assignments → FORBIDDEN
// 4. Aggregate permissions from all matched project roles (union of grants)
// 5. Check required permission against aggregated set
// 6. Attach entityId + effective permissions to context
```

This is the key RBAC extension for M3. No new tables -- derives entity membership from existing `ProjectAssignment` records.

### Family-Based Permissions

No per-subtype permission explosion. `expense.create` covers all 5 subtypes. `credit_note.apply` covers all 3 subtypes. Same pattern as M2 Correspondence.

---

## 11. Filter / Drilldown Tasks

### Filter Implementation (Phase 8, per-screen)

Each list screen uses `RegisterFilterBar` from M2 with record-specific filter configs:

| Screen | Unique Filters |
|--------|---------------|
| Vendor | classification (category tree), country, text search (name/code) |
| VendorContract | vendor select, contract type, active/expired toggle, value range |
| FrameworkAgreement | vendor select, active/expired toggle, item text search |
| RFQ | category select, required-by date, vendor (invited) |
| PurchaseOrder | vendor, category, delivery status, value range |
| SupplierInvoice | vendor, PO, payment status, due date, overdue flag |
| Expense | subtype tabs (All/Ticket/Accommodation/Transport/Equipment/General), category, originator |
| CreditNote | vendor, subtype, linked invoice |

### URL-Shareable Filter State

All filter values serialized to URL query params. Same pattern as M2:
- `?status=issued,acknowledged` for multi-select
- `?vendor=uuid` for single select
- `?from=2026-01-01&to=2026-12-31` for date ranges
- `?min=10000&max=50000` for amount ranges

### Dashboard Drilldown

Dashboard cards link to pre-filtered list views:
- "5 POs awaiting delivery" → `/procurement/purchase-orders?status=issued,acknowledged`
- "3 invoices overdue" → `/procurement/invoices?overdue=true`
- "Pending approvals (4)" → `/approvals?resourceType=procurement` (links to existing approvals page with filter)

---

## 12. Test Strategy & Matrix

### Test Organization

```
packages/core/tests/procurement/
├── vendor-service.test.ts              # Tier 1
├── category-service.test.ts            # Tier 1
├── catalog-service.test.ts             # Tier 1
├── vendor-contract-service.test.ts     # Tier 2
├── framework-agreement-service.test.ts # Tier 2
├── rfq-service.test.ts                 # Tier 2
├── quotation-service.test.ts           # Tier 2
├── purchase-order-service.test.ts      # Tier 3
├── supplier-invoice-service.test.ts    # Tier 3
├── expense-service.test.ts             # Tier 3
├── credit-note-service.test.ts         # Tier 3
├── posting-hooks.test.ts              # Cross-cutting
├── benchmark-service.test.ts          # Phase 7
├── dashboard-service.test.ts          # Phase 7
└── lifecycle-integration.test.ts      # Cross-model E2E
```

### Test Matrix Per Service

| Test Category | Description | Est. Tests Per Service |
|---------------|-------------|----------------------|
| CRUD | Create, read, update, list, delete draft | 5-7 |
| Status transitions | Valid transitions, invalid transitions rejected | 8-12 |
| Posting events | Correct event fired, payload valid, idempotent | 3-5 |
| Permission denied | Unauthorized role rejected | 2-4 |
| Entity isolation | Cross-entity records not visible | 2-3 |
| Validation | Required fields, type checking, FK existence | 5-8 |

### Integration Test Scenarios

**lifecycle-integration.test.ts** covers:
1. Full sourcing chain: Vendor → RFQ → Quotation → Award → PO → Delivery → SupplierInvoice → Payment
2. Expense lifecycle: Create → Submit → PM Review → Finance Approve → Payment
3. CreditNote lifecycle: Receive → Review → Verify → Apply
4. Framework agreement: Create → Active → PO with framework rate → Deviation flag
5. Conditional PO rule: Goods invoice without PO rejected; service invoice without PO allowed
6. Entity-scope: Vendor visible across projects in entity, not visible to other entity

### Estimated Test Count

| Phase | Service/Area | Est. Tests |
|-------|-------------|------------|
| Phase 4 | Vendor, Category, Catalog, ProjectVendor | ~40 |
| Phase 5 | VendorContract, FrameworkAgreement, RFQ, Quotation | ~80 |
| Phase 6 | PurchaseOrder, SupplierInvoice, Expense, CreditNote | ~100 |
| Phase 6 | Posting hooks, lifecycle integration | ~30 |
| Phase 7 | Benchmark, Dashboard | ~25 |
| **Total** | | **~275 tests** |

### Test Environment

Same as M2: Vitest + real PostgreSQL (test database) + Prisma migrations applied before test suite.

---

## 13. Infrastructure / Developer Experience Implications

### New Dependencies

- **None.** M3 uses only existing dependencies (Prisma, tRPC, Zod, BullMQ for notifications).

### New Middleware

- `entityProcedure` — new tRPC middleware for entity-scoped routes. Located in `apps/web/server/middleware/` alongside existing `projectProcedure`.

### Package Modifications

| Package | Change |
|---------|--------|
| `@fmksa/core` | New `procurement/` directory with 12 sub-modules |
| `@fmksa/contracts` | New `procurement/` directory with 12 Zod schema files |
| `@fmksa/db` | Migration + 5 new seed files + schema changes |
| `apps/web` | New `procurement/` router directory + ~40 new page/component files |

### Development Server Impact

- Prisma client regeneration needed after schema change (Phase 1)
- Seed script needs re-run after seeds added (Phase 2)
- No new infrastructure (Redis, queues, etc.) needed

### TypeScript Build Impact

M3 adds significant type surface area (~18 Prisma models, ~12 Zod schemas). Incremental builds should handle this, but full `tsc --noEmit` will take slightly longer.

---

## 14. Critical Path & Parallel Work

### Critical Path

```
Phase 1 (Schema) → Phase 3 (Infrastructure) → Phase 4 (Tier 1) → Phase 5 (Tier 2) → Phase 6 (Tier 3) → Phase 7 (Dashboard) → Phase 8 (UI)
```

Phase 2 (Seeds) can run in parallel with Phase 3 after Phase 1 completes.

### Parallelizable Work

```
After Phase 1 completes:
  ├── Phase 2 (Seeds) — independent
  └── Phase 3 (Infrastructure) — independent
       └── Both must complete before Phase 4

After Phase 4 completes:
  ├── Phase 5 tasks 5.1-5.4 (services) — each independent
  └── Phase 5 tasks 5.5-5.6 (routers) — depend on services

After Phase 6 completes:
  ├── Phase 7 (Dashboard/Benchmark) — depends on all services
  └── Phase 8a (entity screens) — can start after Phase 4

Phase 8 sub-phases:
  ├── 8a (entity screens) — can start after Phase 4
  ├── 8b (contract/sourcing) — can start after Phase 5
  ├── 8c (commitment/payable) — can start after Phase 6
  └── 8d (dashboard/trackers) — must wait for Phase 7
```

### Subagent Strategy

When executing, use subagent-driven development:

| Subagent | Model | Work |
|----------|-------|------|
| Schema subagent | Opus | Phase 1 (schema design requires correctness) |
| Seeds subagent | Sonnet | Phase 2 (mechanical, follows M2 pattern) |
| Infrastructure subagent | Opus | Phase 3 (entityProcedure is novel) |
| Service subagent (per tier) | Opus | Phase 4-6 (business logic) |
| Dashboard subagent | Sonnet | Phase 7 (aggregation queries) |
| UI subagent (per sub-phase) | Sonnet | Phase 8 (follows M2 UI patterns) |
| Test subagent | Opus | Tests within each phase (correctness critical) |

---

## 15. Risks & Blockers

| # | Risk | Severity | Mitigation | Phase |
|---|------|----------|------------|-------|
| 1 | **Entity-scope RBAC complexity** | High | Design `entityProcedure` carefully in Phase 3. Test entity isolation exhaustively. Fall back to "any project membership = full entity access" if aggregation is too complex. | 3 |
| 2 | **Schema size (18 models in one migration)** | Medium | Keep models additive-only. Test migration on clean DB and on existing M1+M2 DB. | 1 |
| 3 | **Seed data volume (~72 permissions × 14 roles)** | Low | Use bulk upsert. Test idempotency. | 2 |
| 4 | **FRAMEWORK_AGREEMENT_ACTIVE implementation** | Medium | Try audit-only approach first. If it adds complexity beyond 30 minutes of work, drop it entirely (locked directive). | 5 |
| 5 | **Conditional PO rule ambiguity** | Medium | Implement as service-layer check using category classification. Document clearly which categories require PO. | 6 |
| 6 | **Expense subtype nullable columns** | Low | Proven pattern from M2 Correspondence. Subtype-specific validation handles null checks. | 6 |
| 7 | **Quotation comparison query performance** | Low | Query is scoped to one RFQ's quotations (small N). No optimization needed. | 5 |
| 8 | **Benchmark query on large datasets** | Low | Scoped to entity + category. Indexed. Cached per request. | 7 |
| 9 | **18 screens is more than M2's 12** | Medium | Screens follow identical patterns. Component reuse reduces unique code. | 8 |
| 10 | **M2 Correspondence back_charge FK** | Low | Optional FK. CreditNote works without it. If M2 model doesn't expose relation, add relation array only. | 1 |
| 11 | **Pre-existing M1 flaky tests** | Low | Known issue from M2 merge. If they fail during M3, skip and document. Not M3's responsibility. | All |

### Blockers

| Blocker | Condition | Resolution |
|---------|-----------|------------|
| Ahmed's approval | This plan requires approval before any coding begins | Wait for explicit "approved" |
| Database access | Dev PostgreSQL must be running for migration and tests | Standard dev setup |
| M2 merge integrity | Main branch must have M2 cleanly merged | Verified at `1e4935d` |

---

## 16. Learning-Mode Pauses

During implementation, the following decision points should pause for Ahmed's input or brief explanation of trade-offs:

| # | Pause Point | Phase | What Ahmed Decides / Learns |
|---|-------------|-------|-----------------------------|
| L1 | `entityProcedure` middleware design | 3 | Review the entity-scope RBAC mechanism implementation. Understand how entity membership is derived from ProjectAssignment. Opportunity to refine the aggregation logic. |
| L2 | Status transition map implementation | 4 | Brief walkthrough of how `Record<Status, Status[]>` maps work. Ahmed may want to adjust allowed transitions for Vendor (the simplest model). |
| L3 | Framework agreement warn/suggest logic | 5 | Understand how framework rate pre-population and deviation detection work. This is a UX decision point — how visible should the warning be? |
| L4 | Conditional PO linkage enforcement | 6 | Review which category types require PO. Ahmed may want to define the exact category-to-PO-requirement mapping instead of using defaults. |
| L5 | Expense subtype field layout | 8 | Review the subtype-aware form layout for Expense detail. 5 different field configurations — Ahmed may want to adjust which fields are shown per subtype. |
| L6 | Dashboard card selection | 8 | Review the 9 dashboard sections and 4 tracker views. Ahmed may want to reorder or prioritize which cards appear first. |
| L7 | Benchmark panel data display | 8 | Review how price comparison data is presented. Ahmed may want to adjust the threshold for "significant deviation" warnings. |

### Learning-Mode Guidelines

- Keep pauses brief (5-10 minutes of discussion)
- Always present the proposed approach with 2-3 trade-offs
- Ahmed's decisions are recorded and locked
- If Ahmed says "use your judgment," proceed with the proposed approach
- Do not pause for purely mechanical tasks (CRUD, routing, styling)

---

## Appendix A: File Count Estimate

| Category | New Files | Modified Files |
|----------|-----------|----------------|
| Schema / Migration | 1 | 1 (schema.prisma) |
| Seed data | 5 | 1 (seed/index.ts) |
| Core services | ~36 (12 modules × 3 files avg) | 1 (core/index.ts) |
| Posting hooks | 3 | 0 |
| Contracts (Zod) | 13 | 1 (contracts/index.ts) |
| Middleware | 1 | 0 |
| tRPC routers | 15 | 1 (_app.ts) |
| UI pages | ~22 | 0 |
| UI components | ~20 | 2 (nav files) |
| Tests | ~15 | 0 |
| **Total** | **~131** | **~7** |

---

## Appendix B: Commit Strategy

| Phase | Commit Message |
|-------|---------------|
| 1 | `feat(db): add procurement engine schema — 18 models, 6 enums, single migration` |
| 2 | `feat(db): seed procurement permissions, workflow templates, categories, and notification templates` |
| 3 | `feat(core): procurement infrastructure — entityProcedure, posting hooks, Zod contracts` |
| 4 | `feat(core): procurement Tier 1 services — Vendor, Category, Catalog, ProjectVendor` |
| 5 | `feat(core): procurement Tier 2 services — VendorContract, FrameworkAgreement, RFQ, Quotation` |
| 6 | `feat(core): procurement Tier 3 services — PurchaseOrder, SupplierInvoice, Expense, CreditNote` |
| 7 | `feat(core): procurement dashboard, benchmark, and tracker services` |
| 8a | `feat(web): entity-scoped procurement screens — Vendor, Category, Catalog` |
| 8b | `feat(web): contract and sourcing screens — VendorContract, FrameworkAgreement, RFQ, QuotationComparison` |
| 8c | `feat(web): commitment and payable screens — PO, SupplierInvoice, Expense, CreditNote` |
| 8d | `feat(web): procurement dashboard, tracker views, and navigation` |
| Final | `feat: Module 3 Procurement Engine complete — 18 models, 18 screens, 7 posting events, ~275 tests` |

---

## Appendix C: Definition of Done Cross-Reference

| DoD Item (from Design Spec §23) | Implementation Phase |
|---|---|
| 1. Schema: All models created | Phase 1 |
| 2. Migration: Single additive migration | Phase 1 |
| 3. Seeds: Permissions, templates, categories | Phase 2 |
| 4. Services: One per parent model | Phases 4-6 |
| 5. Status transitions validated | Phases 4-6 |
| 6. Posting events: 6 firm + 1 informational | Phases 3, 5-6 |
| 7. Posting payload validation | Phase 3 |
| 8. Workflow templates functional | Phase 2 (seed) + Phases 5-6 (integration) |
| 9. Entity-scope RBAC | Phase 3 (middleware) + Phase 4 (integration) |
| 10. tRPC routers functional | Phases 4-7 |
| 11. Screens: All 18 functional | Phase 8 |
| 12. Dashboard: 9 sections | Phase 7 (backend) + Phase 8d (UI) |
| 13. Tracker views: 4 views | Phase 7 (backend) + Phase 8d (UI) |
| 14. Quotation comparison | Phase 5 (backend) + Phase 8b (UI) |
| 15. Benchmark panel | Phase 7 (backend) + Phase 8c (UI) |
| 16. Framework agreement warn/suggest | Phase 5 (backend) + Phase 8c (UI) |
| 17. SupplierInvoice PO rule | Phase 6 |
| 18. CreditNote linkage | Phase 6 |
| 19. Reference numbers | Phases 4-6 (per service) |
| 20. Document attachments | Phase 8 (UI) |
| 21. Notifications | Phase 2 (templates) + Phases 5-6 (emission) |
| 22. M1 invariants upheld | All phases |
| 23. TypeScript clean | Verified per phase |
| 24. Test coverage | Phases 4-7 |
