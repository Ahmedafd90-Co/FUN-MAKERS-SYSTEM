/**
 * Dashboard tRPC router — Phase 1.9
 *
 * Provides a summary endpoint that aggregates data for the home dashboard:
 *   - Pending approval count
 *   - Assigned projects (5 most recent)
 *   - Unread notification count
 *   - Recent audit activity (admin only)
 */
import { prisma } from '@fmksa/db';
import { getUnreadCount } from '@fmksa/core';

import { router, protectedProcedure } from '../trpc';

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const isAdmin = ctx.user.permissions.includes('system.admin');

    // Run independent queries in parallel
    const [pendingApprovals, assignedProjects, unreadNotifications, recentActivity] =
      await Promise.all([
        // 1. Count pending approvals for this user
        countPendingApprovals(userId),
        // 2. Recent assigned projects
        fetchAssignedProjects(userId),
        // 3. Unread notification count (reuse core function)
        getUnreadCount(userId),
        // 4. Recent audit log entries (admin only)
        isAdmin ? fetchRecentActivity() : Promise.resolve([]),
      ]);

    return {
      pendingApprovals,
      assignedProjects,
      unreadNotifications,
      recentActivity: isAdmin ? recentActivity : [],
      isAdmin,
    };
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function countPendingApprovals(userId: string): Promise<number> {
  // Get projects the user is assigned to
  const assignments = await (prisma as any).projectAssignment.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = assignments.map((a: { projectId: string }) => a.projectId);

  if (projectIds.length === 0) return 0;

  // Count workflow instances in those projects that are pending action
  return (prisma as any).workflowInstance.count({
    where: {
      projectId: { in: projectIds },
      status: { in: ['in_progress', 'returned'] },
    },
  });
}

async function fetchAssignedProjects(userId: string) {
  const assignments = await (prisma as any).projectAssignment.findMany({
    where: { userId },
    select: { projectId: true },
    orderBy: { assignedAt: 'desc' },
    take: 5,
  });
  const projectIds = assignments.map((a: { projectId: string }) => a.projectId);

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
    take: 5,
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
