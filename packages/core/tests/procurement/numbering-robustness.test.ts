/**
 * PIC-84 / F2 Batch 3 — sequence-number generation robustness + per-tenant scope.
 *
 * Two genuine-validation tests (catch 24) — each MUST go RED against main's code
 * before the fix, GREEN after:
 *
 *  1. Concurrency: ≥5-way concurrent createFrameworkAgreement. Main uses
 *     read-max(`findFirst max`)+retry-once, globally sequential — ≥3-way exhausts
 *     the single retry and surfaces a P2002 to the user (PIC-84). This asserts
 *     zero rejections + all-distinct numbers → RED on read-max, GREEN on the
 *     atomic per-org counter.
 *
 *  2. No cross-tenant collision: the SAME agreementNumber in two REAL orgs. Main's
 *     global `@unique` rejects the second insert (P2002) → RED. After the re-key
 *     to `@@unique([orgId, agreementNumber])` both persist → GREEN. A singleton-only
 *     collision test would be theater; this uses a genuine second Organization.
 *
 * Real-DB integration tests (routed to fmksa_test_core by setup-test-db).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { createFrameworkAgreement } from '../../src/procurement/framework-agreement/service';
import {
  ensureSecondOrg,
  createTenantContext,
  cleanupTenantContext,
  SINGLETON_ORG_ID,
  SECOND_ORG_ID,
  type TenantContext,
} from '../helpers/second-org';

const CONCURRENCY = 8; // ≥5-way per ruling; 8 makes the read-max race reliably bite

describe('PIC-84 numbering — concurrency robustness (≥5-way)', () => {
  const tag = `conc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let ctx: TenantContext;

  beforeAll(async () => {
    assertTestDb();
    ctx = await createTenantContext(SINGLETON_ORG_ID, tag);
  }, 60_000);

  afterAll(async () => {
    await cleanupTenantContext(ctx);
  });

  it(`${CONCURRENCY} concurrent createFrameworkAgreement all succeed with distinct numbers`, async () => {
    // Entity-scoped (no projectId) → no workflow autoSeed; this isolates numbering.
    const input = {
      entityId: ctx.entityId,
      vendorId: ctx.vendorId,
      title: `Concurrent FA ${tag}`,
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      currency: 'SAR',
      totalCommittedValue: 1000,
    };

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        createFrameworkAgreement(input as any, ctx.userId),
      ),
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    // RED on main: read-max+retry-once → ≥1 P2002 surfaced under ≥3-way contention.
    expect(rejected).toHaveLength(0);

    const numbers = results
      .filter(
        (r): r is PromiseFulfilledResult<{ agreementNumber: string }> =>
          r.status === 'fulfilled',
      )
      .map((r) => r.value.agreementNumber);
    expect(numbers).toHaveLength(CONCURRENCY);
    expect(new Set(numbers).size).toBe(CONCURRENCY); // no duplicate numbers
  }, 60_000);
});

describe('PIC-84 numbering — no cross-tenant collision (REAL second org)', () => {
  const tag = `xten-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let orgA: TenantContext;
  let orgB: TenantContext;
  const sharedNumber = `FA-XTEN-${tag}`;

  beforeAll(async () => {
    assertTestDb();
    await ensureSecondOrg();
    orgA = await createTenantContext(SINGLETON_ORG_ID, `${tag}-a`);
    orgB = await createTenantContext(SECOND_ORG_ID, `${tag}-b`);
  }, 60_000);

  afterAll(async () => {
    await cleanupTenantContext(orgA);
    await cleanupTenantContext(orgB);
  });

  it('the same agreementNumber can exist in two different orgs', async () => {
    // Direct creates exercise the CONSTRAINT (not the generator): explicit orgId.
    const base = {
      vendorId: orgA.vendorId,
      agreementNumber: sharedNumber,
      title: 'Cross-tenant FA',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      currency: 'SAR',
      status: 'draft' as const,
    };

    const a = await prisma.frameworkAgreement.create({
      data: {
        orgId: orgA.orgId,
        entityId: orgA.entityId,
        createdBy: orgA.userId,
        ...base,
      },
    });
    expect(a.agreementNumber).toBe(sharedNumber);

    // RED on main's global @unique: this second insert P2002s.
    // GREEN after @@unique([orgId, agreementNumber]): a different tenant may reuse it.
    const b = await prisma.frameworkAgreement.create({
      data: {
        orgId: orgB.orgId,
        entityId: orgB.entityId,
        vendorId: orgB.vendorId,
        createdBy: orgB.userId,
        agreementNumber: sharedNumber,
        title: 'Cross-tenant FA',
        validFrom: base.validFrom,
        validTo: base.validTo,
        currency: 'SAR',
        status: 'draft',
      },
    });
    expect(b.agreementNumber).toBe(sharedNumber);
    expect(b.orgId).toBe(SECOND_ORG_ID);
    expect(b.orgId).not.toBe(a.orgId);
  }, 60_000);
});
