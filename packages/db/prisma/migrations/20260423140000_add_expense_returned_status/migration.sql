-- Add 'returned' to the expense_status enum so workflow returns
-- can drive the Expense status (parity with PO / IPA / IPC / RFQ /
-- Variation / Correspondence).
--
-- Zero-risk migration: enum value addition is non-destructive and
-- requires no backfill. Existing rows and queries are unaffected.

ALTER TYPE "expense_status" ADD VALUE IF NOT EXISTS 'returned';
