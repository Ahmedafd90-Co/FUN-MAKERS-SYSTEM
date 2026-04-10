# Module 2 — Commercial / Contracts Engine — Design

**Project:** Pico Play Fun Makers KSA — Internal Operations Platform
**Module:** 2 of 7 — Commercial / Contracts Engine
**Date:** 2026-04-10
**Owner:** Ahmed Al-Dossary (Project Director, Pico Play)
**Status:** APPROVED — 2026-04-10 (role-permission matrix confirmed)
**Prerequisite:** Module 1 signed off (`b9de91a`)
**Scope lock:** `docs/module-2-scope-lock.md` (all 21 decisions resolved)
**Addendum A:** `docs/module-2-addendum-a-assessment-analytics.md` — consultant assessment fields, advanced filters, variance analytics
**Addendum B:** `docs/module-2-addendum-b-future-scope.md` — procurement/cost-control items frozen for M3–M5

---

## 1. Executive Summary

Module 2 delivers the **Commercial / Contracts Engine** — the first business domain module built on the Module 1 shared core platform. It enables internal teams to manage the full lifecycle of commercial records: payment applications, payment certificates, variations, cost proposals, tax invoices, and formal correspondence (letters, notices, claims, back charges).

Every record type plugs into the Module 1 infrastructure: workflow engine for approvals, posting engine for financial exposure tracking, digital signing for immutability, audit logging for traceability, and RBAC for access control.

Module 2 does **not** introduce a full financial ledger, procurement workflows, budget management, KPI dashboards, ZATCA API integration, or conditional workflow branching. It stays focused on internal commercial control and client-facing commercial record management.

**Key numbers:**
- 6 new Prisma models (2 with subtype families)
- 7 posting event types
- 10 logical record types (collapsed into 6 models)
- 13 screens (1 dashboard + 6 list/detail pairs; client submission history is a dashboard section)
- ~50 new permission codes
- ~12 seeded workflow templates

---

## 2. Module Goals and Non-Goals

### Goals

1. Enable QS/Commercial, Contracts Manager, and Finance to create, review, approve, sign, and issue all commercial record types within a project.
2. Track payment applications (IPA) through to certified payment certificates (IPC) and tax invoices.
3. Manage variation orders and change orders as a single family with distinct subtypes.
4. Provide a shared correspondence engine for letters, notices, claims, and back charges with subtype-specific behavior.
5. Fire posting events at locked status transitions to feed the receivable/exposure pipeline.
6. Enforce signing and issue control per the locked rules — mandatory signing for IPC, Variation, Notice, Claim, and Back Charge.
7. Deliver a project-scoped commercial dashboard with 9 summary sections.
8. Define the full role-permission matrix for commercial operations across all 14 roles.
9. Leave clean extension points for Module 3 (Procurement) and Module 4 (Budget/Cost/Cashflow).

### Non-Goals

| Item | Reason |
|---|---|
| Procurement workflows (RFQ, PO, supplier invoices) | Module 3 |
| Budget, cost codes, allocations, cashflow | Module 4 |
| Full receivables ledger/reporting engine | Module 4 |
| KPI dashboards, PMO rollups | Module 5 |
| Contract parsing, OCR, AI extraction | Module 6 |
| Agent layer | Module 7 |
| Visual workflow designer | Module 7+ |
| Conditional workflow branching | Not in M2 — linear-first is locked |
| ZATCA API integration (QR, XML, clearance) | Deferred — M2 records only |
| Real e-signature provider (DocuSign, Adobe Sign) | Post-M2 |
| Client portal / external access | Never — internal-only system |
| Multi-currency conversion | M2 stores currency; conversion is M4 |
| Approval delegation | Enhancement |
| Batch operations | Enhancement |
| Full subcontractor management | Module 3 — M2 uses free-text target name |

---

## 3. Included Models and Ownership

### 6 Prisma Models

| # | Model | Subtypes | Primary Creator | Project-Scoped |
|---|-------|----------|----------------|----------------|
| 1 | `Ipa` | — | QS / Commercial | Yes |
| 2 | `Ipc` | — | QS / Commercial | Yes |
| 3 | `Variation` | `vo`, `change_order` | Commercial / Contracts | Yes |
| 4 | `CostProposal` | — | Commercial | Yes |
| 5 | `TaxInvoice` | — | Commercial / Finance | Yes |
| 6 | `Correspondence` | `letter`, `notice`, `claim`, `back_charge` | Varies by subtype (see below) | Yes |

### Correspondence Creators by Subtype

| Subtype | Primary Creator |
|---|---|
| `letter` | Originator department — controlled under commercial/contracts rules if client-facing |
| `notice` | Contracts / Commercial |
| `claim` | Contracts / Commercial |
| `back_charge` | Contracts / Commercial |

### Record Relationships

```
IPA ──[1:N]──→ IPC (each IPC links to exactly one IPA; UI assumes 1:1)
IPC ──[1:N]──→ TaxInvoice (each Tax Invoice links to exactly one IPC; UI assumes 1:1)
CostProposal ──[N:1, optional]──→ Variation (nullable FK)
Correspondence ──[optional parent]──→ Correspondence (notice → claim linking via parentCorrespondenceId)
```

---

## 4. Lifecycle Statuses by Model

All statuses are stored as a string enum. Terminal statuses cannot be reopened. Status transitions are validated at the service layer.

### IPA

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial creation |
| `submitted` | No | Sent for internal review |
| `under_review` | No | Being reviewed |
| `returned` | No | Sent back for revision — returns to editable state |
| `rejected` | Yes | Permanently rejected |
| `approved_internal` | No | Posting fires: `IPA_APPROVED` |
| `signed` | No | Digitally signed — record becomes immutable (optional per template) |
| `issued` | No | Formally issued with reference number |
| `superseded` | Yes | Replaced by a revised record |
| `closed` | Yes | Final closure |

IPA finance check is optional by project/template rule. IPA signing is optional — some templates skip `signed` and go directly from `approved_internal` to `issued`.

### IPC

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial creation |
| `submitted` | No | Sent for internal review |
| `under_review` | No | Being reviewed |
| `returned` | No | Sent back for revision — returns to editable state |
| `rejected` | Yes | Permanently rejected |
| `approved_internal` | No | Internally approved — no posting here |
| `signed` | No | Digitally signed (mandatory) — posting fires: `IPC_SIGNED` |
| `issued` | No | Formally issued with reference number |
| `superseded` | Yes | Replaced by a revised record |
| `closed` | Yes | Final closure |

IPC finance check is mandatory (enforced by workflow template). IPC signing is mandatory — posting fires at `signed`, not `approved_internal`.

### Variation (shared for `vo` and `change_order` subtypes)

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | Posting fires: `VARIATION_APPROVED_INTERNAL` |
| `signed` | No | |
| `issued` | No | |
| `client_pending` | No | After issue, awaiting client response |
| `client_approved` | No | Posting fires: `VARIATION_APPROVED_CLIENT` |
| `client_rejected` | Yes | |
| `superseded` | Yes | |
| `closed` | Yes | |

Client-status tracking (`client_pending` → `client_approved` / `client_rejected`) is a manual status update after issuance, not part of the approval workflow. This applies to `vo` subtype only — internal `change_order` records typically do not go to client and transition directly from `issued` to `closed`. The service-layer transition map enforces this: `client_pending` is not a valid target from `issued` for `change_order` subtype.

### Cost Proposal

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `issued` | No | |
| `linked_to_variation` | No | Set via manual `transition` action after issue, when the Cost Proposal is formally linked to a Variation for tracking. Not auto-set when `variationId` is populated at creation — that FK is informational. The status transition is a deliberate "link" action. |
| `superseded` | Yes | Replaced by revised proposal |
| `closed` | Yes | |

No posting by default. Cost Proposal is a supporting record.

### Tax Invoice

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | Finance review mandatory |
| `approved_internal` | No | |
| `issued` | No | Posting fires: `TAX_INVOICE_ISSUED` |
| `submitted` | No | Sent to client/authority |
| `partially_collected` | No | Partial payment received |
| `collected` | Yes | Fully paid |
| `overdue` | No | Past due date |
| `cancelled` | Yes | |
| `superseded` | Yes | |
| `closed` | Yes | |

`partially_collected` / `collected` / `overdue` are basic payment tracking statuses on the invoice record itself. Full payment ledger is Module 4.

### Correspondence (shared base + subtype extensions)

**Base statuses (all subtypes):**

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | Initial creation |
| `under_review` | No | Entered via `submit` action (no intermediate `submitted` status — Correspondence goes directly from `draft` to `under_review`) |
| `returned` | No | Sent back for revision |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | Mandatory for notice, claim, back_charge |
| `issued` | No | Posting fires here for claim (`CLAIM_ISSUED`) and back_charge (`BACK_CHARGE_ISSUED`) subtypes |
| `superseded` | Yes | |
| `closed` | Yes | |

**Note:** Correspondence does not have a `submitted` status. The `submit` action transitions directly from `draft` to `under_review`. This is intentional — Correspondence does not need a separate "submitted" holding state before review begins.

**Subtype-specific extensions:**

| Subtype | Additional Statuses | Terminal? |
|---|---|---|
| `letter` | *(none)* | — |
| `notice` | `response_due`, `responded` | All non-terminal — `closed` is the terminal state |
| `claim` | `under_evaluation`, `partially_accepted`, `accepted`, `disputed` | All non-terminal — `closed` is the terminal state |
| `back_charge` | `acknowledged`, `disputed`, `recovered`, `partially_recovered` | All non-terminal — `closed` is the terminal state |

Subtype-specific statuses are valid only after `issued`. A letter flows `issued` → `closed`. A claim might flow `issued` → `under_evaluation` → `partially_accepted` → `closed`. A back charge might flow `issued` → `acknowledged` → `recovered` → `closed`.

All post-issuance subtype-specific transitions (e.g., `acknowledged`, `disputed`, `recovered` for back charges) are manual status updates via the `transition` endpoint — not workflow steps. The approval workflow ends at `issued`. Everything after is operational tracking.

### Status Transition Validation

The service layer validates every status transition against a transition map defined per model (and per subtype for Variation and Correspondence). Invalid transitions are rejected with a `BAD_REQUEST` error. The transition map is a simple `Record<Status, Status[]>` — no state machine library needed.

### Transition Maps

**IPA:**
```
draft            → [submitted]
submitted        → [under_review, returned, rejected]
under_review     → [approved_internal, returned, rejected]
returned         → [submitted]
approved_internal→ [signed, issued]          // signed is optional; can skip to issued
signed           → [issued]
issued           → [superseded, closed]
```

**IPC:**
```
draft            → [submitted]
submitted        → [under_review, returned, rejected]
under_review     → [approved_internal, returned, rejected]
returned         → [submitted]
approved_internal→ [signed]                  // signing is mandatory for IPC
signed           → [issued]
issued           → [superseded, closed]
```

**Variation (base — all subtypes):**
```
draft            → [submitted]
submitted        → [under_review, returned, rejected]
under_review     → [approved_internal, returned, rejected]
returned         → [submitted]
approved_internal→ [signed]
signed           → [issued]
issued           → [client_pending, superseded, closed]  // client_pending for vo only
client_pending   → [client_approved, client_rejected]
client_approved  → [closed]
closed           → []                        // terminal
```

For `change_order` subtype: the service-layer validation excludes `client_pending` from `issued`'s allowed transitions. Change orders go directly `issued → closed`.

**Cost Proposal:**
```
draft            → [submitted]
submitted        → [under_review, returned, rejected]
under_review     → [approved_internal, returned, rejected]
returned         → [submitted]
approved_internal→ [issued]
issued           → [linked_to_variation, superseded, closed]
linked_to_variation → [superseded, closed]
```

**Tax Invoice:**
```
draft            → [under_review]            // no submitted status — goes to finance review
under_review     → [approved_internal, returned]
returned         → [under_review]
approved_internal→ [issued]
issued           → [submitted, overdue, cancelled, superseded]
submitted        → [partially_collected, collected, overdue, cancelled]
overdue          → [partially_collected, collected, cancelled]
partially_collected → [collected, overdue]
```

**Correspondence (base):**
```
draft            → [under_review]            // submit action, no submitted status
under_review     → [approved_internal, returned, rejected]
returned         → [under_review]
approved_internal→ [signed]
signed           → [issued]
issued           → [superseded, closed, ...]  // subtype extensions below
```

**Correspondence subtype extensions from `issued`:**
- `notice`: `issued → [response_due, closed]`, `response_due → [responded, closed]`, `responded → [closed]`
- `claim`: `issued → [under_evaluation, closed]`, `under_evaluation → [partially_accepted, accepted, disputed, closed]`, `partially_accepted → [closed]`, `accepted → [closed]`, `disputed → [under_evaluation, closed]`
- `back_charge`: `issued → [acknowledged, disputed, closed]`, `acknowledged → [recovered, partially_recovered, closed]`, `disputed → [acknowledged, closed]`, `partially_recovered → [recovered, closed]`, `recovered → [closed]`
- `letter`: `issued → [closed]`

---

## 5. Workflow Paths by Model

### Engine

All workflows use the Module 1 workflow engine (linear multi-step). Each record type gets one or more seeded workflow templates. "Optional by rule" steps are handled by having multiple template variants (e.g., `ipa_standard` without finance check, `ipa_with_finance` with finance check). The active template for a project is configured via project settings or admin selection.

### Workflow Templates

#### IPA

| Template Code | Steps |
|---|---|
| `ipa_standard` | QS/Commercial Prepare → PM Review → Contracts Manager Review → PD Sign → Issue |
| `ipa_with_finance` | QS/Commercial Prepare → PM Review → Contracts Manager Review → Finance Check → PD Sign → Issue |

#### IPC

| Template Code | Steps |
|---|---|
| `ipc_standard` | QS/Commercial Prepare → PM Review → Contracts Manager Review → Finance Check (mandatory) → PD Sign (mandatory) → Issue |

#### Variation

| Template Code | Steps |
|---|---|
| `variation_standard` | Commercial Prepare → PM Review → Contracts Review → PD Approval/Sign → Issue |
| `variation_with_finance` | Commercial Prepare → PM Review → Contracts Review → Finance Check → PD Approval/Sign → Issue |

Client status (`client_pending` → `client_approved` / `client_rejected`) is tracked via a manual status update endpoint after the workflow completes, not as workflow steps.

#### Cost Proposal

| Template Code | Steps |
|---|---|
| `cost_proposal_standard` | Commercial Prepare → Contracts/Commercial Review → Issue |
| `cost_proposal_full` | Commercial Prepare → PM Review → Contracts/Commercial Review → Finance Check → PD Approval → Issue |

#### Tax Invoice

| Template Code | Steps |
|---|---|
| `tax_invoice_standard` | Commercial/Finance Prepare → Finance Review (mandatory) → Issue |
| `tax_invoice_with_pd` | Commercial/Finance Prepare → Finance Review (mandatory) → PD Sign → Issue |

#### Correspondence — Subtype Templates

| Template Code | Subtype | Steps |
|---|---|---|
| `letter_standard` | letter | Originator → Manager/Contracts Review → Issue |
| `letter_with_sign` | letter | Originator → Manager/Contracts Review → PD Sign → Issue |
| `notice_standard` | notice | Originator/Commercial → Contracts Review → PD Sign (mandatory) → Issue |
| `claim_standard` | claim | Commercial/Contracts → Contracts Review → PD Sign (mandatory) → Issue |
| `claim_with_finance` | claim | Commercial/Contracts → Contracts Review → Finance Check → PD Sign (mandatory) → Issue |
| `back_charge_standard` | back_charge | Commercial/Contracts → PM Review → Finance Check (mandatory) → PD Sign (mandatory) → Issue |

### Executive Approver

**Resolved as MINOR OPEN:** Executive Approver is available via a `_high_value` variant of any template (e.g., `ipa_high_value`). This variant adds an Executive Approver step before PD Sign. The variant is selected when the record's monetary value exceeds a configurable threshold in project settings. Template selection happens at workflow start time, not dynamically during the workflow. No conditional branching — just a different template.

The default threshold is not configured in M2 (all templates use the standard path). A master admin can create high-value template variants via the existing M1 workflow template admin screen.

---

## 6. Finance-Check Rules

| Record / Subtype | Finance Check | Rule | Checker Role |
|---|---|---|---|
| IPC | **Mandatory** | Always (workflow template enforces) | Finance |
| Tax Invoice | **Mandatory** | Always | Finance |
| Back Charge | **Mandatory** | Always | Finance |
| Variation / Change Order | **By threshold/rule** | Template with finance step selected when value exceeds threshold | Finance |
| IPA | **Optional by template** | Project admin selects template with or without finance step | Finance |
| Cost Proposal | **Optional by threshold** | Template with finance step selected when value exceeds threshold | Cost Controller |
| Claim | **Not mandatory by default** | Unless configured by template | Cost Controller |
| Letter | **Not mandatory** | Unless configured by template | — |
| Notice | **Not mandatory** | Unless configured by template | — |

Finance checks are implemented as a standard workflow step where the step's `approverRole` is `finance` or `cost_controller`. The workflow engine resolves the approver the same way as any other step.

---

## 7. Sign / Issue Rules

### Signing

Signing uses the Module 1 digital signing service (internal SHA-256 hash capture on the record's key fields). A signed record transitions to `signed` status and becomes immutable. The signing service is called as a workflow step action or via a dedicated "sign" endpoint on the commercial service.

| Record / Subtype | Sign Required? |
|---|---|
| IPA | Optional — by project/template rule |
| IPC | **Mandatory** |
| Variation / Change Order | **Mandatory** |
| Cost Proposal | Optional — by threshold/template |
| Tax Invoice | By rule (project policy) |
| Letter | By template/rule |
| Notice | **Mandatory** |
| Claim | **Mandatory** |
| Back Charge | **Mandatory** |

### Issuing

Issuing means: the record gets a reference number, transitions to `issued` status, and is formally locked. Issue control is handled by a final workflow step or a dedicated "issue" endpoint.

### Reference Numbers

**Resolved as MINOR OPEN:** Auto-generated, project-scoped, sequential.

Format: `{ProjectCode}-{TypeCode}-{NNN}`

| Model / Subtype | Type Code | Example |
|---|---|---|
| IPA | `IPA` | `PROJ01-IPA-001` |
| IPC | `IPC` | `PROJ01-IPC-001` |
| Variation (vo) | `VO` | `PROJ01-VO-003` |
| Variation (change_order) | `CO` | `PROJ01-CO-001` |
| Cost Proposal | `CP` | `PROJ01-CP-002` |
| Tax Invoice | `INV` | `PROJ01-INV-001` |
| Correspondence (letter) | `LTR` | `PROJ01-LTR-012` |
| Correspondence (notice) | `NTC` | `PROJ01-NTC-001` |
| Correspondence (claim) | `CLM` | `PROJ01-CLM-001` |
| Correspondence (back_charge) | `BC` | `PROJ01-BC-003` |

Reference numbers are assigned at the `issued` status transition. A `ReferenceCounter` table tracks the last-used number per project per type code. The counter is incremented in the same transaction as the status update.

### Client Acknowledgment

**Resolved as MINOR OPEN:** The Variation model has explicit client-facing statuses (`client_pending`, `client_approved`, `client_rejected`). Other record types track client interaction via the `issued` status and optional metadata (issue date, transmittal reference). Full client response tracking for all types is a future enhancement.

---

## 8. Posting Trigger Rules

### Event Registry

Module 2 registers 7 event types at service boot time via `registerEventType()`:

| Event Type | Fires When | Source Record | Exposure Type |
|---|---|---|---|
| `IPA_APPROVED` | IPA → `approved_internal` | `ipa` | Claimed exposure |
| `IPC_SIGNED` | IPC → `signed` | `ipc` | Certified receivable |
| `VARIATION_APPROVED_INTERNAL` | Variation → `approved_internal` | `variation` | Pending commercial exposure |
| `VARIATION_APPROVED_CLIENT` | Variation → `client_approved` | `variation` | Approved contract/revenue uplift |
| `TAX_INVOICE_ISSUED` | TaxInvoice → `issued` | `tax_invoice` | Receivable due |
| `CLAIM_ISSUED` | Correspondence (claim) → `issued` | `correspondence` | Claim exposure |
| `BACK_CHARGE_ISSUED` | Correspondence (back_charge) → `issued` | `correspondence` | Recovery exposure |

**No posting:** Cost Proposal, Letter, Notice.

### Payload Schemas

Each event type has a Zod schema registered in the event registry. Schemas include:

**`IPA_APPROVED`:**
```
{ ipaId, periodNumber, grossAmount, retentionAmount, netClaimed, currency, projectId }
```

**`IPC_SIGNED`:**
```
{ ipcId, ipaId, certifiedAmount, retentionAmount, netCertified, currency, projectId }
```

**`VARIATION_APPROVED_INTERNAL`:**
```
{ variationId, subtype, title, costImpact, timeImpactDays, currency, projectId }
```

**`VARIATION_APPROVED_CLIENT`:**
```
{ variationId, subtype, approvedCost, approvedTimeDays, clientRef, currency, projectId }
```

**`TAX_INVOICE_ISSUED`:**
```
{ taxInvoiceId, ipcId, invoiceNumber, grossAmount, vatRate, vatAmount, totalAmount, currency, projectId }
```

**`CLAIM_ISSUED`:**
```
{ correspondenceId, claimType, claimedAmount, claimedTimeDays, currency, projectId }
```

**`BACK_CHARGE_ISSUED`:**
```
{ correspondenceId, targetName, category, chargedAmount, currency, projectId }
```

### Posting Integration

Each commercial service calls `postingService.post()` inside the status transition handler. The idempotency key is derived from the record ID + status transition (e.g., `ipa:{id}:approved_internal`). This ensures posting is exactly-once even if the transition is retried.

**`entityId` resolution:** The M1 `PostInput` type includes an optional `entityId` field. Each commercial service resolves `entityId` by reading `project.entityId` from the project record (already loaded by `projectProcedure`) and passes it to every `postingService.post()` call. This enables Module 4 to aggregate receivables by entity.

### Contract Value Tracking

**Resolved as MINOR OPEN:** Module 2 does **not** maintain a stored `contractValue` field on Project. Contract value can be derived from `VARIATION_APPROVED_CLIENT` posting events. A dedicated contract value tracking model is deferred to Module 4. The commercial dashboard computes contract value on-the-fly from posting events for display purposes.

---

## 9. Receivable / Inflow Linkage Rules

### Module 2 Boundary

- M2 fires posting events with amount, currency, project, and exposure type
- M2 does **not** maintain a receivable ledger table
- M4 will consume M2 posting events to build the receivable ledger
- The commercial dashboard computes summary values on-the-fly from posting events

### Tax Invoice Basic Payment Tracking

Tax Invoice has `partially_collected`, `collected`, and `overdue` statuses for basic tracking on the invoice record itself. These are manual status updates (not posting events). Full payment matching, aging reports, and cashflow tracking are Module 4.

### Extension Points for Module 4

Module 4 will:
1. Create a `Receivable` model that consumes M2 posting events
2. Add payment receipt tracking against receivables
3. Build aging reports and cashflow projections
4. Optionally add a stored `contractValue` field on Project

Module 2's posting events carry all the data Module 4 needs — no schema changes to M2 will be required.

---

## 10. Required Forms and Field Groups

### Field Strategy

- Shared base tables with `subtype` enum + nullable subtype-specific columns
- All money fields: `Decimal` (Prisma `@db.Decimal(18, 2)`)
- All FK fields: UUID strings
- Currency: string FK to M1 `Currency` reference data
- All models get standard audit fields: `id`, `createdBy`, `createdAt`, `updatedAt`, `status`, `referenceNumber` (nullable, assigned on issue), `projectId`

### IPA Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | M1 project isolation |
| `periodNumber` | Int | Yes | Sequential payment period |
| `periodFrom` | DateTime | Yes | Period start |
| `periodTo` | DateTime | Yes | Period end |
| `grossAmount` | Decimal(18,2) | Yes | Total gross claimed |
| `retentionRate` | Decimal(5,4) | Yes | Retention % (e.g., 0.10 for 10%) |
| `retentionAmount` | Decimal(18,2) | Yes | Calculated retention |
| `previousCertified` | Decimal(18,2) | Yes | Cumulative prior certified |
| `currentClaim` | Decimal(18,2) | Yes | Net current period claim |
| `advanceRecovery` | Decimal(18,2) | No | Advance payment recovery |
| `otherDeductions` | Decimal(18,2) | No | Other deductions |
| `netClaimed` | Decimal(18,2) | Yes | Final net amount |
| `currency` | String | Yes | Currency code |
| `description` | String | No | Summary |
| `status` | Enum | Yes | See §4 |
| `referenceNumber` | String | No | Assigned on issue |

**IPA line items:** Resolved as MINOR OPEN — M2 ships IPA as a **single summary record**. Line items (itemized work breakdown) are a Module 4 enhancement when budget/cost codes exist. The IPA `description` field carries the summary narrative.

### IPC Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | |
| `ipaId` | String (FK → Ipa) | Yes | Parent IPA |
| `certifiedAmount` | Decimal(18,2) | Yes | Certified total |
| `retentionAmount` | Decimal(18,2) | Yes | Retention held |
| `adjustments` | Decimal(18,2) | No | Adjustments |
| `netCertified` | Decimal(18,2) | Yes | Net certified for payment |
| `certificationDate` | DateTime | Yes | |
| `currency` | String | Yes | |
| `remarks` | String | No | |

### Variation Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | |
| `subtype` | Enum (`vo`, `change_order`) | Yes | Family subtype |
| `title` | String | Yes | |
| `description` | String | Yes | What changed and why |
| `reason` | String | Yes | Justification |
| `costImpact` | Decimal(18,2) | No | Estimated cost change |
| `timeImpactDays` | Int | No | Estimated schedule change |
| `currency` | String | Yes | |
| **Assessment fields (nullable, populated during review/approve):** | | | |
| `assessedCostImpact` | Decimal(18,2) | No | Consultant's recommended cost — set at `review` |
| `assessedTimeImpactDays` | Int | No | Consultant's recommended time — set at `review` |
| `approvedCostImpact` | Decimal(18,2) | No | Final approved cost — set at `approve_internal` |
| `approvedTimeImpactDays` | Int | No | Final approved time — set at `approve_internal` |
| **VO-specific (nullable):** | | | |
| `initiatedBy` | Enum | No | `contractor` / `client` |
| `contractClause` | String | No | Relevant clause reference |
| **CO-specific (nullable):** | | | |
| `parentVariationId` | String (FK → Variation) | No | Link to originating VO |
| `originalContractValue` | Decimal(18,2) | No | Contract value before change |
| `adjustmentAmount` | Decimal(18,2) | No | This change |
| `newContractValue` | Decimal(18,2) | No | Contract value after change |
| `timeAdjustmentDays` | Int | No | |

**VO line items:** Resolved as MINOR OPEN — M2 ships Variation as a **single summary record**. Line items are a future enhancement.

### Cost Proposal Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | |
| `variationId` | String (FK → Variation) | No | Optional link |
| `revisionNumber` | Int | Yes | Sequential revision |
| `estimatedCost` | Decimal(18,2) | Yes | Total estimated |
| `estimatedTimeDays` | Int | No | Time impact |
| `methodology` | String | No | Proposed approach |
| `costBreakdown` | String | No | **Resolved as MINOR OPEN:** Free-form text in M2. Structured breakdown (labor/materials/equipment/overhead) is a future enhancement. |
| `currency` | String | Yes | |
| **Assessment fields (nullable, populated during review/approve):** | | | |
| `assessedCost` | Decimal(18,2) | No | Consultant's assessed cost — set at `review` |
| `assessedTimeDays` | Int | No | Consultant's assessed time — set at `review` |
| `approvedCost` | Decimal(18,2) | No | Final approved cost — set at `approve` |
| `approvedTimeDays` | Int | No | Final approved time — set at `approve` |

### Tax Invoice Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | |
| `ipcId` | String (FK → Ipc) | Yes | Parent IPC |
| `invoiceNumber` | String | Yes | Auto-generated sequential |
| `invoiceDate` | DateTime | Yes | |
| `grossAmount` | Decimal(18,2) | Yes | Pre-tax |
| `vatRate` | Decimal(5,4) | Yes | **Resolved as MINOR OPEN:** Configurable per entity, defaulting to 0.15 (15% Saudi standard). Stored on each invoice for audit immutability. |
| `vatAmount` | Decimal(18,2) | Yes | Calculated |
| `totalAmount` | Decimal(18,2) | Yes | Gross + VAT |
| `dueDate` | DateTime | No | Payment terms |
| `currency` | String | Yes | |
| `buyerName` | String | Yes | Client name |
| `buyerTaxId` | String | No | Client VAT registration |
| `sellerTaxId` | String | Yes | Our VAT registration (from Entity) |

### Correspondence Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | String (FK → Project) | Yes | |
| `subtype` | Enum (`letter`, `notice`, `claim`, `back_charge`) | Yes | |
| `subject` | String | Yes | |
| `body` | String | Yes | |
| `recipientName` | String | Yes | |
| `recipientOrg` | String | No | |
| `currency` | String | No | Only for financial subtypes |
| `parentCorrespondenceId` | String (FK → Correspondence) | No | Notice → claim link |
| **Notice-specific (nullable):** | | | |
| `noticeType` | Enum | No | `delay`, `claim_notice`, `extension_of_time`, `dispute`, `force_majeure`, `general` |
| `contractClause` | String | No | |
| `responseDeadline` | DateTime | No | |
| **Claim-specific (nullable):** | | | |
| `claimType` | Enum | No | `time_extension`, `additional_cost`, `time_and_cost` |
| `claimedAmount` | Decimal(18,2) | No | |
| `claimedTimeDays` | Int | No | |
| `settledAmount` | Decimal(18,2) | No | Filled on settlement |
| `settledTimeDays` | Int | No | Filled on settlement |
| `contractClause` | String | No | Shared field name with notice |
| **Back-charge-specific (nullable):** | | | |
| `targetName` | String | No | Free-text subcontractor name |
| `category` | Enum | No | `defect`, `delay`, `non_compliance`, `damage`, `other` |
| `chargedAmount` | Decimal(18,2) | No | |
| `evidenceDescription` | String | No | |
| **Letter-specific (nullable):** | | | |
| `letterType` | Enum | No | `instruction`, `response`, `transmittal`, `general` |
| `inReplyToId` | String (FK → Correspondence) | No | Reference to prior letter |

### Document Attachments

**Resolved as MINOR OPEN:** All commercial records support linking to M1 documents via the existing `recordType` + `recordId` nullable fields on the Document model. When creating or uploading a document, the caller can pass `recordType: 'ipa'` and `recordId: '{ipa-id}'` to associate the document with a specific commercial record. No schema change needed — this is already built into M1.

### Internal Comments

**Resolved as MINOR OPEN:** M2 uses the existing workflow step `comment` field for review-stage discussion. A dedicated comments thread per record is a future enhancement. The workflow action's comment is stored in `WorkflowAction.comment` and is visible in the audit trail.

---

## 11. Screen List and Screen Behavior

### 13 Screens

All screens are project-scoped, inside the project workspace. All respect M1 project isolation and RBAC.

#### 1. Commercial Dashboard (`/projects/{id}/commercial`)

Summary view with 9 sections:
- Commercial register summary (counts + totals)
- IPA pipeline summary (active, by status, total claimed)
- IPC certified summary (certified totals, pending)
- Variation exposure summary (pending VOs, approved changes, cost impact)
- Tax invoice summary (issued, submitted, collected, overdue)
- Correspondence/claim/back-charge summary (open by subtype)
- Client submission history (all issued records, across types)
- Pending approvals (records awaiting current user's action)
- Claimed vs certified vs invoiced (high-level financial bar/summary)

Data: tRPC `commercial.dashboard` procedure fetching aggregates from each model.

#### 2-3. IPA List + Detail

**List** (`/projects/{id}/commercial/ipa`): Paginated table with columns: Reference, Period, Gross Amount, Net Claimed, Status, Created. Filters: status (multi-select), period range, date range, amount range, creator. Column sorting on any column. Saved filter views (localStorage per user). Dashboard drilldown: clicking a status count pre-fills the status filter via URL params. Create button (if `ipa.create` permission).

**Detail** (`/projects/{id}/commercial/ipa/{id}`): Full record view with: header (reference, status badge, period), financial summary, description, workflow timeline, linked IPCs list, attached documents, audit trail. Action buttons: workflow actions (approve/reject/return), sign, issue — shown based on permission and current workflow step.

#### 4-5. IPC List + Detail

**List** (`/projects/{id}/commercial/ipc`): Columns: Reference, IPA Ref, Certified Amount, Net Certified, Status. Filters: status (multi-select), date range, amount range, creator. Column sorting. Saved filter views (localStorage). Dashboard drilldown support.

**Detail** (`/projects/{id}/commercial/ipc/{id}`): Header, financial summary, linked IPA (clickable), linked Tax Invoices, workflow timeline, documents, audit trail.

#### 6-7. Variation List + Detail

**List** (`/projects/{id}/commercial/variations`): Columns: Reference, Subtype (badge), Title, Cost Impact, Assessed Cost, Approved Cost, Time Impact, Status. Filters: subtype (tabs: All / VO / Change Order), status (multi-select), date range, amount range, creator. Column sorting. Saved filter views (localStorage). Dashboard drilldown support. Subtype is displayed as a badge — no separate list screens.

**Detail** (`/projects/{id}/commercial/variations/{id}`): Subtype-aware layout. VO shows: initiatedBy, contractClause. CO shows: parent VO link, contract value adjustment. Shared: title, description, reason, cost/time impact, workflow timeline, linked cost proposals, documents, client status section (if applicable), audit trail.

#### 8-9. Cost Proposal List + Detail

**List** (`/projects/{id}/commercial/cost-proposals`): Columns: Reference, Linked VO, Revision, Estimated Cost, Assessed Cost, Approved Cost, Status. Filters: status (multi-select), linked variation, date range, amount range, creator. Column sorting. Saved filter views (localStorage). Dashboard drilldown support.

**Detail** (`/projects/{id}/commercial/cost-proposals/{id}`): Header, linked variation (if any), cost/time estimate, methodology, breakdown, workflow timeline, documents, audit trail.

#### 10-11. Tax Invoice List + Detail

**List** (`/projects/{id}/commercial/invoices`): Columns: Invoice Number, IPC Ref, Gross, VAT, Total, Status. Filters: status (multi-select), date range, amount range, creator. Column sorting. Saved filter views (localStorage). Dashboard drilldown support.

**Detail** (`/projects/{id}/commercial/invoices/{id}`): Header, VAT breakdown, linked IPC, due date, payment status, workflow timeline, documents, audit trail.

#### 12-13. Correspondence List + Detail

**List** (`/projects/{id}/commercial/correspondence`): Columns: Reference, Subtype (badge), Subject, Recipient, Status. Filters: subtype (tabs: All / Letter / Notice / Claim / Back Charge), status (multi-select), date range, creator. Column sorting. Saved filter views (localStorage). Dashboard drilldown support. One list screen for all subtypes.

**Detail** (`/projects/{id}/commercial/correspondence/{id}`): Subtype-aware layout:
- **Letter**: subject, body, recipient, reply-to link, letter type
- **Notice**: + notice type, contract clause, response deadline, response status
- **Claim**: + claim type, claimed/settled amounts, negotiation status
- **Back Charge**: + target name, category, charged amount, evidence, dispute status

Shared: workflow timeline, documents, audit trail, parent correspondence link (if any).

#### Document Attachment Panel (All Detail Views)

Each detail view has a document attachment panel showing files linked to the record via M1's `recordType` + `recordId` pattern. **Addendum A** adds a client-side file-type filter dropdown:
- All
- Documents (PDF, Word)
- Images (PNG, JPG, SVG)
- Spreadsheets (XLS, XLSX, CSV)

Filtering is done client-side on the fetched document list (no schema change).

#### 14. Client Submission History

**Resolved as MINOR OPEN:** Implemented as a section on the Commercial Dashboard rather than a separate screen. Shows a chronological table of all records that have reached `issued` status or beyond, across all commercial types. Columns: Date Issued, Type, Reference, Subject/Title, Amount, Current Status.

### Navigation

The project workspace sidebar gets a new **Commercial** section:

```
Commercial
├── Dashboard
├── IPA
├── IPC
├── Variations
├── Cost Proposals
├── Invoices
└── Correspondence
```

The top-level "Commercial" placeholder from Module 1 (currently "Coming in Module 2") becomes active with a link to the project's commercial dashboard.

---

## 12. Role-Permission Model for Module 2

### Permission Codes (50 new)

6 record families × 8 actions = 48, plus `commercial_dashboard.view` and `client_submission_history.view` = **50 new permission codes**.

### Role-Permission Matrix

Derived from the locked record ownership (§3) and workflow paths (§5). Roles that create or review a record type need the corresponding permissions. View-only roles get only `view`.

Legend: **C** = create, **E** = edit, **S** = submit, **R** = review, **A** = approve, **G** = sign, **I** = issue, **V** = view

| Role | IPA | IPC | Variation | CostProposal | TaxInvoice | Correspondence | Dashboard | History |
|------|-----|-----|-----------|-------------|-----------|----------------|-----------|---------|
| **master_admin** | All | All | All | All | All | All | V | V |
| **project_director** | V,R,A,G | V,R,A,G | V,R,A,G | V,R,A | V,R,A,G | V,R,A,G,I | V | V |
| **project_manager** | V,R | V,R | V,R | V,R | V | V,R,I | V | V |
| **contracts_manager** | V,R,I | V,R,I | V,C,E,S,R,I | V,R | V,R | V,C,E,S,R,I | V | V |
| **qs_commercial** | V,C,E,S | V,C,E,S | V,C,E,S | V,C,E,S | V,C,E,S | V,C,E,S | V | V |
| **finance** | V,R | V,R | V | V | V,C,E,R,G,I | V | V | V |
| **cost_controller** | V | V | V | V,R | V | V,R | V | V |
| **site_team** | V | V | V,C,E | V | V | V,C,E | V | V |
| **design** | V | V | V,C,E | V | V | V,C,E | V | V |
| **qa_qc** | V | V | V | V | V | V | V | V |
| **procurement** | V | V | V | V | V | V | V | V |
| **document_controller** | V,I | V,I | V,I | V | V | V,I | V | V |
| **pmo** | V | V | V | V | V | V | V | V |
| **executive_approver** | V,R,A,G | V,R,A,G | V,R,A,G | V,R,A | V,R,A | V,R,A,G | V | V |

**Notes:**
- Document Controller gets `issue` permission on IPA, IPC, and Variation — they handle controlled copy distribution. No approve/sign authority. (Confirmed by Ahmed.)
- QS/Commercial gets `create`, `edit`, `submit` on most types — they are the primary operational role.
- Contracts Manager gets `create`, `edit`, `submit`, `review`, `issue` on Variation and Correspondence — they control commercial workflows.
- Finance has full control over Tax Invoices and review-only on other financial records.
- Cost Controller has `view` and `review` on Cost Proposal (no `create`/`edit`) — financial input role only. Has `review` on Correspondence for finance-check duty on Claims per §6. (Confirmed by Ahmed.)
- Site Team and Design can create Variations (they see scope changes on-site) and Correspondence (letters from their department).
- QA/QC is view-only across all commercial records. They may contribute to back charges when configured by project policy, but are not default submitters. (Confirmed by Ahmed.)
- PMO and Procurement are view-only across all commercial records in M2.

**Role-permission matrix confirmed by Ahmed on 2026-04-10.**

---

## 13. Service Boundaries

### New Package: `packages/core/src/commercial/`

Module 2 adds a `commercial` directory to the core package with the following service modules:

```
packages/core/src/commercial/
├── ipa/
│   ├── service.ts          # CRUD + status transitions for IPA
│   ├── validation.ts       # Zod schemas for IPA input
│   └── index.ts
├── ipc/
│   ├── service.ts          # CRUD + status transitions for IPC
│   ├── validation.ts
│   └── index.ts
├── variation/
│   ├── service.ts          # CRUD + status transitions for Variation
│   ├── validation.ts       # Subtype-aware validation
│   └── index.ts
├── cost-proposal/
│   ├── service.ts
│   ├── validation.ts
│   └── index.ts
├── tax-invoice/
│   ├── service.ts          # CRUD + status transitions + reference numbering
│   ├── validation.ts
│   └── index.ts
├── correspondence/
│   ├── service.ts          # CRUD + status transitions + subtype routing
│   ├── validation.ts       # Subtype-aware validation
│   └── index.ts
├── reference-number/
│   ├── service.ts          # Shared reference number generation
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

### Service Rules

1. **All commercial services import from M1 core services** — `auditService`, `postingService`, `workflowInstanceService`, `workflowTemplateService`. They never reimplement M1 logic.
2. **Status transitions are the orchestration point** — when a service transitions a record's status, it: validates the transition, updates the record, writes an audit log, fires the posting event (if applicable), and emits a workflow event (if workflow-driven).
3. **No cross-service direct calls within commercial** — IPC service does not call IPA service directly. Cross-record validation (e.g., "IPC can only be created from an approved IPA") is done by reading the IPA record's status, not by calling the IPA service.
4. **Posting hooks register at boot** — `posting-hooks/register.ts` is called once during app initialization to register all 7 event types.
5. **Validation schemas live in `packages/contracts`** — tRPC input schemas are defined in `packages/contracts/src/commercial/` and imported by both the service and the router. This follows the M1 pattern.

---

## 14. Database Design for Module 2

### New Models (6)

All models use the M1 conventions: UUID primary keys, `createdAt`/`updatedAt` timestamps, `@map` for snake_case table names, `onDelete: Restrict` for FK relationships.

### Migration

One migration: `{timestamp}_add_commercial_engine`. All additive — new tables and columns only. No destructive changes to M1 tables.

**Project model update required:** Prisma requires reciprocal relation arrays on the `Project` model for all 7 new models. This is a schema-only addition (no database column changes — Prisma relation arrays are virtual). The following fields must be added to the existing `Project` model:

```prisma
// Added by M2 migration — relation arrays only (no DB columns)
ipas              Ipa[]
ipcs              Ipc[]
variations        Variation[]
costProposals     CostProposal[]
taxInvoices       TaxInvoice[]
correspondences   Correspondence[]
referenceCounters ReferenceCounter[]
```

This does **not** alter the `projects` table in the database — Prisma relation arrays are resolved via the FK on the child model. The migration creates the new tables with FK columns pointing to `projects.id`.

### Schema Overview

```prisma
// ── Enums ──

enum VariationSubtype {
  vo
  change_order
}

enum CorrespondenceSubtype {
  letter
  notice
  claim
  back_charge
}

enum VariationInitiatedBy {
  contractor
  client
}

enum NoticeType {
  delay
  claim_notice
  extension_of_time
  dispute
  force_majeure
  general
}

enum ClaimType {
  time_extension
  additional_cost
  time_and_cost
}

enum BackChargeCategory {
  defect
  delay
  non_compliance
  damage
  other
}

enum LetterType {
  instruction
  response
  transmittal
  general
}

// ── Models ──

model Ipa {
  id                String      @id @default(uuid())
  projectId         String      @map("project_id")
  status            String      @default("draft")
  referenceNumber   String?     @unique @map("reference_number")
  periodNumber      Int         @map("period_number")
  periodFrom        DateTime    @map("period_from")
  periodTo          DateTime    @map("period_to")
  grossAmount       Decimal     @map("gross_amount") @db.Decimal(18, 2)
  retentionRate     Decimal     @map("retention_rate") @db.Decimal(5, 4)
  retentionAmount   Decimal     @map("retention_amount") @db.Decimal(18, 2)
  previousCertified Decimal     @map("previous_certified") @db.Decimal(18, 2)
  currentClaim      Decimal     @map("current_claim") @db.Decimal(18, 2)
  advanceRecovery   Decimal?    @map("advance_recovery") @db.Decimal(18, 2)
  otherDeductions   Decimal?    @map("other_deductions") @db.Decimal(18, 2)
  netClaimed        Decimal     @map("net_claimed") @db.Decimal(18, 2)
  currency          String
  description       String?
  createdBy         String      @map("created_by")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  project           Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  ipcs              Ipc[]

  @@index([projectId, status])
  @@index([projectId, createdAt])
  @@map("ipas")
}

model Ipc {
  id                String      @id @default(uuid())
  projectId         String      @map("project_id")
  ipaId             String      @map("ipa_id")
  status            String      @default("draft")
  referenceNumber   String?     @unique @map("reference_number")
  certifiedAmount   Decimal     @map("certified_amount") @db.Decimal(18, 2)
  retentionAmount   Decimal     @map("retention_amount") @db.Decimal(18, 2)
  adjustments       Decimal?    @db.Decimal(18, 2)
  netCertified      Decimal     @map("net_certified") @db.Decimal(18, 2)
  certificationDate DateTime    @map("certification_date")
  currency          String
  remarks           String?
  createdBy         String      @map("created_by")
  createdAt         DateTime    @default(now()) @map("created_at")
  updatedAt         DateTime    @updatedAt @map("updated_at")

  project           Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  ipa               Ipa         @relation(fields: [ipaId], references: [id], onDelete: Restrict)
  taxInvoices       TaxInvoice[]

  @@index([projectId, status])
  @@index([ipaId])
  @@map("ipcs")
}

model Variation {
  id                    String              @id @default(uuid())
  projectId             String              @map("project_id")
  subtype               VariationSubtype
  status                String              @default("draft")
  referenceNumber       String?             @unique @map("reference_number")
  title                 String
  description           String
  reason                String
  costImpact            Decimal?            @map("cost_impact") @db.Decimal(18, 2)
  timeImpactDays        Int?                @map("time_impact_days")
  currency              String
  // Assessment fields (Addendum A) — populated during review/approve
  assessedCostImpact    Decimal?             @map("assessed_cost_impact") @db.Decimal(18, 2)
  assessedTimeImpactDays Int?                @map("assessed_time_impact_days")
  approvedCostImpact    Decimal?             @map("approved_cost_impact") @db.Decimal(18, 2)
  approvedTimeImpactDays Int?                @map("approved_time_impact_days")
  // VO-specific (nullable)
  initiatedBy           VariationInitiatedBy? @map("initiated_by")
  contractClause        String?              @map("contract_clause")
  // CO-specific (nullable)
  parentVariationId     String?              @map("parent_variation_id")
  originalContractValue Decimal?             @map("original_contract_value") @db.Decimal(18, 2)
  adjustmentAmount      Decimal?             @map("adjustment_amount") @db.Decimal(18, 2)
  newContractValue      Decimal?             @map("new_contract_value") @db.Decimal(18, 2)
  timeAdjustmentDays    Int?                 @map("time_adjustment_days")
  createdBy             String               @map("created_by")
  createdAt             DateTime             @default(now()) @map("created_at")
  updatedAt             DateTime             @updatedAt @map("updated_at")

  project               Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
  parentVariation       Variation?           @relation("VariationParent", fields: [parentVariationId], references: [id], onDelete: Restrict)
  childVariations       Variation[]          @relation("VariationParent")
  costProposals         CostProposal[]

  @@index([projectId, subtype, status])
  @@index([projectId, createdAt])
  @@map("variations")
}

model CostProposal {
  id              String      @id @default(uuid())
  projectId       String      @map("project_id")
  variationId     String?     @map("variation_id")
  status          String      @default("draft")
  referenceNumber String?     @unique @map("reference_number")
  revisionNumber  Int         @map("revision_number")
  estimatedCost   Decimal     @map("estimated_cost") @db.Decimal(18, 2)
  estimatedTimeDays Int?      @map("estimated_time_days")
  methodology     String?
  costBreakdown   String?     @map("cost_breakdown")
  currency        String
  // Assessment fields (Addendum A) — populated during review/approve
  assessedCost    Decimal?    @map("assessed_cost") @db.Decimal(18, 2)
  assessedTimeDays Int?       @map("assessed_time_days")
  approvedCost    Decimal?    @map("approved_cost") @db.Decimal(18, 2)
  approvedTimeDays Int?       @map("approved_time_days")
  createdBy       String      @map("created_by")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  project         Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  variation       Variation?  @relation(fields: [variationId], references: [id], onDelete: Restrict)

  @@index([projectId, status])
  @@index([variationId])
  @@map("cost_proposals")
}

model TaxInvoice {
  id              String      @id @default(uuid())
  projectId       String      @map("project_id")
  ipcId           String      @map("ipc_id")
  status          String      @default("draft")
  referenceNumber String?     @unique @map("reference_number")
  invoiceNumber   String      @map("invoice_number") @unique
  invoiceDate   DateTime    @map("invoice_date")
  grossAmount   Decimal     @map("gross_amount") @db.Decimal(18, 2)
  vatRate       Decimal     @map("vat_rate") @db.Decimal(5, 4)
  vatAmount     Decimal     @map("vat_amount") @db.Decimal(18, 2)
  totalAmount   Decimal     @map("total_amount") @db.Decimal(18, 2)
  dueDate       DateTime?   @map("due_date")
  currency      String
  buyerName     String      @map("buyer_name")
  buyerTaxId    String?     @map("buyer_tax_id")
  sellerTaxId   String      @map("seller_tax_id")
  createdBy     String      @map("created_by")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  project       Project     @relation(fields: [projectId], references: [id], onDelete: Restrict)
  ipc           Ipc         @relation(fields: [ipcId], references: [id], onDelete: Restrict)

  @@index([projectId, status])
  @@index([ipcId])
  @@map("tax_invoices")
}

model Correspondence {
  id                      String                  @id @default(uuid())
  projectId               String                  @map("project_id")
  subtype                 CorrespondenceSubtype
  status                  String                  @default("draft")
  referenceNumber         String?                 @unique @map("reference_number")
  subject                 String
  body                    String
  recipientName           String                  @map("recipient_name")
  recipientOrg            String?                 @map("recipient_org")
  currency                String?
  parentCorrespondenceId  String?                 @map("parent_correspondence_id")
  // Notice-specific
  noticeType              NoticeType?             @map("notice_type")
  contractClause          String?                 @map("contract_clause")
  responseDeadline        DateTime?               @map("response_deadline")
  // Claim-specific
  claimType               ClaimType?              @map("claim_type")
  claimedAmount           Decimal?                @map("claimed_amount") @db.Decimal(18, 2)
  claimedTimeDays         Int?                    @map("claimed_time_days")
  settledAmount           Decimal?                @map("settled_amount") @db.Decimal(18, 2)
  settledTimeDays         Int?                    @map("settled_time_days")
  // Back-charge-specific
  targetName              String?                 @map("target_name")
  category                BackChargeCategory?
  chargedAmount           Decimal?                @map("charged_amount") @db.Decimal(18, 2)
  evidenceDescription     String?                 @map("evidence_description")
  // Letter-specific
  letterType              LetterType?             @map("letter_type")
  inReplyToId             String?                 @map("in_reply_to_id")
  createdBy               String                  @map("created_by")
  createdAt               DateTime                @default(now()) @map("created_at")
  updatedAt               DateTime                @updatedAt @map("updated_at")

  project                 Project                 @relation(fields: [projectId], references: [id], onDelete: Restrict)
  parentCorrespondence    Correspondence?         @relation("CorrespondenceParent", fields: [parentCorrespondenceId], references: [id], onDelete: Restrict)
  childCorrespondences    Correspondence[]        @relation("CorrespondenceParent")
  inReplyTo               Correspondence?         @relation("CorrespondenceReply", fields: [inReplyToId], references: [id], onDelete: Restrict)
  replies                 Correspondence[]        @relation("CorrespondenceReply")

  @@index([projectId, subtype, status])
  @@index([projectId, createdAt])
  @@map("correspondences")
}

model ReferenceCounter {
  id          String  @id @default(uuid())
  projectId   String  @map("project_id")
  typeCode    String  @map("type_code")
  lastNumber  Int     @default(0) @map("last_number")

  project     Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@unique([projectId, typeCode])
  @@map("reference_counters")
}
```

### Indexes

Each model is indexed on `(projectId, status)` for filtered list queries and `(projectId, createdAt)` for chronological sorting. FK columns are indexed for join performance. The `ReferenceCounter` has a unique constraint on `(projectId, typeCode)` for atomic counter increment.

**Reference number uniqueness:** All models with `referenceNumber` should include a `@unique` attribute on the field. Since `referenceNumber` is nullable (assigned only at `issued`), the unique constraint applies to non-null values only (Postgres unique indexes ignore nulls by default). This provides a database-level guarantee against duplicate reference numbers even under concurrent access.

### Seed Data

The M2 migration seed adds:
- 50 new permission codes (6 families × 8 actions + 2 dashboard/history)
- Permission-to-role mappings per the matrix in §12
- ~12 workflow templates (see §5)
- Screen permissions for commercial screens per role
- Reference data: no new countries/currencies needed (M1 covers this)

---

## 15. API / Router Design

### New tRPC Router: `commercial`

Added to `apps/web/server/routers/_app.ts` alongside the existing 11 routers.

```
commercial
├── ipa
│   ├── list        (projectProcedure) — paginated, filtered
│   ├── get         (projectProcedure) — single record
│   ├── create      (projectProcedure) — draft creation
│   ├── update      (projectProcedure) — edit draft
│   ├── transition  (projectProcedure) — status transition (submit, approve, sign, issue, etc.)
│   └── delete      (projectProcedure) — soft delete draft only
├── ipc
│   ├── list        (projectProcedure)
│   ├── get         (projectProcedure)
│   ├── create      (projectProcedure) — validates parent IPA is approved
│   ├── update      (projectProcedure)
│   ├── transition  (projectProcedure)
│   └── delete      (projectProcedure)
├── variation
│   ├── list        (projectProcedure) — filterable by subtype
│   ├── get         (projectProcedure)
│   ├── create      (projectProcedure) — subtype-aware validation
│   ├── update      (projectProcedure)
│   ├── transition  (projectProcedure) — includes client status updates
│   └── delete      (projectProcedure)
├── costProposal
│   ├── list        (projectProcedure)
│   ├── get         (projectProcedure)
│   ├── create      (projectProcedure)
│   ├── update      (projectProcedure)
│   ├── transition  (projectProcedure)
│   └── delete      (projectProcedure)
├── taxInvoice
│   ├── list        (projectProcedure)
│   ├── get         (projectProcedure)
│   ├── create      (projectProcedure) — validates parent IPC is certified/signed
│   ├── update      (projectProcedure)
│   ├── transition  (projectProcedure)
│   └── delete      (projectProcedure)
├── correspondence
│   ├── list        (projectProcedure) — filterable by subtype
│   ├── get         (projectProcedure)
│   ├── create      (projectProcedure) — subtype-aware validation
│   ├── update      (projectProcedure)
│   ├── transition  (projectProcedure) — includes subtype-specific status transitions
│   └── delete      (projectProcedure)
└── dashboard
    └── summary     (projectProcedure) — aggregated dashboard data
```

### Procedure Tier

All commercial procedures use `projectProcedure` (M1 tier: authenticated + project assignment check). This ensures project isolation is enforced for every commercial operation.

### Permission Checks

Each procedure checks the relevant permission before executing. Example: `commercial.ipa.create` checks `ipa.create` permission. The check happens after `projectProcedure` validates project access.

### Status Transition Endpoint

Each sub-router has a `transition` procedure that accepts `{ id, action, comment? }` where `action` is the desired transition (e.g., `submit`, `approve`, `sign`, `issue`, `reject`, `return`). The service maps the action to the next status, validates the transition, executes side effects (audit log, posting event, workflow step), and returns the updated record.

### Input Validation

All input schemas are defined in `packages/contracts/src/commercial/` following the M1 pattern:

```
packages/contracts/src/commercial/
├── ipa.ts          # createIpaInput, updateIpaInput, transitionIpaInput
├── ipc.ts
├── variation.ts    # subtype-aware schemas
├── cost-proposal.ts
├── tax-invoice.ts
├── correspondence.ts  # subtype-aware schemas
└── index.ts
```

---

## 16. Reporting / Dashboard Requirements

### Commercial Dashboard Data

The `commercial.dashboard.summary` procedure returns:

```typescript
{
  registerSummary: {
    ipa: { total, byStatus: Record<string, number> },
    ipc: { total, byStatus: Record<string, number> },
    variation: { total, byStatus: Record<string, number>, bySubtype: Record<string, number> },
    costProposal: { total, byStatus: Record<string, number> },
    taxInvoice: { total, byStatus: Record<string, number> },
    correspondence: { total, byStatus: Record<string, number>, bySubtype: Record<string, number> },
  },
  financialSummary: {
    totalClaimed: Decimal,       // Sum of IPA netClaimed where approved+
    totalCertified: Decimal,     // Sum of IPC netCertified where signed+
    totalInvoiced: Decimal,      // Sum of TaxInvoice totalAmount where issued+
    totalVariationExposure: Decimal,  // Sum of Variation costImpact where approved_internal+
  },
  pendingApprovals: number,      // Records awaiting current user's workflow action
  recentActivity: AuditLogEntry[], // Last 10 commercial audit entries
  clientSubmissions: {            // All issued records, most recent first
    items: Array<{ type, referenceNumber, title, amount, issuedAt, status }>,
    total: number,
  },
  varianceAnalytics: {            // Addendum A — submitted vs approved deltas
    ipaVariance: {
      totalSubmitted: Decimal,    // Sum IPA.netClaimed (approved+ status)
      totalCertified: Decimal,    // Sum IPC.netCertified (signed+ status)
      reductionAmount: Decimal,   // submitted - certified
      reductionPercent: number,
    },
    variationVariance: {
      totalSubmitted: Decimal,    // Sum Variation.costImpact (approved+ status)
      totalApproved: Decimal,     // Sum Variation.approvedCostImpact
      reductionAmount: Decimal,
      reductionPercent: number,
    },
    costProposalVariance: {
      totalEstimated: Decimal,    // Sum CostProposal.estimatedCost (approved+ status)
      totalApproved: Decimal,     // Sum CostProposal.approvedCost
      reductionAmount: Decimal,
      reductionPercent: number,
    },
  },
}
```

### Notification Templates

Module 2 adds notification templates for commercial workflow events:

| Template | Trigger |
|---|---|
| `commercial_submitted` | Any commercial record submitted for review |
| `commercial_approved` | Any commercial record approved |
| `commercial_rejected` | Any commercial record rejected |
| `commercial_returned` | Any commercial record returned for revision |
| `commercial_signed` | Any commercial record signed |
| `commercial_issued` | Any commercial record issued |
| `invoice_overdue` | Tax Invoice past due date |

Templates use the M1 notification system (in-app + email via BullMQ).

**Decimal serialization:** Prisma `Decimal` fields are `Prisma.Decimal` objects, not JavaScript `number`. The tRPC output schema must use a Zod `z.string()` or `z.number()` transform (e.g., `.transform(v => v.toString())`) for `Decimal` fields in the dashboard response to avoid JSON serialization errors.

---

## 17. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **Correspondence model complexity** — 4 subtypes with different post-issuance lifecycles (claim negotiation, back charge disputes) sharing one table | Medium | Base statuses are shared. Subtype-specific statuses are additive. Service-layer validation enforces which statuses are valid per subtype. If a subtype outgrows the shared model in a later module, it can be extracted to its own table without breaking the API (the router abstraction remains the same). |
| 2 | **Tax Invoice payment tracking overlap with M4** | Medium | M2 has basic manual statuses only (partially_collected, collected, overdue). No payment ledger. M4 will build the authoritative payment system and may deprecate M2's manual status in favor of ledger-derived state. |
| 3 | **Variation client-status tracking outside workflow** | Medium | Client status is a manual update via the `transition` endpoint with action `client_approved` / `client_rejected`. No workflow steps involved. This is simpler than a secondary workflow and sufficient for M2. |
| 4 | **Finance-check threshold configuration** | Low | M2 uses multiple workflow templates (standard vs with-finance). Template selection is manual (admin picks which template is active for a project). Automated threshold-based template selection is a future enhancement — M2 does not auto-switch templates. |
| 5 | **Schema migration size** | Low | One migration, all additive. 6 new tables + 1 counter table + enums. No changes to M1 tables. |
| 6 | **Role-permission matrix accuracy** | Low | Matrix derived from locked ownership + workflow paths. Flagged for Ahmed's confirmation before implementation. |
| 7 | **Reference number concurrency** | Low | `ReferenceCounter` uses `@@unique([projectId, typeCode])` and is incremented in the same transaction as the record update. Prisma's `update` with `increment` is atomic. |

---

## 18. Definition of Done for Module 2

Module 2 is **done** when:

1. All 6 Prisma models created with correct fields, enums, indexes, and relationships.
2. All status transitions validated at the service layer — invalid transitions rejected.
3. All 7 posting events registered and firing at the correct status transitions.
4. All ~12 workflow templates seeded and functional.
5. All 50 permission codes seeded with correct role mappings.
6. All 13 screens functional with correct RBAC gating.
7. Commercial dashboard shows all 10 sections with real data (including variance analytics).
8. Reference number generation is atomic and sequential per project per type.
9. IPC creation gated: parent IPA must be in `approved_internal` or later status.
10. Tax Invoice creation gated: parent IPC must be in `signed` or later status.
11. Document attachment linking works for all commercial records.
12. Notification templates seeded and firing on workflow events.
13. All M1 invariants upheld: project isolation, audit logging, signed immutability, posting idempotency.
14. TypeScript clean: 0 errors across all packages.
15. Test coverage: critical E2E scenarios for each record type lifecycle, permission deny suite for commercial procedures, posting event verification.
16. CDK staging/production stacks stamped (if confirmed in scope).
17. Role-permission matrix matches the confirmed matrix in §12.

---

## 19. Extension Points for Module 3+

| Extension Point | Used By |
|---|---|
| Posting events with amount/currency/exposure type | Module 4 — builds receivable ledger from M2 events |
| `Variation` model | Module 3 — procurement workflows may reference VOs |
| `Correspondence` subtype enum | Module 3+ — new subtypes can be added |
| `TaxInvoice` model | Module 4 — adds payment receipt tracking |
| `ReferenceCounter` | All future modules — shared numbering service |
| Commercial permission codes | All modules — RBAC grows additively |
| Commercial workflow templates | All modules — new templates can be added |
| Variance analytics functions (Addendum A) | Module 4/5 — exported from dashboard service for reuse in cost analytics |
| Assessment fields on Variation/CostProposal (Addendum A) | Module 4 — three-stage value tracking feeds budget variance reports |
| Advanced filter/sort infrastructure (Addendum A) | All modules — same `<RegisterFilterBar>` component reusable for M3+ registers |

---

## Appendix A: Minor Open Items Resolved in This Spec

| Item | Resolution |
|---|---|
| PDF generation | Deferred — not in M2 scope. Screens only. |
| CDK staging/production stacks | In scope — per frozen spec. Stamped from M1 dev stack. |
| Executive Approver trigger | Handled via high-value template variants. No auto-selection in M2. |
| Reference number format | `{ProjectCode}-{TypeCode}-{NNN}` — auto-generated, project-scoped. |
| Client acknowledgment | Variation has explicit client statuses. Other types track via `issued` + metadata. |
| Contract value tracking | On-the-fly from posting events. No stored field in M2. |
| IPA/VO line items | Single summary records in M2. Line items are a future enhancement. |
| Cost breakdown structure | Free-form text in M2. |
| VAT rate | Configurable per entity, defaulting to 15%. Stored per invoice. |
| Enum values | Defined in §14 schema (NoticeType, ClaimType, BackChargeCategory, LetterType, VariationInitiatedBy). |
| Document attachments | Supported via M1's existing `recordType` + `recordId` on Document model. |
| Internal comments | Use workflow step `comment` field. Dedicated thread is future enhancement. |
| Client submission history | Section on commercial dashboard, not separate screen. |
| Cross-project commercial view | Deferred to Module 5. |
| Receivable aging | Deferred to Module 4. |
| Full role-permission matrix | Derived in §12, flagged for Ahmed's confirmation. |
| Consultant assessment fields | Addendum A — 4 new nullable fields on Variation, 4 on CostProposal. Three-stage value tracking: submitted → assessed → approved. |
| Advanced register filters | Addendum A — multi-status, date range, amount range, creator, column sorting, localStorage saved views, dashboard drilldown. |
| Document-type filters | Addendum A — client-side file-type filter on detail view attachment panels. |
| Variance analytics dashboard section | Addendum A — IPA, Variation, and CostProposal submitted-vs-approved variance with reduction percentages. |
| Procurement/cost items frozen | Addendum B — 7 items (procurement categories, spend dashboards, vendor analytics, etc.) formally frozen for M3–M5. |
