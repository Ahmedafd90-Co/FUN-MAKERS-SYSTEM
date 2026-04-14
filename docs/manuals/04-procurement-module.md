# Procurement Module

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## Accessing the Procurement Module

The Procurement module is project-scoped. To access it:

1. Navigate to **Projects** (`/projects`)
2. Open a project
3. Click the **Procurement** link button in the project workspace

Or navigate directly to: `/projects/{id}/procurement`

A breadcrumb trail shows: `Projects > {Project Name} > Procurement`

---

## Sidebar Navigation

The Procurement module has a left sidebar:

| Item             | Route                                          | Status |
|------------------|-------------------------------------------------|--------|
| RFQs             | `/projects/{id}/procurement/rfq`               | 🟢     |
| Quotations       | `/projects/{id}/procurement/quotations`        | 🟢     |
| Vendors          | `/projects/{id}/procurement/vendors`           | 🔴     |
| Purchase Orders  | `/projects/{id}/procurement/purchase-orders`   | 🔴     |
| Invoices         | `/projects/{id}/procurement/invoices`          | 🔴     |
| Expenses         | `/projects/{id}/procurement/expenses`          | 🔴     |

Items marked 🔴 appear in the sidebar as disabled/greyed-out with a "coming soon" tooltip. A **Back to Project** link at the top returns to the project workspace.

---

## RFQ Lifecycle 🟢

### RFQ List
**Route:** `/projects/{id}/procurement/rfq`

Displays all Request for Quotation (RFQ) documents for the project. Shows:
- RFQ number/reference
- Title and description
- Status
- Created date
- Actions

### Create RFQ
**Route:** `/projects/{id}/procurement/rfq/new`

Create a new RFQ with:
- Title and description
- Line items (materials/services with quantities and specifications)
- Due date
- Submission requirements

### RFQ Detail
**Route:** `/projects/{id}/procurement/rfq/{rfqId}`

View full RFQ details including line items, vendor responses, and status.

### Edit RFQ
**Route:** `/projects/{id}/procurement/rfq/{rfqId}/edit`

Edit an existing RFQ (only when in a draft or editable state).

### RFQ Status Transitions

The RFQ follows a workflow-driven lifecycle:

1. **Draft** -- Initial state when created
2. **Submitted** -- RFQ has been submitted for review
3. **Issued** -- RFQ issued to vendors for quotation
4. **Under Evaluation** -- Quotations received and being evaluated
5. **Awarded** -- A vendor has been selected and awarded
6. **Cancelled** -- RFQ cancelled (requires `rfq.terminate` permission)
7. **Closed** -- RFQ closed out (requires `rfq.terminate` permission)

---

## Quotation Management 🟢

### Quotation List
**Route:** `/projects/{id}/procurement/quotations`

Displays all quotations received for the project. Shows:
- Quotation reference
- Associated RFQ
- Vendor/supplier name
- Total amount
- Status
- Actions

### Create Quotation
**Route:** `/projects/{id}/procurement/quotations/new`

Create a new quotation against an existing RFQ:
- Select the RFQ
- Enter vendor/supplier details
- Line item pricing (unit prices, quantities, totals)
- Validity period

### Quotation Detail
**Route:** `/projects/{id}/procurement/quotations/{quotationId}`

View full quotation details including line item breakdown and pricing.

### Edit Quotation
**Route:** `/projects/{id}/procurement/quotations/{quotationId}/edit`

Edit an existing quotation (when in an editable state).

### Quotation Status Transitions

1. **Draft** -- Initial state
2. **Submitted** -- Quotation submitted
3. **Under Review** -- Being reviewed/evaluated
4. **Shortlisted** -- Selected for further consideration
5. **Awarded** -- Vendor awarded the contract
6. **Rejected** -- Quotation rejected
7. **Expired** -- Past validity (requires `quotation.terminate` permission)

---

## Comparison View 🟢

**Route:** `/projects/{id}/procurement/rfq/{rfqId}/compare`

The comparison view allows side-by-side comparison of all quotations received for a specific RFQ. It shows:
- Line item comparison across vendors
- Unit price comparison
- Total amount comparison
- Highlighting of best prices

This view supports the evaluation and shortlisting process.

---

## Shortlisting and Awarding 🟢

From the comparison view or individual quotation detail, reviewers can:
- **Shortlist** one or more quotations for further consideration
- **Award** a quotation to select the winning vendor
- **Reject** quotations that do not meet requirements

These actions trigger status transitions and may generate approval workflows.

---

## What's NOT Built Yet 🔴

The following procurement sub-modules are planned but not yet implemented:

| Sub-module       | Description                                        |
|------------------|----------------------------------------------------|
| Vendors          | Vendor registry and qualification management       |
| Purchase Orders  | PO creation and lifecycle from awarded quotations  |
| Invoices         | Vendor invoice tracking and matching               |
| Expenses         | Expense tracking and categorization                |

These items appear in the sidebar as disabled/greyed-out placeholders.
