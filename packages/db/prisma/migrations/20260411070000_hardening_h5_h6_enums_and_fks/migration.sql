-- Hardening H5: Status enum migration (11 fields, data-safe)
-- Hardening H6: FK hardening for categoryId and itemCatalogId (9 relations)
--
-- IMPORTANT: This migration uses ALTER COLUMN ... TYPE ... USING to preserve
-- existing data. Prisma's default strategy (DROP + ADD) would destroy status
-- values in 6 commercial tables containing seed data.

-- ============================================================================
-- H5: Create enum types
-- ============================================================================

-- Commercial enums (6)
CREATE TYPE "ipa_status" AS ENUM ('draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'issued', 'superseded', 'closed');

CREATE TYPE "ipc_status" AS ENUM ('draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'issued', 'superseded', 'closed');

CREATE TYPE "variation_status" AS ENUM ('draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'issued', 'client_pending', 'client_approved', 'client_rejected', 'superseded', 'closed');

CREATE TYPE "cost_proposal_status" AS ENUM ('draft', 'submitted', 'under_review', 'returned', 'rejected', 'approved_internal', 'issued', 'linked_to_variation', 'superseded', 'closed');

CREATE TYPE "tax_invoice_status" AS ENUM ('draft', 'under_review', 'returned', 'approved_internal', 'issued', 'submitted', 'overdue', 'partially_collected', 'collected', 'cancelled', 'superseded', 'closed');

CREATE TYPE "correspondence_status" AS ENUM ('draft', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'issued', 'superseded', 'closed', 'response_due', 'responded', 'under_evaluation', 'partially_accepted', 'accepted', 'disputed', 'acknowledged', 'partially_recovered', 'recovered');

-- Procurement enums (5)
CREATE TYPE "vendor_status" AS ENUM ('draft', 'active', 'suspended', 'blacklisted', 'archived');

CREATE TYPE "vendor_contract_status" AS ENUM ('draft', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'active', 'expired', 'terminated', 'superseded');

CREATE TYPE "framework_agreement_status" AS ENUM ('draft', 'under_review', 'returned', 'rejected', 'approved_internal', 'signed', 'active', 'expired', 'terminated', 'superseded');

CREATE TYPE "rfq_status" AS ENUM ('draft', 'under_review', 'returned', 'rejected', 'approved_internal', 'issued', 'responses_received', 'evaluation', 'awarded', 'closed', 'cancelled');

CREATE TYPE "quotation_status" AS ENUM ('received', 'under_review', 'shortlisted', 'awarded', 'rejected', 'expired');

-- ============================================================================
-- H5: Convert status columns from text to enum (data-preserving)
-- Strategy: drop default → convert type with USING cast → restore default
-- ============================================================================

-- Commercial tables (contain seed data — must preserve)
ALTER TABLE "ipas" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ipas" ALTER COLUMN "status" TYPE "ipa_status" USING "status"::"ipa_status";
ALTER TABLE "ipas" ALTER COLUMN "status" SET DEFAULT 'draft'::"ipa_status";

ALTER TABLE "ipcs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ipcs" ALTER COLUMN "status" TYPE "ipc_status" USING "status"::"ipc_status";
ALTER TABLE "ipcs" ALTER COLUMN "status" SET DEFAULT 'draft'::"ipc_status";

ALTER TABLE "variations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "variations" ALTER COLUMN "status" TYPE "variation_status" USING "status"::"variation_status";
ALTER TABLE "variations" ALTER COLUMN "status" SET DEFAULT 'draft'::"variation_status";

ALTER TABLE "cost_proposals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "cost_proposals" ALTER COLUMN "status" TYPE "cost_proposal_status" USING "status"::"cost_proposal_status";
ALTER TABLE "cost_proposals" ALTER COLUMN "status" SET DEFAULT 'draft'::"cost_proposal_status";

ALTER TABLE "tax_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tax_invoices" ALTER COLUMN "status" TYPE "tax_invoice_status" USING "status"::"tax_invoice_status";
ALTER TABLE "tax_invoices" ALTER COLUMN "status" SET DEFAULT 'draft'::"tax_invoice_status";

ALTER TABLE "correspondences" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "correspondences" ALTER COLUMN "status" TYPE "correspondence_status" USING "status"::"correspondence_status";
ALTER TABLE "correspondences" ALTER COLUMN "status" SET DEFAULT 'draft'::"correspondence_status";

-- Procurement tables (currently empty, but use safe cast anyway)
ALTER TABLE "vendors" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "vendors" ALTER COLUMN "status" TYPE "vendor_status" USING "status"::"vendor_status";
ALTER TABLE "vendors" ALTER COLUMN "status" SET DEFAULT 'draft'::"vendor_status";

ALTER TABLE "vendor_contracts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "vendor_contracts" ALTER COLUMN "status" TYPE "vendor_contract_status" USING "status"::"vendor_contract_status";
ALTER TABLE "vendor_contracts" ALTER COLUMN "status" SET DEFAULT 'draft'::"vendor_contract_status";

ALTER TABLE "framework_agreements" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "framework_agreements" ALTER COLUMN "status" TYPE "framework_agreement_status" USING "status"::"framework_agreement_status";
ALTER TABLE "framework_agreements" ALTER COLUMN "status" SET DEFAULT 'draft'::"framework_agreement_status";

ALTER TABLE "rfqs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rfqs" ALTER COLUMN "status" TYPE "rfq_status" USING "status"::"rfq_status";
ALTER TABLE "rfqs" ALTER COLUMN "status" SET DEFAULT 'draft'::"rfq_status";

ALTER TABLE "quotations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "status" TYPE "quotation_status" USING "status"::"quotation_status";
ALTER TABLE "quotations" ALTER COLUMN "status" SET DEFAULT 'received'::"quotation_status";

-- ============================================================================
-- H5: Rebuild status-based composite indexes (type changed from text to enum)
-- Prior migrations created these on text columns; the ALTER COLUMN TYPE above
-- invalidated them. Drop (if exists) then recreate on the enum-typed column.
-- ============================================================================

DROP INDEX IF EXISTS "ipas_project_id_status_idx";
CREATE INDEX "ipas_project_id_status_idx" ON "ipas"("project_id", "status");

DROP INDEX IF EXISTS "ipcs_project_id_status_idx";
CREATE INDEX "ipcs_project_id_status_idx" ON "ipcs"("project_id", "status");

DROP INDEX IF EXISTS "variations_project_id_status_idx";
CREATE INDEX "variations_project_id_status_idx" ON "variations"("project_id", "status");

DROP INDEX IF EXISTS "variations_project_id_subtype_status_idx";
CREATE INDEX "variations_project_id_subtype_status_idx" ON "variations"("project_id", "subtype", "status");

DROP INDEX IF EXISTS "cost_proposals_project_id_status_idx";
CREATE INDEX "cost_proposals_project_id_status_idx" ON "cost_proposals"("project_id", "status");

DROP INDEX IF EXISTS "tax_invoices_project_id_status_idx";
CREATE INDEX "tax_invoices_project_id_status_idx" ON "tax_invoices"("project_id", "status");

DROP INDEX IF EXISTS "correspondences_project_id_status_idx";
CREATE INDEX "correspondences_project_id_status_idx" ON "correspondences"("project_id", "status");

DROP INDEX IF EXISTS "correspondences_project_id_subtype_status_idx";
CREATE INDEX "correspondences_project_id_subtype_status_idx" ON "correspondences"("project_id", "subtype", "status");

DROP INDEX IF EXISTS "vendors_entity_id_status_idx";
CREATE INDEX "vendors_entity_id_status_idx" ON "vendors"("entity_id", "status");

DROP INDEX IF EXISTS "vendor_contracts_project_id_status_idx";
CREATE INDEX "vendor_contracts_project_id_status_idx" ON "vendor_contracts"("project_id", "status");

DROP INDEX IF EXISTS "framework_agreements_entity_id_status_idx";
CREATE INDEX "framework_agreements_entity_id_status_idx" ON "framework_agreements"("entity_id", "status");

DROP INDEX IF EXISTS "framework_agreements_project_id_status_idx";
CREATE INDEX "framework_agreements_project_id_status_idx" ON "framework_agreements"("project_id", "status");

DROP INDEX IF EXISTS "rfqs_project_id_status_idx";
CREATE INDEX "rfqs_project_id_status_idx" ON "rfqs"("project_id", "status");

DROP INDEX IF EXISTS "quotations_rfq_id_status_idx";
CREATE INDEX "quotations_rfq_id_status_idx" ON "quotations"("rfq_id", "status");

-- ============================================================================
-- H6: Foreign key constraints for categoryId and itemCatalogId
-- ============================================================================

-- categoryId → ProcurementCategory (5 tables)
ALTER TABLE "item_catalogs" ADD CONSTRAINT "item_catalogs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- itemCatalogId → ItemCatalog (4 tables)
ALTER TABLE "framework_agreement_items" ADD CONSTRAINT "framework_agreement_items_item_catalog_id_fkey" FOREIGN KEY ("item_catalog_id") REFERENCES "item_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_item_catalog_id_fkey" FOREIGN KEY ("item_catalog_id") REFERENCES "item_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_item_catalog_id_fkey" FOREIGN KEY ("item_catalog_id") REFERENCES "item_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_catalog_id_fkey" FOREIGN KEY ("item_catalog_id") REFERENCES "item_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- H6: Indexes for FK columns (IF NOT EXISTS — some may have been created in prior migrations)
CREATE INDEX IF NOT EXISTS "item_catalogs_category_id_idx" ON "item_catalogs"("category_id");
CREATE INDEX IF NOT EXISTS "rfqs_category_id_idx" ON "rfqs"("category_id");
CREATE INDEX IF NOT EXISTS "purchase_orders_category_id_idx" ON "purchase_orders"("category_id");
CREATE INDEX IF NOT EXISTS "supplier_invoices_category_id_idx" ON "supplier_invoices"("category_id");
CREATE INDEX IF NOT EXISTS "expenses_category_id_idx" ON "expenses"("category_id");
CREATE INDEX IF NOT EXISTS "framework_agreement_items_item_catalog_id_idx" ON "framework_agreement_items"("item_catalog_id");
CREATE INDEX IF NOT EXISTS "rfq_items_item_catalog_id_idx" ON "rfq_items"("item_catalog_id");
CREATE INDEX IF NOT EXISTS "quotation_line_items_item_catalog_id_idx" ON "quotation_line_items"("item_catalog_id");
CREATE INDEX IF NOT EXISTS "purchase_order_items_item_catalog_id_idx" ON "purchase_order_items"("item_catalog_id");
