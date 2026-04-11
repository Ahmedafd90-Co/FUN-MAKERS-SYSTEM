# Module 3 — Procurement / Purchasing Engine — Design

**Project:** Pico Play Fun Makers KSA — Internal Operations Platform
**Module:** 3 of 7 — Procurement / Purchasing Engine
**Date:** 2026-04-11
**Owner:** Ahmed Al-Dossary (Project Director, Pico Play)
**Status:** DRAFT — awaiting Ahmed's approval
**Prerequisite:** Module 2 merged to main (`1e4935d`)
**Scope lock:** `docs/module-3-scope-lock.md` (12 critical decisions locked)

---

## 1. Executive Summary

Module 3 delivers the **Procurement / Purchasing Engine** — the payable/commitment side of the platform, complementing Module 2's receivable/commercial side. It enables internal teams to manage vendors, source goods and services through RFQs and quotation evaluation, issue purchase orders, track supplier invoices through payment approval, record project expenses, and handle credits and recoveries.

Every record type plugs into the Module 1 infrastructure: workflow engine for approvals, posting engine for commitment/payable tracking, digital signing for immutability, audit logging for traceability, and RBAC for access control. Module 3 introduces entity-scoped records (Vendor, ItemCatalog, ProcurementCategory) alongside the existing project-scoped pattern, requiring a defined entity-scope RBAC mechanism.

Module 3 does **not** introduce a full payables ledger, budget/cost-code management, cashflow forecasting, cross-project spend analytics, vendor performance scoring, warehouse/inventory management, or AI-driven procurement optimization. It stays focused on operational procurement control within projects.

**Key numbers:**
- 9 new Prisma models (1 with subtype family: Expense; 1 with subtype family: CreditNote)
- 5 child tables (FrameworkAgreementItem, RFQItem, RFQVendor, QuotationLineItem, PurchaseOrderItem)
- 3 supporting models (ProcurementCategory, ItemCatalog, ProjectVendor)
- 7 posting event types (6 firm + 1 informational non-ledger)
- 18 screens (1 dashboard + 8 list/detail pairs + 1 quotation comparison section)
- ~75 new permission codes (11 resources)
- ~14 seeded workflow templates
- Seed data: 9 top-level procurement categories with subcategories

---

## 2. Module Goals and Non-Goals

### Goals

1. Enable Procurement, Contracts, Finance, and PM teams to manage the full vendor-to-payment lifecycle within a project.
2. Provide an entity-scoped vendor master with project-level vendor links, supporting RBAC at both scopes.
3. Manage RFQ issuance, quotation receipt, side-by-side comparison, and award through a linear workflow.
4. Issue purchase orders with line items, delivery tracking, and finance-check controls.
5. Track supplier invoices from receipt through approval and payment preparation as workflow phases.
6. Record project expenses across 5 subtypes (ticket, accommodation, transportation, equipment, general) with PM-then-Finance approval.
7. Handle credit notes, rebates, and recoveries as a single CreditNote model with flexible vendor/invoice linkage.
8. Provide framework agreements with agreed-rate line items, warn/suggest enforcement on PO creation, and basic utilization tracking.
9. Build a hybrid item catalog with entity-wide quotation history memory for price benchmarking.
10. Fire 6 firm posting events at locked status transitions to feed the payable/commitment pipeline.
11. Deliver a project-scoped procurement dashboard with 9 summary sections and 4 tracker views.
12. Define the full role-permission matrix for procurement operations across all 14 roles.
13. Leave clean extension points for Module 4 (Budget/Cost/Cashflow) and Module 5 (Analytics/KPI).

### Non-Goals

| Item | Reason |
|---|---|
| Full finance ERP (GL, journals, bank reconciliation) | Module 4 |
| Budget, cost codes, allocations, cashflow | Module 4 |
| Full payables ledger / aging reports | Module 4 — M3 fires posting hooks; M4 builds the ledger |
| Payment batching / bank file generation | Module 4 |
| Cross-project spend intelligence | Module 5 |
| Vendor concentration / risk analytics | Module 5 |
| Vendor performance scoring | Module 5 — requires historical data |
| Abnormal spend detection | Module 5 |
| AI procurement optimization / OCR | Module 6-7 |
| Warehouse / inventory management | Not procurement scope |
| Fleet management | Not procurement scope |
| Travel booking platform | M3 tracks costs, doesn't book travel |
| Full vendor portal (external access) | Never — internal-only system |
| Conditional workflow branching | Not in M3 — linear-first locked |
| Multi-currency conversion logic | M3 stores currency; conversion is M4 |
| ZATCA integration | Module 4 or standalone |
| Automated reorder / min-max inventory | Not procurement scope |
| Vendor 360 cross-project view | Module 5 (D45) |
| Saved filter presets (saved views) | Module 5 — M3 uses URL-shareable filter state (D47) |

---

## 3. Included Models and Ownership

### 9 Parent Models + Supporting Tables

| # | Model | Subtypes | Primary Creator | Primary Reviewer | Approver | Scope Level |
|---|-------|----------|----------------|------------------|----------|-------------|
| 1 | `Vendor` | -- | Procurement | Procurement Manager | -- (reference data) | **Entity-scoped** |
| 2 | `VendorContract` | -- | Procurement / Contracts | Contracts Manager | PD | Project-scoped |
| 3 | `FrameworkAgreement` | -- | Procurement / Contracts | Contracts Manager | PD | Entity or project-scoped |
| 4 | `RFQ` | -- | Procurement | PM (optional by template) | Procurement Manager | Project-scoped |
| 5 | `Quotation` | -- | Procurement (receives from vendor) | Procurement / QS | -- (input record) | Project-scoped |
| 6 | `PurchaseOrder` | -- | Procurement | PM review, Finance check | PD sign (by threshold) | Project-scoped |
| 7 | `SupplierInvoice` | -- | Finance or Procurement (D9) | Finance review | Finance Manager / PD | Project-scoped |
| 8 | `Expense` | `ticket`, `accommodation`, `transportation`, `equipment`, `general` | Originating department | PM review | Finance | Project-scoped |
| 9 | `CreditNote` | `credit_note`, `rebate`, `recovery` | Procurement / Finance | Finance review | Finance Manager | Project-scoped |

### Child Tables

| Child Table | Parent | Scope |
|---|---|---|
| `FrameworkAgreementItem` | FrameworkAgreement | Inherits parent |
| `RFQItem` | RFQ | Project-scoped |
| `RFQVendor` | RFQ (junction to Vendor) | Project-scoped |
| `QuotationLineItem` | Quotation | Project-scoped |
| `PurchaseOrderItem` | PurchaseOrder | Project-scoped |

### Supporting Models

| Model | Scope | Purpose |
|---|---|---|
| `ProcurementCategory` | **Entity-scoped** | 3-level category hierarchy (D11, D12) |
| `ItemCatalog` | **Entity-scoped** | Optional item master for quotation memory |
| `ProjectVendor` | Junction | Links entity-scoped vendors to specific projects |

### Vendor Ownership (D7 resolved)

Procurement creates and manages vendor master records. Other departments can request vendor additions by submitting a request to Procurement (manual process in M3, formal purchase request workflow deferred to future). Only Procurement can activate, suspend, or blacklist vendors.

### PO Creation (D8 resolved)

Procurement creates purchase orders. PM and Site Team can submit purchase requests informally; formal purchase request workflow is a future enhancement. In M3, only users with `purchase_order.create` permission (Procurement) can create PO records.

### SupplierInvoice Entry (D9 resolved)

Either Procurement or Finance can enter supplier invoices. Both roles receive `supplier_invoice.create` permission. Finance review is mandatory regardless of who enters the invoice.

### Record Relationships

```
Vendor (entity) ──[1:N]──→ ProjectVendor ──[N:1]──→ Project
Vendor ──[1:N]──→ VendorContract
Vendor ──[1:N]──→ FrameworkAgreement
RFQ ──[1:N via RFQVendor]──→ Vendor
RFQ ──[1:N]──→ Quotation
Quotation ──[N:1, awarded]──→ PurchaseOrder
PurchaseOrder ──[N:1, optional]──→ VendorContract
PurchaseOrder ──[N:1, optional]──→ FrameworkAgreement
PurchaseOrder ──[1:N]──→ SupplierInvoice
CreditNote ──[N:1, required]──→ Vendor
CreditNote ──[N:1, optional]──→ SupplierInvoice
CreditNote ──[N:1, optional]──→ PurchaseOrder
CreditNote ──[N:1, optional]──→ M2 Correspondence (back_charge)
Expense ──[N:1, optional]──→ PurchaseOrder
```

---

## 4. Lifecycle Statuses by Model

All statuses are stored as a string enum. Terminal statuses cannot be reopened. Status transitions are validated at the service layer using `Record<Status, Status[]>` transition maps, same pattern as M2.

### Vendor (master data -- simpler lifecycle)

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial entry |
| `active` | No | Approved for use |
| `suspended` | No | Temporarily blocked |
| `blacklisted` | Yes | Permanently blocked |
| `archived` | Yes | No longer active |

No workflow template. Status changes are direct admin actions.

**Transition map:**
```
draft       → [active]
active      → [suspended, archived]
suspended   → [active, blacklisted, archived]
```

### VendorContract

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | Posting fires: `VENDOR_CONTRACT_SIGNED` |
| `active` | No | Contract in force |
| `expired` | Yes | Past end date |
| `terminated` | Yes | Early termination |
| `superseded` | Yes | Replaced by amendment |

**Transition map:**
```
draft            → [under_review]
under_review     → [approved_internal, returned, rejected]
returned         → [under_review]
approved_internal→ [signed]
signed           → [active]
active           → [expired, terminated, superseded]
```

### FrameworkAgreement

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | Both parties signed |
| `active` | No | Informational event: `FRAMEWORK_AGREEMENT_ACTIVE` (non-ledger, see section 8) |
| `expired` | Yes | Past validity period |
| `terminated` | Yes | |
| `superseded` | Yes | Replaced by new agreement |

**Transition map:**
```
draft            → [under_review]
under_review     → [approved_internal, returned, rejected]
returned         → [under_review]
approved_internal→ [signed]
signed           → [active]
active           → [expired, terminated, superseded]
```

### RFQ

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | Internal review |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `issued` | No | Sent to vendors |
| `responses_received` | No | Quotations received |
| `evaluation` | No | Comparison in progress |
| `awarded` | No | Winner selected |
| `closed` | Yes | All follow-up complete |
| `cancelled` | Yes | |

**Transition map:**
```
draft              → [under_review]
under_review       → [approved_internal, returned, rejected]
returned           → [under_review]
approved_internal  → [issued]
issued             → [responses_received, cancelled]
responses_received → [evaluation]
evaluation         → [awarded, cancelled]
awarded            → [closed]
```

### Quotation (inbound record -- lighter lifecycle)

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Being evaluated |
| `shortlisted` | No | Passed initial evaluation |
| `awarded` | Yes | Selected as winner |
| `rejected` | Yes | Not selected |
| `expired` | Yes | Past validity date |

**Transition map:**
```
received     → [under_review, expired]
under_review → [shortlisted, rejected, expired]
shortlisted  → [awarded, rejected, expired]
```

### PurchaseOrder

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | |
| `issued` | No | Posting fires: `PO_ISSUED` |
| `acknowledged` | No | Vendor confirmed receipt |
| `partially_delivered` | No | Partial goods/services received |
| `delivered` | No | Posting fires: `PO_DELIVERED` |
| `closed` | Yes | Fully delivered + invoiced |
| `cancelled` | Yes | |
| `superseded` | Yes | Replaced by revised PO |

**Transition map:**
```
draft              → [under_review]
under_review       → [approved_internal, returned, rejected]
returned           → [under_review]
approved_internal  → [signed]
signed             → [issued]
issued             → [acknowledged, partially_delivered, delivered, cancelled, superseded]
acknowledged       → [partially_delivered, delivered, cancelled]
partially_delivered→ [delivered, cancelled]
delivered          → [closed]
```

### SupplierInvoice

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Finance/procurement review |
| `returned` | No | Returned with queries |
| `rejected` | Yes | |
| `approved` | No | Posting fires: `SUPPLIER_INVOICE_APPROVED` |
| `payment_prepared` | No | Payment authorization ready |
| `partially_paid` | No | Partial payment made |
| `paid` | Yes | Fully paid |
| `disputed` | No | Under dispute |
| `cancelled` | Yes | |

**Transition map:**
```
received         → [under_review]
under_review     → [approved, returned, rejected, disputed]
returned         → [under_review]
approved         → [payment_prepared]
payment_prepared → [partially_paid, paid]
partially_paid   → [paid]
disputed         → [under_review, cancelled]
```

### Expense (D17 resolved: include payment_prepared/paid)

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | PM or manager review |
| `returned` | No | |
| `rejected` | Yes | |
| `approved` | No | Posting fires: `EXPENSE_APPROVED` (subtype in payload) |
| `payment_prepared` | No | Ready for reimbursement/payment |
| `paid` | Yes | Reimbursed or settled |
| `cancelled` | Yes | |

**Transition map:**
```
draft            → [submitted]
submitted        → [under_review]
under_review     → [approved, returned, rejected]
returned         → [submitted]
approved         → [payment_prepared]
payment_prepared → [paid]
```

### CreditNote

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Finance review |
| `verified` | No | Confirmed valid |
| `applied` | Yes | Posting fires: `CREDIT_NOTE_APPLIED` |
| `disputed` | No | Under dispute |
| `rejected` | Yes | |
| `cancelled` | Yes | |

**Transition map:**
```
received     → [under_review]
under_review → [verified, rejected, disputed]
verified     → [applied]
disputed     → [under_review, cancelled]
```

---

## 5. Workflow Paths by Model

### Engine

All workflows use the Module 1 workflow engine (linear multi-step). Each record type gets one or more seeded workflow templates. "Optional by rule" steps are handled by having multiple template variants. The active template for a project is configured via project settings. Template selection happens at workflow start time. No conditional branching.

### Workflow Templates

#### Vendor (no workflow -- master data)

Admin creates, activates. Status changes are direct actions by Procurement role. No workflow template.

#### VendorContract

| Template Code | Steps |
|---|---|
| `vendor_contract_standard` | Procurement/Contracts Prepare --> PM Review --> Contracts Manager Review --> Finance Check (by threshold, D21) --> PD Sign (mandatory) --> Both-party sign --> Active |
| `vendor_contract_low_value` | Procurement/Contracts Prepare --> PM Review --> Contracts Manager Review --> PD Sign (mandatory) --> Active |

Finance check is by value threshold (D21). Small service contracts skip finance involvement.

#### FrameworkAgreement

| Template Code | Steps |
|---|---|
| `framework_agreement_standard` | Procurement Prepare --> Contracts Review --> Finance Check (mandatory) --> PD Approval --> Both-party sign --> Active |

Finance check is mandatory -- rate commitments affect budget.

#### RFQ (D18 resolved: PM approval optional by template rule)

| Template Code | Steps |
|---|---|
| `rfq_standard` | Procurement Prepare --> Procurement Manager Approval --> Issue to vendors |
| `rfq_with_pm` | Procurement Prepare --> PM Review --> Procurement Manager Approval --> Issue to vendors |

Post-issuance phases (responses_received, evaluation, awarded) are manual status updates via `transition` endpoint, not workflow steps.

#### Quotation (no internal workflow -- inbound record)

Received --> reviewed --> shortlisted or rejected. Part of the RFQ evaluation process. Manual status transitions.

#### PurchaseOrder (D19, D23, D55 resolved)

| Template Code | Steps |
|---|---|
| `po_standard` | Procurement Prepare --> PM Review --> Procurement Manager Review --> Finance Check (mandatory) --> Procurement Manager Sign --> Issue to vendor |
| `po_high_value` | Procurement Prepare --> PM Review --> Procurement Manager Review --> Finance Check (mandatory) --> PD Sign --> Issue to vendor |

Two-tier signing (D23): Procurement Manager signs below configurable threshold, PD signs above. Procurement cannot sign POs (D55) -- signing authority is PD or Contracts Manager only. The `po_standard` template has Procurement Manager at the review step, not the sign step. Correction: the sign step is performed by Contracts Manager (below threshold) or PD (above threshold).

**Revised signing logic:** Below threshold, Contracts Manager signs. Above threshold, PD signs. Procurement has no `sign` permission on POs.

#### SupplierInvoice

| Template Code | Steps |
|---|---|
| `supplier_invoice_standard` | Received/Entered --> Procurement Verification (matches PO?) --> Finance Review (mandatory) --> Finance Manager Approval --> Payment Preparation |
| `supplier_invoice_high_value` | Received/Entered --> Procurement Verification --> Finance Review (mandatory) --> Finance Manager Approval --> PD Approval --> Payment Preparation |

Payment preparation is a workflow phase status, not a separate record (locked decision D2).

#### Expense (D10 resolved: always PM then Finance, no skip)

| Template Code | Steps |
|---|---|
| `expense_standard` | Originator Submit --> PM Review --> Finance Review --> Finance Approval |
| `expense_high_value` | Originator Submit --> PM Review --> Finance Review --> PD Approval (D20: above configurable threshold) |

Expenses always go PM --> Finance. No skipping PM review even for petty cash.

#### CreditNote

| Template Code | Steps |
|---|---|
| `credit_note_standard` | Received/Entered --> Finance Review --> Finance Manager Verification --> Applied |

---

## 6. Finance-Check Rules

| Record | Finance Check | Rule | Checker Role |
|---|---|---|---|
| PurchaseOrder | **Mandatory** | Always -- creates commitment | Finance |
| SupplierInvoice | **Mandatory** | Always -- triggers payable | Finance |
| FrameworkAgreement | **Mandatory** | Always -- rate commitments affect budget | Finance |
| CreditNote | **Mandatory** | Always -- modifies payable position | Finance |
| VendorContract | **By value threshold** (D21) | Contracts above configured amount; small service contracts skip | Finance |
| Expense | **By value threshold** (D22) | Separate threshold, typically lower than PO threshold | Finance |
| RFQ | **Not mandatory** | Unless configured by template | -- |
| Quotation | **N/A** | Inbound record, no finance check | -- |
| Vendor | **N/A** | Master data, no finance check | -- |

Finance checks are implemented as standard workflow steps where the step's `approverRole` is `finance`. Template variants include or exclude the finance step. The workflow engine resolves the approver the same way as any other step.

---

## 7. Approval / Sign / Issue Rules

### Signing

| Record | Sign Required? | Signer |
|---|---|---|
| VendorContract | **Mandatory** (both parties) | PD |
| FrameworkAgreement | **Mandatory** (both parties) | PD |
| PurchaseOrder | **Mandatory** | Contracts Manager (below threshold) or PD (above threshold) (D23, D55) |
| RFQ | Not required (internal document) | -- |
| Quotation | N/A (inbound) | -- |
| SupplierInvoice | N/A (inbound) | -- |
| Expense | Not required | -- |
| CreditNote | N/A (inbound) | -- |

### Issuing

| Record | Issue Control |
|---|---|
| VendorContract | Controlled |
| FrameworkAgreement | Controlled |
| PurchaseOrder | Controlled -- issued to vendor |
| RFQ | Controlled when sent to vendors |
| SupplierInvoice | N/A -- inbound |
| Expense | N/A |
| CreditNote | N/A -- inbound |

### Reference Numbers

Auto-generated, project-scoped (entity-scoped for Vendor), sequential. Same `ReferenceCounter` table from M2.

Format: `{ProjectCode}-{TypeCode}-{NNN}` (project-scoped) or `{EntityCode}-{TypeCode}-{NNN}` (entity-scoped)

| Model | Type Code | Example |
|---|---|---|
| Vendor | `VND` | `FMKSA-VND-001` (entity-scoped) |
| VendorContract | `VC` | `PROJ01-VC-001` |
| FrameworkAgreement | `FA` | `PROJ01-FA-001` (or `FMKSA-FA-001` for entity-wide) |
| RFQ | `RFQ` | `PROJ01-RFQ-003` |
| PurchaseOrder | `PO` | `PROJ01-PO-012` |
| SupplierInvoice | `SI` | `PROJ01-SI-001` |
| Expense | `EXP` | `PROJ01-EXP-045` |
| CreditNote | `CN` | `PROJ01-CN-002` |

Reference numbers assigned at `issued` status (or `active` for Vendor, `received` for inbound records). Counter incremented in the same transaction as status update.

---

## 8. Posting Trigger Rules

### Event Registry

Module 3 registers 7 event types (6 firm + 1 informational) at service boot time via `registerEventType()`. These are the payable/commitment side, complementing M2's 7 receivable events.

| Event Type | Fires When | Source Record | Exposure Type | Ledger? |
|---|---|---|---|---|
| `PO_ISSUED` | PurchaseOrder --> `issued` | `purchase_order` | Commitment created | **Yes** |
| `PO_DELIVERED` | PurchaseOrder --> `delivered` | `purchase_order` | Goods received (accrual) | **Yes** |
| `SUPPLIER_INVOICE_APPROVED` | SupplierInvoice --> `approved` | `supplier_invoice` | Payable recognized | **Yes** |
| `EXPENSE_APPROVED` | Expense --> `approved` | `expense` | Expense payable | **Yes** |
| `CREDIT_NOTE_APPLIED` | CreditNote --> `applied` | `credit_note` | Payable reduction | **Yes** |
| `VENDOR_CONTRACT_SIGNED` | VendorContract --> `signed` | `vendor_contract` | Contract commitment | **Yes** |
| `FRAMEWORK_AGREEMENT_ACTIVE` | FrameworkAgreement --> `active` | `framework_agreement` | Rate commitment (informational) | **No -- non-ledger** |

**No posting:** RFQ, Quotation, Vendor (master data -- no financial impact).

### FRAMEWORK_AGREEMENT_ACTIVE -- Informational Only

This event is logged for audit/notification purposes only. It does **not** create a ledger entry, does **not** affect payable calculations, and does **not** feed into M4 payable aggregation. If it introduces any implementation complexity beyond a simple event emit, it is the first event to drop entirely. The posting engine `post()` call is skipped for this event; instead, an audit log entry and optional notification are emitted directly.

### EXPENSE_APPROVED Subtype Handling

`EXPENSE_APPROVED` is one event for all 5 expense subtypes. The `subtype` field is carried in the payload, same pattern as M2 Variation events. No per-subtype event explosion.

### Payload Schemas (Zod)

**`PO_ISSUED`:**
```typescript
const PO_ISSUED_SCHEMA = z.object({
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  vendorId: z.string().uuid(),
  totalAmount: z.string(),  // Decimal serialized as string
  currency: z.string(),
  categoryId: z.string().uuid().nullable(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`PO_DELIVERED`:**
```typescript
const PO_DELIVERED_SCHEMA = z.object({
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  vendorId: z.string().uuid(),
  totalAmount: z.string(),
  deliveredAmount: z.string(),  // may differ from totalAmount for partial deliveries
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`SUPPLIER_INVOICE_APPROVED`:**
```typescript
const SUPPLIER_INVOICE_APPROVED_SCHEMA = z.object({
  supplierInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable(),
  grossAmount: z.string(),
  vatAmount: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`EXPENSE_APPROVED`:**
```typescript
const EXPENSE_APPROVED_SCHEMA = z.object({
  expenseId: z.string().uuid(),
  subtype: z.enum(['ticket', 'accommodation', 'transportation', 'equipment', 'general']),
  amount: z.string(),
  currency: z.string(),
  categoryId: z.string().uuid().nullable(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`CREDIT_NOTE_APPLIED`:**
```typescript
const CREDIT_NOTE_APPLIED_SCHEMA = z.object({
  creditNoteId: z.string().uuid(),
  subtype: z.enum(['credit_note', 'rebate', 'recovery']),
  vendorId: z.string().uuid(),
  supplierInvoiceId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  amount: z.string(),
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`VENDOR_CONTRACT_SIGNED`:**
```typescript
const VENDOR_CONTRACT_SIGNED_SCHEMA = z.object({
  vendorContractId: z.string().uuid(),
  contractNumber: z.string(),
  vendorId: z.string().uuid(),
  totalValue: z.string(),
  currency: z.string(),
  startDate: z.string(),  // ISO date
  endDate: z.string(),    // ISO date
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});
```

**`FRAMEWORK_AGREEMENT_ACTIVE` (informational -- no ledger):**
```typescript
const FRAMEWORK_AGREEMENT_ACTIVE_SCHEMA = z.object({
  frameworkAgreementId: z.string().uuid(),
  agreementNumber: z.string(),
  vendorId: z.string().uuid(),
  totalCommittedValue: z.string().nullable(),
  currency: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  projectId: z.string().uuid().nullable(),  // null for entity-wide
  entityId: z.string().uuid(),
});
```

### Posting Integration

Each procurement service calls `postingService.post()` inside the status transition handler. The idempotency key is derived from the record ID + status transition (e.g., `purchase_order:{id}:issued`). This ensures posting is exactly-once even if the transition is retried.

**`entityId` resolution:** Same pattern as M2. Each service resolves `entityId` by reading `project.entityId` from the project record (already loaded by `projectProcedure`). For entity-scoped records without a project (entity-wide FrameworkAgreement), `entityId` comes from the record directly.

---

## 9. Commitment / Payable Linkage Rules

### The Payable Chain

M3's payable chain mirrors M2's receivable chain:

```
M2 Receivable:  IPA → IPC → TaxInvoice            (claimed → certified → invoiced)
M3 Payable:     PO  → Delivery → SupplierInvoice   (committed → received → invoiced → paid)
```

### FK Relationships

| From | To | Cardinality | Rule |
|------|-----|-------------|------|
| RFQ --> Quotation | 1:N | One RFQ receives many quotations via `rfqId` FK |
| Quotation --> PurchaseOrder | N:1 | Awarded quotation links to its PO via `quotationId` FK on PO |
| PurchaseOrder --> SupplierInvoice | 1:N | One PO may have multiple invoices via `purchaseOrderId` FK |
| PurchaseOrder --> VendorContract | N:1 (optional) | PO may reference a vendor contract via nullable `vendorContractId` FK |
| PurchaseOrder --> FrameworkAgreement | N:1 (optional) | PO may reference framework rates via nullable `frameworkAgreementId` FK |
| CreditNote --> Vendor | N:1 (required) | Always linked via `vendorId` FK |
| CreditNote --> SupplierInvoice | N:1 (optional) | Can link to specific invoice via nullable `supplierInvoiceId` FK |
| CreditNote --> PurchaseOrder | N:1 (optional) | May reference original PO via nullable `purchaseOrderId` FK |
| CreditNote --> M2 Correspondence | N:1 (optional) | Recovery may link to back_charge via nullable `correspondenceId` FK |
| Expense --> PurchaseOrder | N:1 (optional) | Expense may reference a PO via nullable `purchaseOrderId` FK |

### SupplierInvoice PO Linkage (Locked Decision D8)

**Conditional linkage:**

| Spend Type | PO Required? | Rule |
|---|---|---|
| Goods / procurement-controlled materials | **Required** | `purchaseOrderId` must be non-null. Service validation rejects creation without PO link. |
| Professional services | **Optional** | PO link allowed but not enforced. Some services are contracted directly. |
| Utilities / recurring charges | **Optional** | Utility invoices typically have no PO. |
| Exception cases (emergency procurement) | **Optional** | Must be flagged for audit. Service allows null PO with a `noPOReason` field. |

The enforcement is at the service layer, not database constraint. `purchaseOrderId` is a nullable FK. The service checks the category or a `requiresPO` flag on the SupplierInvoice to determine enforcement.

### CreditNote Flexible Linkage (Locked Decision D9)

CreditNote can link to a specific SupplierInvoice **or** remain vendor-level. Invoice-only linkage is not forced. This supports:
- `credit_note` subtype: typically linked to a specific invoice
- `rebate` subtype: often vendor-level (no specific invoice)
- `recovery` subtype: may link to PO and/or M2 back_charge correspondence

---

## 10. Quotation History Memory Rules

### Hybrid Item Catalog Model

**ItemCatalog** is an optional entity-scoped master data table. Teams can adopt it gradually. Quotation lines work with or without catalog references.

```
ItemCatalog (entity-scoped master data)
  - id (UUID)
  - entityId (FK → Entity)
  - itemCode (unique within entity)
  - description
  - unit
  - categoryId (FK → ProcurementCategory)
  - status (active / archived)
  - createdAt, updatedAt

QuotationLineItem (project-scoped, child of Quotation)
  - id (UUID)
  - quotationId (FK)
  - itemCatalogId (FK, optional — references ItemCatalog if available)
  - itemDescription (text — always populated, even if catalog item is referenced)
  - quantity (Decimal)
  - unit (String)
  - unitPrice (Decimal)
  - totalPrice (Decimal)
  - currency (String)
  - validityDate (DateTime, optional)
  - notes (String, optional)
```

### Memory Scope and Query

| Rule | Decision |
|---|---|
| Quotation memory scope | **Entity-wide** — vendors quote at entity level, not project-only |
| Memory query method | **Text search + category context**. Supports item code lookup (if catalog used) and free-text description search across QuotationLineItems entity-wide |
| Item catalog requirement | **Optional**. Quotation lines work with or without catalog references |

### Memory Query Implementation

The quotation memory service provides:
1. **By item code**: exact match on `ItemCatalog.itemCode` within the entity, returning all QuotationLineItems that reference it across all projects
2. **By text search**: full-text search on `QuotationLineItem.itemDescription` across all projects within the entity
3. **By category**: filter by ProcurementCategory to narrow results
4. **Aggregation**: for any item, return last 3 prices, average price, min/max, and vendor names

This powers the benchmark pricing panel (section 13).

---

## 11. Framework Agreement Model

### Separate Model (Locked Decision D5)

FrameworkAgreement is a standalone model, not a VendorContract subtype. Different lifecycle, content structure, and purpose.

```
FrameworkAgreement
  - vendorId (FK → Vendor)
  - projectId (FK → Project, nullable — entity-wide agreements have no projectId)
  - agreementNumber (auto-generated)
  - title, description
  - validFrom, validTo
  - status
  - currency
  - totalCommittedValue (Decimal, nullable — some frameworks have no cap)
  - totalUtilizedValue (Decimal — computed: sum of PO values referencing this agreement)

FrameworkAgreementItem (line items)
  - frameworkAgreementId (FK)
  - itemCatalogId (FK, optional)
  - itemDescription
  - unit
  - agreedRate (Decimal)
  - currency
  - minQuantity (optional)
  - maxQuantity (optional)
  - notes
```

### Enforcement: Warn and Suggest (Locked Decision D11)

Framework agreements use a **warn and suggest** approach, not hard enforcement:

1. **Pre-populate**: When creating a PO line item, if a matching FrameworkAgreementItem exists for the vendor, the agreed rate is pre-populated as the unit price.
2. **Deviation warning**: If the user changes the price away from the agreed rate, a UI warning shows the deviation percentage. No blocking.
3. **Flag on PO**: POs that deviate from framework rates get a `hasFrameworkDeviation` boolean flag for reporting.

### Utilization Tracking

Basic tracking in M3: `totalUtilizedValue` is a computed field (sum of PO `totalAmount` where `frameworkAgreementId` matches). Computed on read, not stored as a denormalized field. Full budget tracking and utilization analytics are Module 4/5.

---

## 12. Credit Note / Rebate / Recovery Model

### 3-Subtype CreditNote (Locked Decision)

| Subtype | Description | Typical Source |
|---|---|---|
| `credit_note` | Vendor-issued credit against an invoice | Defective goods, overcharge, cancelled order |
| `rebate` | Volume-based or contractual rebate from vendor | Reaching volume threshold, loyalty program |
| `recovery` | Costs recovered from vendor (back-charge applied) | Defective work, penalty, delay damages |

### Linkage Rules

| Link | Rule |
|------|------|
| CreditNote --> Vendor | **Required** (always linked to a vendor) |
| CreditNote --> SupplierInvoice | **Optional** (may apply to specific invoice or be standalone) |
| CreditNote --> PurchaseOrder | **Optional** (may reference original PO) |
| CreditNote --> M2 Correspondence (back_charge) | **Optional** (recovery may originate from a back charge) |

### Back_charge Cross-Reference (D38 Resolved)

Back_charge correspondence in M2 does **not** auto-create a CreditNote (recovery) in M3. Manual creation with optional link. When a user creates a `recovery`-subtype CreditNote, the form offers a searchable reference to existing M2 back_charge correspondence records via the nullable `correspondenceId` FK. The link is informational only -- no automated financial flow.

### Financial Impact

CreditNote `applied` status fires `CREDIT_NOTE_APPLIED` posting event, reducing the payable position. The amount is always positive on the CreditNote record; the posting event handler records it as a payable reduction.

---

## 13. Benchmark Pricing Model

### Internal Data Sources Only (D39 Resolved)

| Source | How It Works |
|---|---|
| Quotation history memory | Average/min/max historical prices for same item across vendors (entity-wide) |
| Framework agreement rates | Agreed rates serve as ceiling benchmark |
| Last purchase price | Most recent PO price for same item |

**Not in M3 scope:** external market rate feeds, inflation adjustment, predictive models, cross-entity aggregation, manual benchmark entry.

### Read-Only Benchmark Panel (D40 Resolved)

A read-only benchmark panel appears on both the **Quotation evaluation screen** and the **PO creation screen**:

**Quotation evaluation context:**
- Last 3 purchase prices for this item (from PurchaseOrderItem across entity)
- Framework rate (if active framework agreement exists for vendor)
- Historical average across all vendors (from QuotationLineItem entity-wide)
- % deviation from benchmark (current quoted price vs historical average)

**PO creation context:**
- Same data as above, but comparing the PO line item price to benchmarks
- Framework rate pre-populated if applicable (see section 11)
- Warning indicator if price exceeds historical average by configurable threshold

### Implementation

The benchmark service is a read-only query service in `packages/core/src/procurement/benchmark/`. It queries QuotationLineItem, PurchaseOrderItem, and FrameworkAgreementItem within the entity scope. Results are cached per session (not persisted). No new Prisma model for benchmarks -- it is computed from existing data.

---

## 14. Required Forms and Field Groups

### Field Strategy

Same as M2:
- Shared base tables with `subtype` enum + nullable subtype-specific columns
- All money fields: `Decimal` (Prisma `@db.Decimal(18, 2)`)
- All FK fields: UUID strings
- Currency: string FK to M1 `Currency` reference data
- All models get standard audit fields: `id`, `createdBy`, `createdAt`, `updatedAt`, `status`
- Project-scoped models get `projectId` FK
- Entity-scoped models get `entityId` FK

### Vendor (entity-scoped master)

| Field | Type | Required | Notes |
|---|---|---|---|
| `entityId` | String (FK --> Entity) | Yes | Entity isolation |
| `vendorCode` | String | Yes | Auto-generated, unique within entity |
| `name` | String | Yes | Legal name |
| `tradeName` | String | No | DBA name |
| `registrationNumber` | String | No | Commercial registration |
| `taxId` | String | No | VAT registration number |
| `contactName` | String | No | Primary contact |
| `contactEmail` | String | No | |
| `contactPhone` | String | No | |
| `address` | String | No | |
| `city` | String | No | |
| `country` | String | No | |
| `classification` | String (FK --> ProcurementCategory) | No | Primary category |
| `status` | String | Yes | See section 4 |
| `notes` | String | No | |

### ProjectVendor (junction table)

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | |
| `approvedDate` | DateTime | No | When vendor was approved for project |
| `status` | String | Yes | `active`, `inactive` |

### VendorContract

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | |
| `contractNumber` | String | Yes | Auto-generated |
| `title` | String | Yes | |
| `description` | String | No | |
| `contractType` | String | Yes | `service`, `supply`, `subcontract`, `consulting` |
| `startDate` | DateTime | Yes | |
| `endDate` | DateTime | Yes | |
| `totalValue` | Decimal(18,2) | Yes | |
| `currency` | String | Yes | |
| `terms` | String | No | |
| `signedDate` | DateTime | No | Set on `signed` transition |
| `parentContractId` | String (FK --> VendorContract) | No | For amendments |
| `status` | String | Yes | See section 4 |
| `referenceNumber` | String | No | Assigned on sign/issue |

### FrameworkAgreement

| Field | Type | Required | Notes |
|---|---|---|---|
| `vendorId` | String (FK --> Vendor) | Yes | |
| `projectId` | String (FK --> Project) | No | Null for entity-wide |
| `entityId` | String (FK --> Entity) | Yes | Always set |
| `agreementNumber` | String | Yes | Auto-generated |
| `title` | String | Yes | |
| `description` | String | No | |
| `validFrom` | DateTime | Yes | |
| `validTo` | DateTime | Yes | |
| `currency` | String | Yes | |
| `totalCommittedValue` | Decimal(18,2) | No | Some frameworks have no cap |
| `status` | String | Yes | See section 4 |

### FrameworkAgreementItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `frameworkAgreementId` | String (FK) | Yes | |
| `itemCatalogId` | String (FK --> ItemCatalog) | No | Optional catalog reference |
| `itemDescription` | String | Yes | Always populated |
| `unit` | String | Yes | |
| `agreedRate` | Decimal(18,2) | Yes | |
| `currency` | String | Yes | |
| `minQuantity` | Decimal(18,2) | No | |
| `maxQuantity` | Decimal(18,2) | No | |
| `notes` | String | No | |

### RFQ

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `rfqNumber` | String | Yes | Auto-generated |
| `title` | String | Yes | |
| `description` | String | No | |
| `requiredByDate` | DateTime | No | |
| `categoryId` | String (FK --> ProcurementCategory) | No | |
| `currency` | String | Yes | |
| `estimatedBudget` | Decimal(18,2) | No | |
| `status` | String | Yes | See section 4 |
| `referenceNumber` | String | No | Assigned on issue |

### RFQItem (D43 resolved: line items)

| Field | Type | Required | Notes |
|---|---|---|---|
| `rfqId` | String (FK) | Yes | |
| `itemCatalogId` | String (FK --> ItemCatalog) | No | Optional catalog reference |
| `itemDescription` | String | Yes | |
| `quantity` | Decimal(18,2) | Yes | |
| `unit` | String | Yes | |
| `estimatedUnitPrice` | Decimal(18,2) | No | Optional budget estimate |

### RFQVendor (junction)

| Field | Type | Required | Notes |
|---|---|---|---|
| `rfqId` | String (FK) | Yes | |
| `vendorId` | String (FK) | Yes | |
| `sentAt` | DateTime | No | When RFQ was sent to vendor |
| `responseStatus` | String | No | `pending`, `received`, `declined` |

### Quotation

| Field | Type | Required | Notes |
|---|---|---|---|
| `rfqId` | String (FK --> RFQ) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | |
| `quotationRef` | String | No | Vendor's reference number |
| `receivedDate` | DateTime | Yes | |
| `validUntil` | DateTime | No | |
| `totalAmount` | Decimal(18,2) | Yes | |
| `currency` | String | Yes | |
| `deliveryTerms` | String | No | |
| `paymentTerms` | String | No | |
| `status` | String | Yes | See section 4 |

### QuotationLineItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `quotationId` | String (FK) | Yes | |
| `itemCatalogId` | String (FK --> ItemCatalog) | No | Optional catalog reference |
| `rfqItemId` | String (FK --> RFQItem) | No | Maps to requested item |
| `itemDescription` | String | Yes | Always populated |
| `quantity` | Decimal(18,2) | Yes | |
| `unit` | String | Yes | |
| `unitPrice` | Decimal(18,2) | Yes | |
| `totalPrice` | Decimal(18,2) | Yes | |
| `currency` | String | Yes | |
| `validityDate` | DateTime | No | |
| `notes` | String | No | |

### PurchaseOrder (D42 resolved: has line items)

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | |
| `rfqId` | String (FK --> RFQ) | No | Optional source |
| `quotationId` | String (FK --> Quotation) | No | Optional source |
| `vendorContractId` | String (FK --> VendorContract) | No | Optional contract reference |
| `frameworkAgreementId` | String (FK --> FrameworkAgreement) | No | Optional framework reference |
| `categoryId` | String (FK --> ProcurementCategory) | Yes | Required on PO (D14) |
| `poNumber` | String | Yes | Auto-generated |
| `title` | String | Yes | |
| `description` | String | No | |
| `totalAmount` | Decimal(18,2) | Yes | Sum of line items |
| `currency` | String | Yes | |
| `deliveryDate` | DateTime | No | |
| `deliveryAddress` | String | No | |
| `paymentTerms` | String | No | |
| `hasFrameworkDeviation` | Boolean | No | Flag if price deviates from framework |
| `status` | String | Yes | See section 4 |
| `referenceNumber` | String | No | Assigned on issue |

### PurchaseOrderItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `purchaseOrderId` | String (FK) | Yes | |
| `itemCatalogId` | String (FK --> ItemCatalog) | No | Optional catalog reference |
| `itemDescription` | String | Yes | |
| `quantity` | Decimal(18,2) | Yes | |
| `unit` | String | Yes | |
| `unitPrice` | Decimal(18,2) | Yes | |
| `totalPrice` | Decimal(18,2) | Yes | |

### SupplierInvoice

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | |
| `purchaseOrderId` | String (FK --> PurchaseOrder) | No | Conditional: required for goods, optional for services/utilities |
| `invoiceNumber` | String | Yes | Vendor's reference |
| `invoiceDate` | DateTime | Yes | |
| `grossAmount` | Decimal(18,2) | Yes | |
| `vatRate` | Decimal(5,4) | Yes | Configurable per entity, default 0.15 |
| `vatAmount` | Decimal(18,2) | Yes | |
| `totalAmount` | Decimal(18,2) | Yes | |
| `dueDate` | DateTime | No | |
| `currency` | String | Yes | |
| `categoryId` | String (FK --> ProcurementCategory) | Yes | Required on SupplierInvoice (D14) |
| `noPOReason` | String | No | Required when PO is null for goods categories |
| `status` | String | Yes | See section 4 |

### Expense (D41 resolved: accept proposed subtype fields)

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `subtype` | Enum | Yes | `ticket`, `accommodation`, `transportation`, `equipment`, `general` |
| `title` | String | Yes | |
| `description` | String | No | |
| `amount` | Decimal(18,2) | Yes | |
| `currency` | String | Yes | |
| `expenseDate` | DateTime | Yes | |
| `categoryId` | String (FK --> ProcurementCategory) | No | Optional on Expense (D14) |
| `receiptReference` | String | No | |
| `purchaseOrderId` | String (FK --> PurchaseOrder) | No | Optional PO link |
| `status` | String | Yes | See section 4 |
| **ticket-specific (nullable):** | | | |
| `ticketType` | Enum | No | `flight`, `event`, `other` |
| `travelerName` | String | No | |
| `origin` | String | No | |
| `destination` | String | No | |
| `travelDate` | DateTime | No | |
| `returnDate` | DateTime | No | |
| **accommodation-specific (nullable):** | | | |
| `guestName` | String | No | |
| `checkIn` | DateTime | No | |
| `checkOut` | DateTime | No | |
| `hotelName` | String | No | |
| `city` | String | No | |
| `nightlyRate` | Decimal(18,2) | No | |
| `nights` | Int | No | |
| **transportation-specific (nullable):** | | | |
| `vehicleType` | String | No | |
| `transportOrigin` | String | No | |
| `transportDestination` | String | No | |
| `distance` | Decimal(10,2) | No | |
| `rateType` | Enum | No | `per_trip`, `per_day`, `per_km` |
| **equipment-specific (nullable):** | | | |
| `equipmentName` | String | No | |
| `equipmentType` | String | No | |
| `rentalPeriodFrom` | DateTime | No | |
| `rentalPeriodTo` | DateTime | No | |
| `dailyRate` | Decimal(18,2) | No | |
| `days` | Int | No | |
| **general:** | | | |
| *(no extra fields -- uses base fields only)* | | | |

### CreditNote

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK --> Project) | Yes | |
| `vendorId` | String (FK --> Vendor) | Yes | Always required |
| `subtype` | Enum | Yes | `credit_note`, `rebate`, `recovery` |
| `creditNoteNumber` | String | Yes | Auto-generated |
| `supplierInvoiceId` | String (FK --> SupplierInvoice) | No | Optional invoice link |
| `purchaseOrderId` | String (FK --> PurchaseOrder) | No | Optional PO link |
| `correspondenceId` | String (FK --> M2 Correspondence) | No | Optional back_charge link |
| `amount` | Decimal(18,2) | Yes | Always positive |
| `currency` | String | Yes | |
| `reason` | String | Yes | |
| `receivedDate` | DateTime | Yes | |
| `status` | String | Yes | See section 4 |

### ProcurementCategory (D11, D12, D13 resolved)

| Field | Type | Required | Notes |
|---|---|---|---|
| `entityId` | String (FK --> Entity) | Yes | Entity-scoped (D12) |
| `name` | String | Yes | |
| `code` | String | Yes | Unique within entity |
| `level` | Enum | Yes | `category`, `subcategory`, `spend_type` (D11: 3-level) |
| `parentId` | String (FK --> ProcurementCategory) | No | Self-referencing for hierarchy |
| `status` | String | Yes | `active`, `archived` |

### ItemCatalog

| Field | Type | Required | Notes |
|---|---|---|---|
| `entityId` | String (FK --> Entity) | Yes | Entity-scoped |
| `itemCode` | String | Yes | Unique within entity |
| `description` | String | Yes | |
| `unit` | String | Yes | |
| `categoryId` | String (FK --> ProcurementCategory) | No | |
| `status` | String | Yes | `active`, `archived` |

### Document Attachments

Same as M2: all procurement records support linking to M1 documents via the existing `recordType` + `recordId` nullable fields on the Document model.

### Internal Comments

Same as M2: uses existing workflow step `comment` field for review-stage discussion. Dedicated comments thread per record is a future enhancement.

---

## 15. Screen List and Behavior

### 18 Screens (D46 confirmed)

All project-scoped screens live inside the project workspace. Vendor and category management screens are entity-scoped (accessible from entity settings or a top-level procurement admin area).

#### 1. Procurement Dashboard (`/projects/{id}/procurement`)

Summary view with 9 sections (D49 confirmed: include all):
- Active commitments (PO value by status)
- Payables summary (supplier invoice value by status)
- Pending approvals (records awaiting current user's action)
- Expense summary (total by subtype and status)
- Vendor activity (top 5 vendors by PO volume, current project)
- RFQ pipeline (active RFQs by stage)
- Credit/recovery summary (total credits by subtype)
- Category spend (breakdown by top-level category, project-scoped only, D50)
- Recent activity (last 10 audit log entries for procurement records)

Data: tRPC `procurement.dashboard.summary` procedure. Dashboard cards link to pre-filtered list views (D48: same drilldown pattern as M2).

#### 2-3. Vendor List + Detail

**List** (`/entities/{id}/procurement/vendors` -- entity-scoped): Paginated table. Columns: Vendor Code, Name, Classification, Status, City, Country. Filters: status, classification (category), country, text search. Reuses M2 `RegisterFilterBar` pattern.

**Detail** (`/entities/{id}/procurement/vendors/{id}`): Vendor master data, status badge, linked projects (ProjectVendor list), contracts summary, active framework agreements. Action buttons: activate, suspend, blacklist (by permission). Vendor 360 view deferred to M5 (D45).

#### 4-5. Vendor Contract List + Detail

**List** (`/projects/{id}/procurement/contracts`): Columns: Contract Number, Vendor, Title, Total Value, Status, Start Date, End Date. Filters: vendor, contract type, status, active/expired, date range, value range. Dashboard drilldown.

**Detail** (`/projects/{id}/procurement/contracts/{id}`): Header, vendor info, contract terms, value, dates, linked POs, amendment history (parent/child contracts), workflow timeline, documents, audit trail.

#### 6-7. Framework Agreement List + Detail

**List** (`/projects/{id}/procurement/framework-agreements`): Columns: Agreement Number, Vendor, Title, Valid From/To, Committed Value, Utilized Value, Status. Filters: vendor, status, active/expired, item search.

**Detail** (`/projects/{id}/procurement/framework-agreements/{id}`): Header, vendor info, validity dates, line items table (FrameworkAgreementItem), utilization summary (committed vs utilized), linked POs, workflow timeline, documents, audit trail.

#### 8-9. RFQ List + Detail (includes Quotation Comparison, D44)

**List** (`/projects/{id}/procurement/rfqs`): Columns: RFQ Number, Title, Category, Required By, Invited Vendors, Status. Filters: category, status, required-by date, vendor (invited), date range.

**Detail** (`/projects/{id}/procurement/rfqs/{id}`): Header, RFQ items table, invited vendors list (RFQVendor), received quotations, **quotation comparison section** (side-by-side comparison within RFQ detail, not a separate screen). Workflow timeline, documents, audit trail.

**Quotation Comparison Section** (within RFQ Detail): Side-by-side table comparing QuotationLineItems across vendors for the same RFQ. Columns per vendor: unit price, total price, delivery terms. Highlights: lowest price, framework rate deviation, benchmark comparison. Award button per quotation.

#### 10-11. Purchase Order List + Detail

**List** (`/projects/{id}/procurement/purchase-orders`): Columns: PO Number, Vendor, Title, Category, Total Amount, Delivery Status, Payment Status, Status. Filters: vendor, category, status, delivery status, value range, date range.

**Detail** (`/projects/{id}/procurement/purchase-orders/{id}`): Header, vendor info, line items (PurchaseOrderItem), delivery tracking (partially_delivered/delivered status), linked supplier invoices, linked RFQ/quotation source, framework agreement reference, benchmark panel (section 13), workflow timeline, documents, audit trail.

#### 12-13. Supplier Invoice List + Detail

**List** (`/projects/{id}/procurement/invoices`): Columns: Invoice Number, Vendor, PO Ref, Gross, VAT, Total, Due Date, Payment Status, Status. Filters: vendor, PO, status, payment status, due date, overdue flag, amount range.

**Detail** (`/projects/{id}/procurement/invoices/{id}`): Header, vendor info, linked PO, VAT breakdown, due date, payment status tracking, workflow timeline (includes payment preparation phase), documents, audit trail.

#### 14-15. Expense List + Detail (subtype tabs, D41)

**List** (`/projects/{id}/procurement/expenses`): Columns: Reference, Subtype (badge), Title, Amount, Date, Category, Status. Filters: subtype (tabs: All / Ticket / Accommodation / Transport / Equipment / General), status, category, date range, amount range, originator. Reuses M2 subtype-tab pattern from Correspondence.

**Detail** (`/projects/{id}/procurement/expenses/{id}`): Subtype-aware layout:
- **ticket**: traveler name, origin/destination, dates, ticket type
- **accommodation**: guest name, hotel, check-in/out, nightly rate
- **transportation**: vehicle type, origin/destination, distance, rate type
- **equipment**: equipment name/type, rental period, daily rate
- **general**: base fields only

Shared: amount, currency, category, receipt reference, linked PO (if any), workflow timeline, documents, audit trail.

#### 16-17. Credit Note List + Detail

**List** (`/projects/{id}/procurement/credit-notes`): Columns: CN Number, Vendor, Subtype (badge), Amount, Linked Invoice, Status. Filters: vendor, subtype, linked invoice, date range, amount range.

**Detail** (`/projects/{id}/procurement/credit-notes/{id}`): Header, vendor info, subtype, amount, linked invoice (if any), linked PO (if any), linked M2 back_charge (if recovery), reason, workflow timeline, documents, audit trail.

### Navigation

The project workspace sidebar gets a new **Procurement** section:

```
Procurement
├── Dashboard
├── Vendors (links to entity-scoped view)
├── Contracts
├── Framework Agreements
├── RFQs
├── Purchase Orders
├── Invoices
├── Expenses
└── Credit Notes
```

Entity-level navigation for vendor management:

```
Entity Settings
├── Procurement Categories
├── Item Catalog
└── Vendor Master
```

### Component Reuse from M2

| M2 Component | Reuse in M3 |
|---|---|
| `RegisterFilterBar` | All M3 list screens |
| `StatusBadge` | All M3 record status display |
| `TransitionActions` | All M3 workflow action buttons |
| `WorkflowTimeline` | All M3 detail views |
| `AuditTrail` | All M3 detail views |
| `DocumentPanel` | All M3 detail views |
| Reference number generation | Same `ReferenceCounter` service |

---

## 16. Filters / Sorting / Saved Views / Drilldowns

### Standard Filters on All List Screens

Following M2 `RegisterFilterBar` pattern:
- Status filter (multi-select pills)
- Date range (created, due, delivery, etc.)
- Amount range (min/max)
- URL param sync for bookmarkable/shareable filter state

### Per-Record Extra Filters

| Record | Extra Filters |
|---|---|
| Vendor | Classification, status, country, text search (name/code) |
| VendorContract | Vendor, contract type, active/expired, value range |
| FrameworkAgreement | Vendor, active/expired, item search |
| RFQ | Category, required-by date, vendor (invited) |
| Quotation | Vendor, RFQ, price range, validity |
| PurchaseOrder | Vendor, category, delivery status, value range |
| SupplierInvoice | Vendor, PO, payment status, due date, overdue flag |
| Expense | Subtype (tab), category, date range, amount range, originator |
| CreditNote | Vendor, subtype, linked invoice, date range |

### Saved Views (D47 resolved)

Saved filter presets (saved views) are deferred to M5. M3 uses **URL-shareable filter state** only -- filter parameters are serialized to URL query params. Users can bookmark or share filtered views via URL. No server-side saved view persistence.

### Dashboard Drilldown (D48 resolved)

Same pattern as M2: dashboard summary cards include clickable links that navigate to the corresponding list screen with pre-filled URL filter params. Example: clicking "5 POs awaiting delivery" navigates to `/projects/{id}/procurement/purchase-orders?status=issued,acknowledged`.

---

## 17. Role-Permission Model

### Permission Codes (11 resources, ~75 codes)

| Resource | Actions | Count |
|---|---|---|
| `vendor` | `view`, `create`, `edit`, `activate`, `suspend`, `blacklist` | 6 |
| `vendor_contract` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `terminate` | 8 |
| `framework_agreement` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `terminate` | 8 |
| `rfq` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `issue`, `evaluate`, `award` | 9 |
| `quotation` | `view`, `create`, `edit`, `review`, `shortlist`, `award`, `reject` | 7 |
| `purchase_order` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` | 8 |
| `supplier_invoice` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `prepare_payment` | 7 |
| `expense` | `view`, `create`, `edit`, `submit`, `review`, `approve` | 6 |
| `credit_note` | `view`, `create`, `edit`, `review`, `verify`, `apply` | 6 |
| `procurement_dashboard` | `view` | 1 |
| `procurement_category` | `view`, `manage` | 2 |
| **Total** | | **68** |

Plus `item_catalog.view`, `item_catalog.manage` = 2 more, and `project_vendor.view`, `project_vendor.manage` = 2 more. **Grand total: ~72 permission codes.**

### Entity-Scope RBAC Mechanism for Vendor Management

M1 RBAC is project-scoped (permissions are checked via `ProjectAssignment`). Vendor, ItemCatalog, and ProcurementCategory are entity-scoped. The entity-scope mechanism works as follows:

1. **Entity membership**: A user who is assigned to any project within an entity is considered an entity member.
2. **Entity-level permissions**: `vendor.*`, `procurement_category.*`, and `item_catalog.*` permissions are checked against the user's **highest project role within the entity**. If a user has `procurement` role on Project A in Entity X, they have vendor management permissions for Entity X.
3. **Implementation**: A new `entityProcedure` tRPC middleware (analogous to `projectProcedure`) that: (a) validates the user is assigned to at least one project in the entity, (b) resolves the user's effective entity-level permissions by aggregating their project-level permissions, (c) checks the required entity-scoped permission.
4. **No new tables**: No `EntityAssignment` model in M3. Entity membership is derived from existing `ProjectAssignment` records. A dedicated entity-level role assignment model can be introduced in M5 if needed.

### Role-Permission Matrix (D54, D55 resolved)

Legend: **V** = view, **C** = create, **E** = edit, **S** = submit, **R** = review, **A** = approve, **G** = sign, **I** = issue, **T** = terminate, **Ev** = evaluate, **Aw** = award, **Sh** = shortlist, **Act** = activate, **Sus** = suspend, **Bl** = blacklist, **Vf** = verify, **Ap** = apply, **Pp** = prepare_payment, **M** = manage

| Role | vendor | vendor_contract | framework_agreement | rfq | quotation | purchase_order | supplier_invoice | expense | credit_note | dashboard | category |
|------|--------|-----------------|--------------------|----|-----------|---------------|-----------------|---------|------------|-----------|----------|
| **master_admin** | All | All | All | All | All | All | All | All | All | V | M |
| **project_director** | V | V,A,G | V,A,G | V,A | V | V,A,G | V,A | V,A | V | V | V |
| **project_manager** | V | V,R | V,R | V,R,A | V,R | V,R | V,R | V,R,A | V | V | V |
| **contracts_manager** | V | All | All | V,R | V,R | V,R,A,G | V,R | V | V,R | V | V |
| **qs_commercial** | V | V | V | V | V | V | V | V,C,E,S | V | V | V |
| **procurement** | All | V,C,E,S | V,C,E,S | All | All | V,C,E,S,R | V,C,E,S | V,C,E,S | V,C,E | V | V |
| **finance** | V | V,R | V,R | V | V | V,R | All | V,R,A | All | V | V |
| **cost_controller** | V | V | V | V | V | V | V,R | V,R | V | V | V |
| **site_team** | V | -- | -- | -- | -- | V | -- | V,C,E,S | -- | -- | -- |
| **design** | V | -- | -- | -- | -- | V | -- | V,C,E,S | -- | -- | -- |
| **qa_qc** | V | -- | -- | -- | -- | V | -- | V,C,E,S | -- | -- | -- |
| **document_controller** | V | V | V | V | V | V | V | V | V | V | V |
| **pmo** | V | V | V | V | V | V | V | V | V | V | V |
| **executive_approver** | V | V,A | V,A | V,A | V | V,A | V,A | V,A | V | V | V |

**Key decisions reflected:**
- **D54**: Site Team, Design, QA/QC limited to viewing POs and submitting expenses.
- **D55**: Procurement cannot sign POs. Signing is PD or Contracts Manager only.
- **Vendor permissions**: Procurement has full vendor management (entity-scoped). Other roles have view-only.
- **Expense**: Site Team, Design, QA/QC can create and submit expenses (field originator pattern).

---

## 18. Service Boundaries

### New Package: `packages/core/src/procurement/`

```
packages/core/src/procurement/
├── vendor/
│   ├── service.ts          # CRUD + status for Vendor (entity-scoped)
│   ├── validation.ts
│   └── index.ts
├── vendor-contract/
│   ├── service.ts          # CRUD + status transitions + signing
│   ├── validation.ts
│   └── index.ts
├── framework-agreement/
│   ├── service.ts          # CRUD + status + utilization queries
│   ├── validation.ts
│   └── index.ts
├── rfq/
│   ├── service.ts          # CRUD + status + vendor invitation
│   ├── validation.ts
│   └── index.ts
├── quotation/
│   ├── service.ts          # CRUD + status + comparison queries
│   ├── validation.ts
│   └── index.ts
├── purchase-order/
│   ├── service.ts          # CRUD + status + delivery tracking
│   ├── validation.ts
│   └── index.ts
├── supplier-invoice/
│   ├── service.ts          # CRUD + status + PO validation + payment phase
│   ├── validation.ts
│   └── index.ts
├── expense/
│   ├── service.ts          # CRUD + status + subtype routing
│   ├── validation.ts       # Subtype-aware validation
│   └── index.ts
├── credit-note/
│   ├── service.ts          # CRUD + status + linkage validation
│   ├── validation.ts       # Subtype-aware validation
│   └── index.ts
├── category/
│   ├── service.ts          # ProcurementCategory CRUD (entity-scoped)
│   ├── validation.ts
│   └── index.ts
├── catalog/
│   ├── service.ts          # ItemCatalog CRUD (entity-scoped)
│   ├── validation.ts
│   └── index.ts
├── benchmark/
│   ├── service.ts          # Read-only benchmark queries
│   └── index.ts
├── posting-hooks/
│   ├── register.ts         # Registers 7 event types at boot
│   ├── schemas.ts          # Zod schemas for posting payloads
│   └── index.ts
├── dashboard/
│   ├── service.ts          # Dashboard aggregation queries
│   └── index.ts
└── index.ts                # Barrel export
```

### Validation Schemas Package

```
packages/contracts/src/procurement/
├── vendor.ts
├── vendor-contract.ts
├── framework-agreement.ts
├── rfq.ts
├── quotation.ts
├── purchase-order.ts
├── supplier-invoice.ts
├── expense.ts              # Subtype-aware schemas
├── credit-note.ts          # Subtype-aware schemas
├── category.ts
├── catalog.ts
└── index.ts
```

### Service Rules

1. **All procurement services import from M1 core services** -- `auditService`, `postingService`, `workflowInstanceService`, `workflowTemplateService`. Never reimplement M1 logic.
2. **Status transitions are the orchestration point** -- validates transition, updates record, writes audit log, fires posting event (if applicable), emits workflow event.
3. **No cross-service direct calls within procurement** -- read records directly via Prisma, do not call sibling services.
4. **Posting hooks register at boot** -- `posting-hooks/register.ts` called once at initialization.
5. **Entity-scoped services** (vendor, category, catalog) use `entityId` parameter instead of `projectId`. They are called via entity-scoped tRPC procedures.
6. **Benchmark service is read-only** -- no mutations, only aggregation queries.

---

## 19. Database Design

### New Models

All models use M1 conventions: UUID primary keys, `createdAt`/`updatedAt` timestamps, `@map` for snake_case table names, `onDelete: Restrict` for FK relationships.

### Migration

One migration: `{timestamp}_add_procurement_engine`. All additive -- new tables and columns only. No destructive changes to M1 or M2 tables.

**Project model update required:** Prisma requires reciprocal relation arrays for all new project-scoped models:

```prisma
// Added by M3 migration — relation arrays only (no DB columns)
vendorContracts        VendorContract[]
frameworkAgreements    FrameworkAgreement[]
rfqs                   RFQ[]
quotations             Quotation[]
purchaseOrders         PurchaseOrder[]
supplierInvoices       SupplierInvoice[]
expenses               Expense[]
creditNotes            CreditNote[]
projectVendors         ProjectVendor[]
```

**Entity model update required:** Relation arrays for entity-scoped models:

```prisma
// Added by M3 migration — relation arrays only
vendors                Vendor[]
procurementCategories  ProcurementCategory[]
itemCatalogs           ItemCatalog[]
```

### Enums

```prisma
enum ExpenseSubtype {
  ticket
  accommodation
  transportation
  equipment
  general
}

enum CreditNoteSubtype {
  credit_note
  rebate
  recovery
}

enum VendorContractType {
  service
  supply
  subcontract
  consulting
}

enum ProcurementCategoryLevel {
  category
  subcategory
  spend_type
}

enum TicketType {
  flight
  event
  other
}

enum TransportRateType {
  per_trip
  per_day
  per_km
}
```

### Model Outlines (key models only)

```prisma
model Vendor {
  id                 String     @id @default(uuid())
  entityId           String     @map("entity_id")
  vendorCode         String     @map("vendor_code")
  name               String
  tradeName          String?    @map("trade_name")
  registrationNumber String?    @map("registration_number")
  taxId              String?    @map("tax_id")
  contactName        String?    @map("contact_name")
  contactEmail       String?    @map("contact_email")
  contactPhone       String?    @map("contact_phone")
  address            String?
  city               String?
  country            String?
  classification     String?    // FK to ProcurementCategory
  status             String     @default("draft")
  notes              String?
  createdBy          String     @map("created_by")
  createdAt          DateTime   @default(now()) @map("created_at")
  updatedAt          DateTime   @updatedAt @map("updated_at")

  entity             Entity     @relation(fields: [entityId], references: [id], onDelete: Restrict)
  projectVendors     ProjectVendor[]
  vendorContracts    VendorContract[]
  frameworkAgreements FrameworkAgreement[]
  purchaseOrders     PurchaseOrder[]
  supplierInvoices   SupplierInvoice[]
  creditNotes        CreditNote[]
  quotations         Quotation[]

  @@unique([entityId, vendorCode])
  @@index([entityId, status])
  @@index([entityId, name])
  @@map("vendors")
}

model PurchaseOrder {
  id                    String    @id @default(uuid())
  projectId             String    @map("project_id")
  vendorId              String    @map("vendor_id")
  rfqId                 String?   @map("rfq_id")
  quotationId           String?   @map("quotation_id")
  vendorContractId      String?   @map("vendor_contract_id")
  frameworkAgreementId  String?   @map("framework_agreement_id")
  categoryId            String?   @map("category_id")
  poNumber              String    @map("po_number") @unique
  title                 String
  description           String?
  totalAmount           Decimal   @map("total_amount") @db.Decimal(18, 2)
  currency              String
  deliveryDate          DateTime? @map("delivery_date")
  deliveryAddress       String?   @map("delivery_address")
  paymentTerms          String?   @map("payment_terms")
  hasFrameworkDeviation Boolean   @default(false) @map("has_framework_deviation")
  status                String    @default("draft")
  referenceNumber       String?   @unique @map("reference_number")
  createdBy             String    @map("created_by")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  project              Project            @relation(fields: [projectId], references: [id], onDelete: Restrict)
  vendor               Vendor             @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  items                PurchaseOrderItem[]
  supplierInvoices     SupplierInvoice[]

  @@index([projectId, status])
  @@index([projectId, vendorId])
  @@index([projectId, createdAt])
  @@map("purchase_orders")
}

model Expense {
  id                String          @id @default(uuid())
  projectId         String          @map("project_id")
  subtype           ExpenseSubtype
  title             String
  description       String?
  amount            Decimal         @db.Decimal(18, 2)
  currency          String
  expenseDate       DateTime        @map("expense_date")
  categoryId        String?         @map("category_id")
  receiptReference  String?         @map("receipt_reference")
  purchaseOrderId   String?         @map("purchase_order_id")
  status            String          @default("draft")
  // ticket-specific
  ticketType        TicketType?     @map("ticket_type")
  travelerName      String?         @map("traveler_name")
  origin            String?
  destination       String?
  travelDate        DateTime?       @map("travel_date")
  returnDate        DateTime?       @map("return_date")
  // accommodation-specific
  guestName         String?         @map("guest_name")
  checkIn           DateTime?       @map("check_in")
  checkOut          DateTime?       @map("check_out")
  hotelName         String?         @map("hotel_name")
  expenseCity       String?         @map("expense_city")
  nightlyRate       Decimal?        @map("nightly_rate") @db.Decimal(18, 2)
  nights            Int?
  // transportation-specific
  vehicleType       String?         @map("vehicle_type")
  transportOrigin   String?         @map("transport_origin")
  transportDestination String?      @map("transport_destination")
  distance          Decimal?        @db.Decimal(10, 2)
  rateType          TransportRateType? @map("rate_type")
  // equipment-specific
  equipmentName     String?         @map("equipment_name")
  equipmentType     String?         @map("equipment_type")
  rentalPeriodFrom  DateTime?       @map("rental_period_from")
  rentalPeriodTo    DateTime?       @map("rental_period_to")
  dailyRate         Decimal?        @map("daily_rate") @db.Decimal(18, 2)
  days              Int?
  createdBy         String          @map("created_by")
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  project           Project         @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@index([projectId, subtype, status])
  @@index([projectId, createdAt])
  @@map("expenses")
}

model ProcurementCategory {
  id        String                    @id @default(uuid())
  entityId  String                    @map("entity_id")
  name      String
  code      String
  level     ProcurementCategoryLevel
  parentId  String?                   @map("parent_id")
  status    String                    @default("active")
  createdAt DateTime                  @default(now()) @map("created_at")
  updatedAt DateTime                  @updatedAt @map("updated_at")

  entity    Entity                    @relation(fields: [entityId], references: [id], onDelete: Restrict)
  parent    ProcurementCategory?      @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children  ProcurementCategory[]     @relation("CategoryHierarchy")

  @@unique([entityId, code])
  @@index([entityId, level])
  @@index([parentId])
  @@map("procurement_categories")
}
```

### Indexes

Each project-scoped model is indexed on `(projectId, status)` for filtered list queries and `(projectId, createdAt)` for chronological sorting. Entity-scoped models indexed on `(entityId, status)`. FK columns indexed for join performance. Same patterns as M2.

### Seed Data (D13 resolved)

The M3 migration seed adds:
- ~72 new permission codes with role mappings per section 17 matrix
- ~14 workflow templates (see section 5)
- 9 top-level procurement categories with subcategories:

| Category | Subcategories |
|---|---|
| Materials | Steel, Concrete, Electrical, Plumbing, Finishing, Landscaping |
| Equipment | Rental, Purchase, Maintenance |
| Professional Services | Engineering, Design, Legal, Consulting |
| Subcontracting | Civil Works, MEP, Finishing, Specialized |
| Labor | Direct Hire, Outsourced, Overtime |
| Travel & Accommodation | Flights, Hotels, Ground Transport, Per Diem |
| Consumables | Office Supplies, Safety Equipment, Tools |
| Entertainment / Event | Staging, Lighting, AV, Decor, Catering |
| Transportation / Logistics | Freight, Local Delivery, Storage |

Spend types (level 3) are left to entity admin configuration -- not seeded.

---

## 20. API / Router Design

### New tRPC Router: `procurement`

Added to `apps/web/server/routers/_app.ts` alongside existing routers.

```
procurement
├── vendor (entityProcedure — entity-scoped)
│   ├── list        — paginated, filtered, entity-scoped
│   ├── get         — single vendor
│   ├── create      — draft creation
│   ├── update      — edit
│   ├── transition  — status transitions (activate, suspend, blacklist, archive)
│   └── delete      — soft delete draft only
├── projectVendor (projectProcedure — project-scoped junction)
│   ├── list        — vendors linked to project
│   ├── link        — add vendor to project
│   └── unlink      — remove vendor from project
├── vendorContract (projectProcedure)
│   ├── list
│   ├── get
│   ├── create
│   ├── update
│   ├── transition
│   └── delete
├── frameworkAgreement (projectProcedure or entityProcedure based on scope)
│   ├── list
│   ├── get
│   ├── create
│   ├── update
│   ├── transition
│   └── delete
├── rfq (projectProcedure)
│   ├── list
│   ├── get
│   ├── create       — includes RFQItem and RFQVendor creation
│   ├── update
│   ├── transition
│   ├── addVendor    — add vendor to RFQ
│   ├── removeVendor — remove vendor from RFQ
│   └── delete
├── quotation (projectProcedure)
│   ├── list
│   ├── get
│   ├── create       — includes QuotationLineItem creation
│   ├── update
│   ├── transition
│   ├── compare      — quotation comparison for an RFQ
│   └── delete
├── purchaseOrder (projectProcedure)
│   ├── list
│   ├── get
│   ├── create       — includes PurchaseOrderItem creation
│   ├── update
│   ├── transition   — includes delivery tracking transitions
│   └── delete
├── supplierInvoice (projectProcedure)
│   ├── list
│   ├── get
│   ├── create       — validates PO linkage by category rule
│   ├── update
│   ├── transition   — includes payment phase transitions
│   └── delete
├── expense (projectProcedure)
│   ├── list         — filterable by subtype
│   ├── get
│   ├── create       — subtype-aware validation
│   ├── update
│   ├── transition
│   └── delete
├── creditNote (projectProcedure)
│   ├── list
│   ├── get
│   ├── create       — validates vendor linkage, optional invoice/PO/correspondence link
│   ├── update
│   ├── transition
│   └── delete
├── category (entityProcedure — entity-scoped)
│   ├── list         — hierarchical tree
│   ├── get
│   ├── create
│   ├── update
│   └── archive
├── catalog (entityProcedure — entity-scoped)
│   ├── list
│   ├── get
│   ├── create
│   ├── update
│   ├── search       — text search + category filter for quotation memory
│   └── archive
├── benchmark (projectProcedure — read-only)
│   ├── forItem      — benchmark data for a specific item
│   └── forLineItems — batch benchmark for multiple items
└── dashboard (projectProcedure)
    └── summary      — aggregated dashboard data
```

### Entity-Scope Router

The `entityProcedure` middleware:
1. Validates `entityId` from request params
2. Checks user has at least one `ProjectAssignment` in the entity
3. Resolves effective entity-level permissions (highest role across projects)
4. Checks the required entity-scoped permission

### Status Transition Endpoint

Same pattern as M2: each sub-router has a `transition` procedure accepting `{ id, action, comment? }`. The service maps action to next status, validates, executes side effects.

### Input Validation

All input schemas in `packages/contracts/src/procurement/` following M1/M2 pattern.

---

## 21. Reporting / Dashboard Requirements

### Procurement Dashboard Sections (D49 confirmed)

The `procurement.dashboard.summary` procedure returns:

```typescript
{
  activeCommitments: {
    totalPOValue: Decimal,
    byStatus: Record<string, { count: number, value: Decimal }>,
  },
  payablesSummary: {
    totalInvoiceValue: Decimal,
    byStatus: Record<string, { count: number, value: Decimal }>,
  },
  pendingApprovals: number,
  expenseSummary: {
    totalAmount: Decimal,
    bySubtype: Record<string, { count: number, value: Decimal }>,
    byStatus: Record<string, number>,
  },
  vendorActivity: Array<{
    vendorId: string,
    vendorName: string,
    poCount: number,
    totalValue: Decimal,
  }>,  // Top 5 by PO volume
  rfqPipeline: Record<string, number>,  // Count by status
  creditRecoverySummary: {
    totalAmount: Decimal,
    bySubtype: Record<string, { count: number, value: Decimal }>,
  },
  categorySpend: Array<{
    categoryId: string,
    categoryName: string,
    totalSpend: Decimal,
  }>,  // Project-scoped only (D50)
  recentActivity: AuditLogEntry[],  // Last 10
}
```

### 4 Tracker Views (D51 confirmed)

| Tracker | Route | Data Source | Columns |
|---|---|---|---|
| **RFQ-to-PO** | `/projects/{id}/procurement/trackers/rfq-to-po` | RFQ + Quotation + PO joins | RFQ #, Title, Vendors Invited, Quotations Received, Awarded Vendor, PO #, PO Status |
| **PO Delivery** | `/projects/{id}/procurement/trackers/po-delivery` | PurchaseOrder | PO #, Vendor, Value, Ordered Date, Expected Delivery, Delivery Status |
| **Invoice-to-Payment** | `/projects/{id}/procurement/trackers/invoice-payment` | SupplierInvoice | Invoice #, Vendor, PO #, Amount, Due Date, Days Outstanding, Payment Status |
| **Commitment vs Actual** | `/projects/{id}/procurement/trackers/commitment-actual` | PO + SupplierInvoice aggregation | PO #, Vendor, Committed (PO value), Invoiced (SI sum), Remaining, % Utilized |

Tracker views reuse the `RegisterFilterBar` component and support the same filter/sort/URL-param pattern. They are read-only aggregation views, not separate record management screens.

### Notification Templates

Module 3 adds notification templates for procurement workflow events:

| Template | Trigger |
|---|---|
| `procurement_submitted` | Any procurement record submitted for review |
| `procurement_approved` | Any procurement record approved |
| `procurement_rejected` | Any procurement record rejected |
| `procurement_returned` | Any procurement record returned for revision |
| `procurement_signed` | VendorContract or PO signed |
| `procurement_issued` | PO or RFQ issued |
| `po_delivery_partial` | PO marked partially delivered |
| `po_delivery_complete` | PO marked delivered |
| `invoice_payment_prepared` | SupplierInvoice payment prepared |
| `expense_approved` | Expense approved |

Templates use the M1 notification system (in-app + email via BullMQ).

---

## 22. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Model count higher than M2** (9 parent + 5 child + 3 supporting vs M2's 6 + 1 counter) | Medium | Child tables are mechanical line-item tables. Core workflow logic remains in 9 parent models. Each service follows the same M2-proven pattern. |
| 2 | **Vendor as entity-scoped record breaks project-isolation pattern** | Medium | Vendor is master data. ProjectVendor junction maintains project-level control. Same conceptual pattern as M1 User with ProjectAssignment. Entity-scope RBAC mechanism defined in section 17. |
| 3 | **Entity-scoped vendor permissions require RBAC extension** | Medium | New `entityProcedure` middleware derives entity membership from existing ProjectAssignment. No new tables. Permissions aggregated from project roles. |
| 4 | **Quotation comparison complex multi-record query** | Low | Comparison is read-only aggregation. No write complexity. Query joins QuotationLineItem across quotations for one RFQ. |
| 5 | **Framework agreement warn/suggest UX complexity** | Low | Start with suggest (pre-populate). Add deviation flag. No hard enforcement to implement. |
| 6 | **Expense subtypes may grow beyond 5** | Low | Subtype enum is extensible. Nullable columns pattern proven in M2 Correspondence (4 subtypes). |
| 7 | **PO delivery tracking overlaps with inventory concepts** | Medium | M3 tracks delivery status only (yes/no/partial). No stock levels, bin locations, or inventory valuation. |
| 8 | **CreditNote cross-linking to M2 back_charge creates inter-module dependency** | Low | Optional FK. CreditNote stands alone; link is informational. M2 Correspondence model already exists. |
| 9 | **Hybrid item catalog optional complexity** | Low | Catalog is optional master data. System works without it. Teams adopt gradually. |
| 10 | **SupplierInvoice conditional PO rule enforcement ambiguity** | Medium | Service-layer enforcement using category classification or `requiresPO` flag. Clear documentation for which categories require PO. Exception path requires `noPOReason` field. |
| 11 | **Benchmark pricing query performance on large datasets** | Low | Queries scoped to entity + category + item. Indexed on entity + category. Results cached per session. |

---

## 23. Definition of Done for Module 3

Module 3 is **done** when:

1. **Schema**: All 9 parent models + 5 child tables + 3 supporting models created with correct fields, enums, indexes, and relationships.
2. **Migration**: Single additive migration `{timestamp}_add_procurement_engine` runs cleanly. No changes to M1/M2 tables.
3. **Seeds**: ~72 permission codes seeded with correct role mappings per section 17 matrix. ~14 workflow templates seeded. 9 top-level procurement categories with subcategories seeded.
4. **Services**: One service per parent model in `packages/core/src/procurement/`. Shared services for category, catalog, benchmark.
5. **Status transitions**: All transition maps validated at service layer. Invalid transitions rejected with `BAD_REQUEST`.
6. **Posting events**: All 6 firm posting events registered and firing at correct status transitions. `FRAMEWORK_AGREEMENT_ACTIVE` emits audit-only (non-ledger). Idempotency keys enforced.
7. **Posting payload validation**: All 7 Zod posting schemas registered in event registry.
8. **Workflow templates**: All ~14 templates functional. Template selection per project works.
9. **Entity-scope RBAC**: `entityProcedure` middleware functional. Vendor/category/catalog operations enforce entity-level permissions correctly.
10. **tRPC routers**: All sub-routers functional with correct permission checks.
11. **Screens**: All 18 screens functional with correct RBAC gating. Entity-scoped screens (vendor, category, catalog) accessible.
12. **Dashboard**: Procurement dashboard shows all 9 sections with real data.
13. **Tracker views**: All 4 tracker views functional.
14. **Quotation comparison**: Side-by-side comparison section on RFQ detail functional.
15. **Benchmark panel**: Read-only benchmark panel shows on quotation evaluation and PO creation screens.
16. **Framework agreement**: Warn/suggest enforcement on PO creation. Utilization tracking computed.
17. **SupplierInvoice PO rule**: Conditional PO linkage enforced by service layer.
18. **CreditNote linkage**: Flexible vendor/invoice/PO/correspondence linkage works.
19. **Reference numbers**: Atomic sequential generation per project per type code. Entity-scoped for Vendor.
20. **Document attachments**: All procurement records support M1 document linking.
21. **Notifications**: All procurement notification templates seeded and firing.
22. **M1 invariants upheld**: Project isolation (project-scoped records), entity isolation (entity-scoped records), audit logging, signed immutability, posting idempotency.
23. **TypeScript clean**: 0 errors across all packages.
24. **Test coverage**: Lifecycle integration tests for each record type, permission deny suite, posting event verification, entity-scope RBAC tests, conditional PO rule tests, benchmark query tests.

---

## Appendix A: Minor Open Items Resolved in This Spec

| # | Item | Resolution |
|---|------|------------|
| D7 | Vendor creator | Procurement creates vendors; other departments can request |
| D8 | PO creator | Procurement creates POs; PM/Site Team submit requests informally (formal workflow deferred) |
| D9 | SupplierInvoice entry | Either Procurement or Finance can enter supplier invoices |
| D10 | Expense approval chain | Always PM --> Finance; no skip |
| D11 | Category hierarchy depth | 3-level: category / subcategory / spend_type |
| D12 | Category scope | Entity-scoped |
| D13 | Seed categories | 9 top-level categories with subcategories as proposed |
| D14 | Category assignment | Required on PO and SupplierInvoice; optional on Expense |
| D17 | Expense payment tracking | Include `payment_prepared` and `paid` statuses |
| D18 | RFQ PM approval | Optional by template rule; standard template skips PM |
| D19 | PO PD sign threshold | PD sign above configurable threshold |
| D20 | Expense PD approval threshold | PD approval above configurable threshold |
| D21 | VendorContract finance check | By value threshold; small contracts skip finance |
| D22 | Expense finance threshold | Separate threshold, typically lower than PO |
| D23 | PO signing authority | Two-tier: Contracts Manager below threshold, PD above |
| D38 | BackCharge --> CreditNote | Manual creation with optional link; no auto-creation |
| D39 | Benchmark scope | Basic benchmark from internal data only |
| D40 | Benchmark visibility | Shown on both quotation evaluation and PO creation |
| D41 | Expense subtype fields | Accept proposed fields as specified |
| D42 | PO line items | Yes -- PurchaseOrderItem child table |
| D43 | RFQ line items | Yes -- RFQItem child table |
| D44 | Quotation comparison | Section within RFQ Detail page |
| D45 | Vendor 360 view | Deferred to M5 |
| D46 | Total screen count | 18 screens confirmed |
| D47 | Saved views | Deferred to M5; use URL-shareable filter state |
| D48 | Dashboard drilldown | Yes, same pattern as M2 |
| D49 | Dashboard scope | Include all proposed sections |
| D50 | Category spend scope | Project-scoped only |
| D51 | Tracker views | All 4 tracker views included |
| D54 | Role matrix | As proposed; Site/Design/QA/QC limited to viewing POs and submitting expenses |
| D55 | Procurement sign authority | Procurement cannot sign POs; signing is PD or Contracts Manager only |

---

## Appendix B: M1/M2 Extension Points Used by M3

| Extension Point | How M3 Uses It |
|---|---|
| Posting engine (M1) | 6-7 new payable/commitment event types |
| Workflow engine (M1) | ~14 new templates for procurement record types |
| Audit logging (M1) | All M3 mutations write audit logs |
| Notification templates (M1) | ~10 new templates for procurement events |
| RBAC (M1) | 11 new permission resources + entity-scope extension for vendor |
| ReferenceCounter (M2) | Reuse for PO, RFQ, VendorContract, etc. numbering |
| RegisterFilterBar pattern (M2) | Reuse for all M3 list screens |
| StatusBadge / TransitionActions (M2) | Reuse for M3 workflow UI |
| WorkflowTimeline / AuditTrail (M2) | Reuse for M3 detail views |
| Correspondence back_charge (M2) | Optional cross-reference from CreditNote (recovery) |
| Decimal serialization pattern (M2) | Same Zod transform for Decimal fields in tRPC responses |
