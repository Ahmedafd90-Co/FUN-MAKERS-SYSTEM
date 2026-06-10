/**
 * PIC-108-G-final (Phase MT) — THE FAIL-LOUD PROOF for the @default drop.
 *
 * After this PR, the 32 drop-eligible tenant tables have NO org_id default:
 * an INSERT omitting org_id must fail loud (PG 23502 NOT-NULL) instead of
 * silently attributing the row to the singleton org. AuditLog keeps its
 * default BY DESIGN (the A′ carry-forward — ~194 chokepoint callers +
 * apps/web notifications.ts still rely on the fallback), so the same
 * omission on audit_logs must still succeed with the singleton.
 *
 * Raw SQL on BOTH halves because the regenerated typed client can no longer
 * express the omission on the dropped tables (orgId is now a required create
 * field) — that's the compile-time half of the proof; this file is the
 * runtime half.
 *
 * DB-backed → runs in the CI @fmksa/core Test job (CI pushes the new schema
 * before testing, so the dropped default is live there; locally, db push
 * the schema to fmksa_test first).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';

const TAG = `p108gf-${Date.now()}`;
let entityId: string;
const auditRowId = randomUUID();

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      code: `ENT-${TAG}`,
      name: `Entity ${TAG}`,
      type: 'parent',
      status: 'active',
    },
  });
  entityId = entity.id;
});

afterAll(async () => {
  // audit_logs is append-only (no-delete-on-immutable) → raw SQL teardown.
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1`, auditRowId);
  // The dropped-table INSERT fails by design, so no procurement_categories row exists.
  await prisma.entity.delete({ where: { id: entityId } });
});

describe('PIC-108-G-final — the @default drop fails loud where dropped, holds where kept', () => {
  it('dropped table (procurement_categories): INSERT omitting org_id → PG 23502 NOT-NULL', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO procurement_categories (id, entity_id, name, code, level, updated_at)
         VALUES ($1, $2, $3, $4, 'category', now())`,
        randomUUID(),
        entityId,
        `Cat ${TAG}`,
        `CAT-${TAG}`,
      ),
    ).rejects.toThrow(/23502|null value in column "org_id"|not-null/i);
  });

  it('AuditLog control (audit_logs): INSERT omitting org_id → succeeds with the singleton default', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO audit_logs (id, actor_source, action, resource_type, resource_id, before_json, after_json)
       VALUES ($1, 'system', 'pic108g.fail-loud-control', 'test', $2, '{}', '{}')`,
      auditRowId,
      TAG,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ org_id: string }>>(
      `SELECT org_id FROM audit_logs WHERE id = $1`,
      auditRowId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.org_id).toBe(SINGLETON_ORG_ID);
  });
});
