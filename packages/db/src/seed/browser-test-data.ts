/**
 * Browser Test Data Seed
 *
 * Creates coherent linked test data in the Al Yamamah project for
 * browser-proving: workflow handoff, procurement transitions, budget
 * absorption, exception generation, and KPI refresh.
 *
 * Run: DATABASE_URL=... npx tsx packages/db/src/seed/browser-test-data.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'a009bb56-7bee-4590-aff4-6083e72ce574'; // Al Yamamah
const ENTITY_ID = '1372c1ea-3266-4057-a0e4-cf9ed751b59e'; // FMKSA-OPS
const AHMED_ID = '4d1acf74-dcec-4b8f-881d-8e2638f7d5bf';
const BUDGET_ID = '0ac2b769-31d7-4481-9daf-047fed7f2a3a';
const MATERIALS_BUDGET_CAT_ID = '461900d0-687f-48fb-8ab9-7a9a73eaf127'; // code: "materials"
const EQUIPMENT_BUDGET_CAT_ID = '09f405cd-67f2-40cc-9189-834e0861d455'; // code: "equipment_and_plant"

export async function seedBrowserTestData() {
  console.log('🔧 Seeding browser test data...');

  // ─── 1. Procurement Category matching budget category "materials" ───
  const procCat = await prisma.procurementCategory.upsert({
    where: { entityId_code: { entityId: ENTITY_ID, code: 'materials' } },
    update: {},
    create: {
      entityId: ENTITY_ID,
      code: 'materials',
      name: 'Materials',
      level: 'category',
    },
  });
  console.log('  ✓ ProcurementCategory "materials":', procCat.id);

  // A second one for equipment — to test a different mapping
  const procCatEquip = await prisma.procurementCategory.upsert({
    where: { entityId_code: { entityId: ENTITY_ID, code: 'equipment_and_plant' } },
    update: {},
    create: {
      entityId: ENTITY_ID,
      code: 'equipment_and_plant',
      name: 'Equipment and Plant',
      level: 'category',
    },
  });
  console.log('  ✓ ProcurementCategory "equipment_and_plant":', procCatEquip.id);

  // ─── 2. Vendor ───
  const vendor = await prisma.vendor.upsert({
    where: { entityId_vendorCode: { entityId: ENTITY_ID, vendorCode: 'VND-RAJHI-001' } },
    update: {},
    create: {
      entityId: ENTITY_ID,
      vendorCode: 'VND-RAJHI-001',
      name: 'Al Rajhi Construction Co.',
      tradeName: 'Al Rajhi Contracting',
      status: 'active',
      contactName: 'Mohammed Al-Rajhi',
      contactEmail: 'procurement@alrajhi-construction.sa',
      contactPhone: '+966-11-555-1234',
      city: 'Riyadh',
      country: 'SA',
      classification: 'A',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Vendor "Al Rajhi Construction Co.":', vendor.id);

  // ─── 3. Update budget lines to have meaningful budgets ───
  // Materials already has 1,000,000 — update equipment_and_plant too
  await prisma.budgetLine.updateMany({
    where: { budgetId: BUDGET_ID, categoryId: EQUIPMENT_BUDGET_CAT_ID },
    data: { budgetAmount: new Prisma.Decimal('200000') },
  });
  console.log('  ✓ Budget lines updated (materials=1M, equipment=200K)');

  // ─── 4. Workflow templates with Ahmed as direct user approver ───
  // These are simple 1-step templates for browser testing

  const ipaTemplate = await upsertTemplate('ipa_browser_test', 'IPA Browser Test', 'ipa', [
    { orderIndex: 10, name: 'Ahmed Review', approverRule: { type: 'user', userId: AHMED_ID } },
  ]);
  console.log('  ✓ WF Template IPA:', ipaTemplate.id);

  const ipcTemplate = await upsertTemplate('ipc_browser_test', 'IPC Browser Test', 'ipc', [
    { orderIndex: 10, name: 'Ahmed Review', approverRule: { type: 'user', userId: AHMED_ID } },
  ]);
  console.log('  ✓ WF Template IPC:', ipcTemplate.id);

  const varTemplate = await upsertTemplate('variation_browser_test', 'Variation Browser Test', 'variation', [
    { orderIndex: 10, name: 'Ahmed Review', approverRule: { type: 'user', userId: AHMED_ID } },
  ]);
  console.log('  ✓ WF Template Variation:', varTemplate.id);

  const corrTemplate = await upsertTemplate('correspondence_browser_test', 'Correspondence Browser Test', 'correspondence', [
    { orderIndex: 10, name: 'Ahmed Review', approverRule: { type: 'user', userId: AHMED_ID } },
  ]);
  console.log('  ✓ WF Template Correspondence:', corrTemplate.id);

  // ─── 5. Create project-level template overrides ───
  // The workflow resolution checks ProjectSetting for template overrides
  // We need to ensure these templates are used for the Al Yamamah project
  await upsertProjectSetting(PROJECT_ID, 'workflow_template:ipa', ipaTemplate.code);
  await upsertProjectSetting(PROJECT_ID, 'workflow_template:ipc', ipcTemplate.code);
  await upsertProjectSetting(PROJECT_ID, 'workflow_template:variation', varTemplate.code);
  await upsertProjectSetting(PROJECT_ID, 'workflow_template:correspondence', corrTemplate.code);
  console.log('  ✓ Project workflow settings assigned');

  // ─── 6. Draft IPA ───
  const ipa = await prisma.ipa.upsert({
    where: { projectId_periodNumber: { projectId: PROJECT_ID, periodNumber: 3 } },
    update: {},
    create: {
      projectId: PROJECT_ID,
      status: 'draft',
      periodNumber: 3,
      periodFrom: new Date('2026-04-01'),
      periodTo: new Date('2026-04-30'),
      grossAmount: new Prisma.Decimal('150000'),
      retentionRate: new Prisma.Decimal('0.10'),
      retentionAmount: new Prisma.Decimal('15000'),
      previousCertified: new Prisma.Decimal('6300000'),
      currentClaim: new Prisma.Decimal('150000'),
      netClaimed: new Prisma.Decimal('135000'),
      currency: 'SAR',
      description: 'Period 3 claim for April 2026 — stage lighting and audio rig installation',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ IPA Period 3 (draft):', ipa.id);

  // ─── 7. Draft IPC linked to IPA ───
  const ipc = await prisma.ipc.upsert({
    where: { id: '00000000-0000-0000-0000-000000000901' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000901',
      projectId: PROJECT_ID,
      ipaId: ipa.id,
      status: 'draft',
      certifiedAmount: new Prisma.Decimal('120000'),
      retentionAmount: new Prisma.Decimal('12000'),
      netCertified: new Prisma.Decimal('108000'),
      certificationDate: new Date('2026-04-15'),
      currency: 'SAR',
      remarks: 'Certified at 80% of claimed value — retention of partial scope pending',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ IPC (draft):', ipc.id);

  // ─── 8. Draft Variation ───
  const variation = await prisma.variation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000902' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000902',
      projectId: PROJECT_ID,
      subtype: 'vo',
      status: 'draft',
      title: 'Additional Fire Suppression System',
      description: 'Client-requested addition of FM-200 fire suppression system in server room and main control area.',
      reason: 'Client safety audit identified gap in fire protection for critical infrastructure zones.',
      costImpact: new Prisma.Decimal('75000'),
      timeImpactDays: 14,
      initiatedBy: 'client',
      currency: 'SAR',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Variation (draft):', variation.id);

  // ─── 9. Draft Correspondence (claim) ───
  const corr = await prisma.correspondence.upsert({
    where: { id: '00000000-0000-0000-0000-000000000903' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000903',
      projectId: PROJECT_ID,
      subtype: 'claim',
      status: 'draft',
      subject: 'Extension of Time Claim — April 2026 Delay',
      body: 'We hereby submit our claim for an extension of time of 21 calendar days due to unforeseen ground conditions encountered during the foundation works for the main pavilion structure.',
      recipientName: 'Al Yamamah Development Authority',
      recipientOrg: 'AYDA',
      claimType: 'time_and_cost',
      claimedAmount: new Prisma.Decimal('45000'),
      claimedTimeDays: 21,
      contractClause: 'GCC Clause 44.1 — Extensions of Time',
      currency: 'SAR',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Correspondence claim (draft):', corr.id);

  // ─── 10. Purchase Order — with valid category (materials) ───
  const po = await prisma.purchaseOrder.upsert({
    where: { poNumber: 'PO-AY-2026-001' },
    update: {},
    create: {
      projectId: PROJECT_ID,
      vendorId: vendor.id,
      poNumber: 'PO-AY-2026-001',
      title: 'Stage Lighting Trusses — Main Pavilion',
      description: 'Supply and delivery of 24x aluminium stage lighting trusses (12m span) including hardware and mounting brackets.',
      totalAmount: new Prisma.Decimal('80000'),
      currency: 'SAR',
      status: 'draft',
      categoryId: procCat.id, // materials — maps to BudgetCategory "materials"
      deliveryDate: new Date('2026-05-15'),
      paymentTerms: 'Net 30',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ PO (draft, with category):', po.id);

  // ─── 11. Purchase Order — WITHOUT category (for exception test) ───
  const poNoCat = await prisma.purchaseOrder.upsert({
    where: { poNumber: 'PO-AY-2026-002' },
    update: {},
    create: {
      projectId: PROJECT_ID,
      vendorId: vendor.id,
      poNumber: 'PO-AY-2026-002',
      title: 'Miscellaneous Event Supplies',
      description: 'Various event production supplies — no procurement category assigned.',
      totalAmount: new Prisma.Decimal('5000'),
      currency: 'SAR',
      status: 'draft',
      categoryId: null, // intentionally null — will trigger exception
      deliveryDate: new Date('2026-05-20'),
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ PO (draft, NO category):', poNoCat.id);

  // ─── 12. Supplier Invoice linked to PO ───
  const si = await prisma.supplierInvoice.upsert({
    where: { id: '00000000-0000-0000-0000-000000000904' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000904',
      projectId: PROJECT_ID,
      vendorId: vendor.id,
      purchaseOrderId: po.id,
      invoiceNumber: 'INV-RAJHI-2026-042',
      invoiceDate: new Date('2026-04-20'),
      dueDate: new Date('2026-05-20'),
      grossAmount: new Prisma.Decimal('80000'),
      vatRate: new Prisma.Decimal('0.15'),
      vatAmount: new Prisma.Decimal('12000'),
      totalAmount: new Prisma.Decimal('92000'),
      currency: 'SAR',
      categoryId: procCat.id,
      status: 'received',
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Supplier Invoice (received):', si.id);

  // ─── 13. Expense ───
  const expense = await prisma.expense.upsert({
    where: { id: '00000000-0000-0000-0000-000000000905' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000905',
      projectId: PROJECT_ID,
      subtype: 'equipment',
      title: 'Generator Rental — Load Test Week',
      description: 'Rental of 250kVA mobile generator for full load testing of stage power systems.',
      amount: new Prisma.Decimal('3500'),
      currency: 'SAR',
      expenseDate: new Date('2026-04-10'),
      status: 'draft',
      categoryId: procCatEquip.id, // equipment — maps to BudgetCategory "equipment_and_plant"
      equipmentName: '250kVA Mobile Generator',
      equipmentType: 'Power Generation',
      rentalPeriodFrom: new Date('2026-04-10'),
      rentalPeriodTo: new Date('2026-04-17'),
      dailyRate: new Prisma.Decimal('500'),
      days: 7,
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Expense (draft):', expense.id);

  // ─── 14. Credit Note linked to SI ───
  const cn = await prisma.creditNote.upsert({
    where: { creditNoteNumber: 'CN-RAJHI-2026-003' },
    update: {},
    create: {
      projectId: PROJECT_ID,
      vendorId: vendor.id,
      subtype: 'credit_note',
      creditNoteNumber: 'CN-RAJHI-2026-003',
      amount: new Prisma.Decimal('5000'),
      currency: 'SAR',
      reason: 'Credit for damaged lighting truss section — 2x brackets replaced under warranty.',
      receivedDate: new Date('2026-04-22'),
      status: 'received',
      supplierInvoiceId: si.id,
      purchaseOrderId: po.id,
      createdBy: AHMED_ID,
    },
  });
  console.log('  ✓ Credit Note (received):', cn.id);

  console.log('\n✅ Browser test data seeded successfully.');
  console.log('\nSummary:');
  console.log('  Project: Al Yamamah Entertainment Complex');
  console.log('  Vendor: Al Rajhi Construction Co.');
  console.log('  IPA Period 3 (draft):', ipa.id);
  console.log('  IPC (draft):', ipc.id);
  console.log('  Variation (draft):', variation.id);
  console.log('  Correspondence (draft):', corr.id);
  console.log('  PO with category (draft):', po.id);
  console.log('  PO without category (draft):', poNoCat.id);
  console.log('  Supplier Invoice (received):', si.id);
  console.log('  Expense (draft):', expense.id);
  console.log('  Credit Note (received):', cn.id);
  console.log('  Budget: materials=1M, equipment_and_plant=200K');
  console.log('  Workflow templates: 4 (IPA, IPC, Variation, Correspondence) → Ahmed as approver');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertTemplate(
  code: string,
  name: string,
  recordType: string,
  steps: Array<{ orderIndex: number; name: string; approverRule: Record<string, unknown> }>,
) {
  // Delete existing steps and template if they exist (to handle re-runs cleanly)
  const existing = await prisma.workflowTemplate.findUnique({ where: { code } });
  if (existing) {
    await prisma.workflowStep.deleteMany({ where: { templateId: existing.id } });
    await prisma.workflowTemplate.delete({ where: { id: existing.id } });
  }

  return prisma.workflowTemplate.create({
    data: {
      code,
      name,
      recordType,
      version: 1,
      isActive: true,
      configJson: {},
      createdBy: AHMED_ID,
      steps: {
        create: steps.map((s) => ({
          orderIndex: s.orderIndex,
          name: s.name,
          approverRuleJson: s.approverRule,
          outcomeType: 'approve',
        })),
      },
    },
    include: { steps: true },
  });
}

async function upsertProjectSetting(projectId: string, key: string, templateCode: string) {
  await prisma.projectSetting.upsert({
    where: { projectId_key: { projectId, key } },
    update: { valueJson: templateCode, updatedAt: new Date(), updatedBy: AHMED_ID },
    create: { projectId, key, valueJson: templateCode, updatedAt: new Date(), updatedBy: AHMED_ID },
  });
}

// ---------------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------------

seedBrowserTestData()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  });
