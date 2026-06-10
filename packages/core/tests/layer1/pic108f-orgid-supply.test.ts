/**
 * PIC-108-F (Phase MT) — layer1 + workflow write-path orgId-supply, RED→GREEN
 * on a REAL 2nd org. THE LAST SUPPLY BATCH — after this, KNOWN_DEFAULT_RELIANT
 * is EMPTY (the machine-checked completion gate for 108-G).
 *
 * The 4 sites:
 *   - projectParticipant (createProjectParticipant)        → resolveProjectOrgId
 *   - projectParticipant (createPrimeContract ensure-create) → widened projectForCurrency read
 *   - intercompanyContract (createIntercompanyContract)    → widened project read (currency+orgId)
 *   - workflowInstance (writeStartInstanceRows)            → project.orgId threaded from
 *     validateStartInstance's existing fetch (exercised via startInstanceDeferred so no
 *     event dispatch — self-seeded template keeps this green locally AND in CI)
 *
 * RED→GREEN: GREEN here; RED is the stash-revert proof (records fall to the
 * singleton …0001) — see the PR notes.
 *
 * DB-backed (real fmksa_test_core) → runs in the CI @fmksa/core Test job.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  ensureSecondOrg,
  createTenantContext,
  cleanupTenantContext,
  SECOND_ORG_ID,
  type TenantContext,
} from '../helpers/second-org';
import { createProjectParticipant } from '../../src/layer1/project-participants/service';
import { createPrimeContract } from '../../src/layer1/prime-contracts/service';
import { createIntercompanyContract } from '../../src/layer1/intercompany-contracts/service';
import { workflowInstanceService } from '../../src/workflow';

const TAG = `p108f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let ctx: TenantContext;
let entity2Id: string;
let templateId: string | null = null;

beforeAll(async () => {
  await ensureSecondOrg();
  ctx = await createTenantContext(SECOND_ORG_ID, TAG);
  // Second org-B entity — intercompany contracts reject self-contracts, so the
  // from/to pair needs two distinct entities.
  const entity2 = await prisma.entity.create({
    data: {
      orgId: SECOND_ORG_ID,
      code: `ENT2-${TAG}`,
      name: `Entity2 ${TAG}`,
      type: 'parent',
      status: 'active',
    },
  });
  entity2Id = entity2.id;
}, 60_000);

afterAll(async () => {
  const { projectId } = ctx;
  // workflow_actions is append-only (no-delete-on-immutable) → raw SQL.
  await prisma.$executeRawUnsafe(
    `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = $1)`,
    projectId,
  );
  await prisma.workflowInstance.deleteMany({ where: { projectId } });
  if (templateId) {
    await prisma.workflowStep.deleteMany({ where: { templateId } });
    await prisma.workflowTemplate.delete({ where: { id: templateId } });
  }
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id = $1`, projectId);
  await prisma.intercompanyContract.deleteMany({ where: { projectId } });
  // project.primeContractId → PrimeContract is onDelete: Restrict — unlink first.
  await prisma.project.update({ where: { id: projectId }, data: { primeContractId: null } });
  await prisma.primeContract.deleteMany({ where: { projectId } });
  await prisma.projectParticipant.deleteMany({ where: { projectId } });
  await prisma.entity.delete({ where: { id: entity2Id } });
  await cleanupTenantContext(ctx);
}, 60_000);

describe('PIC-108-F — layer1 + workflow writes attribute orgId (real 2nd org)', () => {
  it('projectParticipant (createProjectParticipant) → orgId is org-B', async () => {
    const participant = await createProjectParticipant(
      { projectId: ctx.projectId, entityId: ctx.entityId, role: 'sub_contractor', isPrime: false },
      ctx.userId,
    );
    expect(participant.orgId).toBe(SECOND_ORG_ID);
  });

  it('projectParticipant (createPrimeContract ensure-create) → orgId is org-B', async () => {
    // entity2 is NOT yet a participant — the prime-contract flow's ensure
    // branch creates it (the prime-contracts.ts:94 site).
    await createPrimeContract(
      {
        projectId: ctx.projectId,
        contractingEntityId: entity2Id,
        clientName: `Client ${TAG}`,
        contractValue: 1000,
        contractCurrency: 'SAR',
      } as Parameters<typeof createPrimeContract>[0],
      ctx.userId,
    );
    const participant = await prisma.projectParticipant.findFirstOrThrow({
      where: { projectId: ctx.projectId, entityId: entity2Id },
    });
    expect(participant.isPrime).toBe(true);
    expect(participant.orgId).toBe(SECOND_ORG_ID);
  });

  it('intercompanyContract (createIntercompanyContract) → orgId is org-B', async () => {
    // Both entities are participants by now (tests above run sequentially).
    const record = await createIntercompanyContract(
      {
        projectId: ctx.projectId,
        fromEntityId: ctx.entityId,
        toEntityId: entity2Id,
        scope: `Scope ${TAG}`,
        pricingType: 'cost_plus_markup',
        markupPercent: 5,
        managingDepartment: 'me_contract',
      } as Parameters<typeof createIntercompanyContract>[0],
      ctx.userId,
    );
    expect(record.orgId).toBe(SECOND_ORG_ID);
  });

  it('workflowInstance (writeStartInstanceRows via startInstanceDeferred) → orgId is org-B', async () => {
    // Self-seeded minimal template — local fmksa_test has no seeded workflow
    // templates (the known env gap), so the test carries its own. The deferred
    // variant writes the same rows as startInstance but emits nothing.
    const template = await prisma.workflowTemplate.create({
      data: {
        code: `pic108f_tpl_${TAG}`,
        name: 'PIC-108-F template',
        recordType: 'pic108f_rec',
        version: 1,
        isActive: true,
        configJson: {},
        createdBy: ctx.userId,
      },
    });
    templateId = template.id;
    await prisma.workflowStep.create({
      data: {
        templateId: template.id,
        orderIndex: 1,
        name: 'Step 1',
        approverRuleJson: { type: 'role', role: 'project_manager' },
      },
    });

    const { instanceId } = await prisma.$transaction(async (tx) =>
      workflowInstanceService.startInstanceDeferred({
        templateCode: template.code,
        recordType: 'pic108f_rec',
        recordId: `rec-${TAG}`,
        projectId: ctx.projectId,
        startedBy: ctx.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx: tx as any,
      }),
    );
    const instance = await prisma.workflowInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(instance.orgId).toBe(SECOND_ORG_ID);
  });
});
