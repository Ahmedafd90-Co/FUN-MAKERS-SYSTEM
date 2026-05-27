-- PIC-75 — Multi-tenancy structural primitive
--
-- Introduces the `organizations` table as the canonical tenant root, adds an
-- `org_id` column to 10 transactional models (defaulting to the singleton
-- 'picoplay-ksa' org), drops the global @unique constraint on
-- `reference_number` for each, and replaces it with a compound unique:
--   - 9 models (IPA/IPC/Variation/CostProposal/Correspondence/RFQ/
--     PurchaseOrder/EngineerInstruction/VendorContract):
--       UNIQUE (org_id, project_id, reference_number) — per-tenant project-scoped
--   - 1 model (TaxInvoice):
--       UNIQUE (org_id, reference_number) — ZATCA Phase 2 per-tenant sequential
--
-- The singleton UUID is byte-identical to:
--   - schema.prisma @default declarations
--   - packages/db/src/seed/organizations.ts:SINGLETON_ORG_ID
-- Changing the constant requires updating all three locations in lockstep.

-- ------------------------------------------------------------
-- 1. Organization table
-- ------------------------------------------------------------

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- ------------------------------------------------------------
-- 2. Singleton tenant row (Pico Play KSA)
-- ------------------------------------------------------------

INSERT INTO "organizations" ("id", "slug", "name", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'picoplay-ksa',
    'Pico Play KSA',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 3. Add org_id column to 10 transactional models (with default = singleton)
-- ------------------------------------------------------------

ALTER TABLE "ipas" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "ipcs" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "variations" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "cost_proposals" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "tax_invoices" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "correspondences" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "vendor_contracts" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "rfqs" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "purchase_orders" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE "engineer_instructions" ADD COLUMN "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 4. Drop global @unique on reference_number (10 indexes)
-- ------------------------------------------------------------

DROP INDEX "ipas_reference_number_key";
DROP INDEX "ipcs_reference_number_key";
DROP INDEX "variations_reference_number_key";
DROP INDEX "cost_proposals_reference_number_key";
DROP INDEX "tax_invoices_reference_number_key";
DROP INDEX "correspondences_reference_number_key";
DROP INDEX "vendor_contracts_reference_number_key";
DROP INDEX "rfqs_reference_number_key";
DROP INDEX "purchase_orders_reference_number_key";
DROP INDEX "engineer_instructions_reference_number_key";

-- ------------------------------------------------------------
-- 5. Add compound unique indexes per Q1 ruling
-- ------------------------------------------------------------

-- 9 models: per-tenant project-scoped
CREATE UNIQUE INDEX "ipas_org_id_project_id_reference_number_key"
    ON "ipas"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "ipcs_org_id_project_id_reference_number_key"
    ON "ipcs"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "variations_org_id_project_id_reference_number_key"
    ON "variations"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "cost_proposals_org_id_project_id_reference_number_key"
    ON "cost_proposals"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "correspondences_org_id_project_id_reference_number_key"
    ON "correspondences"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "vendor_contracts_org_id_project_id_reference_number_key"
    ON "vendor_contracts"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "rfqs_org_id_project_id_reference_number_key"
    ON "rfqs"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "purchase_orders_org_id_project_id_reference_number_key"
    ON "purchase_orders"("org_id", "project_id", "reference_number");
CREATE UNIQUE INDEX "engineer_instructions_org_id_project_id_reference_number_key"
    ON "engineer_instructions"("org_id", "project_id", "reference_number");

-- 1 model: ZATCA Phase 2 per-tenant sequential (no project scope)
CREATE UNIQUE INDEX "tax_invoices_org_id_reference_number_key"
    ON "tax_invoices"("org_id", "reference_number");

-- ------------------------------------------------------------
-- 6. Foreign key constraints (organization relation)
-- ------------------------------------------------------------

ALTER TABLE "ipas" ADD CONSTRAINT "ipas_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ipcs" ADD CONSTRAINT "ipcs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variations" ADD CONSTRAINT "variations_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_proposals" ADD CONSTRAINT "cost_proposals_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "engineer_instructions" ADD CONSTRAINT "engineer_instructions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
