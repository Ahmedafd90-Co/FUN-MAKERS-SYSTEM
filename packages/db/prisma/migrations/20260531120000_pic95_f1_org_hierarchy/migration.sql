-- PIC-95 (F1) — Org hierarchy + User↔Org membership backbone
--
-- Turns the disconnected `Organization` singleton (PIC-75) into the real
-- tenant root by adding the structural backbone edges that make org
-- DERIVABLE from every backbone node:
--
--   Org → Entity → Project   (the ruled hierarchy: PIC-82 comment 6b679e86)
--   User → Org               (membership: "which org is this user in")
--
-- Each backbone model gains an `org_id` column defaulting to the singleton
-- ('picoplay-ksa', 00000000-0000-0000-0000-000000000001). The stored DEFAULT
-- backfills every existing row atomically (Postgres 14+ metadata-only ADD
-- COLUMN — no table rewrite), so existing code keeps working with the column
-- present-but-unset. orgId stays UNENFORCED at the app layer until F3.
--
-- The singleton UUID is byte-identical to:
--   - schema.prisma @default declarations (Entity/User/Project.orgId)
--   - packages/db/src/seed/organizations.ts:SINGLETON_ORG_ID
-- Changing the constant requires updating all locations in lockstep.
--
-- Project.orgId is DENORMALIZED (PIC-82 PA4 ruling) — it derives from
-- Entity.orgId but is stored directly so F3's org-scope chokepoints read it
-- without an Entity join. Seed/create paths set it from the parent entity.
--
-- NOT in F1 (deferred): Entity.code / Project.code remain GLOBALLY @unique;
-- they must become @@unique([orgId, code]) at F2 when per-tenant scoping is
-- applied systematically. No enum changes here — no PIC-93-class deploy risk.

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "org_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
