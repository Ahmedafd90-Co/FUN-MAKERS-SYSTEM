-- PIC-84 (F2 Batch 3) — per-tenant numbering: robust counters + per-org uniqueness
--
-- migration-guardian (F2-proven re-key pattern):
-- Classification: re-key (5 single-field unique → per-org compound) + 1 additive
--   column (reference_counters.org_id, singleton default) + 1 new table
--   (org_sequence_counters) + a one-time per-org backfill of the new counter.
-- What's changing: agreement_number / contract_number / rfq_number / po_number /
--   credit_note_number drop their GLOBAL @unique and gain @@unique([orgId, X]);
--   reference_counters re-keys [project_id,type_code] → [org_id,project_id,type_code];
--   new org_sequence_counters([org_id,type_code]) hosts the atomic FA/VC/RFQ counters.
-- Compatibility: the 5 CREATE UNIQUE INDEX statements ARE the data-violation gate —
--   they fail loud if any (org_id, number) duplicate exists. Today all rows are
--   singleton-org and numbers are globally unique, so per-org uniqueness holds
--   trivially. reference_counters.org_id is an additive NOT NULL DEFAULT column —
--   atomic metadata-only on Postgres 14+ (no table rewrite); existing rows read the
--   singleton immediately. No enum changes, no drops of data → no PIC-93 deploy risk.
-- Rollback reality: drop the 6 compound indexes + the 2 FKs + org_sequence_counters
--   + reference_counters.org_id, restore the 5 single-field uniques + the old
--   reference_counters unique. The bare numbers are unchanged (values untouched).
-- Verification: migrate-deploy-clean on a FRESH DB seeded with conforming FA/VC/RFQ
--   rows INCLUDING a 2nd org; assert the counter backfilled PER-ORG maxes (not a
--   global max) and a post-migration generate continues without collision.

-- ---------------------------------------------------------------------------
-- 1. Drop the old global / project-scoped uniques being replaced.
-- ---------------------------------------------------------------------------
DROP INDEX "reference_counters_project_id_type_code_key";
DROP INDEX "vendor_contracts_contract_number_key";
DROP INDEX "framework_agreements_agreement_number_key";
DROP INDEX "rfqs_rfq_number_key";
DROP INDEX "purchase_orders_po_number_key";
DROP INDEX "credit_notes_credit_note_number_key";

-- ---------------------------------------------------------------------------
-- 2. ReferenceCounter: additive orgId (singleton default, metadata-only PG14+).
-- ---------------------------------------------------------------------------
ALTER TABLE "reference_counters" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. New per-ORG atomic sequence counter (FA/VC/RFQ bare XX-NNNN sequences).
-- ---------------------------------------------------------------------------
CREATE TABLE "org_sequence_counters" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "org_sequence_counters_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. New unique indexes (the 5 number ones are the per-org data-violation gate).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "org_sequence_counters_org_id_type_code_key" ON "org_sequence_counters"("org_id", "type_code");
CREATE UNIQUE INDEX "reference_counters_org_id_project_id_type_code_key" ON "reference_counters"("org_id", "project_id", "type_code");
CREATE UNIQUE INDEX "vendor_contracts_org_id_contract_number_key" ON "vendor_contracts"("org_id", "contract_number");
CREATE UNIQUE INDEX "framework_agreements_org_id_agreement_number_key" ON "framework_agreements"("org_id", "agreement_number");
CREATE UNIQUE INDEX "rfqs_org_id_rfq_number_key" ON "rfqs"("org_id", "rfq_number");
CREATE UNIQUE INDEX "purchase_orders_org_id_po_number_key" ON "purchase_orders"("org_id", "po_number");
CREATE UNIQUE INDEX "credit_notes_org_id_credit_note_number_key" ON "credit_notes"("org_id", "credit_note_number");

-- ---------------------------------------------------------------------------
-- 5. Foreign keys for the two counter tables' org_id.
-- ---------------------------------------------------------------------------
ALTER TABLE "reference_counters" ADD CONSTRAINT "reference_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "org_sequence_counters" ADD CONSTRAINT "org_sequence_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Backfill org_sequence_counters from each org's CURRENT max (RULED).
--    HARD RULE 1: PER-ORG max (GROUP BY org_id), NEVER a global SELECT MAX — a
--    global max works with one org today but re-plants the cross-tenant collision
--    the re-key just fixed.
--    HARD RULE 2: FAIL LOUD on any value that doesn't parse to the formatter's
--    XX-NNNN shape — a silent skip / coerce-to-0 would under-count the max and the
--    next generate would collide with an existing number.
--    (Only FA/VC/RFQ have generated counters. CreditNote is user-supplied and
--    PurchaseOrder uses the project-scoped ReferenceCounter — neither is seeded here.)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "framework_agreements" WHERE "agreement_number" !~ '^FA-\d+$')
  THEN RAISE EXCEPTION 'PIC-84 backfill: framework_agreements.agreement_number has a value not matching FA-NNNN — refusing to seed the counter (would mis-count and collide). Clean the data and re-run.';
  END IF;
  IF EXISTS (SELECT 1 FROM "vendor_contracts" WHERE "contract_number" !~ '^VC-\d+$')
  THEN RAISE EXCEPTION 'PIC-84 backfill: vendor_contracts.contract_number has a value not matching VC-NNNN — refusing to seed the counter.';
  END IF;
  IF EXISTS (SELECT 1 FROM "rfqs" WHERE "rfq_number" !~ '^RFQ-\d+$')
  THEN RAISE EXCEPTION 'PIC-84 backfill: rfqs.rfq_number has a value not matching RFQ-NNNN — refusing to seed the counter.';
  END IF;
END $$;

INSERT INTO "org_sequence_counters" ("id", "org_id", "type_code", "last_number")
SELECT gen_random_uuid(), "org_id", 'FA', MAX(CAST(substring("agreement_number" from '^FA-(\d+)$') AS integer))
  FROM "framework_agreements"
 GROUP BY "org_id"
ON CONFLICT ("org_id", "type_code") DO UPDATE SET "last_number" = GREATEST("org_sequence_counters"."last_number", EXCLUDED."last_number");

INSERT INTO "org_sequence_counters" ("id", "org_id", "type_code", "last_number")
SELECT gen_random_uuid(), "org_id", 'VC', MAX(CAST(substring("contract_number" from '^VC-(\d+)$') AS integer))
  FROM "vendor_contracts"
 GROUP BY "org_id"
ON CONFLICT ("org_id", "type_code") DO UPDATE SET "last_number" = GREATEST("org_sequence_counters"."last_number", EXCLUDED."last_number");

INSERT INTO "org_sequence_counters" ("id", "org_id", "type_code", "last_number")
SELECT gen_random_uuid(), "org_id", 'RFQ', MAX(CAST(substring("rfq_number" from '^RFQ-(\d+)$') AS integer))
  FROM "rfqs"
 GROUP BY "org_id"
ON CONFLICT ("org_id", "type_code") DO UPDATE SET "last_number" = GREATEST("org_sequence_counters"."last_number", EXCLUDED."last_number");
