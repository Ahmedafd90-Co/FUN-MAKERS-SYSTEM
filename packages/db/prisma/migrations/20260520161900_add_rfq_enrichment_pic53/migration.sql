-- AlterTable
ALTER TABLE "rfq_vendors" ADD COLUMN     "responded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rfqs" ADD COLUMN     "awarded_quotation_id" TEXT;

-- AlterTable
ALTER TABLE "vendor_contracts" ADD COLUMN     "rfq_id" TEXT;

-- CreateTable
CREATE TABLE "quotation_evaluations" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "technical_score" DECIMAL(5,2) NOT NULL,
    "commercial_score" DECIMAL(5,2) NOT NULL,
    "generic_experience_score" DECIMAL(5,2) NOT NULL,
    "themed_entertainment_experience_score" DECIMAL(5,2) NOT NULL,
    "creative_aesthetic_capability_score" DECIMAL(5,2) NOT NULL,
    "composite_score" DECIMAL(7,4) NOT NULL,
    "evaluation_notes" TEXT,
    "evaluated_by" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_evaluations_quotation_id_key" ON "quotation_evaluations"("quotation_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_awarded_quotation_id_key" ON "rfqs"("awarded_quotation_id");

-- CreateIndex
CREATE INDEX "vendor_contracts_rfq_id_idx" ON "vendor_contracts"("rfq_id");

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_awarded_quotation_id_fkey" FOREIGN KEY ("awarded_quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_evaluations" ADD CONSTRAINT "quotation_evaluations_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
