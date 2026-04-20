-- Commercial forecast layer — per-period IPA plan of record.
-- Anchored to the same periodNumber grain as the Ipa table.
-- Unique on (project_id, period_number) to guarantee 1:1 pairing.

-- CreateTable
CREATE TABLE "ipa_forecasts" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "ipa_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ipa_forecasts_project_id_period_number_key" ON "ipa_forecasts"("project_id", "period_number");

-- CreateIndex
CREATE INDEX "ipa_forecasts_project_id_period_start_idx" ON "ipa_forecasts"("project_id", "period_start");

-- AddForeignKey
ALTER TABLE "ipa_forecasts" ADD CONSTRAINT "ipa_forecasts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
