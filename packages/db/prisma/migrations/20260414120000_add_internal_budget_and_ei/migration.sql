/*
  Migration: add_internal_budget_and_ei
  Date:      2026-04-14 (logical timestamp; restoration committed May 1, 2026)
  Module:    4 — Internal Budget & Engineer Instruction
  PR:        fix(db): restore Module 4 in migration history (PR-0)

  Restores the baseline DDL for Module 4 (Internal Budget + Engineer Instruction) which
  was historically created via `prisma db push` or hand-applied SQL on the dev DB but
  never captured as a migration. Pre-existing tech debt surfaced during PR-A1 (PIC-8)
  shadow-DB validation.

  Creates the pre-20260415120000 baseline state:
   - budget_adjustment_type enum (4 original values; 2 added later by sheet_import_layer)
   - ei_status enum (6 values, stable)
   - budget_categories, project_budgets, budget_lines, budget_adjustments, engineer_instructions
   - 9 indexes, 6 FKs (the 1 missing index + 1 FK are added later by sheet_import_layer)

  After this migration, 20260415120000_add_sheet_import_layer applies cleanly because all
  pre-conditions exist. From a fresh DB, the full history now replays to the same end state
  as the current dev DB.

  Existing dev DBs already have these objects. Mark as applied without running:
    pnpm prisma migrate resolve --applied 20260414120000_add_internal_budget_and_ei

  Fresh DBs (CI, new dev setup) apply normally via prisma migrate dev.

  Zero data drift confirmed between dev DB and Prisma schema for all 5 tables and 2 enums
  during PR-0 recon (May 1, 2026). This migration captures truth, not approximation.
*/

-- CreateEnum
CREATE TYPE "budget_adjustment_type" AS ENUM ('baseline_change', 'contingency_change', 'ei_reserve_change', 'reallocation');

-- CreateEnum
CREATE TYPE "ei_status" AS ENUM ('received', 'under_evaluation', 'approved_reserve', 'converted', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_budgets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "internal_baseline" DECIMAL(18,2) NOT NULL,
    "internal_revised" DECIMAL(18,2) NOT NULL,
    "contingency_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ei_reserve_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "budget_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "committed_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actual_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_adjustments" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "adjustment_type" "budget_adjustment_type" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineer_instructions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reference_number" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_value" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "ei_status" NOT NULL DEFAULT 'received',
    "reserve_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.50,
    "reserve_amount" DECIMAL(18,2) NOT NULL,
    "variation_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineer_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_code_key" ON "budget_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "project_budgets_project_id_key" ON "project_budgets"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budget_id_category_id_key" ON "budget_lines"("budget_id", "category_id");

-- CreateIndex
CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines"("budget_id");

-- CreateIndex
CREATE INDEX "budget_adjustments_budget_id_created_at_idx" ON "budget_adjustments"("budget_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "engineer_instructions_reference_number_key" ON "engineer_instructions"("reference_number");

-- CreateIndex
CREATE INDEX "engineer_instructions_project_id_status_idx" ON "engineer_instructions"("project_id", "status");

-- CreateIndex
CREATE INDEX "engineer_instructions_project_id_created_at_idx" ON "engineer_instructions"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "engineer_instructions_variation_id_idx" ON "engineer_instructions"("variation_id");

-- AddForeignKey
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "project_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "project_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_instructions" ADD CONSTRAINT "engineer_instructions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineer_instructions" ADD CONSTRAINT "engineer_instructions_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
