/**
 * Notifications tRPC router — Tasks 1.8.7
 *
 * Procedures:
 *   notifications.list           — paginated notification list for the current user
 *   notifications.markRead        — mark a single notification as read
 *   notifications.markAllRead     — mark all unread notifications as read
 *   notifications.unreadCount     — count of unread in-app notifications
 *   notifications.getPreferences  — per-template, per-channel preference map
 *   notifications.setPreference   — upsert a single preference
 *
 * Admin sub-router:
 *   notifications.templates.list   — list all notification templates
 *   notifications.templates.update — update subject/body templates (with audit log)
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  listForUser,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getPreferences,
  setPreference,
  NotificationNotFoundError,
  NotificationOwnershipError,
} from '@fmksa/core';
import { prisma } from '@fmksa/db';

import { router, protectedProcedure, adminProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ListInputSchema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const MarkReadInputSchema = z.object({
  notificationId: z.string().min(1),
});

const SetPreferenceInputSchema = z.object({
  templateCode: z.string().min(1),
  channel: z.enum(['in_app', 'email']),
  enabled: z.boolean(),
});

const UpdateTemplateInputSchema = z.object({
  code: z.string().min(1),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Admin templates sub-router
// ---------------------------------------------------------------------------

const templatesRouter = router({
  list: adminProcedure.query(async () => {
    return prisma.notificationTemplate.findMany({
      orderBy: [{ code: 'asc' }],
      select: {
        id: true,
        code: true,
        channel: true,
        subjectTemplate: true,
        bodyTemplate: true,
        defaultEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }),

  update: adminProcedure
    .input(UpdateTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.notificationTemplate.findUnique({
        where: { code: input.code },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Notification template "${input.code}" not found.`,
        });
      }

      const updated = await (prisma as any).$transaction(async (tx: any) => {
        const template = await tx.notificationTemplate.update({
          where: { code: input.code },
          data: {
            subjectTemplate: input.subjectTemplate,
            bodyTemplate: input.bodyTemplate,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: ctx.user.id,
            actorSource: 'user',
            action: 'notification_template_updated',
            resourceType: 'notification_template',
            resourceId: existing.id,
            beforeJson: {
              subjectTemplate: existing.subjectTemplate,
              bodyTemplate: existing.bodyTemplate,
            },
            afterJson: {
              subjectTemplate: input.subjectTemplate,
              bodyTemplate: input.bodyTemplate,
            },
          },
        });

        return template;
      });

      return updated;
    }),
});

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export const notificationsRouter = router({
  list: protectedProcedure
    .input(ListInputSchema)
    .query(async ({ ctx, input }) => {
      const opts: import('@fmksa/core').ListNotificationsOptions = {};
      if (input.unreadOnly !== undefined) opts.unreadOnly = input.unreadOnly;
      if (input.limit !== undefined) opts.limit = input.limit;
      if (input.cursor !== undefined) opts.cursor = input.cursor;
      return listForUser(ctx.user.id, opts);
    }),

  markRead: protectedProcedure
    .input(MarkReadInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await markAsRead(input.notificationId, ctx.user.id);
      } catch (err) {
        if (err instanceof NotificationNotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        if (err instanceof NotificationOwnershipError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: err.message });
        }
        throw err;
      }
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await markAllAsRead(ctx.user.id);
    return { count };
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return getUnreadCount(ctx.user.id);
  }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    return getPreferences(ctx.user.id);
  }),

  setPreference: protectedProcedure
    .input(SetPreferenceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await setPreference(
        ctx.user.id,
        input.templateCode,
        input.channel,
        input.enabled,
      );
    }),

  templates: templatesRouter,
});
