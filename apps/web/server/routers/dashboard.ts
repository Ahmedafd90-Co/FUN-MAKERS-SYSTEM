/**
 * Dashboard tRPC router.
 *
 * Single `summary` endpoint that aggregates every signal the home dashboard
 * needs in one round-trip. Scoped to the authenticated user's assigned
 * projects throughout — no cross-project leakage.
 *
 * Phase 4 additions (all read-only counts):
 *   - commercialSignals   — IPC, variation, tax invoice, cost proposal
 *   - procurementSignals  — PO, SI, expense, credit note
 *   - adminSignals        — posting exceptions (admin only)
 */
import { prisma } from '@fmksa/db';
import { getUnreadCount, resolveApprovers } from '@fmksa/core';

import { router, protectedProcedure } from '../trpc';

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const isAdmin = ctx.user.permissions.includes('system.admin');

    // 1. Resolve the user's assigned project scope once.
    const assignments = await (prisma as any).projectAssignment.findMany({
      where: { userId },
      select: { projectId: true, assignedAt: true },
      orderBy: { assignedAt: 'desc' },
    });
    const projectIds: string[] = assignments.map(
      (a: { projectId: string }) => a.projectId,
    );

    // 2. Run independent queries in parallel. Empty-project shortcuts
    //    prevent pointless prisma round-trips for brand-new users.
    const [
      pendingApprovals,
      assignedProjects,
      unreadNotifications,
      recentActivity,
      commercialSignals,
      procurementSignals,
      adminSignals,
    ] = await Promise.all([
      countPendingApprovals(userId, projectIds),
      fetchAssignedProjects(projectIds),
      getUnreadCount(userId),
      isAdmin ? fetchRecentActivity() : Promise.resolve([]),
      fetchCommercialSignals(projectIds),
      fetchProcurementSignals(projectIds),
      isAdmin ? fetchAdminSignals() : Promise.resolve(null),
    ]);

    return {
      pendingApprovals,
      assignedProjects,
      unreadNotifications,
      recentActivity: isAdmin ? recentActivity : [],
      isAdmin,
      commercialSignals,
      procurementSignals,
      adminSignals,
    };
  }),
});

// ---------------------------------------------------------------------------
// Pending approvals (unchanged semantics — matches /approvals queue)
// ---------------------------------------------------------------------------

async function countPendingApprovals(
  userId: string,
  projectIds: string[],
): Promise<number> {
  if (projectIds.length === 0) return 0;

  const instances = await prisma.workflowInstance.findMany({
    where: {
      projectId: { in: projectIds },
      status: { in: ['in_progress', 'returned'] },
      currentStepId: { not: null },
    },
    select: {
      id: true,
      projectId: true,
      currentStepId: true,
      template: {
        select: {
          steps: {
            select: { id: true, approverRuleJson: true },
          },
        },
      },
    },
  });

  let count = 0;
  for (const instance of instances) {
    if (!instance.currentStepId) continue;
    const currentStep = instance.template.steps.find(
      (s) => s.id === instance.currentStepId,
    );
    if (!currentStep) continue;

    let approverIds: string[];
    try {
      approverIds = await resolveApprovers(
        currentStep.approverRuleJson as any,
        instance.projectId,
      );
    } catch {
      continue;
    }
    if (approverIds.includes(userId)) count += 1;
  }
  return count;
}

async function fetchAssignedProjects(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  return projects;
}

async function fetchRecentActivity() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      actorSource: true,
      createdAt: true,
    },
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    actorSource: log.actorSource,
    createdAt: log.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Commercial signals — counts of records requiring commercial attention
// scoped to the user's assigned projects.
//
// Definitions:
//   - ipcInReview:         IPCs in under_review / returned (approver queue)
//   - variationsOpen:      Variations actively moving through the pipeline
//   - taxInvoicesOverdue:  Status=overdue OR (issued past due, not collected)
//   - costProposalsOpen:   Cost proposals in review lifecycle
// ---------------------------------------------------------------------------

async function fetchCommercialSignals(projectIds: string[]) {
  if (projectIds.length === 0) {
    return {
      ipcInReview: 0,
      variationsOpen: 0,
      taxInvoicesOverdue: 0,
      costProposalsOpen: 0,
    };
  }

  const now = new Date();

  const [ipcInReview, variationsOpen, taxInvoicesOverdue, costProposalsOpen] =
    await Promise.all([
      prisma.ipc.count({
        where: {
          projectId: { in: projectIds },
          status: { in: ['under_review', 'returned'] as any[] },
        },
      }),
      prisma.variation.count({
        where: {
          projectId: { in: projectIds },
          status: {
            in: [
              'submitted',
              'under_review',
              'returned',
              'client_pending',
            ] as any[],
          },
        },
      }),
      prisma.taxInvoice.count({
        where: {
          projectId: { in: projectIds },
          OR: [
            { status: 'overdue' as any },
            {
              AND: [
                {
                  status: {
                    in: ['issued', 'submitted', 'partially_collected'] as any[],
                  },
                },
                { dueDate: { lt: now } },
              ],
            },
          ],
        },
      }),
      prisma.costProposal.count({
        where: {
          projectId: { in: projectIds },
          status: { in: ['submitted', 'under_review', 'returned'] as any[] },
        },
      }),
    ]);

  return {
    ipcInReview,
    variationsOpen,
    taxInvoicesOverdue,
    costProposalsOpen,
  };
}

// ---------------------------------------------------------------------------
// Procurement signals
//
// Definitions:
//   - posAwaitingApproval:     POs in submitted/under_review/returned
//   - supplierInvoicesDisputed: SIs in disputed status (explicit block)
//   - expensesPendingAction:   Expenses in submitted/returned (approver queue)
//   - creditNotesReceived:     CNs in received (awaiting verify)
// ---------------------------------------------------------------------------

async function fetchProcurementSignals(projectIds: string[]) {
  if (projectIds.length === 0) {
    return {
      posAwaitingApproval: 0,
      supplierInvoicesDisputed: 0,
      expensesPendingAction: 0,
      creditNotesReceived: 0,
    };
  }

  const [
    posAwaitingApproval,
    supplierInvoicesDisputed,
    expensesPendingAction,
    creditNotesReceived,
  ] = await Promise.all([
    prisma.purchaseOrder.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ['submitted'] as any[] },
      },
    }),
    prisma.supplierInvoice.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ['disputed'] as any[] },
      },
    }),
    prisma.expense.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ['submitted'] as any[] },
      },
    }),
    prisma.creditNote.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ['received'] as any[] },
      },
    }),
  ]);

  return {
    posAwaitingApproval,
    supplierInvoicesDisputed,
    expensesPendingAction,
    creditNotesReceived,
  };
}

// ---------------------------------------------------------------------------
// Admin signals — platform-wide signals only surfaced to admin users.
// ---------------------------------------------------------------------------

async function fetchAdminSignals() {
  const postingExceptionsOpen = await prisma.postingException.count({
    where: { resolvedAt: null },
  });
  return { postingExceptionsOpen };
}
