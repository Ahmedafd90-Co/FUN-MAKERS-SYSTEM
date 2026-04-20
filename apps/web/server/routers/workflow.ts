/**
 * Workflow tRPC router — templates (admin), instances, actions, My Approvals.
 *
 * Task 1.5.9: Phase 1.5 Group B
 *
 * The router is record-type agnostic — it delegates all business logic to
 * the workflow engine core (packages/core/src/workflow).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateWorkflowTemplateSchema,
  UpdateWorkflowTemplateSchema,
} from '@fmksa/contracts';
import {
  workflowTemplateService,
  workflowInstanceService,
  workflowStepService,
  resolveApprovers,
  TemplateNotFoundError,
  DuplicateTemplateCodeError,
  InstanceNotFoundError,
  DuplicateInstanceError,
  TemplateNotActiveError,
  ProjectNotFoundError,
  StepMismatchError,
  NotAValidApproverError,
  InvalidInstanceStatusError,
  InvalidReturnStepError,
  registerWorkflowNotificationHandlers,
} from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import { prisma } from '@fmksa/db';

// Register workflow event handlers at module load — convergence handlers
// (record status sync) + notification handlers. Matches the pattern used by
// commercial/procurement routers for their posting event types.
registerWorkflowNotificationHandlers();
import {
  router,
  protectedProcedure,
  adminProcedure,
  projectProcedure,
} from '../trpc';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapWorkflowError(err: unknown): never {
  if (err instanceof TemplateNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof DuplicateTemplateCodeError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message });
  }
  if (err instanceof InstanceNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof DuplicateInstanceError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message });
  }
  if (err instanceof TemplateNotActiveError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  if (err instanceof ProjectNotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof StepMismatchError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  if (err instanceof NotAValidApproverError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
  }
  if (err instanceof InvalidInstanceStatusError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  if (err instanceof InvalidReturnStepError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Template admin sub-router (system.admin or screen.admin_workflow_templates)
// ---------------------------------------------------------------------------

const templatesRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          recordType: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      if (!input) return workflowTemplateService.listTemplates();
      const filters: { recordType?: string; isActive?: boolean } = {};
      if (input.recordType !== undefined) filters.recordType = input.recordType;
      if (input.isActive !== undefined) filters.isActive = input.isActive;
      return workflowTemplateService.listTemplates(filters);
    }),

  get: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        return await workflowTemplateService.getTemplate(input.id);
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  create: adminProcedure
    .input(
      CreateWorkflowTemplateSchema.omit({ createdBy: true }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.createTemplate({
          ...input,
          createdBy: ctx.user.id,
        });
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: UpdateWorkflowTemplateSchema.omit({ updatedBy: true }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.updateTemplate(input.id, {
          ...input.data,
          updatedBy: ctx.user.id,
        });
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.deactivateTemplate(
          input.id,
          ctx.user.id,
        );
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  reactivate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.reactivateTemplate(
          input.id,
          ctx.user.id,
        );
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  /** Governance gate: activate a draft template after review. Requires ≥1 step. */
  activate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.activateTemplate(
          input.id,
          ctx.user.id,
        );
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  /** Clone a template into a new draft with a different code. */
  clone: adminProcedure
    .input(z.object({
      sourceId: z.string().uuid(),
      newCode: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Code must be lowercase alphanumeric with underscores'),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowTemplateService.cloneTemplate(
          input.sourceId,
          input.newCode,
          ctx.user.id,
        );
      } catch (err) {
        mapWorkflowError(err);
      }
    }),
});

// ---------------------------------------------------------------------------
// Instance sub-router (project-scoped)
// ---------------------------------------------------------------------------

const instancesRouter = router({
  start: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        templateCode: z.string().min(1),
        recordType: z.string().min(1),
        recordId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowInstanceService.startInstance({
          templateCode: input.templateCode,
          recordType: input.recordType,
          recordId: input.recordId,
          projectId: input.projectId,
          startedBy: ctx.user.id,
        });
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  get: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        instanceId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await workflowInstanceService.getInstance(input.instanceId);
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  getByRecord: protectedProcedure
    .input(z.object({
      recordType: z.string().min(1),
      recordId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const instance = await workflowInstanceService.getInstanceByRecord(
        input.recordType,
        input.recordId,
      );
      if (!instance) return null;

      // Resolve current approvers if instance is active
      let currentApprovers: Array<{ id: string; name: string; email: string }> = [];
      if (instance.currentStep && ['in_progress', 'returned'].includes(instance.status)) {
        const approverRule = instance.currentStep.approverRuleJson as any;
        try {
          const approverIds = await resolveApprovers(approverRule, instance.projectId);
          const users = await prisma.user.findMany({
            where: { id: { in: approverIds } },
            select: { id: true, name: true, email: true },
          });
          currentApprovers = users;
        } catch {
          // NoApproversFoundError — return empty
        }
      }

      return { ...instance, currentApprovers };
    }),

  /**
   * Batch lookup for register cells — returns a compact workflow summary per
   * (recordType, recordId) in a single pair of queries, with no approver
   * resolution. Deliberately read-only and narrow: registers need enough to
   * render "PM Review" / "Returned · Sara" / "Approved" / "No workflow",
   * nothing more.
   */
  listByRecords: protectedProcedure
    .input(z.object({
      recordType: z.string().min(1),
      recordIds: z.array(z.string().min(1)).max(100),
    }))
    .query(async ({ input }) => {
      const empty: Record<string, null> = {};
      if (input.recordIds.length === 0) return empty;

      const instances = await prisma.workflowInstance.findMany({
        where: {
          recordType: input.recordType,
          recordId: { in: input.recordIds },
        },
        orderBy: { startedAt: 'desc' },
        include: {
          template: {
            select: {
              steps: { select: { id: true, name: true, outcomeType: true } },
            },
          },
          actions: {
            where: { action: { in: ['returned', 'return'] } },
            orderBy: { actedAt: 'desc' },
            take: 1,
            select: { actorUserId: true, actedAt: true },
          },
        },
      });

      // Keep the most recent instance per recordId (list is desc by startedAt)
      const latestByRecord = new Map<string, (typeof instances)[number]>();
      for (const inst of instances) {
        if (!latestByRecord.has(inst.recordId)) {
          latestByRecord.set(inst.recordId, inst);
        }
      }

      // Resolve actor names for any returned instances in one query
      const actorIds = new Set<string>();
      for (const inst of latestByRecord.values()) {
        const lastReturn = inst.actions[0];
        if (lastReturn) actorIds.add(lastReturn.actorUserId);
      }
      const actors = actorIds.size
        ? await prisma.user.findMany({
            where: { id: { in: [...actorIds] } },
            select: { id: true, name: true },
          })
        : [];
      const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

      const result: Record<
        string,
        {
          status: string;
          currentStep: { name: string; outcomeType: string | null } | null;
          lastReturnActor: string | null;
        } | null
      > = {};
      for (const recordId of input.recordIds) {
        const inst = latestByRecord.get(recordId);
        if (!inst) {
          result[recordId] = null;
          continue;
        }
        const currentStep = inst.currentStepId
          ? inst.template.steps.find((s) => s.id === inst.currentStepId) ?? null
          : null;
        const lastReturn = inst.actions[0];
        result[recordId] = {
          status: inst.status,
          currentStep: currentStep
            ? { name: currentStep.name, outcomeType: currentStep.outcomeType }
            : null,
          lastReturnActor:
            inst.status === 'returned' && lastReturn
              ? actorNameById.get(lastReturn.actorUserId) ?? null
              : null,
        };
      }
      return result;
    }),
});

// ---------------------------------------------------------------------------
// Actions sub-router (project-scoped)
// ---------------------------------------------------------------------------

const actionsRouter = router({
  approve: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        instanceId: z.string().uuid(),
        stepId: z.string().uuid(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const args: {
          instanceId: string;
          stepId: string;
          actorUserId: string;
          comment?: string;
        } = {
          instanceId: input.instanceId,
          stepId: input.stepId,
          actorUserId: ctx.user.id,
        };
        if (input.comment !== undefined) args.comment = input.comment;
        return await workflowStepService.approveStep(args);
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  reject: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        instanceId: z.string().uuid(),
        stepId: z.string().uuid(),
        comment: z.string().min(1, 'Comment is required for rejection.'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowStepService.rejectStep({
          instanceId: input.instanceId,
          stepId: input.stepId,
          actorUserId: ctx.user.id,
          comment: input.comment,
        });
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  return: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        instanceId: z.string().uuid(),
        stepId: z.string().uuid(),
        comment: z.string().min(1, 'Comment is required for return.'),
        returnToStepId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const args: {
          instanceId: string;
          stepId: string;
          actorUserId: string;
          comment: string;
          returnToStepId?: string;
        } = {
          instanceId: input.instanceId,
          stepId: input.stepId,
          actorUserId: ctx.user.id,
          comment: input.comment,
        };
        if (input.returnToStepId !== undefined) args.returnToStepId = input.returnToStepId;
        return await workflowStepService.returnStep(args);
      } catch (err) {
        mapWorkflowError(err);
      }
    }),

  cancel: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        instanceId: z.string().uuid(),
        reason: z.string().min(1, 'Reason is required for cancellation.'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await workflowStepService.cancelInstance({
          instanceId: input.instanceId,
          actorUserId: ctx.user.id,
          reason: input.reason,
        });
      } catch (err) {
        mapWorkflowError(err);
      }
    }),
});

// ---------------------------------------------------------------------------
// My Approvals (cross-project — protectedProcedure, no project scope)
// ---------------------------------------------------------------------------

const myApprovalsQuery = protectedProcedure.query(async ({ ctx }) => {
  // 1. Get all projects the user is assigned to
  const projectIds = await accessControlService.getAssignedProjectIds(
    ctx.user.id,
  );

  if (projectIds.length === 0) return [];

  // 2. Find all in-progress / returned instances in those projects
  const instances = await prisma.workflowInstance.findMany({
    where: {
      projectId: { in: projectIds },
      status: { in: ['in_progress', 'returned'] },
      currentStepId: { not: null },
    },
    include: {
      template: {
        include: {
          steps: { orderBy: { orderIndex: 'asc' } },
        },
      },
      project: {
        select: { id: true, name: true, code: true },
      },
      actions: {
        orderBy: { actedAt: 'asc' },
      },
    },
  });

  // 3. For each instance, resolve approvers for the current step and filter
  type PreviousHandler = {
    stepId: string;
    stepName: string;
    outcomeType: string | null;
    actorUserId: string;
    actorName: string;
    action: string;
    actedAt: Date;
  };
  type ReturnContext = {
    actorUserId: string;
    actorName: string;
    comment: string | null;
    actedAt: Date;
  };

  const results: Array<{
    instanceId: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    recordType: string;
    recordId: string;
    currentStepId: string;
    currentStepName: string;
    currentStepOutcomeType: string;
    status: string;
    startedAt: Date;
    currentStepStartedAt: Date;
    hoursWaiting: number;
    slaHours: number | null;
    hoursRemaining: number | null;
    isBreached: boolean;
    templateId: string;
    templateCode: string;
    templateName: string;
    previousSteps: Array<{ id: string; name: string; orderIndex: number }>;
    recordReference: string | null;
    previousHandlers: PreviousHandler[];
    nextStep: { name: string; outcomeType: string | null } | null;
    returnContext: ReturnContext | null;
  }> = [];

  const now = new Date();

  for (const instance of instances) {
    if (!instance.currentStepId) continue;

    const currentStep = instance.template.steps.find(
      (s) => s.id === instance.currentStepId,
    );
    if (!currentStep) continue;

    // 4. Check if current user is a valid approver for this step
    const approverRule = currentStep.approverRuleJson as any;
    let approverIds: string[];
    try {
      approverIds = await resolveApprovers(
        approverRule,
        instance.projectId,
      );
    } catch {
      // NoApproversFoundError — skip this instance
      continue;
    }

    if (!approverIds.includes(ctx.user.id)) continue;

    // Compute SLA info
    const relevantActions = instance.actions.filter(
      (a) =>
        a.stepId === instance.currentStepId &&
        ['started', 'approved', 'returned'].includes(a.action),
    );
    const lastTransitionAction =
      relevantActions[relevantActions.length - 1];
    const currentStepStartedAt =
      lastTransitionAction?.actedAt ?? instance.startedAt;

    const hoursWaiting =
      (now.getTime() - currentStepStartedAt.getTime()) / (1000 * 60 * 60);
    const slaHours = currentStep.slaHours;
    const hoursRemaining =
      slaHours != null
        ? Math.round((slaHours - hoursWaiting) * 100) / 100
        : null;
    const isBreached = slaHours != null ? hoursWaiting > slaHours : false;

    // Previous steps for return-to dropdown
    const previousSteps = instance.template.steps
      .filter((s) => s.orderIndex < currentStep.orderIndex)
      .map((s) => ({ id: s.id, name: s.name, orderIndex: s.orderIndex }));

    // Next step preview — first step after the current one by orderIndex.
    // Null at the last step of the flow.
    const nextStepRaw = instance.template.steps.find(
      (s) => s.orderIndex > currentStep.orderIndex,
    );
    const nextStep = nextStepRaw
      ? {
          name: nextStepRaw.name,
          outcomeType: (nextStepRaw as any).outcomeType ?? null,
        }
      : null;

    // Previous handlers — meaningful human touches on this instance (in the
    // order they happened), capped at the 5 most recent. Actor names are
    // resolved in a batched step after the main loop.
    //
    // We include `submit`/`started` because the person who set the workflow
    // in motion is, in operational terms, the first handler — it answers
    // "who touched it before" even when no one has approved yet.
    const transitionActions = instance.actions
      .filter((a) =>
        [
          'submit',
          'started',
          'approved',
          'approve',
          'returned',
          'return',
          'resubmitted',
        ].includes(a.action),
      )
      .slice()
      .reverse()
      .slice(0, 5)
      .reverse();
    const previousHandlers: PreviousHandler[] = transitionActions.map((a) => {
      const step = instance.template.steps.find((s) => s.id === a.stepId);
      return {
        stepId: a.stepId,
        stepName: step?.name ?? '—',
        outcomeType: (step as any)?.outcomeType ?? null,
        actorUserId: a.actorUserId,
        actorName: '', // populated via batched user lookup below
        action: a.action,
        actedAt: a.actedAt,
      };
    });

    // Return context — only populated for returned instances. The latest
    // return/returned action carries the actor + reason.
    let returnContext: ReturnContext | null = null;
    if (instance.status === 'returned') {
      const returnAction = [...instance.actions]
        .reverse()
        .find((a) => a.action === 'returned' || a.action === 'return');
      if (returnAction) {
        returnContext = {
          actorUserId: returnAction.actorUserId,
          actorName: '', // populated via batched user lookup below
          comment: returnAction.comment ?? null,
          actedAt: returnAction.actedAt,
        };
      }
    }

    results.push({
      instanceId: instance.id,
      projectId: instance.projectId,
      projectName: instance.project.name,
      projectCode: instance.project.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      currentStepId: currentStep.id,
      currentStepName: currentStep.name,
      currentStepOutcomeType: (currentStep as any).outcomeType ?? 'approve',
      status: instance.status,
      startedAt: instance.startedAt,
      currentStepStartedAt,
      hoursWaiting: Math.round(hoursWaiting * 100) / 100,
      slaHours,
      hoursRemaining,
      isBreached,
      templateId: instance.templateId,
      templateCode: instance.template.code,
      templateName: instance.template.name,
      previousSteps,
      recordReference: null, // populated below via batch lookup
      previousHandlers,
      nextStep,
      returnContext,
    });
  }

  // 4b. Batch-resolve actor names for every handler + returner we surface.
  //     One user.findMany regardless of how many instances are in scope.
  {
    const actorIds = new Set<string>();
    for (const r of results) {
      for (const h of r.previousHandlers) actorIds.add(h.actorUserId);
      if (r.returnContext) actorIds.add(r.returnContext.actorUserId);
    }
    if (actorIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: [...actorIds] } },
        select: { id: true, name: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.name]));
      for (const r of results) {
        for (const h of r.previousHandlers) {
          h.actorName = nameById.get(h.actorUserId) ?? 'Unknown';
        }
        if (r.returnContext) {
          r.returnContext.actorName =
            nameById.get(r.returnContext.actorUserId) ?? 'Unknown';
        }
      }
    }
  }

  // 5. Batch-resolve human-readable reference numbers (eliminates raw UUIDs in UI)
  {
    const refMap = new Map<string, string>();
    const idsBy = (type: string) => results.filter((r) => r.recordType === type).map((r) => r.recordId);

    const [ipas, ipcs, vars, cps, tis, corrs, eis, rfqs, quots, pos, sis, exps, cns] = await Promise.all([
      idsBy('ipa').length > 0
        ? prisma.ipa.findMany({ where: { id: { in: idsBy('ipa') } }, select: { id: true, referenceNumber: true } })
        : [],
      idsBy('ipc').length > 0
        ? prisma.ipc.findMany({ where: { id: { in: idsBy('ipc') } }, select: { id: true, referenceNumber: true } })
        : [],
      idsBy('variation').length > 0
        ? prisma.variation.findMany({ where: { id: { in: idsBy('variation') } }, select: { id: true, referenceNumber: true, title: true } })
        : [],
      idsBy('cost_proposal').length > 0
        ? prisma.costProposal.findMany({ where: { id: { in: idsBy('cost_proposal') } }, select: { id: true, referenceNumber: true } })
        : [],
      idsBy('tax_invoice').length > 0
        ? prisma.taxInvoice.findMany({ where: { id: { in: idsBy('tax_invoice') } }, select: { id: true, referenceNumber: true, invoiceNumber: true } })
        : [],
      idsBy('correspondence').length > 0
        ? prisma.correspondence.findMany({ where: { id: { in: idsBy('correspondence') } }, select: { id: true, referenceNumber: true, subject: true } })
        : [],
      idsBy('engineer_instruction').length > 0
        ? prisma.engineerInstruction.findMany({ where: { id: { in: idsBy('engineer_instruction') } }, select: { id: true, referenceNumber: true, title: true } })
        : [],
      idsBy('rfq').length > 0
        ? prisma.rFQ.findMany({ where: { id: { in: idsBy('rfq') } }, select: { id: true, referenceNumber: true, rfqNumber: true } })
        : [],
      idsBy('quotation').length > 0
        ? prisma.quotation.findMany({ where: { id: { in: idsBy('quotation') } }, select: { id: true, quotationRef: true } })
        : [],
      idsBy('purchase_order').length > 0
        ? prisma.purchaseOrder.findMany({ where: { id: { in: idsBy('purchase_order') } }, select: { id: true, referenceNumber: true, poNumber: true } })
        : [],
      idsBy('supplier_invoice').length > 0
        ? prisma.supplierInvoice.findMany({ where: { id: { in: idsBy('supplier_invoice') } }, select: { id: true, invoiceNumber: true } })
        : [],
      idsBy('expense').length > 0
        ? prisma.expense.findMany({ where: { id: { in: idsBy('expense') } }, select: { id: true, title: true } })
        : [],
      idsBy('credit_note').length > 0
        ? prisma.creditNote.findMany({ where: { id: { in: idsBy('credit_note') } }, select: { id: true, creditNoteNumber: true } })
        : [],
    ]);

    for (const r of ipas) if (r.referenceNumber) refMap.set(r.id, r.referenceNumber);
    for (const r of ipcs) if (r.referenceNumber) refMap.set(r.id, r.referenceNumber);
    for (const r of vars) refMap.set(r.id, r.referenceNumber ?? r.title);
    for (const r of cps) if (r.referenceNumber) refMap.set(r.id, r.referenceNumber);
    for (const r of tis) refMap.set(r.id, r.referenceNumber ?? r.invoiceNumber);
    for (const r of corrs) refMap.set(r.id, r.referenceNumber ?? r.subject);
    for (const r of eis) refMap.set(r.id, r.referenceNumber ?? r.title);
    for (const r of rfqs) refMap.set(r.id, r.referenceNumber ?? r.rfqNumber);
    for (const r of quots) if (r.quotationRef) refMap.set(r.id, r.quotationRef);
    for (const r of pos) refMap.set(r.id, r.referenceNumber ?? r.poNumber);
    for (const r of sis) refMap.set(r.id, r.invoiceNumber);
    for (const r of exps) refMap.set(r.id, r.title);
    for (const r of cns) refMap.set(r.id, r.creditNoteNumber);

    for (const item of results) {
      item.recordReference = refMap.get(item.recordId) ?? null;
    }
  }

  // 6. Sort: SLA breached first, then closest to SLA, then oldest
  results.sort((a, b) => {
    // Breached items first
    if (a.isBreached && !b.isBreached) return -1;
    if (!a.isBreached && b.isBreached) return 1;

    // Both breached or both not breached — sort by hours remaining (ascending)
    if (a.hoursRemaining != null && b.hoursRemaining != null) {
      return a.hoursRemaining - b.hoursRemaining;
    }

    // Items with SLA before items without SLA
    if (a.hoursRemaining != null && b.hoursRemaining == null) return -1;
    if (a.hoursRemaining == null && b.hoursRemaining != null) return 1;

    // Both have no SLA — oldest first
    return a.currentStepStartedAt.getTime() - b.currentStepStartedAt.getTime();
  });

  return results;
});

// ---------------------------------------------------------------------------
// Composed router
// ---------------------------------------------------------------------------

export const workflowRouter = router({
  templates: templatesRouter,
  instances: instancesRouter,
  actions: actionsRouter,
  myApprovals: myApprovalsQuery,
});
