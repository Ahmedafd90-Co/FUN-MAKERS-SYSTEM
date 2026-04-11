-- CreateEnum
CREATE TYPE "expense_subtype" AS ENUM ('ticket', 'accommodation', 'transportation', 'equipment', 'general');

-- CreateEnum
CREATE TYPE "credit_note_subtype" AS ENUM ('credit_note', 'rebate', 'recovery');

-- CreateEnum
CREATE TYPE "vendor_contract_type" AS ENUM ('service', 'supply', 'subcontract', 'consulting');

-- CreateEnum
CREATE TYPE "procurement_category_level" AS ENUM ('category', 'subcategory', 'spend_type');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('flight', 'event', 'other');

-- CreateEnum
CREATE TYPE "transport_rate_type" AS ENUM ('per_trip', 'per_day', 'per_km');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade_name" TEXT,
    "registration_number" TEXT,
    "tax_id" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "classification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_vendors" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "approved_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_categories" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" "procurement_category_level" NOT NULL,
    "parent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_catalogs" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "item_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contracts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "contract_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contract_type" "vendor_contract_type" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_value" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" TEXT,
    "signed_date" TIMESTAMP(3),
    "parent_contract_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_agreements" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "project_id" TEXT,
    "entity_id" TEXT NOT NULL,
    "agreement_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "total_committed_value" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "framework_agreement_items" (
    "id" TEXT NOT NULL,
    "framework_agreement_id" TEXT NOT NULL,
    "item_catalog_id" TEXT,
    "item_description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "agreed_rate" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "min_quantity" DECIMAL(18,2),
    "max_quantity" DECIMAL(18,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "framework_agreement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "rfq_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "required_by_date" TIMESTAMP(3),
    "category_id" TEXT,
    "currency" TEXT NOT NULL,
    "estimated_budget" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_items" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "item_catalog_id" TEXT,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "estimated_unit_price" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_vendors" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "response_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfq_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "rfq_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "quotation_ref" TEXT,
    "received_date" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "total_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "delivery_terms" TEXT,
    "payment_terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_line_items" (
    "id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "item_catalog_id" TEXT,
    "rfq_item_id" TEXT,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "total_price" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "validity_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "rfq_id" TEXT,
    "quotation_id" TEXT,
    "vendor_contract_id" TEXT,
    "framework_agreement_id" TEXT,
    "category_id" TEXT,
    "po_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "delivery_date" TIMESTAMP(3),
    "delivery_address" TEXT,
    "payment_terms" TEXT,
    "has_framework_deviation" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference_number" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "item_catalog_id" TEXT,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "total_price" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "vat_rate" DECIMAL(5,4) NOT NULL,
    "vat_amount" DECIMAL(18,2) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "category_id" TEXT,
    "no_po_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subtype" "expense_subtype" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "category_id" TEXT,
    "receipt_reference" TEXT,
    "purchase_order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "ticket_type" "ticket_type",
    "traveler_name" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "travel_date" TIMESTAMP(3),
    "return_date" TIMESTAMP(3),
    "guest_name" TEXT,
    "check_in" TIMESTAMP(3),
    "check_out" TIMESTAMP(3),
    "hotel_name" TEXT,
    "expense_city" TEXT,
    "nightly_rate" DECIMAL(18,2),
    "nights" INTEGER,
    "vehicle_type" TEXT,
    "transport_origin" TEXT,
    "transport_destination" TEXT,
    "distance" DECIMAL(10,2),
    "rate_type" "transport_rate_type",
    "equipment_name" TEXT,
    "equipment_type" TEXT,
    "rental_period_from" TIMESTAMP(3),
    "rental_period_to" TIMESTAMP(3),
    "daily_rate" DECIMAL(18,2),
    "days" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "subtype" "credit_note_subtype" NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "supplier_invoice_id" TEXT,
    "purchase_order_id" TEXT,
    "correspondence_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_entity_id_status_idx" ON "vendors"("entity_id", "status");

-- CreateIndex
CREATE INDEX "vendors_entity_id_name_idx" ON "vendors"("entity_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_entity_id_vendor_code_key" ON "vendors"("entity_id", "vendor_code");

-- CreateIndex
CREATE INDEX "project_vendors_vendor_id_idx" ON "project_vendors"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_vendors_project_id_vendor_id_key" ON "project_vendors"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "procurement_categories_entity_id_level_idx" ON "procurement_categories"("entity_id", "level");

-- CreateIndex
CREATE INDEX "procurement_categories_parent_id_idx" ON "procurement_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_categories_entity_id_code_key" ON "procurement_categories"("entity_id", "code");

-- CreateIndex
CREATE INDEX "item_catalogs_entity_id_status_idx" ON "item_catalogs"("entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "item_catalogs_entity_id_item_code_key" ON "item_catalogs"("entity_id", "item_code");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contracts_contract_number_key" ON "vendor_contracts"("contract_number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contracts_reference_number_key" ON "vendor_contracts"("reference_number");

-- CreateIndex
CREATE INDEX "vendor_contracts_project_id_status_idx" ON "vendor_contracts"("project_id", "status");

-- CreateIndex
CREATE INDEX "vendor_contracts_project_id_vendor_id_idx" ON "vendor_contracts"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "vendor_contracts_project_id_created_at_idx" ON "vendor_contracts"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "vendor_contracts_parent_contract_id_idx" ON "vendor_contracts"("parent_contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "framework_agreements_agreement_number_key" ON "framework_agreements"("agreement_number");

-- CreateIndex
CREATE INDEX "framework_agreements_entity_id_status_idx" ON "framework_agreements"("entity_id", "status");

-- CreateIndex
CREATE INDEX "framework_agreements_project_id_status_idx" ON "framework_agreements"("project_id", "status");

-- CreateIndex
CREATE INDEX "framework_agreements_vendor_id_idx" ON "framework_agreements"("vendor_id");

-- CreateIndex
CREATE INDEX "framework_agreement_items_framework_agreement_id_idx" ON "framework_agreement_items"("framework_agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_rfq_number_key" ON "rfqs"("rfq_number");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_reference_number_key" ON "rfqs"("reference_number");

-- CreateIndex
CREATE INDEX "rfqs_project_id_status_idx" ON "rfqs"("project_id", "status");

-- CreateIndex
CREATE INDEX "rfqs_project_id_created_at_idx" ON "rfqs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "rfq_items_rfq_id_idx" ON "rfq_items"("rfq_id");

-- CreateIndex
CREATE INDEX "rfq_vendors_vendor_id_idx" ON "rfq_vendors"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_vendors_rfq_id_vendor_id_key" ON "rfq_vendors"("rfq_id", "vendor_id");

-- CreateIndex
CREATE INDEX "quotations_rfq_id_vendor_id_idx" ON "quotations"("rfq_id", "vendor_id");

-- CreateIndex
CREATE INDEX "quotations_rfq_id_status_idx" ON "quotations"("rfq_id", "status");

-- CreateIndex
CREATE INDEX "quotation_line_items_quotation_id_idx" ON "quotation_line_items"("quotation_id");

-- CreateIndex
CREATE INDEX "quotation_line_items_item_catalog_id_idx" ON "quotation_line_items"("item_catalog_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_reference_number_key" ON "purchase_orders"("reference_number");

-- CreateIndex
CREATE INDEX "purchase_orders_project_id_status_idx" ON "purchase_orders"("project_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_project_id_vendor_id_idx" ON "purchase_orders"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "purchase_orders_project_id_created_at_idx" ON "purchase_orders"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_project_id_status_idx" ON "supplier_invoices"("project_id", "status");

-- CreateIndex
CREATE INDEX "supplier_invoices_project_id_vendor_id_idx" ON "supplier_invoices"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_project_id_created_at_idx" ON "supplier_invoices"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_invoices_purchase_order_id_idx" ON "supplier_invoices"("purchase_order_id");

-- CreateIndex
CREATE INDEX "expenses_project_id_subtype_status_idx" ON "expenses"("project_id", "subtype", "status");

-- CreateIndex
CREATE INDEX "expenses_project_id_created_at_idx" ON "expenses"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");

-- CreateIndex
CREATE INDEX "credit_notes_project_id_status_idx" ON "credit_notes"("project_id", "status");

-- CreateIndex
CREATE INDEX "credit_notes_project_id_vendor_id_idx" ON "credit_notes"("project_id", "vendor_id");

-- CreateIndex
CREATE INDEX "credit_notes_project_id_created_at_idx" ON "credit_notes"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_notes_supplier_invoice_id_idx" ON "credit_notes"("supplier_invoice_id");

-- CreateIndex
CREATE INDEX "credit_notes_purchase_order_id_idx" ON "credit_notes"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_vendors" ADD CONSTRAINT "project_vendors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_vendors" ADD CONSTRAINT "project_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_categories" ADD CONSTRAINT "procurement_categories_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_categories" ADD CONSTRAINT "procurement_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "procurement_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_catalogs" ADD CONSTRAINT "item_catalogs_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "vendor_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_agreements" ADD CONSTRAINT "framework_agreements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_agreements" ADD CONSTRAINT "framework_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_agreements" ADD CONSTRAINT "framework_agreements_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "framework_agreement_items" ADD CONSTRAINT "framework_agreement_items_framework_agreement_id_fkey" FOREIGN KEY ("framework_agreement_id") REFERENCES "framework_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_items" ADD CONSTRAINT "rfq_items_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_vendors" ADD CONSTRAINT "rfq_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_correspondence_id_fkey" FOREIGN KEY ("correspondence_id") REFERENCES "correspondences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
