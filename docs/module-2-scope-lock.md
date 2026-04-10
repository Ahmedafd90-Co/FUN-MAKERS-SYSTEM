# Module 2 — Commercial Engine — Scope Lock

**Date:** 2026-04-10
**Status:** DRAFT — pending Ahmed's review and corrections
**Prerequisite:** Module 1 signed off (`b9de91a`)

> This document locks the domain decisions before the Module 2 design spec is written.
> Every table below needs Ahmed's confirmation or correction.
> Nothing in this document is final until Ahmed approves it.

---

## 1. Commercial Record Set (10 Record Types)

| # | Record Type | Code | Description |
|---|-------------|------|-------------|
| 1 | **IPA** | `ipa` | Interim Payment Application — contractor's periodic claim for work completed in a payment period |
| 2 | **IPC** | `ipc` | Interim Payment Certificate — client-certified version of the IPA, confirms what will be paid |
| 3 | **Variation Order** | `vo` | Proposed change to original contract scope, cost, or time — initiated by either party |
| 4 | **Change Order** | `change_order` | Formal contractual amendment that executes an approved VO — the binding document |
| 5 | **Cost Proposal** | `cost_proposal` | Detailed cost and time estimate supporting a VO — submitted to client for pricing agreement |
| 6 | **Tax Invoice** | `tax_invoice` | VAT-compliant invoice generated from a certified IPC — the billing document |
| 7 | **Letter** | `letter` | Formal project correspondence — instructions, responses, transmittals, general communication |
| 8 | **Notice** | `notice` | Contractual notice with legal significance — delay notices, claim notices, dispute notices, with response deadlines |
| 9 | **Claim** | `claim` | Formal claim for additional time or cost — supported by notices and evidence |
| 10 | **Back Charge** | `back_charge` | Charge levied against a subcontractor for defects, delays, or non-compliance |

### Record Relationships

```
VO ──────→ Cost Proposal (one VO can have multiple cost proposals / revisions)
VO ──────→ Change Order (approved VO becomes a change order)
IPA ─────→ IPC (one IPA produces one IPC after certification)
IPC ─────→ Tax Invoice (one IPC produces one or more tax invoices)
Notice ──→ Claim (contractual notices can escalate to formal claims)
```

### Questions for Ahmed

- [ ] **VO vs Change Order relationship:** Is a Change Order always born from an approved VO? Or can a Change Order be created independently (e.g., client-instructed changes that skip the VO process)?
- [ ] **Cost Proposal as standalone:** Should Cost Proposal be a standalone record type, or is it better modeled as a sub-record/attachment of a VO? Some teams prefer the cost proposal as a document attached to the VO rather than a separate entity.
- [ ] **Letter subtypes:** Should letters have a `letterType` field (instruction, response, transmittal, general)? Or are all letters treated the same with just a free-text subject?
- [ ] **Notice types:** Confirm the notice types needed: delay notice, claim notice, extension of time notice, dispute notice, force majeure notice — any others?
- [ ] **Back Charge targets:** In M2, back charges are against subcontractors. Since Module 3 (Procurement) introduces subcontractor management, should M2 back charges reference subcontractors by name (free text) or defer the full subcontractor model to M3?

---

## 2. Lifecycle Statuses by Record Type

### IPA (Interim Payment Application)

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared by QS/Commercial | No |
| `submitted` | Submitted for internal review | No |
| `under_review` | Being reviewed by Contracts Manager | No |
| `finance_check` | Sent to Finance for validation | No |
| `approved` | Internally approved, ready to issue | No |
| `issued` | Issued to client | No |
| `superseded` | Replaced by a revised IPA for the same period | Yes |
| `rejected` | Rejected during review | Yes |
| `cancelled` | Cancelled before issue | Yes |

Typical flow: `draft → submitted → under_review → finance_check → approved → issued`

### IPC (Interim Payment Certificate)

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared from approved IPA | No |
| `under_review` | Being reviewed by Project Director | No |
| `finance_check` | Finance validates amounts | No |
| `certified` | Certified and signed | No |
| `issued` | Issued to client | No |
| `rejected` | Certification rejected (IPA needs revision) | Yes |
| `cancelled` | Cancelled | Yes |

Typical flow: `draft → under_review → finance_check → certified → issued`

### Variation Order (VO)

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared | No |
| `submitted` | Submitted for internal review | No |
| `under_review` | Internal technical/commercial review | No |
| `costing` | Cost proposal being prepared | No |
| `approved_internal` | Approved internally, ready for client | No |
| `submitted_to_client` | Sent to client for approval | No |
| `approved_client` | Client approved the variation | No |
| `executed` | Change order issued — VO is now binding | Yes |
| `rejected_internal` | Rejected internally | Yes |
| `rejected_client` | Client rejected | Yes |
| `withdrawn` | Withdrawn by originator | Yes |

Typical flow: `draft → submitted → under_review → costing → approved_internal → submitted_to_client → approved_client → executed`

### Change Order

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared from approved VO | No |
| `under_review` | Being reviewed | No |
| `approved` | Approved and signed | No |
| `executed` | Formally executed — contract amended | Yes |
| `cancelled` | Cancelled | Yes |

Typical flow: `draft → under_review → approved → executed`

### Cost Proposal

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared | No |
| `submitted` | Submitted for internal review | No |
| `under_review` | Being reviewed by Contracts Manager | No |
| `approved` | Approved internally | No |
| `submitted_to_client` | Sent to client | No |
| `accepted` | Client accepted the pricing | Yes |
| `rejected` | Rejected (needs revision) | Yes |
| `superseded` | Replaced by revised cost proposal | Yes |

Typical flow: `draft → submitted → under_review → approved → submitted_to_client → accepted`

### Tax Invoice

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared from certified IPC | No |
| `under_review` | Finance reviewing amounts and VAT | No |
| `approved` | Approved for issue | No |
| `issued` | Issued to client | No |
| `paid` | Payment received (marked manually or via M4) | Yes |
| `void` | Voided (credit note issued) | Yes |
| `cancelled` | Cancelled before issue | Yes |

Typical flow: `draft → under_review → approved → issued → paid`

### Letter

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being composed | No |
| `under_review` | Being reviewed for approval | No |
| `approved` | Approved to send | No |
| `issued` | Sent / transmitted | Yes |
| `cancelled` | Cancelled | Yes |

Typical flow: `draft → under_review → approved → issued`

### Notice

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being composed | No |
| `under_review` | Legal/commercial review | No |
| `approved` | Approved to issue | No |
| `issued` | Formally issued with reference number | No |
| `acknowledged` | Recipient acknowledged receipt | Yes |
| `expired` | Response deadline passed without action | Yes |
| `cancelled` | Cancelled before issue | Yes |

Typical flow: `draft → under_review → approved → issued → acknowledged`

### Claim

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared | No |
| `submitted` | Submitted for internal review | No |
| `under_review` | Commercial/legal review | No |
| `approved_internal` | Approved internally for submission | No |
| `submitted_to_client` | Formally submitted to client | No |
| `under_negotiation` | In negotiation with client | No |
| `settled` | Claim settled (full or partial) | Yes |
| `rejected` | Claim rejected by client | Yes |
| `withdrawn` | Withdrawn by contractor | Yes |

Typical flow: `draft → submitted → under_review → approved_internal → submitted_to_client → under_negotiation → settled`

### Back Charge

| Status | Description | Terminal? |
|--------|-------------|-----------|
| `draft` | Being prepared | No |
| `submitted` | Submitted for review | No |
| `under_review` | Being reviewed by Contracts Manager | No |
| `approved` | Approved | No |
| `issued` | Issued to subcontractor | No |
| `acknowledged` | Subcontractor acknowledged | Yes |
| `disputed` | Subcontractor disputes the charge | No |
| `resolved` | Dispute resolved | Yes |
| `cancelled` | Cancelled | Yes |

Typical flow: `draft → submitted → under_review → approved → issued → acknowledged`

### Questions for Ahmed

- [ ] **IPA "superseded" status:** When a revised IPA is submitted for the same payment period, does the old IPA move to `superseded`? Or is it `cancelled` and a new IPA created?
- [ ] **Tax Invoice "paid" status:** Should M2 track payment receipt, or is that deferred to M4 (Budget/Cashflow)? M2 could show `issued` as the final active status and let M4 handle payment tracking.
- [ ] **Back Charge "disputed" flow:** When a subcontractor disputes, does it go back to `under_review` for reassessment, or does it have its own dispute resolution workflow?
- [ ] **Claim "settled" amounts:** When a claim is settled for a partial amount, should we store both the claimed amount and the settled amount? (I assume yes.)
- [ ] **Any missing statuses?** Review each table above for completeness.

---

## 3. Workflow Matrix by Record Type

| Record Type | Creator | Reviewer(s) | Finance Check | Signatory | Issue Control | Post on |
|-------------|---------|-------------|---------------|-----------|---------------|---------|
| **IPA** | QS/Commercial | Contracts Manager → Project Manager | Yes (Finance) | Project Director | Contracts Manager | `approved` |
| **IPC** | QS/Commercial | Contracts Manager → Project Director | Yes (Finance) | Project Director | Contracts Manager | `certified` |
| **VO** | QS/Commercial, Design, or Site Team | Contracts Manager → Project Manager | No (costing separate) | Project Director (internal), Client (external) | Contracts Manager | `approved_client` |
| **Change Order** | QS/Commercial | Contracts Manager | No | Project Director | Contracts Manager | `executed` |
| **Cost Proposal** | QS/Commercial or Cost Controller | Contracts Manager → Project Manager | Yes (Cost Controller) | Contracts Manager | QS/Commercial | `accepted` |
| **Tax Invoice** | Finance | QS/Commercial → Contracts Manager | Yes (Finance prepares it) | Finance Manager or Project Director | Finance | `issued` |
| **Letter** | Any project role | Contracts Manager or Project Manager | No | Contracts Manager (if formal) | Contracts Manager | No posting |
| **Notice** | Contracts Manager or QS/Commercial | Project Manager → Project Director | No | Project Director | Contracts Manager | No posting |
| **Claim** | QS/Commercial or Contracts Manager | Contracts Manager → Project Manager → Project Director | Yes (Cost Controller validates amounts) | Project Director | Contracts Manager | `submitted_to_client` |
| **Back Charge** | QS/Commercial, Site Team, or QA/QC | Contracts Manager → Project Manager | Yes (Finance confirms deductibility) | Project Director | Contracts Manager | `issued` |

### Workflow Template Codes (for M1 workflow engine)

Each record type gets one or more workflow templates seeded in the database:

| Template Code | Record Type | Steps |
|---------------|-------------|-------|
| `ipa_approval` | `ipa` | QS/Commercial Review → Contracts Manager Review → Finance Check → Project Director Approval |
| `ipc_certification` | `ipc` | Contracts Manager Review → Finance Check → Project Director Certification |
| `vo_internal_approval` | `vo` | Technical Review → Contracts Manager Review → Project Manager Review → Project Director Approval |
| `vo_client_submission` | `vo` | (Post internal approval) Contracts Manager prepares → Project Director signs submission |
| `change_order_approval` | `change_order` | Contracts Manager Review → Project Director Approval |
| `cost_proposal_approval` | `cost_proposal` | Cost Controller Review → Contracts Manager Review → Project Manager Approval |
| `tax_invoice_approval` | `tax_invoice` | QS/Commercial Verification → Contracts Manager Review → Finance Approval |
| `letter_approval` | `letter` | Reviewer (role varies) → Contracts Manager Approval |
| `notice_approval` | `notice` | Contracts Manager Review → Project Manager Review → Project Director Approval |
| `claim_approval` | `claim` | Contracts Manager Review → Cost Controller Validation → Project Manager Review → Project Director Approval |
| `back_charge_approval` | `back_charge` | Contracts Manager Review → Finance Check → Project Manager Approval |

### Questions for Ahmed

- [ ] **VO dual workflow:** I've split VO into two workflows: `vo_internal_approval` (internal sign-off) and `vo_client_submission` (client-facing). Is this the right model, or should it be one continuous workflow?
- [ ] **Letter reviewer flexibility:** Letters can be about anything — who reviews them depends on context. Should the letter workflow have a configurable reviewer step, or always route through Contracts Manager?
- [ ] **Executive Approver role:** When does Executive Approver enter the chain? Only for high-value items above a threshold? If so, what thresholds?
- [ ] **Workflow step counts:** Are the step counts above roughly right? Any record type needs more or fewer review stages?

---

## 4. Posting Events by Record Type

| Event Type Code | Trigger | Source Record | Payload Fields | Creates Receivable? |
|-----------------|---------|---------------|----------------|---------------------|
| `IPA_APPROVED` | IPA moves to `approved` | `ipa` | `{ ipaId, period, grossAmount, retention, previousCertified, netClaimed, currency }` | No (claim only — not yet certified) |
| `IPC_CERTIFIED` | IPC moves to `certified` | `ipc` | `{ ipcId, ipaId, certifiedAmount, retention, adjustments, netCertified, currency }` | **Yes** — creates receivable entry |
| `VO_APPROVED_INTERNAL` | VO moves to `approved_internal` | `vo` | `{ voId, description, costImpact, timeImpactDays, contractRef }` | No (informational — contract value not yet changed) |
| `VO_APPROVED_CLIENT` | VO moves to `approved_client` | `vo` | `{ voId, approvedCost, approvedTimeDays, clientRef }` | No (contract value adjusted, receivable comes from IPC) |
| `CHANGE_ORDER_EXECUTED` | Change Order moves to `executed` | `change_order` | `{ changeOrderId, voId, originalContractValue, adjustmentAmount, newContractValue, currency }` | No (adjusts contract value — receivable comes from IPC) |
| `COST_PROPOSAL_ACCEPTED` | Cost Proposal moves to `accepted` | `cost_proposal` | `{ costProposalId, voId, acceptedAmount, currency }` | No (pricing agreement — not a payment) |
| `TAX_INVOICE_ISSUED` | Tax Invoice moves to `issued` | `tax_invoice` | `{ taxInvoiceId, ipcId, invoiceNumber, grossAmount, vatRate, vatAmount, totalAmount, currency }` | **Yes** — formalizes receivable (updates existing or creates if IPC receivable was skipped) |
| `CLAIM_SUBMITTED` | Claim moves to `submitted_to_client` | `claim` | `{ claimId, claimType, claimedAmount, claimedTimeDays, currency }` | No (not yet agreed) |
| `CLAIM_SETTLED` | Claim moves to `settled` | `claim` | `{ claimId, settledAmount, settledTimeDays, currency }` | **Yes** — creates receivable for settled amount |
| `BACK_CHARGE_ISSUED` | Back Charge moves to `issued` | `back_charge` | `{ backChargeId, subcontractorName, chargedAmount, reason, currency }` | **Yes** — creates receivable (money owed TO us by subcontractor) |

### Questions for Ahmed

- [ ] **IPA posting:** Should IPA_APPROVED fire a posting event? It's a claim, not yet certified. Some systems only post on IPC_CERTIFIED. Alternatively, IPA_APPROVED could be an informational event (logged but no financial effect).
- [ ] **VO contract value adjustment:** When a VO is approved by the client, should the system automatically update a "contract value" field on the Project? Or is contract value tracking a Module 4 concern?
- [ ] **Tax invoice VAT rate:** Is it always 15% (Saudi standard VAT)? Or does it vary by project/entity? Should the rate be configurable per project?
- [ ] **ZATCA compliance:** Is ZATCA Phase 2 e-invoicing (QR code, XML submission) in scope for M2? Or is M2 just generating the invoice document, and ZATCA integration is deferred?
- [ ] **Claim types:** What claim types exist? Time extension only, cost only, time + cost? Any others?
- [ ] **Back charge receivable direction:** Confirm: back charges represent money owed TO us (Pico Play) BY the subcontractor? (Not the other direction.)

---

## 5. Finance-Check Rules

| Record Type | Finance Check Required? | Who Checks | What They Validate |
|-------------|------------------------|------------|-------------------|
| **IPA** | Yes | Finance | Amounts match work done, retention correctly applied, previous certifications deducted, no double-counting |
| **IPC** | Yes | Finance | Certified amounts match approved IPA, VAT calculations correct, retention held correctly |
| **VO** | No (costing is separate) | — | — |
| **Change Order** | No | — | Already validated via VO + Cost Proposal |
| **Cost Proposal** | Yes | Cost Controller | Cost breakdown reasonable, rates match contract, quantities verified |
| **Tax Invoice** | Yes | Finance | Invoice matches IPC, VAT calculation correct, invoice number sequential, ZATCA requirements met |
| **Letter** | No | — | — |
| **Notice** | No | — | — |
| **Claim** | Yes | Cost Controller | Claimed amounts justified, supporting evidence referenced, calculations verified |
| **Back Charge** | Yes | Finance | Amount justified, deduction permissible under subcontract terms |

---

## 6. Sign / Issue Rules

| Record Type | Signatory | Sign Means | Issue Control | Issue Means |
|-------------|-----------|------------|---------------|-------------|
| **IPA** | Project Director | Internal digital sign (M1 signing service) | Contracts Manager | Generates reference number, marks `issued`, locks record |
| **IPC** | Project Director | Internal digital sign | Contracts Manager | Generates IPC number, marks `issued`, locks record |
| **VO** | Project Director (internal), Client (external — tracked as acknowledgment) | Internal sign for submission | Contracts Manager | Marks `submitted_to_client`, generates transmittal |
| **Change Order** | Project Director + Client acknowledgment | Internal sign | Contracts Manager | Marks `executed`, locks record |
| **Cost Proposal** | Contracts Manager | Internal sign | QS/Commercial | Marks `submitted_to_client` |
| **Tax Invoice** | Finance | Internal sign | Finance | Generates invoice number, marks `issued`, locks record |
| **Letter** | Contracts Manager or Project Manager | Internal sign (optional for informal) | Contracts Manager | Generates reference number, marks `issued` |
| **Notice** | Project Director | Internal sign (required — contractual document) | Contracts Manager | Generates reference number, marks `issued`, records issue date for deadline tracking |
| **Claim** | Project Director | Internal sign | Contracts Manager | Marks `submitted_to_client`, generates reference |
| **Back Charge** | Project Director | Internal sign | Contracts Manager | Marks `issued`, generates reference number |

### Issue numbering

All issued records get a project-scoped sequential reference number:

| Record Type | Number Format | Example |
|-------------|--------------|---------|
| IPA | `{ProjectCode}-IPA-{NNN}` | `PROJ01-IPA-001` |
| IPC | `{ProjectCode}-IPC-{NNN}` | `PROJ01-IPC-001` |
| VO | `{ProjectCode}-VO-{NNN}` | `PROJ01-VO-003` |
| Change Order | `{ProjectCode}-CO-{NNN}` | `PROJ01-CO-002` |
| Cost Proposal | `{ProjectCode}-CP-{NNN}` | `PROJ01-CP-005` |
| Tax Invoice | `{ProjectCode}-INV-{NNN}` | `PROJ01-INV-001` |
| Letter | `{ProjectCode}-LTR-{NNN}` | `PROJ01-LTR-012` |
| Notice | `{ProjectCode}-NTC-{NNN}` | `PROJ01-NTC-001` |
| Claim | `{ProjectCode}-CLM-{NNN}` | `PROJ01-CLM-001` |
| Back Charge | `{ProjectCode}-BC-{NNN}` | `PROJ01-BC-003` |

### Questions for Ahmed

- [ ] **Reference number format:** Is `{ProjectCode}-{TypeCode}-{NNN}` the right format? Or does Pico Play use a different convention?
- [ ] **Client signatures:** Are client approvals tracked as formal signatures in the system, or just as status changes (e.g., "client approved on date X" recorded as metadata)?
- [ ] **Who issues letters?** Always Contracts Manager, or can Project Manager issue certain types?

---

## 7. Receivable / Inflow Linkage Rules

### How Receivables Work in Module 2

M2 introduces a `CommercialReceivable` record that tracks money owed to the entity (Pico Play or subsidiary) per project.

| Source Event | Receivable Action | Amount Source |
|-------------|-------------------|---------------|
| `IPC_CERTIFIED` | Creates receivable | IPC `netCertified` amount |
| `TAX_INVOICE_ISSUED` | Formalizes receivable (links invoice to receivable) | Tax invoice `totalAmount` |
| `CLAIM_SETTLED` | Creates receivable | Claim `settledAmount` |
| `BACK_CHARGE_ISSUED` | Creates receivable (from subcontractor) | Back charge `chargedAmount` |

### Receivable Statuses

| Status | Description |
|--------|-------------|
| `outstanding` | Amount owed, not yet invoiced or collected |
| `invoiced` | Tax invoice issued for this receivable |
| `partially_paid` | Partial payment received |
| `paid` | Fully paid |
| `written_off` | Written off (requires override) |

### What M2 Does vs M4

| Concern | M2 (Commercial) | M4 (Budget/Cost/Cashflow) |
|---------|-----------------|--------------------------|
| Create receivable entries | Yes — via posting events | No |
| Track receivable status | Yes — outstanding/invoiced | Extends with payment tracking |
| Record payments received | No — deferred | Yes |
| Cash flow forecasting | No | Yes |
| Budget impact tracking | No | Yes |
| Contract value ledger | No — VO/CO adjust a `contractValue` field | Yes — full ledger |

### Questions for Ahmed

- [ ] **Receivable granularity:** One receivable per IPC? Or one receivable per tax invoice? (Some systems create the receivable on IPC certification, then link the tax invoice to it.)
- [ ] **Payment tracking in M2:** Should M2 allow marking a tax invoice as `paid` manually? Or is all payment tracking M4?
- [ ] **Contract value field:** Should each Project have a `contractValue` field that VO/CO adjustments update? Or is contract value purely a Module 4 concept?
- [ ] **Write-off:** Writing off a receivable is a significant action. Should it require override (dual-approval per M1 override policy)?

---

## 8. Role-Permission Matrix for Commercial Operations

### Permission Codes (New for M2)

| Resource | Codes |
|----------|-------|
| `ipa` | `ipa.view`, `ipa.create`, `ipa.edit`, `ipa.submit`, `ipa.approve`, `ipa.issue` |
| `ipc` | `ipc.view`, `ipc.create`, `ipc.edit`, `ipc.certify`, `ipc.issue` |
| `vo` | `vo.view`, `vo.create`, `vo.edit`, `vo.submit`, `vo.approve`, `vo.issue` |
| `change_order` | `change_order.view`, `change_order.create`, `change_order.edit`, `change_order.approve`, `change_order.execute` |
| `cost_proposal` | `cost_proposal.view`, `cost_proposal.create`, `cost_proposal.edit`, `cost_proposal.submit`, `cost_proposal.approve` |
| `tax_invoice` | `tax_invoice.view`, `tax_invoice.create`, `tax_invoice.edit`, `tax_invoice.approve`, `tax_invoice.issue` |
| `letter` | `letter.view`, `letter.create`, `letter.edit`, `letter.approve`, `letter.issue` |
| `notice` | `notice.view`, `notice.create`, `notice.edit`, `notice.approve`, `notice.issue` |
| `claim` | `claim.view`, `claim.create`, `claim.edit`, `claim.submit`, `claim.approve`, `claim.issue` |
| `back_charge` | `back_charge.view`, `back_charge.create`, `back_charge.edit`, `back_charge.approve`, `back_charge.issue` |
| `receivable` | `receivable.view` |
| `commercial` | `commercial.dashboard` |
| `screen` | `screen.commercial_ipa`, `screen.commercial_ipc`, `screen.commercial_vo`, `screen.commercial_change_order`, `screen.commercial_cost_proposal`, `screen.commercial_tax_invoice`, `screen.commercial_letter`, `screen.commercial_notice`, `screen.commercial_claim`, `screen.commercial_back_charge`, `screen.commercial_receivable`, `screen.commercial_dashboard` |

### Matrix: Who Can Do What

Legend: **C** = Create, **E** = Edit Draft, **S** = Submit, **R** = Review/Approve, **F** = Finance Check, **G** = Sign, **I** = Issue, **V** = View

| Role | IPA | IPC | VO | CO | CP | Invoice | Letter | Notice | Claim | Back Charge |
|------|-----|-----|----|----|----|---------|---------|---------|---------|----|
| **master_admin** | All | All | All | All | All | All | All | All | All | All |
| **project_director** | V,R,G | V,R,G | V,R,G | V,R,G | V,R | V,R,G | V,R,G | V,R,G,I | V,R,G | V,R,G |
| **project_manager** | V,R | V,R | V,R | V,R | V,R | V | V,R,G,I | V,R | V,R | V,R |
| **contracts_manager** | V,R,I | V,R,I | V,C,E,S,R,I | V,C,E,R,I | V,R | V,R | V,C,E,R,I | V,C,E,R,I | V,C,E,S,R,I | V,R,I |
| **qs_commercial** | V,C,E,S | V,C,E | V,C,E,S | V | V,C,E,S | V | V,C,E | V,C,E | V,C,E,S | V,C,E,S |
| **finance** | V,F | V,F | V | V | V | V,C,E,F,G,I | V | V | V | V,F |
| **cost_controller** | V | V | V | V | V,C,E,F | V | V | V | V,F | V |
| **site_team** | V | V | V,C,E | V | V | V | V,C,E | V | V | V,C,E |
| **design** | V | V | V,C,E | V | V | V | V,C,E | V | V | V |
| **qa_qc** | V | V | V | V | V | V | V | V | V | V,C,E |
| **procurement** | V | V | V | V | V | V | V | V | V | V |
| **document_controller** | V | V | V | V | V | V | V | V | V | V |
| **pmo** | V | V | V | V | V | V | V | V | V | V |
| **executive_approver** | V,R,G | V,R,G | V,R,G | V,R,G | V,R | V,R | V,R | V,R | V,R,G | V,R |

### Questions for Ahmed

- [ ] **Contracts Manager vs QS/Commercial:** I've given Contracts Manager more control (review + issue) and QS/Commercial more operational work (create + edit + submit). Is this split right?
- [ ] **Site Team on VOs:** Site team often initiates VOs (they see the need on site). I've given them create/edit on VOs. Correct?
- [ ] **Finance role on Tax Invoices:** I've given Finance full control over tax invoices (create through issue). Is Finance also the signatory, or does Project Director sign invoices?
- [ ] **QA/QC on Back Charges:** QA/QC often identifies defects that become back charges. I've given them create/edit. Should they also be able to submit?
- [ ] **Executive Approver:** When does this role enter the workflow? Only above a value threshold? Or for specific record types?
- [ ] **PMO:** View-only across all commercial records — correct?
- [ ] **Design and Procurement:** Mostly view-only except Design can initiate VOs and letters. Procurement is view-only in M2 (they get full control in M3). Correct?

---

## 9. Required Screens

### Project-Scoped Screens (inside project workspace)

| Screen | Route | Description |
|--------|-------|-------------|
| Commercial Dashboard | `/projects/{id}/commercial` | Summary cards: active IPAs, pending VOs, receivable totals, recent activity |
| IPA List | `/projects/{id}/commercial/ipa` | Paginated table with status filters, search, create button |
| IPA Detail | `/projects/{id}/commercial/ipa/{id}` | Full record view, status timeline, workflow actions, linked documents, linked IPC |
| IPC List | `/projects/{id}/commercial/ipc` | Paginated table, linked IPA references |
| IPC Detail | `/projects/{id}/commercial/ipc/{id}` | Full record, certification actions, linked tax invoices |
| VO List | `/projects/{id}/commercial/vo` | Paginated table with cost/time impact columns |
| VO Detail | `/projects/{id}/commercial/vo/{id}` | Full record, internal/client approval status, linked cost proposals, linked change order |
| Change Order List | `/projects/{id}/commercial/change-orders` | Paginated table, linked VO references |
| Change Order Detail | `/projects/{id}/commercial/change-orders/{id}` | Full record, execution status |
| Cost Proposal List | `/projects/{id}/commercial/cost-proposals` | Paginated table, linked VO references |
| Cost Proposal Detail | `/projects/{id}/commercial/cost-proposals/{id}` | Full record, cost breakdown |
| Tax Invoice List | `/projects/{id}/commercial/invoices` | Paginated table, amount/VAT columns |
| Tax Invoice Detail | `/projects/{id}/commercial/invoices/{id}` | Full record, VAT breakdown, linked IPC |
| Letter List | `/projects/{id}/commercial/letters` | Paginated table, type filter |
| Letter Detail | `/projects/{id}/commercial/letters/{id}` | Full record, response tracking |
| Notice List | `/projects/{id}/commercial/notices` | Paginated table, deadline column |
| Notice Detail | `/projects/{id}/commercial/notices/{id}` | Full record, response deadline countdown, linked claims |
| Claim List | `/projects/{id}/commercial/claims` | Paginated table, claimed/settled amount columns |
| Claim Detail | `/projects/{id}/commercial/claims/{id}` | Full record, negotiation history, linked notices |
| Back Charge List | `/projects/{id}/commercial/back-charges` | Paginated table, subcontractor/amount columns |
| Back Charge Detail | `/projects/{id}/commercial/back-charges/{id}` | Full record, dispute status |
| Receivable Summary | `/projects/{id}/commercial/receivables` | Table of receivables with status, source record links |

### Admin Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Commercial Workflow Templates | `/admin/workflow-templates` | Existing M1 screen — M2 adds new seeded templates |
| Commercial Permissions | `/admin/roles` | Existing M1 screen — M2 adds new permission codes |

### Navigation

The project workspace gets a new **Commercial** tab/section in the sidebar with sub-navigation for each record type. The top-level nav "Commercial" placeholder (currently "Coming in Module 2") becomes active.

---

## 10. Required Forms and Field Sets

### IPA Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project this IPA belongs to |
| `periodFrom` | Date | Yes | Payment period start |
| `periodTo` | Date | Yes | Payment period end |
| `periodNumber` | Int | Yes | Sequential period number (1, 2, 3...) |
| `grossAmount` | Decimal | Yes | Total gross amount claimed |
| `retentionRate` | Decimal | Yes | Retention percentage (e.g., 10%) |
| `retentionAmount` | Decimal | Yes | Calculated retention held |
| `previousCertified` | Decimal | Yes | Total previously certified (cumulative) |
| `currentClaim` | Decimal | Yes | Net amount claimed this period |
| `advanceRecovery` | Decimal | No | Advance payment recovery this period |
| `otherDeductions` | Decimal | No | Other deductions |
| `netClaimed` | Decimal | Yes | Final net amount claimed |
| `currency` | String | Yes | Currency code (from M1 reference data) |
| `description` | Text | No | Summary description |
| `supportingNotes` | Text | No | Notes for reviewer |

### IPC Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `ipaId` | FK (IPA) | Yes | Source IPA being certified |
| `certifiedAmount` | Decimal | Yes | Amount certified by client representative |
| `retentionAmount` | Decimal | Yes | Retention held |
| `adjustments` | Decimal | No | Adjustments to claimed amount |
| `netCertified` | Decimal | Yes | Net certified for payment |
| `certificationDate` | Date | Yes | Date of certification |
| `currency` | String | Yes | Currency code |
| `remarks` | Text | No | Certification remarks |

### VO Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `title` | String | Yes | VO title/description |
| `description` | Text | Yes | Detailed description of the variation |
| `reason` | Text | Yes | Reason for the variation |
| `initiatedBy` | Enum | Yes | `contractor` or `client` |
| `costImpact` | Decimal | No | Estimated cost impact |
| `timeImpactDays` | Int | No | Estimated time impact in days |
| `contractClause` | String | No | Relevant contract clause reference |
| `currency` | String | Yes | Currency code |

### Change Order Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `voId` | FK (VO) | Yes | Source VO |
| `originalContractValue` | Decimal | Yes | Contract value before this change |
| `adjustmentAmount` | Decimal | Yes | Amount of adjustment |
| `newContractValue` | Decimal | Yes | Contract value after this change |
| `timeAdjustmentDays` | Int | No | Time adjustment in days |
| `description` | Text | Yes | Description of the contract amendment |
| `currency` | String | Yes | Currency code |

### Cost Proposal Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `voId` | FK (VO) | Yes | Related VO |
| `revisionNumber` | Int | Yes | Revision number (1, 2, 3...) |
| `estimatedCost` | Decimal | Yes | Total estimated cost |
| `estimatedTimeDays` | Int | No | Estimated time impact |
| `methodology` | Text | No | Proposed methodology |
| `costBreakdown` | JSON | No | Structured cost breakdown (labor, materials, equipment, overhead) |
| `currency` | String | Yes | Currency code |

### Tax Invoice Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `ipcId` | FK (IPC) | Yes | Source IPC |
| `invoiceNumber` | String | Yes | Sequential invoice number (auto-generated) |
| `invoiceDate` | Date | Yes | Invoice date |
| `grossAmount` | Decimal | Yes | Pre-tax amount |
| `vatRate` | Decimal | Yes | VAT rate (e.g., 0.15) |
| `vatAmount` | Decimal | Yes | Calculated VAT |
| `totalAmount` | Decimal | Yes | Gross + VAT |
| `dueDate` | Date | No | Payment due date |
| `currency` | String | Yes | Currency code |
| `buyerName` | String | Yes | Client name |
| `buyerTaxId` | String | No | Client tax registration number |
| `sellerTaxId` | String | Yes | Our tax registration number (from entity) |

### Letter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `letterType` | Enum | Yes | `instruction`, `response`, `transmittal`, `general` |
| `subject` | String | Yes | Subject line |
| `body` | Text | Yes | Letter body |
| `recipientName` | String | Yes | Recipient name |
| `recipientOrg` | String | No | Recipient organization |
| `inReplyTo` | FK (Letter) | No | Reference to letter being replied to |

### Notice Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `noticeType` | Enum | Yes | `delay`, `claim`, `extension_of_time`, `dispute`, `force_majeure`, `general` |
| `subject` | String | Yes | Subject |
| `body` | Text | Yes | Notice body |
| `contractClause` | String | No | Relevant contract clause |
| `responseDeadline` | Date | No | Deadline for recipient response |
| `recipientName` | String | Yes | Recipient name |
| `recipientOrg` | String | No | Recipient organization |

### Claim Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `claimType` | Enum | Yes | `time_extension`, `additional_cost`, `time_and_cost` |
| `title` | String | Yes | Claim title |
| `description` | Text | Yes | Detailed description |
| `claimedAmount` | Decimal | No | Amount claimed (if cost/time+cost) |
| `claimedTimeDays` | Int | No | Days claimed (if time/time+cost) |
| `settledAmount` | Decimal | No | Amount settled (filled on settlement) |
| `settledTimeDays` | Int | No | Days settled (filled on settlement) |
| `contractClause` | String | No | Relevant contract clause |
| `noticeId` | FK (Notice) | No | Originating notice |
| `currency` | String | Yes | Currency code |

### Back Charge Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | FK (Project) | Yes | Project |
| `subcontractorName` | String | Yes | Subcontractor name (free text in M2; FK in M3) |
| `reason` | Text | Yes | Reason for back charge |
| `category` | Enum | Yes | `defect`, `delay`, `non_compliance`, `damage`, `other` |
| `chargedAmount` | Decimal | Yes | Amount charged |
| `evidenceDescription` | Text | No | Description of supporting evidence |
| `currency` | String | Yes | Currency code |

---

## 11. Required Reports and Dashboards

### Project Commercial Dashboard (`/projects/{id}/commercial`)

| Card | Content |
|------|---------|
| **Payment Summary** | Total certified (IPC sum), total invoiced, total outstanding receivables |
| **Active IPAs** | Count of non-terminal IPAs, total net claimed |
| **Pending VOs** | Count of VOs not yet executed, total cost impact |
| **Open Claims** | Count of claims under negotiation, total claimed amount |
| **Recent Activity** | Last 10 commercial audit log entries for this project |
| **Receivable Aging** | Outstanding receivables grouped by age (0-30, 31-60, 61-90, 90+ days) |

### Questions for Ahmed

- [ ] **Report depth:** Should M2 include any PDF-exportable reports (e.g., IPA summary report, receivable statement)? Or is M2 screens-only, with PDF reports deferred?
- [ ] **Cross-project commercial view:** Should there be a portfolio-level commercial dashboard (across all projects)? Or is all commercial data strictly project-scoped in M2?
- [ ] **Receivable aging:** Is the aging breakdown (0-30, 31-60, etc.) useful for M2, or is that more of an M4 (cashflow) concern?

---

## Summary of All Questions for Ahmed

### Record Model (Section 1)
1. VO vs Change Order relationship — always from VO, or independent?
2. Cost Proposal as standalone record or sub-record of VO?
3. Letter subtypes — enumerated types or free-text?
4. Notice types — which ones?
5. Back charge target — free text or subcontractor FK?

### Statuses (Section 2)
6. IPA "superseded" — correct term when revised?
7. Tax Invoice "paid" — tracked in M2 or M4?
8. Back Charge dispute flow — goes back to review?
9. Claim partial settlement — store both amounts?
10. Any missing statuses?

### Workflows (Section 3)
11. VO dual workflow — two separate or one continuous?
12. Letter reviewer flexibility — always Contracts Manager?
13. Executive Approver — value threshold trigger?
14. Workflow step counts — roughly right?

### Posting (Section 4)
15. IPA_APPROVED — post it or skip?
16. VO contract value adjustment — automatic or M4?
17. VAT rate — always 15% or configurable?
18. ZATCA Phase 2 — in M2 or deferred?
19. Claim types — time, cost, time+cost, others?
20. Back charge receivable direction — confirm owed TO us?

### Sign/Issue (Section 6)
21. Reference number format — correct convention?
22. Client signatures — formal or metadata?
23. Who issues letters?

### Receivables (Section 7)
24. Receivable granularity — per IPC or per invoice?
25. Payment tracking — in M2 or M4?
26. Contract value field on Project — yes or M4?
27. Write-off — require override?

### Permissions (Section 8)
28. Contracts Manager vs QS/Commercial split — correct?
29. Site Team on VOs — correct?
30. Finance on Tax Invoices — signatory?
31. QA/QC on Back Charges — can submit?
32. Executive Approver — when and where?
33. PMO — view only?
34. Design and Procurement — correct scope?

### Reports (Section 11)
35. PDF reports — in M2 or deferred?
36. Cross-project commercial view — yes or no?
37. Receivable aging — M2 or M4?
