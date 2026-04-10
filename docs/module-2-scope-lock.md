# Module 2 — Commercial / Contracts Engine — Scope Lock

**Date:** 2026-04-10
**Status:** DECISION DOCUMENT — awaiting Ahmed's answers
**Prerequisite:** Module 1 signed off (`b9de91a`)

---

## How to Read This Document

Every section uses three tiers:

- **CONFIRMED** — locked by frozen spec, Ahmed's explicit statements, or M1 architecture. Not up for debate.
- **PROPOSED** — my suggestion based on the confirmed facts. Labeled as a proposal. May be wrong.
- **NEEDS DECISION** — I don't have enough information to propose. Ahmed must answer.

Ahmed's job: scan each section, confirm/correct proposals, answer decisions. Then this document becomes the input to the Module 2 design spec.

---

## 1. Included Record Types

### CONFIRMED

The frozen spec (line 104) lists Module 2 as:
> Commercial engine (IPA, IPC, VO, letters, claims, back charges, tax invoices)

Ahmed's message adds:
> VO / change orders, notices, cost proposals, receivable linkage, client submission history, posting hooks to receivables / inflow

This gives us a candidate set of **10 record types**:

| # | Record Type | Source |
|---|-------------|--------|
| 1 | IPA (Interim Payment Application) | Frozen spec |
| 2 | IPC (Interim Payment Certificate) | Frozen spec |
| 3 | Variation Order (VO) | Frozen spec |
| 4 | Change Order | Ahmed's message |
| 5 | Cost Proposal | Ahmed's message |
| 6 | Tax Invoice | Frozen spec |
| 7 | Letter | Frozen spec |
| 8 | Notice | Ahmed's message |
| 9 | Claim | Frozen spec |
| 10 | Back Charge | Frozen spec |

### NEEDS DECISION

**D-1.1: Are all 10 above confirmed in M2?** Or should any be deferred?

**D-1.2: VO vs Change Order — what's the relationship?**
Options I can see (not proposing one — this is your process):
- A) VO and Change Order are the same thing at different lifecycle stages (one record, one table)
- B) VO is the proposal, Change Order is the executed contract amendment (two separate records, VO → CO link)
- C) They're independent — a Change Order can exist without a prior VO
- D) Something else

**D-1.3: Cost Proposal — what is it?**
Options:
- A) A standalone record type linked to a VO (separate table, separate workflow, can have multiple revisions per VO)
- B) A set of fields on the VO itself (cost estimate is part of the VO, not a separate record)
- C) A document attachment on the VO (no separate record, just an uploaded file with metadata)

**D-1.4: Letter vs Notice — one thing or two?**
Options:
- A) Two separate record types with separate tables (letters are general correspondence, notices are contractual with deadlines and legal significance)
- B) One record type with a `kind` field distinguishing general correspondence from contractual notices
- C) Something else

**D-1.5: IPA vs IPC — what's the exact relationship?**
Options:
- A) One IPA always produces exactly one IPC (1:1)
- B) One IPA can produce multiple partial IPCs (1:N)
- C) One IPC can consolidate multiple IPAs (N:1)
- D) It's flexible (M:N, though unusual)

**D-1.6: IPC vs Tax Invoice — what's the relationship?**
Options:
- A) One IPC produces exactly one Tax Invoice (1:1)
- B) One IPC can produce multiple Tax Invoices (1:N, e.g., split billing)
- C) One Tax Invoice can cover multiple IPCs (N:1)
- D) Tax Invoices are not necessarily linked to IPCs (standalone)

**D-1.7: Notice vs Claim — dependency?**
Options:
- A) A Claim must originate from a Notice (notice is a prerequisite)
- B) Claims can be created independently, but optionally linked to a notice
- C) No formal link between notices and claims in the system

**D-1.8: Back Charge — who is it against?**
In M2, subcontractor management doesn't exist yet (that's Module 3). Options:
- A) Free-text subcontractor name on the back charge record
- B) Introduce a minimal subcontractor reference table in M2 (just name + code)
- C) Back charges deferred to M3 when subcontractor model exists

---

## 2. Excluded / Deferred

### CONFIRMED (from frozen spec)

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

### CONFIRMED (from M1 architecture)

| Also excluded from M2 | Reason |
|---|---|
| Client portal / external access | Internal-only system (M1 principle #1) |
| OAuth/SSO | Hardening phase, not commercial-specific |

### NEEDS DECISION

**D-2.1: ZATCA e-invoicing**
Saudi Arabia requires e-invoicing (ZATCA). Two phases:
- Phase 1: Invoice with required fields (straightforward)
- Phase 2: Real-time XML submission to ZATCA with cryptographic stamp + QR code (complex)

What scope for M2?
- A) Include ZATCA Phase 1 fields on Tax Invoice (minimum compliance)
- B) Include full Phase 2 integration (significant scope addition)
- C) Tax Invoices are internal records only in M2 — all ZATCA compliance deferred

**D-2.2: PDF generation**
Should M2 generate printable PDF documents (for IPAs, IPCs, invoices, letters, notices)?
- A) Yes — PDF export for all issued documents
- B) Yes — but only for Tax Invoices (may be required for ZATCA)
- C) No — M2 is screens only, PDF generation deferred

**D-2.3: Staging/production CDK stacks**
Frozen spec says "stamped during Module 2." Confirm this is still in M2 scope.

**D-2.4: Payment receipt tracking**
When a client pays a Tax Invoice, should M2 record that?
- A) Yes — M2 allows marking invoices as paid (basic tracking)
- B) No — payment tracking is entirely Module 4
- C) M2 records payment date/amount as metadata, but full payment ledger is M4

---

## 3. Record Ownership by Department

### CONFIRMED

The 14 roles are fixed from M1. The following is confirmed from the frozen spec and Ahmed's architecture decisions:
- Business modules register against M1 core services (workflow, posting, audit, RBAC)
- Every commercial record is project-scoped
- All mutations write audit logs

### NEEDS DECISION

**D-3.1: Who creates each record type?**

I need to know the **primary creator** (the role that drafts the record) for each type. This determines who gets `create` and `edit` permissions.

| Record Type | Who creates the draft? |
|---|---|
| IPA | ? |
| IPC | ? |
| VO | ? |
| Change Order | ? |
| Cost Proposal | ? |
| Tax Invoice | ? |
| Letter | ? |
| Notice | ? |
| Claim | ? |
| Back Charge | ? |

For each, tell me the role code(s) from the 14-role list. If multiple roles can create, list all.

---

## 4. Record-by-Record Lifecycle Statuses

### CONFIRMED

- All records have a status field
- Terminal statuses cannot be reopened (M1 pattern from workflow engine)
- Status transitions trigger workflow steps, posting events, and audit entries
- Signed/issued records are immutable (M1 invariant)

### NEEDS DECISION

I need Ahmed to define or confirm the lifecycle for each record type. This is the most critical section — statuses drive dashboards, filters, posting eligibility, and audit clarity.

**D-4.1: IPA lifecycle**

Proposed candidate statuses (correct, add, or remove):

`draft` → `submitted` → `under_review` → `finance_check` → `approved` → `issued` → (terminal)

Questions:
- Is `finance_check` a separate status, or does it happen within `under_review`?
- Is `issued` terminal? Or can an issued IPA be revised/superseded?
- When a revised IPA is needed for the same period: is the old one `superseded`, `cancelled`, or edited in place?

**D-4.2: IPC lifecycle**

Proposed candidate statuses:

`draft` → `under_review` → `finance_check` → `certified` → `issued` → (terminal)

Questions:
- Is `certified` and `issued` two separate steps, or is certification the same as issuance?
- Can an IPC be rejected back to IPA revision?

**D-4.3: VO lifecycle**

Proposed candidate statuses:

`draft` → `submitted` → `under_review` → `costing` → `approved_internal` → `submitted_to_client` → `approved_client` → `executed` → (terminal)

Questions:
- Is `costing` a VO status (paused while cost proposal is prepared)? Or does costing happen outside the VO lifecycle?
- Are `approved_internal` and `approved_client` two distinct stages? Or is there just one approval?
- Is `executed` the terminal state, meaning a Change Order was issued?

**D-4.4: Change Order lifecycle** (if separate from VO per D-1.2)

Proposed candidate statuses:

`draft` → `under_review` → `approved` → `executed` → (terminal)

**D-4.5: Cost Proposal lifecycle** (if standalone per D-1.3)

Proposed candidate statuses:

`draft` → `submitted` → `under_review` → `approved` → `submitted_to_client` → `accepted` → (terminal)

Questions:
- When a cost proposal is rejected, does a new revision replace it (`superseded` status)?

**D-4.6: Tax Invoice lifecycle**

Proposed candidate statuses:

`draft` → `under_review` → `approved` → `issued` → (terminal)

Questions:
- Should there be a `paid` status in M2? Or is that Module 4?
- Should there be a `void` status for cancelled-after-issue (credit note scenario)?

**D-4.7: Letter lifecycle**

Proposed candidate statuses:

`draft` → `under_review` → `approved` → `issued` → (terminal)

Questions:
- Do all letters require approval? Or can some be sent directly (informal)?

**D-4.8: Notice lifecycle**

Proposed candidate statuses:

`draft` → `under_review` → `approved` → `issued` → (terminal)

Questions:
- Should the system track recipient acknowledgment (`acknowledged` status)?
- Should there be an `expired` status for response deadlines that pass?
- Or is the notice terminal at `issued` with response tracking deferred?

**D-4.9: Claim lifecycle**

Proposed candidate statuses:

`draft` → `submitted` → `under_review` → `approved_internal` → `submitted_to_client` → `under_negotiation` → `settled` → (terminal)

Questions:
- When settled for a partial amount, does the record store both claimed and settled amounts?
- Or does partial settlement create a separate linked record?

**D-4.10: Back Charge lifecycle**

Proposed candidate statuses:

`draft` → `submitted` → `under_review` → `approved` → `issued` → (terminal)

Questions:
- Should there be a dispute flow (`disputed` → `resolved`)?
- Or are disputes handled outside the system in M2?

---

## 5. Record-by-Record Workflow Path

### CONFIRMED

- M1 workflow engine is **linear multi-step** (Step 1 → Step 2 → Step 3 → done)
- Each step has an approver resolved by role within the project
- Workflow templates use a `recordType` string (e.g., `"ipa"`)
- Steps support: approve, reject, return (to prior step), cancel

### NEEDS DECISION

**D-5.1: Linear vs conditional workflows**
The M1 engine is linear. Does any M2 record type need conditional routing? Examples of conditional routing:
- "If VO value > $100K, add Executive Approver step"
- "If claim type is time-only, skip finance check"

If yes, the M1 engine needs extension before M2 implementation. If no, we proceed with linear.

**D-5.2: Workflow path per record type**

For each record type, I need:
1. The ordered approval steps (who reviews, in what sequence)
2. Whether a finance check step is included
3. Who signs the record
4. Who issues the record (marks it as formally transmitted)

Please fill in or correct:

| Record Type | Approval Steps (in order) | Finance Check? | Signatory | Issue Controller |
|---|---|---|---|---|
| IPA | ? | ? | ? | ? |
| IPC | ? | ? | ? | ? |
| VO | ? | ? | ? | ? |
| Change Order | ? | ? | ? | ? |
| Cost Proposal | ? | ? | ? | ? |
| Tax Invoice | ? | ? | ? | ? |
| Letter | ? | ? | ? | ? |
| Notice | ? | ? | ? | ? |
| Claim | ? | ? | ? | ? |
| Back Charge | ? | ? | ? | ? |

**D-5.3: Executive Approver involvement**
When does the Executive Approver enter a workflow?
- A) Only for records above a value threshold (what threshold?)
- B) Only for specific record types (which?)
- C) Not used in standard workflows — available via override only
- D) Other

**D-5.4: VO — one workflow or two?**
If VO has both internal approval and client submission, is that:
- A) One continuous workflow (internal steps → client-facing steps)
- B) Two separate workflows (internal approval workflow → then a separate client submission workflow)

---

## 6. Finance-Check Rules

### CONFIRMED

- Finance and Cost Controller are separate roles (M1)
- Finance checks are a workflow step, not a separate process

### PROPOSED

| Record Type | Finance Check Needed? | Proposed Checker |
|---|---|---|
| IPA | Likely yes | Finance |
| IPC | Likely yes | Finance |
| VO | Uncertain — costing may be separate | — |
| Change Order | Uncertain | — |
| Cost Proposal | Likely yes | Cost Controller |
| Tax Invoice | Likely yes | Finance |
| Letter | Likely no | — |
| Notice | Likely no | — |
| Claim | Likely yes | Cost Controller |
| Back Charge | Likely yes | Finance |

### NEEDS DECISION

**D-6.1: Confirm or correct** the table above.

**D-6.2: Finance vs Cost Controller split** — is the rule "Finance checks payment-related records, Cost Controller checks costing and claims"? Or different?

---

## 7. Sign / Issue Rules

### CONFIRMED

- M1 digital signing service exists (internal SHA-256 hash capture)
- Signed records are immutable (Prisma middleware enforced)
- All M1 issued documents get locked after issuance

### NEEDS DECISION

**D-7.1: Is signing required before issuance for all record types?** Or can some types (e.g., informal letters) be issued without a signature?

**D-7.2: Reference number format**
What format does Pico Play use for issued commercial documents?
- A) `{ProjectCode}-{TypeCode}-{NNN}` (e.g., PROJ01-IPA-001)
- B) Different format (specify)
- C) Manual entry, not auto-generated

**D-7.3: Client acknowledgment tracking**
For records issued to the client (IPA, IPC, VO, Tax Invoice, Notice, Claim):
- A) System tracks client acknowledgment/response as a status
- B) Client interaction is external — system just records the issue date
- C) Some records track client response, others don't (which ones?)

---

## 8. Posting Trigger Rules

### CONFIRMED

- All posting goes through M1 posting engine (`postingService.post()`)
- Each event type has a Zod-validated payload schema
- Events are idempotent (idempotency key unique constraint)
- Reversals are additive (never destructive)
- Business modules never write financial tables directly

### NEEDS DECISION

**D-8.1: Which status transitions fire posting events?**

This is one of the decisions Ahmed explicitly flagged. For each record type, I need to know **if** and **when** a posting event fires.

| Record Type | Does it post? | At which status transition? |
|---|---|---|
| IPA | ? | ? |
| IPC | ? | ? |
| VO (internal approval) | ? | ? |
| VO (client approval) | ? | ? |
| Change Order | ? | ? |
| Cost Proposal | ? | ? |
| Tax Invoice | ? | ? |
| Letter | ? | ? |
| Notice | ? | ? |
| Claim (submission) | ? | ? |
| Claim (settlement) | ? | ? |
| Back Charge | ? | ? |

**D-8.2: Does IPA approval have a financial posting effect?** Or is IPA just a claim with no financial effect until IPC certification?

**D-8.3: Contract value tracking**
When a VO or Change Order is approved/executed, the project's contract value changes. Should M2:
- A) Store a `contractValue` field on Project that posting events update
- B) Calculate contract value on-the-fly from VO/CO event history
- C) Defer contract value tracking to Module 4

**D-8.4: Any posting events for non-financial records (letters, notices)?**
- A) No — letters and notices don't post
- B) Yes — informational events logged but with no financial effect
- C) Other

---

## 9. Receivable / Inflow Linkage Rules

### CONFIRMED

- Ahmed listed "receivable linkage" and "posting hooks to receivables / inflow" in M2 scope
- Module 4 handles budget, cost, cashflow
- Posting is the only path to financial state (M1 principle)

### NEEDS DECISION

**D-9.1: Does M2 introduce a receivable table?**
- A) Yes — M2 creates a receivable model. Posting events create entries. M2 tracks basic status. M4 extends with full payment/cashflow tracking.
- B) No — M2 only fires posting events. The receivable ledger is built entirely in Module 4 from M2's posting events.
- C) Minimal — M2 creates receivable entries but only tracks basic state (outstanding/invoiced). No payment, aging, or write-off until M4.

**D-9.2: If receivable table exists, what creates a receivable entry?**

| Event | Creates receivable? |
|---|---|
| IPC certified | ? |
| Tax Invoice issued | ? |
| Claim settled | ? |
| Back Charge issued | ? |

**D-9.3: Payment tracking in M2**
- A) M2 allows manually marking a receivable/invoice as paid
- B) All payment tracking is Module 4
- C) M2 records payment date as metadata but no payment ledger

---

## 10. Required Forms and Key Fields

### CONFIRMED

- All records are project-scoped (`projectId` FK, M1 isolation)
- All records get standard audit fields (createdBy, createdAt, updatedAt)
- All records get a `status` field
- All money fields use Decimal type
- Currency comes from M1 reference data

### PROPOSED

For each record type, I've listed the **key business fields** (not system/audit fields). These are proposals — correct or extend.

**IPA:** periodNumber, periodFrom, periodTo, grossAmount, retentionRate, retentionAmount, previousCertified, currentClaim, advanceRecovery, otherDeductions, netClaimed, currency, description

**IPC:** ipaId (FK), certifiedAmount, retentionAmount, adjustments, netCertified, certificationDate, currency, remarks

**VO:** title, description, reason, initiatedBy, costImpact, timeImpactDays, contractClause, currency

**Change Order:** voId (FK?), originalContractValue, adjustmentAmount, newContractValue, timeAdjustmentDays, description, currency

**Cost Proposal:** voId (FK?), revisionNumber, estimatedCost, estimatedTimeDays, methodology, costBreakdown, currency

**Tax Invoice:** ipcId (FK?), invoiceNumber, invoiceDate, grossAmount, vatRate, vatAmount, totalAmount, dueDate, currency, buyerName, buyerTaxId, sellerTaxId

**Letter:** letterType(?), subject, body, recipientName, recipientOrg, inReplyTo (FK?)

**Notice:** noticeType(?), subject, body, contractClause, responseDeadline, recipientName, recipientOrg

**Claim:** claimType(?), title, description, claimedAmount, claimedTimeDays, settledAmount, settledTimeDays, contractClause, noticeId (FK?), currency

**Back Charge:** subcontractorName, reason, category(?), chargedAmount, evidenceDescription, currency

### NEEDS DECISION

**D-10.1: IPA line items** — Does IPA have itemized breakdown (table of work items with quantities and amounts)? Or is it a single summary record?

**D-10.2: VO line items** — Same question. Does VO have individual scope items with separate costs? Or single summary?

**D-10.3: Cost breakdown structure** — Is cost proposal breakdown structured (labor/materials/equipment/overhead) or free-form text?

**D-10.4: VAT rate** — Always 15% (Saudi standard)? Or configurable per project or entity?

**D-10.5: Enum values** — For any enum fields (letterType, noticeType, claimType, backChargeCategory, initiatedBy), what are the exact values? I can propose if you'd prefer.

**D-10.6: Document attachments** — Should all commercial records support linking to M1 documents? (M1 Document model already has nullable `recordType` + `recordId` fields for this.)

**D-10.7: Internal notes/comments** — Should records have a comments thread for internal discussion during review? Or is the workflow step's comment field enough?

---

## 11. Required Screens

### CONFIRMED

- All commercial screens are inside the project workspace (project-scoped)
- M1 project sidebar gets a new "Commercial" section (replacing the placeholder)
- M1 patterns: list view (paginated table) + detail view per record type
- No new admin screens — M2 uses existing M1 admin (workflow templates, roles & permissions)

### PROPOSED

**22 project-scoped screens:**
- Commercial Dashboard (summary for the project)
- List + Detail for each of the 10 record types = 20 screens
- Receivable Summary (if D-9.1 = A or C) = 1 screen

### NEEDS DECISION

**D-11.1: Client submission history**
Ahmed listed "client submission history" in M2 scope. Is this:
- A) A separate screen showing all records ever issued to the client across all commercial types
- B) A filter/view within each list screen
- C) A section on the commercial dashboard
- D) Something else

**D-11.2: Cross-project commercial view**
Should there be a portfolio-level commercial summary (across all projects)?
- A) Yes — accessible to roles with `cross_project.read`
- B) No — all commercial data is strictly project-scoped in M2
- C) Deferred to Module 5 (KPI/PMO)

---

## 12. Module 2 Reports / Dashboards

### CONFIRMED

- Ahmed listed "client submission history" and "posting hooks to receivables / inflow" as M2 scope
- M1 has a home dashboard with summary cards — M2 can extend it

### PROPOSED

**Project commercial dashboard cards:**
- Payment summary (total certified, total invoiced, total outstanding)
- Active IPAs count + total claimed
- Pending VOs count + total cost impact
- Open claims count + total claimed

### NEEDS DECISION

**D-12.1: Receivable aging** — Should the dashboard show receivable aging (0-30 / 31-60 / 61-90 / 90+ days)? Or is aging a Module 4 concept?

**D-12.2: Any other dashboard cards or views needed?**

**D-12.3: Does "client submission history"** appear here as a dashboard view, or as a separate screen (see D-11.1)?

---

## 13. Role-Permission Matrix

### CONFIRMED

- 14 roles from M1 (fixed list)
- `master_admin` gets all permissions (wildcard)
- Permission code pattern: `{resource}.{action}`
- PMO is view-only + `cross_project.read` (M1 principle #3)
- M1 non-admin roles are stub-mapped — M2 is where they get real permissions

### NEEDS DECISION

**D-13.1: Full matrix**

I need Ahmed to define who can do what with each commercial record type. The operations are:

| Code | Meaning |
|---|---|
| **C** | Create (draft a new record) |
| **E** | Edit (modify a draft) |
| **S** | Submit (send for review) |
| **R** | Review / Approve (act in workflow) |
| **F** | Finance check (validate amounts) |
| **G** | Sign (digital signature) |
| **I** | Issue (formally transmit, assign reference number) |
| **V** | View only |

Fill in or correct:

| Role | IPA | IPC | VO | CO | CP | Invoice | Letter | Notice | Claim | Back Charge |
|------|-----|-----|----|----|----|---------|---------|---------|---------|----|
| master_admin | All | All | All | All | All | All | All | All | All | All |
| project_director | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| project_manager | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| contracts_manager | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| qs_commercial | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| finance | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| cost_controller | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| site_team | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| design | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| qa_qc | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| procurement | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| document_controller | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| pmo | V | V | V | V | V | V | V | V | V | V |
| executive_approver | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |

If this is too much to fill at once, we can do it in two passes:
1. First confirm which roles are view-only across all commercial types
2. Then detail the active roles one at a time

---

## 14. Module 2 Risks and Non-Goals

### CONFIRMED NON-GOALS

| Item | Reason |
|---|---|
| Procurement workflows | Module 3 |
| Budget/cost/cashflow | Module 4 |
| KPI dashboards | Module 5 |
| Client portal | Internal-only system |
| Multi-currency conversion | M2 stores currency; conversion is M4 |
| Approval delegation | Enhancement, not core M2 |
| Batch operations | Enhancement |
| Historical data import | One-time operation, outside platform |
| AI/OCR features | Module 6-7 |

### RISKS

| # | Risk | Impact |
|---|------|--------|
| 1 | Domain model wrong — record relationships, statuses, or workflows don't match Pico Play's actual process | High — rework after build |
| 2 | Workflow engine needs conditional branching — D-5.1 determines this | Medium — engine extension before M2 build |
| 3 | ZATCA scope creep — Phase 2 is complex and could dominate M2 | Medium — lock D-2.1 early |
| 4 | Receivable boundary with M4 unclear — leads to rework or gaps | Medium — lock D-9.1 early |
| 5 | Permission matrix errors — wrong RBAC = security/usability issues | Medium — Ahmed confirms matrix |
| 6 | Too many record types for one module — 10 types is a lot | Medium — Ahmed may want to split M2 into M2a/M2b |

### NEEDS DECISION

**D-14.1: Module size** — 10 record types with workflows, screens, posting, and permissions is significant scope. Should M2 be split into sub-phases (e.g., M2a = IPA/IPC/VO/CO/CP/Invoice, M2b = Letters/Notices/Claims/Back Charges)? Or keep as one module?

---

## Decision Index

### Critical — blocks spec writing

| ID | Question | Quick Reference |
|----|----------|-----------------|
| D-1.2 | VO vs Change Order model | §1 |
| D-1.3 | Cost Proposal role | §1 |
| D-1.4 | Letter vs Notice model | §1 |
| D-1.5 | IPA vs IPC relationship | §1 |
| D-1.6 | IPC vs Tax Invoice relationship | §1 |
| D-2.1 | ZATCA scope | §2 |
| D-5.1 | Linear vs conditional workflows | §5 |
| D-8.1 | Posting trigger points | §8 |
| D-9.1 | Receivable table in M2 or M4 | §9 |

### Important — affects design quality

| ID | Question | Quick Reference |
|----|----------|-----------------|
| D-3.1 | Record creators by role | §3 |
| D-4.1–4.10 | Status models | §4 |
| D-5.2 | Workflow steps per record type | §5 |
| D-7.2 | Reference number format | §7 |
| D-8.2 | IPA financial posting effect | §8 |
| D-8.3 | Contract value tracking | §8 |
| D-10.1–10.7 | Field details | §10 |
| D-13.1 | Full role-permission matrix | §13 |
| D-14.1 | Module size / split decision | §14 |

### Nice-to-have — can be decided during spec

| ID | Question | Quick Reference |
|----|----------|-----------------|
| D-2.2 | PDF generation | §2 |
| D-2.4 | Payment receipt tracking | §2 |
| D-7.3 | Client acknowledgment tracking | §7 |
| D-10.5 | Enum values | §10 |
| D-11.1 | Client submission history format | §11 |
| D-12.1–12.3 | Dashboard details | §12 |
