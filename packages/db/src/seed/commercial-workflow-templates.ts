import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

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

const COMMERCIAL_WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
  // IPA (2)
  {
    code: 'ipa_standard',
    name: 'IPA Standard',
    recordType: 'ipa',
    steps: [
      step(10, 'QS/Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts Manager Review', 'contracts_manager', 48, 'review'),
      step(40, 'PD Sign', 'project_director', 72, 'sign'),
      step(50, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'ipa_with_finance',
    name: 'IPA with Finance Check',
    recordType: 'ipa',
    steps: [
      step(10, 'QS/Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts Manager Review', 'contracts_manager', 48, 'review'),
      step(40, 'Finance Check', 'finance', 48, 'review'),
      step(50, 'PD Sign', 'project_director', 72, 'sign'),
      step(60, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  // IPC (1)
  {
    code: 'ipc_standard',
    name: 'IPC Standard',
    recordType: 'ipc',
    steps: [
      step(10, 'QS/Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts Manager Review', 'contracts_manager', 48, 'review'),
      step(40, 'Finance Check', 'finance', 48, 'review'),
      step(50, 'PD Sign', 'project_director', 72, 'sign'),
      step(60, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  // Variation (2)
  {
    code: 'variation_standard',
    name: 'Variation Standard',
    recordType: 'variation',
    steps: [
      step(10, 'Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts Review', 'contracts_manager', 48, 'review'),
      step(40, 'PD Approval/Sign', 'project_director', 72, 'sign'),
      step(50, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'variation_with_finance',
    name: 'Variation with Finance Check',
    recordType: 'variation',
    steps: [
      step(10, 'Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts Review', 'contracts_manager', 48, 'review'),
      step(40, 'Finance Check', 'finance', 48, 'review'),
      step(50, 'PD Approval/Sign', 'project_director', 72, 'sign'),
      step(60, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  // Cost Proposal (2)
  {
    code: 'cost_proposal_standard',
    name: 'Cost Proposal Standard',
    recordType: 'cost_proposal',
    steps: [
      step(10, 'Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'Contracts/Commercial Review', 'contracts_manager', 48, 'review'),
      step(30, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'cost_proposal_full',
    name: 'Cost Proposal Full Approval',
    recordType: 'cost_proposal',
    steps: [
      step(10, 'Commercial Prepare', 'qs_commercial', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Contracts/Commercial Review', 'contracts_manager', 48, 'review'),
      step(40, 'Finance Check', 'cost_controller', 48, 'review'),
      step(50, 'PD Approval', 'project_director', 72, 'approve'),
      step(60, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  // Tax Invoice (2)
  {
    code: 'tax_invoice_standard',
    name: 'Tax Invoice Standard',
    recordType: 'tax_invoice',
    steps: [
      step(10, 'Commercial/Finance Prepare', 'finance', 24, 'review'),
      step(20, 'Finance Review', 'finance', 48, 'review'),
      step(30, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'tax_invoice_with_pd',
    name: 'Tax Invoice with PD Sign',
    recordType: 'tax_invoice',
    steps: [
      step(10, 'Commercial/Finance Prepare', 'finance', 24, 'review'),
      step(20, 'Finance Review', 'finance', 48, 'review'),
      step(30, 'PD Sign', 'project_director', 72, 'sign'),
      step(40, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  // Correspondence (6)
  {
    code: 'letter_standard',
    name: 'Letter Standard',
    recordType: 'correspondence',
    steps: [
      step(10, 'Originator', 'contracts_manager', 24, 'review'),
      step(20, 'Manager/Contracts Review', 'project_manager', 48, 'review'),
      step(30, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'letter_with_sign',
    name: 'Letter with PD Sign',
    recordType: 'correspondence',
    steps: [
      step(10, 'Originator', 'contracts_manager', 24, 'review'),
      step(20, 'Manager/Contracts Review', 'project_manager', 48, 'review'),
      step(30, 'PD Sign', 'project_director', 72, 'sign'),
      step(40, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'notice_standard',
    name: 'Notice Standard',
    recordType: 'correspondence',
    steps: [
      step(10, 'Originator/Commercial', 'qs_commercial', 24, 'review'),
      step(20, 'Contracts Review', 'contracts_manager', 48, 'review'),
      step(30, 'PD Sign', 'project_director', 72, 'sign'),
      step(40, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'claim_standard',
    name: 'Claim Standard',
    recordType: 'correspondence',
    steps: [
      step(10, 'Commercial/Contracts', 'contracts_manager', 24, 'review'),
      step(20, 'Contracts Review', 'contracts_manager', 48, 'review'),
      step(30, 'PD Sign', 'project_director', 72, 'sign'),
      step(40, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'claim_with_finance',
    name: 'Claim with Finance Check',
    recordType: 'correspondence',
    steps: [
      step(10, 'Commercial/Contracts', 'contracts_manager', 24, 'review'),
      step(20, 'Contracts Review', 'contracts_manager', 48, 'review'),
      step(30, 'Finance Check', 'cost_controller', 48, 'review'),
      step(40, 'PD Sign', 'project_director', 72, 'sign'),
      step(50, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
  {
    code: 'back_charge_standard',
    name: 'Back Charge Standard',
    recordType: 'correspondence',
    steps: [
      step(10, 'Commercial/Contracts', 'contracts_manager', 24, 'review'),
      step(20, 'PM Review', 'project_manager', 48, 'review'),
      step(30, 'Finance Check', 'finance', 48, 'review'),
      step(40, 'PD Sign', 'project_director', 72, 'sign'),
      step(50, 'Issue', 'document_controller', 24, 'issue', true),
    ],
  },
];

export async function seedCommercialWorkflowTemplates(prisma: PrismaClient) {
  console.log('  Seeding commercial workflow templates (15)...');

  for (const def of COMMERCIAL_WORKFLOW_TEMPLATES) {
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
          approverRuleJson: s.approverRule,
          slaHours: s.slaHours,
          isOptional: s.isOptional,
          outcomeType: s.outcomeType,
          requirementFlagsJson: s.requirementFlags as Prisma.InputJsonValue,
        },
      });
    }

    console.log(`  ✓ Workflow template '${def.code}' seeded with ${def.steps.length} steps`);
  }

  console.log('  ✅ Commercial workflow templates seeded.');
}
