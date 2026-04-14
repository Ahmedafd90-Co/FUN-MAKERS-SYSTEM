-- Quotation identity model: one quotation per vendor per RFQ.
-- Converts the existing non-unique index to a unique constraint.
-- Stabilization Slice B.

-- Drop the existing non-unique index
DROP INDEX IF EXISTS "quotations_rfq_id_vendor_id_idx";

-- Add the unique constraint (creates an implicit unique index)
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfq_id_vendor_id_key" UNIQUE ("rfq_id", "vendor_id");
