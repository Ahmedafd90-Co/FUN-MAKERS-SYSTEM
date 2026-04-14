-- AlterTable
ALTER TABLE "workflow_steps" ADD COLUMN     "outcome_type" TEXT NOT NULL DEFAULT 'approve';

-- Backfill: reclassify existing steps based on name patterns.
-- Order matters: more specific patterns first, then broader ones.

-- Issue steps (exact match on name)
UPDATE "workflow_steps" SET "outcome_type" = 'issue'
WHERE LOWER("name") = 'issue';

-- Sign steps (name contains "Sign" but not combined "Approval/Sign")
UPDATE "workflow_steps" SET "outcome_type" = 'sign'
WHERE "name" ILIKE '%Sign%' AND "name" NOT ILIKE '%Approval/Sign%';

-- Combined approval+sign steps (e.g. "PD Approval/Sign") — classify as sign
-- because the signing authority is the dominant semantic
UPDATE "workflow_steps" SET "outcome_type" = 'sign'
WHERE "name" ILIKE '%Approval/Sign%';

-- Review steps: Prepare, Review, Check, Originator, Verification
UPDATE "workflow_steps" SET "outcome_type" = 'review'
WHERE ("name" ILIKE '%Prepare%'
    OR "name" ILIKE '%Review%'
    OR "name" ILIKE '%Check%'
    OR "name" ILIKE '%Originator%'
    OR "name" ILIKE '%Verification%')
  AND "outcome_type" = 'approve';  -- don't overwrite sign/issue already set above

-- Correspondence originator/drafter steps named "Commercial/Contracts" are review, not approve.
-- These are the first step in claim/back_charge templates where the originator drafts the document.
UPDATE "workflow_steps" SET "outcome_type" = 'review'
WHERE "name" = 'Commercial/Contracts' AND "outcome_type" = 'approve';
