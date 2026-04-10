import type { PrismaClient } from '@prisma/client';

/**
 * Reference workflow template: Document Approval
 *
 * Approved by Ahmed Al-Dossary on 2026-04-10 (Pause #2).
 *
 * This is the canonical template demonstrating how Pico Play workflows
 * are structured. Modules 2/3 will copy this pattern for IPA, RFQ, etc.
 *
 * Steps:
 *   1. Document Controller Review (role-based, 24h SLA)
 *   2. Project Manager Approval (project-scoped role, 48h SLA)
 *   3. Project Director Sign-off (project-scoped role, 72h SLA, optional)
 */

const DOCUMENT_APPROVAL_TEMPLATE = {
  code: 'document_approval_v1',
  name: 'Document Approval',
  recordType: 'document',
  config: {
    allowComment: true,
    allowReturn: true,
    allowOverride: true,
  },
  steps: [
    {
      orderIndex: 10,
      name: 'Document Controller Review',
      approverRule: { type: 'role' as const, roleCode: 'document_controller' },
      slaHours: 24,
      isOptional: false,
      requirementFlags: {},
    },
    {
      orderIndex: 20,
      name: 'Project Manager Approval',
      approverRule: { type: 'project_role' as const, roleCode: 'project_manager', projectScoped: true as const },
      slaHours: 48,
      isOptional: false,
      requirementFlags: {},
    },
    {
      orderIndex: 30,
      name: 'Project Director Sign-off',
      approverRule: { type: 'project_role' as const, roleCode: 'project_director', projectScoped: true as const },
      slaHours: 72,
      isOptional: true,
      requirementFlags: {},
    },
  ],
};

export async function seedWorkflowTemplates(prisma: PrismaClient) {
  console.log('  Seeding workflow templates...');

  const existing = await prisma.workflowTemplate.findFirst({
    where: { code: DOCUMENT_APPROVAL_TEMPLATE.code },
  });

  if (existing) {
    console.log('  ⏭ Workflow template already exists, skipping');
    return;
  }

  const template = await prisma.workflowTemplate.create({
    data: {
      code: DOCUMENT_APPROVAL_TEMPLATE.code,
      name: DOCUMENT_APPROVAL_TEMPLATE.name,
      recordType: DOCUMENT_APPROVAL_TEMPLATE.recordType,
      version: 1,
      isActive: true,
      configJson: DOCUMENT_APPROVAL_TEMPLATE.config,
      createdBy: 'system',
    },
  });

  for (const step of DOCUMENT_APPROVAL_TEMPLATE.steps) {
    await prisma.workflowStep.create({
      data: {
        templateId: template.id,
        orderIndex: step.orderIndex,
        name: step.name,
        approverRuleJson: step.approverRule,
        slaHours: step.slaHours,
        isOptional: step.isOptional,
        requirementFlagsJson: step.requirementFlags,
      },
    });
  }

  console.log(`  ✓ Workflow template '${DOCUMENT_APPROVAL_TEMPLATE.code}' seeded with ${DOCUMENT_APPROVAL_TEMPLATE.steps.length} steps`);
}
