# Module 2 — Commercial / Contracts Engine — Scope Lock

**Date:** 2026-04-10
**Status:** 7 critical decisions LOCKED — remaining decisions open for review
**Prerequisite:** Module 1 signed off (`b9de91a`)

---

## How to Read This Document

- **LOCKED** — decided by Ahmed. Not open for change.
- **CONFIRMED** — from frozen spec or M1 architecture.
- **PROPOSED** — my suggestion. May be wrong. Ahmed corrects.
- **NEEDS DECISION** — Ahmed must answer.

---

## Locked Critical Decisions

These 7 decisions were locked by Ahmed on 2026-04-10. They govern the entire Module 2 data model and architecture.

### LCD-1: IPA vs IPC — Separate Records

> IPA = our commercial application / claim / submission record prepared internally and issued from our side.
> IPC = our certified / validated commercial certificate record after internal review and finance check, used as the certified value basis.
> They are separate record types and must remain separate in Module 2.

**Implication:** Two separate Prisma models, two separate tRPC sub-routers, two separate workflow templates, two separate screen pairs (list + detail).

### LCD-2: Tax Invoice Trigger

> Tax invoice is not triggered from draft IPA.
> Tax invoice should be created after the relevant certified/commercial trigger.
> Default trigger: after IPC reaches the approved/signed certified state.
> Tax invoice remains a separate record type, but linkable to the relevant IPC and contract.

**Implication:** Tax Invoice has `ipcId` FK. Tax Invoice creation is gated: an IPC must be in certified/signed state before a Tax Invoice can be drafted from it.

### LCD-3: VO + Change Order = One Family with Subtypes

> Treat VO and Change Order as one commercial family with subtype.
> Use one engine/register family with subtype values: VO, Change Order.
> Keeps the model cleaner while allowing different statuses or rules later.

**Implication:** One Prisma model (`Variation`) with a `subtype` enum (`vo`, `change_order`). One tRPC sub-router with subtype-aware queries. Shared workflow logic, subtype-specific rules layered on top.

### LCD-4: Cost Proposal = Standalone Record

> Cost Proposal is a standalone supporting commercial record in the pre-VO / pre-Change Order stage.
> It is not the same as VO approval.
> It may later link to a VO / Change Order, but it should remain its own record type.

**Implication:** Separate Prisma model. Optional `variationId` FK (nullable — can exist without a linked VO/CO). Own workflow. Own screens.

### LCD-5: Correspondence = One Shared Engine with Subtypes

> Use one shared correspondence engine with subtype, not separate engines.
> Subtypes: Letter, Notice, Claim, Back Charge.
> Share common numbering, versioning, workflow, sign, issue, and history logic.
> Allow subtype-specific statuses and rules.

**Implication:** One Prisma model (`Correspondence`) with a `subtype` enum (`letter`, `notice`, `claim`, `back_charge`). Shared base fields + subtype-specific fields (nullable or JSON). One tRPC sub-router with subtype filtering. Shared workflow template structure with subtype-specific variants.

### LCD-6: Posting Trigger Points

> Locked baseline posting triggers:
> - IPA → post on internal approval (claimed exposure)
> - IPC → post on sign (certified receivable value)
> - VO/CO internal approval → post pending commercial exposure
> - VO/CO client-approved → post approved contract/revenue uplift
> - Tax Invoice → post on issue (receivable due bucket)
> - Claim → post on issue (claim exposure)
> - Back Charge → post on issue (recovery exposure)
> - Cost Proposal → no financial posting by default
> - General Letter / Notice → no financial posting by default

**Implication:** 8 posting event types to register. Each event has a Zod payload schema. Events carry exposure/receivable classification for downstream M4 consumption.

### LCD-7: Linear Workflows First

> Keep workflows primarily linear for Module 2.
> Do not introduce heavy conditional branching.
> Allowed: different templates by record type, value-threshold variations, finance-check required/not-required by rule.
> Linear-first is locked.

**Implication:** M1 workflow engine is used as-is. Multiple templates per record type (e.g., standard vs high-value) to handle threshold variations. No engine extension needed.

---

## 1. Record Model (Post-Decisions)

### LOCKED — 6 Data Models

Ahmed's decisions collapse 10 logical record types into 6 Prisma models:

| # | Model Name | Subtypes | Description |
|---|------------|----------|-------------|
| 1 | **IPA** | — | Interim Payment Application |
| 2 | **IPC** | — | Interim Payment Certificate (linked to IPA) |
| 3 | **Variation** | `vo`, `change_order` | VO + Change Order family |
| 4 | **CostProposal** | — | Standalone costing record (optionally linked to Variation) |
| 5 | **TaxInvoice** | — | VAT invoice (linked to IPC) |
| 6 | **Correspondence** | `letter`, `notice`, `claim`, `back_charge` | Shared correspondence engine |

### LOCKED — Record Relationships

```
IPA ──────→ IPC (IPA must exist and be approved before IPC is drafted)
IPC ──────→ TaxInvoice (IPC must be certified/signed before Tax Invoice is drafted)
CostProposal ──→ Variation (optional link — may exist independently)
Correspondence (notice) ──→ Correspondence (claim) (optional link — claims may reference a prior notice)
```

### NEEDS DECISION (remaining)

**D-1.1: IPA → IPC cardinality**
- A) One IPA produces exactly one IPC (1:1)
- B) One IPA can produce multiple IPCs (1:N)
- C) Other

**D-1.2: IPC → Tax Invoice cardinality**
- A) One IPC produces exactly one Tax Invoice (1:1)
- B) One IPC can produce multiple Tax Invoices (1:N)
- C) Other

**D-1.3: Correspondence cross-subtype linking**
Should claims be linkable to a prior notice within the correspondence model?
- A) Yes — optional `parentCorrespondenceId` FK for linking notice → claim
- B) No — they're independent records even within the shared model

**D-1.4: Back Charge target in M2**
Subcontractor management is Module 3. For M2 back charges:
- A) Free-text `targetName` field on the correspondence record
- B) Minimal reference table (just name + code)

---

## 2. Excluded / Deferred

### CONFIRMED

| Excluded from M2 | Goes to |
|---|---|
| Procurement (RFQ, PO, supplier invoices, equipment) | Module 3 |
| Subcontractor management (full model) | Module 3 |
| Budget, cost codes, allocations | Module 4 |
| Cashflow forecasting | Module 4 |
| KPI dashboards, PMO rollups | Module 5 |
| Contract parsing, OCR, AI extraction | Module 6 |
| Agent layer | Module 7 |
| Visual workflow designer | Module 7+ |
| Real e-signature provider (DocuSign, Adobe Sign) | Post-M2 |
| Arabic/RTL | Post-M3 |
| Client portal / external access | Never (internal-only system) |
| Conditional workflow branching | Locked out of M2 (LCD-7) |

### NEEDS DECISION

**D-2.1: ZATCA e-invoicing scope**
- A) ZATCA Phase 1 fields on Tax Invoice (minimum compliance)
- B) Full Phase 2 integration (complex — XML submission + QR code)
- C) Internal records only — all ZATCA compliance deferred

**D-2.2: PDF generation**
- A) PDF export for all issued commercial documents
- B) PDF for Tax Invoices only
- C) Screens only — PDF deferred

**D-2.3: Staging/production CDK stacks**
Frozen spec says "stamped during Module 2." Confirm still in scope.

**D-2.4: Payment tracking**
- A) M2 allows marking invoices as paid (basic)
- B) All payment tracking is Module 4
- C) M2 records payment date as metadata only

---

## 3. Record Ownership by Department

### CONFIRMED

- 14 roles fixed from M1
- All records project-scoped
- All mutations write audit logs

### NEEDS DECISION

**D-3.1: Who creates each record type?**

| Record / Subtype | Primary Creator(s)? |
|---|---|
| IPA | ? |
| IPC | ? |
| Variation (vo) | ? |
| Variation (change_order) | ? |
| Cost Proposal | ? |
| Tax Invoice | ? |
| Correspondence (letter) | ? |
| Correspondence (notice) | ? |
| Correspondence (claim) | ? |
| Correspondence (back_charge) | ? |

---

## 4. Lifecycle Statuses

### CONFIRMED

- All records have a `status` field
- Terminal statuses cannot be reopened (M1 pattern)
- Signed/issued records are immutable (M1 invariant)
- Posting fires at specific status transitions (LCD-6)

### NEEDS DECISION

For each model, confirm or correct the proposed statuses. Note: the Variation and Correspondence families may have **shared base statuses** with **subtype-specific additions**.

**D-4.1: IPA lifecycle**

Proposed: `draft` → `submitted` → `under_review` → `finance_check` → `approved` → `issued`

Questions:
- Is `finance_check` a separate status or part of `under_review`?
- Is `issued` terminal, or can an issued IPA be superseded?
- Revised IPA for same period: superseded status, cancelled, or edit-in-place?

**D-4.2: IPC lifecycle**

Proposed: `draft` → `under_review` → `finance_check` → `certified` → `issued`

Questions:
- Are `certified` and `issued` two separate steps?
- Can an IPC be rejected back to IPA revision?

**D-4.3: Variation lifecycle**

This model has subtypes (vo, change_order). Statuses may differ.

Proposed for **vo** subtype:
`draft` → `submitted` → `under_review` → `costing` → `approved_internal` → `submitted_to_client` → `approved_client` → `executed`

Proposed for **change_order** subtype:
`draft` → `under_review` → `approved` → `executed`

Questions:
- Is `costing` a VO status, or does costing happen outside the VO lifecycle?
- Are internal and client approval two distinct stages?
- Does `executed` mean the variation is contractually binding?
- Do both subtypes share the same status set with some statuses unused by one subtype? Or distinct status sets?

**D-4.4: Cost Proposal lifecycle**

Proposed: `draft` → `submitted` → `under_review` → `approved` → `submitted_to_client` → `accepted`

Questions:
- When rejected, does a revision replace it (`superseded` status)?

**D-4.5: Tax Invoice lifecycle**

Proposed: `draft` → `under_review` → `approved` → `issued`

Questions:
- `paid` status in M2? Or Module 4?
- `void` status for cancelled-after-issue (credit note)?

**D-4.6: Correspondence lifecycle**

This model has subtypes (letter, notice, claim, back_charge). The shared engine should have a base status set, with subtype-specific extensions.

Proposed **shared base** statuses:
`draft` → `submitted` → `under_review` → `approved` → `issued`

Proposed **subtype-specific additions**:

| Subtype | Additional Statuses? |
|---|---|
| letter | None — base set may be sufficient |
| notice | `acknowledged`, `expired`? Or terminal at `issued`? |
| claim | `submitted_to_client`, `under_negotiation`, `settled`? (extends past `issued`) |
| back_charge | `disputed`, `resolved`? |

Questions:
- Does the shared engine use one status set with some statuses only valid for certain subtypes?
- Or does each subtype get its own full status list?
- Claims have a negotiation lifecycle after issuance — how does that fit the shared model?

---

## 5. Workflow Paths

### LOCKED

- Linear workflows only (LCD-7)
- Different templates per record type allowed
- Value-threshold template variations allowed
- Finance-check required/not-required by rule

### NEEDS DECISION

**D-5.1: Workflow path per record type**

| Record / Subtype | Approval Steps (in order)? | Finance Check? | Signatory? | Issue Controller? |
|---|---|---|---|---|
| IPA | ? | ? | ? | ? |
| IPC | ? | ? | ? | ? |
| Variation (vo) | ? | ? | ? | ? |
| Variation (change_order) | ? | ? | ? | ? |
| Cost Proposal | ? | ? | ? | ? |
| Tax Invoice | ? | ? | ? | ? |
| Correspondence (letter) | ? | ? | ? | ? |
| Correspondence (notice) | ? | ? | ? | ? |
| Correspondence (claim) | ? | ? | ? | ? |
| Correspondence (back_charge) | ? | ? | ? | ? |

**D-5.2: VO — one workflow or two?**
- A) One continuous workflow covering internal approval through client submission
- B) Two separate workflows (internal approval → then separate client submission workflow)

**D-5.3: Executive Approver involvement**
- A) Only above a value threshold (what threshold?)
- B) Only for specific record types (which?)
- C) Available via override only, not in standard workflows
- D) Other

**D-5.4: Correspondence workflow sharing**
Given the shared correspondence engine (LCD-5):
- A) One workflow template for all subtypes, same steps
- B) Separate workflow template per subtype (letter template, notice template, claim template, back charge template)
- C) Shared base template with subtype-specific step additions

---

## 6. Finance-Check Rules

### CONFIRMED

- Finance and Cost Controller are separate roles (M1)
- Finance-check required/not-required by rule is allowed (LCD-7)

### PROPOSED

| Record / Subtype | Finance Check? | Proposed Checker |
|---|---|---|
| IPA | Likely yes | Finance |
| IPC | Likely yes | Finance |
| Variation (vo) | Uncertain | — |
| Variation (change_order) | Uncertain | — |
| Cost Proposal | Likely yes | Cost Controller |
| Tax Invoice | Likely yes | Finance |
| Correspondence (letter) | Likely no | — |
| Correspondence (notice) | Likely no | — |
| Correspondence (claim) | Likely yes | Cost Controller |
| Correspondence (back_charge) | Likely yes | Finance |

### NEEDS DECISION

**D-6.1:** Confirm or correct the table above.

**D-6.2:** Finance vs Cost Controller split — is the rule "Finance checks payment-related records, Cost Controller checks costing and claims"? Or different?

---

## 7. Sign / Issue Rules

### CONFIRMED

- M1 digital signing service (internal SHA-256 hash capture)
- Signed records are immutable (Prisma middleware)
- Issued records are locked

### NEEDS DECISION

**D-7.1:** Is signing required before issuance for all record types? Or can some types (e.g., informal letters) be issued without a signature?

**D-7.2: Reference number format**
- A) `{ProjectCode}-{TypeCode}-{NNN}` (e.g., PROJ01-IPA-001)
- B) Different format (specify)
- C) Manual entry

Note: With the correspondence shared engine, subtypes would use their own type code (LTR, NTC, CLM, BC).

**D-7.3: Client acknowledgment tracking**
- A) System tracks client acknowledgment as a status
- B) Client interaction is external — system records issue date only
- C) Some record types track client response, others don't (which ones?)

---

## 8. Posting Trigger Rules

### LOCKED (LCD-6)

| Event | Fires When | Exposure Type |
|---|---|---|
| `IPA_APPROVED` | IPA → internal approval | Claimed exposure |
| `IPC_SIGNED` | IPC → sign/certification | Certified receivable |
| `VARIATION_APPROVED_INTERNAL` | VO/CO → internal approval | Pending commercial exposure |
| `VARIATION_APPROVED_CLIENT` | VO/CO → client-approved | Approved contract/revenue uplift |
| `TAX_INVOICE_ISSUED` | Tax Invoice → issued | Receivable due |
| `CLAIM_ISSUED` | Claim → issued | Claim exposure |
| `BACK_CHARGE_ISSUED` | Back Charge → issued | Recovery exposure |
| *(Cost Proposal)* | No posting | — |
| *(Letter)* | No posting | — |
| *(Notice)* | No posting | — |

### NEEDS DECISION (remaining)

**D-8.1: Contract value tracking**
When a VO/CO is approved, contract value changes. Should M2:
- A) Store a `contractValue` field on Project, updated by posting events
- B) Calculate on-the-fly from VO/CO event history
- C) Defer to Module 4

**D-8.2: Posting event naming**
The locked triggers above use proposed event type names. Confirm or rename:
- `IPA_APPROVED`, `IPC_SIGNED`, `VARIATION_APPROVED_INTERNAL`, `VARIATION_APPROVED_CLIENT`, `TAX_INVOICE_ISSUED`, `CLAIM_ISSUED`, `BACK_CHARGE_ISSUED`

Note: Since VO and Change Order share the `Variation` model, the posting event carries `subtype` in its payload to distinguish them.

---

## 9. Receivable / Inflow Linkage

### CONFIRMED

- "Receivable linkage" and "posting hooks to receivables / inflow" are in M2 scope (Ahmed's message)
- Posting is the only path to financial state (M1 principle)
- Module 4 handles full budget/cost/cashflow

### NEEDS DECISION

**D-9.1: Does M2 introduce a receivable table?**
- A) Yes — posting events create receivable entries. M2 tracks basic status (outstanding/invoiced). M4 extends with payment/cashflow.
- B) No — M2 fires posting events only. M4 builds receivable ledger from events.
- C) Minimal — receivable entries created but read-only summary view. No status management until M4.

**D-9.2:** If receivable table exists, which events create entries?

| Event | Creates receivable? |
|---|---|
| IPC_SIGNED | ? |
| TAX_INVOICE_ISSUED | ? |
| CLAIM_ISSUED | ? |
| BACK_CHARGE_ISSUED | ? |

**D-9.3: Payment tracking boundary**
- A) M2 allows marking receivables/invoices as paid
- B) All payment tracking is Module 4
- C) M2 records payment date as metadata only

---

## 10. Forms and Key Fields

### CONFIRMED

- All records project-scoped (`projectId` FK)
- Standard audit fields on all records
- Decimal for money, currency from M1 reference data
- Variation model has `subtype` enum (`vo`, `change_order`)
- Correspondence model has `subtype` enum (`letter`, `notice`, `claim`, `back_charge`)

### PROPOSED — Model-Specific Fields

**IPA:** periodNumber, periodFrom, periodTo, grossAmount, retentionRate, retentionAmount, previousCertified, currentClaim, advanceRecovery, otherDeductions, netClaimed, currency, description

**IPC:** ipaId (FK), certifiedAmount, retentionAmount, adjustments, netCertified, certificationDate, currency, remarks

**Variation (shared):** subtype, title, description, reason, costImpact, timeImpactDays, currency
**Variation (vo-specific):** initiatedBy, contractClause
**Variation (change_order-specific):** variationId (FK to parent VO, optional per D-1.3 decision), originalContractValue, adjustmentAmount, newContractValue

**CostProposal:** variationId (FK, nullable), revisionNumber, estimatedCost, estimatedTimeDays, methodology, costBreakdown, currency

**TaxInvoice:** ipcId (FK), invoiceNumber, invoiceDate, grossAmount, vatRate, vatAmount, totalAmount, dueDate, currency, buyerName, buyerTaxId, sellerTaxId

**Correspondence (shared):** subtype, subject, body, recipientName, recipientOrg, currency (nullable — only for financial subtypes)
**Correspondence (notice-specific):** noticeType, contractClause, responseDeadline
**Correspondence (claim-specific):** claimType, claimedAmount, claimedTimeDays, settledAmount, settledTimeDays, contractClause
**Correspondence (back_charge-specific):** targetName (free text subcontractor), category, chargedAmount, evidenceDescription
**Correspondence (letter-specific):** letterType, inReplyToId (FK, nullable)

### NEEDS DECISION

**D-10.1: IPA line items** — Itemized breakdown table? Or single summary record?

**D-10.2: VO line items** — Individual scope items with costs? Or single summary?

**D-10.3: Cost breakdown structure** — Structured JSON (labor/materials/equipment/overhead) or free-form?

**D-10.4: VAT rate** — Always 15% or configurable per project/entity?

**D-10.5: Subtype-specific fields for Correspondence** — The shared model needs subtype-specific fields. Options:
- A) Nullable columns on the shared table (simple, some columns unused per subtype)
- B) JSON `metadata` column for subtype-specific data
- C) Separate extension tables per subtype (normalized but more complex)

**D-10.6: Subtype-specific fields for Variation** — Same question as D-10.5 but for VO vs Change Order.

**D-10.7: Enum values** — Exact values needed for: letterType, noticeType, claimType, backChargeCategory, initiatedBy. I can propose if preferred.

**D-10.8: Document attachments** — All commercial records support linking to M1 documents via `recordType` + `recordId`?

**D-10.9: Internal comments** — Comments thread per record? Or workflow step comments sufficient?

---

## 11. Screens

### CONFIRMED

- All commercial screens are project-scoped
- M1 sidebar "Commercial" placeholder becomes active
- M1 list + detail pattern per record type
- No new admin screens (M2 uses existing M1 admin)

### PROPOSED

Given the 6-model structure, proposed screens:

| Screen | Count |
|---|---|
| Commercial Dashboard | 1 |
| IPA List + Detail | 2 |
| IPC List + Detail | 2 |
| Variation List + Detail (filtered by subtype) | 2 |
| Cost Proposal List + Detail | 2 |
| Tax Invoice List + Detail | 2 |
| Correspondence List + Detail (filtered by subtype) | 2 |
| Receivable Summary (if D-9.1 = A or C) | 1 |
| **Total** | **14–15** |

Note: Variation and Correspondence list screens can filter by subtype (tabs or dropdown), so you get focused views (e.g., "VOs only" or "Claims only") without separate screens.

### NEEDS DECISION

**D-11.1: Client submission history**
Ahmed listed this in M2 scope. Is it:
- A) A separate screen showing all issued records across all types
- B) A filter/view mode on each list screen
- C) A section on the commercial dashboard
- D) Something else

**D-11.2: Cross-project commercial view**
- A) Yes — accessible to `cross_project.read` roles
- B) No — strictly project-scoped in M2
- C) Deferred to Module 5

**D-11.3: Subtype navigation**
For Variation and Correspondence models, should the sidebar show:
- A) One "Variations" link + one "Correspondence" link (with subtype tabs inside)
- B) Separate sidebar links per subtype (VO, Change Orders, Letters, Notices, Claims, Back Charges)
- C) Grouped sections (e.g., "Variations" section with VO + CO sub-links)

---

## 12. Reports / Dashboards

### PROPOSED

**Commercial dashboard cards:**
- Payment summary (certified total, invoiced total, outstanding)
- Active IPAs (count + total claimed)
- Pending variations (count + total cost impact)
- Open claims (count + total claimed)
- Recent commercial activity (last 10 audit entries)

### NEEDS DECISION

**D-12.1:** Receivable aging (0-30 / 31-60 / 61-90 / 90+ days) — M2 dashboard or Module 4 concept?

**D-12.2:** Client submission history — dashboard section or separate screen? (Related to D-11.1)

**D-12.3:** Any other dashboard cards needed?

---

## 13. Role-Permission Matrix

### CONFIRMED

- 14 roles from M1 (fixed)
- `master_admin` gets all permissions
- PMO is view-only + `cross_project.read`
- Permission code pattern: `{resource}.{action}`

### PROPOSED — Permission Codes

With the 6-model structure:

| Resource | Actions |
|---|---|
| `ipa` | `view`, `create`, `edit`, `submit`, `approve`, `sign`, `issue` |
| `ipc` | `view`, `create`, `edit`, `certify`, `sign`, `issue` |
| `variation` | `view`, `create`, `edit`, `submit`, `approve`, `sign`, `issue` |
| `cost_proposal` | `view`, `create`, `edit`, `submit`, `approve` |
| `tax_invoice` | `view`, `create`, `edit`, `approve`, `sign`, `issue` |
| `correspondence` | `view`, `create`, `edit`, `submit`, `approve`, `sign`, `issue` |
| `receivable` | `view` (if table exists) |
| `commercial` | `dashboard` |

Note: Subtype-level permissions may be needed (e.g., "can create claims but not letters"). Options:
- A) Permissions are per-model only (`correspondence.create` covers all subtypes)
- B) Permissions are per-subtype (`correspondence.claim.create` vs `correspondence.letter.create`)

### NEEDS DECISION

**D-13.1: Permission granularity** — per-model or per-subtype?

**D-13.2: Full role matrix**

Operations: **C** = create, **E** = edit draft, **S** = submit, **R** = review/approve, **F** = finance check, **G** = sign, **I** = issue, **V** = view only

| Role | IPA | IPC | Variation | CostProposal | TaxInvoice | Correspondence |
|------|-----|-----|-----------|-------------|-----------|----------------|
| master_admin | All | All | All | All | All | All |
| project_director | ? | ? | ? | ? | ? | ? |
| project_manager | ? | ? | ? | ? | ? | ? |
| contracts_manager | ? | ? | ? | ? | ? | ? |
| qs_commercial | ? | ? | ? | ? | ? | ? |
| finance | ? | ? | ? | ? | ? | ? |
| cost_controller | ? | ? | ? | ? | ? | ? |
| site_team | ? | ? | ? | ? | ? | ? |
| design | ? | ? | ? | ? | ? | ? |
| qa_qc | ? | ? | ? | ? | ? | ? |
| procurement | ? | ? | ? | ? | ? | ? |
| document_controller | ? | ? | ? | ? | ? | ? |
| pmo | V | V | V | V | V | V |
| executive_approver | ? | ? | ? | ? | ? | ? |

If this is too much at once, we can do it in passes:
1. First confirm which roles are view-only across all commercial types
2. Then detail active roles one at a time

---

## 14. Risks and Non-Goals

### CONFIRMED NON-GOALS

| Item | Reason |
|---|---|
| Procurement workflows | Module 3 |
| Budget/cost/cashflow | Module 4 |
| KPI dashboards | Module 5 |
| Client portal | Internal-only |
| Conditional workflow branching | Locked out (LCD-7) |
| Multi-currency conversion | M2 stores currency; conversion is M4 |
| AI/OCR features | Module 6-7 |
| Approval delegation | Enhancement |
| Batch operations | Enhancement |
| Historical data import | Outside platform |

### RISKS

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Shared model complexity — Variation and Correspondence families need clean subtype handling | Medium | Lock D-10.5 / D-10.6 (field strategy) early |
| 2 | ZATCA scope creep | Medium | Lock D-2.1 before spec |
| 3 | Receivable boundary with M4 | Medium | Lock D-9.1 before spec |
| 4 | Permission matrix errors | Medium | Ahmed confirms D-13.2 |
| 5 | Status model complexity in shared Correspondence engine | Medium | Lock D-4.6 (shared vs per-subtype statuses) |
| 6 | Claim post-issuance lifecycle (negotiation/settlement) doesn't fit simple linear workflow | Medium | May need a second workflow or manual status transitions post-issue |

---

## Decision Index

### Resolved (7 critical — LOCKED)

| ID | Decision | Answer |
|----|----------|--------|
| LCD-1 | IPA vs IPC | Separate records, separate models |
| LCD-2 | Tax Invoice trigger | After IPC certified/signed |
| LCD-3 | VO vs Change Order | One family, subtype enum |
| LCD-4 | Cost Proposal | Standalone record, optionally linked to Variation |
| LCD-5 | Correspondence model | One shared engine, subtypes: letter, notice, claim, back_charge |
| LCD-6 | Posting triggers | 8 events locked (see §LCD-6) |
| LCD-7 | Workflow model | Linear-first, no conditional branching |

### Open — Blocks Spec Writing

| ID | Question | Section |
|----|----------|---------|
| D-1.1 | IPA → IPC cardinality | §1 |
| D-1.2 | IPC → Tax Invoice cardinality | §1 |
| D-2.1 | ZATCA scope | §2 |
| D-4.1–4.6 | Status models per record type | §4 |
| D-5.1 | Workflow steps per record type | §5 |
| D-9.1 | Receivable table in M2 or M4 | §9 |
| D-10.5–10.6 | Subtype field strategy (nullable columns vs JSON vs extension tables) | §10 |
| D-13.1 | Permission granularity (per-model or per-subtype) | §13 |
| D-13.2 | Full role-permission matrix | §13 |

### Open — Important But Won't Block

| ID | Question | Section |
|----|----------|---------|
| D-1.3 | Correspondence cross-subtype linking | §1 |
| D-1.4 | Back charge target model | §1 |
| D-2.2–2.4 | PDF, CDK, payment tracking | §2 |
| D-3.1 | Record creators by role | §3 |
| D-5.2–5.4 | VO workflow split, Executive Approver, correspondence workflow sharing | §5 |
| D-6.1–6.2 | Finance-check details | §6 |
| D-7.1–7.3 | Sign/issue/reference format | §7 |
| D-8.1–8.2 | Contract value tracking, event naming | §8 |
| D-10.1–10.4, 10.7–10.9 | Field details, enums, attachments, comments | §10 |
| D-11.1–11.3 | Screen navigation details | §11 |
| D-12.1–12.3 | Dashboard details | §12 |
