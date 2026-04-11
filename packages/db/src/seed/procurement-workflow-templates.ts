import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

type WorkflowStep = {
  orderIndex: number;
  name: string;
  approverRule: { type: 'project_role'; roleCode: string; projectScoped: true };
  slaHours: number;
  isOptional: boolean;
  requirementFlags: Record<string, unknown>;
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
  isOptional = false,
): WorkflowStep {
  return {
    orderIndex,
    name,
    approverRule: { type: 'project_role', roleCode, projectScoped: true },
    slaHours,
    isOptional,
    requirementFlags: {},
  };
}

const PROCUREMENT_WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
  // VendorContract (2)
  {
    code: 'vendor_contract_standard',
    name: 'Vendor Contract Standard',
    recordType: 'vendor_contract',
    steps: [
      step(10, 'Procurement/Contracts Prepare', 'procurement', 24),
      step(20, 'PM Review', 'project_manager', 48),
      step(30, 'Contracts Manager Review', 'contracts_manager', 48),
      step(40, 'Finance Check', 'finance', 48),
      step(50, 'PD Sign', 'project_director', 72),
    ],
  },
  {
    code: 'vendor_contract_low_value',
    name: 'Vendor Contract Low Value',
    recordType: 'vendor_contract',
    steps: [
      step(10, 'Procurement/Contracts Prepare', 'procurement', 24),
      step(20, 'PM Review', 'project_manager', 48),
      step(30, 'Contracts Manager Review', 'contracts_manager', 48),
      step(40, 'PD Sign', 'project_director', 72),
    ],
  },
  // FrameworkAgreement (1)
  {
    code: 'framework_agreement_standard',
    name: 'Framework Agreement Standard',
    recordType: 'framework_agreement',
    steps: [
      step(10, 'Procurement Prepare', 'procurement', 24),
      step(20, 'Contracts Review', 'contracts_manager', 48),
      step(30, 'Finance Check', 'finance', 48),
      step(40, 'PD Approval', 'project_director', 72),
    ],
  },
  // RFQ (2)
  {
    code: 'rfq_standard',
    name: 'RFQ Standard',
    recordType: 'rfq',
    steps: [
      step(10, 'Procurement Prepare', 'procurement', 24),
      step(20, 'Procurement Manager Approval', 'procurement', 48),
    ],
  },
  {
    code: 'rfq_with_pm',
    name: 'RFQ with PM Review',
    recordType: 'rfq',
    steps: [
      step(10, 'Procurement Prepare', 'procurement', 24),
      step(20, 'PM Review', 'project_manager', 48),
      step(30, 'Procurement Manager Approval', 'procurement', 48),
    ],
  },
  // PurchaseOrder (2)
  {
    code: 'po_standard',
    name: 'Purchase Order Standard',
    recordType: 'purchase_order',
    steps: [
      step(10, 'Procurement Prepare', 'procurement', 24),
      step(20, 'PM Review', 'project_manager', 48),
      step(30, 'Procurement Manager Review', 'procurement', 48),
      step(40, 'Finance Check', 'finance', 48),
      step(50, 'Contracts Manager Sign', 'contracts_manager', 72),
    ],
  },
  {
    code: 'po_high_value',
    name: 'Purchase Order High Value',
    recordType: 'purchase_order',
    steps: [
      step(10, 'Procurement Prepare', 'procurement', 24),
      step(20, 'PM Review', 'project_manager', 48),
      step(30, 'Procurement Manager Review', 'procurement', 48),
      step(40, 'Finance Check', 'finance', 48),
      step(50, 'PD Sign', 'project_director', 72),
    ],
  },
  // SupplierInvoice (2)
  {
    code: 'supplier_invoice_standard',
    name: 'Supplier Invoice Standard',
    recordType: 'supplier_invoice',
    steps: [
      step(10, 'Procurement Verification', 'procurement', 24),
      step(20, 'Finance Review', 'finance', 48),
      step(30, 'Finance Manager Approval', 'finance', 48),
    ],
  },
  {
    code: 'supplier_invoice_high_value',
    name: 'Supplier Invoice High Value',
    recordType: 'supplier_invoice',
    steps: [
      step(10, 'Procurement Verification', 'procurement', 24),
      step(20, 'Finance Review', 'finance', 48),
      step(30, 'Finance Manager Approval', 'finance', 48),
      step(40, 'PD Approval', 'project_director', 72),
    ],
  },
  // Expense (2)
  {
    code: 'expense_standard',
    name: 'Expense Standard',
    recordType: 'expense',
    steps: [
      step(10, 'PM Review', 'project_manager', 48),
      step(20, 'Finance Review', 'finance', 48),
      step(30, 'Finance Approval', 'finance', 48),
    ],
  },
  {
    code: 'expense_high_value',
    name: 'Expense High Value',
    recordType: 'expense',
    steps: [
      step(10, 'PM Review', 'project_manager', 48),
      step(20, 'Finance Review', 'finance', 48),
      step(30, 'PD Approval', 'project_director', 72),
    ],
  },
  // CreditNote (1)
  {
    code: 'credit_note_standard',
    name: 'Credit Note Standard',
    recordType: 'credit_note',
    steps: [
      step(10, 'Finance Review', 'finance', 48),
      step(20, 'Finance Manager Verification', 'finance', 48),
    ],
  },
];

export async function seedProcurementWorkflowTemplates(prisma: PrismaClient) {
  console.log('  Seeding procurement workflow templates (12)...');

  for (const def of PROCUREMENT_WORKFLOW_TEMPLATES) {
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
          requirementFlagsJson: s.requirementFlags as Prisma.InputJsonValue,
        },
      });
    }

    console.log(`  ✓ Workflow template '${def.code}' seeded with ${def.steps.length} steps`);
  }

  console.log('  ✅ Procurement workflow templates seeded.');
}
