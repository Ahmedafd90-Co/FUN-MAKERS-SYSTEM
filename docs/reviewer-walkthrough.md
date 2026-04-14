# Reviewer Walkthrough -- Fun Makers KSA

**Status legend:** 🟢 Live | 🟡 Partial/Immature | 🔴 Not Yet Built

---

## 1. Login Credentials

| Field    | Value                  |
|----------|------------------------|
| Email    | `ahmedafd90@gmail.com` |
| Password | `ChangeMe!Demo2026`    |

Login at the `/login` route. After login you will be redirected to the Home dashboard.

---

## 2. Route-by-Route Status Table

### Core Pages

| Route                  | Status | What to Test                                                |
|------------------------|--------|--------------------------------------------------------------|
| `/home`                | 🟢     | Dashboard loads, summary cards visible, recent activity      |
| `/approvals`           | 🟢     | Pending approval items for current user                      |
| `/projects`            | 🟢     | Project cards list, click to open workspace                  |
| `/notifications`       | 🟢     | Notification list loads, items clickable                     |
| `/profile`             | 🟢     | User profile page loads                                      |
| `/documents`           | 🔴     | Placeholder -- global documents not built                    |

### Project Workspace

| Route                                       | Status | What to Test                                |
|---------------------------------------------|--------|----------------------------------------------|
| `/projects/{id}`                            | 🟢     | Overview tab with project details            |
| `/projects/{id}` > Documents tab            | 🟢     | Upload and list documents                    |
| `/projects/{id}` > Team tab                 | 🟢     | Assignment table, add member with new picker |
| `/projects/{id}` > Settings tab             | 🟢     | Project settings key-value pairs             |

### Commercial Module

| Route                                              | Status | What to Test                          |
|----------------------------------------------------|--------|----------------------------------------|
| `/projects/{id}/commercial`                        | 🟢     | Redirects to dashboard                 |
| `/projects/{id}/commercial/dashboard`              | 🟢     | Commercial dashboard overview          |
| `/projects/{id}/commercial/ipa`                    | 🟢     | IPA list, create new, view detail      |
| `/projects/{id}/commercial/ipa/{ipaId}`            | 🟢     | IPA detail, status transitions         |
| `/projects/{id}/commercial/ipc`                    | 🟢     | IPC list and detail                    |
| `/projects/{id}/commercial/variations`             | 🟢     | Variations list and detail             |
| `/projects/{id}/commercial/cost-proposals`         | 🟢     | Cost proposals list and detail         |
| `/projects/{id}/commercial/invoices`               | 🟢     | Tax invoices list and detail           |
| `/projects/{id}/commercial/correspondence`         | 🟢     | Correspondence list and detail         |

### Procurement Module

| Route                                              | Status | What to Test                          |
|----------------------------------------------------|--------|----------------------------------------|
| `/projects/{id}/procurement`                       | 🟡     | Landing page                           |
| `/projects/{id}/procurement/rfq`                   | 🟢     | RFQ list                               |
| `/projects/{id}/procurement/rfq/new`               | 🟢     | Create new RFQ                         |
| `/projects/{id}/procurement/rfq/{rfqId}`           | 🟢     | RFQ detail, status transitions         |
| `/projects/{id}/procurement/rfq/{rfqId}/edit`      | 🟢     | Edit RFQ                               |
| `/projects/{id}/procurement/rfq/{rfqId}/compare`   | 🟢     | Quotation comparison view              |
| `/projects/{id}/procurement/quotations`            | 🟢     | Quotation list                         |
| `/projects/{id}/procurement/quotations/new`        | 🟢     | Create quotation                       |
| `/projects/{id}/procurement/quotations/{id}`       | 🟢     | Quotation detail                       |
| `/projects/{id}/procurement/quotations/{id}/edit`  | 🟢     | Edit quotation                         |

### Admin

| Route                           | Status | What to Test                                |
|---------------------------------|--------|----------------------------------------------|
| `/admin/users`                  | 🟡     | Shows only logged-in user; no full list yet  |
| `/admin/roles`                  | 🟢     | Role list with permissions                   |
| `/admin/assignments`            | 🟢     | Cross-project assignment view                |
| `/admin/entities`               | 🟢     | Entity list and management                   |
| `/admin/reference-data`         | 🟢     | Reference data tables                        |
| `/admin/workflow-templates`     | 🟢     | Workflow template list and detail            |
| `/admin/notification-templates` | 🟢     | Notification template list                   |
| `/admin/audit-log`              | 🟢     | Audit trail entries                          |
| `/admin/override-log`           | 🟢     | Override action log                          |
| `/admin/posting-exceptions`     | 🟢     | Posting exception list                       |
| `/admin/system-health`          | 🟢     | System health dashboard                      |

---

## 3. Suggested Test Flow

### Step-by-step walkthrough:

**A. Login and Home**
1. Open the application and log in with the credentials above
2. Verify the Home dashboard loads at `/home`
3. Check that summary cards and recent activity are displayed

**B. Projects List**
4. Click **Projects** in the top nav
5. Verify the project cards load
6. Click on a project to open its workspace

**C. Project Workspace**
7. Verify the **Overview** tab shows project details (code, name, entity, currency, dates)
8. Click the **Documents** tab -- verify upload button and document list
9. Click the **Team** tab
10. Click **Add Member** -- verify the new searchable user picker:
    - Type at least 2 characters in the user search
    - Verify search results show name and email
    - Select a user
    - Select a role from the dropdown
    - Set an effective-from date
    - Submit (or cancel to test the flow without creating)
11. Verify the Commercial and Procurement **link buttons** (with external-link icons) are present below the tabs
12. Verify Materials/Budget/Cashflow appear as disabled dashed placeholders

**D. Commercial Module**
13. Click the **Commercial** link button from the project workspace
14. Verify breadcrumb shows: `Projects > {Project Name} > Commercial`
15. Verify the sidebar has a **Back to Project** link at the top
16. Navigate through: Dashboard > IPA > IPC > Variations > Cost Proposals > Invoices > Correspondence
17. On the IPA page, create a new IPA and verify the form
18. View an existing IPA and check status transition buttons

**E. Procurement Module**
19. Navigate back to the project (via breadcrumb or Back to Project)
20. Click the **Procurement** link button
21. Verify breadcrumb shows: `Projects > {Project Name} > Procurement`
22. Verify sidebar has **Back to Project** link
23. Go to **RFQs** -- create a new RFQ
24. Submit/Issue the RFQ through its lifecycle
25. Create a **Quotation** against the RFQ
26. Use the **Compare** view to see quotation comparison
27. **Shortlist** and **Award** a quotation
28. Verify disabled sidebar items (Vendors, POs, Invoices, Expenses) show "coming soon" tooltip

**F. Approvals**
29. Click **My Approvals** in the top nav
30. Check if any pending items appear (depends on workflow actions taken above)

**G. Notifications**
31. Click the notification bell in the top nav
32. Verify the notification list at `/notifications`

**H. Admin Area**
33. Click **Admin** in the top nav
34. Check **Users** -- note it only shows the logged-in user (known limitation)
35. Check **Roles** -- verify role list with permission details
36. Check **Entities** -- verify entity list
37. Check **Reference Data** -- verify reference data tables load
38. Check **Posting Exceptions** -- verify exception list
39. Check **System Health** -- verify health dashboard

---

## 4. Known Limitations

| Area                  | Limitation                                                        |
|-----------------------|--------------------------------------------------------------------|
| Admin > Users         | Only shows the logged-in user; no `admin.users.list` endpoint yet |
| Procurement > Vendors | Not yet built -- sidebar item is disabled                         |
| Procurement > POs     | Not yet built -- sidebar item is disabled                         |
| Procurement > Invoices| Not yet built -- sidebar item is disabled                         |
| Procurement > Expenses| Not yet built -- sidebar item is disabled                         |
| Global Documents      | `/documents` route is a placeholder; documents work per-project   |
| Materials module      | Not yet built                                                     |
| Budget module         | Not yet built                                                     |
| Cashflow module       | Not yet built                                                     |
| Reports module        | Not yet built                                                     |

---

## 5. What's Immature vs. What's Solid

### Solid (🟢)

- **Home dashboard** -- stable, loads reliably
- **Projects CRUD** -- create, view, update, archive all functional
- **Project workspace tabs** -- Overview, Documents, Team, Settings all stable
- **Team management** -- new searchable user picker and role selector
- **Commercial module** -- all 7 registers (IPA, IPC, Variations, Cost Proposals, Tax Invoices, Correspondence, Dashboard) with full CRUD and status workflows
- **Procurement RFQ lifecycle** -- create, submit, issue, evaluate, award, cancel, close
- **Procurement Quotations** -- create, edit, view, compare, shortlist, award, reject
- **Admin** -- Roles, Entities, Reference Data, Workflow Templates, Notification Templates, Audit Log, Override Log, Posting Exceptions, System Health
- **Approvals** -- pending approval queue
- **Notifications** -- in-app notification list

### Immature (🟡)

- **Admin > Users** -- page exists but only shows self; needs a proper user list endpoint
- **Procurement module overall** -- RFQ and Quotation lifecycle is solid, but the module is incomplete without Vendors, POs, Invoices, and Expenses

### Not Built (🔴)

- Vendors, Purchase Orders, Invoices, Expenses (Procurement sub-modules)
- Materials, Budget, Cashflow, Reports (future modules)
- Global Documents page
