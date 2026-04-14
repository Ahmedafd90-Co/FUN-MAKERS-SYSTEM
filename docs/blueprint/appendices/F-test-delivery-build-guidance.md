# Appendix F — Test / Delivery / Build Guidance

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — build guidance evolves as modules ship. Module scope-lock and closeout documents are authoritative for implemented modules.

---

## F.1 Mandatory Build Order

| Order | Module | Name |
|---|---|---|
| 1 | M1 | Shared Core Platform |
| 2 | M2 | Commercial / Contracts Engine |
| 3 | M3 | Procurement / Purchasing Engine |
| 4 | M4 | Budget / Cost / Cashflow Engine |
| 5 | M5 | KPI / PMO Engine |
| 6 | M6 | Contract Intelligence Engine |
| 7 | M7 | Agent Layer & Admin Control Enhancements |

No later module may bypass or replace the controls of earlier modules.

---

## F.2 Delivery Strategy

Module by module on one shared architecture. Start each module after the previous module passes its gate.

### Per-Module Deliverables

For each module deliver:
1. Database migrations
2. Seed data for roles and test records
3. Backend services
4. API endpoints (tRPC routers)
5. UI screens
6. Audit logging
7. Automated tests
8. Admin tools where relevant
9. Brief implementation note

### Module Gate Criteria

Stop after each module with:
- Schema diff (zero drift)
- Service summary
- API summary
- Test summary
- Unresolved issues list

---

## F.3 Service Breakdown

| Service | Responsibilities |
|---|---|
| auth-service | Login/logout, session/token, MFA, service account auth |
| access-control-service | Role enforcement, screen permissions, project assignment, override permissions |
| project-master-service | Projects, settings, packages, cost codes, budget line masters, entity associations |
| workflow-service | Templates, instances, actions, approvals/returns/rejections/escalations, delegation, SLA |
| document-service | Uploads, versions, current/live version rules, immutable signed records, metadata, retrieval |
| signature-service | Signature profiles, application, validation metadata, sign-lock enforcement |
| commercial-service | IPA, IPC, VO/CO, tax invoices, correspondence, commercial validation rules |
| procurement-service | RFQs, quote comparisons, supplier invoices, expenses, procurement validation |
| budget-service | Commitments, actual cost postings, budget line balances, reallocations, cross-project transfers |
| cashflow-service | Receivables, payables, monthly cashflow snapshots, aging calculations, due status |
| posting-service | Event creation, validation, execution, reversal, exception queue, idempotent protection |
| kpi-service | KPI formulas, score normalization, snapshots, health scores, PMO rollups |
| contract-intelligence-service | OCR, contract parsing, clause/BOQ extraction, knowledge approval, contextual lookups |
| agent-orchestration-service | Agent job routing, queue status, confidence thresholds, human review, execution logs |
| admin-control-service | Admin override panel, workflow/posting remediation, config, entity allocation, system logs |
| reporting-service | Project reports, executive summaries, export generation, scheduled snapshots |

---

## F.4 Testing Strategy

### Required Test Layers

1. Unit tests for calculation and validation rules
2. Integration tests for workflow + posting + dashboards
3. Permission tests for role restrictions
4. API contract tests
5. Document extraction regression tests
6. Posting reversal tests
7. Signature lock tests
8. Cross-project transfer authority tests
9. Entity allocation calculation tests
10. End-to-end tests for critical operational flows

### Critical E2E Test Cases

| # | Scenario |
|---|---|
| 1 | Create IPA -> review -> PD sign -> post receivable |
| 2 | Create IPC -> finance check -> PD sign -> certified value updates |
| 3 | Create RFQ -> compare quotes -> approve award -> commitment updates |
| 4 | Create supplier invoice -> finance approve -> payable updates |
| 5 | PM same-project reallocation succeeds with mandatory note |
| 6 | PM cross-project transfer blocked |
| 7 | PD cross-project transfer succeeds after finance validation |
| 8 | Signed document edit blocked |
| 9 | Returned record corrected and resubmitted |
| 10 | Posting exception routed to admin queue |
| 11 | OCR low confidence flagged and blocked from approved use |
| 12 | Allocation rule splits posting event across entities |
| 13 | PMO dashboard shows aggregated KPI without edit access |
| 14 | Master Admin override logs before/after values |
| 15 | Material request routes through configured chain |
| 16 | Material with design + QA/QC + shop drawing follows extended template |
| 17 | Vendor shop drawing rejected and resubmitted, history traceable |
| 18 | "Approved with Comments" status tracked correctly |
| 19 | Fabrication/delivery countdown updates correctly |
| 20 | Testing-required material cannot close until test completed or waived |
| 21 | Testing lab invoice links to material tracker and payable flow |
| 22 | Subcontract-linked material shows in project + master procurement tracker |

### Release Gate Criteria

A module may only move to UAT when:
- Critical unit tests pass
- Integration tests pass
- Permission tests pass
- No blocker posting defects remain
- Audit logs confirmed for critical actions
- Acceptance criteria for module user stories are met

---

## F.5 Non-Production Safety Modes

- Development environment
- Test / QA environment
- Staging / UAT environment
- Production environment
- Feature flags for risky modules
- Dry-run mode for posting simulations
- Sandbox mode for AI extraction review

---

## F.6 Mandatory Tech Behavior

- No hard delete for critical records
- All critical actions auditable
- All financial movements reversible by additive reversal only
- All cross-project movement PD-controlled only
- All project workspaces isolated by permission
- All AI outputs reviewable before operational use
- All material workflow requirements configurable through flags/templates

---

## F.7 Master Admin Control Panel Requirements

Master Admin must have a dedicated control panel to:
- Manage users, roles, project assignments
- Manage workflow templates and thresholds
- Manage screen permissions
- Manage entities and allocation rules
- Preview posting rules
- Manage exception queues
- Inspect failed posting events and trigger controlled reposts
- Review agent queues and low-confidence items
- Approve/reject configuration changes
- Inspect override logs
- View system health and job status

---

## F.8 User Stories (Summary)

### Shared Core
- Master Admin configures projects, users, roles, workflows
- Users see only assigned projects and actions
- PMO users see KPI rollups without edit rights

### Commercial
- QS/Commercial prepares IPA with BOQ and clause support; approved IPA posts receivable

### Procurement
- Purchaser compares vendor quotations and routes recommendation; approved RFQ award posts commitment

### Budget
- PM reallocates within project with mandatory note; posted reallocation updates balances and audit log

### KPI / PMO
- PD sees project health KPIs; red flags visible with drilldown; KPI data sourced from approved posting events only

### Contract Intelligence
- System extracts clauses and BOQs from contract PDFs; extraction requires reviewer approval before operational use

---

## F.9 Integration Requirements

### Internal
- Workflow engine to all transaction modules
- Document module to every business record
- Signature engine to documents and approvals
- Posting engine to budget and cashflow
- Notification service to workflow actions
- Commercial engine to receivable/inflow dashboards
- Procurement engine to payable/outflow dashboards
- KPI engine to commercial, procurement, budget, cashflow data

### External (Future)
- ERP / accounting system
- E-signature provider
- Email notifications and issue transmittals
- DMS / EDMS connectors if required
- BI / reporting tools (Power BI)
