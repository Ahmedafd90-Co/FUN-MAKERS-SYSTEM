import { SINGLETON_ORG_ID } from '@fmksa/db';
/**
 * PR-W2A Step 2 — backfill workflow_instances for manual-start entities (PIC-35).
 *
 * For each of CostProposal, TaxInvoice, VendorContract, FrameworkAgreement,
 * CreditNote: find entity rows without a matching workflow_instance and create
 * one. Closes the gap left by entities created before PR-W2A Step 5 wires
 * auto-seed-on-create. Step 5 covers all FUTURE entity creates; this script
 * covers EXISTING rows once.
 *
 * Status mapping per orphan entity.status:
 *   - "initial" (e.g. draft, received): workflow_instance.status = in_progress,
 *     currentStepId = first step
 *   - "mid-workflow" (submitted, under_review): workflow_instance.status =
 *     in_progress, currentStepId = first step. Best effort — original step
 *     history is unrecoverable; the workflow is reset to its start.
 *   - "terminal post-workflow" (everything else — approved, active, applied,
 *     collected, partially_collected, paid, expired, etc.): workflow_instance.status
 *     = approved, completedAt = now, currentStepId = last step. Synthesises a
 *     "completed workflow" record so the cache invariant holds (entity.status
 *     terminal ⇔ workflow_instance terminal).
 *
 * Idempotent. Re-runnable — skips entities that already have an active
 * workflow_instance.
 *
 * Sets `SEED_CONTEXT=true` so future runs (after PR-W2A Step 7's Prisma
 * extension lands) are not blocked from writing status directly. No-op today
 * but forward-safe.
 *
 * Reads DATABASE_URL from env. Run via:
 *   pnpm --filter @fmksa/db backfill:pic35
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RecordType =
  | 'cost_proposal'
  | 'tax_invoice'
  | 'vendor_contract'
  | 'framework_agreement'
  | 'credit_note';

const RECORD_TYPES: readonly RecordType[] = [
  'cost_proposal',
  'tax_invoice',
  'vendor_contract',
  'framework_agreement',
  'credit_note',
] as const;

const ENTITY_TABLE: Record<RecordType, string> = {
  cost_proposal: 'cost_proposals',
  tax_invoice: 'tax_invoices',
  vendor_contract: 'vendor_contracts',
  framework_agreement: 'framework_agreements',
  credit_note: 'credit_notes',
};

/**
 * Default workflow template code per record type. Where multiple templates
 * exist (e.g. tax_invoice_standard vs tax_invoice_with_pd), the "standard"
 * variant is the backfill default. Production overrides via project setting
 * would only matter for new entities (Step 5's auto-seed honors that path);
 * for backfill we always pick the canonical default.
 */
const DEFAULT_TEMPLATE: Record<RecordType, string> = {
  cost_proposal: 'cost_proposal_standard',
  tax_invoice: 'tax_invoice_standard',
  vendor_contract: 'vendor_contract_standard',
  framework_agreement: 'framework_agreement_standard',
  credit_note: 'credit_note_standard',
};

const INITIAL_STATUSES: Record<RecordType, readonly string[]> = {
  cost_proposal: ['draft'],
  tax_invoice: ['draft'],
  vendor_contract: ['draft'],
  framework_agreement: ['draft'],
  credit_note: ['received', 'draft'],
};

const MID_WORKFLOW_STATUSES: Record<RecordType, readonly string[]> = {
  cost_proposal: ['submitted', 'under_review'],
  tax_invoice: ['submitted', 'under_review'],
  vendor_contract: ['submitted', 'under_review'],
  framework_agreement: ['submitted', 'under_review'],
  credit_note: ['submitted', 'under_review'],
};

type OrphanCategory = 'initial' | 'mid' | 'terminal';

function categorize(recordType: RecordType, status: string): OrphanCategory {
  if (INITIAL_STATUSES[recordType].includes(status)) return 'initial';
  if (MID_WORKFLOW_STATUSES[recordType].includes(status)) return 'mid';
  return 'terminal';
}

interface OrphanRow {
  id: string;
  status: string;
  project_id: string;
  created_by: string;
}

async function findOrphans(recordType: RecordType): Promise<OrphanRow[]> {
  const table = ENTITY_TABLE[recordType];
  // Raw SQL: Prisma's typed API can't express the LEFT JOIN ON polymorphic
  // (record_type, record_id) without N+1 query patterns. status::text cast
  // normalises all entity-specific enums to plain strings.
  return prisma.$queryRawUnsafe<OrphanRow[]>(
    `SELECT t.id, t.status::text AS status, t.project_id, t.created_by
     FROM ${table} t
     WHERE NOT EXISTS (
       SELECT 1 FROM workflow_instances wi
       WHERE wi.record_type = $1 AND wi.record_id = t.id
     )`,
    recordType,
  );
}

async function getActiveTemplate(recordType: RecordType) {
  const code = DEFAULT_TEMPLATE[recordType];
  const template = await prisma.workflowTemplate.findFirst({
    where: { code, isActive: true },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!template) {
    throw new Error(
      `No active workflow template found with code "${code}" for recordType "${recordType}". ` +
        `Run pnpm db:seed to seed templates before backfilling.`,
    );
  }
  if (template.steps.length === 0) {
    throw new Error(`Template "${code}" has no steps — cannot backfill.`);
  }
  return template;
}

async function backfillOne(
  recordType: RecordType,
  orphan: OrphanRow,
  template: Awaited<ReturnType<typeof getActiveTemplate>>,
) {
  const firstStep = template.steps[0]!;
  const lastStep = template.steps[template.steps.length - 1]!;
  const category = categorize(recordType, orphan.status);
  const now = new Date();

  const isTerminal = category === 'terminal';
  const workflowStatus = isTerminal ? 'approved' : 'in_progress';
  const currentStepId = isTerminal ? lastStep.id : firstStep.id;
  const completedAt = isTerminal ? now : null;

  await prisma.$transaction(async (tx) => {
    const instance = await tx.workflowInstance.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        templateId: template.id,
        recordType,
        recordId: orphan.id,
        projectId: orphan.project_id,
        startedBy: orphan.created_by,
        startedAt: now,
        status: workflowStatus,
        currentStepId,
        completedAt,
      },
    });

    await tx.workflowAction.create({
      data: {
        instanceId: instance.id,
        stepId: currentStepId,
        actorUserId: orphan.created_by,
        action: 'started',
        actedAt: now,
        metadataJson: {
          backfill: true,
          ticket: 'PIC-35',
          step: 'PR-W2A-Step-2',
          originalEntityStatus: orphan.status,
          category,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: orphan.created_by,
        actorSource: 'system',
        action: 'workflow.instance_backfilled',
        resourceType: 'workflow_instance',
        resourceId: instance.id,
        projectId: orphan.project_id,
        beforeJson: {},
        afterJson: {
          templateCode: template.code,
          recordType,
          recordId: orphan.id,
          status: workflowStatus,
          category,
          originalEntityStatus: orphan.status,
        },
      },
    });
  });

  console.log(
    `  ✓ ${recordType}:${orphan.id.slice(0, 8)}... entity=${orphan.status}, workflow=${workflowStatus}, step=${isTerminal ? lastStep.name : firstStep.name} [${category}]`,
  );
}

async function main() {
  console.log('PIC-35 Step 2 — backfill manual-start workflow_instances\n');
  // Forward-safe: when PR-W2A Step 7's Prisma extension lands, this flag
  // bypasses the status-write guard. No-op today; required tomorrow.
  process.env.SEED_CONTEXT = 'true';

  let totalCreated = 0;
  const summary: Record<string, { orphans: number; backfilled: number; byCategory: Record<OrphanCategory, number> }> = {};

  for (const recordType of RECORD_TYPES) {
    const orphans = await findOrphans(recordType);
    summary[recordType] = {
      orphans: orphans.length,
      backfilled: 0,
      byCategory: { initial: 0, mid: 0, terminal: 0 },
    };

    if (orphans.length === 0) {
      console.log(`${recordType}: 0 orphans — skipping`);
      continue;
    }

    console.log(`${recordType}: ${orphans.length} orphan(s)`);
    const template = await getActiveTemplate(recordType);

    for (const orphan of orphans) {
      const category = categorize(recordType, orphan.status);
      await backfillOne(recordType, orphan, template);
      summary[recordType]!.backfilled += 1;
      summary[recordType]!.byCategory[category] += 1;
      totalCreated += 1;
    }
  }

  console.log('\nSummary:');
  for (const [recordType, stats] of Object.entries(summary)) {
    if (stats.backfilled === 0) continue;
    const parts: string[] = [];
    if (stats.byCategory.initial > 0) parts.push(`${stats.byCategory.initial} initial`);
    if (stats.byCategory.mid > 0) parts.push(`${stats.byCategory.mid} mid-workflow`);
    if (stats.byCategory.terminal > 0) parts.push(`${stats.byCategory.terminal} terminal`);
    console.log(`  ${recordType}: ${stats.backfilled} created (${parts.join(', ')})`);
  }
  console.log(`\n✅ Backfill complete. ${totalCreated} workflow_instance(s) created.`);
}

main()
  .catch((err) => {
    console.error('❌ Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
