# Appendix A — Workflow & Approval Matrices

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — expected to evolve as modules are built and workflow templates are refined.

---

## A.1 Workflow Matrix Legend

| Code | Meaning |
|---|---|
| C | Create |
| R | Review |
| A | Approve |
| S | Sign |
| F | Finance check |
| D | Document control / issue control |
| V | View only |

---

## A.2 Material Approval Workflow

| Step | Activity | Purchaser | Design Mgr | PM | QS/Commercial | PD | Doc Controller | Finance |
|---|---|---|---|---|---|---|---|---|
| 1 | Create material request | C | V | V | V | V | V | V |
| 2 | Upload quotations/datasheets | C | V | V | V | V | V | V |
| 3 | Technical review | V | R/A | V | V | V | V | V |
| 4 | Project need review | V | V | R/A | V | V | V | V |
| 5 | Budget/commercial review | V | V | V | R/A | V | V | V |
| 6 | Final approval | V | V | V | V | A/S | V | V |
| 7 | Issue controlled copy | V | V | V | V | V | D | V |
| 8 | Update commitment | V | V | V | R | V | V | F |

**Status flow:** Draft -> Submitted -> Technical Review -> PM Review -> Commercial Review -> Approved -> Signed -> Issued -> Closed

---

## A.3 Invoice / IPC Workflow

| Step | Activity | Site/QS | PM | Commercial Mgr | Finance | PD | Doc Controller |
|---|---|---|---|---|---|---|---|
| 1 | Create payment record | C | V | V | V | V | V |
| 2 | Upload backup documents | C | V | V | V | V | V |
| 3 | Progress/entitlement review | R | R/A | V | V | V | V |
| 4 | Commercial validation | V | V | R/A | V | V | V |
| 5 | Financial validation | V | V | V | F/A | V | V |
| 6 | Final sign approval | V | V | V | V | A/S | V |
| 7 | Controlled issue | V | V | V | V | V | D |
| 8 | Update actual/outflow | V | V | R | R | V | V |

**Status flow:** Draft -> Submitted -> PM Review -> Commercial Review -> Finance Review -> Approved -> Signed -> Issued -> Paid / Part Paid / Closed

---

## A.4 VO / Change Order Workflow

| Step | Activity | Commercial | PM | Contracts Mgr | Finance | PD | Doc Controller |
|---|---|---|---|---|---|---|---|
| 1 | Create VO/CO record | C | V | V | V | V | V |
| 2 | Upload backup and instruction | C | V | V | V | V | V |
| 3 | Necessity/scope review | V | R/A | V | V | V | V |
| 4 | Entitlement review | R | V | R/A | V | V | V |
| 5 | Value and financial review | R | V | V | F/A | V | V |
| 6 | Final internal approval | V | V | V | V | A/S | V |
| 7 | Issue controlled version | V | V | V | V | V | D |
| 8 | Update exposure/register | R | V | V | R | V | V |

**Status flow:** Draft -> Submitted -> PM Review -> Contracts Review -> Finance Review -> Approved Internally -> Signed -> Submitted Externally / Approved Externally / Rejected / Closed

---

## A.5 Letter Workflow

| Step | Activity | Originator | PM/Manager | Contracts/Legal | PD | Doc Controller |
|---|---|---|---|---|---|---|
| 1 | Draft letter | C | V | V | V | V |
| 2 | Internal review | V | R/A | R | V | V |
| 3 | Final approval | V | V | V | A/S | V |
| 4 | Numbering and issue | V | V | V | V | D |
| 5 | Archive and track responses | V | V | V | V | D |

**Status flow:** Draft -> Internal Review -> Approved -> Signed -> Issued -> Responded / Closed / Superseded

---

## A.6 Contract Workflow

| Step | Activity | Originator | Contracts Mgr | Commercial | Finance | PD/Exec | Doc Controller |
|---|---|---|---|---|---|---|---|
| 1 | Upload/create draft | C | V | V | V | V | V |
| 2 | Legal/contracts review | V | R/A | V | V | V | V |
| 3 | Commercial review | V | V | R/A | V | V | V |
| 4 | Finance review | V | V | V | F/A | V | V |
| 5 | Final approval/sign | V | V | V | V | A/S | V |
| 6 | Issue live executed copy | V | V | V | V | V | D |
| 7 | Update cashflow/commitment | V | V | R | R | V | V |

**Status flow:** Draft -> Internal Review -> Negotiation -> Approved -> Signed -> Executed Live -> Amended / Superseded / Expired / Closed

---

## A.7 Budget Reallocation / Transfer Workflow

| Step | Activity | Requestor | PM | Cost Controller/Commercial | Finance | PD | PMO |
|---|---|---|---|---|---|---|---|
| 1 | Create request | C | V | V | V | V | V |
| 2 | Enter source/destination | C | V | V | V | V | V |
| 3 | Enter mandatory reason | C | V | V | V | V | V |
| 4 | Same-project validation | V | R/A | R | V | V | V |
| 5 | Inter-project finance validation | V | V | R | F/A | V | V |
| 6 | Inter-project final approval | V | V | V | V | A | V |
| 7 | Post change and update history | V | V | R | R | V | V |
| 8 | Feed to PMO KPIs | V | V | V | V | V | V |

**Status flow:** Draft -> Submitted -> Validation -> Same Project Approved / Pending PD Approval -> Approved -> Posted -> Reflected in Dashboards -> Closed

---

## A.8 Approval Matrix

### Design Rules

The approval matrix is configurable by: engine, document type, project, amount threshold, department owner, urgency, signature requirement, finance check requirement, PD mandatory flag.

### Sample Matrix

| Engine | Record Type | Threshold | Prepare | Review | Finance Check | Final Approver | Sign |
|---|---|---|---|---|---|---|---|
| Commercial | IPA | Any | QS/Commercial | PM + Commercial Mgr | Optional | PD | Yes |
| Commercial | IPC | Any | QS/Commercial | PM + Commercial Mgr | Yes | PD | Yes |
| Commercial | VO/CO | 0-100k | Commercial | PM + Contracts | Optional | PD | Yes |
| Commercial | VO/CO | 100k+ | Commercial | PM + Contracts + Finance | Yes | PD/Exec | Yes |
| Commercial | Claim | Any | Contracts/Commercial | Contracts Mgr | Optional | PD | Yes |
| Commercial | Notice | Any | Contracts/Commercial | Contracts Mgr | No | PD or delegate | Yes |
| Commercial | Tax Invoice | Any | Commercial/Finance | Finance | Yes | PD or Finance | By rule |
| Procurement | RFQ Recommendation | 0-50k | Purchaser | PM/Design | Optional | Procurement Mgr | No |
| Procurement | RFQ Recommendation | 50k+ | Purchaser | PM + Commercial + Proc Mgr | Optional | PD | By rule |
| Procurement | Supplier Invoice | Any | Procurement/AP | Procurement + PM | Yes | Finance/PD | No |
| Procurement | Expense | 0-10k | Requestor | Dept Head | Optional | PM | No |
| Procurement | Expense | 10k+ | Requestor | Dept Head + Finance | Yes | PD | No |
| Budget | Same-project reallocation | Any | PM/Cost Controller | Cost Controller/Commercial | Optional | PM (within authority) | No |
| Budget | Cross-project transfer | Any | Requestor | Cost Controller + Finance | Yes | PD only | No |
| Contract Intel | Clause/BOQ approval | Any | AI/Parser | Contracts Reviewer | No | Contracts Mgr | No |

### Mandatory Approval Logic

- Cross-project transfer -> PD mandatory
- Invoice with payable effect -> Finance mandatory
- Signed client-facing commercial issue -> PD or delegated signatory mandatory
- Contract extraction for operational use -> Contracts reviewer mandatory

---

## A.9 Flexible Workflow Template Logic

### Design Principle

Material, procurement, design, QA/QC, fabrication, testing, delivery, and subcontract-linked workflows vary by item type, package, risk, and project need. Templates must be configurable, not hardcoded.

### Configurable Requirement Flags

Templates support these toggle flags per material/package:
- Requires PM review, Procurement review, QA/QC review, Design review
- Requires shop drawing (vendor-prepared or internal)
- Requires material submittal, technical data sheet, mockup, sample approval
- Requires testing (third-party lab), certification/compliance certificate
- Requires long-lead tracking, fabrication tracking, delivery tracking
- Requires subcontractor linkage, manufacturer tracking

### Example Template Paths

1. Site -> PM -> Procurement
2. Site -> PM -> Design -> QA/QC -> Procurement
3. Site -> PM -> Vendor shop drawing -> Design -> QA/QC -> Procurement
4. Site -> PM -> Procurement -> Testing Lab -> QA/QC -> Delivery
5. Procurement-led direct material workflow
6. Subcontractor-linked procurement workflow

Templates configurable by: project, package, material category, subcontractor, long-lead flag, testing flag, shop drawing flag, QA/QC flag, design flag.

---

## A.10 Material / Procurement Status Model

### Request and Review Statuses
Draft, Submitted by Site, Under PM Review, Under Procurement Review, Under Design Review, Under QA/QC Review, Returned for Correction, Rejected, Approved, Approved with Comments (Status B), Resubmission Required

### Drawing / Submittal Statuses
Shop Drawing Not Required/Required/Uploaded/Under Review/Rejected/Approved/Approved with Comments/Resubmitted

### Material / Fabrication Statuses
Material Request Raised, Quotation Requested, Vendor Identified, Technical/Commercial Review Complete, PO/Award Ready, Fabrication Not Started/In Progress/Complete, Delivery Scheduled/In Transit/Delivered/Partially Delivered, Received and Inspected, Closed

### Testing / Certification Statuses
Testing Not Required/Required/Requested, Lab Appointment Scheduled, Sample Submitted, Test In Progress/Passed/Failed, Retest Required, Certification Pending/Received
