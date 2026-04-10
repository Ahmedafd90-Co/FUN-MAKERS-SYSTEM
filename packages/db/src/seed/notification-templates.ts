import type { PrismaClient } from '@prisma/client';

const TEMPLATES = [
  {
    code: 'workflow_step_assigned',
    channel: 'in_app' as const,
    subjectTemplate: 'New approval waiting: {{stepName}}',
    bodyTemplate:
      'You have a new approval waiting: {{stepName}} for {{recordType}} {{recordRef}} in project {{projectName}}. Please review and take action.',
    defaultEnabled: true,
  },
  {
    code: 'workflow_approved',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} approved',
    bodyTemplate:
      '{{recordType}} {{recordRef}} has been approved by {{actorName}} in project {{projectName}}.',
    defaultEnabled: true,
  },
  {
    code: 'workflow_rejected',
    channel: 'in_app' as const,
    subjectTemplate: '{{recordType}} {{recordRef}} rejected',
    bodyTemplate:
      '{{recordType}} {{recordRef}} has been rejected by {{actorName}} in project {{projectName}}. Reason: {{comment}}',
    defaultEnabled: true,
  },
  {
    code: 'document_signed',
    channel: 'in_app' as const,
    subjectTemplate: 'Document signed: {{documentTitle}}',
    bodyTemplate:
      "Document '{{documentTitle}}' (version {{versionNo}}) has been signed by {{signerName}} in project {{projectName}}.",
    defaultEnabled: true,
  },
  {
    code: 'posting_exception',
    channel: 'in_app' as const,
    subjectTemplate: 'Posting exception: {{eventType}}',
    bodyTemplate:
      'A posting exception has occurred for {{eventType}} in project {{projectName}}. Reason: {{reason}}. Please investigate and resolve.',
    defaultEnabled: true,
  },
  {
    code: 'user_invited',
    channel: 'in_app' as const,
    subjectTemplate: 'Welcome to Fun Makers KSA',
    bodyTemplate:
      'You have been invited to Fun Makers KSA by {{inviterName}}. Please set your password to get started.',
    defaultEnabled: true,
  },
];

export async function seedNotificationTemplates(prisma: PrismaClient) {
  console.log('  Seeding notification templates...');
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
  console.log(`  ✓ ${TEMPLATES.length} notification templates seeded`);
}
