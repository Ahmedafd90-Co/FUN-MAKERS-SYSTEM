import type { PrismaClient } from '@prisma/client';

const TEMPLATES = [
  {
    code: 'commercial_submitted',
    channel: 'in_app' as const,
    subjectTemplate: 'Commercial record submitted: {{recordType}} {{recordRef}}',
    bodyTemplate: '{{recordType}} {{recordRef}} has been submitted for review by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'commercial_approved',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} approved',
    bodyTemplate: '{{recordType}} {{recordRef}} has been approved by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'commercial_rejected',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} rejected',
    bodyTemplate: '{{recordType}} {{recordRef}} has been rejected by {{actorName}} in project {{projectName}}. Reason: {{comment}}',
    defaultEnabled: true,
  },
  {
    code: 'commercial_returned',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} returned for revision',
    bodyTemplate: '{{recordType}} {{recordRef}} has been returned for revision by {{actorName}} in project {{projectName}}. Reason: {{comment}}',
    defaultEnabled: true,
  },
  {
    code: 'commercial_signed',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} signed',
    bodyTemplate: '{{recordType}} {{recordRef}} has been signed by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'commercial_issued',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} issued',
    bodyTemplate: '{{recordType}} {{recordRef}} has been issued with reference number {{referenceNumber}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'invoice_overdue',
    channel: 'in_app' as const,
    subjectTemplate: 'Tax invoice overdue: {{recordRef}}',
    bodyTemplate: 'Tax invoice {{recordRef}} in project {{projectName}} is past its due date. Please follow up on collection.',
    defaultEnabled: true,
  },
];

export async function seedCommercialNotificationTemplates(prisma: PrismaClient) {
  console.log('  Seeding commercial notification templates...');
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
  console.log(`  ✓ ${TEMPLATES.length} commercial notification templates seeded`);
}
