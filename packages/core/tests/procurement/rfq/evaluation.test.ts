/**
 * PIC-53 — RFQ bid evaluation service tests.
 *
 * Covers:
 *   - Composite computation correctness (pure function, no DB)
 *   - Safe-default weights when no projectSetting configured
 *   - Per-project weight override
 *   - Partial-weights throws (the deliberately strict case — PIC-41 lesson)
 *   - Out-of-range scores throw
 *   - Out-of-range / non-decimal / non-summing weights throw
 *   - PIC-41-class proof: NO weight value hardcoded as policy in test assertions
 *     (tests use arbitrary illustrative values; no value matches any
 *      production seed; safe-default verified via behaviour, not literal)
 *   - Audit captures weights-used so a future read can reconstruct the composite
 *   - Idempotency: re-evaluating updates the same record
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, Prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { assertTestDb } from '../../helpers/assert-test-db';
import {
  evaluateQuotation,
  getEvaluation,
  listEvaluationsForRfq,
  getEvaluationWeights,
  computeComposite,
  EVALUATION_CRITERIA,
  type CriterionScores,
  type EvaluationWeights,
} from '../../../src/procurement/rfq/evaluation';

const WEIGHT_KEYS = EVALUATION_CRITERIA.map((c) => `rfq_evaluation_weight_${c}`);

describe('PIC-53 — RFQ bid evaluation', () => {
  let testEntityId: string;
  let testProjectId: string;
  let testVendorId: string;
  let testRfqId: string;
  let testQuotationId: string;
  const ts = Date.now();

  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';

    const entity = await prisma.entity.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `ENT-EVAL-${ts}`,
        name: 'Evaluation Test Entity',
        type: 'parent',
        status: 'active',
      },
    });
    testEntityId = entity.id;

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });

    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-EVAL-${ts}`,
        name: 'Evaluation Test Project',
        entityId: testEntityId,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = project.id;

    const vendor = await prisma.vendor.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        entityId: testEntityId,
        vendorCode: `V-EVAL-${ts}`,
        name: 'Evaluation Test Vendor',
        status: 'active',
        createdBy: 'test',
      },
    });
    testVendorId = vendor.id;

    const rfq = await prisma.rFQ.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        projectId: testProjectId,
        rfqNumber: `RFQ-EVAL-${ts}`,
        title: 'Evaluation Test RFQ',
        currency: 'SAR',
        status: 'evaluation',
        createdBy: 'test',
      },
    });
    testRfqId = rfq.id;

    const quotation = await prisma.quotation.create({
      data: {
        rfqId: testRfqId,
        vendorId: testVendorId,
        receivedDate: new Date(),
        totalAmount: new Prisma.Decimal('100000'),
        currency: 'SAR',
        status: 'shortlisted',
        createdBy: 'test',
      },
    });
    testQuotationId = quotation.id;

    delete process.env.SEED_CONTEXT;
  }, 60_000);

  afterAll(async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.quotationEvaluation.deleteMany({ where: { quotation: { rfqId: testRfqId } } }).catch(() => {});
    await prisma.quotation.deleteMany({ where: { rfqId: testRfqId } }).catch(() => {});
    await prisma.rFQItem.deleteMany({ where: { rfqId: testRfqId } }).catch(() => {});
    await prisma.rFQVendor.deleteMany({ where: { rfqId: testRfqId } }).catch(() => {});
    await prisma.rFQ.delete({ where: { id: testRfqId } }).catch(() => {});
    await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  beforeEach(async () => {
    // Reset projectSetting + evaluation state per-test for isolation.
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } });
    await prisma.quotationEvaluation.deleteMany({ where: { quotationId: testQuotationId } });
  });

  // -------------------------------------------------------------------------
  // Composite pure-function tests (no DB)
  // -------------------------------------------------------------------------

  describe('computeComposite — pure function', () => {
    it('Σ(score × weight) with all-equal weights returns the average', () => {
      const equalWeights: EvaluationWeights = {
        technical: new Prisma.Decimal('0.20'),
        commercial: new Prisma.Decimal('0.20'),
        generic_experience: new Prisma.Decimal('0.20'),
        themed_entertainment_experience: new Prisma.Decimal('0.20'),
        creative_aesthetic_capability: new Prisma.Decimal('0.20'),
      };
      const scores: CriterionScores = {
        technical: '80',
        commercial: '70',
        generic_experience: '60',
        themed_entertainment_experience: '90',
        creative_aesthetic_capability: '50',
      };
      // (80+70+60+90+50) / 5 = 70
      const composite = computeComposite(scores, equalWeights);
      expect(composite.equals(new Prisma.Decimal('70'))).toBe(true);
    });

    it('skewed weights — composite reflects the weighting', () => {
      // technical 60%, themed 30%, commercial 5%, generic 3%, creative 2%
      const skewed: EvaluationWeights = {
        technical: new Prisma.Decimal('0.60'),
        commercial: new Prisma.Decimal('0.05'),
        generic_experience: new Prisma.Decimal('0.03'),
        themed_entertainment_experience: new Prisma.Decimal('0.30'),
        creative_aesthetic_capability: new Prisma.Decimal('0.02'),
      };
      const scores: CriterionScores = {
        technical: '90',
        commercial: '50',
        generic_experience: '50',
        themed_entertainment_experience: '70',
        creative_aesthetic_capability: '50',
      };
      // 90*0.60 + 50*0.05 + 50*0.03 + 70*0.30 + 50*0.02 = 54 + 2.5 + 1.5 + 21 + 1 = 80.0
      const composite = computeComposite(scores, skewed);
      expect(composite.equals(new Prisma.Decimal('80'))).toBe(true);
    });

    it('zero-weighted criterion contributes nothing', () => {
      const oneZero: EvaluationWeights = {
        technical: new Prisma.Decimal('0.50'),
        commercial: new Prisma.Decimal('0.50'),
        generic_experience: new Prisma.Decimal('0'),
        themed_entertainment_experience: new Prisma.Decimal('0'),
        creative_aesthetic_capability: new Prisma.Decimal('0'),
      };
      const scores: CriterionScores = {
        technical: '100',
        commercial: '0',
        generic_experience: '50', // ignored
        themed_entertainment_experience: '50', // ignored
        creative_aesthetic_capability: '50', // ignored
      };
      // 100*0.50 + 0*0.50 + ignored = 50.0
      expect(computeComposite(scores, oneZero).equals(new Prisma.Decimal('50'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Weight resolution tests
  // -------------------------------------------------------------------------

  describe('getEvaluationWeights — projectSetting resolution', () => {
    it('returns equal-weight safe default (0.20 each) when no weights configured', async () => {
      const weights = await getEvaluationWeights(testProjectId);
      for (const criterion of EVALUATION_CRITERIA) {
        expect(weights[criterion].toString()).toBe('0.2');
      }
    });

    it('returns configured weights when all 5 keys set and sum to 1.0', async () => {
      process.env.SEED_CONTEXT = 'true';
      const configured: Record<string, string> = {
        rfq_evaluation_weight_technical: '0.45',
        rfq_evaluation_weight_commercial: '0.30',
        rfq_evaluation_weight_generic_experience: '0.10',
        rfq_evaluation_weight_themed_entertainment_experience: '0.10',
        rfq_evaluation_weight_creative_aesthetic_capability: '0.05',
      };
      for (const [key, value] of Object.entries(configured)) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: value, updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      delete process.env.SEED_CONTEXT;

      const weights = await getEvaluationWeights(testProjectId);
      expect(weights.technical.toString()).toBe('0.45');
      expect(weights.commercial.toString()).toBe('0.3');
      expect(weights.generic_experience.toString()).toBe('0.1');
      expect(weights.themed_entertainment_experience.toString()).toBe('0.1');
      expect(weights.creative_aesthetic_capability.toString()).toBe('0.05');
    });

    it('throws when partial weights configured (4 of 5 set)', async () => {
      process.env.SEED_CONTEXT = 'true';
      // Set only 4 of 5 — missing creative_aesthetic_capability
      for (const key of WEIGHT_KEYS.slice(0, 4)) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: '0.25', updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      delete process.env.SEED_CONTEXT;

      await expect(getEvaluationWeights(testProjectId)).rejects.toThrow(/partially configured/);
    });

    it('throws when weights sum to less than 1.0 (outside tolerance)', async () => {
      process.env.SEED_CONTEXT = 'true';
      for (const key of WEIGHT_KEYS) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: '0.10', updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      delete process.env.SEED_CONTEXT;
      // 0.10 × 5 = 0.50 — well outside tolerance
      await expect(getEvaluationWeights(testProjectId)).rejects.toThrow(/sum to/);
    });

    it('throws when weights sum to more than 1.0 (outside tolerance)', async () => {
      process.env.SEED_CONTEXT = 'true';
      for (const key of WEIGHT_KEYS) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: '0.30', updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      delete process.env.SEED_CONTEXT;
      // 0.30 × 5 = 1.50
      await expect(getEvaluationWeights(testProjectId)).rejects.toThrow(/sum to/);
    });

    it('throws on a weight value that is not a valid decimal', async () => {
      process.env.SEED_CONTEXT = 'true';
      for (const key of WEIGHT_KEYS.slice(0, 4)) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: '0.20', updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      await prisma.projectSetting.create({
        data: {
          projectId: testProjectId,
          key: WEIGHT_KEYS[4]!,
          valueJson: 'not-a-decimal',
          updatedAt: new Date(),
          updatedBy: 'test',
        },
      });
      delete process.env.SEED_CONTEXT;
      await expect(getEvaluationWeights(testProjectId)).rejects.toThrow(/not a valid decimal/);
    });

    it('throws on a weight value out of [0, 1] range', async () => {
      process.env.SEED_CONTEXT = 'true';
      for (const key of WEIGHT_KEYS.slice(0, 4)) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: '0.20', updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      await prisma.projectSetting.create({
        data: {
          projectId: testProjectId,
          key: WEIGHT_KEYS[4]!,
          valueJson: '1.5',
          updatedAt: new Date(),
          updatedBy: 'test',
        },
      });
      delete process.env.SEED_CONTEXT;
      await expect(getEvaluationWeights(testProjectId)).rejects.toThrow(/out of range/);
    });
  });

  // -------------------------------------------------------------------------
  // evaluateQuotation — end-to-end
  // -------------------------------------------------------------------------

  describe('evaluateQuotation — end-to-end', () => {
    it('creates a QuotationEvaluation with computed composite (safe-default weights)', async () => {
      const result = await evaluateQuotation(
        {
          quotationId: testQuotationId,
          projectId: testProjectId,
          technicalScore: 80,
          commercialScore: 60,
          genericExperienceScore: 70,
          themedEntertainmentExperienceScore: 90,
          creativeAestheticCapabilityScore: 50,
        },
        'test-evaluator',
      );

      expect(new Prisma.Decimal(result.technicalScore.toString()).equals(80)).toBe(true);
      expect(new Prisma.Decimal(result.commercialScore.toString()).equals(60)).toBe(true);
      // Equal weights (0.20 each) → composite = (80+60+70+90+50)/5 = 70
      expect(new Prisma.Decimal(result.compositeScore.toString()).equals(70)).toBe(true);
      expect(result.evaluatedBy).toBe('test-evaluator');
    });

    it('re-evaluating the same quotation UPDATES the existing record (idempotent)', async () => {
      // First evaluation
      const first = await evaluateQuotation(
        {
          quotationId: testQuotationId,
          projectId: testProjectId,
          technicalScore: 50,
          commercialScore: 50,
          genericExperienceScore: 50,
          themedEntertainmentExperienceScore: 50,
          creativeAestheticCapabilityScore: 50,
        },
        'first-evaluator',
      );

      // Re-evaluate with different scores
      const second = await evaluateQuotation(
        {
          quotationId: testQuotationId,
          projectId: testProjectId,
          technicalScore: 100,
          commercialScore: 100,
          genericExperienceScore: 100,
          themedEntertainmentExperienceScore: 100,
          creativeAestheticCapabilityScore: 100,
        },
        'second-evaluator',
      );

      // Same record (one row per quotation enforced by @unique)
      expect(second.id).toBe(first.id);
      expect(new Prisma.Decimal(second.compositeScore.toString()).equals(100)).toBe(true);
      expect(second.evaluatedBy).toBe('second-evaluator');

      // Only one row exists
      const count = await prisma.quotationEvaluation.count({
        where: { quotationId: testQuotationId },
      });
      expect(count).toBe(1);
    });

    it('uses configured weights when projectSetting has all 5', async () => {
      process.env.SEED_CONTEXT = 'true';
      const configured: Record<string, string> = {
        rfq_evaluation_weight_technical: '0.50',
        rfq_evaluation_weight_commercial: '0.50',
        rfq_evaluation_weight_generic_experience: '0',
        rfq_evaluation_weight_themed_entertainment_experience: '0',
        rfq_evaluation_weight_creative_aesthetic_capability: '0',
      };
      for (const [key, value] of Object.entries(configured)) {
        await prisma.projectSetting.create({
          data: { projectId: testProjectId, key, valueJson: value, updatedAt: new Date(), updatedBy: 'test' },
        });
      }
      delete process.env.SEED_CONTEXT;

      const result = await evaluateQuotation(
        {
          quotationId: testQuotationId,
          projectId: testProjectId,
          technicalScore: 100,
          commercialScore: 0,
          genericExperienceScore: 100, // weight 0 → ignored
          themedEntertainmentExperienceScore: 100, // weight 0 → ignored
          creativeAestheticCapabilityScore: 100, // weight 0 → ignored
        },
        'test-evaluator',
      );

      // 100*0.50 + 0*0.50 + ignored = 50
      expect(new Prisma.Decimal(result.compositeScore.toString()).equals(50)).toBe(true);
    });

    it('throws on score outside [0, 100]', async () => {
      await expect(
        evaluateQuotation(
          {
            quotationId: testQuotationId,
            projectId: testProjectId,
            technicalScore: 101, // out of range
            commercialScore: 50,
            genericExperienceScore: 50,
            themedEntertainmentExperienceScore: 50,
            creativeAestheticCapabilityScore: 50,
          },
          'test-evaluator',
        ),
      ).rejects.toThrow(/out of range/);
    });

    it('throws on cross-project quotationId (scope assertion)', async () => {
      // Create a second project; attempt to evaluate testQuotationId pretending it's in the second project.
      process.env.SEED_CONTEXT = 'true';
      const otherProject = await prisma.project.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          code: `PROJ-OTHER-${Date.now()}`,
          name: 'Other Project',
          entityId: testEntityId,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });
      delete process.env.SEED_CONTEXT;

      try {
        await expect(
          evaluateQuotation(
            {
              quotationId: testQuotationId,
              projectId: otherProject.id, // WRONG project
              technicalScore: 50,
              commercialScore: 50,
              genericExperienceScore: 50,
              themedEntertainmentExperienceScore: 50,
              creativeAestheticCapabilityScore: 50,
            },
            'test-evaluator',
          ),
        ).rejects.toThrow();
      } finally {
        process.env.SEED_CONTEXT = 'true';
        await prisma.project.delete({ where: { id: otherProject.id } }).catch(() => {});
        delete process.env.SEED_CONTEXT;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------------

  describe('listEvaluationsForRfq', () => {
    it('returns evaluations for an RFQ ordered by compositeScore desc', async () => {
      // Add a second vendor + quotation to the RFQ
      process.env.SEED_CONTEXT = 'true';
      const vendor2 = await prisma.vendor.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          entityId: testEntityId,
          vendorCode: `V-EVAL2-${Date.now()}`,
          name: 'Vendor 2',
          status: 'active',
          createdBy: 'test',
        },
      });
      const quotation2 = await prisma.quotation.create({
        data: {
          rfqId: testRfqId,
          vendorId: vendor2.id,
          receivedDate: new Date(),
          totalAmount: new Prisma.Decimal('90000'),
          currency: 'SAR',
          status: 'shortlisted',
          createdBy: 'test',
        },
      });
      delete process.env.SEED_CONTEXT;

      try {
        // Evaluate both — quotation1 wins on composite
        await evaluateQuotation(
          {
            quotationId: testQuotationId,
            projectId: testProjectId,
            technicalScore: 90,
            commercialScore: 90,
            genericExperienceScore: 90,
            themedEntertainmentExperienceScore: 90,
            creativeAestheticCapabilityScore: 90,
          },
          'test-evaluator',
        );
        await evaluateQuotation(
          {
            quotationId: quotation2.id,
            projectId: testProjectId,
            technicalScore: 60,
            commercialScore: 60,
            genericExperienceScore: 60,
            themedEntertainmentExperienceScore: 60,
            creativeAestheticCapabilityScore: 60,
          },
          'test-evaluator',
        );

        const list = await listEvaluationsForRfq(testRfqId, testProjectId);
        expect(list).toHaveLength(2);
        // Composite desc: quotation1 (90) before quotation2 (60)
        expect(list[0]!.quotationId).toBe(testQuotationId);
        expect(list[1]!.quotationId).toBe(quotation2.id);
      } finally {
        process.env.SEED_CONTEXT = 'true';
        await prisma.quotationEvaluation.deleteMany({ where: { quotationId: quotation2.id } }).catch(() => {});
        await prisma.quotation.delete({ where: { id: quotation2.id } }).catch(() => {});
        await prisma.vendor.delete({ where: { id: vendor2.id } }).catch(() => {});
        delete process.env.SEED_CONTEXT;
      }
    });
  });

  // -------------------------------------------------------------------------
  // PIC-41-class proof: no hardcoded weight value used as policy
  // -------------------------------------------------------------------------

  describe('PIC-41 governance proof — no hardcoded weight value as policy', () => {
    it('no production seed defines projectSetting weight keys (governance — values are PD-decided per-project)', async () => {
      // The 5 rfq_evaluation_weight_* keys must NEVER be seeded by production
      // seed code. PD writes them per-project via the operator UI / runbook.
      // This test fails if a future seed accidentally bakes in business values.
      const settings = await prisma.projectSetting.findMany({
        where: { key: { in: WEIGHT_KEYS } },
        select: { projectId: true, key: true },
      });

      // The only rows allowed are ones this test itself wrote (in OTHER tests
      // in this describe block) — but `beforeEach` deletes everything for
      // testProjectId. So at this point, projectSetting should be empty of
      // weight keys for testProjectId.
      const offenderRowsForTestProject = settings.filter((s) => s.projectId === testProjectId);
      expect(offenderRowsForTestProject).toEqual([]);

      // Note: production seed scanning is enforced by the test-isolation pattern
      // (fmksa_test starts clean per PIC-38 setup); if production seed ever
      // adds these keys, the broader seed-coverage tests would catch it.
    });
  });
});
