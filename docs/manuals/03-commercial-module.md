# Commercial Module

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## Accessing the Commercial Module

The Commercial module is project-scoped. To access it:

1. Navigate to **Projects** (`/projects`)
2. Open a project
3. Click the **Commercial** link button in the project workspace

Or navigate directly to: `/projects/{id}/commercial`

A breadcrumb trail shows: `Projects > {Project Name} > Commercial`

---

## Sidebar Navigation

The Commercial module has a left sidebar with the following items:

| Item              | Route                                      | Status |
|-------------------|--------------------------------------------|--------|
| Dashboard         | `/projects/{id}/commercial/dashboard`      | 🟢     |
| IPA               | `/projects/{id}/commercial/ipa`            | 🟢     |
| IPC               | `/projects/{id}/commercial/ipc`            | 🟢     |
| Variations        | `/projects/{id}/commercial/variations`     | 🟢     |
| Cost Proposals    | `/projects/{id}/commercial/cost-proposals` | 🟢     |
| Tax Invoices      | `/projects/{id}/commercial/invoices`       | 🟢     |
| Correspondence    | `/projects/{id}/commercial/correspondence` | 🟢     |

A **Back to Project** link at the top of the sidebar returns to the project workspace.

---

## Dashboard 🟢

**Route:** `/projects/{id}/commercial/dashboard`

The Commercial dashboard provides an overview of all commercial registers for the project. It serves as the landing page when entering the Commercial module.

---

## IPA Register 🟢

**Route:** `/projects/{id}/commercial/ipa`

The Interim Payment Application (IPA) register manages payment applications submitted for a project.

### List View
- Displays all IPAs for the project in a table
- Shows IPA number, status, amounts, and dates

### Detail View
**Route:** `/projects/{id}/commercial/ipa/{ipaId}`

- Full IPA details including line items, amounts, and supporting information
- Status transitions (workflow-driven)

### Actions
- Create new IPA
- View IPA details
- Transition through status lifecycle (submit, approve, reject, etc.)

---

## IPC Register 🟢

**Route:** `/projects/{id}/commercial/ipc`

The Interim Payment Certificate (IPC) register tracks payment certificates.

### List View
- Table of all IPCs for the project

### Detail View
**Route:** `/projects/{id}/commercial/ipc/{ipcId}`

- Full IPC details with status and amounts
- Status transitions

---

## Variations Register 🟢

**Route:** `/projects/{id}/commercial/variations`

Manages contract variations (change orders).

### List View
- Table of all variations

### Detail View
**Route:** `/projects/{id}/commercial/variations/{variationId}`

- Variation details, amounts, justification
- Status transitions

---

## Cost Proposals Register 🟢

**Route:** `/projects/{id}/commercial/cost-proposals`

Manages cost proposals associated with the project.

### List View
- Table of all cost proposals

### Detail View
**Route:** `/projects/{id}/commercial/cost-proposals/{costProposalId}`

- Proposal details and amounts
- Status transitions

---

## Tax Invoices Register 🟢

**Route:** `/projects/{id}/commercial/invoices`

Manages tax invoices for the project.

### List View
- Table of all tax invoices

### Detail View
**Route:** `/projects/{id}/commercial/invoices/{invoiceId}`

- Invoice details, amounts, tax calculations
- Status transitions

---

## Correspondence Register 🟢

**Route:** `/projects/{id}/commercial/correspondence`

Manages project correspondence (letters, memos, notices).

### List View
- Table of all correspondence items

### Detail View
**Route:** `/projects/{id}/commercial/correspondence/{correspondenceId}`

- Correspondence details, attachments, and metadata
- Status transitions
