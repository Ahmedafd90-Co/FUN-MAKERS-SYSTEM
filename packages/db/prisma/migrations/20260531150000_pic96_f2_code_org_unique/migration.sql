-- PIC-96 (F2) Batch 2 — Entity.code + Project.code → per-tenant unique
--
-- The F1-audit carry-forward: `code` on Entity and Project was GLOBALLY unique,
-- which is a latent multi-tenant bug — tenant B's natural "FMKSA-OPS" /
-- "FMKSA-2026-001" would collide with tenant A's. Re-key to org-scoped
-- uniqueness so each tenant owns its own code namespace.
--
-- Depends on Batch 1 (20260531140000) having added org_id to entities/projects
-- — wait, NO: org_id on Entity/Project was added by F1 (PIC-95), not F2 Batch 1.
-- Entity/Project are backbone (F1), so org_id already exists here. This migration
-- only swaps the uniqueness constraint.
--
-- The CREATE UNIQUE INDEX is itself the data-violation gate: if any two rows
-- shared a code within the same org it would FAIL LOUDLY here. Today all rows
-- are singleton-org and code was globally unique, so (org_id, code) is
-- trivially unique — verified clean before apply. Reversible: drop the compound
-- index, restore the single-column unique.

-- DropIndex
DROP INDEX "entities_code_key";

-- DropIndex
DROP INDEX "projects_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "entities_org_id_code_key" ON "entities"("org_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_code_key" ON "projects"("org_id", "code");
