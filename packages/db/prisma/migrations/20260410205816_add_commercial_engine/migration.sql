-- CreateEnum
CREATE TYPE "variation_subtype" AS ENUM ('vo', 'change_order');

-- CreateEnum
CREATE TYPE "correspondence_subtype" AS ENUM ('letter', 'notice', 'claim', 'back_charge');

-- CreateEnum
CREATE TYPE "variation_initiated_by" AS ENUM ('contractor', 'client');

-- CreateEnum
CREATE TYPE "notice_type" AS ENUM ('delay', 'claim_notice', 'extension_of_time', 'dispute', 'force_majeure', 'general');

-- CreateEnum
CREATE TYPE "claim_type" AS ENUM ('time_extension', 'additional_cost', 'time_and_cost');

-- CreateEnum
CREATE TYPE "back_charge_category" AS ENUM ('defect', 'delay', 'non_compliance', 'damage', 'other');

-- CreateEnum
CREATE TYPE "letter_type" AS ENUM ('instruction', 'response', 'transmittal', 'general');

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "subject" DROP DEFAULT,
ALTER COLUMN "body" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ipas" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "period_number" INTEGER NOT NULL,
    "period_from" TIMESTAMP(3) NOT NULL,
    "period_to" TIMESTAMP(3) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "retention_rate" DECIMAL(5,4) NOT NULL,
    "retention_amount" DECIMAL(18,2) NOT NULL,
    "previous_certified" DECIMAL(18,2) NOT NULL,
    "current_claim" DECIMAL(18,2) NOT NULL,
    "advance_recovery" DECIMAL(18,2),
    "other_deductions" DECIMAL(18,2),
    "net_claimed" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipcs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "ipa_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "certified_amount" DECIMAL(18,2) NOT NULL,
    "retention_amount" DECIMAL(18,2) NOT NULL,
    "adjustments" DECIMAL(18,2),
    "net_certified" DECIMAL(18,2) NOT NULL,
    "certification_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "remarks" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subtype" "variation_subtype" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "cost_impact" DECIMAL(18,2),
    "time_impact_days" INTEGER,
    "currency" TEXT NOT NULL,
    "assessed_cost_impact" DECIMAL(18,2),
    "assessed_time_impact_days" INTEGER,
    "approved_cost_impact" DECIMAL(18,2),
    "approved_time_impact_days" INTEGER,
    "initiated_by" "variation_initiated_by",
    "contract_clause" TEXT,
    "parent_variation_id" TEXT,
    "original_contract_value" DECIMAL(18,2),
    "adjustment_amount" DECIMAL(18,2),
    "new_contract_value" DECIMAL(18,2),
    "time_adjustment_days" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_proposals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "variation_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "revision_number" INTEGER NOT NULL,
    "estimated_cost" DECIMAL(18,2) NOT NULL,
    "estimated_time_days" INTEGER,
    "methodology" TEXT,
    "cost_breakdown" TEXT,
    "currency" TEXT NOT NULL,
    "assessed_cost" DECIMAL(18,2),
    "assessed_time_days" INTEGER,
    "approved_cost" DECIMAL(18,2),
    "approved_time_days" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_invoices" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "ipc_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "vat_rate" DECIMAL(5,4) NOT NULL,
    "vat_amount" DECIMAL(18,2) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_tax_id" TEXT,
    "seller_tax_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correspondences" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subtype" "correspondence_subtype" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_org" TEXT,
    "currency" TEXT,
    "parent_correspondence_id" TEXT,
    "notice_type" "notice_type",
    "contract_clause" TEXT,
    "response_deadline" TIMESTAMP(3),
    "claim_type" "claim_type",
    "claimed_amount" DECIMAL(18,2),
    "claimed_time_days" INTEGER,
    "settled_amount" DECIMAL(18,2),
    "settled_time_days" INTEGER,
    "target_name" TEXT,
    "category" "back_charge_category",
    "charged_amount" DECIMAL(18,2),
    "evidence_description" TEXT,
    "letter_type" "letter_type",
    "in_reply_to_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correspondences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ipas_reference_number_key" ON "ipas"("reference_number");

-- CreateIndex
CREATE INDEX "ipas_project_id_status_idx" ON "ipas"("project_id", "status");

-- CreateIndex
CREATE INDEX "ipas_project_id_created_at_idx" ON "ipas"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ipas_project_id_period_number_key" ON "ipas"("project_id", "period_number");

-- CreateIndex
CREATE UNIQUE INDEX "ipcs_reference_number_key" ON "ipcs"("reference_number");

-- CreateIndex
CREATE INDEX "ipcs_project_id_status_idx" ON "ipcs"("project_id", "status");

-- CreateIndex
CREATE INDEX "ipcs_project_id_created_at_idx" ON "ipcs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ipcs_ipa_id_idx" ON "ipcs"("ipa_id");

-- CreateIndex
CREATE UNIQUE INDEX "variations_reference_number_key" ON "variations"("reference_number");

-- CreateIndex
CREATE INDEX "variations_project_id_subtype_status_idx" ON "variations"("project_id", "subtype", "status");

-- CreateIndex
CREATE INDEX "variations_project_id_status_idx" ON "variations"("project_id", "status");

-- CreateIndex
CREATE INDEX "variations_project_id_created_at_idx" ON "variations"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cost_proposals_reference_number_key" ON "cost_proposals"("reference_number");

-- CreateIndex
CREATE INDEX "cost_proposals_project_id_status_idx" ON "cost_proposals"("project_id", "status");

-- CreateIndex
CREATE INDEX "cost_proposals_project_id_created_at_idx" ON "cost_proposals"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "cost_proposals_variation_id_idx" ON "cost_proposals"("variation_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_reference_number_key" ON "tax_invoices"("reference_number");

-- CreateIndex
CREATE INDEX "tax_invoices_project_id_status_idx" ON "tax_invoices"("project_id", "status");

-- CreateIndex
CREATE INDEX "tax_invoices_project_id_created_at_idx" ON "tax_invoices"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "tax_invoices_ipc_id_idx" ON "tax_invoices"("ipc_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_project_id_invoice_number_key" ON "tax_invoices"("project_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "correspondences_reference_number_key" ON "correspondences"("reference_number");

-- CreateIndex
CREATE INDEX "correspondences_project_id_subtype_status_idx" ON "correspondences"("project_id", "subtype", "status");

-- CreateIndex
CREATE INDEX "correspondences_project_id_status_idx" ON "correspondences"("project_id", "status");

-- CreateIndex
CREATE INDEX "correspondences_project_id_created_at_idx" ON "correspondences"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "correspondences_parent_correspondence_id_idx" ON "correspondences"("parent_correspondence_id");

-- CreateIndex
CREATE INDEX "correspondences_in_reply_to_id_idx" ON "correspondences"("in_reply_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_counters_project_id_type_code_key" ON "reference_counters"("project_id", "type_code");

-- AddForeignKey
ALTER TABLE "ipas" ADD CONSTRAINT "ipas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipcs" ADD CONSTRAINT "ipcs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipcs" ADD CONSTRAINT "ipcs_ipa_id_fkey" FOREIGN KEY ("ipa_id") REFERENCES "ipas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variations" ADD CONSTRAINT "variations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variations" ADD CONSTRAINT "variations_parent_variation_id_fkey" FOREIGN KEY ("parent_variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_proposals" ADD CONSTRAINT "cost_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_proposals" ADD CONSTRAINT "cost_proposals_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_ipc_id_fkey" FOREIGN KEY ("ipc_id") REFERENCES "ipcs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_parent_correspondence_id_fkey" FOREIGN KEY ("parent_correspondence_id") REFERENCES "correspondences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correspondences" ADD CONSTRAINT "correspondences_in_reply_to_id_fkey" FOREIGN KEY ("in_reply_to_id") REFERENCES "correspondences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_counters" ADD CONSTRAINT "reference_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
