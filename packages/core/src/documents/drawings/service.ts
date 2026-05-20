/**
 * Drawing Register service — Layer 2.5 PR-3 (PIC-52).
 *
 * Drawing is a header/metadata entity (NOT in WORKFLOW_DRIVEN_MODELS).
 * DrawingRevision is the workflow-managed entity — its `submit` action
 * auto-starts the `drawing_revision_standard` workflow (PIC-47 pattern).
 *
 * Status writes:
 *   - DrawingRevision.status: ALL writes inside runAsWorkflowEngine
 *     (PIC-35/47/49 contract; structurally enforced by no-direct-status-write
 *     extension because DrawingRevision is in WORKFLOW_DRIVEN_MODELS).
 *   - Drawing.currentRevisionId: written by the workflow convergence handler
 *     when a revision reaches for_construction. Drawing is NOT in
 *     WORKFLOW_DRIVEN_MODELS, so the extension's structural guard does NOT
 *     cover this write — caller-compliance discipline applies (the convergence
 *     handler runs inside the dispatcher's runAsWorkflowEngine wrap, so the
 *     write IS engine-scoped, just not by structural guard). Asserted in
 *     tests/documents/drawings/.
 */

import { prisma, runAsWorkflowEngine } from '@fmksa/db';
import type { DrawingDiscipline, DrawingRevisionStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';
import {
  DRAWING_REVISION_TRANSITIONS,
  DRAWING_REVISION_TERMINAL_STATUSES,
  DRAWING_REVISION_ACTION_TO_STATUS,
} from './transitions';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
} from '../../workflow';

// ---------------------------------------------------------------------------
// Drawing (header entity) — CRUD
// ---------------------------------------------------------------------------

export async function createDrawing(
  input: {
    projectId: string;
    drawingNumber: string;
    title: string;
    discipline: DrawingDiscipline;
    originatorEntityId?: string | null | undefined;
  },
  actorUserId: string,
) {
  const record = await prisma.drawing.create({
    data: {
      projectId: input.projectId,
      drawingNumber: input.drawingNumber,
      title: input.title,
      discipline: input.discipline,
      originatorEntityId: input.originatorEntityId ?? null,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'drawing.create',
    resourceType: 'drawing',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

export async function getDrawing(id: string, projectId: string) {
  const record = await prisma.drawing.findUniqueOrThrow({
    where: { id },
    include: {
      currentRevision: true,
      revisions: { orderBy: { createdAt: 'desc' } },
      originatorEntity: true,
    },
  });
  assertProjectScope(record, projectId, 'Drawing', id);
  return record;
}

export async function listDrawings(projectId: string) {
  return prisma.drawing.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { currentRevision: true },
  });
}

// ---------------------------------------------------------------------------
// DrawingRevision — CRUD + transition
// ---------------------------------------------------------------------------

export async function createRevision(
  input: {
    projectId: string;
    drawingId: string;
    revisionLabel: string;
    whatChanged: string;
    distributionList?: string[] | undefined;
  },
  actorUserId: string,
) {
  // Scope-verify the parent drawing belongs to the caller's project before
  // creating a child revision (defends against cross-project FK forgery).
  const drawing = await prisma.drawing.findUniqueOrThrow({ where: { id: input.drawingId } });
  assertProjectScope(drawing, input.projectId, 'Drawing', input.drawingId);

  const revision = await prisma.drawingRevision.create({
    data: {
      drawingId: input.drawingId,
      revisionLabel: input.revisionLabel,
      // for_information is the schema default; setting explicitly for clarity
      // and to keep the create path symmetric with future revisions.
      status: 'for_information',
      whatChanged: input.whatChanged,
      distributionList: input.distributionList ?? [],
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'drawing_revision.create',
    resourceType: 'drawing_revision',
    resourceId: revision.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: revision as any,
  });

  return revision;
}

export async function getRevision(id: string, projectId: string) {
  const revision = await prisma.drawingRevision.findUniqueOrThrow({
    where: { id },
    include: {
      drawing: true,
      acknowledgements: true,
    },
  });
  assertProjectScope(revision.drawing, projectId, 'DrawingRevision', id);
  return revision;
}

export async function transitionRevision(
  params: { projectId: string; id: string; action: string; comment?: string | undefined },
  actorUserId: string,
) {
  // PIC-35 Step 7: ALL status writes on DrawingRevision (a workflow-driven
  // entity) MUST be authorised via runAsWorkflowEngine. Wrap the whole
  // transition body — the writes inside are engine-scoped per the
  // no-direct-status-write extension contract.
  return runAsWorkflowEngine(async () => {
    const { projectId, id, action, comment } = params;

    const newStatus = DRAWING_REVISION_ACTION_TO_STATUS[action];
    if (!newStatus) {
      throw new Error(`Unknown drawing revision action: '${action}'`);
    }

    const existing = await prisma.drawingRevision.findUniqueOrThrow({
      where: { id },
      include: { drawing: true },
    });
    assertProjectScope(existing.drawing, projectId, 'DrawingRevision', id);

    if (DRAWING_REVISION_TERMINAL_STATUSES.includes(existing.status)) {
      throw new Error(
        `Cannot transition drawing revision from terminal status '${existing.status}'.`,
      );
    }

    const allowed = DRAWING_REVISION_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Invalid drawing revision transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(
          allowed ?? []
        ).join(', ')}]`,
      );
    }

    const updated = await prisma.drawingRevision.update({
      where: { id },
      data: {
        status: newStatus as DrawingRevisionStatus,
        // Snapshot the issuer on the first submit (for_information → for_approval).
        // Subsequent re-submits (if any future flow supports them) won't overwrite
        // the original issuer — `issuedBy` is set once, on the move into for_approval.
        ...(newStatus === 'for_approval' && existing.issuedBy === null
          ? { issuedBy: actorUserId, issuedAt: new Date() }
          : {}),
      },
      include: { drawing: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `drawing_revision.transition.${action}`,
      resourceType: 'drawing_revision',
      resourceId: id,
      projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
      reason: comment ?? null,
    });

    // Auto-start the workflow on submit (PIC-47 pattern — mirrors Expense / PO / IPA).
    // The amount-threshold mechanism (PIC-41) doesn't apply here — DrawingRevision
    // has no monetary amount; the resolver returns `drawing_revision_standard`
    // unconditionally for this recordType (mode: 'standard-default', prefix:
    // 'drawing_revision'). PIC-50's registry handles the lookup.
    if (newStatus === 'for_approval') {
      try {
        const resolution = await resolveTemplate('drawing_revision', updated.drawing.projectId);
        if (resolution) {
          await workflowInstanceService.startInstance({
            templateCode: resolution.code,
            recordType: 'drawing_revision',
            recordId: id,
            projectId: updated.drawing.projectId,
            startedBy: actorUserId,
            resolutionSource: resolution.source,
          });
        } else {
          console.warn(
            `[drawing-revision-workflow] No workflow template configured for drawing_revision in project ${updated.drawing.projectId}`,
          );
        }
      } catch (err) {
        if (err instanceof TemplateNotActiveError || err instanceof DuplicateInstanceError) {
          console.warn(
            `[drawing-revision-workflow] Skipped workflow start for revision ${id}: ${(err as Error).message}`,
          );
        } else {
          // Mirror the Expense / PO error-handling rationale: revision is
          // already in for_approval with its audit committed; re-throwing
          // would strand it. Log loudly + fall through; ops can investigate.
          // nosemgrep
          console.error(
            `[drawing-revision-workflow] UNEXPECTED error starting workflow for revision ${id} in project ${updated.drawing.projectId}. Revision is in 'for_approval' state with no active workflow. Error: ${(err as Error).message}`,
            err,
          );
        }
      }
    }

    return updated;
  });
}

// ---------------------------------------------------------------------------
// DrawingRevision acknowledgement (recipient confirms receipt)
// ---------------------------------------------------------------------------

export async function acknowledgeRevision(
  input: { projectId: string; revisionId: string; userId: string },
  actorUserId: string,
) {
  const revision = await prisma.drawingRevision.findUniqueOrThrow({
    where: { id: input.revisionId },
    include: { drawing: true },
  });
  assertProjectScope(revision.drawing, input.projectId, 'DrawingRevision', input.revisionId);

  const ack = await prisma.drawingRevisionAcknowledgement.upsert({
    where: {
      revisionId_userId: { revisionId: input.revisionId, userId: input.userId },
    },
    create: {
      revisionId: input.revisionId,
      userId: input.userId,
      // acknowledgedAt defaults to now() on create; explicit value would shadow it
    },
    // Idempotent: re-acknowledgement is a no-op (don't update acknowledgedAt).
    update: {},
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'drawing_revision.acknowledge',
    resourceType: 'drawing_revision',
    resourceId: input.revisionId,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: ack as any,
  });

  return ack;
}
