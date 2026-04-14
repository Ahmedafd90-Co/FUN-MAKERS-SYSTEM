# Project Workspace

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## Projects List

**Route:** `/projects`

The projects list displays all projects the current user has access to. Each project is shown as a card with the project code, name, entity, and status.

Click a project card to open its workspace.

---

## Workspace Overview

**Route:** `/projects/{id}`

The project workspace is organized into content tabs and module links:

### Content Tabs (in-page)

| Tab       | Status | Description                                          |
|-----------|--------|------------------------------------------------------|
| Overview  | 🟢     | Project code, name, entity, currency, dates, status  |
| Documents | 🟢     | Upload and list documents attached to this project   |
| Team      | 🟢     | Assign users with roles, revoke assignments          |
| Settings  | 🟢     | Project-level settings (key-value pairs)             |

### Module Links (navigate to separate area)

These appear as clearly labeled navigation buttons below the tabs:

| Module      | Status | Route                                |
|-------------|--------|--------------------------------------|
| Commercial  | 🟢     | `/projects/{id}/commercial`          |
| Procurement | 🟡     | `/projects/{id}/procurement`         |
| Materials   | 🔴     | Coming soon                          |
| Budget      | 🔴     | Coming soon                          |
| Cashflow    | 🔴     | Coming soon                          |

Commercial and Procurement are shown as link-out buttons (with an external-link icon). Materials, Budget, and Cashflow are shown as disabled/dashed placeholders.

---

## Creating Projects

**Permission required:** `project.create` (admin only)

Projects are created via the Admin area or the Projects list (if the user has admin permissions). Required fields:

- Project code (unique identifier, e.g., `PRJ-001`)
- Project name
- Entity (select from configured entities)
- Currency (default: SAR)
- Start date
- End date (optional)

---

## Team Management

**Route:** `/projects/{id}` > Team tab

### Viewing Team Members

The Team tab displays a table of all current assignments:
- **User:** name of the assigned user
- **Role:** role code badge (e.g., `PM`, `QS`)
- **Effective From:** when the assignment starts
- **Effective To:** when the assignment ends, or "Indefinite"
- **Actions:** Revoke button

### Adding a Team Member

Click **Add Member** to open the assignment dialog:

1. **User search:** Type at least 2 characters to search by name or email. A dropdown shows matching active users with their name and email.
2. **Role selection:** Select from a dropdown of all available roles (shown as `CODE -- Role Name`).
3. **Effective From:** Pick the date when the assignment begins.
4. Click **Add Member** to confirm.

### Revoking an Assignment

Click **Revoke** on any row to open a confirmation dialog. A reason is required. Once revoked, the user loses access to the project under that role.

---

## Project Settings

**Route:** `/projects/{id}` > Settings tab

Project settings are key-value pairs that control project-level behavior. Settings are managed by users with `project.edit` permission.

---

## Navigation from Module Back to Project

Both Commercial and Procurement modules include:
- **Breadcrumb trail** at the top: `Projects > {Project Name} > Commercial/Procurement`
- **Back to Project** link in the sidebar (arrow-left icon)

These ensure users can always navigate back to the project workspace.
