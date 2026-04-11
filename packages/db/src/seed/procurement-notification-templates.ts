import type { PrismaClient } from '@prisma/client';

const TEMPLATES = [
  {
    code: 'procurement_submitted',
    channel: 'in_app' as const,
    subjectTemplate: 'Procurement record submitted: {{recordType}} {{recordRef}}',
    bodyTemplate: '{{recordType}} {{recordRef}} has been submitted for review by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'procurement_approved',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} approved',
    bodyTemplate: '{{recordType}} {{recordRef}} has been approved by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'procurement_rejected',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} rejected',
    bodyTemplate: '{{recordType}} {{recordRef}} has been rejected by {{actorName}} in project {{projectName}}. Reason: {{comment}}',
    defaultEnabled: true,
  },
  {
    code: 'procurement_returned',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} returned for revision',
    bodyTemplate: '{{recordType}} {{recordRef}} has been returned for revision by {{actorName}} in project {{projectName}}. Reason: {{comment}}',
    defaultEnabled: true,
  },
  {
    code: 'procurement_signed',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} signed',
    bodyTemplate: '{{recordType}} {{recordRef}} has been signed by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'procurement_issued',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} issued',
    bodyTemplate: '{{recordType}} {{recordRef}} has been issued with reference number {{referenceNumber}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'po_delivery_partial',
    channel: 'in_app' as const,
    subjectTemplate: 'PO {{recordRef}} partially delivered',
    bodyTemplate: 'Purchase Order {{recordRef}} in project {{projectName}} has been marked as partially delivered.',
    defaultEnabled: true,
  },
  {
    code: 'po_delivery_complete',
    channel: 'in_app' as const,
    subjectTemplate: 'PO {{recordRef}} delivered',
    bodyTemplate: 'Purchase Order {{recordRef}} in project {{projectName}} has been fully delivered.',
    defaultEnabled: true,
  },
  {
    code: 'invoice_payment_prepared',
    channel: 'in_app' as const,
    subjectTemplate: 'Payment prepared for invoice {{recordRef}}',
    bodyTemplate: 'Supplier Invoice {{recordRef}} in project {{projectName}} has been prepared for payment by {{actorName}}.',
    defaultEnabled: true,
  },
  {
    code: 'expense_approved',
    channel: 'in_app' as const,
    subjectTemplate: 'Expense {{recordRef}} approved',
    bodyTemplate: 'Expense {{recordRef}} ({{expenseSubtype}}) in project {{projectName}} has been approved by {{actorName}}.',
    defaultEnabled: true,
  },
];

export async function seedProcurementNotificationTemplates(prisma: PrismaClient) {
  console.log('  Seeding procurement notification templates...');
  for (const t of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { code: t.code },
      create: {
        code: t.code,
        channel: t.channel,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        defaultEnabled: t.defaultEnabled,
      },
      update: {
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        defaultEnabled: t.defaultEnabled,
      },
    });
  }
  console.log(`  ✓ ${TEMPLATES.length} procurement notification templates seeded`);
}
