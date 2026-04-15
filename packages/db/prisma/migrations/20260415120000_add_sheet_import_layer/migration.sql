-- CreateEnum
CREATE TYPE "posting_origin" AS ENUM ('live', 'imported_historical');

-- CreateEnum
CREATE TYPE "ipa_origin" AS ENUM ('live', 'imported_historical');

-- CreateEnum
CREATE TYPE "import_type" AS ENUM ('budget_baseline', 'ipa_history');

-- CreateEnum
CREATE TYPE "import_batch_status" AS ENUM ('staged', 'validated', 'partially_valid', 'committed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('pending', 'valid', 'invalid', 'conflict', 'committed', 'skipped');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "budget_adjustment_type" ADD VALUE 'line_import';
ALTER TYPE "budget_adjustment_type" ADD VALUE 'line_manual_adjustment';

-- AlterTable
ALTER TABLE "budget_adjustments" ADD COLUMN     "after_amount" DECIMAL(18,2),
ADD COLUMN     "before_amount" DECIMAL(18,2),
ADD COLUMN     "budget_line_id" TEXT,
ADD COLUMN     "import_batch_id" TEXT;

-- AlterTable
ALTER TABLE "budget_lines" ADD COLUMN     "import_batch_id" TEXT,
ADD COLUMN     "import_row_id" TEXT,
ADD COLUMN     "imported_at" TIMESTAMP(3),
ADD COLUMN     "imported_by_user_id" TEXT,
ADD COLUMN     "last_imported_amount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "ipas" ADD COLUMN     "import_batch_id" TEXT,
ADD COLUMN     "import_row_id" TEXT,
ADD COLUMN     "imported_at" TIMESTAMP(3),
ADD COLUMN     "imported_by_user_id" TEXT,
ADD COLUMN     "imported_original_json" JSONB,
ADD COLUMN     "origin" "ipa_origin" NOT NULL DEFAULT 'live';

-- AlterTable
ALTER TABLE "posting_events" ADD COLUMN     "import_batch_id" TEXT,
ADD COLUMN     "origin" "posting_origin" NOT NULL DEFAULT 'live';

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "import_type" "import_type" NOT NULL,
    "source_file_name" TEXT NOT NULL,
    "source_file_hash" TEXT NOT NULL,
    "source_storage_path" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "status" "import_batch_status" NOT NULL DEFAULT 'staged',
    "summary_json" JSONB NOT NULL,
    "parser_version" TEXT,
    "validator_schema_version" TEXT,
    "reference_data_snapshot_json" JSONB,
    "source_file_hash_at_validation" TEXT,
    "validation_ran_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),
    "committed_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_json" JSONB NOT NULL,
    "parsed_json" JSONB,
    "validation_errors_json" JSONB NOT NULL DEFAULT '[]',
    "warnings_json" JSONB NOT NULL DEFAULT '[]',
    "conflict_json" JSONB,
    "status" "import_row_status" NOT NULL DEFAULT 'pending',
    "committed_record_type" TEXT,
    "committed_record_id" TEXT,
    "excluded_by_user_id" TEXT,
    "excluded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipa_adjustment_batches" (
    "id" TEXT NOT NULL,
    "ipa_id" TEXT NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "approved_by" TEXT,
    "posting_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipa_adjustment_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipa_adjustment_fields" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "before_value" TEXT NOT NULL,
    "after_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipa_adjustment_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_project_id_status_idx" ON "import_batches"("project_id", "status");

-- CreateIndex
CREATE INDEX "import_batches_import_type_status_idx" ON "import_batches"("import_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_project_id_import_type_source_file_hash_key" ON "import_batches"("project_id", "import_type", "source_file_hash");

-- CreateIndex
CREATE INDEX "import_rows_batch_id_status_idx" ON "import_rows"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "ipa_adjustment_batches_ipa_id_created_at_idx" ON "ipa_adjustment_batches"("ipa_id", "created_at");

-- CreateIndex
CREATE INDEX "ipa_adjustment_fields_batch_id_idx" ON "ipa_adjustment_fields"("batch_id");

-- CreateIndex
CREATE INDEX "budget_adjustments_budget_line_id_created_at_idx" ON "budget_adjustments"("budget_line_id", "created_at");

-- CreateIndex
CREATE INDEX "ipas_project_id_origin_idx" ON "ipas"("project_id", "origin");

-- CreateIndex
CREATE INDEX "ipas_project_id_period_from_period_to_idx" ON "ipas"("project_id", "period_from", "period_to");

-- CreateIndex
CREATE INDEX "posting_events_project_id_origin_event_type_idx" ON "posting_events"("project_id", "origin", "event_type");

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipa_adjustment_batches" ADD CONSTRAINT "ipa_adjustment_batches_ipa_id_fkey" FOREIGN KEY ("ipa_id") REFERENCES "ipas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipa_adjustment_batches" ADD CONSTRAINT "ipa_adjustment_batches_posting_event_id_fkey" FOREIGN KEY ("posting_event_id") REFERENCES "posting_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipa_adjustment_fields" ADD CONSTRAINT "ipa_adjustment_fields_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ipa_adjustment_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

