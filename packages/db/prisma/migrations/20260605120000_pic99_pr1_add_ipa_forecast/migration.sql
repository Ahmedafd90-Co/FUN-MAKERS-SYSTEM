-- PIC-99 PR-1 (M1) — IpaForecast writable foundation, born org-scoped.
--
-- First sub-PR of the M1 epic (first sellable module on the completed MT-spine).
-- The model does NOT enter the codebase without orgId — F2 pattern preserves
-- single-tenant behavior via singleton @default while the spine matures.
--
-- SR-Multi-Tenancy + SR-Canonical-Patterns: project-scoped sequential
-- periodNumber uses compound UNIQUE (org_id, project_id, period_number),
-- NOT global (project_id, period_number). Periodnumber is per-project
-- sequential (1=first period, 2=second, ...); compound with org_id mirrors
-- the pattern even though Project.id implies orgId transitively.
--
-- Soft-delete (PD ruling 4a70d247): deleted_at + deleted_by preserves
-- audited historical record. Service-layer reads filter deleted_at IS NULL
-- by default; PR-2 cost-sheet aggregation will skip soft-deleted rows.
--
-- ImportType enum extended with 'ipa_forecast' so sheet imports can stage
-- forecast rows. ALTER TYPE ADD VALUE IF NOT EXISTS — Postgres 14+ supports
-- this inside a transaction (we target PG 14+ in docker-compose).
--
-- Metadata-only — new table; no data backfill needed.

-- CreateTable
CREATE TABLE "ipa_forecasts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "project_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "forecast_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

    CONSTRAINT "ipa_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — compound unique per SR-Multi-Tenancy
CREATE UNIQUE INDEX "ipa_forecasts_org_id_project_id_period_number_key" ON "ipa_forecasts"("org_id", "project_id", "period_number");

-- CreateIndex — by-project time-series
CREATE INDEX "ipa_forecasts_project_id_period_start_idx" ON "ipa_forecasts"("project_id", "period_start");

-- AddForeignKey — Project (RESTRICT to preserve forecast rows if a delete is attempted)
ALTER TABLE "ipa_forecasts" ADD CONSTRAINT "ipa_forecasts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — Organization (RESTRICT same as PIC-75 transactional leaves)
ALTER TABLE "ipa_forecasts" ADD CONSTRAINT "ipa_forecasts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ExtendEnum — add 'ipa_forecast' to ImportType so sheet imports can stage forecast rows
ALTER TYPE "import_type" ADD VALUE IF NOT EXISTS 'ipa_forecast';
