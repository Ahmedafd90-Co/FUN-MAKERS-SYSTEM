/**
 * RFQ bid evaluation — PIC-53 (Layer 2.5 PR-4).
 *
 * Scores a Quotation across 5 PD-decided criteria (per the PIC-53 ruling):
 *   - technical
 *   - commercial
 *   - generic_experience
 *   - themed_entertainment_experience
 *   - creative_aesthetic_capability
 *
 * Composite score = Σ(criterion × weight). Weights live in projectSetting
 * keys `rfq_evaluation_weight_{criterion}` so they are per-project
 * configurable. **No weight values hardcoded** anywhere in code, seed, or
 * test-as-policy — per the PIC-41 governance discipline.
 *
 * Partial-weight configuration (any subset of 5 set; not all 5) throws —
 * silently filling in defaults for missing weights would let the composite
 * drift from what the PD configured. Either ALL FIVE weights are set in
 * projectSetting, or NONE are (the safe-default fallback applies).
 *
 * Safe default when no weights configured: equal weight 0.20 across all 5.
 * Neutral starting point; the PD overrides per-project per the DoA matrix.
 *
 * Audit log captures both the scores AND the weights used at compute time,
 * so a future read can reconstruct exactly how a score was produced even if
 * the project's weight configuration later changes.
 */

import { prisma, Prisma } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Criterion names (canonical snake_case per the PD ruling — exact keys)
// ---------------------------------------------------------------------------

export const EVALUATION_CRITERIA = [
  'technical',
  'commercial',
  'generic_experience',
  'themed_entertainment_experience',
  'creative_aesthetic_capability',
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

export type EvaluationWeights = Record<EvaluationCriterion, Prisma.Decimal>;

/** Equal-weight safe default (0.20 each). Used only when ALL FIVE weight keys
 *  are unset in projectSetting. The PD overrides per-project. */
const DEFAULT_WEIGHTS: EvaluationWeights = {
  technical: new Prisma.Decimal('0.20'),
  commercial: new Prisma.Decimal('0.20'),
  generic_experience: new Prisma.Decimal('0.20'),
  themed_entertainment_experience: new Prisma.Decimal('0.20'),
  creative_aesthetic_capability: new Prisma.Decimal('0.20'),
};

/** Rounding tolerance for the weights-sum-to-1.0 check. */
const WEIGHT_SUM_TOLERANCE = new Prisma.Decimal('0.0001');

// ---------------------------------------------------------------------------
// Weight resolution
// ---------------------------------------------------------------------------

/**
 * Read the 5 evaluation weights from projectSetting for the given project.
 *
 * Three valid states:
 *  - All 5 keys unset → returns DEFAULT_WEIGHTS (equal 0.20 each).
 *  - All 5 keys set + sum ≈ 1.0 → returns the configured weights.
 *  - Anything else (partial, malformed value, or sum ≠ 1.0) → throws.
 *
 * Throwing on partial config is intentional: silently filling defaults for
 * missing keys would let the composite drift from PD intent without warning.
 */
export async function getEvaluationWeights(projectId: string): Promise<EvaluationWeights> {
  const keys = EVALUATION_CRITERIA.map((c) => `rfq_evaluation_weight_${c}`);
  const settings = await prisma.projectSetting.findMany({
    where: { projectId, key: { in: keys } },
    select: { key: true, valueJson: true },
  });

  // Treat null / empty as "not set" — only treat as configured if a parseable
  // string value is present (matches the PIC-41 threshold-mechanism pattern).
  const configured = new Map<string, string>();
  for (const s of settings) {
    if (typeof s.valueJson === 'string' && s.valueJson.length > 0) {
      configured.set(s.key, s.valueJson);
    }
  }

  if (configured.size === 0) {
    return DEFAULT_WEIGHTS;
  }

  if (configured.size !== EVALUATION_CRITERIA.length) {
    const missing = keys.filter((k) => !configured.has(k));
    throw new Error(
      `RFQ evaluation weights partially configured for project ${projectId}: ` +
        `missing keys [${missing.join(', ')}]. All five rfq_evaluation_weight_* ` +
        `keys must be set together, or none. Partial configuration is not allowed ` +
        `(silently defaulting missing weights would let the composite drift from ` +
        `PD intent without warning).`,
    );
  }

  const weights: EvaluationWeights = {} as EvaluationWeights;
  let sum = new Prisma.Decimal(0);
  for (const criterion of EVALUATION_CRITERIA) {
    const key = `rfq_evaluation_weight_${criterion}`;
    const value = configured.get(key)!;
    let dec: Prisma.Decimal;
    try {
      dec = new Prisma.Decimal(value);
    } catch {
      throw new Error(
        `RFQ evaluation weight for '${criterion}' in project ${projectId} is not ` +
          `a valid decimal: '${value}'. Set the projectSetting value to a decimal ` +
          `string (e.g. '0.30') summing to 1.0 across all five criteria.`,
      );
    }
    if (dec.isNegative() || dec.greaterThan(1)) {
      throw new Error(
        `RFQ evaluation weight for '${criterion}' in project ${projectId} is out ` +
          `of range [0, 1]: ${dec.toString()}.`,
      );
    }
    weights[criterion] = dec;
    sum = sum.plus(dec);
  }

  const diff = sum.minus(1).abs();
  if (diff.greaterThan(WEIGHT_SUM_TOLERANCE)) {
    throw new Error(
      `RFQ evaluation weights for project ${projectId} sum to ${sum.toString()}, ` +
        `expected 1.0 (tolerance ${WEIGHT_SUM_TOLERANCE.toString()}). Adjust the ` +
        `five rfq_evaluation_weight_* projectSetting values to sum to 1.0.`,
    );
  }

  return weights;
}

// ---------------------------------------------------------------------------
// Composite computation
// ---------------------------------------------------------------------------

export type CriterionScores = {
  technical: Prisma.Decimal | number | string;
  commercial: Prisma.Decimal | number | string;
  generic_experience: Prisma.Decimal | number | string;
  themed_entertainment_experience: Prisma.Decimal | number | string;
  creative_aesthetic_capability: Prisma.Decimal | number | string;
};

/**
 * Pure function — composite = Σ(criterion × weight). Decimal-safe arithmetic
 * throughout (no JS float). Caller passes already-validated scores
 * (0-100 range enforced at the API/service boundary, not here).
 *
 * Exported for testability (so callers can verify composite computation
 * without mocking the entire service).
 */
export function computeComposite(
  scores: CriterionScores,
  weights: EvaluationWeights,
): Prisma.Decimal {
  let composite = new Prisma.Decimal(0);
  for (const criterion of EVALUATION_CRITERIA) {
    const score = new Prisma.Decimal(scores[criterion].toString());
    const weighted = score.times(weights[criterion]);
    composite = composite.plus(weighted);
  }
  return composite;
}

// ---------------------------------------------------------------------------
// Score validation
// ---------------------------------------------------------------------------

function assertScoreInRange(criterion: EvaluationCriterion, raw: unknown): void {
  let dec: Prisma.Decimal;
  try {
    dec = new Prisma.Decimal(String(raw));
  } catch {
    throw new Error(`Evaluation '${criterion}' score is not a valid decimal: ${raw}`);
  }
  if (dec.isNegative() || dec.greaterThan(100)) {
    throw new Error(
      `Evaluation '${criterion}' score ${dec.toString()} is out of range [0, 100].`,
    );
  }
}

// ---------------------------------------------------------------------------
// Service operations
// ---------------------------------------------------------------------------

export type EvaluateQuotationInput = {
  quotationId: string;
  projectId: string;
  technicalScore: Prisma.Decimal | number | string;
  commercialScore: Prisma.Decimal | number | string;
  genericExperienceScore: Prisma.Decimal | number | string;
  themedEntertainmentExperienceScore: Prisma.Decimal | number | string;
  creativeAestheticCapabilityScore: Prisma.Decimal | number | string;
  evaluationNotes?: string | null | undefined;
};

/**
 * Score a Quotation across the 5 criteria. Idempotent: re-evaluating the
 * same quotation UPDATES the existing record (one-evaluation-per-quotation
 * enforced by the `@unique` on QuotationEvaluation.quotation_id).
 *
 * The composite is computed at write time from the resolved per-project
 * weights and recorded with the evaluation. The weights used are ALSO
 * captured in the audit-log payload so a future read can reconstruct
 * exactly how the composite was produced even if the project's weight
 * configuration later changes.
 */
export async function evaluateQuotation(
  input: EvaluateQuotationInput,
  actorUserId: string,
) {
  // Range-check all 5 scores (0-100).
  assertScoreInRange('technical', input.technicalScore);
  assertScoreInRange('commercial', input.commercialScore);
  assertScoreInRange('generic_experience', input.genericExperienceScore);
  assertScoreInRange('themed_entertainment_experience', input.themedEntertainmentExperienceScore);
  assertScoreInRange('creative_aesthetic_capability', input.creativeAestheticCapabilityScore);

  // Scope-verify the quotation belongs to the caller's project (via the parent RFQ).
  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: input.quotationId },
    include: { rfq: { select: { projectId: true } } },
  });
  assertProjectScope(quotation.rfq, input.projectId, 'Quotation', input.quotationId);

  // Resolve weights (throws on partial config or malformed values).
  const weights = await getEvaluationWeights(input.projectId);

  const scores: CriterionScores = {
    technical: input.technicalScore,
    commercial: input.commercialScore,
    generic_experience: input.genericExperienceScore,
    themed_entertainment_experience: input.themedEntertainmentExperienceScore,
    creative_aesthetic_capability: input.creativeAestheticCapabilityScore,
  };
  const composite = computeComposite(scores, weights);

  const existing = await prisma.quotationEvaluation.findUnique({
    where: { quotationId: input.quotationId },
  });

  const data = {
    technicalScore: new Prisma.Decimal(input.technicalScore.toString()),
    commercialScore: new Prisma.Decimal(input.commercialScore.toString()),
    genericExperienceScore: new Prisma.Decimal(input.genericExperienceScore.toString()),
    themedEntertainmentExperienceScore: new Prisma.Decimal(
      input.themedEntertainmentExperienceScore.toString(),
    ),
    creativeAestheticCapabilityScore: new Prisma.Decimal(
      input.creativeAestheticCapabilityScore.toString(),
    ),
    compositeScore: composite,
    evaluationNotes: input.evaluationNotes ?? null,
    evaluatedBy: actorUserId,
    evaluatedAt: new Date(),
  };

  const record = existing
    ? await prisma.quotationEvaluation.update({
        where: { quotationId: input.quotationId },
        data,
      })
    : await prisma.quotationEvaluation.create({
        data: {
          quotationId: input.quotationId,
          ...data,
        },
      });

  // Audit captures BOTH the scores written AND the weights used at compute time.
  // A future read can verify composite by re-running computeComposite(scores, weights)
  // even if the project's weight configuration later changes.
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: existing ? 'quotation.evaluate.update' : 'quotation.evaluate.create',
    resourceType: 'quotation_evaluation',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: existing as any,
    afterJson: {
      ...(record as any),
      _weightsUsed: Object.fromEntries(
        EVALUATION_CRITERIA.map((c) => [c, weights[c].toString()]),
      ),
    },
  });

  return record;
}

export async function getEvaluation(quotationId: string, projectId: string) {
  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { rfq: { select: { projectId: true } } },
  });
  assertProjectScope(quotation.rfq, projectId, 'Quotation', quotationId);
  return prisma.quotationEvaluation.findUnique({ where: { quotationId } });
}

export async function listEvaluationsForRfq(rfqId: string, projectId: string) {
  const rfq = await prisma.rFQ.findUniqueOrThrow({
    where: { id: rfqId },
    select: { projectId: true },
  });
  assertProjectScope(rfq, projectId, 'RFQ', rfqId);
  return prisma.quotationEvaluation.findMany({
    where: { quotation: { rfqId } },
    include: { quotation: { select: { id: true, vendorId: true, totalAmount: true, status: true } } },
    orderBy: { compositeScore: 'desc' },
  });
}
