/**
 * Auth tRPC procedures — signIn, signOut, me.
 */
import { TRPCError } from '@trpc/server';
import { SignInSchema, ChangePasswordSchema, AuthErrorCode } from '@fmksa/contracts';
import {
  authService,
  verifyPassword,
  hashPassword,
  InvalidCredentialsError,
  AccountLockedError,
} from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { auditService } from '@fmksa/core';
import { signIn as nextAuthSignIn, signOut as nextAuthSignOut } from '@/lib/auth';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const authRouter = router({
  /**
   * Sign in with email + password.
   *
   * Flow:
   * 1. Validate credentials via core authService (handles lockout, audit)
   * 2. Call Auth.js signIn to set the JWT session cookie
   * 3. Return { success: true }
   */
  signIn: publicProcedure.input(SignInSchema).mutation(async ({ input }) => {
    try {
      // Step 1: Validate credentials via core service
      await authService.signIn(
        input.email,
        input.password,
        '0.0.0.0', // IP — in production, extracted from headers
        'trpc-client', // UA — in production, extracted from headers
      );

      // Step 2: Create the Auth.js session (sets JWT cookie)
      await nextAuthSignIn('credentials', {
        email: input.email,
        password: input.password,
        redirect: false,
      });

      return { success: true as const };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: AuthErrorCode.INVALID_CREDENTIALS,
        });
      }
      if (error instanceof AccountLockedError) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: AuthErrorCode.ACCOUNT_LOCKED,
        });
      }
      throw error;
    }
  }),

  /**
   * Sign out — records logout in audit trail and clears session cookie.
   */
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    // Record logout in audit trail
    await authService.recordLogout(
      ctx.user.id,
      '0.0.0.0', // IP
      'trpc-client', // UA
    );

    // Clear Auth.js session cookie
    await nextAuthSignOut({ redirect: false });

    return { success: true as const };
  }),

  /**
   * Get current authenticated user with roles and permission codes.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      status: ctx.user.status,
      roles: ctx.user.roles,
      permissions: ctx.user.permissions,
    };
  }),

  /**
   * Change the authenticated user's password.
   *
   * Verifies the current password, hashes the new one, updates the
   * user record, and writes an audit log entry (without logging any
   * actual password values).
   */
  changePassword: protectedProcedure
    .input(ChangePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      // Load the user record to get the current password hash
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { passwordHash: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found.',
        });
      }

      // Verify current password
      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Current password is incorrect.',
        });
      }

      // Hash and save the new password
      const newHash = await hashPassword(input.newPassword);
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash: newHash },
      });

      // Audit log (no actual passwords logged)
      await auditService.log({
        actorUserId: ctx.user.id,
        actorSource: 'user',
        action: 'auth.change_password',
        resourceType: 'user',
        resourceId: ctx.user.id,
        beforeJson: {},
        afterJson: { changed: true },
        ip: '0.0.0.0',
        userAgent: 'trpc-client',
      });

      return { success: true as const };
    }),
});
