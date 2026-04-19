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
      myApprovalInstances,
      assignedProjects,
      unreadNotifications,
      recentActivity,
      commercialSignals,
      procurementSignals,
      adminSignals,
      waitingWithOthersRaw,
      recentApprovalsRaw,
    ] = await Promise.all([
      fetchMyApprovalInstances(userId, projectIds),
      fetchAssignedProjects(projectIds),
      getUnreadCount(userId),
      isAdmin ? fetchRecentActivity() : Promise.resolve([]),
      fetchCommercialSignals(projectIds),
      fetchProcurementSignals(projectIds),
      isAdmin ? fetchAdminSignals() : Promise.resolve(null),
      fetchStartedByMeInstances(userId, projectIds),
      fetchMyRecentApprovalActions(userId, projectIds),
    ]);

    const pendingApprovals = myApprovalInstances.length;
    const workflowBand = await buildWorkflowBand({
      myApprovalInstances,
      startedByMe: waitingWithOthersRaw,
      recentApprovals: recentApprovalsRaw,
    });

    return {
      pendingApprovals,
      assignedProjects,
      unreadNotifications,
      recentActivity: isAdmin ? recentActivity : [],
      isAdmin,
      commercialSignals,
      procurementSignals,
      adminSignals,
      workflowBand,
    };
  }),
});

// ---------------------------------------------------------------------------
// Workflow band — dashboard workflow visibility (W4)
//
// Four modules derived from three raw fetches (one approver walk + one
// started-by-me scan + one recent-actions scan), plus a batched reference-
// number lookup grouped by recordType.
// ---------------------------------------------------------------------------

type WorkflowBandRow = {
  instanceId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  recordType: string;
  recordId: string;
  referenceNumber: string | null;
  currentStepName: string | null;
  status: string;
  updatedAt: Date;
};

type WorkflowBand = {
  awaitingMyAction: WorkflowBandRow[];
  returnedToMe: WorkflowBandRow[];
  waitingWithOthers: WorkflowBandRow[];
  recentlyApprovedByMe: WorkflowBandRow[];
};

type ApprovalInstance = {
  id: string;
  projectId: string;
  project: { id: string; code: string; name: string };
  status: string;
  currentStepId: string | null;
  currentStep: { id: string; name: string } | null;
  recordType: string;
  recordId: string;
  updatedAt: Date;
  startedBy: string;
};

/**
 * Fetches instances in the user's project scope where the user is a valid
 * current approver. Lifted from the old countPendingApprovals so the list
 * can feed both the count (`.length`) and the dashboard workflow band.
 */
async function fetchMyApprovalInstances(
  userId: string,
  projectIds: string[],
): Promise<ApprovalInstance[]> {
  if (projectIds.length === 0) return [];

  const instances = await prisma.workflowInstance.findMany({
    where: {
      projectId: { in: projectIds },
      status: { in: ['in_progress', 'returned'] },
      currentStepId: { not: null },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, code: true, name: true } },
      status: true,
      currentStepId: true,
      recordType: true,
      recordId: true,
      startedAt: true,
      startedBy: true,
      template: {
        select: {
          steps: {
            select: { id: true, name: true, approverRuleJson: true },
          },
        },
      },
    },
  });

  const results: ApprovalInstance[] = [];
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
    if (!approverIds.includes(userId)) continue;

    results.push({
      id: instance.id,
      projectId: instance.projectId,
      project: instance.project,
      status: instance.status,
      currentStepId: instance.currentStepId,
      currentStep: { id: currentStep.id, name: currentStep.name },
      recordType: instance.recordType,
      recordId: instance.recordId,
      updatedAt: instance.startedAt,
      startedBy: instance.startedBy,
    });
  }
  return results;
}

/**
 * Active (in_progress/returned) instances started by the user. The final
 * "Waiting With Others" module excludes any instance the user is also the
 * current approver on — those live in Awaiting/Returned instead.
 */
async function fetchStartedByMeInstances(
  userId: string,
  projectIds: string[],
): Promise<ApprovalInstance[]> {
  if (projectIds.length === 0) return [];

  const instances = await prisma.workflowInstance.findMany({
    where: {
      projectId: { in: projectIds },
      startedBy: userId,
      status: { in: ['in_progress', 'returned'] },
    },
    orderBy: { startedAt: 'desc' },
    take: 25, // safety cap — we slice to 5 later after exclusion
    select: {
      id: true,
      projectId: true,
      project: { select: { id: true, code: true, name: true } },
      status: true,
      currentStepId: true,
      recordType: true,
      recordId: true,
      startedAt: true,
      startedBy: true,
      template: {
        select: {
          steps: { select: { id: true, name: true } },
        },
      },
    },
  });

  return instances.map((inst) => {
    const currentStep = inst.currentStepId
      ? inst.template.steps.find((s) => s.id === inst.currentStepId) ?? null
      : null;
    return {
      id: inst.id,
      projectId: inst.projectId,
      project: inst.project,
      status: inst.status,
      currentStepId: inst.currentStepId,
      currentStep: currentStep
        ? { id: currentStep.id, name: currentStep.name }
        : null,
      recordType: inst.recordType,
      recordId: inst.recordId,
      updatedAt: inst.startedAt,
      startedBy: inst.startedBy,
    };
  });
}

/**
 * The user's five most recent approve actions within the project scope.
 * Accepts both the service-written `approved` and the seed-written `approve`
 * so the band is truthful on both live and demo data.
 */
async function fetchMyRecentApprovalActions(
  userId: string,
  projectIds: string[],
) {
  if (projectIds.length === 0) return [];

  const actions = await prisma.workflowAction.findMany({
    where: {
      actorUserId: userId,
      action: { in: ['approved', 'approve'] },
      instance: { projectId: { in: projectIds } },
    },
    orderBy: { actedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      actedAt: true,
      step: { select: { id: true, name: true } },
      instance: {
        select: {
          id: true,
          projectId: true,
          project: { select: { id: true, code: true, name: true } },
          status: true,
          currentStepId: true,
          recordType: true,
          recordId: true,
          startedBy: true,
        },
      },
    },
  });

  return actions;
}

/**
 * Batch reference-number lookup grouped by recordType. Keeps the round-trip
 * count bounded (one findMany per recordType touched, not one per row).
 * For records without a dedicated reference field (e.g. expenses), falls
 * back to the human-readable title.
 */
async function fetchReferenceNumbers(
  pairs: Array<{ recordType: string; recordId: string }>,
): Promise<Map<string, string>> {
  const key = (t: string, id: string) => `${t}:${id}`;
  const result = new Map<string, string>();

  const byType = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byType.has(p.recordType)) byType.set(p.recordType, new Set());
    byType.get(p.recordType)!.add(p.recordId);
  }

  await Promise.all(
    [...byType.entries()].map(async ([recordType, idSet]) => {
      const ids = [...idSet];
      switch (recordType) {
        case 'cost_proposal': {
          const rows = await prisma.costProposal.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true },
          });
          for (const r of rows) if (r.referenceNumber) result.set(key(recordType, r.id), r.referenceNumber);
          break;
        }
        case 'variation': {
          const rows = await prisma.variation.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true },
          });
          for (const r of rows) if (r.referenceNumber) result.set(key(recordType, r.id), r.referenceNumber);
          break;
        }
        case 'ipa': {
          const rows = await prisma.ipa.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true },
          });
          for (const r of rows) if (r.referenceNumber) result.set(key(recordType, r.id), r.referenceNumber);
          break;
        }
        case 'ipc': {
          const rows = await prisma.ipc.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true },
          });
          for (const r of rows) if (r.referenceNumber) result.set(key(recordType, r.id), r.referenceNumber);
          break;
        }
        case 'tax_invoice': {
          const rows = await prisma.taxInvoice.findMany({
            where: { id: { in: ids } },
            select: { id: true, invoiceNumber: true, referenceNumber: true },
          });
          for (const r of rows) {
            const ref = r.invoiceNumber ?? r.referenceNumber;
            if (ref) result.set(key(recordType, r.id), ref);
          }
          break;
        }
        case 'correspondence': {
          const rows = await prisma.correspondence.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true },
          });
          for (const r of rows) if (r.referenceNumber) result.set(key(recordType, r.id), r.referenceNumber);
          break;
        }
        case 'engineer_instruction': {
          const rows = await prisma.engineerInstruction.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true, title: true },
          });
          for (const r of rows) {
            const ref = r.referenceNumber ?? r.title;
            if (ref) result.set(key(recordType, r.id), ref);
          }
          break;
        }
        case 'purchase_order': {
          const rows = await prisma.purchaseOrder.findMany({
            where: { id: { in: ids } },
            select: { id: true, poNumber: true },
          });
          for (const r of rows) if (r.poNumber) result.set(key(recordType, r.id), r.poNumber);
          break;
        }
        case 'rfq': {
          const rows = await prisma.rFQ.findMany({
            where: { id: { in: ids } },
            select: { id: true, referenceNumber: true, rfqNumber: true },
          });
          for (const r of rows) {
            const ref = r.referenceNumber ?? r.rfqNumber;
            if (ref) result.set(key(recordType, r.id), ref);
          }
          break;
        }
        case 'supplier_invoice': {
          const rows = await prisma.supplierInvoice.findMany({
            where: { id: { in: ids } },
            select: { id: true, invoiceNumber: true },
          });
          for (const r of rows) if (r.invoiceNumber) result.set(key(recordType, r.id), r.invoiceNumber);
          break;
        }
        case 'credit_note': {
          const rows = await prisma.creditNote.findMany({
            where: { id: { in: ids } },
            select: { id: true, creditNoteNumber: true },
          });
          for (const r of rows) if (r.creditNoteNumber) result.set(key(recordType, r.id), r.creditNoteNumber);
          break;
        }
        case 'expense': {
          const rows = await prisma.expense.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
          });
          for (const r of rows) if (r.title) result.set(key(recordType, r.id), r.title);
          break;
        }
        default:
          // Unknown record type — leave referenceNumber null. The UI falls
          // back to the humanised recordType label + short id.
          break;
      }
    }),
  );

  return result;
}

function toRow(
  inst: ApprovalInstance,
  refLookup: Map<string, string>,
): WorkflowBandRow {
  const refKey = `${inst.recordType}:${inst.recordId}`;
  return {
    instanceId: inst.id,
    projectId: inst.projectId,
    projectCode: inst.project.code,
    projectName: inst.project.name,
    recordType: inst.recordType,
    recordId: inst.recordId,
    referenceNumber: refLookup.get(refKey) ?? null,
    currentStepName: inst.currentStep?.name ?? null,
    status: inst.status,
    updatedAt: inst.updatedAt,
  };
}

async function buildWorkflowBand({
  myApprovalInstances,
  startedByMe,
  recentApprovals,
}: {
  myApprovalInstances: ApprovalInstance[];
  startedByMe: ApprovalInstance[];
  recentApprovals: Awaited<ReturnType<typeof fetchMyRecentApprovalActions>>;
}): Promise<WorkflowBand> {
  // Split my-approval set into in_progress vs returned, slice to 5 each.
  const awaiting = myApprovalInstances
    .filter((i) => i.status === 'in_progress')
    .slice(0, 5);
  const returned = myApprovalInstances
    .filter((i) => i.status === 'returned')
    .slice(0, 5);

  // Waiting With Others = started by me, excluding anything I'm currently
  // the approver on (those belong to awaiting/returned).
  const myApproverInstanceIds = new Set(myApprovalInstances.map((i) => i.id));
  const waiting = startedByMe
    .filter((i) => !myApproverInstanceIds.has(i.id))
    .slice(0, 5);

  // Collect every recordType/recordId we'll display, then batch-fetch refs.
  const pairs: Array<{ recordType: string; recordId: string }> = [];
  for (const i of [...awaiting, ...returned, ...waiting]) {
    pairs.push({ recordType: i.recordType, recordId: i.recordId });
  }
  for (const a of recentApprovals) {
    pairs.push({ recordType: a.instance.recordType, recordId: a.instance.recordId });
  }
  const refLookup = await fetchReferenceNumbers(pairs);

  return {
    awaitingMyAction: awaiting.map((i) => toRow(i, refLookup)),
    returnedToMe: returned.map((i) => toRow(i, refLookup)),
    waitingWithOthers: waiting.map((i) => toRow(i, refLookup)),
    recentlyApprovedByMe: recentApprovals.map((a) => ({
      instanceId: a.instance.id,
      projectId: a.instance.projectId,
      projectCode: a.instance.project.code,
      projectName: a.instance.project.name,
      recordType: a.instance.recordType,
      recordId: a.instance.recordId,
      referenceNumber:
        refLookup.get(`${a.instance.recordType}:${a.instance.recordId}`) ?? null,
      currentStepName: a.step?.name ?? null,
      status: a.instance.status,
      updatedAt: a.actedAt,
    })),
  };
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
