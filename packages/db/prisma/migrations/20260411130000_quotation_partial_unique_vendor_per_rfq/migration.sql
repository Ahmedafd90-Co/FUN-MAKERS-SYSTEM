-- Corrective migration: replace absolute unique constraint with partial unique index.
--
-- The absolute @@unique([rfqId, vendorId]) blocked re-quoting after terminal status.
-- Business rule: one ACTIVE quotation per vendor per RFQ. Terminal quotations
-- (rejected, expired, awarded) should not block a fresh submission.
--
-- Partial unique index enforces this at the DB level while allowing re-quote
-- after terminal states.

-- Drop the absolute unique constraint from previous migration
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_rfq_id_vendor_id_key";

-- Re-create the regular index for query performance
CREATE INDEX IF NOT EXISTS "quotations_rfq_id_vendor_id_idx" ON "quotations" ("rfq_id", "vendor_id");

-- Partial unique index: one non-terminal quotation per vendor per RFQ.
-- Only enforced when status is NOT in a terminal state.
CREATE UNIQUE INDEX "quotations_rfq_id_vendor_id_active_key"
ON "quotations" ("rfq_id", "vendor_id")
WHERE "status" NOT IN ('awarded', 'rejected', 'expired');
