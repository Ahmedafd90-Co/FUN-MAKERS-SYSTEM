/*
  Migration: add_missing_projects_columns_and_tables
  Date:      2026-04-20 (logical timestamp; restoration committed May 1, 2026)
  Module:    Cross-module drift restoration (Project + Module 4 sibling + Module 2 sibling)
  PR:        fix(db): comprehensive migration history drift sweep (PR-0b)

  Restores 4 schema objects that were declared in schema.prisma but never captured
  in any migration:
   - projects.contract_value (Decimal nullable; Phase D2 commercial baseline)
   - projects.revised_contract_value (Decimal nullable; Phase D2 commercial baseline)
   - budget_absorption_exceptions table (Module 4 sibling; tracks budget absorption issues)
   - invoice_collections table (Module 2 sibling; tracks tax-invoice payment collections)

  This is the THIRD instance of the "schema declared, migration missing" pattern,
  found via comprehensive drift sweep using `prisma migrate diff` against a
  freshly-replayed dev DB. PR-0 caught the first two patterns:
   - 20260414120000_add_internal_budget_and_ei (Module 4 — 5 tables, 2 enums)
   - 20260423125000_convert_procurement_status_to_enum (4 enums + TEXT->ENUM casts)

  Timestamp choice (20260420000000) intentionally places this migration BEFORE
  20260421190000_add_absorption_exception_source_amount_category_code, which ALTERs
  the budget_absorption_exceptions table created here. Without this ordering, the
  later ALTER fails with "relation does not exist" on fresh DBs. Placing this fix
  in the timeline slot where the table logically should have been created restores
  the intended sequence.

  Defensive idempotency: every operation uses IF NOT EXISTS guards (or a
  pg_constraint check for FKs). This means:
   - Re-running the migration is safe (no-op for objects already present)
   - Existing dev DBs that already have these objects from prior `prisma db push`
     can apply this migration without error if `migrate resolve --applied` is
     skipped accidentally
   - Fresh DBs (CI, new dev setup) get the full create

  Existing dev DBs — recommended path:
    pnpm prisma migrate resolve --applied 20260420000000_add_missing_projects_columns_and_tables

  Fresh DBs (CI, new dev setup): apply normally via prisma migrate dev.

  Verification: `prisma migrate diff --from-url ... --to-schema-datamodel` returns
  empty after this migration plus PR-0's two migrations are in place. The full
  migration history now produces a schema that matches schema.prisma exactly
  (excluding the 2 known orphan enum types tracked separately in PIC-9).
*/

-- AlterTable: add 2 columns to projects (defensive — IF NOT EXISTS)
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "contract_value" DECIMAL(18,2);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "revised_contract_value" DECIMAL(18,2);

-- CreateTable: budget_absorption_exceptions (defensive — IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "budget_absorption_exceptions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "source_record_type" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "absorption_type" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_absorption_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoice_collections (defensive — IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "invoice_collections" (
    "id" TEXT NOT NULL,
    "tax_invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "collection_date" TIMESTAMP(3) NOT NULL,
    "payment_method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: budget_absorption_exceptions (defensive — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "budget_absorption_exceptions_project_id_status_idx" ON "budget_absorption_exceptions"("project_id", "status");
CREATE INDEX IF NOT EXISTS "budget_absorption_exceptions_source_record_type_source_reco_idx" ON "budget_absorption_exceptions"("source_record_type", "source_record_id");

-- CreateIndex: invoice_collections (defensive — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "invoice_collections_tax_invoice_id_idx" ON "invoice_collections"("tax_invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_collections_collection_date_idx" ON "invoice_collections"("collection_date");

-- AddForeignKey: Postgres has no native ADD CONSTRAINT IF NOT EXISTS, so guard
-- via pg_constraint lookup. Both FKs use ON DELETE RESTRICT (parent rows can't
-- be deleted while child rows reference them) and ON UPDATE CASCADE (child FKs
-- track parent ID renames, though id renames are unusual).
--
-- IMPORTANT: pg_constraint.conname is unique PER TABLE, not globally. The
-- existence checks below scope by con.contype = 'f' (foreign keys only) AND
-- con.conrelid = '"<table>"'::regclass (specific table), so a same-named
-- constraint on another table can't fool the guard into silently skipping
-- FK creation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conname = 'budget_absorption_exceptions_project_id_fkey'
      AND con.contype = 'f'
      AND con.conrelid = '"budget_absorption_exceptions"'::regclass
  ) THEN
    ALTER TABLE "budget_absorption_exceptions"
      ADD CONSTRAINT "budget_absorption_exceptions_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conname = 'invoice_collections_tax_invoice_id_fkey'
      AND con.contype = 'f'
      AND con.conrelid = '"invoice_collections"'::regclass
  ) THEN
    ALTER TABLE "invoice_collections"
      ADD CONSTRAINT "invoice_collections_tax_invoice_id_fkey"
      FOREIGN KEY ("tax_invoice_id") REFERENCES "tax_invoices"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
