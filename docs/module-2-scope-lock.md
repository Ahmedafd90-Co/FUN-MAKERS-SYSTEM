# Module 2 — Commercial / Contracts Engine — Scope Lock

**Date:** 2026-04-10
**Status:** LOCKED — all critical and secondary decisions resolved
**Prerequisite:** Module 1 signed off (`b9de91a`)
**Next step:** Module 2 design spec (not started)

> This document is the frozen input for the Module 2 design spec.
> All decisions were made by Ahmed Al-Dossary on 2026-04-10.
> Minor open items (marked MINOR OPEN) can be resolved during spec writing.

---

## 1. Data Model — 6 Prisma Models

### LOCKED

10 logical commercial record types collapse into 6 Prisma models:

| # | Model | Subtypes | Description |
|---|-------|----------|-------------|
| 1 | **IPA** | — | Interim Payment Application — internal claim/submission |
| 2 | **IPC** | — | Interim Payment Certificate — certified value basis |
| 3 | **Variation** | `vo`, `change_order` | VO + Change Order family |
| 4 | **CostProposal** | — | Standalone costing record, optionally linked to Variation |
| 5 | **TaxInvoice** | — | VAT invoice, linked to IPC |
| 6 | **Correspondence** | `letter`, `notice`, `claim`, `back_charge` | Shared correspondence engine |

### LOCKED — Cardinality

| Relationship | Cardinality | Rule |
|---|---|---|
| IPA → IPC | 1:N | One IPA may produce zero, one, or many IPCs (revised or follow-on certifications). Each IPC links to exactly one parent IPA. UI presents as primary 1:1 flow; schema allows 1:N for history/control. |
| IPC → TaxInvoice | 1:N | One IPC may produce zero, one, or many Tax Invoices (split billing, corrections). Each Tax Invoice links to exactly one parent IPC. UI assumes 1:1 common path; schema allows 1:N safely. |
| CostProposal → Variation | N:1 (optional) | Cost Proposal may optionally link to a Variation. Multiple cost proposals can link to the same variation (revisions). Link is nullable — cost proposals can exist independently. |
| Correspondence (notice → claim) | Optional parent link | Claims may optionally reference a parent correspondence (notice) via `parentCorrespondenceId`. Not required. |

### LOCKED — Subtype Field Strategy

- **Shared base tables** with explicit `subtype` enum plus **nullable subtype-specific columns** where the extra fields are limited and operationally important
- Do **not** use JSON as the primary strategy for core business fields
- Do **not** use extension tables in Module 2 unless a subtype becomes structurally too different
- Start practical, normalized, and readable
- If later growth makes a subtype too specialized, extension tables can be introduced without breaking the family model

### LOCKED — Back Charge Target

Free-text `targetName` field on the Correspondence model for back charge subtype. Full subcontractor model arrives in Module 3.

---

## 2. Excluded / Deferred

### LOCKED

| Excluded from M2 | Goes to |
|---|---|
| Procurement (RFQ, PO, supplier invoices, equipment) | Module 3 |
| Subcontractor management (full model) | Module 3 |
| Budget, cost codes, allocations | Module 4 |
| Cashflow forecasting | Module 4 |
| Full receivables ledger/reporting engine | Module 4 |
| KPI dashboards, PMO rollups | Module 5 |
| Contract parsing, OCR, AI extraction | Module 6 |
| Agent layer | Module 7 |
| Visual workflow designer | Module 7+ |
| Real e-signature provider (DocuSign, Adobe Sign) | Post-M2 |
| Arabic/RTL | Post-M3 |
| Client portal / external access | Never (internal-only) |
| Conditional workflow branching | Not in M2 |
| **ZATCA integration** (API, QR, XML, clearance, reporting) | **Deferred** — M2 supports tax invoice records, fields, status, and control logic only. No ZATCA-specific integration. |
| **PDF generation** | **MINOR OPEN** — not locked as in or out. Can be decided during spec. |
| **Staging/production CDK stacks** | **MINOR OPEN** — frozen spec says "stamped during Module 2." Assumed in scope unless Ahmed defers. |

---

## 3. Record Ownership

### LOCKED

| Record / Subtype | Primary Creator |
|---|---|
| IPA | QS / Commercial |
| IPC | QS / Commercial |
| Variation (vo) | Commercial / Contracts |
| Variation (change_order) | Commercial / Contracts |
| Cost Proposal | Commercial |
| Tax Invoice | Commercial / Finance |
| Correspondence (letter) | Originator department — controlled under commercial/contracts rules if client-facing |
| Correspondence (notice) | Contracts / Commercial |
| Correspondence (claim) | Contracts / Commercial |
| Correspondence (back_charge) | Contracts / Commercial |

---

## 4. Lifecycle Statuses

### LOCKED

#### IPA

`draft` → `submitted` → `under_review` → `returned` → `rejected` → `approved_internal` → `signed` → `issued` → `superseded` → `closed`

| Status | Terminal? |
|---|---|
| `draft` | No |
| `submitted` | No |
| `under_review` | No |
| `returned` | No (goes back to draft/edit) |
| `rejected` | Yes |
| `approved_internal` | No |
| `signed` | No |
| `issued` | No (can be superseded) |
| `superseded` | Yes |
| `closed` | Yes |

#### IPC

`draft` → `submitted` → `under_review` → `returned` → `rejected` → `approved_internal` → `signed` → `issued` → `superseded` → `closed`

Same status set as IPA. Finance check is mandatory (enforced by workflow template).

#### Variation Family

Base statuses shared by `vo` and `change_order` subtypes:

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `signed` | No | |
| `issued` | No | |
| `client_pending` | No | After issue, awaiting client response |
| `client_approved` | No | Client accepted |
| `client_rejected` | Yes | Client rejected |
| `superseded` | Yes | |
| `closed` | Yes | |

Client-status tracking happens after issue. Not all variations go to client (internal change orders may not).

#### Cost Proposal

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `submitted` | No | |
| `under_review` | No | |
| `returned` | No | |
| `rejected` | Yes | |
| `approved_internal` | No | |
| `issued` | No | |
| `linked_to_variation` | No | Linked to a VO/CO for tracking |
| `superseded` | Yes | Replaced by revised proposal |
| `closed` | Yes | |

#### Tax Invoice

| Status | Terminal? | Notes |
|---|---|---|
| `draft` | No | |
| `under_review` | No | Finance review mandatory |
| `approved_internal` | No | |
| `issued` | No | Posting fires here |
| `submitted` | No | Sent to client/authority |
| `partially_collected` | No | Partial payment received |
| `collected` | Yes | Fully paid |
| `overdue` | No | Past due date |
| `cancelled` | Yes | |
| `superseded` | Yes | |
| `closed` | Yes | |

Note: `partially_collected` / `collected` / `overdue` are basic payment tracking statuses. Full payment ledger is Module 4.

#### Correspondence Family

**Shared base statuses** (all subtypes):

| Status | Terminal? |
|---|---|
| `draft` | No |
| `under_review` | No |
| `returned` | No |
| `rejected` | Yes |
| `approved_internal` | No |
| `signed` | No |
| `issued` | No |
| `superseded` | Yes |
| `closed` | Yes |

**Subtype-specific additional statuses:**

| Subtype | Additional Statuses |
|---|---|
| `letter` | *(none — base set is sufficient)* |
| `notice` | `response_due`, `responded` |
| `claim` | `under_evaluation`, `partially_accepted`, `accepted`, `disputed` |
| `back_charge` | `acknowledged`, `disputed`, `recovered`, `partially_recovered` |

Subtype-specific statuses extend the base set. A claim might flow: `issued` → `under_evaluation` → `partially_accepted` → `closed`. A letter might just flow: `issued` → `closed`.

---

## 5. Workflow Paths

### LOCKED — Linear-First

Linear workflows only. Different templates per record type. Value-threshold template variations allowed. Finance-check by rule.

### LOCKED — Per Record Type

#### IPA
1. Prepare by QS/Commercial
2. PM review
3. Commercial Manager review
4. Finance check — optional by project/template rule
5. PD sign/approval — if required by template
6. Issue control — by Document Controller where used

#### IPC
1. Prepare by QS/Commercial
2. PM review
3. Commercial Manager review
4. Finance check — **mandatory**
5. PD sign — **mandatory**
6. Issue control / controlled copy

#### Variation / Change Order
1. Prepare by Commercial
2. PM review
3. Contracts review
4. Finance check — by threshold/rule
5. PD approval/sign
6. Client status tracked separately after issue

#### Cost Proposal
1. Prepare by Commercial
2. PM review — optional by project rule
3. Contracts/Commercial review
4. Finance check — optional by threshold/rule
5. PD approval — optional by threshold/rule
6. No posting by default

#### Tax Invoice
1. Prepare by Commercial/Finance
2. Finance review — **mandatory**
3. PD sign — optional by project rule (if internal policy requires)
4. Issue — **mandatory** before posting receivable due

#### Correspondence (subtype-specific templates)

**Letter:**
Originator → Manager/Contracts review → PD sign if needed → Issue

**Notice:**
Originator/Commercial → Contracts review → PD sign → Issue

**Claim:**
Commercial/Contracts → Contracts review → Finance optional → PD sign → Issue

**Back Charge:**
Commercial/Contracts → PM review → Finance check → PD sign → Issue

### LOCKED — Executive Approver

**MINOR OPEN** — exact trigger rules not yet locked. Options remain: value threshold, specific record types, or override-only. Can be decided during spec. The M1 workflow engine supports multiple templates per record type, so a "high-value" template variant with an Executive Approver step is straightforward.

### LOCKED — VO Workflow Split

Client status is tracked **separately after issue** — not as part of the approval workflow. The internal approval workflow handles everything up to and including issuance. Client response (`client_pending` → `client_approved` / `client_rejected`) is a manual status update or a lightweight secondary workflow, not embedded in the primary approval chain.

---

## 6. Finance-Check Rules

### LOCKED

| Record / Subtype | Finance Check | Rule |
|---|---|---|
| IPC | **Mandatory** | Always |
| Tax Invoice | **Mandatory** | Always |
| Back Charge | **Mandatory** | Always |
| Variation / Change Order | **Mandatory by threshold/rule** | Finance check step included when value exceeds configured threshold |
| IPA | **Optional by project/template rule** | Project or template configuration determines if finance check is required |
| Cost Proposal | **Optional by threshold/rule** | Included when value exceeds configured threshold |
| Letter | **Not mandatory** | Unless configured by template |
| Notice | **Not mandatory** | Unless configured by template |
| Claim | **Not mandatory by default** | Unless configured by template |

Finance checks are implemented as workflow steps in the template. "Optional by rule" means the system supports templates with and without the finance step — the project or admin configuration determines which template is active.

---

## 7. Sign / Issue Rules

### LOCKED

| Record / Subtype | Sign Rule | Issue Control |
|---|---|---|
| IPA | Optional — by project/template rule | Controlled when externally submitted |
| IPC | **Mandatory** | Controlled copy |
| Variation / Change Order | **Mandatory** — before controlled issue | Controlled |
| Cost Proposal | Optional — by threshold/template | — |
| Tax Invoice | By rule (project policy) | **Mandatory** — must be issued before posting |
| Letter | By template/rule | Controlled if client-facing |
| Notice | **Mandatory** | Controlled |
| Claim | **Mandatory** | Controlled |
| Back Charge | **Mandatory** | Controlled |

### MINOR OPEN

**Reference number format** — not yet locked. Proposed: `{ProjectCode}-{TypeCode}-{NNN}` (e.g., PROJ01-IPA-001). Can be decided during spec.

**Client acknowledgment tracking** — not yet locked. Variation model has `client_pending` / `client_approved` / `client_rejected` statuses. Whether other record types track client response can be decided during spec.

---

## 8. Posting Trigger Rules

### LOCKED

| Event Type | Fires When | Exposure Type |
|---|---|---|
| `IPA_APPROVED` | IPA → `approved_internal` | Claimed exposure (receivable pipeline) |
| `IPC_SIGNED` | IPC → `signed` | Certified receivable value |
| `VARIATION_APPROVED_INTERNAL` | Variation → `approved_internal` | Pending commercial exposure |
| `VARIATION_APPROVED_CLIENT` | Variation → `client_approved` | Approved contract/revenue uplift |
| `TAX_INVOICE_ISSUED` | TaxInvoice → `issued` | Receivable due bucket |
| `CLAIM_ISSUED` | Correspondence (claim) → `issued` | Claim exposure |
| `BACK_CHARGE_ISSUED` | Correspondence (back_charge) → `issued` | Recovery exposure |

**No posting:** Cost Proposal, Letter, Notice (unless subtype-specific logic applies later).

### LOCKED — Contract Value Tracking

**MINOR OPEN** — options: stored field on Project updated by posting events, on-the-fly calculation, or deferred to M4. Can be decided during spec.

### LOCKED — Event Naming

Event type codes above are proposed. Final naming confirmed during spec. The Variation events carry `subtype` in their payload to distinguish VO from Change Order.

---

## 9. Receivable / Inflow Linkage

### LOCKED

- Receivable **posting hooks are included** in Module 2
- Full receivables **ledger/reporting engine remains Module 4**
- Module 2 writes posting events and **minimal commercial receivable exposure records** as needed by the posting architecture
- Do **not** build a full receivables management subsystem in Module 2

**Implication:** M2 fires the 7 posting events above. Each event carries amount, currency, project, and exposure type. M4 will consume these events to build the receivable ledger. M2 may optionally store a lightweight exposure summary (derived from posting events) for the commercial dashboard, but the authoritative receivable state lives in M4.

Tax Invoice has `partially_collected` / `collected` / `overdue` statuses for basic payment tracking on the invoice itself. Full payment matching and cashflow tracking is M4.

---

## 10. Forms and Key Fields

### LOCKED — Strategy

- Shared base tables with `subtype` enum + nullable subtype-specific columns
- No JSON for core business fields
- No extension tables in M2
- All records project-scoped (`projectId` FK)
- Standard audit fields on all models
- Decimal for money, currency from M1 reference data

### LOCKED — Per Model

**IPA**
periodNumber, periodFrom, periodTo, grossAmount, retentionRate, retentionAmount, previousCertified, currentClaim, advanceRecovery, otherDeductions, netClaimed, currency, description

**IPC**
ipaId (FK — required), certifiedAmount, retentionAmount, adjustments, netCertified, certificationDate, currency, remarks

**Variation** (shared base)
subtype (enum: `vo`, `change_order`), title, description, reason, costImpact, timeImpactDays, currency

Variation (vo-specific — nullable):
initiatedBy, contractClause

Variation (change_order-specific — nullable):
parentVariationId (FK, nullable — link to originating VO), originalContractValue, adjustmentAmount, newContractValue, timeAdjustmentDays

**CostProposal**
variationId (FK, nullable), revisionNumber, estimatedCost, estimatedTimeDays, methodology, costBreakdown, currency

**TaxInvoice**
ipcId (FK — required), invoiceNumber (auto-generated), invoiceDate, grossAmount, vatRate, vatAmount, totalAmount, dueDate, currency, buyerName, buyerTaxId, sellerTaxId

**Correspondence** (shared base)
subtype (enum: `letter`, `notice`, `claim`, `back_charge`), subject, body, recipientName, recipientOrg, currency (nullable — only for financial subtypes), parentCorrespondenceId (FK, nullable — for notice→claim linking)

Correspondence (notice-specific — nullable):
noticeType, contractClause, responseDeadline

Correspondence (claim-specific — nullable):
claimType, claimedAmount, claimedTimeDays, settledAmount, settledTimeDays, contractClause

Correspondence (back_charge-specific — nullable):
targetName, category, chargedAmount, evidenceDescription

Correspondence (letter-specific — nullable):
letterType, inReplyToId (FK to self, nullable)

### MINOR OPEN

**IPA/VO line items** — Does IPA or VO have itemized breakdown tables? Or single summary? Can be decided during spec.

**Cost breakdown structure** — Structured or free-form? Can be decided during spec.

**VAT rate** — Always 15% or configurable? Can be decided during spec. Proposed: configurable per entity/project, defaulting to 15%.

**Enum values** — Exact values for letterType, noticeType, claimType, backChargeCategory, initiatedBy. Can be decided during spec.

**Document attachments** — All commercial records support linking to M1 documents via `recordType` + `recordId`. Assumed yes (M1 Document model already has these fields).

**Internal comments** — Comments thread per record vs workflow step comments. Can be decided during spec.

---

## 11. Screens

### LOCKED

**Navigation model:**
- One Commercial home/register
- Separate registers for: IPA, IPC, Variations, Cost Proposals, Tax Invoices, Correspondence
- Correspondence register filters by subtype
- Detail screens are family-based (one Variation detail, one Correspondence detail — with subtype behavior)
- Do not create four separate correspondence screens if one family register/detail handles it cleanly

**Screen inventory:**

| Screen | Count |
|---|---|
| Commercial Dashboard / Register Home | 1 |
| IPA List + Detail | 2 |
| IPC List + Detail | 2 |
| Variation List + Detail (subtype tabs/filter) | 2 |
| Cost Proposal List + Detail | 2 |
| Tax Invoice List + Detail | 2 |
| Correspondence List + Detail (subtype tabs/filter) | 2 |
| Client Submission History | 1 |
| **Total** | **14** |

### MINOR OPEN

**Client submission history format** — Separate screen (listed above) or dashboard section. Can be decided during spec.

**Cross-project commercial view** — Not locked. Likely deferred to Module 5 (KPI/PMO). Can be decided during spec.

---

## 12. Dashboards / Reports

### LOCKED — Minimum Dashboard Content

| Card / Section | Content |
|---|---|
| Commercial register summary | High-level counts and totals across all commercial record types |
| IPA pipeline summary | Active IPAs, status distribution, total claimed |
| IPC certified summary | Certified totals, pending certification |
| Variation exposure summary | Pending VOs, approved changes, total cost impact |
| Tax invoice summary | Issued, submitted, collected, overdue |
| Correspondence/claim/back-charge summary | Open items by subtype |
| Client submission history | All records issued to client, across types |
| Pending approvals | Records awaiting the current user's action |
| Claimed vs certified vs invoiced | High-level financial summary |

### MINOR OPEN

**Receivable aging** — Whether 0-30/31-60/61-90/90+ days breakdown appears on M2 dashboard or is a Module 4 concept. Can be decided during spec.

---

## 13. Permissions

### LOCKED — Strategy

- **Record-family level** permissions, not per-subtype
- Subtype-specific behavior controlled by **workflow templates and UI rules**, not separate permissions
- No permission explosion in Module 2

### LOCKED — Permission Codes

| Resource | Actions |
|---|---|
| `ipa` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `ipc` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `variation` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `cost_proposal` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `tax_invoice` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `correspondence` | `view`, `create`, `edit`, `submit`, `review`, `approve`, `sign`, `issue` |
| `commercial_dashboard` | `view` |
| `client_submission_history` | `view` |

### MINOR OPEN

**Full role-permission matrix** — needs to be filled in. The 14 roles × 6 record families × 8 actions matrix. Can be completed during spec or as a focused decision pass. The record ownership (§3) and workflow paths (§5) strongly imply the matrix — spec writing can derive a proposal for Ahmed to confirm.

---

## 14. Risks and Non-Goals

### LOCKED NON-GOALS

| Item | Reason |
|---|---|
| Procurement workflows | Module 3 |
| Budget/cost/cashflow | Module 4 |
| Full receivables ledger | Module 4 |
| KPI dashboards | Module 5 |
| Client portal | Internal-only |
| Conditional workflow branching | Not in M2 |
| ZATCA API integration | Deferred |
| Multi-currency conversion | M2 stores currency; conversion is M4 |
| AI/OCR features | Module 6-7 |
| Approval delegation | Enhancement |
| Batch operations | Enhancement |
| Historical data import | Outside platform |

### RISKS

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Correspondence shared model complexity — 4 subtypes with different post-issuance lifecycles | Medium | Base statuses are shared; subtype-specific statuses are additive. Claims have the most complex post-issuance flow. |
| 2 | Tax Invoice payment tracking overlap with M4 | Medium | M2 has basic statuses (partially_collected, collected, overdue). M4 builds full payment ledger. Clear boundary. |
| 3 | Variation client-status tracking outside workflow | Medium | Client status is a manual update or lightweight secondary workflow after issue. Design spec must specify the exact mechanism. |
| 4 | Finance-check "by threshold/rule" needs configuration model | Low | M1 workflow supports multiple templates per record type. Threshold logic lives in template selection, not engine branching. |
| 5 | Schema migration size — 6 new models + many fields | Low | All additive (new tables). No destructive changes to M1 tables. |
| 6 | Role-permission matrix not yet filled | Low | Implied by ownership + workflow paths. Derive during spec, confirm with Ahmed. |

---

## Decision Summary

### All Critical and Secondary Decisions — RESOLVED

| # | Decision | Answer | Source |
|---|----------|--------|--------|
| 1 | IPA vs IPC | Separate records, separate models | LCD-1 |
| 2 | Tax Invoice trigger | After IPC certified/signed | LCD-2 |
| 3 | VO vs Change Order | One Variation model with subtypes | LCD-3 |
| 4 | Cost Proposal role | Standalone record, optionally linked | LCD-4 |
| 5 | Correspondence model | One shared engine, 4 subtypes | LCD-5 |
| 6 | Posting triggers | 7 events locked, 3 no-post | LCD-6 |
| 7 | Workflow model | Linear-first, no conditional branching | LCD-7 |
| 8 | IPA → IPC cardinality | 1:N (UI 1:1, schema 1:N) | Pass 2 |
| 9 | IPC → Tax Invoice cardinality | 1:N (UI 1:1, schema 1:N) | Pass 2 |
| 10 | ZATCA scope | Deferred — M2 records only | Pass 2 |
| 11 | Receivable table | Posting hooks in M2, full ledger M4 | Pass 2 |
| 12 | Subtype field strategy | Nullable columns on shared table | Pass 2 |
| 13 | Workflow steps per type | All 10 types locked | Pass 2 |
| 14 | Status models | All 6 models locked with subtype extensions | Pass 2 |
| 15 | Finance-check rules | 3 mandatory, 3 by rule, 3 not default | Pass 2 |
| 16 | Sign/issue rules | Per type — 5 mandatory, rest by rule | Pass 2 |
| 17 | Record creators | All 10 types locked | Pass 2 |
| 18 | Screen model | 14 screens, family-based detail | Pass 2 |
| 19 | Dashboard content | 9 minimum sections locked | Pass 2 |
| 20 | Permission granularity | Record-family level, not per-subtype | Pass 2 |
| 21 | Permission codes | 8 resources × 8 actions + 2 view-only | Pass 2 |

### Minor Open Items (resolvable during spec)

| Item | Section |
|---|---|
| PDF generation scope | §2 |
| CDK staging/production stacks | §2 |
| Executive Approver trigger rules | §5 |
| Reference number format | §7 |
| Client acknowledgment tracking | §7 |
| Contract value tracking mechanism | §8 |
| IPA/VO line items | §10 |
| Cost breakdown structure | §10 |
| VAT rate configurability | §10 |
| Enum values | §10 |
| Document attachments | §10 |
| Internal comments model | §10 |
| Client submission history format | §11 |
| Cross-project commercial view | §11 |
| Receivable aging on dashboard | §12 |
| Full role-permission matrix | §13 |
