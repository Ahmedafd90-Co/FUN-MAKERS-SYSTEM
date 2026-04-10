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
} from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import { prisma } from '@fmksa/db';
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
      return workflowTemplateService.listTemplates(input ?? undefined);
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
        return await workflowStepService.approveStep({
          instanceId: input.instanceId,
          stepId: input.stepId,
          actorUserId: ctx.user.id,
          comment: input.comment,
        });
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
        return await workflowStepService.returnStep({
          instanceId: input.instanceId,
          stepId: input.stepId,
          actorUserId: ctx.user.id,
          comment: input.comment,
          returnToStepId: input.returnToStepId,
        });
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
  const results: Array<{
    instanceId: string;
    projectId: string;
    projectName: string;
    projectCode: string;
    recordType: string;
    recordId: string;
    currentStepId: string;
    currentStepName: string;
    status: string;
    startedAt: Date;
    currentStepStartedAt: Date;
    hoursWaiting: number;
    slaHours: number | null;
    hoursRemaining: number | null;
    isBreached: boolean;
    templateId: string;
    templateCode: string;
    previousSteps: Array<{ id: string; name: string; orderIndex: number }>;
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

    results.push({
      instanceId: instance.id,
      projectId: instance.projectId,
      projectName: instance.project.name,
      projectCode: instance.project.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      currentStepId: currentStep.id,
      currentStepName: currentStep.name,
      status: instance.status,
      startedAt: instance.startedAt,
      currentStepStartedAt,
      hoursWaiting: Math.round(hoursWaiting * 100) / 100,
      slaHours,
      hoursRemaining,
      isBreached,
      templateId: instance.templateId,
      templateCode: instance.template.code,
      previousSteps,
    });
  }

  // 5. Sort: SLA breached first, then closest to SLA, then oldest
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
