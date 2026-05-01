/*
  Migration: convert_procurement_status_to_enum
  Date:      2026-04-23 (logical timestamp; restoration committed May 1, 2026)
  Module:    Procurement (PO, SI, Expense, Credit Note status types)
  PR:        fix(db): restore missing CREATE TYPE statements + table conversions in migration history (PR-0)

  Restores 4 missing enum types and converts the corresponding TEXT status columns
  to use those types. These enums were declared in schema.prisma but never captured
  in migration history — the dev DB acquired them via prisma db push or hand-applied
  SQL. Same class of bug as 20260414120000_add_internal_budget_and_ei.

  Without this migration, 20260423130000_add_po_returned_status and
  20260423140000_add_expense_returned_status fail because they ALTER TYPEs that
  don't exist.

  Operations performed:
   1. Create 4 enum types with baseline values:
      - purchase_order_status (9 values; the 10th, 'returned', is added by 20260423130000)
      - expense_status (7 values; the 8th, 'returned', is added by 20260423140000)
      - supplier_invoice_status (7 values, stable)
      - credit_note_status (6 values, stable)
   2. Drop existing TEXT DEFAULTs on status columns
   3. Convert status columns from TEXT to their enum types (via USING ... :: TYPE cast)
   4. Re-apply DEFAULTs in the new enum types

  Caveat for future commercial deployments: the ALTER COLUMN ... USING ... :: TYPE
  cast assumes every existing status value matches an enum value. If a customer
  database has invalid status data, this migration will fail at the cast step.
  This is acceptable for current operations because (a) on fresh DBs no data
  exists, (b) on existing dev DBs this migration is marked --applied without
  running, (c) all known status values match the enum.

  Existing dev DBs already have these enum types. Mark as applied without running:
    pnpm prisma migrate resolve --applied 20260423125000_convert_procurement_status_to_enum
*/

-- CreateEnum: purchase_order_status (9 baseline values)
CREATE TYPE "purchase_order_status" AS ENUM (
  'draft', 'submitted', 'approved', 'issued', 'partially_delivered',
  'delivered', 'closed', 'rejected', 'cancelled'
);

-- CreateEnum: expense_status (7 baseline values)
CREATE TYPE "expense_status" AS ENUM (
  'draft', 'submitted', 'approved', 'paid', 'closed', 'rejected', 'cancelled'
);

-- CreateEnum: supplier_invoice_status (7 values, stable)
CREATE TYPE "supplier_invoice_status" AS ENUM (
  'received', 'under_review', 'approved', 'disputed', 'paid', 'closed', 'rejected'
);

-- CreateEnum: credit_note_status (6 values, stable)
CREATE TYPE "credit_note_status" AS ENUM (
  'received', 'verified', 'applied', 'disputed', 'closed', 'cancelled'
);

-- Drop default → convert column type → re-apply default, for each table
-- IMPORTANT: drop default first; can't ALTER TYPE while a TEXT default sits on the column.

-- purchase_orders
ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "status" TYPE "purchase_order_status" USING "status"::"purchase_order_status";
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'draft';

-- expenses
ALTER TABLE "expenses" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "expenses" ALTER COLUMN "status" TYPE "expense_status" USING "status"::"expense_status";
ALTER TABLE "expenses" ALTER COLUMN "status" SET DEFAULT 'draft';

-- supplier_invoices
ALTER TABLE "supplier_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "supplier_invoices" ALTER COLUMN "status" TYPE "supplier_invoice_status" USING "status"::"supplier_invoice_status";
ALTER TABLE "supplier_invoices" ALTER COLUMN "status" SET DEFAULT 'received';

-- credit_notes
ALTER TABLE "credit_notes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "credit_notes" ALTER COLUMN "status" TYPE "credit_note_status" USING "status"::"credit_note_status";
ALTER TABLE "credit_notes" ALTER COLUMN "status" SET DEFAULT 'received';
