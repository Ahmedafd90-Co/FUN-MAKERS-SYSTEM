import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  workflowTemplateService,
  DuplicateTemplateCodeError,
  TemplateNotFoundError,
} from '../../src/workflow/templates';

// ---------------------------------------------------------------------------
// Test fixtures — unique per test run to avoid cross-file interference
// ---------------------------------------------------------------------------

let testUser: { id: string };
const ts = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  await (prisma as any).$executeRaw`TRUNCATE TABLE audit_logs CASCADE`;

  testUser = await prisma.user.create({
    data: {
      email: `wf-tpl-${ts}@test.com`,
      name: 'Workflow Template Tester',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
});

afterAll(async () => {
  // Use raw SQL to clean immutable tables, then Prisma for the rest
  const ourTemplates = await prisma.workflowTemplate.findMany({
    where: { code: { contains: ts } },
    select: { id: true },
  });
  const templateIds = ourTemplates.map((t) => t.id);

  if (templateIds.length > 0) {
    // WorkflowAction is immutable — use raw SQL for cleanup
    for (const tid of templateIds) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE template_id = '${tid}')`,
      );
    }
    await prisma.workflowInstance.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.workflowStep.deleteMany({
      where: { templateId: { in: templateIds } },
    });
    await prisma.workflowTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
  }

  await prisma.user.deleteMany({
    where: { email: `wf-tpl-${ts}@test.com` },
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workflowTemplateService', () => {
  describe('createTemplate', () => {
    it('creates a template with steps in version 1', async () => {
      const template = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-1`,
        name: 'Test Approval Flow',
        recordType: 'test_record',
        config: {
          allowComment: true,
          allowReturn: true,
          allowOverride: false,
        },
        steps: [
          {
            orderIndex: 1,
            name: 'Manager Review',
            approverRule: { type: 'role', roleCode: 'project_manager' },
            slaHours: 24,
          },
          {
            orderIndex: 2,
            name: 'Director Approval',
            approverRule: { type: 'role', roleCode: 'project_director' },
            slaHours: 48,
          },
        ],
        createdBy: testUser.id,
      });

      expect(template.id).toBeDefined();
      expect(template.code).toBe(`TPL-${ts}-1`);
      expect(template.version).toBe(1);
      expect(template.isActive).toBe(true);
      expect(template.recordType).toBe('test_record');
      expect(template.steps).toHaveLength(2);
      expect(template.steps[0]!.name).toBe('Manager Review');
      expect(template.steps[1]!.name).toBe('Director Approval');
    });

    it('applies default config when not provided', async () => {
      const template = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-defaults`,
        name: 'Default Config Flow',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Step 1',
            approverRule: { type: 'role', roleCode: 'project_manager' },
          },
        ],
        createdBy: testUser.id,
      });

      const config = template.configJson as any;
      expect(config.allowComment).toBe(true);
      expect(config.allowReturn).toBe(true);
      expect(config.allowOverride).toBe(true);
    });

    it('rejects duplicate template code', async () => {
      await expect(
        workflowTemplateService.createTemplate({
          code: `TPL-${ts}-1`, // already exists
          name: 'Duplicate',
          recordType: 'test_record',
          steps: [
            {
              orderIndex: 1,
              name: 'Step 1',
              approverRule: { type: 'role', roleCode: 'test_role' },
            },
          ],
          createdBy: testUser.id,
        }),
      ).rejects.toThrow(DuplicateTemplateCodeError);
    });

    it('validates step definitions via Zod', async () => {
      await expect(
        workflowTemplateService.createTemplate({
          code: `TPL-${ts}-bad-step`,
          name: 'Bad Steps',
          recordType: 'test_record',
          steps: [
            {
              orderIndex: -1, // invalid: must be positive
              name: 'Bad Step',
              approverRule: { type: 'role', roleCode: 'test' },
            },
          ],
          createdBy: testUser.id,
        }),
      ).rejects.toThrow();
    });

    it('writes an audit log entry', async () => {
      const template = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-audit`,
        name: 'Audit Test',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Step 1',
            approverRule: { type: 'role', roleCode: 'test' },
          },
        ],
        createdBy: testUser.id,
      });

      const logs = await (prisma as any).auditLog.findMany({
        where: {
          resourceId: template.id,
          action: 'workflow_template.create',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getTemplate', () => {
    it('returns a template with steps ordered by orderIndex', async () => {
      const created = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-get`,
        name: 'Get Test',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 2,
            name: 'Second',
            approverRule: { type: 'role', roleCode: 'test' },
          },
          {
            orderIndex: 1,
            name: 'First',
            approverRule: { type: 'role', roleCode: 'test' },
          },
        ],
        createdBy: testUser.id,
      });

      const template = await workflowTemplateService.getTemplate(created.id);
      expect(template.steps[0]!.name).toBe('First');
      expect(template.steps[1]!.name).toBe('Second');
    });

    it('throws TemplateNotFoundError for non-existent ID', async () => {
      await expect(
        workflowTemplateService.getTemplate('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('updateTemplate (versioning)', () => {
    it('creates a new version and deactivates the old one', async () => {
      const v1 = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-ver`,
        name: 'Version 1',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Step A',
            approverRule: { type: 'role', roleCode: 'test' },
          },
        ],
        createdBy: testUser.id,
      });

      const v2 = await workflowTemplateService.updateTemplate(v1.id, {
        name: 'Version 2',
        steps: [
          {
            orderIndex: 1,
            name: 'Step A (updated)',
            approverRule: { type: 'role', roleCode: 'test' },
          },
          {
            orderIndex: 2,
            name: 'Step B (new)',
            approverRule: { type: 'role', roleCode: 'director' },
          },
        ],
        updatedBy: testUser.id,
      });

      expect(v2.version).toBe(2);
      expect(v2.name).toBe('Version 2');
      expect(v2.isActive).toBe(true);
      expect(v2.steps).toHaveLength(2);

      // Old version should be deactivated
      const oldTemplate = await prisma.workflowTemplate.findUnique({
        where: { id: v1.id },
      });
      expect(oldTemplate?.isActive).toBe(false);
    });

    it('preserves old steps when only updating name', async () => {
      const v1 = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-nameonly`,
        name: 'Name Only V1',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Preserved Step',
            approverRule: { type: 'role', roleCode: 'test' },
            slaHours: 24,
          },
        ],
        createdBy: testUser.id,
      });

      const v2 = await workflowTemplateService.updateTemplate(v1.id, {
        name: 'Name Only V2',
        updatedBy: testUser.id,
      });

      expect(v2.version).toBe(2);
      expect(v2.name).toBe('Name Only V2');
      expect(v2.steps).toHaveLength(1);
      expect(v2.steps[0]!.name).toBe('Preserved Step');
      expect(v2.steps[0]!.slaHours).toBe(24);
    });
  });

  describe('deactivateTemplate', () => {
    it('deactivates a template', async () => {
      const template = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-deact`,
        name: 'To Deactivate',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Step 1',
            approverRule: { type: 'role', roleCode: 'test' },
          },
        ],
        createdBy: testUser.id,
      });

      const deactivated = await workflowTemplateService.deactivateTemplate(
        template.id,
        testUser.id,
      );

      expect(deactivated.isActive).toBe(false);
    });

    it('throws for non-existent template', async () => {
      await expect(
        workflowTemplateService.deactivateTemplate(
          '00000000-0000-0000-0000-000000000000',
          testUser.id,
        ),
      ).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('listTemplates', () => {
    it('lists active templates filtered by recordType', async () => {
      const list = await workflowTemplateService.listTemplates({
        recordType: 'test_record',
        isActive: true,
      });

      expect(list.length).toBeGreaterThan(0);
      for (const t of list) {
        expect(t.recordType).toBe('test_record');
        expect(t.isActive).toBe(true);
      }
    });

    it('returns the most recent version per code', async () => {
      const list = await workflowTemplateService.listTemplates({
        recordType: 'test_record',
      });

      // Check no two templates have the same original code
      const codes = list.map((t) => t.code.replace(/__v\d+$/, ''));
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });
  });

  describe('findActiveByCode', () => {
    it('finds the active version of a template by code', async () => {
      const created = await workflowTemplateService.createTemplate({
        code: `TPL-${ts}-find`,
        name: 'Find Test',
        recordType: 'test_record',
        steps: [
          {
            orderIndex: 1,
            name: 'Step 1',
            approverRule: { type: 'role', roleCode: 'test' },
          },
        ],
        createdBy: testUser.id,
      });

      const found = await workflowTemplateService.findActiveByCode(`TPL-${ts}-find`);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for non-existent code', async () => {
      const found = await workflowTemplateService.findActiveByCode('NONEXISTENT-CODE');
      expect(found).toBeNull();
    });
  });
});
