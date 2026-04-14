/**
 * Commercial demo data — creates coherent IPA → IPC → TaxInvoice → Collection
 * and Variation records against the flagship project (FMKSA-2026-001) so that
 * all 12 financial KPI cards render with meaningful, reconcilable values.
 *
 * Expected KPI values after this seed:
 *   Total Claimed:               7,200,000.00
 *   Total Certified:             5,850,000.00
 *   Total Invoiced:              6,727,500.00
 *   Total Collected:             2,500,000.00
 *   Open Receivable:             4,227,500.00
 *   Overdue Receivable:          1,640,000.00
 *   Collection Rate:             ~37.16%
 *   Claimed vs Certified Gap:    1,350,000.00
 *   Contract Value:             25,000,000.00
 *   Revised Contract Value:     27,500,000.00
 *   Submitted Variation Impact:  2,500,000.00
 *   Approved Variation Impact:   1,200,000.00
 */
import type { PrismaClient } from '@prisma/client';

export async function seedCommercialDemoData(prisma: PrismaClient) {
  console.log('  Seeding commercial demo data...');

  const project = await prisma.project.findUnique({ where: { code: 'FMKSA-2026-001' } });
  if (!project) {
    console.log('  ⚠ Project FMKSA-2026-001 not found — skipping commercial demo data.');
    return;
  }

  // Skip if demo data already exists (idempotent)
  const existingIpa = await prisma.ipa.findFirst({
    where: { projectId: project.id, description: 'DEMO_SEED' },
  });
  if (existingIpa) {
    console.log('  ✓ Commercial demo data already exists — skipping.');
    return;
  }

  const currency = 'SAR';
  const actor = 'seed';

  // ---------------------------------------------------------------------------
  // IPA #1 — Period 1 (approved_internal)
  // ---------------------------------------------------------------------------
  const ipa1 = await prisma.ipa.create({
    data: {
      projectId: project.id,
      status: 'approved_internal',
      periodNumber: 1,
      periodFrom: new Date('2026-02-01'),
      periodTo: new Date('2026-02-28'),
      grossAmount: 5000000,
      retentionRate: 0.10,
      retentionAmount: 500000,
      previousCertified: 0,
      currentClaim: 4500000,
      netClaimed: 4500000,
      currency,
      description: 'DEMO_SEED',
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // IPA #2 — Period 2 (approved_internal)
  // ---------------------------------------------------------------------------
  const ipa2 = await prisma.ipa.create({
    data: {
      projectId: project.id,
      status: 'approved_internal',
      periodNumber: 2,
      periodFrom: new Date('2026-03-01'),
      periodTo: new Date('2026-03-31'),
      grossAmount: 3000000,
      retentionRate: 0.10,
      retentionAmount: 300000,
      previousCertified: 4500000,
      currentClaim: 2700000,
      netClaimed: 2700000,
      currency,
      description: 'DEMO_SEED',
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // IPC #1 — from IPA #1 (signed)
  // ---------------------------------------------------------------------------
  const ipc1 = await prisma.ipc.create({
    data: {
      projectId: project.id,
      ipaId: ipa1.id,
      status: 'signed',
      certifiedAmount: 4000000,
      retentionAmount: 400000,
      netCertified: 3600000,
      certificationDate: new Date('2026-03-10'),
      currency,
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // IPC #2 — from IPA #2 (signed)
  // ---------------------------------------------------------------------------
  const ipc2 = await prisma.ipc.create({
    data: {
      projectId: project.id,
      ipaId: ipa2.id,
      status: 'signed',
      certifiedAmount: 2500000,
      retentionAmount: 250000,
      netCertified: 2250000,
      certificationDate: new Date('2026-04-05'),
      currency,
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // Tax Invoice #1 — from IPC #1 (partially collected, overdue)
  //   grossAmount: 3,600,000  |  VAT 15%: 540,000  |  total: 4,140,000
  //   dueDate: 2026-02-15 (past) — triggers overdue receivable
  // ---------------------------------------------------------------------------
  const inv1 = await prisma.taxInvoice.create({
    data: {
      projectId: project.id,
      ipcId: ipc1.id,
      status: 'partially_collected',
      invoiceNumber: 'INV-DEMO-001',
      invoiceDate: new Date('2026-03-12'),
      grossAmount: 3600000,
      vatRate: 0.15,
      vatAmount: 540000,
      totalAmount: 4140000,
      dueDate: new Date('2026-02-15'),
      currency,
      buyerName: 'Ministry of Entertainment',
      sellerTaxId: '300000000000003',
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // Tax Invoice #2 — from IPC #2 (submitted, future due date)
  //   grossAmount: 2,250,000  |  VAT 15%: 337,500  |  total: 2,587,500
  //   dueDate: 2027-03-31 (future) — NOT overdue
  // ---------------------------------------------------------------------------
  await prisma.taxInvoice.create({
    data: {
      projectId: project.id,
      ipcId: ipc2.id,
      status: 'submitted',
      invoiceNumber: 'INV-DEMO-002',
      invoiceDate: new Date('2026-04-08'),
      grossAmount: 2250000,
      vatRate: 0.15,
      vatAmount: 337500,
      totalAmount: 2587500,
      dueDate: new Date('2027-03-31'),
      currency,
      buyerName: 'Ministry of Entertainment',
      sellerTaxId: '300000000000003',
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // Invoice Collection — partial payment against Invoice #1
  //   2,500,000 of 4,140,000 collected → outstanding 1,640,000
  // ---------------------------------------------------------------------------
  await prisma.invoiceCollection.create({
    data: {
      taxInvoiceId: inv1.id,
      amount: 2500000,
      collectionDate: new Date('2026-03-25'),
      paymentMethod: 'bank_transfer',
      reference: 'PMT-DEMO-001',
      recordedBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // Variation #1 — approved VO with cost impact
  // ---------------------------------------------------------------------------
  await prisma.variation.create({
    data: {
      projectId: project.id,
      subtype: 'vo',
      status: 'approved_internal',
      title: 'Additional Lighting Package',
      description: 'Enhanced lighting for main attraction zones',
      reason: 'Client request for premium experience',
      costImpact: 1500000,
      approvedCostImpact: 1200000,
      currency,
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // Variation #2 — submitted VO, no approved cost yet
  // ---------------------------------------------------------------------------
  await prisma.variation.create({
    data: {
      projectId: project.id,
      subtype: 'vo',
      status: 'submitted',
      title: 'Extended Outdoor Canopy',
      description: 'Weather protection for outdoor event area',
      reason: 'Scope addition per site conditions',
      costImpact: 1000000,
      currency,
      createdBy: actor,
    },
  });

  console.log('  ✓ Commercial demo data seeded (2 IPAs, 2 IPCs, 2 Invoices, 1 Collection, 2 Variations)');
}
