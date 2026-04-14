# Appendix B — Data Model & Schema

**Parent document:** `docs/blueprint/00-blueprint.md`
**Status:** Volatile — schema evolves as modules are built. The Prisma schema in `packages/db/prisma/schema.prisma` is the live source of truth for implemented models.

---

## B.1 Data Model Principles

1. One project can contain many records of many types
2. Every business record has a lifecycle status
3. Every record can have one or more attachments
4. Every record can have one or more workflow actions
5. Every workflow action must be attributable to a user and time
6. Every controlled document can have multiple versions; one version may be marked as current live
7. Every financial-impacting record links to project financial structures (cost codes, packages, contract items, cashflow periods)

---

## B.2 Key Relationships

- One project has many cost codes, packages, documents, workflows, invoices, letters, VOs, and budget lines
- One contract belongs to one project and may belong to one vendor
- One material request may have many items and many attachments
- One workflow instance belongs to one entity record
- One document may have many versions
- One approval/signature action may create one digital signature record
- One transactional record may create many financial impact (posting event) rows
- One project may have many intra-project budget reallocations
- Inter-project transfers connect source and destination projects with PD approval traceability

---

## B.3 Conceptual Entity Groups

### Core Reference Tables
`roles`, `departments`, `entities`, `users`, `projects`, `user_project_assignments`, `countries`, `currencies`

### Vendor / Procurement Master
`vendors`, `procurement_categories` (hierarchical), `item_catalogs`, `project_vendors`, `framework_agreements`, `framework_agreement_items`

### Workflow & Permissions
`workflow_templates`, `workflow_steps`, `workflow_instances`, `workflow_actions`, `permissions`, `role_permissions`, `notification_templates`

### Documents & Signatures
`documents`, `document_versions`, `signature_profiles`, `digital_signatures`, `attachments`

### Commercial Transaction Tables
`ipas`, `ipcs`, `variations`, `cost_proposals`, `tax_invoices`, `correspondences` (letters, notices, claims, back charges)

### Procurement Transaction Tables
`rfqs`, `quotations`, `vendor_contracts`, `supplier_invoices`, `expense_records`, `material_requests`, `material_request_flags`, `shop_drawing_records`, `material_testing_records`

### Financial Tables
`budget_lines`, `cost_codes`, `packages`, `budget_reallocations`, `project_transfers`, `receivables`, `payables`, `cashflow_periods`, `financial_impacts`

### Posting & KPI
`posting_events`, `posting_event_allocations`, `kpi_snapshots`, `reference_counters`

### AI / Extraction
`contract_clause_library`, `contract_boq_items`, `received_letters_analysis`, `agent_jobs`

### Audit
`audit_logs`, `override_logs`, `comments`, `notifications`

### Allocation
`allocation_rules`, `allocation_rule_lines`

---

## B.4 Schema Design Rules

1. UUID primary keys across all tables
2. Timestamps (`created_at`, `updated_at`) on all transactional tables
3. No hard delete for critical business records — status-driven lifecycle
4. JSONB only for flexible payloads (audit diffs, agent results), never for core relational structure
5. All financial movements derived from `posting_events` or controlled snapshot tables
6. Strict foreign keys for transactional modules (`onDelete: Restrict` for master data)
7. Unique constraints on natural keys (project + record_number patterns)
8. Status columns use PostgreSQL enum types (DB-level enforcement)

---

## B.5 Required Database Constraints

- Unique index on invoice number + vendor + project where applicable
- Check constraint for positive transfer/reallocation amount
- `source_project_id <> destination_project_id` check on project transfers
- Immutable signed-document logic enforced in service layer (Prisma middleware) and audit trail
- No delete on critical tables (`audit_logs`, `override_logs`, `posting_events`, `workflow_actions`, `digital_signatures`)
- FK `onDelete: Restrict` on `procurement_categories`, `item_catalogs` (prevents orphaned records)
- Reference counters: atomic increment only, never decrement or reset

---

## B.6 Blueprint Conceptual DDL

> **Note:** This DDL represents the original blueprint vision. The implemented Prisma schema may differ in naming, relations, and additional fields. The Prisma schema is authoritative for implemented modules.

### Core Tables

```sql
CREATE TABLE entities (
    entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_code VARCHAR(50) NOT NULL UNIQUE,
    entity_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    parent_entity_id UUID REFERENCES entities(entity_id),
    tax_registration_no VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(entity_id),
    project_code VARCHAR(50) NOT NULL UNIQUE,
    project_name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    currency_code VARCHAR(10) NOT NULL,
    status VARCHAR(30) NOT NULL,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_lines (
    budget_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    package_id UUID REFERENCES packages(package_id),
    cost_code_id UUID REFERENCES cost_codes(cost_code_id),
    line_code VARCHAR(100) NOT NULL,
    description TEXT,
    original_budget NUMERIC(18,2) NOT NULL DEFAULT 0,
    current_budget NUMERIC(18,2) NOT NULL DEFAULT 0,
    committed_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    actual_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    forecast_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    available_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, line_code)
);
```

### Posting Events

```sql
CREATE TABLE posting_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    project_id UUID REFERENCES projects(project_id),
    budget_line_id UUID REFERENCES budget_lines(budget_line_id),
    contract_id UUID REFERENCES contracts(contract_id),
    vendor_id UUID REFERENCES vendors(vendor_id),
    amount NUMERIC(18,2),
    currency_code VARCHAR(10),
    posting_date TIMESTAMP NOT NULL DEFAULT NOW(),
    initiated_by UUID REFERENCES users(user_id),
    note TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    status VARCHAR(50) NOT NULL,
    payload JSONB
);
```

### Budget Movements

```sql
CREATE TABLE budget_reallocations (
    reallocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id),
    source_budget_line_id UUID NOT NULL REFERENCES budget_lines(budget_line_id),
    destination_budget_line_id UUID NOT NULL REFERENCES budget_lines(budget_line_id),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    justification_note TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(user_id),
    approved_by UUID REFERENCES users(user_id),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE project_transfers (
    project_transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_project_id UUID NOT NULL REFERENCES projects(project_id),
    destination_project_id UUID NOT NULL REFERENCES projects(project_id),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    transfer_reason_note TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(user_id),
    approved_by_pd UUID REFERENCES users(user_id),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_diff_projects CHECK (source_project_id <> destination_project_id)
);
```

### AI / Extraction

```sql
CREATE TABLE contract_clause_library (
    clause_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL,
    source_document_id UUID NOT NULL REFERENCES documents(document_id),
    clause_reference VARCHAR(100),
    clause_heading TEXT,
    clause_text_extracted TEXT NOT NULL,
    clause_category VARCHAR(100),
    page_number INTEGER,
    extraction_confidence NUMERIC(5,2),
    approved_for_use BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE contract_boq_items (
    boq_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL,
    source_document_id UUID NOT NULL REFERENCES documents(document_id),
    boq_reference VARCHAR(100),
    item_description TEXT,
    unit VARCHAR(50),
    quantity NUMERIC(18,4),
    rate NUMERIC(18,4),
    amount NUMERIC(18,2),
    extraction_confidence NUMERIC(5,2),
    approved_for_use BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

> Full DDL for all tables (including material workflow templates, shop drawings, testing records, allocation rules, KPI snapshots, etc.) was defined in the original blueprint sections 12, 24.9, 28, 32.5, and 32.9. Implemented schemas are managed via Prisma migrations.
