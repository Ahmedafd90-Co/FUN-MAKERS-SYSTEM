/**
 * Admin tRPC router — user management operations.
 *
 * All procedures require system.admin permission via adminProcedure.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma } from '@fmksa/db';
import { hashPassword, auditService } from '@fmksa/core';
import { router, adminProcedure } from '../trpc';

export const adminRouter = router({
  roleList: adminProcedure
    .query(async () => {
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

  userList: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(['active', 'inactive', 'locked']).optional(),
    }).optional())
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
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

  getUser: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const user = await prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
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

  deactivateUser: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({ where: { id: input.id } });
      if (!user) {
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

  createUser: adminProcedure
    .input(z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Valid email is required'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate email
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
