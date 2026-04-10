/**
 * Tests for notification template rendering — Task 1.8.1
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { renderTemplate, NotificationTemplateNotFoundError, TemplateRenderError } from '../../src/notifications/templates';

describe('renderTemplate', () => {
  beforeAll(async () => {
    // Ensure a test-specific template exists for error testing
    // The seeded templates are used for happy-path tests
  });

  describe('happy path', () => {
    it('renders workflow_step_assigned with correct subject and body', async () => {
      const result = await renderTemplate('workflow_step_assigned', {
        stepName: 'CFO Approval',
        recordType: 'Purchase Order',
        recordRef: 'PO-001',
        projectName: 'FMKSA Demo',
      });

      expect(result.subject).toBe('New approval waiting: CFO Approval');
      expect(result.body).toContain('CFO Approval');
      expect(result.body).toContain('Purchase Order');
      expect(result.body).toContain('PO-001');
    });

    it('renders workflow_approved with correct subject', async () => {
      const result = await renderTemplate('workflow_approved', {
        recordType: 'Purchase Order',
        recordRef: 'PO-002',
        actorName: 'Ahmed',
        projectName: 'Test Project',
      });

      expect(result.subject).toBe('Purchase Order PO-002 approved');
      expect(result.body).toContain('Purchase Order');
      expect(result.body).toContain('PO-002');
    });

    it('renders workflow_rejected with comment', async () => {
      const result = await renderTemplate('workflow_rejected', {
        recordType: 'Invoice',
        recordRef: 'INV-123',
        actorName: 'Manager',
        projectName: 'Project Alpha',
        comment: 'Missing documentation',
      });

      expect(result.subject).toBe('Invoice INV-123 rejected');
      expect(result.body).toContain('Missing documentation');
    });

    it('renders document_signed', async () => {
      const result = await renderTemplate('document_signed', {
        documentTitle: 'Contract Rev A',
        versionNo: '2',
        signerName: 'Ahmed',
        projectName: 'Project Beta',
      });

      expect(result.subject).toBe('Document signed: Contract Rev A');
    });

    it('renders posting_exception', async () => {
      const result = await renderTemplate('posting_exception', {
        eventType: 'JE_POSTING',
        projectName: 'Demo',
        reason: 'Amount mismatch',
      });

      expect(result.subject).toBe('Posting exception: JE_POSTING');
    });

    it('renders user_invited', async () => {
      const result = await renderTemplate('user_invited', {
        inviterName: 'Admin',
      });

      expect(result.subject).toBe('Welcome to Fun Makers KSA');
    });

    it('handles missing payload variables gracefully (Handlebars renders empty string)', async () => {
      const result = await renderTemplate('workflow_step_assigned', {});
      // Handlebars renders undefined vars as empty string
      expect(result.subject).toBe('New approval waiting: ');
    });
  });

  describe('error cases', () => {
    it('throws NotificationTemplateNotFoundError for unknown template code', async () => {
      await expect(
        renderTemplate('non_existent_template_xyz', {}),
      ).rejects.toThrow(NotificationTemplateNotFoundError);
    });

    it('NotificationTemplateNotFoundError has the correct message', async () => {
      await expect(
        renderTemplate('non_existent_template_xyz', {}),
      ).rejects.toThrow('non_existent_template_xyz');
    });

    it('throws TemplateRenderError on invalid Handlebars syntax', async () => {
      // Inject a broken template directly in DB for this test
      const brokenCode = `broken-template-${Date.now()}`;
      await prisma.notificationTemplate.create({
        data: {
          code: brokenCode,
          channel: 'in_app',
          subjectTemplate: '{{#if}}invalid{{/if}}',
          bodyTemplate: '{{#if}}invalid{{/if}}',
          defaultEnabled: true,
        },
      });

      try {
        await expect(
          renderTemplate(brokenCode, {}),
        ).rejects.toThrow(TemplateRenderError);
      } finally {
        await prisma.notificationTemplate.delete({ where: { code: brokenCode } });
      }
    });
  });
});
