import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Documents-domain workflow templates (PIC-52 — Layer 2.5 PR-3).
 *
 * Today only `drawing_revision_standard`. Each DrawingRevision's
 * For Approval → For Construction transition routes through this template.
 *
 * The DoA matrix (per-project escalation policy) lives in the existing
 * projectSetting mechanism (PIC-41 pattern). A `drawing_revision_high_value`
 * template is deliberately NOT shipped here — when Pico Play decides a
 * discipline (e.g. structural, ride_systems) needs PD-tier approval, that
 * lands as a follow-up template + projectSetting threshold, not invented
 * here. Speculation-free.
 *
 * Approver chain (sequential, per the PIC-52 Phase A "sequential-only v1"
 * decision; parallel approval is a separate engine-layer ticket if needed):
 *
 *   1. Design Review     — `design` role, the originating team confirms the upload
 *   2. QA/QC Review      — `qa_qc` role, Pico Play technical QA
 *   3. PM Approval       — `project_manager` role, final sign-off into For Construction
 *
 * Roles drawn from `packages/db/src/seed/roles.ts`. No new roles introduced.
 */

type OutcomeType = 'review' | 'approve' | 'sign' | 'issue' | 'acknowledge';

type WorkflowStep = {
  orderIndex: number;
  name: string;
  approverRule: { type: 'project_role'; roleCode: string; projectScoped: true };
  slaHours: number;
  isOptional: boolean;
  requirementFlags: Record<string, unknown>;
  outcomeType: OutcomeType;
};

type WorkflowTemplateDef = {
  code: string;
  name: string;
  recordType: string;
  steps: WorkflowStep[];
};

const CONFIG = {
  allowComment: true,
  allowReturn: true,
  allowOverride: true,
};

function step(
  orderIndex: number,
  name: string,
  roleCode: string,
  slaHours: number,
  outcomeType: OutcomeType = 'approve',
  isOptional = false,
): WorkflowStep {
  return {
    orderIndex,
    name,
    approverRule: { type: 'project_role', roleCode, projectScoped: true },
    slaHours,
    isOptional,
    requirementFlags: {},
    outcomeType,
  };
}

const DOCUMENTS_WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
  {
    code: 'drawing_revision_standard',
    name: 'Drawing Revision — Standard Approval',
    recordType: 'drawing_revision',
    steps: [
      step(10, 'Design Review', 'design', 24, 'review'),
      step(20, 'QA/QC Review', 'qa_qc', 48, 'review'),
      step(30, 'PM Approval', 'project_manager', 48, 'approve'),
    ],
  },
];

export async function seedDocumentsWorkflowTemplates(prisma: PrismaClient) {
  console.log(`  Seeding documents workflow templates (${DOCUMENTS_WORKFLOW_TEMPLATES.length})...`);

  for (const def of DOCUMENTS_WORKFLOW_TEMPLATES) {
    const existing = await prisma.workflowTemplate.findFirst({ where: { code: def.code } });
    if (existing) {
      console.log(`  ⏭ Workflow template '${def.code}' already exists, skipping`);
      continue;
    }

    const template = await prisma.workflowTemplate.create({
      data: {
        code: def.code,
        name: def.name,
        recordType: def.recordType,
        version: 1,
        isActive: true,
        configJson: CONFIG,
        createdBy: 'system',
      },
    });

    for (const s of def.steps) {
      await prisma.workflowStep.create({
        data: {
          templateId: template.id,
          orderIndex: s.orderIndex,
          name: s.name,
          approverRuleJson: s.approverRule as unknown as Prisma.InputJsonValue,
          slaHours: s.slaHours,
          isOptional: s.isOptional,
          requirementFlagsJson: s.requirementFlags as Prisma.InputJsonValue,
          outcomeType: s.outcomeType,
        },
      });
    }

    console.log(`  ✓ '${def.code}' (${def.steps.length} steps)`);
  }
}
