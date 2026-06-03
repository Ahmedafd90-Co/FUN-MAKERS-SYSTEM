-- PIC-98 PR-2 (F4) — Denormalize OverrideLog.orgId from audit_logs parent.
--
-- PD ruling 71de0038 / a0748f23:
--   F2 PIC-96 added orgId to audit_logs but OverrideLog inherited org via
--   its `audit_log_id` FK (JOIN-derived, NOT denormalized). PR-2 closes
--   that F2 gap by denormalizing — for two binding reasons:
--
--   (1) GUARD-VISIBILITY: when PR-3c adds tenant-admin reachability to
--       audit.overrides/overrideDetail, the static-AST guard
--       (packages/core/tests/scope-binding-guard.test.ts from PR-71) needs
--       a same-fn org-scope assert visible at the service layer. A
--       JOIN-derived check (`where: { auditLog: { orgId: ctx.orgId } }`)
--       lives at the router/where-clause layer and the guard would have to
--       exempt every overrideLog by-id read with a documented reason.
--       Denormalizing keeps the guard-green property the F4 merge bar
--       requires.
--
--   (2) PARITY WITH F2 BUCKET-2: every other audit-adjacent model
--       (AuditLog/PostingEvent/BudgetAbsorptionException) got its own
--       orgId column in F2 PIC-96. OverrideLog was the singleton F2 gap
--       (surfaced in PR-71 phase-A recon).
--
-- Backfill strategy:
--   The F2 bucket-2 pattern uses `ADD COLUMN ... DEFAULT '<singleton>'`
--   which is atomic metadata-only on Postgres 14+ — but it would override
--   the audit_logs parent's org for existing rows IF a future tenant had
--   audit-with-overrides in mid-state. To guarantee parent-equivalence on
--   every existing row regardless of multi-tenant state, this migration:
--     1. ADD COLUMN nullable (so backfill can run on existing rows).
--     2. UPDATE override_logs SET org_id = parent audit_logs.org_id.
--     3. ALTER COLUMN NOT NULL + DEFAULT (matches F2 pattern for new rows).
--     4. ADD FOREIGN KEY to organizations(id).
--
--   Today the singleton makes (1)-(2) and the simple default-add identical
--   — every audit_logs.org_id is the singleton — but the JOIN-backfill is
--   the correct shape for multi-tenant future. PD a0748f23 ratified.
--
-- Schema change only — no app-layer behavior change in PR-2. PR-3c is when
-- the tenant-admin reachability scoping for audit.overrides actually uses
-- this column.

-- AlterTable: add nullable column first so backfill can run on existing rows
ALTER TABLE "override_logs" ADD COLUMN     "org_id" TEXT;

-- Backfill: derive each override row's org from its audit_logs parent
UPDATE "override_logs" SET "org_id" = (SELECT "org_id" FROM "audit_logs" WHERE "id" = "override_logs"."audit_log_id");

-- AlterTable: now make NOT NULL + apply the F2-style singleton default for new rows
ALTER TABLE "override_logs" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "override_logs" ALTER COLUMN "org_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AddForeignKey: mirror the F2 PIC-96 pattern
ALTER TABLE "override_logs" ADD CONSTRAINT "override_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
