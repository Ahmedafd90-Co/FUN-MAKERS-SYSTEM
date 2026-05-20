/**
 * Drawings tRPC router — PIC-52 Layer 2.5 PR-3.
 *
 * Drawing Register CRUD + revision lifecycle + acknowledgement.
 * All procedures project-scoped via projectProcedure.
 *
 * File uploads for revisions are handled by the existing /api/upload route
 * (PIC-51's FileUploadField composes against that endpoint with
 * recordType='drawing_revision' + recordId=<revision-id>).
 */
import { z } from 'zod';
import { accessControlService, drawingsService } from '@fmksa/core';
import { router, projectProcedure } from '../trpc';

const DRAWING_DISCIPLINES = [
  'architectural',
  'structural',
  'mep',
  'theming',
  'ff_and_e',
  'rockwork',
  'ride_systems',
  'show_control',
  'scenic',
] as const;

const DisciplineSchema = z.enum(DRAWING_DISCIPLINES);

export const drawingsRouter = router({
  // -------------------------------------------------------------------------
  // Drawing (header) — CRUD
  // -------------------------------------------------------------------------

  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'drawing.view', input.projectId);
      return drawingsService.listDrawings(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'drawing.view', input.projectId);
      return drawingsService.getDrawing(input.id, input.projectId);
    }),

  create: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        drawingNumber: z.string().min(1).max(100),
        title: z.string().min(1).max(255),
        discipline: DisciplineSchema,
        originatorEntityId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'drawing.create', input.projectId);
      return drawingsService.createDrawing(
        {
          projectId: input.projectId,
          drawingNumber: input.drawingNumber,
          title: input.title,
          discipline: input.discipline,
          originatorEntityId: input.originatorEntityId ?? null,
        },
        ctx.user.id,
      );
    }),

  // -------------------------------------------------------------------------
  // DrawingRevision — create + transition + acknowledge
  // -------------------------------------------------------------------------

  createRevision: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        drawingId: z.string().uuid(),
        revisionLabel: z.string().min(1).max(20),
        whatChanged: z.string().min(1),
        distributionList: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'drawing.revise', input.projectId);
      return drawingsService.createRevision(
        {
          projectId: input.projectId,
          drawingId: input.drawingId,
          revisionLabel: input.revisionLabel,
          whatChanged: input.whatChanged,
          ...(input.distributionList ? { distributionList: input.distributionList } : {}),
        },
        ctx.user.id,
      );
    }),

  getRevision: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'drawing.view', input.projectId);
      return drawingsService.getRevision(input.id, input.projectId);
    }),

  /** Transition a revision (the only user-triggered action is 'submit'). */
  transitionRevision: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        id: z.string().uuid(),
        action: z.enum(['submit']),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 'submit' is the user-triggered transition; downstream workflow.approve
      // events route through the workflow router's stepApprove. Permission for
      // submit is `drawing.revise` (you can submit a revision you created or
      // revise). Workflow-driven transitions go through `workflow.approve`.
      await accessControlService.requirePermission(ctx.user.id, 'drawing.revise', input.projectId);
      return drawingsService.transitionRevision(
        {
          projectId: input.projectId,
          id: input.id,
          action: input.action,
          ...(input.comment ? { comment: input.comment } : {}),
        },
        ctx.user.id,
      );
    }),

  /** Recipient on the distribution list acknowledges receipt of a revision. */
  acknowledgeRevision: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), revisionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'drawing.acknowledge',
        input.projectId,
      );
      return drawingsService.acknowledgeRevision(
        {
          projectId: input.projectId,
          revisionId: input.revisionId,
          userId: ctx.user.id,
        },
        ctx.user.id,
      );
    }),
});
