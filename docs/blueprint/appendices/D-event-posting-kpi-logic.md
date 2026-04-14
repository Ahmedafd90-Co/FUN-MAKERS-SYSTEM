# Appendix D — Event / Posting / KPI Logic

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — posting events and KPI formulas evolve as modules are built. See `guardrails/03-posting-semantics.md` for the authoritative posting event classification.

---

## D.1 Posting Design Principle

Business records do not directly mutate dashboard totals. They emit controlled posting events after validation. The posting-service is the **only** component allowed to write `posting_events`.

---

## D.2 Event States

Drafted, Submitted, Reviewed, Approved, Signed, Issued, Posted, Reversed, Superseded, Cancelled

---

## D.3 Posting Engine Rules

A record posts only when:
- It passed required workflow approvals
- Required signature exists where applicable
- Mapping to project / budget / contract / vendor is valid
- Duplicate checks passed
- No blocking exceptions remain

---

## D.4 Posting Event Catalog

### Commercial Events

| Event | Owning Service | Financial Effect |
|---|---|---|
| `IPA_APPROVED` | commercial-service | Receivable pipeline (potential) |
| `IPC_SIGNED` | commercial-service | Certified receivable (confirmed) |
| `TAX_INVOICE_ISSUED` | commercial-service | Receivable due (invoiced) |
| `VARIATION_APPROVED_INTERNAL` | commercial-service | Pending commercial exposure (internal commitment) |
| `VARIATION_APPROVED_CLIENT` | commercial-service | Contract/revenue uplift (binding commitment + confirmed receivable) |
| `CLAIM_ISSUED` | commercial-service | Claim exposure register (informational — not receivable) |
| `BACK_CHARGE_ISSUED` | commercial-service | Recovery exposure register (informational — not receivable) |

### Procurement Events

| Event | Owning Service | Financial Effect |
|---|---|---|
| `RFQ_AWARDED` | procurement-service | **Informational only** — no commitment (PO creates commitment) |
| `PURCHASE_ORDER_ISSUED` | procurement-service | Commitment uplift |
| `SUPPLIER_INVOICE_APPROVED` | procurement-service | Payable pipeline |
| `EXPENSE_APPROVED` | procurement-service | Payable + actual cost |
| `PAYMENT_APPROVED` | procurement-service | Actual cost realized |

### Budget Events

| Event | Owning Service | Financial Effect |
|---|---|---|
| `REALLOCATION_POSTED` | budget-service | Budget movement (same project, informational) |
| `PROJECT_TRANSFER_POSTED` | budget-service | Cross-project movement (watch — may affect both projects' actual cost) |

### Document Events

| Event | Owning Service | Financial Effect |
|---|---|---|
| `DOCUMENT_SIGNED` | document/signature-service | Lock signed version (informational) |
| `DOCUMENT_SUPERSEDED` | document-service | Retire live version (informational) |

### Credit Events (Future)

| Event | Owning Service | Financial Effect |
|---|---|---|
| `CREDIT_NOTE_APPLIED` | procurement-service | Reduces payable + reduces actual cost (additive negative posting) |

---

## D.5 Event Payload Standard

Each posting event carries:

| Field | Required | Purpose |
|---|---|---|
| event_id | Yes | Unique identifier |
| event_type | Yes | Event classification |
| source_record_type | Yes | Type of originating business record |
| source_record_id | Yes | ID of originating business record |
| project_id | Yes | Project scope |
| budget_line_id | No | Budget mapping where applicable |
| contract_id | No | Contract mapping where applicable |
| vendor_id | No | Vendor mapping where applicable |
| amount | No | Financial value (null for informational events) |
| currency_code | No | Currency of amount |
| posting_date | Yes | Timestamp |
| initiated_by | Yes | User or agent who triggered |
| approved_by | No | User who approved underlying record |
| note | No | Context |
| idempotency_key | Yes | Prevents duplicate posting |
| status | Yes | pending -> posted / failed; posted -> reversed |
| payload | No | JSONB for event-specific detail |

---

## D.6 Reversal Logic

- System creates a new reversing event; original event remains in history
- Totals corrected by additive reversal, not destructive deletion
- Only mutation on original event: setting `reversedByEventId` back-pointer
- `posting.reverse_silently` is permanently blocked (override never-list)

---

## D.7 Dead-End Handling

If posting fails after approval:
- Record status becomes **Approved — Posting Exception**
- Exception queue created
- Finance / Cost / Admin notified
- Only authorized users can resolve and repost

---

## D.8 Posting Rules Summary

1. posting-service is the only writer of posting_events
2. Business services request posting; posting-service validates and executes
3. Duplicate posting prevented by idempotency key
4. Reversal always creates a new reversing event
5. Dashboards must read posted facts or KPI snapshots, never draft records directly
6. Informational events must never feed financial aggregates

---

## D.9 KPI Formulas

### Budget KPIs
- **Budget Burn Ratio:** actual_cost / current_budget
- **Commitment Ratio:** committed_cost / current_budget
- **Forecast Overrun Ratio:** forecast_cost / current_budget
- **Available Budget Ratio:** available_balance / current_budget

### Receivable KPIs
- **Collection Efficiency Ratio:** actual_inflow / forecast_inflow
- **Certified-to-Claimed Ratio:** cumulative_certified / cumulative_claimed
- **Receivable Aging Ratio:** overdue_receivables / total_open_receivables

### Payable KPIs
- **Payable Pressure Ratio:** overdue_payables / total_open_payables
- **Committed-to-Actual Spend Ratio:** committed_cost / NULLIF(actual_cost, 0)

### Approval Process KPIs
- **Approval Turnaround Time:** approval_completed_at - submission_at
- **Overdue Approval Rate:** overdue_approvals / total_open_approvals
- **Return/Rework Ratio:** returned_records / total_submitted_records

### Commercial Risk KPIs
- **VO Pending Exposure Ratio:** pending_vo_value / current_contract_value
- **Claim Exposure Ratio:** open_claim_value / current_contract_value
- **Back Charge Recovery Ratio:** recovered_value / issued_value

### Procurement KPIs
- **Procurement Cycle Time:** award_date - rfq_issue_date
- **Vendor Concentration Ratio:** top_vendor_spend / total_procurement_spend

### Cashflow KPIs
- **Cashflow Variance Ratio:** (actual_inflow - actual_outflow) / NULLIF(forecast_inflow - forecast_outflow, 0)
- **Inflow Coverage Ratio:** forecast_inflow / NULLIF(forecast_outflow, 0)

---

## D.10 Composite Project Health Score

Example weighted model:

| Component | Weight |
|---|---|
| Budget health | 20% |
| Receivables health | 20% |
| Payables/cash pressure | 15% |
| Approval performance | 10% |
| Commercial risk | 15% |
| Procurement efficiency | 10% |
| Claims/notice/dispute exposure | 10% |

`project_health_score = sum(weighted_normalized_metric_scores)`

---

## D.11 Red Flag Logic

Trigger red flag if any occur:

| Condition | Threshold |
|---|---|
| Budget burn ratio | > 0.90 before planned progress threshold |
| Receivable aging ratio | > 0.30 |
| Payable pressure ratio | > 0.25 |
| Overdue approval rate | > 0.20 |
| Pending VO exposure ratio | > 0.15 |
| Collection efficiency ratio | < 0.70 |
