# Module 3 — Procurement / Purchasing Engine — Scope Lock

**Date:** 2026-04-11
**Status:** DRAFT — awaiting Ahmed's decisions
**Prerequisite:** Module 2 merged to main (`1e4935d`)
**Next step:** Ahmed reviews decisions below → lock → design spec

> This document is the decision input for the Module 3 design spec.
> Sections are marked CONFIRMED (inherited from M1/M2 invariants),
> PROPOSED (Claude's recommendation, needs Ahmed's approval), or
> NEEDS AHMED DECISION (multiple valid options, Ahmed picks).

---

## 1. Included Record Families

### NEEDS AHMED DECISION — Exact Record Families

Procurement covers many document types. The question is how they group into Prisma models.

**Proposed record families (9 models):**

| # | Model | Subtypes | Description |
|---|-------|----------|-------------|
| 1 | **Vendor** | — | Supplier/vendor master record (company, contacts, classification, status) |
| 2 | **VendorContract** | — | Agreement record between project and vendor (terms, dates, value) |
| 3 | **FrameworkAgreement** | — | Standing rate/price agreement (items at agreed rates for a period) |
| 4 | **RFQ** | — | Request for Quotation sent to vendors |
| 5 | **Quotation** | — | Vendor response to an RFQ (line items with pricing) |
| 6 | **PurchaseOrder** | — | Issued to vendor after quotation award |
| 7 | **SupplierInvoice** | — | Received from vendor against PO or contract |
| 8 | **Expense** | `ticket`, `accommodation`, `transportation`, `equipment`, `general` | Direct project costs not tied to PO |
| 9 | **CreditNote** | `credit_note`, `rebate`, `recovery` | Supplier credits reducing payables |

**Decision flags for Ahmed:**

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Is **Vendor** a project-scoped record or an entity-level master? | A) Project-scoped (each project has its own vendor list) / B) Entity-level master (vendors shared across projects, then linked to projects) / C) System-level master (global vendor registry) | **B** — Entity-level master with project-vendor links, similar to how Users are system-level but assigned to projects. Vendors work across projects for the same entity. |
| D2 | Is **PaymentApproval** a separate record family or a status phase of SupplierInvoice? | A) Separate PaymentApproval record (like M2's IPC is separate from IPA) / B) Payment approval is a workflow phase of SupplierInvoice (approve → payment_prepared → paid) / C) Separate PaymentVoucher record that bundles multiple approved invoices | **B** for M3 — keep payment approval as a SupplierInvoice workflow phase. Separate PaymentVoucher/batch-payment is an M4 Finance concept. |
| D3 | How should **tickets / accommodation / transport / equipment** be grouped? | A) One Expense model with `subtype` enum (like M2 Correspondence) / B) Separate models per cost type / C) One Expense model with `category` from the procurement category tree (no enum, uses category FK) | **A** — Shared Expense model with `subtype` enum. Same pattern as M2 Correspondence. Each subtype has specific nullable fields. Keeps the engine clean. |
| D4 | Is **VendorContract** a standalone record or a vendor-linked master with versions? | A) Standalone per-project record (simple: one contract = one record) / B) Vendor-linked master with version history (contract record + amendment records) / C) Standalone record with `superseded` status and parent link (like M2 variations) | **C** — Standalone record with `superseded` status + `parentContractId` for amendments. Same pattern as M2's superseded records. Keeps it simple while supporting versioning. |
| D5 | Should **FrameworkAgreement** be a separate model or a VendorContract subtype? | A) Separate model (different lifecycle, contains item-rate lines) / B) VendorContract with `type: framework` subtype | **A** — Separate model. Framework agreements have fundamentally different content (rate tables, item lists, validity periods) vs. regular contracts (terms, deliverables, milestones). |
| D6 | How many total Prisma models? | 9 as proposed / fewer by merging / more by splitting | See D1–D5 — total depends on answers. Proposed: 9 if all decisions go with recommendation. |

---

## 2. Excluded / Deferred Record Families

### CONFIRMED (from M2 scope lock and module boundaries)

| Excluded from M3 | Goes to | Reason |
|---|---|---|
| Budget / cost codes / allocations | Module 4 | Cost-accounting, not procurement |
| Cashflow forecasting | Module 4 | Finance engine |
| Full payables ledger / aging reports | Module 4 | M3 fires posting hooks; M4 builds the ledger |
| Full receivables ledger | Module 4 | Already in M2 posting hooks |
| Payment batching / bank integration | Module 4 | Finance operations |
| Cross-project KPI dashboards | Module 5 | Needs M3+M4 data |
| Spend intelligence mega-dashboard | Module 5 | Needs historical procurement data from M3 + budget from M4 |
| Vendor concentration analytics | Module 5 | Advanced analytics on M3 data |
| Abnormal spend detection | Module 5 | AI/analytics layer |
| AI procurement optimization | Module 6-7 | Agent layer |
| Warehouse / inventory management | Never in M3 | Not procurement scope |
| Fleet management | Never in M3 | Not procurement scope |
| Travel booking platform | Never in M3 | M3 tracks costs, doesn't book travel |
| Full vendor portal (external access) | Never | Internal-only platform |

### PROPOSED — Light Hooks vs Full Deferral

| Item | Proposed Treatment | Reasoning |
|---|---|---|
| Spend-by-category summary on procurement dashboard | **Include as light aggregation** (groupBy on category, no trend analysis) | Gives procurement team basic visibility without building M5 analytics |
| Vendor performance scores | **Defer to M5** | Requires historical data analysis, not an M3 operational need |
| Automated reorder triggers | **Defer indefinitely** | Inventory concept, not procurement |
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
| Expense (ticket) | Originating department | PM review | Finance |
| Expense (accommodation) | Originating department | PM review | Finance |
| Expense (transportation) | Originating department | PM review | Finance |
| Expense (equipment) | Originating department / Procurement | PM review | Finance / PD |
| CreditNote | Procurement / Finance | Finance review | Finance Manager |

### NEEDS AHMED DECISION

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

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D11 | Is the 3-level hierarchy sufficient, or do you need 4 levels? | A) 3 levels (category / subcategory / spend type) / B) 4 levels / C) Flexible depth (unlimited nesting) |
| D12 | Should categories be entity-scoped or system-global? | A) Entity-scoped (recommended — each entity configures its own tree) / B) System-global master list / C) System-global base + entity-level extensions |
| D13 | Are the proposed seed categories correct for Fun Makers KSA? | Review list above — add, remove, or rename as needed. The "Entertainment / Event" category is Fun Makers-specific. |
| D14 | Should every PO / Expense / SupplierInvoice require a category assignment? | A) Required on all procurement records / B) Required on PO and SupplierInvoice, optional on Expense / C) Optional on all |

---

## 5. Record-by-Record Lifecycle Statuses

### PROPOSED

#### Vendor

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial entry |
| `active` | No | Approved for use |
| `suspended` | No | Temporarily blocked |
| `blacklisted` | Yes | Permanently blocked |
| `archived` | Yes | No longer active |

> Vendor is a master record, not a workflow-driven document. Statuses are simpler.

#### VendorContract

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | |
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
| `active` | No | Agreement in force |
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

#### Quotation

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Being evaluated |
| `shortlisted` | No | Passed initial evaluation |
| `awarded` | Yes | Selected as winner |
| `rejected` | Yes | Not selected |
| `expired` | Yes | Past validity date |

> Quotation is an inbound record from a vendor, not an internal workflow document.
> Lighter lifecycle than internal records.

#### PurchaseOrder

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | |
| `issued` | No | Sent to vendor |
| `acknowledged` | No | Vendor confirmed receipt |
| `partially_delivered` | No | Partial goods/services received |
| `delivered` | No | All goods/services received |
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
| `approved` | No | Approved for payment |
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
| `approved` | No | |
| `payment_prepared` | No | Ready for reimbursement/payment |
| `paid` | Yes | Reimbursed or settled |
| `cancelled` | Yes | |

#### CreditNote

| Status | Terminal? | Notes |
|---|---|---|
| `received` | No | From vendor |
| `under_review` | No | Finance review |
| `verified` | No | Confirmed valid |
| `applied` | Yes | Applied to payable/invoice |
| `disputed` | No | Under dispute |
| `rejected` | Yes | |
| `cancelled` | Yes | |

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D15 | Should PurchaseOrder track delivery status (`partially_delivered`, `delivered`), or is that M4/inventory scope? | Proposed: include basic delivery tracking. Without it, you can't close a PO or match invoices. |
| D16 | Should SupplierInvoice have `partially_paid` / `paid` statuses in M3, or defer all payment tracking to M4? | Proposed: include basic payment tracking (same pattern as M2 TaxInvoice with `partially_collected` / `collected`). Full payment ledger is M4. |
| D17 | Does Expense need `payment_prepared` / `paid` or just `approved` as terminal? | Depends on whether M3 tracks expense reimbursement or just approval. |

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

#### SupplierInvoice
1. Received / entered
2. Procurement verification (matches PO?)
3. Finance review — **mandatory**
4. Finance Manager approval — by value threshold
5. Payment preparation

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

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D18 | Should RFQ require PM approval before issuing to vendors? | Some organizations require PM sign-off on what's being sourced. Others let Procurement operate independently. |
| D19 | Should PO require PD signature on all values, or only above a threshold? | Proposed: PD sign above configurable threshold. Below threshold, Procurement Manager approval is sufficient. |
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

### NEEDS AHMED DECISION

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

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D23 | Should PO be signed by PD always, or Procurement Manager below threshold? | Two-tier signing: Procurement Manager for low-value, PD for high-value. |

---

## 9. Posting Trigger Rules

### PROPOSED

M3 posting events are the **payable/commitment** side, complementing M2's receivable side.

| Event Type | Fires When | Exposure Type |
|---|---|---|
| `PO_ISSUED` | PurchaseOrder → `issued` | Commitment created |
| `PO_DELIVERED` | PurchaseOrder → `delivered` | Goods received (accrual trigger) |
| `SUPPLIER_INVOICE_APPROVED` | SupplierInvoice → `approved` | Payable recognized |
| `EXPENSE_APPROVED` | Expense → `approved` | Expense payable recognized |
| `CREDIT_NOTE_APPLIED` | CreditNote → `applied` | Payable reduction |
| `VENDOR_CONTRACT_SIGNED` | VendorContract → `signed` | Contract commitment |
| `FRAMEWORK_AGREEMENT_ACTIVE` | FrameworkAgreement → `active` | Rate commitment |

**No posting:** RFQ, Quotation, Vendor (master data — no financial impact).

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D24 | Are 7 posting events correct, or should some be added/removed? | Review list above. Key question: should `PO_DELIVERED` exist in M3 or is delivery tracking M4? |
| D25 | Should `EXPENSE_APPROVED` be one event for all expense subtypes, or separate events per subtype (TICKET_APPROVED, ACCOMMODATION_APPROVED, etc.)? | Recommendation: one `EXPENSE_APPROVED` event with `subtype` in payload (same as M2 Variation pattern). Avoids event-type explosion. |
| D26 | Should FrameworkAgreement fire a posting event at all? | It's a rate commitment, not a spend commitment. No specific amount until POs are issued against it. Could argue it's informational only. |

---

## 10. Payable / Commitment Linkage Rules

### PROPOSED

The payable chain in M3 mirrors M2's receivable chain:

```
M2 Receivable:  IPA → IPC → TaxInvoice (claimed → certified → invoiced)
M3 Payable:     PO  → Delivery → SupplierInvoice → Payment (committed → received → invoiced → paid)
```

**Linkage model:**

| From | To | Cardinality | Rule |
|------|-----|-------------|------|
| RFQ → Quotation | 1:N | One RFQ receives many quotations |
| Quotation → PurchaseOrder | N:1 | Awarded quotation links to its PO |
| PurchaseOrder → SupplierInvoice | 1:N | One PO may have multiple invoices (partial deliveries, progress billing) |
| PurchaseOrder → VendorContract | N:1 (optional) | PO may reference a vendor contract |
| PurchaseOrder → FrameworkAgreement | N:1 (optional) | PO may reference framework rates |
| SupplierInvoice → CreditNote | 1:N (optional) | Credits may apply to specific invoices |
| CreditNote → SupplierInvoice | N:1 (optional) | Or credits may be standalone (vendor-level, not invoice-specific) |
| Expense → PurchaseOrder | N:1 (optional) | Expense may reference a PO, or be standalone |

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D27 | Should SupplierInvoice require a PO link, or can invoices exist without a PO? | Some invoices (utilities, recurring services) may not have a PO. Options: A) PO required / B) PO optional / C) PO required for goods, optional for services |
| D28 | Should CreditNote link to a specific SupplierInvoice, or to a Vendor only? | Options: A) Must link to specific invoice / B) Can link to invoice or vendor (standalone credit) / C) Always vendor-level |
| D29 | Can an Expense link to a PO, or are Expenses always PO-independent? | Some organizations require PO for all spend above a threshold, making Expenses only for small items. |

---

## 11. Quotation History Memory Rules

### PROPOSED

Quotation memory allows the procurement team to see historical pricing when sourcing items.

**Concept:** When a vendor quotes a price for an item/service, that price is stored with metadata (date, quantity, terms). Future RFQs can pull historical quotes for the same item/vendor for comparison.

**Model approach:**

```
QuotationLineItem
  - quotationId (FK)
  - itemDescription (text)
  - itemCode (optional — from ProcurementCategory or free text)
  - quantity
  - unit
  - unitPrice
  - totalPrice
  - currency
  - validityDate
  - notes
```

**Memory query:** Given an item description or code, show all historical quotes across vendors with prices, dates, and quantities.

**Normalization question:** How items are identified across quotations determines the quality of memory.

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D30 | Should M3 include a formal **Item Catalog** (master list of procurable items with codes)? | A) Yes — ItemCatalog model, items are master data / B) No formal catalog — items are free-text on line items, matched by description / C) Hybrid — optional catalog, line items can reference catalog or use free text |
| D31 | How should quotation memory be queried? | A) By exact item code (requires catalog) / B) By text search across line item descriptions / C) By procurement category + free text |
| D32 | Should quotation memory span across projects within an entity, or be project-scoped? | Recommendation: entity-scoped (vendors quote at entity level, not per project). |

---

## 12. Framework Agreement / Agreed-Rate Model

### PROPOSED

Framework agreements are standing rate contracts with vendors for commonly purchased items/services.

**Model:**

```
FrameworkAgreement
  - vendorId (FK)
  - projectId (FK, optional — entity-wide agreements have no projectId)
  - title
  - description
  - validFrom
  - validTo
  - status
  - currency
  - totalCommittedValue (optional — some frameworks have no cap)
  - totalUtilizedValue (computed from POs referencing this agreement)

FrameworkAgreementItem (line items)
  - frameworkAgreementId (FK)
  - itemDescription
  - itemCode (optional — FK to ItemCatalog if D30 = A)
  - unit
  - agreedRate
  - currency
  - minQuantity (optional)
  - maxQuantity (optional)
  - notes
```

**PO integration:** When creating a PO against a framework agreement, the system can pre-populate line items with agreed rates. Actual PO prices may differ (negotiated discount, quantity adjustment).

**Benchmark use:** Framework rates serve as the baseline for price comparison on new quotations.

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D33 | Should FrameworkAgreements be project-scoped, entity-scoped, or both? | A) Project-scoped only / B) Entity-scoped only / C) Both — entity-wide agreements + project-specific agreements |
| D34 | Should the system enforce framework rates on POs, or just suggest them? | A) Enforce — PO price cannot exceed framework rate without override / B) Suggest — pre-populate but allow any price / C) Warn — allow deviation but flag it |
| D35 | Should framework utilization (total spent against agreement) be tracked in M3, or deferred to M4? | Proposed: basic utilization tracking in M3 (sum of PO values referencing the agreement). Full budget tracking in M4. |

---

## 13. Credits / Credit Notes / Rebate Model

### PROPOSED

**3 subtypes in one CreditNote model:**

| Subtype | Description | Typical Source |
|---|---|---|
| `credit_note` | Vendor-issued credit against an invoice | Defective goods, overcharge, cancelled order |
| `rebate` | Volume-based or contractual rebate from vendor | Reaching volume threshold, loyalty program |
| `recovery` | Costs recovered from vendor (back-charge applied) | Defective work, penalty, delay damages |

**Linkage:**

| Link | Rule |
|------|------|
| CreditNote → Vendor | Required (always linked to a vendor) |
| CreditNote → SupplierInvoice | Optional (may apply to specific invoice or be standalone) |
| CreditNote → PurchaseOrder | Optional (may reference original PO) |
| CreditNote → M2 Correspondence (back_charge) | Optional (recovery may originate from a back charge) |

**Financial impact:** CreditNote.`applied` status fires `CREDIT_NOTE_APPLIED` posting event, reducing the payable position.

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D36 | Is the 3-subtype CreditNote model correct, or should rebates/recoveries be separate models? | A) One model with subtypes (recommended — same pattern as M2 Correspondence) / B) Separate models for each |
| D37 | Should CreditNote link to a specific SupplierInvoice, or just to the Vendor? | See D28 — same question. |
| D38 | Should M2's back_charge correspondence records automatically create a CreditNote (recovery) in M3? | A) Yes — issuing a back charge auto-creates a draft CreditNote / B) No — manual creation, optional link / C) System suggests creation but doesn't auto-create |

---

## 14. Benchmark Pricing Model

### PROPOSED

Benchmark pricing gives procurement a reference point when evaluating quotations.

**Sources of benchmark data (in M3 scope):**

| Source | How It Works |
|---|---|
| Quotation history memory | Average/min/max historical prices for same item across vendors |
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

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D39 | Is the benchmark scope above correct for M3, or should more analytics be included? | A) Correct — basic benchmark from internal data only / B) Add manual benchmark entry (admin sets market rates) / C) Defer all benchmarking to M5 |
| D40 | Should benchmark data be shown only during quotation evaluation, or also on PO creation? | A) Quotation evaluation only / B) Both quotation evaluation and PO creation / C) Available anywhere a price is entered |

---

## 15. Required Forms and Key Fields

### PROPOSED

#### Vendor
vendorCode (auto-generated), name, tradeName, registrationNumber, taxId, contactName, contactEmail, contactPhone, address, city, country, classification (from ProcurementCategory), status, notes

#### VendorContract
vendorId (FK), projectId (FK), contractNumber (auto-generated), title, description, contractType, startDate, endDate, totalValue, currency, terms, signedDate, parentContractId (FK, nullable — for amendments), status

#### FrameworkAgreement
vendorId (FK), projectId (FK, optional), agreementNumber (auto-generated), title, description, validFrom, validTo, currency, totalCommittedValue (optional), status
+ **FrameworkAgreementItem** line items (see §12)

#### RFQ
rfqNumber (auto-generated), projectId (FK), title, description, requiredByDate, category (FK to ProcurementCategory), currency, estimatedBudget (optional), status
+ **RFQItem** line items: itemDescription, itemCode (optional), quantity, unit, estimatedUnitPrice (optional)
+ **RFQVendor** junction: rfqId + vendorId (which vendors receive the RFQ)

#### Quotation
quotationId, rfqId (FK), vendorId (FK), quotationRef (vendor's reference), receivedDate, validUntil, totalAmount, currency, deliveryTerms, paymentTerms, status
+ **QuotationLineItem** (see §11)

#### PurchaseOrder
poNumber (auto-generated), projectId (FK), vendorId (FK), rfqId (FK, optional), quotationId (FK, optional), vendorContractId (FK, optional), frameworkAgreementId (FK, optional), category (FK), title, description, totalAmount, currency, deliveryDate, deliveryAddress, paymentTerms, status
+ **PurchaseOrderItem** line items: itemDescription, itemCode (optional), quantity, unit, unitPrice, totalPrice

#### SupplierInvoice
invoiceNumber (vendor's reference), projectId (FK), vendorId (FK), purchaseOrderId (FK, per D27), invoiceDate, grossAmount, vatRate, vatAmount, totalAmount, dueDate, currency, status

#### Expense
projectId (FK), subtype (enum), title, description, amount, currency, expenseDate, category (FK to ProcurementCategory), receiptReference, purchaseOrderId (FK, optional per D29), status
+ Subtype-specific nullable fields:
  - **ticket:** ticketType (flight/event/other), travelerName, origin, destination, travelDate, returnDate
  - **accommodation:** guestName, checkIn, checkOut, hotelName, city, nightlyRate, nights
  - **transportation:** vehicleType, origin, destination, distance, rateType (per_trip/per_day/per_km)
  - **equipment:** equipmentName, equipmentType, rentalPeriodFrom, rentalPeriodTo, dailyRate, days
  - **general:** (no extra fields — uses base fields only)

#### CreditNote
creditNoteNumber (auto-generated), projectId (FK), vendorId (FK), subtype (enum), supplierInvoiceId (FK, optional), purchaseOrderId (FK, optional), correspondenceId (FK, optional — link to M2 back_charge), amount, currency, reason, receivedDate, status

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D41 | Are the Expense subtype-specific fields correct? | Review ticket/accommodation/transportation/equipment fields above — add or remove as needed. |
| D42 | Should PurchaseOrder have line items (PurchaseOrderItem), or single-amount like M2's IPA? | Proposed: line items. POs are inherently multi-item. But this adds a child table. |
| D43 | Should RFQ have line items (RFQItem), or free-form description? | Proposed: line items, so quotation line items can map to RFQ items for comparison. |

---

## 16. Required Screens

### PROPOSED

| Screen | Count | Notes |
|---|---|---|
| Procurement Dashboard | 1 | Aggregated view of all procurement activity |
| Vendor List + Detail | 2 | Master data management |
| Vendor Contract List + Detail | 2 | Contract register |
| Framework Agreement List + Detail | 2 | Rate agreement register |
| RFQ List + Detail | 2 | Includes quotation comparison view on detail |
| Quotation Comparison Sheet | 1 | Side-by-side comparison of quotations for an RFQ |
| Purchase Order List + Detail | 2 | PO register with delivery tracking |
| Supplier Invoice List + Detail | 2 | Invoice register |
| Expense List + Detail (subtype tabs) | 2 | Tabbed: All / Tickets / Accommodation / Transport / Equipment / General |
| Credit Note List + Detail | 2 | Credit/rebate/recovery register |
| **Total** | **18** |

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D44 | Should the Quotation Comparison Sheet be a standalone screen or a tab/section within RFQ Detail? | Proposed: section within RFQ Detail page (natural context). |
| D45 | Should Vendor have a "360 view" showing contracts, POs, invoices, credits across projects? | This is a vendor-centric view. Useful for procurement, but adds complexity. Could defer to M5. |
| D46 | Total screen count (18) — is this appropriate, or should some be combined? | M2 had 14 screens (12 delivered). 18 is proportionate to the number of record families. |

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

**Saved Views:**

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D47 | Should M3 include user-saved filter presets (saved views), or is this an M5 feature? | A) Include in M3 — procurement teams need saved views for daily workflows / B) Defer to M5 — use URL-shareable filter state only |
| D48 | Should procurement dashboard cards link to pre-filtered list views (drilldown)? | Proposed: yes, same pattern as M2 dashboard → register drilldown. |

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
| Category spend | Spend breakdown by top-level procurement category |
| Recent activity | Last 10 audit log entries for procurement records |

### PROPOSED — Procurement Tracker Views

| Tracker | Purpose |
|---|---|
| RFQ-to-PO tracker | Status of each RFQ through quotation → award → PO |
| PO delivery tracker | Delivery status of active POs |
| Invoice-to-payment tracker | Status of each invoice from receipt to payment |
| Commitment vs. actual tracker | PO committed value vs. invoiced value |

### NEEDS AHMED DECISION

| # | Question | Options |
|---|----------|---------|
| D49 | Is the dashboard scope above correct for M3, or should some be deferred to M5? | Proposed: include all above. They're operational views, not intelligence analytics. |
| D50 | Should the "Category spend" section show only current-project data, or cross-project? | Proposed: project-scoped only in M3. Cross-project spend analytics is M5. |
| D51 | Are the 4 proposed tracker views correct? | Review list — add, remove, or modify. |

---

## 19. Role-Permission Matrix for Procurement Operations

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

### NEEDS AHMED DECISION

| # | Question | Context |
|---|----------|---------|
| D52 | Is the permission granularity correct? | 11 resources × 6-10 actions each. More granular than M2's 8 resources × 8 actions. |
| D53 | Should vendor management permissions be project-scoped or entity-scoped? | If vendors are entity-level (D1=B), vendor permissions may need to be entity-scoped, not project-scoped. |
| D54 | Review the role matrix above — are the assignments correct for your organization? | Particularly: should Site Team / Design / QA/QC have any procurement access beyond viewing POs and submitting expenses? |
| D55 | Should Procurement role have `sign` permission on POs, or is signing always PD? | Proposed: Procurement cannot sign. Signing is PD or Contracts Manager only. |

---

## 20. Module 3 Risks and Non-Goals

### CONFIRMED NON-GOALS

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
| 1 | Model count is higher than M2 (9 models + 3 line-item tables vs M2's 6) | Medium | Line-item tables are mechanical (child records). Core workflow logic remains in the 9 parent models. |
| 2 | Vendor as entity-scoped record breaks project-isolation pattern | Medium | Vendor is master data, not a workflow document. Project-vendor link table maintains project-level control. M1's User model is already system-level with project assignments — same pattern. |
| 3 | Quotation comparison adds complex multi-record query logic | Low | Comparison is a read-only view aggregating quotation line items by RFQ. No write complexity. |
| 4 | Framework agreement rate enforcement vs suggestion creates UX complexity | Low | Start with "suggest" (pre-populate), add enforcement later if needed. |
| 5 | Expense subtypes may grow beyond 5 | Low | Subtype enum is extensible. New subtypes add nullable columns. Same proven pattern as M2 Correspondence (4 subtypes). |
| 6 | PO delivery tracking overlaps with inventory/warehouse concepts | Medium | M3 tracks delivery status (yes/no/partial) only. No stock levels, bin locations, or inventory valuation. Clear boundary. |
| 7 | CreditNote cross-linking to M2 back_charge Correspondence creates inter-module dependency | Low | Optional FK reference. CreditNote stands alone; the link is informational, not structural. |
| 8 | Permission matrix is larger (11 resources vs M2's 8) | Low | Follows same record-family-level pattern. No per-subtype permissions. Manageable growth. |

---

## Decision Summary

### Decisions Requiring Ahmed's Confirmation

| # | Topic | Section | Key Question |
|---|-------|---------|-------------|
| D1 | Vendor scope level | §1 | Project-scoped, entity-scoped, or system-global? |
| D2 | PaymentApproval model | §1 | Separate record or SupplierInvoice workflow phase? |
| D3 | Expense grouping | §1 | One model with subtypes or separate models? |
| D4 | VendorContract versioning | §1 | Standalone + superseded, or master with versions? |
| D5 | FrameworkAgreement model | §1 | Separate model or VendorContract subtype? |
| D6 | Total model count | §1 | 9 as proposed? |
| D7 | Vendor creator | §3 | Who manages vendor master? |
| D8 | PO creator | §3 | Procurement only, or also PM/Site Team? |
| D9 | SupplierInvoice entry | §3 | Finance, Procurement, or either? |
| D10 | Expense approval chain | §3 | PM → Finance, or sometimes direct to Finance? |
| D11 | Category hierarchy depth | §4 | 3 levels, 4 levels, or unlimited? |
| D12 | Category scope level | §4 | Entity-scoped, system-global, or hybrid? |
| D13 | Seed categories | §4 | Review proposed list for Fun Makers KSA |
| D14 | Category assignment | §4 | Required on all records, some, or optional? |
| D15 | PO delivery tracking | §5 | Include in M3 or defer to M4? |
| D16 | SupplierInvoice payment tracking | §5 | Include basic tracking or defer to M4? |
| D17 | Expense payment tracking | §5 | Track reimbursement or just approval? |
| D18 | RFQ PM approval | §6 | Required before issuing to vendors? |
| D19 | PO PD sign threshold | §6 | All values or above threshold? |
| D20 | Expense PD approval threshold | §6 | Value-based PD escalation? |
| D21 | VendorContract finance check | §7 | Mandatory or by threshold? |
| D22 | Expense finance threshold | §7 | Same as PO threshold or separate? |
| D23 | PO signing authority | §8 | PD always or two-tier? |
| D24 | Posting event list | §9 | 7 events correct? |
| D25 | Expense posting granularity | §9 | One event or per-subtype? |
| D26 | FrameworkAgreement posting | §9 | Should it fire a posting event? |
| D27 | SupplierInvoice PO requirement | §10 | PO required, optional, or conditional? |
| D28 | CreditNote linkage | §10 | Invoice-specific, vendor-level, or both? |
| D29 | Expense-PO linkage | §10 | Can expenses link to POs? |
| D30 | Item catalog | §11 | Formal catalog, free text, or hybrid? |
| D31 | Quotation memory query | §11 | By code, text search, or category? |
| D32 | Quotation memory scope | §11 | Entity-scoped or project-scoped? |
| D33 | FrameworkAgreement scope | §12 | Project, entity, or both? |
| D34 | Framework rate enforcement | §12 | Enforce, suggest, or warn? |
| D35 | Framework utilization tracking | §12 | Include in M3 or defer? |
| D36 | CreditNote subtypes | §13 | One model with 3 subtypes or separate? |
| D37 | CreditNote-Invoice linkage | §13 | See D28 |
| D38 | BackCharge → CreditNote auto-creation | §13 | Auto, manual, or suggested? |
| D39 | Benchmark scope | §14 | Basic internal, manual entry, or defer? |
| D40 | Benchmark visibility | §14 | Quotation only, PO too, or everywhere? |
| D41 | Expense subtype fields | §15 | Review proposed fields |
| D42 | PO line items | §15 | Line items or single amount? |
| D43 | RFQ line items | §15 | Line items or free-form? |
| D44 | Quotation comparison screen | §16 | Standalone or within RFQ detail? |
| D45 | Vendor 360 view | §16 | Include or defer to M5? |
| D46 | Total screen count | §16 | 18 appropriate? |
| D47 | Saved views | §17 | Include in M3 or defer? |
| D48 | Dashboard drilldown | §17 | Same pattern as M2? |
| D49 | Dashboard scope | §18 | All proposed sections correct? |
| D50 | Category spend scope | §18 | Project-only or cross-project? |
| D51 | Tracker views | §18 | 4 trackers correct? |
| D52 | Permission granularity | §19 | 11 resources correct? |
| D53 | Vendor permission scope | §19 | Project-scoped or entity-scoped? |
| D54 | Role matrix | §19 | Review assignments |
| D55 | Procurement sign authority | §19 | Can Procurement sign POs? |

**Total: 55 decisions flagged for Ahmed's review.**

---

## M1/M2 Extension Points Used by M3

| Extension Point | How M3 Uses It |
|---|---|
| Posting engine (M1) | 7 new payable/commitment event types |
| Workflow engine (M1) | New templates for 7+ procurement record types |
| Audit logging (M1) | All M3 mutations write audit logs |
| Notification templates (M1) | New templates for procurement events |
| RBAC (M1) | 11 new permission resources, new role assignments |
| ReferenceCounter (M2) | Reuse for PO, RFQ, VendorContract, etc. numbering |
| RegisterFilterBar pattern (M2) | Reuse for all M3 list screens |
| StatusBadge / TransitionActions (M2) | Reuse for M3 workflow UI |
| Correspondence back_charge (M2) | Optional cross-reference from CreditNote (recovery) |
