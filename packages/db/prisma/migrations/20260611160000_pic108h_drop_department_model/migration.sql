-- PIC-108-H: drop the dead `Department` model. It carried no orgId, no
-- @relation, no seed rows, and no caller (verified by full-tree grep across
-- schema / packages/core/src / apps/web / seed). Pure orphan removal — no FK
-- references to drop first.

DROP TABLE "departments";
