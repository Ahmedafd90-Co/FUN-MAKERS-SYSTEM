-- Add 'returned' to the purchase_order_status enum so workflow returns
-- can drive the PO status (parity with IPA / IPC / RFQ / Variation / Correspondence).
--
-- Zero-risk migration: enum value addition is non-destructive and requires
-- no backfill. Existing rows and queries are unaffected.

ALTER TYPE "purchase_order_status" ADD VALUE IF NOT EXISTS 'returned';
