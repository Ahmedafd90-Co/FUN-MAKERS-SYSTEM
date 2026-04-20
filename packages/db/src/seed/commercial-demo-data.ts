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
 *
 * Forecast (plan of record):
 *   Period 1:  4,500,000.00   (actual 4,500,000 — on plan)
 *   Period 2:  3,000,000.00   (actual 2,700,000 — behind by 300,000)
 *   Period 3:  3,500,000.00   (no actual yet — current month)
 *   Total Forecasted IPA:          11,000,000.00
 *   Actual IPA Achieved:            7,200,000.00
 *   Variance vs Forecast:          -3,800,000.00 (behind)
 */
import type { PrismaClient } from '@prisma/client';

export async function seedCommercialDemoData(prisma: PrismaClient) {
  console.log('  Seeding commercial demo data...');

  const project = await prisma.project.findUnique({ where: { code: 'FMKSA-2026-001' } });
  if (!project) {
    console.log('  ⚠ Project FMKSA-2026-001 not found — skipping commercial demo data.');
    return;
  }

  // Resolve a real admin user id for `createdBy` so seeded records don't
  // attribute authorship to the literal string 'seed' in the UI.
  const admin = await prisma.user.findUnique({
    where: { email: 'ahmedafd90@gmail.com' },
  });
  if (!admin) {
    console.log('  ⚠ Master admin not found — skipping commercial demo data.');
    return;
  }

  // Idempotency — new anchor is the reserved `referenceNumber` IPA-DEMO-001
  // (operator-invisible, globally unique). Also honour the legacy
  // `description: 'DEMO_SEED'` anchor so databases seeded before this change
  // are treated as already-seeded and we don't duplicate rows.
  const existingByRef = await prisma.ipa.findFirst({
    where: { projectId: project.id, referenceNumber: 'IPA-DEMO-001' },
  });
  const existingByLegacyAnchor = existingByRef
    ? null
    : await prisma.ipa.findFirst({
        where: { projectId: project.id, description: 'DEMO_SEED' },
      });
  if (existingByRef || existingByLegacyAnchor) {
    console.log('  ✓ Commercial demo data already exists — skipping.');
    return;
  }

  const currency = 'SAR';
  const actor = admin.id;

  // ---------------------------------------------------------------------------
  // IPA #1 — Period 1 (approved_internal)
  // ---------------------------------------------------------------------------
  const ipa1 = await prisma.ipa.create({
    data: {
      projectId: project.id,
      referenceNumber: 'IPA-DEMO-001',
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
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // IPA #2 — Period 2 (approved_internal)
  // ---------------------------------------------------------------------------
  const ipa2 = await prisma.ipa.create({
    data: {
      projectId: project.id,
      referenceNumber: 'IPA-DEMO-002',
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
      createdBy: actor,
    },
  });

  // ---------------------------------------------------------------------------
  // IPC #1 — from IPA #1 (signed)
  // ---------------------------------------------------------------------------
  const ipc1 = await prisma.ipc.create({
    data: {
      projectId: project.id,
      referenceNumber: 'IPC-DEMO-001',
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
      referenceNumber: 'IPC-DEMO-002',
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
  const var1 = await prisma.variation.create({
    data: {
      projectId: project.id,
      referenceNumber: 'VAR-DEMO-001',
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
      referenceNumber: 'VAR-DEMO-002',
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

  // ---------------------------------------------------------------------------
  // Posting events — emit one canonical PostingEvent for each approved record
  // so the /home and audit ledgers reconcile with the detail pages.
  //
  // Idempotency keys use the `demo-…-${recordId}` convention (distinct from
  // the `e2e-demo-…` keys used in e2e-demo.ts) so both seeds can coexist
  // without colliding on `posting_events.idempotency_key`.
  // ---------------------------------------------------------------------------
  const { entityId } = project;

  await prisma.postingEvent.create({
    data: {
      eventType: 'IPA_APPROVED',
      sourceService: 'commercial',
      sourceRecordType: 'ipa',
      sourceRecordId: ipa1.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-ipa-approved-${ipa1.id}`,
      payloadJson: {
        ipaId: ipa1.id,
        periodNumber: 1,
        grossAmount: '5000000.00',
        retentionAmount: '500000.00',
        netClaimed: '4500000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-03-02'),
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'IPA_APPROVED',
      sourceService: 'commercial',
      sourceRecordType: 'ipa',
      sourceRecordId: ipa2.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-ipa-approved-${ipa2.id}`,
      payloadJson: {
        ipaId: ipa2.id,
        periodNumber: 2,
        grossAmount: '3000000.00',
        retentionAmount: '300000.00',
        netClaimed: '2700000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-02'),
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'IPC_SIGNED',
      sourceService: 'commercial',
      sourceRecordType: 'ipc',
      sourceRecordId: ipc1.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-ipc-signed-${ipc1.id}`,
      payloadJson: {
        ipcId: ipc1.id,
        ipaId: ipa1.id,
        certifiedAmount: '4000000.00',
        retentionAmount: '400000.00',
        netCertified: '3600000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-03-10'),
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'IPC_SIGNED',
      sourceService: 'commercial',
      sourceRecordType: 'ipc',
      sourceRecordId: ipc2.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-ipc-signed-${ipc2.id}`,
      payloadJson: {
        ipcId: ipc2.id,
        ipaId: ipa2.id,
        certifiedAmount: '2500000.00',
        retentionAmount: '250000.00',
        netCertified: '2250000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-05'),
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'TAX_INVOICE_ISSUED',
      sourceService: 'commercial',
      sourceRecordType: 'tax_invoice',
      sourceRecordId: inv1.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-tax-invoice-issued-${inv1.id}`,
      payloadJson: {
        taxInvoiceId: inv1.id,
        ipcId: ipc1.id,
        invoiceNumber: 'INV-DEMO-001',
        grossAmount: '3600000.00',
        vatAmount: '540000.00',
        totalAmount: '4140000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-03-12'),
    },
  });

  // Tax invoice #2 — fetch by invoice number to get its id
  const inv2 = await prisma.taxInvoice.findFirst({
    where: { projectId: project.id, invoiceNumber: 'INV-DEMO-002' },
    select: { id: true },
  });
  if (inv2) {
    await prisma.postingEvent.create({
      data: {
        eventType: 'TAX_INVOICE_ISSUED',
        sourceService: 'commercial',
        sourceRecordType: 'tax_invoice',
        sourceRecordId: inv2.id,
        projectId: project.id,
        entityId,
        idempotencyKey: `demo-tax-invoice-issued-${inv2.id}`,
        payloadJson: {
          taxInvoiceId: inv2.id,
          ipcId: ipc2.id,
          invoiceNumber: 'INV-DEMO-002',
          grossAmount: '2250000.00',
          vatAmount: '337500.00',
          totalAmount: '2587500.00',
          currency,
          projectId: project.id,
        },
        status: 'posted',
        origin: 'live',
        postedAt: new Date('2026-04-08'),
      },
    });
  }

  await prisma.postingEvent.create({
    data: {
      eventType: 'VARIATION_APPROVED_INTERNAL',
      sourceService: 'commercial',
      sourceRecordType: 'variation',
      sourceRecordId: var1.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `demo-variation-approved-internal-${var1.id}`,
      payloadJson: {
        variationId: var1.id,
        subtype: 'vo',
        costImpact: '1500000.00',
        approvedCostImpact: '1200000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-06'),
    },
  });

  // ---------------------------------------------------------------------------
  // IPA Forecast — per-period plan of record
  //
  // Three periods seeded. Pairs with the two existing IPAs to demonstrate
  // variance in both directions plus a forward-looking period with no actual.
  //   Period 1 (Feb): forecast 4.5M   actual 4.5M  → on plan
  //   Period 2 (Mar): forecast 3.0M   actual 2.7M  → behind plan (-0.3M)
  //   Period 3 (Apr): forecast 3.5M   actual  —    → planned, not yet claimed
  //
  // Forecast is plan data — no PostingEvent emitted.
  // ---------------------------------------------------------------------------
  await prisma.ipaForecast.create({
    data: {
      projectId: project.id,
      periodNumber: 1,
      periodStart: new Date('2026-02-01'),
      forecastAmount: 4500000,
      currency,
      notes: 'Baseline plan — Period 1.',
      createdBy: actor,
    },
  });
  await prisma.ipaForecast.create({
    data: {
      projectId: project.id,
      periodNumber: 2,
      periodStart: new Date('2026-03-01'),
      forecastAmount: 3000000,
      currency,
      notes: 'Baseline plan — Period 2.',
      createdBy: actor,
    },
  });
  await prisma.ipaForecast.create({
    data: {
      projectId: project.id,
      periodNumber: 3,
      periodStart: new Date('2026-04-01'),
      forecastAmount: 3500000,
      currency,
      notes: 'Baseline plan — Period 3 (current).',
      createdBy: actor,
    },
  });

  console.log(
    '  ✓ Commercial demo data seeded (2 IPAs, 2 IPCs, 2 Invoices, 1 Collection, 2 Variations, 3 IpaForecasts, 7 posting events)',
  );
}
