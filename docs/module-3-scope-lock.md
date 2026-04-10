# Module 3 — Procurement / Purchasing Engine — Scope Lock

**Date:** 2026-04-11
**Status:** CRITICAL DECISIONS LOCKED — remaining minor items open
**Prerequisite:** Module 2 merged to main (`1e4935d`)
**Next step:** Ahmed reviews remaining minor items → full lock → design spec

> 12 critical architectural decisions locked by Ahmed on 2026-04-11.
> Remaining items marked MINOR OPEN can be resolved during spec writing.
> Sections marked LOCKED must not be reopened.

---

## 1. Included Record Families

### LOCKED — 9 Prisma Models

| # | Model | Subtypes | Scope Level | Description |
|---|-------|----------|-------------|-------------|
| 1 | **Vendor** | — | Entity-scoped master | Supplier/vendor master record with project-vendor links |
| 2 | **VendorContract** | — | Project-scoped | Agreement record with superseded/amendment linkage via `parentContractId` |
| 3 | **FrameworkAgreement** | — | Entity or project-scoped | Standing rate/price agreement — separate model, NOT a VendorContract subtype |
| 4 | **RFQ** | — | Project-scoped | Request for Quotation sent to vendors |
| 5 | **Quotation** | — | Project-scoped | Vendor response to an RFQ (line items with pricing) |
| 6 | **PurchaseOrder** | — | Project-scoped | Issued to vendor after quotation award |
| 7 | **SupplierInvoice** | — | Project-scoped | Received from vendor against PO or contract; payment approval is a workflow phase, NOT a separate record |
| 8 | **Expense** | `ticket`, `accommodation`, `transportation`, `equipment`, `general` | Project-scoped | Direct project costs — one shared model with subtype enum |
| 9 | **CreditNote** | `credit_note`, `rebate`, `recovery` | Project-scoped | Supplier credits reducing payables — one shared model with subtype enum |

**Supporting child tables (line items):**

| Child Table | Parent | Purpose |
|---|---|---|
| FrameworkAgreementItem | FrameworkAgreement | Agreed-rate line items |
| RFQItem | RFQ | Requested item line items |
| RFQVendor | RFQ | Junction: which vendors receive the RFQ |
| QuotationLineItem | Quotation | Vendor-quoted item line items (quotation memory source) |
| PurchaseOrderItem | PurchaseOrder | Ordered item line items |

**Total: 9 parent models + 5 child tables + 1 category model (ProcurementCategory)**

### LOCKED — Critical Decision Resolutions

| Decision | Answer | Source |
|---|---|---|
| D1 — Vendor scope | **Entity-scoped master** with project-vendor links. Not project-only, not system-global. | Ahmed 2026-04-11 |
| D2 — PaymentApproval | **Workflow phase of SupplierInvoice** (approve → payment_prepared → paid). No separate PaymentApproval record in M3. | Ahmed 2026-04-11 |
| D3 — Expense grouping | **One Expense model with `subtype` enum** (ticket, accommodation, transportation, equipment, general). Same pattern as M2 Correspondence. | Ahmed 2026-04-11 |
| D4 — VendorContract versioning | **Standalone record with `superseded` status + `parentContractId`** for amendments. Same pattern as M2 superseded records. | Ahmed 2026-04-11 |
| D5 — FrameworkAgreement model | **Separate model**. Not a VendorContract subtype. Different lifecycle and content structure. | Ahmed 2026-04-11 |
| D6 — Total model count | **9 parent models** confirmed. | Ahmed 2026-04-11 |

---

## 2. Excluded / Deferred Record Families

### LOCKED

| Excluded from M3 | Goes to | Reason |
|---|---|---|
| Budget / cost codes / allocations | Module 4 | Cost-accounting, not procurement |
| Cashflow forecasting | Module 4 | Finance engine |
| Full payables ledger / aging reports | Module 4 | M3 fires posting hooks; M4 builds the ledger |
| Full receivables ledger | Module 4 | Already in M2 posting hooks |
| Payment batching / bank integration | Module 4 | Finance operations |
| Separate PaymentApproval / PaymentVoucher record | Module 4 | Payment approval is a SupplierInvoice workflow phase in M3 |
| Cross-project KPI dashboards | Module 5 | Needs M3+M4 data |
| Spend intelligence mega-dashboard | Module 5 | Needs historical procurement data from M3 + budget from M4 |
| Vendor concentration analytics | Module 5 | Advanced analytics on M3 data |
| Abnormal spend detection | Module 5 | AI/analytics layer |
| AI procurement optimization | Module 6-7 | Agent layer |
| Warehouse / inventory management | Never in M3 | Not procurement scope |
| Fleet management | Never in M3 | Not procurement scope |
| Travel booking platform | Never in M3 | M3 tracks costs, doesn't book travel |
| Full vendor portal (external access) | Never | Internal-only platform |

### LOCKED — Light Hooks vs Full Deferral

| Item | Treatment | Reasoning |
|---|---|---|
| Spend-by-category summary on procurement dashboard | **Include as light aggregation** (groupBy on category, no trend analysis) | Gives procurement team basic visibility without building M5 analytics |
| Vendor performance scores | **Defer to M5** | Requires historical data analysis, not an M3 operational need |
| Multi-currency procurement | **Store currency per record, no conversion** | Same pattern as M2 — store currency code, conversion is M4 |

---

## 3. Ownership by Department

### PROPOSED (based on M2 pattern and role list)

| Record / Subtype | Primary Creator | Primary Reviewer | Approver |
|---|---|---|---|
| Vendor (master) | Procurement | Procurement Manager | — (reference data) |
| VendorContract | Procurement / Contracts | Contracts Manager | PD |
| FrameworkAgreement | Procurement / Contracts | Contracts Manager | PD |
| RFQ | Procurement | PM review | Procurement Manager |
| Quotation | Procurement (receives from vendor) | Procurement / QS | — (input record) |
| PurchaseOrder | Procurement | PM review → Finance check | PD sign |
| SupplierInvoice | Finance / Procurement (receives from vendor) | Finance review | Finance Manager / PD |
| Expense (all subtypes) | Originating department | PM review | Finance |
| CreditNote | Procurement / Finance | Finance review | Finance Manager |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D7 | Who creates and manages Vendor master records? | Options: A) Procurement only / B) Any department can request, Procurement approves / C) Admin function |
| D8 | Who creates PurchaseOrders — Procurement only, or can PM/Site Team initiate? | In some organizations, site teams raise purchase requests that Procurement converts to POs. |
| D9 | Who receives and enters SupplierInvoices? | Options: A) Finance receives and enters / B) Procurement receives, Finance reviews / C) Either department |
| D10 | Should expenses require PM approval before Finance, or go directly to Finance? | Current proposal: PM review → Finance. But some expense types (petty cash) might skip PM. |

---

## 4. Procurement Category Structure

### PROPOSED — 3-Level Hierarchy

```
Category → Subcategory → Spend Type
```

**Model:** `ProcurementCategory` with self-referencing parent FK and `level` enum (`category`, `subcategory`, `spend_type`).

**Scope:** Entity-level configuration (shared across projects within an entity). Not system-global — different entities may have different category trees.

**Proposed seed categories (starting point, configurable by admin):**

| Category | Subcategories (examples) |
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

### MINOR OPEN

| # | Question | Options |
|---|----------|---------|
| D11 | Is the 3-level hierarchy sufficient, or do you need 4 levels? | A) 3 levels (category / subcategory / spend type) / B) 4 levels / C) Flexible depth (unlimited nesting) |
| D12 | Should categories be entity-scoped or system-global? | A) Entity-scoped (recommended) / B) System-global master list / C) System-global base + entity-level extensions |
| D13 | Are the proposed seed categories correct for Fun Makers KSA? | Review list above — add, remove, or rename as needed. |
| D14 | Should every PO / Expense / SupplierInvoice require a category assignment? | A) Required on all procurement records / B) Required on PO and SupplierInvoice, optional on Expense / C) Optional on all |

---

## 5. Record-by-Record Lifecycle Statuses

### LOCKED — Boundary Rules

- **PO delivery tracking:** included in M3 (`partially_delivered`, `delivered`)
- **SupplierInvoice payment tracking:** included in M3 (`partially_paid`, `paid`)
- **Full payables ledger / payment engine:** Module 4

### PROPOSED — Lifecycles

#### Vendor (master data — simpler lifecycle)

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial entry |
| `active` | No | Approved for use |
| `suspended` | No | Temporarily blocked |
| `blacklisted` | Yes | Permanently blocked |
| `archived` | Yes | No longer active |

#### VendorContract

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

#### FrameworkAgreement

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | Both parties signed |
| `active` | No | Posting fires: `FRAMEWORK_AGREEMENT_ACTIVE` (informational) |
| `expired` | Yes | Past validity period |
| `terminated` | Yes | |
| `superseded` | Yes | Replaced by new agreement |

#### RFQ

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

#### Quotation (inbound record — lighter lifecycle)

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Being evaluated |
| `shortlisted` | No | Passed initial evaluation |
| `awarded` | Yes | Selected as winner |
| `rejected` | Yes | Not selected |
| `expired` | Yes | Past validity date |

#### PurchaseOrder

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

#### SupplierInvoice

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

#### Expense

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | PM or manager review |
| `returned` | No | |
| `rejected` | Yes | |
| `approved` | No | Posting fires: `EXPENSE_APPROVED` |
| `payment_prepared` | No | Ready for reimbursement/payment |
| `paid` | Yes | Reimbursed or settled |
| `cancelled` | Yes | |

#### CreditNote

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Finance review |
| `verified` | No | Confirmed valid |
| `applied` | Yes | Posting fires: `CREDIT_NOTE_APPLIED` |
| `disputed` | No | Under dispute |
| `rejected` | Yes | |
| `cancelled` | Yes | |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D17 | Does Expense need `payment_prepared` / `paid` or just `approved` as terminal? | Depends on whether M3 tracks expense reimbursement or just approval. Proposed: include. |

---

## 6. Record-by-Record Workflow Paths

### PROPOSED

#### Vendor (no workflow — master data)
Admin creates → activates. Status changes are direct (no approval workflow).

#### VendorContract
1. Procurement / Contracts prepares
2. PM review
3. Contracts Manager review
4. Finance check — by value threshold
5. PD sign — mandatory
6. Both-party signing → active

#### FrameworkAgreement
1. Procurement prepares
2. Contracts review
3. Finance check — mandatory (rate commitments)
4. PD approval
5. Both-party signing → active

#### RFQ
1. Procurement prepares
2. PM review — optional by rule
3. Procurement Manager approval
4. Issue to vendors
5. Receive quotations
6. Evaluation → award

#### Quotation (no internal workflow — inbound record)
Received → reviewed → shortlisted or rejected. Part of the RFQ evaluation process.

#### PurchaseOrder
1. Procurement prepares
2. PM review
3. Procurement Manager review
4. Finance check — **mandatory** (commitment creation)
5. PD sign — by value threshold
6. Issue to vendor

#### SupplierInvoice (includes payment approval phase)
1. Received / entered
2. Procurement verification (matches PO?)
3. Finance review — **mandatory**
4. Finance Manager approval — by value threshold
5. Payment preparation (workflow phase, not separate record)

#### Expense
1. Originator submits
2. PM review
3. Finance review
4. Approval (Finance Manager or PD by threshold)

#### CreditNote
1. Received / entered
2. Finance review
3. Finance Manager verification
4. Applied to outstanding payable

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D18 | Should RFQ require PM approval before issuing to vendors? | Some organizations require PM sign-off. Others let Procurement operate independently. |
| D19 | Should PO require PD signature on all values, or only above a threshold? | Proposed: PD sign above configurable threshold. |
| D20 | Should Expense have a value threshold that triggers PD approval? | E.g., expenses under 5,000 SAR approved by PM only, above by PD. |

---

## 7. Finance-Check Rules

### PROPOSED (following M2 pattern)

| Record | Finance Check | Rule |
|---|---|---|
| VendorContract | **By value threshold** | Contracts above configured amount |
| FrameworkAgreement | **Mandatory** | Always — rate commitments affect budget |
| RFQ | **Not mandatory** | Unless configured by template |
| PurchaseOrder | **Mandatory** | Always — creates commitment |
| SupplierInvoice | **Mandatory** | Always — triggers payable |
| Expense | **By value threshold** | Above configured amount |
| CreditNote | **Mandatory** | Always — modifies payable position |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D21 | Should VendorContract finance check be mandatory or by threshold? | Proposed: by threshold. Small service contracts may not need finance involvement. |
| D22 | Should Expense finance check threshold be the same as PO threshold? | Or should expenses have a separate, possibly lower, threshold? |

---

## 8. Approval / Sign / Issue Rules

### PROPOSED

| Record | Sign Rule | Issue Control |
|---|---|---|
| VendorContract | **Mandatory** (both parties) | Controlled |
| FrameworkAgreement | **Mandatory** (both parties) | Controlled |
| RFQ | Not required (internal document) | Controlled when sent to vendors |
| PurchaseOrder | **Mandatory** — PD or Procurement Manager by threshold | Controlled |
| SupplierInvoice | Not applicable (inbound document) | — |
| Expense | Not required | — |
| CreditNote | Not applicable (inbound document) | — |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D23 | Should PO be signed by PD always, or Procurement Manager below threshold? | Two-tier signing: Procurement Manager for low-value, PD for high-value. |

---

## 9. Posting Trigger Rules

### LOCKED — 7 Baseline Events (6 firm + 1 conditional)

M3 posting events are the **payable/commitment** side, complementing M2's receivable side.

| Event Type | Fires When | Exposure Type | Status |
|---|---|---|---|
| `PO_ISSUED` | PurchaseOrder → `issued` | Commitment created | **Firm** |
| `PO_DELIVERED` | PurchaseOrder → `delivered` | Goods received (accrual trigger) | **Firm** |
| `SUPPLIER_INVOICE_APPROVED` | SupplierInvoice → `approved` | Payable recognized | **Firm** |
| `EXPENSE_APPROVED` | Expense → `approved` | Expense payable recognized | **Firm** |
| `CREDIT_NOTE_APPLIED` | CreditNote → `applied` | Payable reduction | **Firm** |
| `VENDOR_CONTRACT_SIGNED` | VendorContract → `signed` | Contract commitment | **Firm** |
| `FRAMEWORK_AGREEMENT_ACTIVE` | FrameworkAgreement → `active` | Rate commitment (informational) | **Conditional** — include only if implemented as informational/non-ledger. Drop first if simplifying. |

**No posting:** RFQ, Quotation, Vendor (master data — no financial impact).

### LOCKED — Event Design Rules

| Rule | Decision | Source |
|---|---|---|
| `EXPENSE_APPROVED` is one event for all subtypes | Subtype carried in payload (same as M2 Variation pattern). No per-subtype event explosion. | Ahmed 2026-04-11 |
| `FRAMEWORK_AGREEMENT_ACTIVE` is first to drop | If any event must be removed for simplicity, this one goes first. It's informational, not a spend commitment. | Ahmed 2026-04-11 |
| All events use M1 posting engine | Idempotency keys, Zod payload validation, append-only ledger. Same infrastructure as M2. | Confirmed (M1 invariant) |

---

## 10. Payable / Commitment Linkage Rules

### LOCKED — Boundary and Linkage

The payable chain in M3 mirrors M2's receivable chain:

```
M2 Receivable:  IPA → IPC → TaxInvoice       (claimed → certified → invoiced)
M3 Payable:     PO  → Delivery → SupplierInvoice → Payment  (committed → received → invoiced → paid)
```

**Linkage model:**

| From | To | Cardinality | Rule | Status |
|------|-----|-------------|------|--------|
| RFQ → Quotation | 1:N | One RFQ receives many quotations | Confirmed |
| Quotation → PurchaseOrder | N:1 | Awarded quotation links to its PO | Confirmed |
| PurchaseOrder → SupplierInvoice | 1:N | One PO may have multiple invoices | Confirmed |
| PurchaseOrder → VendorContract | N:1 (optional) | PO may reference a vendor contract | Confirmed |
| PurchaseOrder → FrameworkAgreement | N:1 (optional) | PO may reference framework rates | Confirmed |
| CreditNote → Vendor | N:1 (required) | Always linked to a vendor | **Locked** |
| CreditNote → SupplierInvoice | N:1 (optional) | Can link to specific invoice OR remain vendor-level | **Locked** |
| Expense → PurchaseOrder | N:1 (optional) | Expense may reference a PO, or be standalone | Confirmed |

### LOCKED — SupplierInvoice PO Rule

**Conditional linkage:** PO is required for goods/procurement-controlled spend. PO may be optional for approved service/utility/exception cases by rule. Not fully optional, not fully mandatory.

### LOCKED — CreditNote Linkage

CreditNote can link to a specific SupplierInvoice **or** remain vendor-level. Invoice-only linkage is not forced.

---

## 11. Quotation History Memory Rules

### LOCKED — Hybrid Item Catalog Model

**Decision:** Use a **hybrid model** — optional item catalog supported, quotation lines may reference catalog items or use free text.

**Model approach:**

```
ItemCatalog (optional master data)
  - itemCode (unique within entity)
  - description
  - unit
  - categoryId (FK to ProcurementCategory)
  - entityId (FK — entity-scoped)
  - status (active / archived)

QuotationLineItem
  - quotationId (FK)
  - itemCatalogId (FK, optional — references ItemCatalog if available)
  - itemDescription (text — always populated, even if catalog item is referenced)
  - quantity
  - unit
  - unitPrice
  - totalPrice
  - currency
  - validityDate
  - notes
```

### LOCKED — Memory Scope and Query

| Rule | Decision | Source |
|---|---|---|
| Quotation memory scope | **Entity-wide**, not project-only. Vendors quote at entity level. | Ahmed 2026-04-11 |
| Memory query method | **Text search + category context**. Supports both item code lookup (if catalog used) and free-text description search. | Ahmed 2026-04-11 |
| Item catalog requirement | **Optional**. Teams can adopt the catalog gradually. Quotation lines work with or without catalog references. | Ahmed 2026-04-11 |

---

## 12. Framework Agreement / Agreed-Rate Model

### LOCKED — Separate Model with Warn/Suggest Enforcement

**Model:**

```
FrameworkAgreement
  - vendorId (FK)
  - projectId (FK, optional — entity-wide agreements have no projectId)
  - title, description
  - validFrom, validTo
  - status
  - currency
  - totalCommittedValue (optional — some frameworks have no cap)
  - totalUtilizedValue (basic tracking — sum of PO values referencing this agreement)

FrameworkAgreementItem (line items)
  - frameworkAgreementId (FK)
  - itemCatalogId (FK, optional — references ItemCatalog if available)
  - itemDescription
  - unit
  - agreedRate
  - currency
  - minQuantity (optional)
  - maxQuantity (optional)
  - notes
```

### LOCKED — Enforcement and Utilization

| Rule | Decision | Source |
|---|---|---|
| Framework rate enforcement | **Warn and suggest**, not hard-enforce. Pre-populate PO line items with agreed rates. Allow deviation but flag it. | Ahmed 2026-04-11 |
| Utilization tracking | **Basic tracking in M3** — sum of PO values referencing the agreement. Full budget tracking in M4. | Ahmed 2026-04-11 |
| Framework scope | **Both entity-wide and project-specific** — `projectId` is nullable. Entity-wide agreements have no projectId. | Ahmed 2026-04-11 |

---

## 13. Credits / Credit Notes / Rebate Model

### LOCKED — 3 Subtypes in One CreditNote Model

| Subtype | Description | Typical Source |
|---|---|---|
| `credit_note` | Vendor-issued credit against an invoice | Defective goods, overcharge, cancelled order |
| `rebate` | Volume-based or contractual rebate from vendor | Reaching volume threshold, loyalty program |
| `recovery` | Costs recovered from vendor (back-charge applied) | Defective work, penalty, delay damages |

### LOCKED — Linkage Rules

| Link | Rule |
|------|------|
| CreditNote → Vendor | Required (always linked to a vendor) |
| CreditNote → SupplierInvoice | Optional (may apply to specific invoice or be standalone) |
| CreditNote → PurchaseOrder | Optional (may reference original PO) |
| CreditNote → M2 Correspondence (back_charge) | Optional (recovery may originate from a back charge) |

**Financial impact:** CreditNote.`applied` status fires `CREDIT_NOTE_APPLIED` posting event, reducing the payable position.

### MINOR OPEN

| # | Question | Options |
|---|----------|---------|
| D38 | Should M2's back_charge correspondence records automatically create a CreditNote (recovery) in M3? | A) Yes — issuing a back charge auto-creates a draft CreditNote / B) No — manual creation, optional link / C) System suggests creation but doesn't auto-create |

---

## 14. Benchmark Pricing Model

### PROPOSED

Benchmark pricing gives procurement a reference point when evaluating quotations.

**Sources of benchmark data (in M3 scope):**

| Source | How It Works |
|---|---|
| Quotation history memory | Average/min/max historical prices for same item across vendors (entity-wide) |
| Framework agreement rates | Agreed rates serve as ceiling benchmark |
| Last purchase price | Most recent PO price for same item |

**NOT in M3 scope:**
- External market rate feeds (API integration)
- Inflation-adjusted historical pricing
- Predictive pricing models
- Cross-entity benchmark aggregation

**Implementation:** A read-only "benchmark" panel on the Quotation evaluation screen showing:
- Last 3 purchase prices for this item
- Framework rate (if exists)
- Historical average across vendors
- % deviation from benchmark

### MINOR OPEN

| # | Question | Options |
|---|----------|---------|
| D39 | Is the benchmark scope above correct for M3, or should more analytics be included? | A) Correct — basic benchmark from internal data only / B) Add manual benchmark entry (admin sets market rates) / C) Defer all benchmarking to M5 |
| D40 | Should benchmark data be shown only during quotation evaluation, or also on PO creation? | A) Quotation evaluation only / B) Both quotation evaluation and PO creation / C) Available anywhere a price is entered |

---

## 15. Required Forms and Key Fields

### PROPOSED

#### Vendor (entity-scoped master)
vendorCode (auto-generated), entityId (FK), name, tradeName, registrationNumber, taxId, contactName, contactEmail, contactPhone, address, city, country, classification (from ProcurementCategory), status, notes

#### ProjectVendor (junction table for project-vendor links)
projectId (FK), vendorId (FK), approvedDate, status

#### VendorContract
vendorId (FK), projectId (FK), contractNumber (auto-generated), title, description, contractType, startDate, endDate, totalValue, currency, terms, signedDate, parentContractId (FK, nullable — for amendments), status

#### FrameworkAgreement
vendorId (FK), projectId (FK, optional), agreementNumber (auto-generated), title, description, validFrom, validTo, currency, totalCommittedValue (optional), status
+ **FrameworkAgreementItem** line items (see §12)

#### RFQ
rfqNumber (auto-generated), projectId (FK), title, description, requiredByDate, categoryId (FK to ProcurementCategory), currency, estimatedBudget (optional), status
+ **RFQItem** line items: itemCatalogId (optional FK), itemDescription, quantity, unit, estimatedUnitPrice (optional)
+ **RFQVendor** junction: rfqId + vendorId

#### Quotation
quotationId, rfqId (FK), vendorId (FK), quotationRef (vendor's reference), receivedDate, validUntil, totalAmount, currency, deliveryTerms, paymentTerms, status
+ **QuotationLineItem** (see §11)

#### PurchaseOrder
poNumber (auto-generated), projectId (FK), vendorId (FK), rfqId (FK, optional), quotationId (FK, optional), vendorContractId (FK, optional), frameworkAgreementId (FK, optional), categoryId (FK), title, description, totalAmount, currency, deliveryDate, deliveryAddress, paymentTerms, status
+ **PurchaseOrderItem** line items: itemCatalogId (optional FK), itemDescription, quantity, unit, unitPrice, totalPrice

#### SupplierInvoice
invoiceNumber (vendor's reference), projectId (FK), vendorId (FK), purchaseOrderId (FK, conditional — required for goods, optional for services/utilities), invoiceDate, grossAmount, vatRate, vatAmount, totalAmount, dueDate, currency, status

#### Expense
projectId (FK), subtype (enum), title, description, amount, currency, expenseDate, categoryId (FK to ProcurementCategory), receiptReference, purchaseOrderId (FK, optional), status
+ Subtype-specific nullable fields:
  - **ticket:** ticketType (flight/event/other), travelerName, origin, destination, travelDate, returnDate
  - **accommodation:** guestName, checkIn, checkOut, hotelName, city, nightlyRate, nights
  - **transportation:** vehicleType, origin, destination, distance, rateType (per_trip/per_day/per_km)
  - **equipment:** equipmentName, equipmentType, rentalPeriodFrom, rentalPeriodTo, dailyRate, days
  - **general:** (no extra fields — uses base fields only)

#### CreditNote
creditNoteNumber (auto-generated), projectId (FK), vendorId (FK), subtype (enum), supplierInvoiceId (FK, optional), purchaseOrderId (FK, optional), correspondenceId (FK, optional — link to M2 back_charge), amount, currency, reason, receivedDate, status

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D41 | Are the Expense subtype-specific fields correct? | Review ticket/accommodation/transportation/equipment fields above — add or remove as needed. |
| D42 | Should PurchaseOrder have line items (PurchaseOrderItem), or single-amount like M2's IPA? | Proposed: line items. POs are inherently multi-item. |
| D43 | Should RFQ have line items (RFQItem), or free-form description? | Proposed: line items, so quotation line items can map to RFQ items for comparison. |

---

## 16. Required Screens

### PROPOSED

| Screen | Count | Notes |
|---|---|---|
| Procurement Dashboard | 1 | Aggregated view of all procurement activity |
| Vendor List + Detail | 2 | Entity-scoped master data management |
| Vendor Contract List + Detail | 2 | Contract register |
| Framework Agreement List + Detail | 2 | Rate agreement register |
| RFQ List + Detail | 2 | Includes quotation comparison view on detail |
| Quotation Comparison Sheet | 1 | Side-by-side comparison of quotations for an RFQ |
| Purchase Order List + Detail | 2 | PO register with delivery tracking |
| Supplier Invoice List + Detail | 2 | Invoice register |
| Expense List + Detail (subtype tabs) | 2 | Tabbed: All / Tickets / Accommodation / Transport / Equipment / General |
| Credit Note List + Detail | 2 | Credit/rebate/recovery register |
| **Total** | **18** |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D44 | Should the Quotation Comparison Sheet be a standalone screen or a tab/section within RFQ Detail? | Proposed: section within RFQ Detail page (natural context). |
| D45 | Should Vendor have a "360 view" showing contracts, POs, invoices, credits across projects? | Useful for procurement, but adds complexity. Could defer to M5. |
| D46 | Total screen count (18) — is this appropriate, or should some be combined? | M2 had 12 screens delivered. 18 is proportionate to 9 models. |

---

## 17. Required Filters / Sorting / Saved Views / Drilldowns

### PROPOSED

**Standard filters on all list screens (following M2 RegisterFilterBar pattern):**
- Status filter (multi-select pills)
- Date range (created, due, delivery, etc.)
- Amount range
- Vendor filter (on PO, Invoice, CreditNote, Quotation)
- Category filter (from ProcurementCategory tree)
- URL param sync for drilldown links from dashboard

**Additional per-record filters:**

| Record | Extra Filters |
|---|---|
| Vendor | Classification, status, country |
| VendorContract | Vendor, contract type, active/expired |
| FrameworkAgreement | Vendor, active/expired, item search |
| RFQ | Category, required-by date, vendor (invited) |
| Quotation | Vendor, RFQ, price range, validity |
| PurchaseOrder | Vendor, category, delivery status, PO value range |
| SupplierInvoice | Vendor, PO, payment status, due date, overdue flag |
| Expense | Subtype, category, date range, amount range, originator |
| CreditNote | Vendor, subtype, linked invoice, date range |

### MINOR OPEN

| # | Question | Options |
|---|----------|---------|
| D47 | Should M3 include user-saved filter presets (saved views), or is this an M5 feature? | A) Include in M3 / B) Defer to M5 — use URL-shareable filter state only |
| D48 | Should procurement dashboard cards link to pre-filtered list views (drilldown)? | Proposed: yes, same pattern as M2. |

---

## 18. Module 3 Reports / Dashboards

### PROPOSED — Procurement Dashboard Sections

| Section | Content |
|---|---|
| Active commitments | Total PO value by status (issued, partially_delivered, delivered) |
| Payables summary | Total supplier invoice value by status (received, approved, paid) |
| Pending approvals | Records awaiting current user's action |
| Expense summary | Total expenses by subtype and status |
| Vendor activity | Top 5 vendors by PO volume (current project) |
| RFQ pipeline | Active RFQs by stage |
| Credit/recovery summary | Total credits by subtype |
| Category spend | Spend breakdown by top-level procurement category (project-scoped) |
| Recent activity | Last 10 audit log entries for procurement records |

### PROPOSED — Procurement Tracker Views

| Tracker | Purpose |
|---|---|
| RFQ-to-PO tracker | Status of each RFQ through quotation → award → PO |
| PO delivery tracker | Delivery status of active POs |
| Invoice-to-payment tracker | Status of each invoice from receipt to payment |
| Commitment vs. actual tracker | PO committed value vs. invoiced value |

### MINOR OPEN

| # | Question | Options |
|---|----------|---------|
| D49 | Is the dashboard scope above correct for M3, or should some be deferred to M5? | Proposed: include all — they're operational views, not analytics. |
| D50 | Should "Category spend" be project-only or cross-project? | Proposed: project-scoped only. Cross-project is M5. |
| D51 | Are the 4 tracker views correct? | Review list — add, remove, or modify. |

---

## 19. Role-Permission Matrix for Procurement Operations

### LOCKED — Permission Strategy

| Rule | Decision | Source |
|---|---|---|
| Granularity | **Family-based** — no subtype-level permission explosion | Ahmed 2026-04-11 |
| Vendor permissions | **Entity-scoped** control logic, not pure project-only | Ahmed 2026-04-11 |
| Pattern | Same record-family-level approach as M2 | Confirmed (M2 pattern) |

### PROPOSED — Permission Codes

| Resource | Actions |
|---|---|
| `vendor` | `view`, `create`, `edit`, `activate`, `suspend`, `blacklist` |
| `vendor_contract` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `terminate` |
| `framework_agreement` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `terminate` |
| `rfq` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `issue`, `evaluate`, `award` |
| `quotation` | `view`, `create`, `edit`, `review`, `shortlist`, `award`, `reject` |
| `purchase_order` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `supplier_invoice` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `prepare_payment` |
| `expense` | `view`, `create`, `edit`, `submit`, `review`, `approve` |
| `credit_note` | `view`, `create`, `edit`, `review`, `verify`, `apply` |
| `procurement_dashboard` | `view` |
| `procurement_category` | `view`, `manage` |

### PROPOSED — Role Assignments

| Role | vendor | vendor_contract | framework_agreement | rfq | quotation | purchase_order | supplier_invoice | expense | credit_note | procurement_dashboard | procurement_category |
|------|--------|-----------------|--------------------|----|-----------|---------------|-----------------|---------|------------|----------------------|---------------------|
| Master Admin | all | all | all | all | all | all | all | all | all | view | manage |
| Project Director | view | view, approve, sign | view, approve, sign | view, approve | view | view, approve, sign | view, approve | view, approve | view | view | view |
| Project Manager | view | view, review | view, review | view, review, approve | view, review | view, review, approve | view, review | view, review, approve | view | view | view |
| Site Team | — | — | — | — | — | view | — | view, create, submit | — | — | — |
| Design | — | — | — | — | — | view | — | view, create, submit | — | — | — |
| QA/QC | — | — | — | — | — | view | — | view, create, submit | — | — | — |
| Contracts Manager | view | all | all | view, review | view, review | view, review | view, review | view | view, review | view | view |
| QS / Commercial | view | view | view | view | view | view | view | view, create, submit | view | view | view |
| Procurement | all | view, create, edit, submit | view, create, edit, submit | all | all | all except sign | view, create, edit, submit | view, create, edit, submit | view, create, edit | view | view |
| Finance | view | view, review | view, review | view | view | view, review | all | view, review, approve | all | view | view |
| Cost Controller | view | view | view | view | view | view | view, review | view, review | view | view | view |
| Document Controller | view | view | view | view | view | view | view | view | view | view | view |
| PMO | view | view | view | view | view | view | view | view | view | view | view |
| Executive Approver | view | view, approve | view, approve | view, approve | view | view, approve | view, approve | view, approve | view | view | view |

### MINOR OPEN

| # | Question | Context |
|---|----------|---------|
| D54 | Review the role matrix above — are assignments correct? | Particularly: should Site Team / Design / QA/QC have more procurement access? |
| D55 | Should Procurement role have `sign` permission on POs, or is signing always PD? | Proposed: Procurement cannot sign. Signing is PD or Contracts Manager only. |

---

## 20. Module 3 Risks and Non-Goals

### LOCKED NON-GOALS

| Item | Reason |
|---|---|
| Full finance ERP (GL, journals, bank reconciliation) | Module 4 |
| Warehouse / inventory management | Not procurement scope |
| Fleet management | Not procurement scope |
| Travel booking platform | M3 tracks costs, doesn't book travel |
| Full vendor portal (external access) | Internal-only platform |
| Cross-project spend intelligence | Module 5 |
| Vendor concentration / risk analytics | Module 5 |
| Abnormal spend detection | Module 5 |
| AI procurement optimization / OCR | Module 6-7 |
| Automated reorder / min-max inventory | Not procurement scope |
| Payment batching / bank file generation | Module 4 |
| Multi-currency conversion logic | M3 stores currency; conversion is M4 |
| ZATCA integration | Module 4 or standalone |
| Conditional workflow branching | Not in M3 (linear-first, same as M2) |

### RISKS

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Model count is higher than M2 (9 models + 5 child tables + 1 category vs M2's 6) | Medium | Child tables are mechanical. Core workflow logic remains in 9 parent models. |
| 2 | Vendor as entity-scoped record breaks project-isolation pattern | Medium | Vendor is master data. ProjectVendor junction maintains project-level control. Same pattern as M1 User with ProjectAssignment. |
| 3 | Quotation comparison adds complex multi-record query logic | Low | Comparison is read-only aggregation. No write complexity. |
| 4 | Framework agreement warn/suggest creates UX complexity | Low | Start with suggest (pre-populate), add warning flags. No hard enforcement to implement. |
| 5 | Expense subtypes may grow beyond 5 | Low | Subtype enum is extensible. Nullable columns pattern proven in M2 Correspondence. |
| 6 | PO delivery tracking overlaps with inventory concepts | Medium | M3 tracks delivery status only (yes/no/partial). No stock levels, bin locations, or inventory valuation. |
| 7 | CreditNote cross-linking to M2 back_charge creates inter-module dependency | Low | Optional FK. CreditNote stands alone; link is informational. |
| 8 | Hybrid item catalog adds optional complexity | Low | Catalog is optional master data. System works without it. Teams adopt gradually. |
| 9 | Entity-scoped vendor permissions require RBAC extension | Medium | M1 RBAC is project-scoped. Vendor permissions need entity-scope check. Design spec must define the entity-permission mechanism. |

---

## Decision Summary

### LOCKED (12 Critical Decisions — Ahmed 2026-04-11)

| # | Decision | Answer |
|---|----------|--------|
| 1 | Vendor scope level | Entity-scoped master with project-vendor links |
| 2 | PaymentApproval model | Workflow phase of SupplierInvoice, not a separate record |
| 3 | Expense grouping | One Expense model with `subtype` enum (5 subtypes) |
| 4 | VendorContract versioning | Standalone with `superseded` + `parentContractId` |
| 5 | FrameworkAgreement model | Separate model, not VendorContract subtype |
| 6 | PO/delivery/invoice tracking | Basic tracking in M3; full payables ledger is M4 |
| 7 | Posting events | 6 firm + 1 conditional (FRAMEWORK_AGREEMENT_ACTIVE, drop first if simplifying) |
| 8 | SupplierInvoice PO rule | Conditional — PO required for goods, optional for services/utilities |
| 9 | CreditNote linkage | Can link to specific invoice or remain vendor-level |
| 10 | Item catalog / quotation memory | Hybrid model, entity-wide scope, text search + category context |
| 11 | Framework enforcement | Warn and suggest, not hard-enforce; basic utilization tracking in M3 |
| 12 | Permission granularity | Family-based, no subtype explosion; vendor permissions entity-scoped |

### MINOR OPEN (resolvable during spec)

| # | Topic | Section |
|---|-------|---------|
| D7 | Vendor creator | §3 |
| D8 | PO creator | §3 |
| D9 | SupplierInvoice entry | §3 |
| D10 | Expense approval chain | §3 |
| D11 | Category hierarchy depth | §4 |
| D12 | Category scope level | §4 |
| D13 | Seed categories | §4 |
| D14 | Category assignment rule | §4 |
| D17 | Expense payment tracking | §5 |
| D18 | RFQ PM approval | §6 |
| D19 | PO PD sign threshold | §6 |
| D20 | Expense PD approval threshold | §6 |
| D21 | VendorContract finance check | §7 |
| D22 | Expense finance threshold | §7 |
| D23 | PO signing authority | §8 |
| D38 | BackCharge → CreditNote auto-creation | §13 |
| D39 | Benchmark scope | §14 |
| D40 | Benchmark visibility | §14 |
| D41 | Expense subtype fields | §15 |
| D42 | PO line items | §15 |
| D43 | RFQ line items | §15 |
| D44 | Quotation comparison screen | §16 |
| D45 | Vendor 360 view | §16 |
| D46 | Total screen count | §16 |
| D47 | Saved views | §17 |
| D48 | Dashboard drilldown | §17 |
| D49 | Dashboard scope | §18 |
| D50 | Category spend scope | §18 |
| D51 | Tracker views | §18 |
| D54 | Role matrix review | §19 |
| D55 | Procurement sign authority | §19 |

**31 minor items remain — all resolvable during design spec writing.**

---

## M1/M2 Extension Points Used by M3

| Extension Point | How M3 Uses It |
|---|---|
| Posting engine (M1) | 6–7 new payable/commitment event types |
| Workflow engine (M1) | New templates for 7+ procurement record types |
| Audit logging (M1) | All M3 mutations write audit logs |
| Notification templates (M1) | New templates for procurement events |
| RBAC (M1) | 11 new permission resources + entity-scope extension for vendor |
| ReferenceCounter (M2) | Reuse for PO, RFQ, VendorContract, etc. numbering |
| RegisterFilterBar pattern (M2) | Reuse for all M3 list screens |
| StatusBadge / TransitionActions (M2) | Reuse for M3 workflow UI |
| Correspondence back_charge (M2) | Optional cross-reference from CreditNote (recovery) |
