# Module 2 — Commercial / Contracts Engine — Scope Lock

**Date:** 2026-04-10
**Status:** DRAFT — awaiting Ahmed's decisions and corrections
**Prerequisite:** Module 1 signed off (`b9de91a` on main)

> **Purpose:** This document defines what Module 2 includes, excludes, and must decide before the design spec is written. It does not contain implementation details, code, or architecture — those belong in the design spec that follows.
>
> **Convention:** Items marked with **DECIDE** require Ahmed's explicit answer. Items marked with **CONFIRM** state what I believe to be true based on prior conversations — Ahmed confirms or corrects. Everything else is derived from the frozen Module 1 spec and architecture.

---

## 1. Included Record Types

Module 2 introduces the following commercial record types. All are project-scoped and subject to Module 1's project isolation, audit logging, workflow engine, posting engine, and RBAC enforcement.

| # | Record Type | Code | One-Line Description |
|---|-------------|------|----------------------|
| 1 | Interim Payment Application | `ipa` | Periodic payment claim for work completed |
| 2 | Interim Payment Certificate | `ipc` | Certification of an IPA — confirms payable amount |
| 3 | Variation Order | `vo` | Proposed change to contract scope, cost, or time |
| 4 | Change Order | `change_order` | Formal contract amendment |
| 5 | Cost Proposal | `cost_proposal` | Costing and time estimate for a proposed variation |
| 6 | Tax Invoice | `tax_invoice` | VAT-compliant billing document |
| 7 | Letter | `letter` | Formal project correspondence |
| 8 | Notice | `notice` | Contractual notice with legal/time significance |
| 9 | Claim | `claim` | Formal claim for additional time or cost |
| 10 | Back Charge | `back_charge` | Charge against a subcontractor |

### Record Relationships — DECIDE

The following relationships need confirmation. I have not assumed any of these.

| Relationship | Question |
|---|---|
| **DECIDE-1.1** IPA → IPC | Is it always one IPA producing exactly one IPC? Or can a single IPA produce multiple partial IPCs? Or can one IPC consolidate multiple IPAs? |
| **DECIDE-1.2** IPC → Tax Invoice | Is it always one IPC per one Tax Invoice? Or can one IPC generate multiple invoices (e.g., split billing)? Or can one invoice cover multiple IPCs? |
| **DECIDE-1.3** VO → Change Order | Is a Change Order always created from an approved VO? Or can Change Orders exist independently (e.g., client-directed changes that bypass the VO process)? |
| **DECIDE-1.4** VO → Cost Proposal | Is a Cost Proposal always linked to a VO? Can a VO have multiple Cost Proposals (revisions)? Or is the cost estimate just fields on the VO itself rather than a separate record? |
| **DECIDE-1.5** Notice → Claim | Can a Claim only be created from a prior Notice? Or can Claims be created independently? |
| **DECIDE-1.6** Letter vs Notice | Are Letters and Notices modeled as two separate record types with separate tables? Or are they one record type with a `kind` field distinguishing contractual notices from general correspondence? |
| **DECIDE-1.7** Back Charge target | In M2, back charges reference subcontractors. Since subcontractor management arrives in Module 3, should M2 use free-text subcontractor name, or should we introduce a minimal subcontractor reference table now? |

---

## 2. Excluded / Deferred Record Types

These are explicitly **not** in Module 2:

| Item | Deferred To | Reason |
|------|-------------|--------|
| Procurement records (RFQ, PO, supplier invoices) | Module 3 | Separate domain |
| Subcontractor management (full model) | Module 3 | Depends on procurement |
| Budget lines, cost codes, allocations | Module 4 | Financial management domain |
| Cashflow forecasting | Module 4 | Depends on budget + receivables |
| Payment receipt tracking (inbound payments) | Module 4 | Financial management domain |
| KPI dashboards, PMO rollups | Module 5 | Needs data from M2–M4 |
| Contract parsing, OCR, AI extraction | Module 6 | AI layer |
| ZATCA Phase 2 e-invoicing (XML submission, QR code) | **DECIDE-2.1** | See below |
| OAuth/SSO | Hardening | Not commercial-specific |
| Arabic/RTL | Post-M3 | Per frozen spec |
| Visual workflow designer | Module 7+ | Per frozen spec |
| PDF report export | **DECIDE-2.2** | See below |

### DECIDE-2.1: ZATCA Scope

Saudi Arabia's ZATCA e-invoicing has two phases:
- Phase 1: Generate invoices with required fields (relatively simple)
- Phase 2: Real-time XML reporting to ZATCA with cryptographic stamp and QR code (complex integration)

**Options:**
- A) M2 generates tax invoices with ZATCA Phase 1 required fields only. Phase 2 integration deferred.
- B) M2 includes full ZATCA Phase 2 compliance.
- C) Tax invoices in M2 are internal records only. All ZATCA compliance deferred.

### DECIDE-2.2: PDF Report Export

**Options:**
- A) M2 includes PDF generation for key documents (IPA summary, IPC certificate, tax invoice, letters, notices).
- B) M2 is screens-only. PDF generation is a later enhancement.
- C) M2 includes PDF for tax invoices only (ZATCA may require it). Others deferred.

---

## 3. Record Ownership by Department

This maps who **originates** each record type (creates the draft). Reviewers and approvers are in Section 5.

| Record Type | Primary Creator | Secondary Creator | Notes |
|-------------|----------------|-------------------|-------|
| IPA | QS / Commercial | — | **CONFIRM-3.1:** Is QS/Commercial always the originator? |
| IPC | QS / Commercial | — | Prepared from approved IPA |
| VO | **DECIDE-3.2** | — | Who originates VOs? Options: QS/Commercial, Site Team, Design, Contracts Manager — or any of these? |
| Change Order | QS / Commercial | Contracts Manager | **CONFIRM-3.3:** Created after VO approval |
| Cost Proposal | **DECIDE-3.4** | — | Who prepares cost proposals? Options: QS/Commercial, Cost Controller, or both |
| Tax Invoice | Finance | — | **CONFIRM-3.5:** Finance always originates? |
| Letter | **DECIDE-3.6** | — | Who can create letters? Options: any project role, or restricted to Contracts Manager + QS/Commercial + Project Manager |
| Notice | Contracts Manager | QS / Commercial | **CONFIRM-3.7:** Notices are contractual — always Contracts Manager led? |
| Claim | QS / Commercial | Contracts Manager | **CONFIRM-3.8** |
| Back Charge | **DECIDE-3.9** | — | Who originates? Options: QS/Commercial, Site Team, QA/QC, or any combination |

---

## 4. Record-by-Record Lifecycle Statuses

For each record type I've listed a proposed status set. Every status model needs Ahmed's confirmation because statuses directly affect dashboards, filters, posting eligibility, and audit clarity.

### CONFIRM or CORRECT each status set:

**IPA**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `submitted` | No | Submitted for internal review |
| `under_review` | No | Being reviewed |
| `finance_check` | No | Finance validating amounts |
| `approved` | No | Internally approved |
| `issued` | **DECIDE-4.1** | Issued to client. Is this terminal, or can an issued IPA be superseded? |
| `rejected` | Yes | Rejected during review |
| `cancelled` | Yes | Cancelled |

**DECIDE-4.2:** When a revised IPA is needed for the same period, what happens to the original? Options:
- A) Original moves to a `superseded` status (add to list above)
- B) Original is `cancelled` and a new IPA is created with a link to the old one
- C) The original IPA is edited in-place (new version, same record)

**IPC**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared from approved IPA |
| `under_review` | No | Being reviewed |
| `finance_check` | No | Finance validates |
| `certified` | No | Certified and signed |
| `issued` | **DECIDE-4.3** | Issued to client. Terminal? |
| `rejected` | Yes | Certification rejected |
| `cancelled` | Yes | Cancelled |

**VO**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `submitted` | No | Submitted for internal review |
| `under_review` | No | Internal review |
| `costing` | No | Cost proposal being prepared |
| `approved_internal` | No | Approved internally |
| `submitted_to_client` | No | Sent to client |
| `approved_client` | No | Client approved |
| `executed` | Yes | Change order issued — variation is binding |
| `rejected_internal` | Yes | Rejected internally |
| `rejected_client` | Yes | Client rejected |
| `withdrawn` | Yes | Withdrawn by originator |

**DECIDE-4.4:** Does the VO have a `costing` status (paused while cost proposal is prepared)? Or does costing happen outside the VO workflow?

**Change Order**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `under_review` | No | Being reviewed |
| `approved` | No | Approved and signed |
| `executed` | Yes | Contract formally amended |
| `cancelled` | Yes | Cancelled |

**Cost Proposal**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `submitted` | No | Submitted for internal review |
| `under_review` | No | Being reviewed |
| `approved` | No | Approved internally |
| `submitted_to_client` | No | Sent to client |
| `accepted` | Yes | Client accepted pricing |
| `rejected` | Yes | Rejected |
| `superseded` | Yes | Replaced by revised proposal |

**Tax Invoice**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `under_review` | No | Finance reviewing |
| `approved` | No | Approved for issue |
| `issued` | No | Issued to client |
| `void` | Yes | Voided (credit note issued) |
| `cancelled` | Yes | Cancelled before issue |

**DECIDE-4.5:** Should Tax Invoice have a `paid` status in M2? Or is payment tracking entirely a Module 4 concern?

**Letter**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being composed |
| `under_review` | No | Being reviewed |
| `approved` | No | Approved to send |
| `issued` | Yes | Sent/transmitted |
| `cancelled` | Yes | Cancelled |

**Notice**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being composed |
| `under_review` | No | Being reviewed |
| `approved` | No | Approved to issue |
| `issued` | No | Formally issued |
| `acknowledged` | Yes | Recipient acknowledged |
| `expired` | Yes | Response deadline passed |
| `cancelled` | Yes | Cancelled |

**DECIDE-4.6:** Should Notice have `acknowledged` and `expired`? These imply tracking the recipient's response, which may be complex. Alternatively, notices could be terminal at `issued` and response tracking deferred.

**Claim**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `submitted` | No | Submitted for internal review |
| `under_review` | No | Being reviewed |
| `approved_internal` | No | Approved for submission |
| `submitted_to_client` | No | Submitted to client |
| `under_negotiation` | No | In negotiation |
| `settled` | Yes | Settled (full or partial) |
| `rejected` | Yes | Rejected by client |
| `withdrawn` | Yes | Withdrawn |

**DECIDE-4.7:** When a claim is partially settled, should the system store both claimed and settled amounts on the same record? Or should partial settlements create a new linked record?

**Back Charge**

| Status | Terminal? | Description |
|--------|-----------|-------------|
| `draft` | No | Being prepared |
| `submitted` | No | Submitted for review |
| `under_review` | No | Being reviewed |
| `approved` | No | Approved |
| `issued` | No | Issued to subcontractor |
| `acknowledged` | Yes | Subcontractor acknowledged |
| `disputed` | No | Subcontractor disputes |
| `resolved` | Yes | Dispute resolved |
| `cancelled` | Yes | Cancelled |

**DECIDE-4.8:** Back charge dispute flow — when disputed, does it go back to `under_review`, have its own dispute resolution path, or just get resolved directly?

---

## 5. Record-by-Record Workflow Path

Each record type plugs into the M1 workflow engine via a workflow template with steps. The engine is linear and multi-step — each step has an approver role.

**DECIDE-5.1: Linear vs Branching Workflows**
The M1 workflow engine supports **linear multi-step** approval only (Step 1 → Step 2 → Step 3 → done). If any M2 record type needs **conditional branching** (e.g., "if value > X, add Executive Approver step"), the engine must be extended. Do any of the following need conditional routing?

For each record type below, I've proposed a workflow path. **Every row needs CONFIRM or CORRECT.**

| Record Type | Proposed Workflow Steps | Finance Check Step? | DECIDE: Post On |
|---|---|---|---|
| **IPA** | **DECIDE-5.2:** Who reviews, in what order? Proposed: QS Review → Contracts Manager Review → Finance Check → Project Director Approval | Yes | **DECIDE-5.3:** `approved` or `issued`? |
| **IPC** | **DECIDE-5.4:** Proposed: Contracts Manager Review → Finance Check → Project Director Certification | Yes | **DECIDE-5.5:** `certified` or `issued`? |
| **VO** | **DECIDE-5.6:** Proposed: Technical Review → Contracts Manager Review → Project Manager Review → Project Director Approval. Is this one workflow or two (internal approval + client submission)? | No (costing is separate) | **DECIDE-5.7:** `approved_internal`, `approved_client`, or `executed`? |
| **Change Order** | **DECIDE-5.8:** Proposed: Contracts Manager Review → Project Director Approval | No | `executed` |
| **Cost Proposal** | **DECIDE-5.9:** Proposed: Cost Controller Review → Contracts Manager Review → Project Manager Approval | Yes (Cost Controller) | `accepted` |
| **Tax Invoice** | **DECIDE-5.10:** Proposed: QS Verification → Contracts Manager Review → Finance Approval | Yes | **DECIDE-5.11:** `approved` or `issued`? |
| **Letter** | **DECIDE-5.12:** Fixed reviewer chain, or configurable per letter? Proposed: Reviewer → Contracts Manager Approval | No | No posting |
| **Notice** | **DECIDE-5.13:** Proposed: Contracts Manager Review → Project Manager Review → Project Director Approval | No | No posting |
| **Claim** | **DECIDE-5.14:** Proposed: Contracts Manager Review → Cost Controller Validation → Project Manager Review → Project Director Approval | Yes (Cost Controller) | **DECIDE-5.15:** `approved_internal` or `submitted_to_client`? |
| **Back Charge** | **DECIDE-5.16:** Proposed: Contracts Manager Review → Finance Check → Project Manager Approval | Yes | `issued` |

**DECIDE-5.17: Executive Approver**
When does the Executive Approver role enter any workflow? Options:
- A) Only for records above a value threshold (specify threshold)
- B) Only for specific record types (which ones?)
- C) Not used in standard M2 workflows — available via override only
- D) Other

**DECIDE-5.18: Signatory per Record Type**
Who signs each record type? The M1 signing service supports internal digital signatures. For each record type, confirm who is the signatory (the person whose signature locks the record):

| Record Type | Proposed Signatory |
|---|---|
| IPA | Project Director |
| IPC | Project Director |
| VO (internal) | Project Director |
| Change Order | Project Director |
| Cost Proposal | Contracts Manager |
| Tax Invoice | **DECIDE:** Finance or Project Director? |
| Letter | **DECIDE:** Contracts Manager or Project Manager (depends on formality)? |
| Notice | Project Director |
| Claim | Project Director |
| Back Charge | Project Director |

---

## 6. Finance-Check Rules

Finance checks are a workflow step where Finance or Cost Controller validates amounts before approval.

| Record Type | Finance Check? | Checker Role | What They Validate |
|---|---|---|---|
| IPA | Yes | Finance | Amounts, retention, deductions, no double-counting |
| IPC | Yes | Finance | Certified amounts match IPA, VAT correct, retention held |
| VO | No | — | Costing handled via separate Cost Proposal |
| Change Order | No | — | Already validated via VO + Cost Proposal chain |
| Cost Proposal | Yes | Cost Controller | Rates, quantities, breakdown reasonableness |
| Tax Invoice | Yes | Finance | Invoice matches IPC, VAT calculation, sequential numbering |
| Letter | No | — | — |
| Notice | No | — | — |
| Claim | Yes | Cost Controller | Claimed amounts justified, calculations verified |
| Back Charge | Yes | Finance | Amount justified, deductible under subcontract terms |

**CONFIRM-6.1:** Is the Finance vs Cost Controller split correct? Finance handles payment-related checks, Cost Controller handles costing and claims?

---

## 7. Sign / Issue Rules

### Signing

Signing uses the M1 digital signing service (internal SHA-256 hash capture). A signed record becomes immutable (M1 invariant: signed records cannot be modified).

**CONFIRM-7.1:** Is signing required before a record can move to `issued`? Or can some record types be issued without a formal signature (e.g., informal letters)?

### Issuing

Issuing means the record is finalized, assigned a reference number, and formally transmitted. Once issued, the record is locked.

### Reference Numbering

**DECIDE-7.2:** What reference number format does Pico Play use?

Proposed: `{ProjectCode}-{TypeCode}-{NNN}` where NNN is a project-scoped sequential number.

Examples: `PROJ01-IPA-001`, `PROJ01-VO-003`, `PROJ01-LTR-012`

Options:
- A) The format above
- B) Different format (specify)
- C) Reference numbers are manual entry, not auto-generated

### Issue Control

**DECIDE-7.3:** Who controls issuance (marks a record as formally issued) for each record type?

| Record Type | Proposed Issue Controller |
|---|---|
| IPA | Contracts Manager |
| IPC | Contracts Manager |
| VO | Contracts Manager |
| Change Order | Contracts Manager |
| Cost Proposal | QS / Commercial |
| Tax Invoice | Finance |
| Letter | Contracts Manager |
| Notice | Contracts Manager |
| Claim | Contracts Manager |
| Back Charge | Contracts Manager |

### Client Acknowledgments

**DECIDE-7.4:** For records that go to the client (IPA, IPC, VO, Change Order, Tax Invoice, Notice, Claim), does the system track client acknowledgment/approval? Options:
- A) Yes — there's a status for client response, and the system records when/how the client responded
- B) No — client interaction happens outside the system; we just record the issue date
- C) Some records track client response (which ones?), others don't

---

## 8. Posting Trigger Rules

Each posting event fires at a specific status transition and writes to the M1 posting engine with an idempotency key. The event is validated against a Zod schema registered in the event registry.

**DECIDE-8.1:** Confirm which events fire and at which status transition.

| Proposed Event | Fires When | Creates Receivable? |
|---|---|---|
| `IPA_APPROVED` | IPA → `approved` | **DECIDE-8.2:** Does this create a receivable? Or is IPA just a claim (no financial effect until IPC)? |
| `IPC_CERTIFIED` | IPC → `certified` | **DECIDE-8.3:** Does this create the receivable? |
| `VO_APPROVED_INTERNAL` | VO → `approved_internal` | No (informational) |
| `VO_APPROVED_CLIENT` | VO → `approved_client` | **DECIDE-8.4:** Does client VO approval adjust contract value? Or is that a Change Order effect? |
| `CHANGE_ORDER_EXECUTED` | Change Order → `executed` | **DECIDE-8.5:** Does this adjust the project's contract value? |
| `COST_PROPOSAL_ACCEPTED` | Cost Proposal → `accepted` | No (pricing agreement) |
| `TAX_INVOICE_ISSUED` | Tax Invoice → `issued` | **DECIDE-8.6:** Does this create/formalize a receivable? What's the relationship to IPC receivable? |
| `CLAIM_SUBMITTED` | Claim → `submitted_to_client` | No (not yet agreed) |
| `CLAIM_SETTLED` | Claim → `settled` | **DECIDE-8.7:** Does settlement create a receivable? |
| `BACK_CHARGE_ISSUED` | Back Charge → `issued` | **DECIDE-8.8:** Does this create a receivable (money owed to us by subcontractor)? |

**DECIDE-8.9:** Are there any events I'm missing? For example:
- Should letter/notice issuance create posting events (informational, no financial effect)?
- Should VO withdrawal or claim rejection create reversal events?

**DECIDE-8.10: Contract Value Tracking**
When a VO is approved or a Change Order is executed, the project's contract value changes. Should Module 2:
- A) Store a `contractValue` field on the Project model that gets updated by posting events
- B) Calculate contract value on-the-fly from VO/CO events (no stored field)
- C) Defer contract value tracking entirely to Module 4

---

## 9. Receivable / Inflow Linkage Rules

Module 2 is the first module to create financial records. The M1 posting engine is ready to receive events. The question is what Module 2's receivable model looks like.

**DECIDE-9.1: Does Module 2 introduce a `Receivable` table?**

Options:
- A) Yes — M2 creates a `CommercialReceivable` table. Posting events create receivable entries. M2 tracks status (outstanding, invoiced, etc.). M4 extends with payment tracking.
- B) No — M2 only posts events. Receivable tracking is entirely a Module 4 concern. M2 posting events carry the amounts, and M4 builds the receivable ledger from them.
- C) Minimal — M2 creates receivable entries but only tracks outstanding/invoiced status. No payment tracking, no aging, no write-off until M4.

**DECIDE-9.2: If yes to receivable table, what creates a receivable?**

| Source | Creates Receivable? |
|---|---|
| IPC certified | ? |
| Tax Invoice issued | ? |
| Claim settled | ? |
| Back Charge issued | ? |

**DECIDE-9.3: Receivable-to-invoice linkage**
If receivables exist in M2, should a receivable be linked to a specific tax invoice? (This determines whether "invoiced" is a receivable status.)

**DECIDE-9.4: Payment tracking boundary**
Should M2 allow manually marking a tax invoice or receivable as `paid`? Or is all payment tracking Module 4?

---

## 10. Required Forms and Key Fields

For each record type, these are the proposed **key fields** (not exhaustive — the design spec will add audit fields, timestamps, and system fields). **CONFIRM or CORRECT** each set.

### IPA

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | M1 project isolation applies |
| `periodNumber` | Int | Yes | Sequential payment period |
| `periodFrom` | Date | Yes | Period start |
| `periodTo` | Date | Yes | Period end |
| `grossAmount` | Decimal | Yes | Total gross claimed |
| `retentionRate` | Decimal | Yes | Retention % |
| `retentionAmount` | Decimal | Yes | Calculated retention |
| `previousCertified` | Decimal | Yes | Cumulative prior certified |
| `currentClaim` | Decimal | Yes | Net current period claim |
| `advanceRecovery` | Decimal | No | Advance payment recovery |
| `otherDeductions` | Decimal | No | Other deductions |
| `netClaimed` | Decimal | Yes | Final net amount |
| `currency` | String | Yes | From M1 reference data |
| `description` | Text | No | Summary |

**DECIDE-10.1:** Does IPA have line items (itemized breakdown of work done) or is it a single summary record?

### IPC

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `ipaId` | FK (IPA) | Yes | Source IPA |
| `certifiedAmount` | Decimal | Yes | Certified total |
| `retentionAmount` | Decimal | Yes | Retention held |
| `adjustments` | Decimal | No | Adjustments to claimed amount |
| `netCertified` | Decimal | Yes | Net certified for payment |
| `certificationDate` | Date | Yes | |
| `currency` | String | Yes | |
| `remarks` | Text | No | |

### VO

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `title` | String | Yes | VO title |
| `description` | Text | Yes | What changed and why |
| `reason` | Text | Yes | Justification |
| `initiatedBy` | Enum | Yes | **DECIDE-10.2:** `contractor` / `client` / `consultant` — which values? |
| `costImpact` | Decimal | No | Estimated cost change |
| `timeImpactDays` | Int | No | Estimated schedule change |
| `contractClause` | String | No | Relevant clause reference |
| `currency` | String | Yes | |

**DECIDE-10.3:** Does VO have line items (individual scope items with separate costs) or a single summary?

### Change Order

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `voId` | FK (VO) | **DECIDE** | Required if CO always from VO (see DECIDE-1.3) |
| `originalContractValue` | Decimal | Yes | Before this change |
| `adjustmentAmount` | Decimal | Yes | This change |
| `newContractValue` | Decimal | Yes | After this change |
| `timeAdjustmentDays` | Int | No | |
| `description` | Text | Yes | |
| `currency` | String | Yes | |

### Cost Proposal

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `voId` | FK (VO) | **DECIDE** | Required if always linked to VO (see DECIDE-1.4) |
| `revisionNumber` | Int | Yes | Sequential revision |
| `estimatedCost` | Decimal | Yes | Total estimated |
| `estimatedTimeDays` | Int | No | Time impact |
| `methodology` | Text | No | Proposed approach |
| `costBreakdown` | JSON | No | **DECIDE-10.4:** Structured JSON (labor/materials/equipment/overhead) or free-form? |
| `currency` | String | Yes | |

### Tax Invoice

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `ipcId` | FK (IPC) | **DECIDE** | Required if always from IPC (see DECIDE-1.2) |
| `invoiceNumber` | String | Yes | Auto-generated sequential |
| `invoiceDate` | Date | Yes | |
| `grossAmount` | Decimal | Yes | Pre-tax |
| `vatRate` | Decimal | Yes | **DECIDE-10.5:** Always 15% (Saudi standard) or configurable per project/entity? |
| `vatAmount` | Decimal | Yes | Calculated |
| `totalAmount` | Decimal | Yes | Gross + VAT |
| `dueDate` | Date | No | Payment terms |
| `currency` | String | Yes | |
| `buyerName` | String | Yes | Client name |
| `buyerTaxId` | String | No | Client VAT registration |
| `sellerTaxId` | String | Yes | Our VAT registration (from Entity) |

### Letter

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `letterType` | Enum | **DECIDE-10.6** | Options: `instruction`, `response`, `transmittal`, `general` — or different values? Or no type field? |
| `subject` | String | Yes | |
| `body` | Text | Yes | |
| `recipientName` | String | Yes | |
| `recipientOrg` | String | No | |
| `inReplyTo` | FK (Letter) | No | Reference to prior letter |

### Notice

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `noticeType` | Enum | **DECIDE-10.7** | Options: `delay`, `claim`, `extension_of_time`, `dispute`, `force_majeure`, `general` — or different values? |
| `subject` | String | Yes | |
| `body` | Text | Yes | |
| `contractClause` | String | No | Relevant clause |
| `responseDeadline` | Date | No | Deadline for response |
| `recipientName` | String | Yes | |
| `recipientOrg` | String | No | |

### Claim

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `claimType` | Enum | **DECIDE-10.8** | Options: `time_extension`, `additional_cost`, `time_and_cost` — or different values? |
| `title` | String | Yes | |
| `description` | Text | Yes | |
| `claimedAmount` | Decimal | No | If cost claim |
| `claimedTimeDays` | Int | No | If time claim |
| `settledAmount` | Decimal | No | Filled on settlement |
| `settledTimeDays` | Int | No | Filled on settlement |
| `contractClause` | String | No | |
| `noticeId` | FK (Notice) | No | Originating notice (if DECIDE-1.5 allows independent claims) |
| `currency` | String | Yes | |

### Back Charge

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | FK (Project) | Yes | |
| `subcontractorName` | String | Yes | Free text in M2 (see DECIDE-1.7) |
| `reason` | Text | Yes | |
| `category` | Enum | **DECIDE-10.9** | Options: `defect`, `delay`, `non_compliance`, `damage`, `other` — or different values? |
| `chargedAmount` | Decimal | Yes | |
| `evidenceDescription` | Text | No | |
| `currency` | String | Yes | |

### Cross-Cutting Field Questions

**DECIDE-10.10:** Should all commercial records have a `documents` relation (ability to attach M1 documents to any commercial record)? M1 already has `recordType` + `recordId` on the Document model.

**DECIDE-10.11:** Should all commercial records have a `notes` or `comments` field for internal discussion during review? Or is the workflow action's `comment` field sufficient?

---

## 11. Required Screens

All screens are project-scoped (inside the project workspace) unless noted. All screens respect M1 project isolation and RBAC.

### Project-Scoped Screens

| Screen | Route Pattern | Description |
|---|---|---|
| Commercial Dashboard | `/projects/{id}/commercial` | Summary cards and recent activity |
| IPA List | `/projects/{id}/commercial/ipa` | Paginated, filterable |
| IPA Detail | `/projects/{id}/commercial/ipa/{id}` | Full record, workflow, documents |
| IPC List | `/projects/{id}/commercial/ipc` | Paginated, linked IPA refs |
| IPC Detail | `/projects/{id}/commercial/ipc/{id}` | Full record, certification actions |
| VO List | `/projects/{id}/commercial/vo` | Cost/time impact columns |
| VO Detail | `/projects/{id}/commercial/vo/{id}` | Linked cost proposals, change orders |
| Change Order List | `/projects/{id}/commercial/change-orders` | Linked VO refs |
| Change Order Detail | `/projects/{id}/commercial/change-orders/{id}` | Execution status |
| Cost Proposal List | `/projects/{id}/commercial/cost-proposals` | Linked VO refs |
| Cost Proposal Detail | `/projects/{id}/commercial/cost-proposals/{id}` | Cost breakdown |
| Tax Invoice List | `/projects/{id}/commercial/invoices` | Amount/VAT columns |
| Tax Invoice Detail | `/projects/{id}/commercial/invoices/{id}` | VAT breakdown, linked IPC |
| Letter List | `/projects/{id}/commercial/letters` | Type filter |
| Letter Detail | `/projects/{id}/commercial/letters/{id}` | Response thread |
| Notice List | `/projects/{id}/commercial/notices` | Deadline column |
| Notice Detail | `/projects/{id}/commercial/notices/{id}` | Deadline tracking |
| Claim List | `/projects/{id}/commercial/claims` | Claimed/settled columns |
| Claim Detail | `/projects/{id}/commercial/claims/{id}` | Negotiation history |
| Back Charge List | `/projects/{id}/commercial/back-charges` | Subcontractor/amount columns |
| Back Charge Detail | `/projects/{id}/commercial/back-charges/{id}` | Dispute status |
| Receivable Summary | `/projects/{id}/commercial/receivables` | **Only if DECIDE-9.1 = A or C** |

### Navigation Changes

The M1 project workspace sidebar gets a new **Commercial** section with sub-navigation. The top-level "Commercial" placeholder (currently "Coming in Module 2") becomes active.

### Admin Screens

No new admin screens — M2 uses existing M1 admin screens:
- Workflow Templates (M2 adds seeded templates visible here)
- Roles & Permissions (M2 adds new permission codes)

**DECIDE-11.1:** Should there be a cross-project commercial summary screen (portfolio view across all projects)? Or is all commercial data strictly project-scoped in M2?

---

## 12. Module 2 Reports / Dashboards

### Project Commercial Dashboard

| Card | Content |
|------|---------|
| Payment Summary | Total certified (IPC sum), total invoiced, outstanding |
| Active IPAs | Count + total net claimed |
| Pending VOs | Count + total cost impact |
| Open Claims | Count + total claimed |
| Recent Activity | Last 10 commercial audit entries for this project |

**DECIDE-12.1:** Should the dashboard include a receivable aging breakdown (0-30, 31-60, 61-90, 90+ days)? Or is aging a Module 4 concept?

**DECIDE-12.2:** Should there be a "client submission history" view showing all records ever issued to the client, across all commercial types? This was in your original scope list.

**DECIDE-12.3:** Any other dashboard cards or summary views needed?

---

## 13. Role-Permission Matrix for Commercial Operations

### New Permission Codes

Pattern follows M1 convention: `{resource}.{action}`

| Resource | Proposed Actions |
|---|---|
| `ipa` | `view`, `create`, `edit`, `submit`, `approve`, `issue` |
| `ipc` | `view`, `create`, `edit`, `certify`, `issue` |
| `vo` | `view`, `create`, `edit`, `submit`, `approve`, `issue` |
| `change_order` | `view`, `create`, `edit`, `approve`, `execute` |
| `cost_proposal` | `view`, `create`, `edit`, `submit`, `approve` |
| `tax_invoice` | `view`, `create`, `edit`, `approve`, `issue` |
| `letter` | `view`, `create`, `edit`, `approve`, `issue` |
| `notice` | `view`, `create`, `edit`, `approve`, `issue` |
| `claim` | `view`, `create`, `edit`, `submit`, `approve`, `issue` |
| `back_charge` | `view`, `create`, `edit`, `approve`, `issue` |
| `receivable` | `view` (if receivable table exists) |
| `commercial` | `dashboard` |
| `screen` | `screen.commercial_*` (one per screen section) |

### Role Matrix — DECIDE

This matrix needs Ahmed's confirmation. Every cell matters for RBAC enforcement.

Legend: **C** = create, **E** = edit draft, **S** = submit, **R** = review/approve, **F** = finance check, **G** = sign, **I** = issue, **V** = view only

**DECIDE-13.1:** Confirm or correct each row.

| Role | IPA | IPC | VO | CO | CP | Invoice | Letter | Notice | Claim | Back Charge |
|------|-----|-----|----|----|----|---------|---------|---------|---------|----|
| master_admin | All | All | All | All | All | All | All | All | All | All |
| project_director | V,R,G | V,R,G | V,R,G | V,R,G | V,R | V,R,G | V,R,G | V,R,G | V,R,G | V,R,G |
| project_manager | V,R | V,R | V,R | V,R | V,R | V | V,R,G,I | V,R | V,R | V,R |
| contracts_manager | V,R,I | V,R,I | V,C,E,S,R,I | V,C,E,R,I | V,R | V,R | V,C,E,R,I | V,C,E,R,I | V,C,E,S,R,I | V,R,I |
| qs_commercial | V,C,E,S | V,C,E | V,C,E,S | V | V,C,E,S | V | V,C,E | V,C,E | V,C,E,S | V,C,E,S |
| finance | V,F | V,F | V | V | V | V,C,E,F,G,I | V | V | V | V,F |
| cost_controller | V | V | V | V | V,C,E,F | V | V | V | V,F | V |
| site_team | V | V | V,C,E | V | V | V | V,C,E | V | V | V,C,E |
| design | V | V | V,C,E | V | V | V | V,C,E | V | V | V |
| qa_qc | V | V | V | V | V | V | V | V | V | V,C,E |
| procurement | V | V | V | V | V | V | V | V | V | V |
| document_controller | V | V | V | V | V | V | V | V | V | V |
| pmo | V | V | V | V | V | V | V | V | V | V |
| executive_approver | V,R,G | V,R,G | V,R,G | V,R,G | V,R | V,R | V,R | V,R | V,R,G | V,R |

**Key questions embedded in the matrix:**
- **DECIDE-13.2:** Contracts Manager has broad control (review + issue) across most types. QS/Commercial does the operational work (create + edit + submit). Is this split right?
- **DECIDE-13.3:** Site Team can create VOs and back charges (they see issues on-site). Correct?
- **DECIDE-13.4:** QA/QC can create back charges (they identify defects). Should they also be able to submit?
- **DECIDE-13.5:** Finance has full control over tax invoices. Is Finance also the signatory?
- **DECIDE-13.6:** PMO, Document Controller, Procurement — view-only across all commercial records in M2. Correct?
- **DECIDE-13.7:** Design can create VOs and letters but nothing else. Correct?

---

## 14. Module 2 Risks and Non-Goals

### Non-Goals

| Item | Why |
|------|-----|
| Automated payment matching | Module 4 — financial operations |
| Budget allocation from commercial records | Module 4 |
| Client portal / external access | Internal-only system (M1 principle #1) |
| Multi-currency conversion | M2 stores currency per record; conversion logic is M4 |
| Automated ZATCA XML submission | Unless DECIDE-2.1 = B |
| Email delivery of issued documents to client | Documents are issued within the system; external delivery is manual or M3+ |
| Approval delegation (delegate my approvals to another user while I'm away) | Enhancement, not core M2 |
| Batch operations (bulk approve, bulk issue) | Enhancement |
| Document template generation (auto-fill letter/notice templates) | Enhancement |
| Historical data import from previous systems | One-time operation, handled outside the platform |

### Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Domain model wrong** | High | This document exists to prevent this. Ahmed must confirm every DECIDE item. |
| 2 | **Workflow complexity exceeds M1 engine** | Medium | DECIDE-5.1 determines whether conditional branching is needed. If yes, engine extension is a prerequisite task. |
| 3 | **ZATCA compliance scope creep** | Medium | DECIDE-2.1 must be locked before spec. Phase 2 integration is complex and could dominate M2 if included. |
| 4 | **Receivable model boundary with M4** | Medium | DECIDE-9.1 must clearly define what M2 owns vs M4. Unclear boundary leads to rework. |
| 5 | **Permission matrix errors** | Medium | Incorrect RBAC means users see or do things they shouldn't. Ahmed confirms matrix before implementation. |
| 6 | **Schema migration complexity** | Low | All M2 migrations must be additive (new tables/columns). No destructive changes to M1 tables. |
| 7 | **Record linking fragility** | Low | M2 records link to each other (IPA→IPC→Invoice, VO→CO). Deletion/cancellation cascades need careful design. |
| 8 | **VAT rate assumptions** | Low | DECIDE-10.5 — if configurable, need entity-level or project-level VAT settings. |

---

## Decision Summary

Total decisions needed: **~50**

### Critical (blocks spec writing)

| ID | Question | Section |
|----|----------|---------|
| DECIDE-1.1 | IPA → IPC cardinality | §1 |
| DECIDE-1.2 | IPC → Tax Invoice cardinality | §1 |
| DECIDE-1.3 | VO → Change Order dependency | §1 |
| DECIDE-1.4 | Cost Proposal standalone or sub-record | §1 |
| DECIDE-1.6 | Letter vs Notice — one type or two | §1 |
| DECIDE-2.1 | ZATCA scope | §2 |
| DECIDE-5.1 | Linear vs branching workflows | §5 |
| DECIDE-8.1–8.10 | Posting triggers and financial effects | §8 |
| DECIDE-9.1 | Receivable table in M2 or M4 | §9 |
| DECIDE-13.1 | Full role-permission matrix | §13 |

### Important (affects design but won't block)

| ID | Question | Section |
|----|----------|---------|
| DECIDE-1.5 | Notice → Claim dependency | §1 |
| DECIDE-1.7 | Back charge subcontractor reference | §1 |
| DECIDE-2.2 | PDF export scope | §2 |
| DECIDE-3.2–3.9 | Record creators | §3 |
| DECIDE-4.1–4.8 | Status model details | §4 |
| DECIDE-5.2–5.18 | Workflow steps and signatories | §5 |
| DECIDE-7.2 | Reference number format | §7 |
| DECIDE-10.1–10.11 | Field details | §10 |
| DECIDE-11.1 | Cross-project commercial view | §11 |
| DECIDE-12.1–12.3 | Dashboard content | §12 |
