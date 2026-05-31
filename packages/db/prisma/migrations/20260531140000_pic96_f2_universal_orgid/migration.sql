-- PIC-96 (F2) Batch 1 — Universal orgId coverage (Bucket-2 models)
--
-- Extends the org backbone (F1: Entity/User/Project) to the 17 transactional
-- "Bucket-2" models that F3 will org-filter DIRECTLY (they each have a
-- list/query root). Pure-child models (Bucket 3) and join/settings tables
-- inherit org through their already-scoped parent and get NO column.
--
-- Each model gains `org_id TEXT NOT NULL DEFAULT '…0001'` (the singleton)
-- + FK to organizations. Identical to the F1 pattern: stored-default backfill
-- is atomic metadata-only on Postgres 14+ (no table rewrite), so existing
-- rows read the singleton immediately and existing code is unaffected.
-- orgId stays UNENFORCED at the app layer until F3.
--
-- FrameworkAgreement derives org from Entity (entityId non-null, projectId
-- nullable); all others derive from Project. The COLUMN is identical either
-- way — the derive-source matters only at F3 create-time.
--
-- No enum changes, no drops, no renames → no PIC-93-class deploy risk.
-- Singleton UUID byte-identical to schema @default + seed SINGLETON_ORG_ID.

-- AlterTable
ALTER TABLE "workflow_instances" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "posting_events" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "budget_absorption_exceptions" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "procurement_categories" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "item_catalogs" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "framework_agreements" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "supplier_invoices" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "project_budgets" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "project_participants" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "intercompany_contracts" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "drawings" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_events" ADD CONSTRAINT "posting_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_absorption_exceptions" ADD CONSTRAINT "budget_absorption_exceptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_categories" ADD CONSTRAINT "procurement_categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_catalogs" ADD CONSTRAINT "item_catalogs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_agreements" ADD CONSTRAINT "framework_agreements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
