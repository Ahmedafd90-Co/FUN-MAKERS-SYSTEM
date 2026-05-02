/*
  Migration: add_layer1_foundation
  Date:      2026-05-02 (logical 2026-05-01 per PIC-8; generated 2026-05-02)
  Module:    Layer 1 (ProjectLedger)
  PR:        feat/layer1-prime-contract-and-participants (PIC-8)

  Adds the foundational tables for ProjectLedger's multi-entity contract chain:
   - project_participants  : bridge between projects and entities, declaring participation roles
   - prime_contracts       : client-side prime contract, 1:1 with project
   - intercompany_contracts: directional contracts between two entities scoped to a project
   - entity_legal_details  : 1:1 sidecar to entities for taxId/registration/address/banking

  Also extends:
   - vendors:  is_internal_entity flag + internal_entity_id FK to entities
   - projects: prime_contract_id FK (nullable, unique) to prime_contracts

  Additive + nullable on existing tables; no backfill required, no data loss.
  Cascade only on entity_legal_details (1:1 sidecar). All other FKs are RESTRICT.

  R2 dual-relation pattern: projects.prime_contract_id is a denormalized cache
  pointer (FK via "ProjectPrimeContractRef" relation), while prime_contracts.project_id
  is the canonical 1:1 relation (FK via "ProjectPrimeContract" relation). Service
  layer (PR-A1 Stage 3) keeps both sides in sync within a transaction.

  Prerequisites: PR-0 (#26) restored Module 4 + procurement enum baseline, and
  PR-0b (#27) restored projects.contract_value/revised_contract_value plus
  budget_absorption_exceptions/invoice_collections. With those in place, the drift
  detector returns empty against schema.prisma, and this migration contains ONLY
  Layer 1 deltas — no bundled drift fixes.

  Prisma's pre-generation warning ("unique constraint on [prime_contract_id] will
  be added; existing duplicates would fail") is informational only — projects
  table did not previously have this column, so no duplicates can exist.
*/

-- CreateEnum
CREATE TYPE "ProjectParticipantRole" AS ENUM ('prime_contractor', 'sub_contractor', 'factory', 'design', 'management', 'other');

-- CreateEnum
CREATE TYPE "PrimeContractStatus" AS ENUM ('draft', 'signed', 'active', 'completed', 'terminated', 'cancelled');

-- CreateEnum
CREATE TYPE "IntercompanyPricingType" AS ENUM ('cost_plus_markup', 'management_fee', 'fixed_fee');

-- CreateEnum
CREATE TYPE "IntercompanyManagingDepartment" AS ENUM ('me_contract', 'asia_pac_contract');

-- CreateEnum
CREATE TYPE "IntercompanyContractStatus" AS ENUM ('draft', 'signed', 'active', 'closed', 'cancelled');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "prime_contract_id" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "internal_entity_id" TEXT,
ADD COLUMN     "is_internal_entity" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "project_participants" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "role" "ProjectParticipantRole" NOT NULL,
    "is_prime" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prime_contracts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "contracting_entity_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_reference" TEXT,
    "contract_value" DECIMAL(18,2) NOT NULL,
    "contract_currency" TEXT NOT NULL DEFAULT 'SAR',
    "signed_date" DATE,
    "effective_date" DATE,
    "expected_completion_date" DATE,
    "status" "PrimeContractStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prime_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intercompany_contracts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "from_entity_id" TEXT NOT NULL,
    "to_entity_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "pricing_type" "IntercompanyPricingType" NOT NULL,
    "markup_percent" DECIMAL(8,4) NOT NULL,
    "contract_value" DECIMAL(18,2),
    "contract_currency" TEXT NOT NULL DEFAULT 'SAR',
    "managing_department" "IntercompanyManagingDepartment" NOT NULL,
    "signed_date" DATE,
    "status" "IntercompanyContractStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intercompany_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_legal_details" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "tax_id" TEXT,
    "registration_number" TEXT,
    "jurisdiction" TEXT,
    "registered_address" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_iban" TEXT,
    "bank_swift" TEXT,
    "notes" TEXT,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_legal_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_participants_project_id_idx" ON "project_participants"("project_id");

-- CreateIndex
CREATE INDEX "project_participants_entity_id_idx" ON "project_participants"("entity_id");

-- CreateIndex
CREATE INDEX "project_participants_project_id_role_idx" ON "project_participants"("project_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "project_participants_project_id_entity_id_key" ON "project_participants"("project_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "prime_contracts_project_id_key" ON "prime_contracts"("project_id");

-- CreateIndex
CREATE INDEX "prime_contracts_contracting_entity_id_idx" ON "prime_contracts"("contracting_entity_id");

-- CreateIndex
CREATE INDEX "prime_contracts_status_idx" ON "prime_contracts"("status");

-- CreateIndex
CREATE INDEX "intercompany_contracts_project_id_idx" ON "intercompany_contracts"("project_id");

-- CreateIndex
CREATE INDEX "intercompany_contracts_from_entity_id_idx" ON "intercompany_contracts"("from_entity_id");

-- CreateIndex
CREATE INDEX "intercompany_contracts_to_entity_id_idx" ON "intercompany_contracts"("to_entity_id");

-- CreateIndex
CREATE INDEX "intercompany_contracts_project_id_managing_department_idx" ON "intercompany_contracts"("project_id", "managing_department");

-- CreateIndex
CREATE INDEX "intercompany_contracts_status_idx" ON "intercompany_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "entity_legal_details_entity_id_key" ON "entity_legal_details"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_prime_contract_id_key" ON "projects"("prime_contract_id");

-- CreateIndex
CREATE INDEX "vendors_internal_entity_id_idx" ON "vendors"("internal_entity_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_prime_contract_id_fkey" FOREIGN KEY ("prime_contract_id") REFERENCES "prime_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_internal_entity_id_fkey" FOREIGN KEY ("internal_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_contracting_entity_id_fkey" FOREIGN KEY ("contracting_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_contract_currency_fkey" FOREIGN KEY ("contract_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_from_entity_id_fkey" FOREIGN KEY ("from_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_to_entity_id_fkey" FOREIGN KEY ("to_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercompany_contracts" ADD CONSTRAINT "intercompany_contracts_contract_currency_fkey" FOREIGN KEY ("contract_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_legal_details" ADD CONSTRAINT "entity_legal_details_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_legal_details" ADD CONSTRAINT "entity_legal_details_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
