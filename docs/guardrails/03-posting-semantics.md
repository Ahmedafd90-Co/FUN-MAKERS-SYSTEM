# Guardrail 3 — Posting Semantics

**Purpose:** Define the exact financial meaning of every posting event. Stop fake financial truth in dashboards and reports. Prevent future modules from treating informational events as ledger-grade facts.

**Applies to:** All modules. Review when adding any new posting event type or dashboard aggregate.

---

## Classification Key

| Term | Definition |
|---|---|
| **Commitment** | A binding promise to pay or receive. Changes the project's committed value. |
| **Payable** | An obligation to pay a vendor/supplier. Creates an accounts-payable entry. |
| **Receivable** | An obligation from the client to pay us. Creates an accounts-receivable entry. |
| **Actual Cost** | Money has moved or is confirmed moving. Affects realized cost. |
| **Informational** | Operational event with no direct financial consequence. Useful for dashboards but not for financial statements. |
| **Dashboard-trusted** | Can be shown in KPI dashboards as a reliable number. |

---

## Current Posting Events (Live in DB + Code)

| Event | Source Module | Business Meaning | Commitment? | Payable? | Receivable? | Actual Cost? | Informational Only? | Dashboard-Trusted? | Reversible? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `IPA_APPROVED` | M2 Commercial | Interim Payment Application approved internally | No | No | **Yes — potential** | No | No | Yes — as pending receivable | Yes — additive reversal | Not yet client-confirmed. Becomes receivable when issued/certified. |
| `IPC_SIGNED` | M2 Commercial | Interim Payment Certificate signed by PD | No | No | **Yes — confirmed** | No | No | Yes | Yes — additive reversal | Strongest receivable signal. Client owes this. |
| `TAX_INVOICE_ISSUED` | M2 Commercial | Tax invoice issued to client | No | No | **Yes — invoiced** | No | No | Yes | Yes — additive reversal | Legal document. Triggers collection tracking. |
| `VARIATION_APPROVED_INTERNAL` | M2 Commercial | Variation approved internally | **Yes — internal commitment** | No | No | No | No | Yes — as potential value | Yes — additive reversal | Internal approval only. Not binding on client yet. |
| `VARIATION_APPROVED_CLIENT` | M2 Commercial | Client approved the variation | **Yes — binding** | No | **Yes — confirmed** | No | No | Yes | Yes — additive reversal | Client has agreed. Contract value changes. |
| `CLAIM_ISSUED` | M2 Commercial | Claim notice issued to client | No | No | No | No | **Yes** | Partial — count only, not value | Yes — additive reversal | Claim is a position statement. Not a receivable until resolved. |
| `BACK_CHARGE_ISSUED` | M2 Commercial | Back charge notice issued | No | No | No | No | **Yes** | Partial — count only, not value | Yes — additive reversal | Back charge is a recovery attempt. Not payable/receivable until settled. |
| `VENDOR_CONTRACT_SIGNED` | M3 Procurement | Vendor contract fully signed | **Yes — binding** | No | No | No | No | Yes — as committed spend | Yes — additive reversal | Creates a binding purchase commitment. |

---

## Future Events (Not Yet Implemented — Pre-Classification)

These events will be introduced in Modules 4-7. Classifying them now prevents semantic drift.

| Event | Expected Module | Business Meaning | Commitment? | Payable? | Receivable? | Actual Cost? | Informational? | Notes |
|---|---|---|---|---|---|---|---|---|
| `RFQ_AWARDED` | M3 Procurement | RFQ evaluation complete, vendor selected | No | No | No | No | **Yes** | Awarding an RFQ does not create a commitment. The PO does. |
| `PURCHASE_ORDER_ISSUED` | M3 Procurement | Purchase order issued to vendor | **Yes — binding** | No | No | No | No | Creates a commitment to pay. PO value = committed cost. |
| `SUPPLIER_INVOICE_APPROVED` | M3 Procurement | Supplier invoice verified and approved | No | **Yes** | No | No | No | Triggers payment processing. Moves from committed to payable. |
| `EXPENSE_APPROVED` | M3 Procurement | Direct expense approved | No | **Yes** | No | **Yes** | No | Small spend — both payable and actual cost simultaneously. |
| `PAYMENT_APPROVED` | M4+ Finance | Payment approved for release | No | No | No | **Yes** | No | Money confirmed leaving. Actual cost realized. |
| `REALLOCATION_POSTED` | M4+ Budget | Budget reallocation between cost codes | No | No | No | No | **Yes** | Internal budget movement. No external financial effect. |
| `PROJECT_TRANSFER_POSTED` | M4+ Budget | Cost transfer between projects | **Watch** | No | No | **Watch** | No | Needs PD dual approval. May affect both projects' actual cost. |
| `DOCUMENT_SIGNED` | M1 Core | Document version signed | No | No | No | No | **Yes** | Operational event. Does not change financial state. |
| `DOCUMENT_SUPERSEDED` | M1 Core | Document version superseded | No | No | No | No | **Yes** | Operational event. Triggers immutability on prior version. |
| `CREDIT_NOTE_APPLIED` | M3 Procurement | Credit note applied to payables | No | **Reduces payable** | No | **Reduces actual** | No | Additive — creates a negative posting, not a mutation. |

---

## Hard Rules

| # | Rule | Enforcement |
|---|---|---|
| 1 | **Posting service is the only writer of posting events.** No service may insert directly into `posting_events`. | All events go through `postingService.post()` which enforces idempotency key, schema validation, and audit logging. |
| 2 | **Reversals are additive only.** The original event is never mutated (except the `reversedByEventId` back-pointer). A new reversal event is created. | `reversePostingEvent()` in `core/posting/reversal.ts`. `posting.reverse_silently` is in the override `never` list. |
| 3 | **Informational events must never feed financial aggregates.** `CLAIM_ISSUED`, `BACK_CHARGE_ISSUED`, `RFQ_AWARDED`, `REALLOCATION_POSTED`, `DOCUMENT_SIGNED`, `DOCUMENT_SUPERSEDED` must not be summed into commitment, payable, receivable, or actual cost totals. | Dashboard queries must filter by event type. No `SUM(*)` across all events. |
| 4 | **A posting event's payload schema is immutable after first use.** Changing the Zod schema for an event type that already has rows in `posting_events` requires a new event type version, not a mutation of the existing schema. | Event registry in `core/posting/event-registry.ts`. Not yet DB-enforced — **watch item**. |
| 5 | **Dashboards read from posted state, not from draft/in-progress state.** A record that hasn't triggered its posting event doesn't exist for financial reporting. | Dashboard services query `posting_events` with `status = 'posted'`, not the source tables directly. |
| 6 | **No event may exist without a source record.** Every posting event carries `source_record_type` and `source_record_id`. Orphan events are a data integrity violation. | Schema-enforced: both fields are required (NOT NULL). |
| 7 | **The `status` field on posting events is append-only.** Transitions: `pending → posted`, `pending → failed`, `posted → reversed` (only via reversal event). No other transitions. | Application logic. The `PostingEvent` model is in the `no-delete-on-immutable` list. |

---

## Dashboard Trust Matrix

| What dashboards can show | Source | Trusted? |
|---|---|---|
| Total committed value | Sum of commitment events (`VARIATION_APPROVED_CLIENT`, `VENDOR_CONTRACT_SIGNED`, future `PURCHASE_ORDER_ISSUED`) | **Yes** — if filtered to `status = 'posted'` and not reversed |
| Total receivable | Sum of `IPC_SIGNED` + `TAX_INVOICE_ISSUED` | **Yes** — with same filter |
| Total payable | Sum of future `SUPPLIER_INVOICE_APPROVED` + `EXPENSE_APPROVED` | **Yes** — when implemented |
| Actual cost | Sum of future `PAYMENT_APPROVED` + `EXPENSE_APPROVED` | **Yes** — when implemented |
| Pending claims count | Count of `CLAIM_ISSUED` not reversed | **Partial** — count only, not financial value |
| Draft record totals | Direct query on source tables | **No** — not financially trusted. Label as "estimated" or "pending" |
