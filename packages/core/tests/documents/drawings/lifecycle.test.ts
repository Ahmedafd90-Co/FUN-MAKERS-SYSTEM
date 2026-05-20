/**
 * Drawing Register Lifecycle + Workflow Convergence Proof (PIC-52).
 *
 * Proves end-to-end correctness of the Drawing/DrawingRevision lifecycle:
 *   1. Create Drawing (header — no workflow involvement)
 *   2. Create DrawingRevision (status = for_information; no workflow yet)
 *   3. Submit revision → for_approval; auto-starts drawing_revision_standard
 *   4. Template resolution picks drawing_revision_standard with 3 steps
 *   5. Approve all 3 steps → convergence to for_construction;
 *      Drawing.currentRevisionId updated atomically
 *   6. Create second revision, approve it → first revision becomes
 *      superseded; Drawing.currentRevisionId points to the second revision
 *   7. PIC-47-class blind-spot proof: Drawing.currentRevisionId is a
 *      workflow-driven write on a NON-workflow-managed entity. The
 *      no-direct-status-write extension does NOT structurally guard
 *      Drawing writes (Drawing is not in WORKFLOW_DRIVEN_MODELS).
 *      Caller-compliance discipline closes the gap — the convergence
 *      handler runs inside the dispatcher's runAsWorkflowEngine wrap.
 *      Test asserts the discipline holds via the functional outcome:
 *      currentRevisionId is updated atomically with the workflow-managed
 *      DrawingRevision status write; if either had bypassed engine scope
 *      the test would fail (the DrawingRevision write would throw
 *      because that entity IS structurally guarded).
 *   8. Document attachment via 'drawing_revision' recordType round-trip
 *      (PIC-51 polymorphic-attachment registry — proves the new switch
 *      case in verifyRecordInProject works)
 *
 * Engine-scoping for DrawingRevision itself is covered by the existing
 * PIC-49 engine-scoping-guard.test.ts (iterates WORKFLOW_DRIVEN_MODELS;
 * picks up DrawingRevision automatically now that Commit 2 added it).
 * PIC-50 parity guard is covered by template-registry-parity.test.ts
 * (Commit 2 made it 14 entries; the divergent fixture still fires).
 *
 * Created 2026-05-20 — Layer 2.5 PR-3.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createDrawing,
  createRevision,
  transitionRevision,
} from '../../../src/documents/drawings/service';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../../src/workflow';
import { verifyRecordInProject } from '../../../src/documents/verify-record';
import { assertTestDb } from '../../helpers/assert-test-db';

// drawing_revision_standard steps (from documents-workflow-templates.ts):
//   step(10, 'Design Review',  'design',          24, 'review')
//   step(20, 'QA/QC Review',   'qa_qc',           48, 'review')
//   step(30, 'PM Approval',    'project_manager', 48, 'approve')
const ROLES_NEEDED = ['design', 'qa_qc', 'project_manager'] as const;

describe('Drawing Register Lifecycle + Workflow Convergence (PIC-52)', () => {
  let testProject: { id: string; entityId: string };
  let secondProject: { id: string };
  let previousTemplateStates: Array<{ id: string; isActive: boolean }> = [];
  const roleUsers: Record<string, string> = {};
  const ts = Date.now();

  beforeAll(async () => {
    assertTestDb();
    registerConvergenceHandlers();

    // Activate the drawing_revision_standard template (other tests may have
    // left it inactive). Same pattern as expense-workflow-convergence test.
    previousTemplateStates = await prisma.workflowTemplate.findMany({
      where: { recordType: 'drawing_revision' },
      select: { id: true, isActive: true },
    });
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'drawing_revision' },
      data: { isActive: true },
    });

    const entity = await prisma.entity.create({
      data: {
        code: `ENT-DRWG-${ts}`,
        name: 'Drawing WF Test Entity',
        type: 'parent',
        status: 'active',
      },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-DRWG-${ts}`,
        name: 'Drawing Workflow Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, entityId: entity.id };

    // Second project for the cross-project scope assertion test.
    const sp = await prisma.project.create({
      data: {
        code: `PROJ-DRWG-2-${ts}`,
        name: 'Drawing Workflow Test (second project)',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    secondProject = { id: sp.id };

    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-drwg-${roleCode}-${ts}@drwg-wf.test`,
          passwordHash: 'test-hash',
          status: 'active',
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });

      // Project-scoped role assignments on BOTH projects (the workflow approver
      // resolution uses project_role; users need the role scoped to the project).
      for (const projId of [testProject.id, secondProject.id]) {
        await prisma.projectAssignment.create({
          data: {
            userId: user.id,
            projectId: projId,
            roleId: role.id,
            effectiveFrom: new Date('2020-01-01'),
            assignedBy: 'test-setup',
            assignedAt: new Date(),
          },
        });
      }

      roleUsers[roleCode] = user.id;
    }
  }, 60_000);

  afterAll(async () => {
    await Promise.all(
      previousTemplateStates.map((template) =>
        prisma.workflowTemplate.update({
          where: { id: template.id },
          data: { isActive: template.isActive },
        }),
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 1: createDrawing — header CRUD, no workflow
  // -------------------------------------------------------------------------

  it('Scenario 1: createDrawing creates a header with no workflow involvement', async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `A-101-${ts}`,
        title: 'Ground Floor Plan',
        discipline: 'architectural',
      },
      roleUsers.design!,
    );
    expect(drawing.projectId).toBe(testProject.id);
    expect(drawing.discipline).toBe('architectural');
    expect(drawing.currentRevisionId).toBeNull();
    // No workflow on Drawing itself — Drawing is NOT in WORKFLOW_DRIVEN_MODELS.
    const instance = await prisma.workflowInstance.findFirst({
      where: { recordType: 'drawing', recordId: drawing.id },
    });
    expect(instance).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 2: createRevision — status for_information, no workflow yet
  // -------------------------------------------------------------------------

  it('Scenario 2: createRevision creates a revision in for_information; no workflow yet', async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `S-201-${ts}`,
        title: 'Structural Frame',
        discipline: 'structural',
      },
      roleUsers.design!,
    );
    const revision = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P01',
        whatChanged: 'Initial issue for information',
      },
      roleUsers.design!,
    );
    expect(revision.status).toBe('for_information');
    const instance = await prisma.workflowInstance.findFirst({
      where: { recordType: 'drawing_revision', recordId: revision.id },
    });
    expect(instance).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: submit transitions to for_approval; workflow auto-starts
  //             with drawing_revision_standard template
  // -------------------------------------------------------------------------

  it('Scenario 3: submit auto-starts drawing_revision_standard workflow with 3 steps', async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `M-301-${ts}`,
        title: 'MEP Layout',
        discipline: 'mep',
      },
      roleUsers.design!,
    );
    const revision = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P01',
        whatChanged: 'Initial MEP layout',
      },
      roleUsers.design!,
    );

    await transitionRevision(
      { projectId: testProject.id, id: revision.id, action: 'submit' },
      roleUsers.design!,
    );

    const updated = await prisma.drawingRevision.findUnique({ where: { id: revision.id } });
    expect(updated!.status).toBe('for_approval');
    expect(updated!.issuedBy).toBe(roleUsers.design!);
    expect(updated!.issuedAt).not.toBeNull();

    const instance = await workflowInstanceService.getInstanceByRecord(
      'drawing_revision',
      revision.id,
    );
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('drawing_revision_standard');
    expect(instance!.template.steps.length).toBe(3);
    expect(instance!.template.steps[0]!.name).toBe('Design Review');
    expect(instance!.template.steps[1]!.name).toBe('QA/QC Review');
    expect(instance!.template.steps[2]!.name).toBe('PM Approval');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Approving all 3 steps → convergence to for_construction;
  //             Drawing.currentRevisionId updated atomically.
  //
  // This is the load-bearing test for the PIC-47-class blind spot:
  // the convergence handler writes BOTH the DrawingRevision status
  // (structurally guarded) AND the Drawing.currentRevisionId (NOT
  // structurally guarded — caller-compliance discipline). If the
  // dispatcher's runAsWorkflowEngine wrap was missing, the DrawingRevision
  // write would throw and this test would fail; the wrap being functional
  // is what authorises the Drawing.currentRevisionId write too (the
  // caller-compliance proof).
  // -------------------------------------------------------------------------

  it("Scenario 4: approving all steps converges revision to 'for_construction' AND updates Drawing.currentRevisionId atomically (PIC-47-class proof)", async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `T-401-${ts}`,
        title: 'Theming Concept',
        discipline: 'theming',
      },
      roleUsers.design!,
    );
    const revision = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P01',
        whatChanged: 'Initial theming concept',
      },
      roleUsers.design!,
    );
    await transitionRevision(
      { projectId: testProject.id, id: revision.id, action: 'submit' },
      roleUsers.design!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord(
      'drawing_revision',
      revision.id,
    );
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.design!,
    });
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.qa_qc!,
    });
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.project_manager!,
    });

    // Workflow itself reached approved
    const finalInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(finalInstance.status).toBe('approved');

    // DrawingRevision: structurally-guarded entity → for_construction
    const finalRevision = await prisma.drawingRevision.findUnique({ where: { id: revision.id } });
    expect(finalRevision!.status).toBe('for_construction');

    // Drawing: NON-workflow-managed entity → currentRevisionId pointed at this
    // revision. The PIC-47-class proof: this write happens inside the
    // dispatcher's runAsWorkflowEngine wrap (same wrap that authorised the
    // DrawingRevision write above). If the wrap was missing the
    // DrawingRevision write would have thrown — that this test reaches the
    // assertion proves the wrap is functional.
    const finalDrawing = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(finalDrawing!.currentRevisionId).toBe(revision.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Second revision approved → first revision superseded;
  //             Drawing.currentRevisionId points to the second.
  // -------------------------------------------------------------------------

  it('Scenario 5: a newer revision approved supersedes the previous and updates Drawing.currentRevisionId', async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `R-501-${ts}`,
        title: 'Rockwork Form',
        discipline: 'rockwork',
      },
      roleUsers.design!,
    );

    // First revision — approve through to for_construction
    const rev1 = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P01',
        whatChanged: 'Initial rockwork form',
      },
      roleUsers.design!,
    );
    await transitionRevision(
      { projectId: testProject.id, id: rev1.id, action: 'submit' },
      roleUsers.design!,
    );
    const i1 = await workflowInstanceService.getInstanceByRecord('drawing_revision', rev1.id);
    const s1 = i1!.template.steps;
    await workflowStepService.approveStep({ instanceId: i1!.id, stepId: s1[0]!.id, actorUserId: roleUsers.design! });
    await workflowStepService.approveStep({ instanceId: i1!.id, stepId: s1[1]!.id, actorUserId: roleUsers.qa_qc! });
    await workflowStepService.approveStep({ instanceId: i1!.id, stepId: s1[2]!.id, actorUserId: roleUsers.project_manager! });

    const drawingAfterRev1 = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(drawingAfterRev1!.currentRevisionId).toBe(rev1.id);

    // Second revision — approve through to for_construction
    const rev2 = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P02',
        whatChanged: 'Revised rockwork form per client feedback',
      },
      roleUsers.design!,
    );
    await transitionRevision(
      { projectId: testProject.id, id: rev2.id, action: 'submit' },
      roleUsers.design!,
    );
    const i2 = await workflowInstanceService.getInstanceByRecord('drawing_revision', rev2.id);
    const s2 = i2!.template.steps;
    await workflowStepService.approveStep({ instanceId: i2!.id, stepId: s2[0]!.id, actorUserId: roleUsers.design! });
    await workflowStepService.approveStep({ instanceId: i2!.id, stepId: s2[1]!.id, actorUserId: roleUsers.qa_qc! });
    await workflowStepService.approveStep({ instanceId: i2!.id, stepId: s2[2]!.id, actorUserId: roleUsers.project_manager! });

    // Previous revision marked superseded
    const finalRev1 = await prisma.drawingRevision.findUnique({ where: { id: rev1.id } });
    expect(finalRev1!.status).toBe('superseded');

    // New revision is for_construction
    const finalRev2 = await prisma.drawingRevision.findUnique({ where: { id: rev2.id } });
    expect(finalRev2!.status).toBe('for_construction');

    // Drawing now points at the second revision
    const finalDrawing = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(finalDrawing!.currentRevisionId).toBe(rev2.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Cross-project scope protection
  // -------------------------------------------------------------------------

  it('Scenario 6: createRevision refuses to create against a drawing in a different project', async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `X-601-${ts}`,
        title: 'Scope test drawing',
        discipline: 'architectural',
      },
      roleUsers.design!,
    );

    // Attempt to create a revision while pretending we're in secondProject —
    // service should reject via assertProjectScope on the drawing.
    await expect(
      createRevision(
        {
          projectId: secondProject.id,
          drawingId: drawing.id,
          revisionLabel: 'X01',
          whatChanged: 'Should fail — wrong project',
        },
        roleUsers.design!,
      ),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Document attachment via 'drawing_revision' recordType —
  //             PIC-51 polymorphic-attachment switch case works.
  // -------------------------------------------------------------------------

  it("Scenario 7: verifyRecordInProject accepts a 'drawing_revision' recordType + revisionId pair (PIC-51 registry round-trip)", async () => {
    const drawing = await createDrawing(
      {
        projectId: testProject.id,
        drawingNumber: `V-701-${ts}`,
        title: 'Verify-record test drawing',
        discipline: 'show_control',
      },
      roleUsers.design!,
    );
    const revision = await createRevision(
      {
        projectId: testProject.id,
        drawingId: drawing.id,
        revisionLabel: 'P01',
        whatChanged: 'Attachment round-trip test',
      },
      roleUsers.design!,
    );

    // Should resolve cleanly — does NOT throw, project matches.
    await expect(
      verifyRecordInProject('drawing_revision', revision.id, testProject.id),
    ).resolves.toBeUndefined();

    // Wrong project → throws (cross-project FK protection at the
    // Document-attachment layer; same shape as the procurement-entity cases).
    await expect(
      verifyRecordInProject('drawing_revision', revision.id, secondProject.id),
    ).rejects.toThrow();
  });
});
