# Fun Makers KSA -- System Overview

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## What is Fun Makers KSA?

Fun Makers KSA is an internal operations platform for construction and project delivery. It supports the full lifecycle of commercial management, procurement, and project administration for the Fun Makers KSA organization.

The system is a web application accessed via a browser. All users must log in to access any functionality.

---

## Authentication

- **Login method:** Email and password
- **Route:** `/login`
- After login, the user is redirected to the Home dashboard (`/home`)

---

## Top Navigation

Once logged in, the top navigation bar provides access to the following areas:

| Nav Item      | Route         | Status | Notes                                             |
|---------------|---------------|--------|----------------------------------------------------|
| Home          | `/home`       | 🟢     | Dashboard with recent activity and summary cards   |
| My Approvals  | `/approvals`  | 🟢     | Pending approval items for the logged-in user      |
| Projects      | `/projects`   | 🟢     | Project list; click to open a project workspace    |
| Documents     | `/documents`  | 🔴     | Placeholder; documents are accessed per-project    |
| Admin         | `/admin/users`| 🟢     | Visible only to users with `system.admin` permission|

The top nav also shows:
- **Search** trigger (Cmd+K / Ctrl+K)
- **Notification bell** (links to `/notifications`)
- **User menu** (profile, logout)

Future modules (Materials, Budget, Cashflow, Reports) appear as subtle "Soon" labels in the nav bar.

---

## Project-Scoped Modules

Commercial and Procurement are **project-scoped modules**. They are NOT top-level nav items. Instead, they are accessed from within a specific project workspace:

- **Commercial:** `/projects/{id}/commercial/...`
- **Procurement:** `/projects/{id}/procurement/...`

Each module has its own sidebar navigation and breadcrumb trail back to the project.

---

## Module Status Table

| Module            | Status | Accessed Via                            | Notes                                          |
|-------------------|--------|-----------------------------------------|-------------------------------------------------|
| Home Dashboard    | 🟢     | `/home`                                 | Summary cards, recent activity                  |
| My Approvals      | 🟢     | `/approvals`                            | Pending approval queue                          |
| Projects          | 🟢     | `/projects`                             | CRUD, workspace tabs, team management           |
| Documents (global)| 🔴     | `/documents`                            | Not yet implemented at global level             |
| Documents (project)| 🟢    | `/projects/{id}` Documents tab          | Upload and list documents per project           |
| Commercial        | 🟢     | `/projects/{id}/commercial/...`         | IPA, IPC, Variations, Cost Proposals, Invoices, Correspondence |
| Procurement       | 🟡     | `/projects/{id}/procurement/...`        | RFQ and Quotation lifecycle built; POs, Vendors, Invoices, Expenses not yet |
| Materials         | 🔴     | --                                      | Not yet built                                   |
| Budget            | 🔴     | --                                      | Not yet built                                   |
| Cashflow          | 🔴     | --                                      | Not yet built                                   |
| Reports           | 🔴     | --                                      | Not yet built                                   |
| Admin             | 🟢     | `/admin/...`                            | Users, Roles, Entities, Reference Data, etc.    |
| Notifications     | 🟢     | `/notifications`                        | In-app notification list                        |
| Profile           | 🟢     | `/profile`                              | User profile page                               |
