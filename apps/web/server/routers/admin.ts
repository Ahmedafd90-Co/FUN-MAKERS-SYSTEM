/**
 * Admin tRPC router — user/role management operations.
 *
 * PIC-98 PR-3a (F4): F4 split lands here. Previously every procedure used
 * `adminProcedure` (system.admin gate); now each procedure uses
 * `protectedProcedure` + per-perm `hasPerm` gate so `tenant_admin` (which
 * does NOT hold `system.admin`) can reach own-org administration.
 *
 * Permission gates per route:
 *   - roleList:        role.view
 *   - userList:        user.view
 *   - getUser:         user.view
 *   - createUser:      user.create
 *   - deactivateUser:  user.admin
 *
 * Org-scoping (the F4 reachability-change):
 *   - Every User read scopes to `ctx.orgId` for non-platform-admin callers
 *     (tenant_admin sees only own-org users; platform_admin still crosses
 *     orgs per F3 D3 ruling — proven by `isPlatformAdmin(ctx)` checking
 *     `system.admin` permission which only platform_admin holds).
 *   - By-id reads use post-fetch `user.orgId !== ctx.orgId → NOT_FOUND` to
 *     preserve the F3 NOT-FOUND-shaped denial (no cross-org existence
 *     disclosure).
 *   - Create defaults `orgId = ctx.orgId` for non-platform callers; platform_
 *     admin creates inherit the same default (today they only operate in
 *     the singleton org; PR-4's master-provisioning procedure adds the
 *     surface for platform-admin to create users in any org).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma } from '@fmksa/db';
import { hashPassword, auditService } from '@fmksa/core';
import { router, protectedProcedure } from '../trpc';
import { isPlatformAdmin } from '../middleware/org-scope';

/**
 * Per-procedure permission gate — mirrors `posting.ts:42` / `budget.ts:25` /
 * etc. `system.admin` is the platform-admin marker and ALWAYS satisfies any
 * `hasPerm` call (the F3 D3 cross-org bypass marker).
 */
function hasPerm(
  ctx: { user: { permissions: string[] } },
  perm: string,
): boolean {
  return (
    ctx.user.permissions.includes('system.admin') ||
    ctx.user.permissions.includes(perm)
  );
}

export const adminRouter = router({
  roleList: protectedProcedure
    .query(async ({ ctx }) => {
      if (!hasPerm(ctx, 'role.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      // Roles are platform-wide by design (every org uses the same role
      // taxonomy: platform_admin / tenant_admin / project_manager / etc.).
      // No org-scoping on role.findMany — scoping happens at user-role
      // assignment time (the user being assigned must belong to ctx.orgId,
      // which is enforced where assignments happen, NOT here).
      return prisma.role.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isSystem: true,
          rolePermissions: {
            include: { permission: { select: { code: true } } },
          },
        },
      });
    }),

  userList: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(['active', 'inactive', 'locked']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }

      // PIC-98 PR-3a (F4): org-scope ALL User reads for non-platform callers.
      // tenant_admin sees ONLY own-org users; platform_admin (with
      // system.admin) still crosses orgs (F3 D3 survives by construction).
      const where: Record<string, unknown> = {};
      if (!isPlatformAdmin(ctx) && ctx.orgId) {
        where.orgId = ctx.orgId;
      }
      if (input?.status) where.status = input.status;
      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { email: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      return prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          lastLoginAt: true,
          userRoles: {
            include: { role: { select: { code: true, name: true } } },
            where: {
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }),

  getUser: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          orgId: true,
          name: true,
          email: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            include: { role: { select: { id: true, code: true, name: true } } },
            where: {
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            },
          },
        },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      // PIC-98 PR-3a (F4): NOT-FOUND-shaped cross-org denial. tenant_admin
      // in org A fetching an org-B user id gets the SAME response as
      // fetching a fake id — no existence disclosure (mirror F3 isolation
      // pattern). platform_admin still crosses (D3 survives).
      if (!isPlatformAdmin(ctx) && ctx.orgId && user.orgId !== ctx.orgId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      // Flatten roles and compute effective permissions
      const roles = user.userRoles.map((ur) => ur.role);
      const roleIds = roles.map((r) => r.id);
      const rolePermissions = roleIds.length > 0
        ? await prisma.rolePermission.findMany({
            where: { roleId: { in: roleIds } },
            include: { permission: { select: { code: true } } },
          })
        : [];
      const permissions = [...new Set(rolePermissions.map((rp) => rp.permission.code))];
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        roles,
        permissions,
      };
    }),

  deactivateUser: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.admin')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }

      const user = await prisma.user.findUnique({ where: { id: input.id } });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      // PIC-98 PR-3a (F4): NOT-FOUND-shaped cross-org denial on deactivate.
      // Prevents tenant_admin in org A from mutating org-B users.
      if (!isPlatformAdmin(ctx) && ctx.orgId && user.orgId !== ctx.orgId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      if (user.id === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot deactivate your own account.' });
      }
      if (user.status === 'inactive') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'User is already inactive.' });
      }

      const before = { id: user.id, status: user.status };
      const updated = await prisma.user.update({
        where: { id: input.id },
        data: { status: 'inactive' },
        select: { id: true, name: true, email: true, status: true },
      });

      await auditService.log({
        actorUserId: ctx.user.id,
        actorSource: 'user',
        action: 'admin.user_deactivated',
        resourceType: 'user',
        resourceId: user.id,
        beforeJson: before,
        afterJson: { id: updated.id, status: updated.status },
      });

      return updated;
    }),

  createUser: protectedProcedure
    .input(z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Valid email is required'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.create')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }

      // PIC-98 PR-3a (F4) / PIC-108-H: the new user belongs to the caller's org.
      // tenant_admin creates users in their own org by construction. PIC-108-G
      // dropped User.orgId's @default singleton, so org MUST be supplied
      // explicitly — there is no longer a default backstop. A platform_admin
      // whose session carries no org context (ctx.orgId === null) cannot pick a
      // target org here yet; that arrives with the PR-4 master-provisioning
      // surface. Until then, reject rather than silently mis-attribute or
      // NOT-NULL-fail at the DB.
      // CodeRabbit (PIC-108-H): this org-context precondition runs BEFORE the
      // duplicate-email lookup so an unsupported (null-org) request fails fast
      // with BAD_REQUEST regardless of whether the email already exists —
      // rather than being masked by a CONFLICT.
      if (!ctx.orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Cannot create a user without an org context. Platform-admin cross-org user creation arrives with the PR-4 target-org surface and is not yet supported.',
        });
      }

      // Check for duplicate email — emails are unique GLOBALLY (not per-org)
      // so this stays a global check. PR-4 may introduce per-org email
      // namespacing if needed for multi-tenant UX, but for PR-3a the global
      // unique constraint is the source of truth.
      const existing = await prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A user with email "${input.email}" already exists.`,
        });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await prisma.user.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          email: input.email,
          passwordHash,
          status: 'active',
        },
      });

      await auditService.log({
        actorUserId: ctx.user.id,
        actorSource: 'user',
        action: 'admin.user_created',
        resourceType: 'user',
        resourceId: user.id,
        beforeJson: null,
        afterJson: { id: user.id, name: user.name, email: user.email, status: user.status },
      });

      return { id: user.id, name: user.name, email: user.email, status: user.status };
    }),
});
