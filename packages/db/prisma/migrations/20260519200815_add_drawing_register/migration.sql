-- CreateEnum
CREATE TYPE "drawing_discipline" AS ENUM ('architectural', 'structural', 'mep', 'theming', 'ff_and_e', 'rockwork', 'ride_systems', 'show_control', 'scenic');

-- CreateEnum
CREATE TYPE "drawing_revision_status" AS ENUM ('for_information', 'for_approval', 'for_construction', 'superseded');

-- CreateTable
CREATE TABLE "drawings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "drawing_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" "drawing_discipline" NOT NULL,
    "originator_entity_id" TEXT,
    "current_revision_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revisions" (
    "id" TEXT NOT NULL,
    "drawing_id" TEXT NOT NULL,
    "revision_label" TEXT NOT NULL,
    "status" "drawing_revision_status" NOT NULL DEFAULT 'for_information',
    "what_changed" TEXT NOT NULL,
    "distribution_list" JSONB NOT NULL DEFAULT '[]',
    "issued_by" TEXT,
    "issued_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawing_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revision_acknowledgements" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_revision_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drawings_current_revision_id_key" ON "drawings"("current_revision_id");

-- CreateIndex
CREATE INDEX "drawings_project_id_discipline_idx" ON "drawings"("project_id", "discipline");

-- CreateIndex
CREATE INDEX "drawings_project_id_created_at_idx" ON "drawings"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "drawings_project_id_drawing_number_key" ON "drawings"("project_id", "drawing_number");

-- CreateIndex
CREATE INDEX "drawing_revisions_drawing_id_status_idx" ON "drawing_revisions"("drawing_id", "status");

-- CreateIndex
CREATE INDEX "drawing_revisions_drawing_id_created_at_idx" ON "drawing_revisions"("drawing_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_revisions_drawing_id_revision_label_key" ON "drawing_revisions"("drawing_id", "revision_label");

-- CreateIndex
CREATE INDEX "drawing_revision_acknowledgements_revision_id_idx" ON "drawing_revision_acknowledgements"("revision_id");

-- CreateIndex
CREATE INDEX "drawing_revision_acknowledgements_user_id_idx" ON "drawing_revision_acknowledgements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_revision_acknowledgements_revision_id_user_id_key" ON "drawing_revision_acknowledgements"("revision_id", "user_id");

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_originator_entity_id_fkey" FOREIGN KEY ("originator_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "drawing_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revisions" ADD CONSTRAINT "drawing_revisions_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revision_acknowledgements" ADD CONSTRAINT "drawing_revision_acknowledgements_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "drawing_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
