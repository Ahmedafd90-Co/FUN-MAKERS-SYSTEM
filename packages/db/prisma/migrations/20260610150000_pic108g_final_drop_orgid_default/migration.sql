-- PIC-108-G-final (Phase MT): drop the orgId singleton @default from the 32
-- drop-eligible tenant tables. The supply phase (108-B..F) made every runtime
-- writer supply orgId; G-prep made every seed/fixture/script explicit (sweep
-- 383 -> 0). From here, an INSERT omitting org_id fails loud (NOT NULL), and
-- the Prisma create types require orgId at compile time.
--
-- AuditLog (audit_logs) is EXCLUDED BY DESIGN: ~194 chokepoint callers +
-- apps/web notifications.ts still rely on the chokepoint's `?? SINGLETON`
-- fallback / the column default (the A' carry-forward). Its default drops
-- only after the audit-threading pass.
--
-- DROP DEFAULT is metadata-only (removes the pg_attrdef entry): no table
-- rewrite, existing rows keep their stored org_id values.

ALTER TABLE "budget_absorption_exceptions" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "correspondences" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "cost_proposals" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "credit_notes" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "drawings" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "engineer_instructions" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "entities" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "expenses" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "framework_agreements" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "import_batches" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "intercompany_contracts" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "ipa_forecasts" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "ipas" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "ipcs" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "item_catalogs" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "override_logs" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "posting_events" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "procurement_categories" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "project_budgets" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "project_participants" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "projects" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "reference_counters" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "rfqs" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "supplier_invoices" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "tax_invoices" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "variations" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "vendor_contracts" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "vendors" ALTER COLUMN "org_id" DROP DEFAULT;
ALTER TABLE "workflow_instances" ALTER COLUMN "org_id" DROP DEFAULT;
