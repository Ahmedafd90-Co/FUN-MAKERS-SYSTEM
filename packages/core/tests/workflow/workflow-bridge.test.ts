import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow/instances';
import { clearHandlers } from '../../src/workflow/events';
import { transitionRfq } from '../../src/procurement/rfq/service';
import { transitionIpa } from '../../src/commercial/ipa/service';

// ---------------------------------------------------------------------------
// Test fixtures — unique per test run to avoid cross-file interference
// ---------------------------------------------------------------------------

let testUser: { id: string };
let testRole: { id: string; code: string };
let testEntity: { id: string };
let testProject: { id: string };
const ts = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Workflow template codes
const rfqTemplateCode = 'rfq-review';
const ipaTemplateCode = 'ipa-review';

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `wf-bridge-${ts}@test.com`,
      name: 'Bridge Test User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });

  testRole = await prisma.role.create({
    data: {
      code: `BRIDGE-ROLE-${ts}`,
      name: 'Bridge Test Role',
      isSystem: false,
    },
  });

  await prisma.userRole.create({
    data: {
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser.id,
      assignedAt: new Date(),
    },
  });

  testEntity = await prisma.entity.create({
    data: {
      code: `ENT-BRIDGE-${ts}`,
      name: 'Bridge Test Entity',
      type: 'parent',
      status: 'active',
    },
  });

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: '\uFDFC', decimalPlaces: 2 },
    update: {},
  });

  testProject = await prisma.project.create({
    data: {
      code: `PROJ-BRIDGE-${ts}`,
      name: 'Bridge Test Project',
      entityId: testEntity.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: testUser.id,
      status: 'active',
    },
  });

  await prisma.projectAssignment.create({
    data: {
      projectId: testProject.id,
      userId: testUser.id,
      roleId: testRole.id,
      effectiveFrom: new Date('2020-01-01'),
      assignedBy: testUser.id,
      assignedAt: new Date(),
    },
  });

  // Create workflow templates for RFQ and IPA review
  // Deactivate any existing templates with these codes first (from prior test runs)
  const existingRfq = await prisma.workflowTemplate.findMany({
    where: { code: rfqTemplateCode, isActive: true },
  });
  for (const t of existingRfq) {
    await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
  }

  const existingIpa = await prisma.workflowTemplate.findMany({
    where: { code: ipaTemplateCode, isActive: true },
  });
  for (const t of existingIpa) {
    await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
  }

  const rfqTpl = await workflowTemplateService.createTemplate({
    code: rfqTemplateCode,
    name: 'RFQ Review Workflow',
    recordType: 'rfq',
    config: { allowComment: true, allowReturn: true, allowOverride: false },
    steps: [
      {
        orderIndex: 1,
        name: 'Procurement Review',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 24,
      },
    ],
    createdBy: testUser.id,
  });
  // Templates are created as draft — must explicitly activate
  await workflowTemplateService.activateTemplate(rfqTpl.id, testUser.id);

  const ipaTpl = await workflowTemplateService.createTemplate({
    code: ipaTemplateCode,
    name: 'IPA Review Workflow',
    recordType: 'ipa',
    config: { allowComment: true, allowReturn: true, allowOverride: false },
    steps: [
      {
        orderIndex: 1,
        name: 'Commercial Review',
        approverRule: { type: 'role', roleCode: testRole.code },
        slaHours: 48,
      },
    ],
    createdBy: testUser.id,
  });
  // Templates are created as draft — must explicitly activate
  await workflowTemplateService.activateTemplate(ipaTpl.id, testUser.id);
});

beforeEach(() => {
  clearHandlers();
});

afterAll(async () => {
  // Clean up workflow data
  const ourTemplates = await prisma.workflowTemplate.findMany({
    where: {
      OR: [
        { code: rfqTemplateCode, createdBy: testUser.id },
        { code: ipaTemplateCode, createdBy: testUser.id },
      ],
    },
    select: { id: true },
  });
  const templateIds = ourTemplates.map((t) => t.id);

  if (templateIds.length > 0) {
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

  // Clean up RFQs and IPAs
  await (prisma as any).rFQItem.deleteMany({
    where: { rfq: { projectId: testProject.id } },
  });
  await (prisma as any).rFQVendor.deleteMany({
    where: { rfq: { projectId: testProject.id } },
  });
  await (prisma as any).rFQ.deleteMany({
    where: { projectId: testProject.id },
  });
  await prisma.ipa.deleteMany({
    where: { projectId: testProject.id },
  });

  await prisma.projectAssignment.deleteMany({
    where: { projectId: testProject.id },
  });
  await prisma.project.deleteMany({ where: { code: `PROJ-BRIDGE-${ts}` } });
  await prisma.entity.deleteMany({ where: { code: `ENT-BRIDGE-${ts}` } });
  await prisma.userRole.deleteMany({ where: { roleId: testRole.id } });
  await prisma.role.deleteMany({ where: { code: `BRIDGE-ROLE-${ts}` } });
  await prisma.user.deleteMany({ where: { email: `wf-bridge-${ts}@test.com` } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Workflow Bridge', () => {
  describe('RFQ transition → workflow instance', () => {
    it('creates a workflow instance when submitting an RFQ (draft → under_review)', async () => {
      // Create an RFQ in draft status
      const rfq = await (prisma as any).rFQ.create({
        data: {
          projectId: testProject.id,
          rfqNumber: `RFQ-BRIDGE-${ts}-1`,
          title: 'Bridge Test RFQ',
          currency: 'SAR',
          status: 'draft',
          createdBy: testUser.id,
        },
      });

      // Transition: submit (draft → under_review)
      await transitionRfq(rfq.id, 'submit', testUser.id);

      // Verify workflow instance was created
      const instance = await workflowInstanceService.getInstanceByRecord('rfq', rfq.id);
      expect(instance).not.toBeNull();
      expect(instance!.status).toBe('in_progress');
      expect(instance!.recordType).toBe('rfq');
      expect(instance!.recordId).toBe(rfq.id);
    });

    it('succeeds even when no rfq template exists (graceful)', async () => {
      // Deactivate ALL active rfq templates (test + real) so resolveTemplateCode returns null
      const activeTemplates = await prisma.workflowTemplate.findMany({
        where: { recordType: 'rfq', isActive: true },
      });
      for (const t of activeTemplates) {
        await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
      }

      try {
        const rfq = await (prisma as any).rFQ.create({
          data: {
            projectId: testProject.id,
            rfqNumber: `RFQ-BRIDGE-${ts}-2`,
            title: 'Bridge Test RFQ No Template',
            currency: 'SAR',
            status: 'draft',
            createdBy: testUser.id,
          },
        });

        // Transition should succeed despite no active template
        const updated = await transitionRfq(rfq.id, 'submit', testUser.id);
        expect(updated.status).toBe('under_review');

        // No workflow instance should exist
        const instance = await workflowInstanceService.getInstanceByRecord('rfq', rfq.id);
        expect(instance).toBeNull();
      } finally {
        // Re-activate templates
        for (const t of activeTemplates) {
          await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: true } });
        }
      }
    });
  });

  describe('IPA transition → workflow instance', () => {
    it('creates a workflow instance when submitting an IPA (draft → submitted)', async () => {
      const ipa = await prisma.ipa.create({
        data: {
          projectId: testProject.id,
          status: 'draft',
          periodNumber: 1,
          periodFrom: new Date('2026-01-01'),
          periodTo: new Date('2026-01-31'),
          grossAmount: 100000,
          retentionRate: 0.10,
          retentionAmount: 10000,
          previousCertified: 0,
          currentClaim: 90000,
          netClaimed: 90000,
          currency: 'SAR',
          createdBy: testUser.id,
        },
      });

      await transitionIpa(ipa.id, 'submit', testUser.id);

      const instance = await workflowInstanceService.getInstanceByRecord('ipa', ipa.id);
      expect(instance).not.toBeNull();
      expect(instance!.status).toBe('in_progress');
      expect(instance!.recordType).toBe('ipa');
      expect(instance!.recordId).toBe(ipa.id);
    });

    it('succeeds even when no ipa template exists (graceful)', async () => {
      // Deactivate ALL active ipa templates (test + real) so resolveTemplateCode returns null
      const activeTemplates = await prisma.workflowTemplate.findMany({
        where: { recordType: 'ipa', isActive: true },
      });
      for (const t of activeTemplates) {
        await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
      }

      try {
        const ipa = await prisma.ipa.create({
          data: {
            projectId: testProject.id,
            status: 'draft',
            periodNumber: 2,
            periodFrom: new Date('2026-02-01'),
            periodTo: new Date('2026-02-28'),
            grossAmount: 50000,
            retentionRate: 0.10,
            retentionAmount: 5000,
            previousCertified: 90000,
            currentClaim: 45000,
            netClaimed: 45000,
            currency: 'SAR',
            createdBy: testUser.id,
          },
        });

        const updated = await transitionIpa(ipa.id, 'submit', testUser.id);
        expect(updated.status).toBe('submitted');

        const instance = await workflowInstanceService.getInstanceByRecord('ipa', ipa.id);
        expect(instance).toBeNull();
      } finally {
        for (const t of activeTemplates) {
          await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: true } });
        }
      }
    });
  });

  describe('getInstanceByRecord', () => {
    it('returns the workflow instance for a known (recordType, recordId)', async () => {
      // Create a fresh RFQ and transition it to trigger workflow creation
      const rfq = await (prisma as any).rFQ.create({
        data: {
          projectId: testProject.id,
          rfqNumber: `RFQ-BRIDGE-${ts}-3`,
          title: 'Bridge Test RFQ Lookup',
          currency: 'SAR',
          status: 'draft',
          createdBy: testUser.id,
        },
      });

      await transitionRfq(rfq.id, 'submit', testUser.id);

      const instance = await workflowInstanceService.getInstanceByRecord('rfq', rfq.id);
      expect(instance).not.toBeNull();
      expect(instance!.template).toBeDefined();
      expect(instance!.template.steps.length).toBeGreaterThan(0);
      expect(instance!.actions.length).toBeGreaterThan(0);
      expect(instance!.currentStep).toBeDefined();
      expect(instance!.slaInfo).toBeDefined();
      // Verify actor resolution
      const startAction = instance!.actions.find((a) => a.action === 'started');
      expect(startAction).toBeDefined();
      expect((startAction as any).actor).toBeDefined();
      expect((startAction as any).actor.name).toBe('Bridge Test User');
    });

    it('returns null for unknown records', async () => {
      const instance = await workflowInstanceService.getInstanceByRecord(
        'rfq',
        '00000000-0000-0000-0000-000000000000',
      );
      expect(instance).toBeNull();
    });
  });
});
