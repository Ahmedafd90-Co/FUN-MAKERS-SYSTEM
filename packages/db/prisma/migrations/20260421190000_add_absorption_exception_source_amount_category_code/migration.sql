-- Path β truth fix (2026-04-21):
-- Add nullable truth-snapshot columns to BudgetAbsorptionException so the
-- Budget page banner and Admin detail view can tell a coherent story even
-- when the source record has been deleted, renumbered, or (for demo seeds)
-- never existed. Populated by absorbers at exception-creation time.
--
-- sourceAmount : amount of the source record at failure time
--                (PO.totalAmount, SI.totalAmount, Expense.amount,
--                CreditNote.amount). Nullable for exceptions that failed
--                before an amount could be read.
--
-- categoryCode : ProcurementCategory.code the absorber knew when it
--                recorded the exception. Nullable for no_category /
--                no_procurement_category cases where no category was ever
--                resolvable.
--
-- Additive + nullable only — no backfill-blocking constraints, no data loss.

ALTER TABLE "budget_absorption_exceptions"
  ADD COLUMN "source_amount" DECIMAL(18,2),
  ADD COLUMN "category_code" TEXT;
