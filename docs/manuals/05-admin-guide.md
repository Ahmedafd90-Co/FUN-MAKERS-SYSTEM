# Admin Guide

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## Accessing Admin

The Admin section is visible only to users with `system.admin` permission. It appears as the **Admin** link in the top navigation bar.

**Base route:** `/admin/users`

---

## Admin Sidebar Navigation

| Item                    | Route                           | Status |
|-------------------------|---------------------------------|--------|
| Users                   | `/admin/users`                  | 🟡     |
| Roles & Permissions     | `/admin/roles`                  | 🟢     |
| Project Assignments     | `/admin/assignments`            | 🟢     |
| Entities                | `/admin/entities`               | 🟢     |
| Reference Data          | `/admin/reference-data`         | 🟢     |
| Workflow Templates      | `/admin/workflow-templates`     | 🟢     |
| Notification Templates  | `/admin/notification-templates` | 🟢     |
| Audit Log               | `/admin/audit-log`              | 🟢     |
| Override Log            | `/admin/override-log`           | 🟢     |
| Posting Exceptions      | `/admin/posting-exceptions`     | 🟢     |
| System Health           | `/admin/system-health`          | 🟢     |

---

## Users 🟡

**Route:** `/admin/users`

**Current limitation:** The users list currently shows only the logged-in user's own record. There is no `admin.users.list` endpoint yet that returns all users. This is a known gap.

**User detail:** `/admin/users/{id}` -- shows individual user profile details.

**What works:**
- Viewing your own user record
- Navigating to user detail page

**What does not work yet:**
- Listing all users in the system
- Creating new users from the admin UI
- Editing user profiles from admin

---

## Roles & Permissions 🟢

**Route:** `/admin/roles`

Manage roles and their associated permissions.

- View all roles in the system
- Each role has a code (e.g., `PM`, `QS`, `ADMIN`) and a name
- View the permissions assigned to each role
- Roles can be system roles (non-editable) or custom roles

---

## Project Assignments 🟢

**Route:** `/admin/assignments`

A system-wide view of all project-user-role assignments. This complements the per-project Team tab by providing a cross-project perspective.

---

## Entities 🟢

**Route:** `/admin/entities`

Manage organizational entities (companies, branches, departments).

- View all entities
- Each entity has a code, name, type, and status
- Entities are referenced by projects for organizational context

---

## Reference Data 🟢

**Route:** `/admin/reference-data`

Manage system reference data (lookup tables, codes, categories).

- View and manage reference data items
- Used throughout the system for dropdowns and categorization

---

## Workflow Templates 🟢

**Route:** `/admin/workflow-templates`

Manage workflow template definitions that drive approval processes.

### List View
- All workflow templates with name, status, and type

### Detail View
**Route:** `/admin/workflow-templates/{id}`

- Workflow steps and transitions
- Approval rules and conditions

---

## Notification Templates 🟢

**Route:** `/admin/notification-templates`

Manage notification template definitions used for in-app and email notifications.

- View all notification templates
- Each template defines the message format for a specific event type

---

## Audit Log 🟢

**Route:** `/admin/audit-log`

View the system-wide audit trail of all significant actions.

- Shows who did what, when, and on which resource
- Filterable by user, action type, and date range
- Read-only (audit entries cannot be modified or deleted)

---

## Override Log 🟢

**Route:** `/admin/override-log`

View the log of all override actions (when a user bypasses a standard workflow step with elevated permissions).

- Shows the override reason, user, and timestamp
- Read-only

---

## Posting Exceptions 🟢

**Route:** `/admin/posting-exceptions`

View and manage posting exceptions -- records that failed automatic posting or require manual intervention.

- List of all exceptions with status and reason
- Actions to retry or dismiss exceptions

---

## System Health 🟢

**Route:** `/admin/system-health`

View the overall health status of the system.

- Database connectivity status
- Background job status
- System metrics and statistics
- Environment information
