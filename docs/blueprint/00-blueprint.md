# Pico Play Fun Makers KSA — Authoritative Blueprint

**System Name:** Pico Play Fun Makers KSA
**Document Type:** Governing Blueprint (stable business + architecture truth)
**Volatile detail:** Moved to referenced appendices A-F
**Source:** Refactored from "Integrated Project Approval & Commercial Control System" canvas (142K chars, 32 sections)

---

## Source of Truth Declaration

**This document is the single governing blueprint for Pico Play Fun Makers KSA.**

| Layer | Documents | Role |
|---|---|---|
| **Governing blueprint** | This document (`00-blueprint.md`) | What the system does and why — business objectives, scope, roles, business rules, architecture principles, module roadmap |
| **Governance guardrails** | `guardrails/01-policy-ownership-map.md`, `02-master-data-governance-map.md`, `03-posting-semantics.md` | Hard controls, data governance, posting semantics — binding architecture/governance notes |
| **Detailed appendices** | `appendices/A` through `appendices/F` | Volatile reference material: workflows, schema, screens, posting/KPI logic, AI/agent design, test/build guidance |
| **Module documents** | `module-*-scope-lock.md`, `module-*-implementation-plan.md`, `module-*-closeout.md` | Per-module decisions, implementation detail, verification results |
| **Live codebase** | Prisma schema, tRPC routers, service code, tests | Implementation source of truth — authoritative for "how it actually works" |

**Precedence order** (highest first):
1. Hardened codebase behavior (what is actually enforced)
2. Guardrail documents (what must be enforced)
3. This blueprint (what the system should do and why)
4. Relevant appendix (detailed reference)
5. Module scope-lock / design spec / implementation plan
6. Legacy canvas document (historical context only)

**What belongs here:** Stable program-level governance — objectives, scope, roles, business rules, architecture principles, engine structure, module roadmap, NFRs.

**What does NOT belong here:** Database schemas, API endpoint lists, wireframe specs, field-by-field forms, KPI formulas, test plans, build prompts, developer instructions. These belong in appendices or module documents.

The legacy canvas document ("Integrated Project Approval & Commercial Control System") is **superseded** as a governing document. See `LEGACY-CANVAS-SUPERSEDED.md` for transition rules.

---

## 1. Purpose

Define the business objectives, scope, governance rules, architecture principles, engine structure, module roadmap, and non-functional requirements for a unified internal approval, document control, signature, budget, and cashflow platform for construction project delivery.

This document is the **single authoritative reference** for what the system does and why. Implementation-specific detail (schemas, wireframes, API lists, test plans, KPI formulas, AI pipelines) lives in the appendices and is expected to evolve as modules are built.

---

## 2. Executive Summary

The platform is an **internal-only, role-based construction project approval and control system** designed to manage the full approval lifecycle for commercial, contractual, procurement, and internal cost-related records.

It replaces fragmented approvals across email, uncontrolled PDFs, spreadsheets, and disconnected manual registers.

The platform is structured around **separate but integrated engines:**

| Engine | Owner | Core Function |
|---|---|---|
| Commercial / Contracts | Contracts / QS / Commercial | Records issued from our side to the client |
| Procurement / Purchasing | Procurement department | Internal purchasing and vendor-related approvals |
| Budget / Cost / Cashflow | Finance / Cost Control | Budget lines, commitments, actuals, cashflow |
| Project Health & KPI | PD / PMO | Project-level health scoring and executive dashboards |
| Contract Intelligence | Contracts (restricted) | AI-assisted clause/BOQ extraction and correspondence support |
| Agent Layer | System-managed | Assistive AI agents behind verification gates |

The platform shall:
- Record, route, approve, sign, and archive key documents and transactions
- Maintain full traceability for claims, audits, and management review
- Connect all approved records to budget, commitment, cost, receivables, payables, cashflow, and dashboard reporting
- Segregate responsibilities by department while keeping an integrated project-level financial picture
- Generate detailed operational reports and high-level executive reports

**Product character:** The system is operator-first and register-driven. It must be easy to navigate for non-technical project teams who use it daily, and hard to misuse by design. It is not an ERP-style form swamp. Every screen earns its existence by serving a real daily workflow. As the system grows across modules, this discipline must hold — new capability is added through focused, purposeful screens, not through sprawling configuration surfaces.

---

## 3. Business Objectives

1. Standardize internal approvals across all projects
2. Separate commercial/contracts workflows from procurement/purchasing workflows while keeping both integrated financially
3. Ensure all client-facing records are fully traceable and controlled by the Contracts / QS / Commercial team
4. Ensure all procurement and internal cost approvals are fully traceable and controlled by the Procurement / Purchasing team
5. Link every approved transaction directly to budget dashboards and cashflow dashboards
6. Track receivables and payables through structured approval and reporting workflows
7. Create reliable project health indicators and KPIs for each project
8. Provide Project Directors with project-level health visibility through a dedicated restricted dashboard engine
9. Improve executive decision-making through detailed and summary reporting
10. Build searchable institutional memory for disputes, claims, audits, and management reference

---

## 4. Scope

### 4.1 In Scope

**Internal-only system.** Not an external collaboration portal in initial release.

| Engine | Scope Summary |
|---|---|
| Commercial / Contracts | IPA, IPC, VO, change orders, cost proposals, tax invoices, letters, notices, claims, back charges, commercial correspondence, receivable pipeline |
| Procurement / Purchasing | RFQs, quotation comparisons, supplier contracts, BOQ-linked purchasing, supplier invoices, payment approvals, expenses (tickets, accommodation, transport, equipment), vendor payable pipeline |
| Budget / Cost / Cashflow | Budget lines, cost codes, packages, commitments, actuals, accruals, forecasts, same-project reallocations, cross-project transfers, receivables/payables ledgers, monthly cashflow |
| Project Health & KPI | Health scoring, KPI computation, red flag alerts, PD dashboards, PMO portfolio rollups |
| Contract Intelligence | OCR, clause extraction, BOQ extraction, received letter analysis, draft reply support, approved knowledge store |
| Governance | Role-based permissions, approval matrix, delegation, digital signatures, audit trail, notifications, project data isolation, cross-project transfer controls |
| Reporting | Operational, project-specific, department, executive summary, budget, cashflow, receivable, payable, KPI reports |

### 4.2 Out of Scope (Initial Release)

- Full accounting ledger replacement
- HR and payroll
- Full ERP replacement
- Full BIM model coordination
- Site progress capture from IoT or drones
- External client portal (potential later phase)

---

## 5. Stakeholders and Department Ownership

### Primary Stakeholders

| Role | Responsibility |
|---|---|
| Project Director (PD) | High-value approvals, signs key records, reviews commercial and budget impact, views dashboards |
| Project Manager (PM) | Operational need review, project relevance, site execution linkage |
| Design Manager | Technical compliance, design compatibility, specifications, drawing alignment |
| Purchaser / Procurement Manager | Creates procurement records, obtains quotations, uploads supplier documents |
| QS / Commercial Manager | Quantity, entitlement, budget, contract value, VO logic, payment status, cost code accuracy |
| Contracts Manager | Contractual language, notices, amendments, obligations, commercial documents |
| Finance Manager | Tax, prior payment status, payment readiness, cash position, financial compliance |
| Cost Controller | Budget line mapping, commitment tracking, actuals, accruals, forecast positions |
| Document Controller | Numbering, metadata, version status, archive, retrieval, issue workflows |
| Executive Approver | Final approval for selected categories or thresholds |
| System Administrator (Master Admin) | Workflow configuration, role assignment, permissions, master data, templates, system settings |

### Department Ownership

| Engine | Owner Department(s) |
|---|---|
| Commercial / Contracts | Contracts, QS, Commercial teams |
| Procurement / Purchasing | Procurement, Purchasing departments |
| Project Health & KPI (viewer) | PD, selected executives |
| Budget / Cost / Cashflow | Finance, Cost Control (shared) |
| Contract Intelligence | Contracts (restricted support access) |

### Secondary Stakeholders

Site Engineers, Technical Office, Planning Team, Internal Audit, Legal Team

---

## 6. User Roles and Authority Model

### 6.1 Core Roles (14 Seeded)

Project Director, Project Manager, Design Manager, Purchaser / Procurement Manager, QS / Commercial Manager, Contracts Manager, Finance Manager, Cost Controller, Document Controller, Executive Approver, System Administrator (Master Admin), Site Team, QA/QC, PMO

### 6.2 Permission Types

Create, Edit draft, Submit for review, Review/comment, Approve, Reject, Return for correction, Sign, Issue externally, Supersede, Archive, View restricted records, Admin configure

### 6.3 Delegation of Authority

- Value-based thresholds
- Temporary delegation during leave
- Project-specific authority differences
- Document-type-specific authority
- Mandatory escalation when threshold exceeded

### 6.4 Project Budget Transfer Authority

| Rule | Enforced By |
|---|---|
| Each project operates as a fully separate working environment | Project scope isolation |
| No user may move budget between projects without PD approval | Workflow + posting controls |
| Only PD may approve inter-project transfers | Mandatory PD step in workflow |
| PM may adjust allocations only within the same project | Application logic + scope binding |
| Inter-project transfers require dedicated approval workflow with mandatory justification | Workflow template + audit |
| Intra-project reallocations require mandatory note and full change logging | Posting service + audit log |

---

## 7. Business Rules

These are the authoritative business rules. Implementation controls are mapped in `guardrails/01-policy-ownership-map.md`.

1. The platform is internal-only
2. Commercial/client-facing records must be controlled by Contracts / QS / Commercial
3. Procurement/vendor/internal spending records must be controlled by Procurement / Purchasing
4. No final approval may bypass required preceding steps unless configured exception is authorized
5. No signature may be applied by unauthorized role
6. No financial-impacting approval may post to budget/cashflow without mapped project and financial references
7. A signed final version becomes read-only (immutable)
8. New revision creation must preserve prior revision
9. One and only one live version may exist at a time for controlled letters/contracts
10. Duplicate invoice number check is mandatory per vendor/project unless override reason is recorded
11. Approval thresholds must trigger escalation to higher authority automatically
12. All rejected and returned records must remain in history
13. All externally issued documents must have controlled numbering
14. Procurement commitments and expense approvals must feed outflow and budget impact automatically
15. Commercial submissions must feed receivable and inflow dashboards as applicable
16. Project health KPIs are view-restricted to PD and specifically authorized users
17. Each project must remain operationally separate for its assigned team users
18. PMO may view aggregated KPI outputs but shall not gain unrestricted project editing rights
19. Only PD may approve inter-project transfers
20. PM may only make reallocations within the same project between approved items
21. Every reallocation or transfer must include mandatory reason note
22. Every reallocation or transfer must be permanently recorded in audit history
23. **Posting-service is the sole source of financial truth.** No business record status, workflow state, or source-table value is financially trusted until posting-service has created a posting event for it. Dashboards must read from posted facts, not from draft or in-progress records. Approving a record is not the same as posting a financial fact — the posting-service validates, records, and makes it real. See `guardrails/03-posting-semantics.md` for event classification and dashboard trust rules.

---

## 8. Engine Architecture

### 8.1 Architecture Principles

| # | Principle | Meaning |
|---|---|---|
| 1 | Internal-first and controlled | Built for internal governance, not open collaboration |
| 2 | Project isolation with centralized intelligence | Operational work in separate project workspaces; portfolio intelligence consumes approved data only |
| 3 | One transactional core, multiple specialized engines | All engines share project master data, roles, budget structures, contracts, documents, audit logs |
| 4 | No uncontrolled side effects | Any approval impacting budget/cashflow/receivables/payables must post through controlled services |
| 5 | Dead-end resistant workflow design | Every workflow supports: draft save, return for correction, rejection, escalation, delegation, supersession, cancellation, resubmission |
| 6 | Immutable evidence trail | Signed documents, approval actions, version changes, budget movements are permanently attributable |
| 7 | Human-in-the-loop contract intelligence | AI supports drafting and extraction but never auto-issues or auto-approves |

### 8.2 Engines Map

**A. Shared Core Platform** — common services used by all engines: identity/access control, project master data, vendor/contract masters, budget/cost structures, workflow engine, document/version control, audit trail, notifications, search, reporting, integration layer.

**B. Commercial / Contracts Engine** — IPA, IPC, VO, change orders, cost proposals, tax invoices, letters, notices, claims, back charges, client-facing records, receivable pipeline. Outputs: receivable movement, inflow forecast, commercial exposure, claim traceability.

**C. Procurement / Purchasing Engine** — RFQs, quotation comparisons, supplier contracts, BOQ-linked purchasing, supplier invoices, payment approvals, expenses, vendor payable pipeline. Outputs: commitment movement, payable movement, outflow forecast, vendor exposure.

**D. Contract Intelligence Engine** — contract PDF reading, OCR, clause extraction, BOQ extraction, received-letter analysis, clause retrieval, draft reply support, amendment comparison. Outputs: structured clause library, BOQ extract library, advisory packs, clause-supported replies.

**E. Budget / Cost Control Engine** — budget lines, cost codes, packages, commitments, actuals, accruals, forecasts, reallocations, inter-project transfers. Outputs: budget status, available balance, reallocation/transfer history.

**F. Cashflow, Receivables, Payables Engine** — forecast/actual inflow and outflow, receivable/payable pipelines, aging views, due status. Outputs: cashflow dashboard, period movement, collection/payment pressure signals.

**G. Project Health & KPI Engine** — restricted to PD and authorized executives; aggregated to PMO. Project health scoring, KPI computation, trend analysis, threshold alerts, red flags, PMO rollup.

### 8.3 Solution Architecture Layers

| Layer | Components |
|---|---|
| Presentation | Web app, mobile-responsive approvals, register/detail screens, dashboards, admin screens |
| Application | Services: workflow, document, signature, commercial, procurement, budget, cashflow, KPI, AI extraction, search, notification, posting, admin, reporting |
| Data | Relational DB (PostgreSQL), object storage (S3), search index, event/posting tables |
| Integration | Internal service APIs, external APIs (e-signature, ERP, BI) |

---

## 9. Process Controls

### 9.1 Workflow Dead-End Prevention

Every workflow entity must support these states: Draft, Submitted, Under Review, Returned for Correction, Rejected, Approved, Signed, Issued/Posted, Cancelled, Superseded, Closed.

Required recovery paths:
- Returned for correction -> editable draft -> resubmit
- Rejected -> clone to new draft or reopen if permitted
- Approved but wrong before issue -> controlled cancellation and supersession
- Signed but superseded later -> new version only, old remains immutable
- Missing approver unavailable -> delegation or escalation
- Stalled beyond SLA -> auto-reminder -> escalation queue

### 9.2 Posting Controls

No record may post financial effects unless:
- Project is active
- Cost/budget mapping exists where needed
- Mandatory documents exist
- Workflow status is approved or signed as required
- Authority threshold is satisfied
- Duplicate check passes where relevant

### 9.3 Change Controls

Every change must record: old state, new state, old value, new value, user, date/time, reason note if mandated.

---

## 10. Multi-Entity / Sister Company Logic

The system supports multiple legal and operational entities:
- Parent company, sister companies, subsidiaries, branch entities, shared service structures
- Entity master setup with project ownership by entity
- Shared project participation by multiple entities where allowed
- Allocation percentages by entity with effective dates
- Cost/revenue split rules by entity
- Inter-entity reporting views
- Entity-aware approval routing if required

**Percentage Allocation Engine:** allocate project value or cost across entities, store predefined split structures, validate 100% total, maintain allocation history, support effective dates for revisions.

---

## 11. AI and Agent Guardrails

### 11.1 AI Operating Model

| What AI May Do | What AI May NOT Do |
|---|---|
| Structured data entry from approved source documents | Bypass approval authority |
| OCR-assisted record preparation | Auto-approve commercial/financial records |
| Document classification | Issue final correspondence without human approval |
| BOQ and clause extraction | Silently alter posted values |
| First-pass workflow preparation | Overwrite signed history |
| Validation support, reporting support | Self-authorize or impersonate users |
| Controlled draft generation | |
| Admin-assisted config changes where authorized | |

### 11.2 Agent Framework

| Agent | Purpose |
|---|---|
| Intake Agent | Receives files, classifies document type, routes to proper engine, checks metadata |
| Document Extraction Agent | OCR, structured field extraction, low-confidence flagging, draft record preparation |
| Contract Intelligence Agent | Clause/BOQ extraction, clause-notice linking, contract-aware drafting support |
| Commercial Preparation Agent | IPA/IPC/VO/tax invoice draft entries, BOQ/clause support linking |
| Procurement Preparation Agent | RFQ comparisons, invoice entries, expense entries, budget/vendor consistency checks |
| Validation Agent | Pre-submission/posting rules, duplicate checks, threshold violations, invalid mappings |
| KPI/Reporting Agent | KPI snapshots, event completeness checks, reporting anomaly flags |
| Admin Support Agent | Configuration review, workflow change previews, reference data correction under override |

### 11.3 Agent Guardrails

Every agent action must:
- Run under a defined service account or scoped permission token
- Log who initiated it and why
- Record source documents used
- Store confidence score where extraction/interpretation is involved
- Require human verification when below threshold or when policy says so
- Never override approval authority matrix

### 11.4 Verification Marking

Records processed by AI carry explicit verification status: Verified by Source Match, Pending Human Verification, Low Confidence Extraction, Incomplete Source Data, Ambiguous Mapping, Requires Commercial/Finance/Contract Review.

Uncertain fields must: be highlighted, carry confidence score, prevent silent posting, require user confirmation before final use.

---

## 12. Module Roadmap

**Mandatory build order. No later module may bypass or replace controls of earlier modules.**

| Module | Name | Key Deliverables |
|---|---|---|
| M1 | Shared Core Platform | Auth, RBAC, project isolation, workflow engine, document/version control, signatures, notifications, audit, admin panel foundation |
| M2 | Commercial / Contracts Engine | IPA, IPC, VO, change orders, tax invoices, letters, notices, claims, back charges, receivable posting hooks |
| M3 | Procurement / Purchasing Engine | RFQs, quotation comparison, supplier invoices, payment approvals, expenses, vendor contracts, commitment/payable posting hooks |
| M4 | Budget / Cost / Cashflow Engine | Budget lines, cost codes, packages, reallocations, transfers, receivables/payables views, cashflow, posting exception queue |
| M5 | KPI / PMO Engine | Project KPI calculations, health scores, red flags, PD dashboards, PMO portfolio rollups, executive summaries |
| M6 | Contract Intelligence Engine | OCR pipeline, contract parser, clause/BOQ extraction, letter analysis, draft reply support, approved knowledge store |
| M7 | Agent Layer & Admin Enhancements | Intake/extraction/validation/reporting/admin agents, agent queues, low-confidence review, entity allocation support |

### Build Strategy

- One shared architecture (database, workflow engine, posting engine, permission model, audit model)
- Module-by-module delivery
- Tests written alongside features, not after
- Module gate: schema diff, service summary, API summary, test summary, unresolved issues

---

## 13. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | RBAC mandatory; project-level access restrictions; encrypted storage/transport; secure sessions; signature data protection; audit logging cannot be disabled |
| **Performance** | Standard list pages load within acceptable thresholds; large dataset search support; large file upload support |
| **Availability** | Business-critical availability; backup and disaster recovery; signed documents must be recoverable |
| **Scalability** | Multiple simultaneous projects; increasing documents, transactions, users without redesign |
| **Usability** | Clean register-driven interface; mobile-friendly approvals; minimal clicks for review/sign; desktop-first responsive |
| **Compliance** | Evidentiary record integrity; timestamped history; export of signed/archived records for claims, audit, legal review |

---

## 14. Governance References

The following governance documents are maintained separately and are normative:

| Document | Location | Governs |
|---|---|---|
| Policy Ownership Map | `guardrails/01-policy-ownership-map.md` | Hard controls vs. configurable controls, override policy, dashboard trust, AI action limits |
| Master Data Governance Map | `guardrails/02-master-data-governance-map.md` | Data object scope, ownership, financial criticality, governance rules |
| Posting Semantics | `guardrails/03-posting-semantics.md` | Posting event classification, hard posting rules, dashboard trust matrix |
| Architecture Overview | `architecture.md` | Technical architecture summary (models, packages, stack) |
| Permissions Reference | `permissions.md` | 124 permission codes, resource-action mapping |
| Module Boundaries | `module-boundaries.md` | Module scope boundaries and dependencies |

---

## 15. Appendix References

Volatile implementation detail is maintained in separate appendices:

| Appendix | Title | Content |
|---|---|---|
| A | Workflow & Approval Matrices | Workflow matrices by record type, approval matrix by engine/threshold, flexible workflow template logic |
| B | Data Model & Schema | Conceptual schema, entity relationships, normalized PostgreSQL DDL, constraint rules |
| C | UI / Screen / Form Design | Screen lists by engine, detail screen components, field-by-field forms, wireframe notes, UX principles |
| D | Event / Posting / KPI Logic | Posting event catalog, event payload standard, reversal logic, KPI formulas, health score model, red flag thresholds |
| E | AI / Agent / Extraction Logic | AI extraction pipeline, clause/BOQ output fields, letter analysis logic, drafting guardrails, confidence rules |
| F | Test / Delivery / Build Guidance | Build sequence, delivery strategy, service breakdown, test plan, release gate criteria, build prompt |

---

## 16. Final Recommendation

The best implementation path is **module by module on one shared architecture.** This is the safest and most realistic decision because:

- Approvals are high-impact and must work reliably before adding complexity
- Financial posting must remain deterministic
- User adoption depends on simplicity
- AI should be layered only after stable operational data exists
- The system must work in real daily project life, not just look good on paper

**Engineering principles:**
- Build module by module
- Keep one shared architecture
- Keep posting logic centralized
- Keep agents assistive, not sovereign
- Make verification visible
- Make admin controls strong
- Make testing first-class from the beginning
- Make entity allocation logic explicit and auditable
