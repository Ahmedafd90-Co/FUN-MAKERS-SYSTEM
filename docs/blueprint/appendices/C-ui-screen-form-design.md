# Appendix C — UI / Screen / Form Design

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — screens are built and refined module by module. Implemented screens are the source of truth.

---

## C.1 UX Principles

- Keep navigation shallow and predictable
- Separate engines clearly but keep record linking seamless
- Use summary cards, tabs, and progressive disclosure rather than crowded long pages
- Keep core user actions visible: save, submit, return, approve, reject, sign, issue
- Show financial impact clearly before final approvals
- Show workflow status and next approver clearly on every record
- Reduce unnecessary clicks for recurring users
- Make dashboards actionable, not decorative
- Desktop-first responsive layouts with mobile-friendly review actions
- Consistent visual system across all engines

---

## C.2 Recommended Primary Navigation

Home, My Approvals, Projects, Commercial, Procurement, Contracts Intelligence, Budget & Cost, Cashflow, Reports, PMO KPIs, Admin

---

## C.3 Screen List by Module

### Platform-Level
Login, MFA (if enabled), Home dashboard, Notifications center, Global search, User profile / signature profile, Admin settings

### Project Setup
Project list, Project creation, Project detail, Approval matrix, Cost code management, Package management, Budget upload/edit, Vendor association

### Commercial / Contracts Engine
Commercial register home, IPA/IPC/VO/Cost proposal/Tax invoice/Letters/Notices/Claims/Back charges registers, Create commercial record, Commercial detail, Receivable pipeline dashboard, Client submission history, Commercial executive summary

### Procurement / Purchasing Engine
Procurement register home, Quotation/Supplier contract/BOQ-package/Supplier invoice/Payment approval/Expense/Travel-tickets/Accommodation/Transportation/Equipment cost registers, Create procurement record, Procurement detail, Payable pipeline dashboard, Procurement executive summary

### Material Approval
Material approval register, Create material request, Material request detail, Item entry grid, Attachments tab, Workflow history tab, Approval action modal, Signed approval preview, Material analytics dashboard

### Invoice and Payment
Invoice register, Create invoice/payment request, IPC/IPA form, Certificate detail, Backup attachments tab, Approval history tab, Finance validation, Signed certificate preview, Payables dashboard

### VO / Change Order
VO register, Change order register, Create VO/CO, Entitlement and value detail, Attachments tab, Workflow tab, Exposure dashboard

### Letter and Correspondence
Letter/Notice/Claim/Back charge registers, Create/upload record, Record detail, Version history tab, Redline comparison, Approval and issue tab, Live issued copy preview

### Contract Control
Contract register, Contract detail, Contract versions, Amendment register tab, Redline comparison, Signature workflow, Executed live contract preview

### Document Management
Document library by project, Document detail, Version tree, OCR text preview, Metadata edit, Download/access history

### Budget and Cost Control
Budget dashboard, Budget line detail, Commitment/Actual cost registers, Cost code summary, Package summary, Forecast, Intra-project reallocation, Inter-project transfer request, Budget movement history/approval

### Cashflow
Cashflow dashboard, Monthly inflow/outflow, Receivables/Payables registers, Cashflow forecast detail

### Project Health & KPI
Project health dashboard, KPI detail, Red flag dashboard, Approval turnaround, Receivable/Payable aging, Budget stress/burn, PD-only executive view

### Reporting
Pending approvals, Executive portfolio, Project commercial, Vendor exposure dashboards, Audit history report, SLA/turnaround report, Export center, Report builders

### Admin
User management, Role/permissions management, Workflow template management, Document numbering rules, Signature authority matrix, Notification rules, Audit settings, Integration settings

---

## C.4 Screen Design Patterns

### Register Screens
Every register includes: search bar, filter panel, project selector, status filter, date range filter, vendor filter (where relevant), amount range filter (where relevant), export button, saved views, bulk actions (subject to permission).

### Detail Screens
Every detail screen includes: header with record number/title/project/status/owner, summary card with value/dates/vendor/cost code/package, tabs for details/attachments/comments/workflow/financial impact/history/versions, action buttons based on permission and current status.

### Wireframe Zones (Global Pattern)
Every detail screen uses 4 zones:
1. **Top header** — record title, status, key actions
2. **Left navigation/filter panel** — where needed
3. **Center detail workspace** — primary content
4. **Right summary panel** — workflow, financial impact, audit shortcuts

### Approval Action Modals
Approve, Reject, Return for correction, Sign now (if authorized). Mandatory comment for reject/return. Display current financial impact before approval where relevant.

---

## C.5 Field-by-Field Forms

### Common Header Fields
Record Type, Project, Project Code, Department Owner, Record Number (auto), Status, Workflow Template, Priority, Currency, Related Contract, Related Vendor, Package, Cost Code, Budget Line, Date Created, Created By, Last Updated, Current Approver, Confidentiality Classification, Reason/Summary

### IPA Form
**Header:** IPA Number, Project, Client, Contract, Period From/To, Submission Date, Currency, Status
**Commercial Values:** Original/Current Contract Value, Previous Certified Value, Current/Cumulative Claimed Value, Retention %/Amount, Tax %/Amount, Net Claimed Amount, Approved VO Included Value, Pending VO Flag
**References:** BOQ Reference Basis, Measurement Basis, Supporting Drawings, Clause Support, Prior Letter/Notice Reference
**Attachments:** IPA PDF draft, backup calculation, measurement sheet, progress evidence, BOQ support, clause support
**Control:** Prepared/Reviewed/Approved/Signed By, Submission Method, Client Reference, Note

### IPC Form
**Header:** IPC Number, Linked IPA, Project, Contract, Vendor (if applicable), Certificate Period, Issue Date, Status
**Valuation:** Previous/This Period/Cumulative Certified Amount, Retention, Tax, Net Certified, Contra/Back Charges, Adjustment Amount/Reason
**Support:** BOQ/Clause Basis, Related Notices/Letters, Related VO/CO References
**Control:** Prepared/Reviewed/Finance Checked/Approved/Signed By, Issue Reference

### VO / Change Order Form
VO/CO Number, Project, Contract, Client Instruction Reference, Title, Description, Change Category, Proposed/Approved Value, Revenue/Cost/Time Impact, Related BOQ Items/Clauses/Notices/Claims, Supporting Documents, Prepared/Reviewed/Approved By, Client Status, Final Status

### Tax Invoice Form
Tax Invoice Number, Project, Client, Contract, Invoice Date, Tax Registration Reference, Taxable/Tax/Gross Amount, Linked IPA/IPC/Milestone, Status, Submission Reference, Receivable Due Date, Collection Status

### Letter / Notice / Claim / Back Charge Form
Record Number, Subtype, Project, Contract, Sender/Recipient Org, Subject, Date, Related Prior Correspondence/Clauses/Events, Risk Category, Proposed Position Summary, Draft Text, Attachments, Prepared/Reviewed/Approved/Signed By, Issue Reference, Response Due Date/Status

### RFQ / Quotation Comparison Form
RFQ Number, Project, Package, Category, Requested By, Vendor 1/2/3 (Name, Price, Technical Compliance), Recommendation Basis, Recommended Vendor, Budget Line, Cost Code, Total Value, Attachments, Approval Status

### Supplier Invoice / Payment Form
Invoice Number, Project, Vendor, Contract/PO Reference, Invoice/Due Date, Type, Gross/Tax/Retention/Net Amount, Linked Commitment/PO, Budget Line, Cost Code, Prior Paid, Outstanding Balance, Payment Terms, Backup, Finance Check, Approval/Payable Status

### Expense Form
Expense Number, Project, Category/Subcategory, Requested By, Beneficiary, Description, Cost Center/Budget Line, Cost Code, Amount, Currency, Date Needed, Vendor/Provider, Supporting Documents, Approval Status

### Budget Reallocation Form
Reallocation Number, Project, Source/Destination Budget Line/Cost Code/Package, Amount to Move, Reason Note (mandatory), Initiated/Reviewed/Approved By, Posting Date, Status

### Inter-Project Transfer Form
Transfer Number, Source/Destination Project, Source/Destination Budget Line, Amount, Transfer Reason Note (mandatory), Business Impact Note, Requested/Reviewed/Finance Validated/PD Approved By, Posting Date, Status

### Contract Extraction / Clause / BOQ Review Forms
Source Document, Contract, Extraction Run ID, Document Type, OCR/Parser Confidence, Reviewer, Review Status, Extraction Notes, Clause/BOQ counts, Approved for Use flag. Individual clause/BOQ rows with reference, heading/description, extracted text, source page, category, confidence, reviewer comment, approval flag.

### Received Letter Analysis Form
Letter Reference, Project, Contract, Sender, Date Received, AI Summary, Key Risks, Recommended Position, Suggested Reply Points, Linked Clauses, Reviewer Notes, Review Outcome

---

## C.6 Tracker Screens

### Material / Procurement Tracker
Grid with filters: project, package, vendor, subcontractor, manufacturer, status, long-lead, testing-required, drawing-required.
Columns: request no, material, package, subcontractor, vendor, manufacturer, drawing status, QA/QC status, fabrication status, delivery status, testing status, ROS date, countdown, delays, current owner.
Bulk export and saved views.

### Shop Drawing Tracker
Left: filter by pending/rejected/approved with comments/resubmission required.
Center grid: material/item, responsible party, revision, status, reviewer, due date.
Right detail drawer: comments, attached drawings, linked material request, required next action.

### Testing / Certification Tracker
Grid by material, lab, sample status, appointment date, result status, certificate status, linked payment.
Linked tabs to lab invoice/payment approval if applicable.

---

## C.7 Role-Permission Matrix by Screen

> See `guardrails/01-policy-ownership-map.md` for hard controls and `permissions.md` for the 124 permission codes. The full screen-level V/C/E/S/R/A/SG/I/X/N matrix is defined in the original blueprint section 26.4 and implemented via the seeded role-permission mappings.
