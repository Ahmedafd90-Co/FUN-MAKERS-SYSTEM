/**
 * End-to-end demo seed — populates FMKSA-2026-001 with at least one example
 * of every remaining feature so the master admin can see every page populated.
 *
 * Covers: Commercial (CostProposal, EngineerInstruction, Correspondence,
 * imported IPA), Budget (ProjectBudget + BudgetLines + Adjustments +
 * AbsorptionException), Procurement (Vendor, ProjectVendor, RFQ+items+vendors,
 * Quotation, PurchaseOrder, SupplierInvoice, CreditNote, Expense,
 * FrameworkAgreement, VendorContract), Imports (ImportBatch + rows),
 * Workflow instances (4 states), PostingEvents (4 origins/types) +
 * PostingException, OverrideLog, Notifications (3 flavors).
 *
 * Idempotency: the seed's first fixture is a CostProposal with the reserved
 * `referenceNumber` `CP-E2E-001`. We probe for that row before running; a
 * hit means the seed already ran. Reference numbers are a natural hidden-ish
 * idempotency anchor (they never vary by copy and never surface in
 * marketing-facing text), and keeping the anchor there means none of the
 * business fields need to carry an obvious `E2E_DEMO_SEED` sentinel that
 * leaks into operator-visible UI.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Reserved fixture reference number — acts as the idempotency anchor. The
 * seed writes this value exactly once per project; probing for its existence
 * is the "already seeded?" check. No other code may reuse this value.
 */
const IDEMPOTENCY_REFERENCE = 'CP-E2E-001';

export async function seedE2eDemo(prisma: PrismaClient) {
  console.log('  Seeding end-to-end demo data...');

  const project = await prisma.project.findUnique({
    where: { code: 'FMKSA-2026-001' },
  });
  if (!project) {
    console.log('  ⚠ Project FMKSA-2026-001 not found — skipping E2E demo.');
    return;
  }

  const admin = await prisma.user.findUnique({
    where: { email: 'ahmedafd90@gmail.com' },
  });
  if (!admin) {
    console.log('  ⚠ Master admin not found — skipping E2E demo.');
    return;
  }

  // Idempotency — referenceNumber is globally unique; if our fixture CP is
  // already there, the rest of the seed has already run.
  const existingCostProposal = await prisma.costProposal.findFirst({
    where: {
      projectId: project.id,
      referenceNumber: IDEMPOTENCY_REFERENCE,
    },
  });
  if (existingCostProposal) {
    console.log('  ✓ E2E demo already seeded — skipping.');
    return;
  }

  const currency = 'SAR';
  const actorId = admin.id;
  const projectId = project.id;

  // Reference existing project entity for vendors (same entity as the project).
  const entityId = project.entityId;

  // ---------------------------------------------------------------------------
  // 1. Commercial — fill remaining gaps
  // ---------------------------------------------------------------------------
  const costProposal = await prisma.costProposal.create({
    data: {
      projectId: project.id,
      status: 'submitted',
      referenceNumber: IDEMPOTENCY_REFERENCE,
      revisionNumber: 1,
      estimatedCost: 850000,
      estimatedTimeDays: 45,
      methodology:
        'Unit-rate build-up from vendor quotations, benchmarked against 2025 zone-A actuals.',
      costBreakdown: 'Materials 60%, Labor 25%, Equipment 15%',
      currency,
      createdBy: actorId,
    },
  });

  const engineerInstruction = await prisma.engineerInstruction.create({
    data: {
      projectId: project.id,
      referenceNumber: 'EI-E2E-001',
      title: 'Relocate service corridor — zone B',
      description:
        'Engineer instruction to relocate service corridor to accommodate revised layout.',
      estimatedValue: 320000,
      currency,
      status: 'under_evaluation',
      reserveRate: 0.5,
      reserveAmount: 160000,
      notes:
        'Reserve booked at 50% of estimated value pending scope confirmation.',
      createdBy: actorId,
    },
  });

  await prisma.correspondence.create({
    data: {
      projectId: project.id,
      subtype: 'letter',
      status: 'issued',
      referenceNumber: 'LTR-E2E-001',
      subject: 'Transmittal of Revised Shop Drawings',
      body: 'Please find attached revised shop drawings for zone B.',
      recipientName: 'Engineer of Record',
      recipientOrg: 'Ministry of Entertainment',
      letterType: 'transmittal',
      currency,
      createdBy: actorId,
    },
  });

  // Imported-historical IPA — period 3 so it doesn't collide with 1/2
  const importedIpa = await prisma.ipa.create({
    data: {
      projectId: project.id,
      status: 'approved_internal',
      referenceNumber: 'IPA-E2E-HIST-001',
      periodNumber: 3,
      periodFrom: new Date('2026-01-01'),
      periodTo: new Date('2026-01-31'),
      grossAmount: 2100000,
      retentionRate: 0.1,
      retentionAmount: 210000,
      previousCertified: 0,
      currentClaim: 1890000,
      netClaimed: 1890000,
      currency,
      description: 'Historical IPA imported from the 2026-01 close package.',
      origin: 'imported_historical',
      // import fields filled in after we create the batch + row
      createdBy: actorId,
    },
  });

  console.log('  ✓ Commercial: 1 CostProposal, 1 EngineerInstruction, 1 Correspondence, 1 imported IPA');

  // ---------------------------------------------------------------------------
  // 2. Imports — create the ImportBatch + 2 rows, then back-fill FK fields
  // ---------------------------------------------------------------------------
  const importBatch = await prisma.importBatch.create({
    data: {
      projectId: project.id,
      importType: 'ipa_history',
      sourceFileName: '2026-01-historical-ipa.xlsx',
      sourceFileHash:
        'e2e-demo-sentinel-hash-0000000000000000000000000000000000000000',
      uploadedBy: actorId,
      status: 'committed',
      summaryJson: {
        totalRows: 2,
        pending: 0,
        valid: 0,
        invalid: 0,
        conflict: 0,
        committed: 2,
        skipped: 0,
      },
      parserVersion: 'ipa-history-1.0.0',
      validatorSchemaVersion: 'ipa-history-1.0.0',
      validationRanAt: new Date('2026-02-01'),
      committedAt: new Date('2026-02-02'),
      committedBy: actorId,
    },
  });

  const importedIpaRow = await prisma.importRow.create({
    data: {
      batchId: importBatch.id,
      rowNumber: 1,
      rawJson: {
        period_number: 3,
        gross_amount: 2100000,
      },
      parsedJson: {
        periodNumber: 3,
        grossAmount: '2100000.00',
      },
      status: 'committed',
      committedRecordType: 'ipa',
      committedRecordId: importedIpa.id,
    },
  });

  // Back-fill the imported IPA's import provenance
  await prisma.ipa.update({
    where: { id: importedIpa.id },
    data: {
      importBatchId: importBatch.id,
      importRowId: importedIpaRow.id,
      importedByUserId: actorId,
      importedAt: new Date('2026-02-02'),
      importedOriginalJson: {
        periodNumber: 3,
        grossAmount: '2100000.00',
      },
    },
  });

  // A second import row for the budget line (created a bit further down).
  // We pre-create it here and link by id; budget line will carry the pointer.
  const importedBudgetRow = await prisma.importRow.create({
    data: {
      batchId: importBatch.id,
      rowNumber: 2,
      rawJson: {
        category_code: 'materials',
        budget_amount: 4000000,
      },
      parsedJson: {
        categoryCode: 'materials',
        budgetAmount: '4000000.00',
      },
      status: 'committed',
      committedRecordType: 'budget_line',
    },
  });

  console.log('  ✓ Imports: 1 ImportBatch (committed), 2 ImportRow entries');

  // ---------------------------------------------------------------------------
  // 3. Budget — project budget + 5 lines + 2 adjustments + 1 absorption exception
  // ---------------------------------------------------------------------------
  // Pick 5 real budget categories
  const categoryCodes = ['materials', 'subcontractors', 'manpower', 'equipment_and_plant', 'supplies'];
  const categories = await prisma.budgetCategory.findMany({
    where: { code: { in: categoryCodes } },
  });
  const catByCode = new Map(categories.map((c) => [c.code, c]));

  // A ProjectBudget may already exist (created via UI or a prior seed). Use
  // upsert so the demo rewrites header amounts + notes but never collides.
  const budgetNote =
    'Internal delivery budget — baseline set from approved contract; revised reflects 2026-Q1 contingency uplift.';
  const projectBudget = await prisma.projectBudget.upsert({
    where: { projectId: project.id },
    update: {
      internalBaseline: 15000000,
      internalRevised: 17000000,
      contingencyAmount: 1000000,
      eiReserveTotal: 160000,
      notes: budgetNote,
    },
    create: {
      projectId: project.id,
      internalBaseline: 15000000,
      internalRevised: 17000000,
      contingencyAmount: 1000000,
      eiReserveTotal: 160000,
      notes: budgetNote,
      createdBy: actorId,
    },
  });

  const lineAmounts: Record<string, number> = {
    materials: 6500000, // current is drift from lastImportedAmount (4_000_000)
    subcontractors: 4000000,
    manpower: 3000000,
    equipment_and_plant: 2000000,
    supplies: 1500000,
  };

  const budgetLineIdByCode = new Map<string, string>();
  for (const code of categoryCodes) {
    const category = catByCode.get(code);
    if (!category) continue;
    const amount = lineAmounts[code] ?? 0;
    const isImportedLine = code === 'materials';
    // Lines auto-exist from createBudget() if the budget was created via the
    // UI, so we upsert per (budgetId, categoryId).
    const lineNotes: Record<string, string> = {
      materials:
        'Steel + concrete packages — revised from imported baseline after supplier re-quotation.',
      subcontractors: 'MEP + finishes subcontractor packages.',
      manpower: 'Site supervision and direct labour.',
      equipment_and_plant: 'Tower cranes, hoists, and formwork equipment.',
      supplies: 'Consumables and small tools.',
    };
    const line = await prisma.budgetLine.upsert({
      where: {
        budgetId_categoryId: {
          budgetId: projectBudget.id,
          categoryId: category.id,
        },
      },
      update: {
        budgetAmount: amount,
        committedAmount: code === 'materials' ? 2400000 : 0,
        notes: lineNotes[code] ?? null,
        ...(isImportedLine
          ? {
              importBatchId: importBatch.id,
              importRowId: importedBudgetRow.id,
              lastImportedAmount: 4000000,
              importedByUserId: actorId,
              importedAt: new Date('2026-02-02'),
            }
          : {}),
      },
      create: {
        budgetId: projectBudget.id,
        categoryId: category.id,
        budgetAmount: amount,
        committedAmount: code === 'materials' ? 2400000 : 0,
        actualAmount: 0,
        notes: lineNotes[code] ?? null,
        ...(isImportedLine
          ? {
              importBatchId: importBatch.id,
              importRowId: importedBudgetRow.id,
              lastImportedAmount: 4000000,
              importedByUserId: actorId,
              importedAt: new Date('2026-02-02'),
            }
          : {}),
      },
    });
    budgetLineIdByCode.set(code, line.id);
  }

  // Back-fill the import row to point at the committed budget line
  const materialsLineId = budgetLineIdByCode.get('materials');
  if (materialsLineId) {
    await prisma.importRow.update({
      where: { id: importedBudgetRow.id },
      data: { committedRecordId: materialsLineId },
    });
  }

  // Adjustment 1: baseline change (header-level)
  await prisma.budgetAdjustment.create({
    data: {
      budgetId: projectBudget.id,
      adjustmentType: 'baseline_change',
      amount: 2000000,
      reason: 'Contingency uplift for scope addition in zone B.',
      approvedBy: actorId,
      createdBy: actorId,
    },
  });

  // Adjustment 2: line manual adjustment (linked to materials line, beforeAmount/afterAmount set)
  if (materialsLineId) {
    await prisma.budgetAdjustment.create({
      data: {
        budgetId: projectBudget.id,
        budgetLineId: materialsLineId,
        adjustmentType: 'line_manual_adjustment',
        amount: 2500000,
        beforeAmount: 4000000,
        afterAmount: 6500000,
        reason: 'Price escalation on structural steel following Q1 tender.',
        approvedBy: actorId,
        createdBy: actorId,
      },
    });
  }

  // Absorption exception — truth-snapshot fields populated so the Budget-page
  // banner and Admin detail tell a coherent story even though the demo's
  // sourceRecordId is a placeholder that doesn't resolve to a real PO.
  //
  // categoryCode='travel' is deliberate: Travel is a BudgetCategory that
  // genuinely has NO line on FMKSA-2026-001's budget (the project's 5 lines
  // are materials / subcontractors / manpower / supplies / equipment_and_plant),
  // so reasonCode='no_budget_line' stays truthful. Using 'materials' here
  // would contradict itself — Materials has a line, so "no budget line for
  // this category" would be false.
  //
  // sourceAmount=100000 is a representative demo value (100k SAR).
  await prisma.budgetAbsorptionException.create({
    data: {
      projectId: project.id,
      sourceModule: 'procurement',
      sourceRecordType: 'purchase_order',
      sourceRecordId: 'e2e-demo-source-record',
      absorptionType: 'po_commitment',
      reasonCode: 'no_budget_line',
      message:
        'PO committed under a category that has no corresponding budget line on this project.',
      severity: 'warning',
      status: 'open',
      sourceAmount: '100000',
      categoryCode: 'travel',
    },
  });

  console.log('  ✓ Budget: 1 ProjectBudget, 5 BudgetLines, 2 Adjustments, 1 AbsorptionException');

  // ---------------------------------------------------------------------------
  // 4. Procurement
  // ---------------------------------------------------------------------------
  const vendor = await prisma.vendor.create({
    data: {
      entityId,
      vendorCode: 'V-E2E-001',
      name: 'Al-Yamamah Steel Supply Co.',
      tradeName: 'AYSS',
      registrationNumber: 'REG-E2E-001',
      taxId: '300000000000099',
      contactName: 'Sara Al-Ahmed',
      contactEmail: 'sara@example.com',
      contactPhone: '+966500000099',
      address: '1 Demo Street',
      city: 'Riyadh',
      country: 'SA',
      status: 'active',
      notes:
        'Primary structural steel supplier — framework agreement FA-E2E-001 in place.',
      createdBy: actorId,
    },
  });

  await prisma.projectVendor.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      approvedDate: new Date('2026-03-01'),
      status: 'active',
    },
  });

  // RFQ + RFQItem + RFQVendor
  const rfq = await prisma.rFQ.create({
    data: {
      projectId: project.id,
      rfqNumber: 'RFQ-E2E-001',
      title: 'Structural steel supply — zone B',
      description:
        'Supply of S355 structural steel beams for the zone B superstructure.',
      requiredByDate: new Date('2026-05-01'),
      currency,
      estimatedBudget: 1200000,
      status: 'responses_received',
      referenceNumber: 'RFQ-REF-E2E-001',
      createdBy: actorId,
    },
  });

  const rfqItem = await prisma.rFQItem.create({
    data: {
      rfqId: rfq.id,
      itemDescription: 'Structural steel beams, grade S355',
      quantity: 120,
      unit: 'ton',
      estimatedUnitPrice: 9500,
    },
  });

  await prisma.rFQVendor.create({
    data: {
      rfqId: rfq.id,
      vendorId: vendor.id,
      sentAt: new Date('2026-03-10'),
      responseStatus: 'responded',
    },
  });

  // Quotation + line item
  const quotation = await prisma.quotation.create({
    data: {
      rfqId: rfq.id,
      vendorId: vendor.id,
      quotationRef: 'Q-E2E-001',
      receivedDate: new Date('2026-03-20'),
      validUntil: new Date('2026-06-20'),
      totalAmount: 1140000,
      currency,
      deliveryTerms: 'DDP site, 60 days',
      paymentTerms: '30 days net',
      status: 'shortlisted',
      createdBy: actorId,
    },
  });

  await prisma.quotationLineItem.create({
    data: {
      quotationId: quotation.id,
      rfqItemId: rfqItem.id,
      itemDescription: 'Structural steel beams, grade S355',
      quantity: 120,
      unit: 'ton',
      unitPrice: 9500,
      totalPrice: 1140000,
      currency,
      validityDate: new Date('2026-06-20'),
      notes: 'Price valid until 2026-06-20 — DDP site.',
    },
  });

  // Purchase Order + item
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      rfqId: rfq.id,
      quotationId: quotation.id,
      poNumber: 'PO-E2E-001',
      title: 'Structural steel supply — zone B',
      description:
        'Supply of 120 tons of S355 structural steel beams per RFQ-E2E-001.',
      totalAmount: 1140000,
      currency,
      deliveryDate: new Date('2026-05-30'),
      deliveryAddress: 'Al Yamamah Entertainment Complex, Riyadh',
      paymentTerms: '30 days net',
      status: 'approved',
      referenceNumber: 'PO-REF-E2E-001',
      createdBy: actorId,
    },
  });

  await prisma.purchaseOrderItem.create({
    data: {
      purchaseOrderId: purchaseOrder.id,
      itemDescription: 'Structural steel beams, grade S355',
      quantity: 120,
      unit: 'ton',
      unitPrice: 9500,
      totalPrice: 1140000,
    },
  });

  // Supplier Invoice
  const supplierInvoice = await prisma.supplierInvoice.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      purchaseOrderId: purchaseOrder.id,
      invoiceNumber: 'SI-E2E-001',
      invoiceDate: new Date('2026-04-10'),
      grossAmount: 1000000,
      vatRate: 0.15,
      vatAmount: 150000,
      totalAmount: 1150000,
      dueDate: new Date('2026-05-10'),
      currency,
      status: 'approved',
      createdBy: actorId,
    },
  });

  // Credit Note
  const creditNote = await prisma.creditNote.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      subtype: 'credit_note',
      creditNoteNumber: 'CN-E2E-001',
      supplierInvoiceId: supplierInvoice.id,
      purchaseOrderId: purchaseOrder.id,
      amount: 50000,
      currency,
      reason: 'Damaged goods rebate — 2 beams rejected at site inspection.',
      receivedDate: new Date('2026-04-15'),
      status: 'applied',
      createdBy: actorId,
    },
  });

  // Expense
  const expense = await prisma.expense.create({
    data: {
      projectId: project.id,
      subtype: 'general',
      title: 'Site signage printing',
      description: 'Printing of safety and way-finding signage for zone B.',
      amount: 12500,
      currency,
      expenseDate: new Date('2026-04-05'),
      receiptReference: 'RCPT-E2E-001',
      status: 'approved',
      createdBy: actorId,
    },
  });

  // Framework Agreement + item
  const frameworkAgreement = await prisma.frameworkAgreement.create({
    data: {
      entityId,
      vendorId: vendor.id,
      projectId: project.id,
      agreementNumber: 'FA-E2E-001',
      title: 'Structural steel framework agreement',
      description:
        'Volume-based framework for structural steel supply across 2026 projects.',
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      currency,
      totalCommittedValue: 5000000,
      status: 'active',
      createdBy: actorId,
    },
  });

  await prisma.frameworkAgreementItem.create({
    data: {
      frameworkAgreementId: frameworkAgreement.id,
      itemDescription: 'Structural steel beams, grade S355',
      unit: 'ton',
      agreedRate: 9300,
      currency,
      minQuantity: 50,
      maxQuantity: 500,
      notes: 'Rate held for 12 months; min order 50 tons, max 500 tons.',
    },
  });

  // Vendor Contract
  const vendorContract = await prisma.vendorContract.create({
    data: {
      projectId: project.id,
      vendorId: vendor.id,
      contractNumber: 'VC-E2E-001',
      title: 'Al-Yamamah Steel Supply — subcontract',
      description:
        'Subcontract for structural steel fabrication and erection — zone B.',
      contractType: 'subcontract',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      totalValue: 2500000,
      currency,
      terms: 'Standard FIDIC subcontract terms',
      signedDate: new Date('2026-01-15'),
      status: 'active',
      referenceNumber: 'VC-REF-E2E-001',
      createdBy: actorId,
    },
  });

  console.log('  ✓ Procurement: Vendor, ProjectVendor, RFQ+Item+Vendor, Quotation+Line, PO+Item, SI, CN, Expense, FA+Item, VC');

  // ---------------------------------------------------------------------------
  // 5. Workflow instances — 4 states
  // ---------------------------------------------------------------------------
  const wfTemplates = await prisma.workflowTemplate.findMany({
    where: {
      code: {
        in: ['cost_proposal_standard', 'po_standard', 'variation_standard', 'letter_standard'],
      },
    },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  const tplByCode = new Map(wfTemplates.map((t) => [t.code, t]));

  const draftVariation = await prisma.variation.findFirst({
    where: { projectId: project.id, status: 'submitted' },
  });

  async function createWfInstance(
    templateCode: string,
    recordType: string,
    recordId: string,
    status: 'in_progress' | 'approved' | 'rejected' | 'returned',
    action: string,
    comment: string,
  ) {
    const tpl = tplByCode.get(templateCode);
    if (!tpl) return;
    const firstStep = tpl.steps[0];
    if (!firstStep) return;
    const completedAt =
      status === 'approved' || status === 'rejected' ? new Date() : null;
    const instance = await prisma.workflowInstance.create({
      data: {
        templateId: tpl.id,
        recordType,
        recordId,
        projectId,
        status,
        currentStepId: status === 'approved' || status === 'rejected' ? null : firstStep.id,
        startedBy: actorId,
        startedAt: new Date(),
        completedAt,
      },
    });
    await prisma.workflowAction.create({
      data: {
        instanceId: instance.id,
        stepId: firstStep.id,
        actorUserId: actorId,
        action,
        comment,
        actedAt: new Date(),
      },
    });
  }

  await createWfInstance(
    'cost_proposal_standard',
    'cost_proposal',
    costProposal.id,
    'in_progress',
    'submit',
    'Submitted for review',
  );

  await createWfInstance(
    'po_standard',
    'purchase_order',
    purchaseOrder.id,
    'approved',
    'approve',
    'Approved by PM',
  );

  if (draftVariation) {
    await createWfInstance(
      'variation_standard',
      'variation',
      draftVariation.id,
      'rejected',
      'reject',
      'Rejected — insufficient justification',
    );
  }

  await createWfInstance(
    'letter_standard',
    'engineer_instruction',
    engineerInstruction.id,
    'returned',
    'return',
    'Returned — needs clarification on scope',
  );

  console.log('  ✓ Workflow: 4 instances (in_progress, approved, rejected, returned)');

  // ---------------------------------------------------------------------------
  // 6. Posting events + exception
  //
  // Live IPA_APPROVED / IPC_SIGNED / TAX_INVOICE_ISSUED / VARIATION_APPROVED
  // events are now emitted by commercial-demo-data.ts (which owns those
  // records). This file only emits what it creates itself:
  //   - IPA_APPROVED (imported_historical) for the imported period-3 IPA
  //   - PO_COMMITTED for the e2e-demo purchase order
  //   - SUPPLIER_INVOICE_APPROVED (with a PostingException) for the SI
  //   - EXPENSE_APPROVED for the approved expense
  // ---------------------------------------------------------------------------

  await prisma.postingEvent.create({
    data: {
      eventType: 'IPA_APPROVED',
      sourceService: 'commercial',
      sourceRecordType: 'ipa',
      sourceRecordId: importedIpa.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `e2e-demo-ipa-approved-imported-${importedIpa.id}`,
      payloadJson: {
        ipaId: importedIpa.id,
        periodNumber: 3,
        grossAmount: '2100000.00',
        retentionAmount: '210000.00',
        netClaimed: '1890000.00',
        currency,
        projectId: project.id,
        _import: {
          batchId: importBatch.id,
          rowId: importedIpaRow.id,
          rowNumber: 1,
          postingDateSource: 'periodTo',
        },
      },
      status: 'posted',
      origin: 'imported_historical',
      importBatchId: importBatch.id,
      postedAt: new Date('2026-02-02'),
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'PO_COMMITTED',
      sourceService: 'procurement',
      sourceRecordType: 'purchase_order',
      sourceRecordId: purchaseOrder.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `e2e-demo-po-committed-${purchaseOrder.id}`,
      payloadJson: {
        purchaseOrderId: purchaseOrder.id,
        poNumber: 'PO-E2E-001',
        vendorId: vendor.id,
        totalAmount: '1140000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-01'),
    },
  });

  const supplierInvoicePostingEvent = await prisma.postingEvent.create({
    data: {
      eventType: 'SUPPLIER_INVOICE_APPROVED',
      sourceService: 'procurement',
      sourceRecordType: 'supplier_invoice',
      sourceRecordId: supplierInvoice.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `e2e-demo-si-approved-${supplierInvoice.id}`,
      payloadJson: {
        supplierInvoiceId: supplierInvoice.id,
        invoiceNumber: 'SI-E2E-001',
        vendorId: vendor.id,
        totalAmount: '1150000.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-11'),
    },
  });

  await prisma.postingException.create({
    data: {
      eventId: supplierInvoicePostingEvent.id,
      reason:
        'Supplier invoice references a category with no budget line on this project — pending manual reclassification.',
      assignedTo: actorId,
    },
  });

  await prisma.postingEvent.create({
    data: {
      eventType: 'EXPENSE_APPROVED',
      sourceService: 'procurement',
      sourceRecordType: 'expense',
      sourceRecordId: expense.id,
      projectId: project.id,
      entityId,
      idempotencyKey: `e2e-demo-expense-approved-${expense.id}`,
      payloadJson: {
        expenseId: expense.id,
        subtype: 'general',
        amount: '12500.00',
        currency,
        projectId: project.id,
      },
      status: 'posted',
      origin: 'live',
      postedAt: new Date('2026-04-05'),
    },
  });

  console.log('  ✓ Posting: 4 PostingEvents (live + imported_historical), 1 PostingException');

  // ---------------------------------------------------------------------------
  // 7. Override log — anchor via an audit entry
  // ---------------------------------------------------------------------------
  const auditForOverride = await prisma.auditLog.create({
    data: {
      actorUserId: actorId,
      actorSource: 'user',
      action: 'override',
      resourceType: 'purchase_order',
      resourceId: purchaseOrder.id,
      projectId: project.id,
      beforeJson: { status: 'draft' },
      afterJson: { status: 'approved' },
      reason: 'Manual approval override — urgent delivery.',
    },
  });

  await prisma.overrideLog.create({
    data: {
      auditLogId: auditForOverride.id,
      overrideType: 'workflow_skip',
      overriderUserId: actorId,
      reason:
        'Urgent delivery; standard approval workflow skipped with master-admin authorisation.',
      beforeJson: { status: 'draft' },
      afterJson: { status: 'approved' },
      approvedBy: actorId,
    },
  });

  console.log('  ✓ Override: 1 AuditLog + 1 OverrideLog');

  // ---------------------------------------------------------------------------
  // 8. Notifications — for the master admin
  // ---------------------------------------------------------------------------
  await prisma.notification.create({
    data: {
      userId: actorId,
      templateCode: 'workflow_action_required',
      idempotencyKey: 'e2e-demo-notif-1',
      subject: 'Action required: Cost Proposal pending review',
      body: 'A new Cost Proposal (CP-E2E-001) is pending your review on FMKSA-2026-001.',
      payloadJson: {
        recordType: 'cost_proposal',
        recordId: costProposal.id,
        action: 'review',
      },
      channel: 'in_app',
      status: 'sent',
      sentAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: actorId,
      templateCode: 'system_info',
      idempotencyKey: 'e2e-demo-notif-2',
      subject: 'Import batch committed',
      body: 'Historical import batch 2026-01-historical-ipa.xlsx committed successfully (2 rows).',
      payloadJson: {
        importBatchId: importBatch.id,
      },
      channel: 'in_app',
      status: 'read',
      sentAt: new Date(),
      readAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      userId: actorId,
      templateCode: 'workflow_action_required',
      idempotencyKey: 'e2e-demo-notif-3',
      subject: 'Action required: Engineer Instruction returned',
      body: 'Engineer Instruction EI-E2E-001 was returned for clarification.',
      payloadJson: {
        recordType: 'engineer_instruction',
        recordId: engineerInstruction.id,
        action: 'clarify',
      },
      channel: 'in_app',
      status: 'sent',
      sentAt: new Date(),
    },
  });

  console.log('  ✓ Notifications: 3 rows for master admin (1 read + 2 unread)');

  // ---------------------------------------------------------------------------
  // 9. Bootstrap audit trail — out-of-band visibility for seeded writes
  // ---------------------------------------------------------------------------
  // Seed writes bypass the tRPC service layer that would normally emit AuditLog
  // entries, so without this block the admin audit viewer would show nothing
  // for these records — they'd be a silent void. We emit one `system`-sourced
  // entry per seeded record family so:
  //   • the audit viewer's `actorSource = system` filter surfaces them
  //   • per-record detail pages (filtering by resourceType + resourceId) find
  //     a real trail instead of empty state
  //   • the `reason` field explicitly says "not a user action" to avoid
  //     misleading operators into thinking someone created these by hand
  const bootstrapReason =
    'Out-of-band bootstrap seed via @fmksa/db/seed/e2e-demo — not a user-initiated action.';
  const bootstrapEntries: Array<{
    resourceType: string;
    resourceId: string;
    afterJson: Prisma.InputJsonValue;
  }> = [
    {
      resourceType: 'cost_proposal',
      resourceId: costProposal.id,
      afterJson: {
        referenceNumber: costProposal.referenceNumber,
        estimatedCost: costProposal.estimatedCost.toString(),
        status: costProposal.status,
      },
    },
    {
      resourceType: 'engineer_instruction',
      resourceId: engineerInstruction.id,
      afterJson: {
        referenceNumber: engineerInstruction.referenceNumber,
        estimatedValue: engineerInstruction.estimatedValue.toString(),
        status: engineerInstruction.status,
      },
    },
    {
      resourceType: 'ipa',
      resourceId: importedIpa.id,
      afterJson: {
        referenceNumber: importedIpa.referenceNumber,
        grossAmount: importedIpa.grossAmount.toString(),
        status: importedIpa.status,
        importBatchId: importBatch.id,
      },
    },
    {
      resourceType: 'import_batch',
      resourceId: importBatch.id,
      afterJson: {
        importType: importBatch.importType,
        sourceFileName: importBatch.sourceFileName,
        status: importBatch.status,
      },
    },
    {
      resourceType: 'project_budget',
      resourceId: projectBudget.id,
      afterJson: {
        internalBaseline: projectBudget.internalBaseline.toString(),
        internalRevised: projectBudget.internalRevised.toString(),
        contingencyAmount: projectBudget.contingencyAmount.toString(),
      },
    },
    {
      resourceType: 'vendor',
      resourceId: vendor.id,
      afterJson: {
        name: vendor.name,
        vendorCode: vendor.vendorCode,
        status: vendor.status,
      },
    },
    {
      resourceType: 'rfq',
      resourceId: rfq.id,
      afterJson: {
        rfqNumber: rfq.rfqNumber,
        status: rfq.status,
      },
    },
    {
      resourceType: 'quotation',
      resourceId: quotation.id,
      afterJson: {
        quotationRef: quotation.quotationRef,
        totalAmount: quotation.totalAmount.toString(),
        status: quotation.status,
      },
    },
    {
      resourceType: 'purchase_order',
      resourceId: purchaseOrder.id,
      afterJson: {
        poNumber: purchaseOrder.poNumber,
        totalAmount: purchaseOrder.totalAmount.toString(),
        status: purchaseOrder.status,
      },
    },
    {
      resourceType: 'supplier_invoice',
      resourceId: supplierInvoice.id,
      afterJson: {
        invoiceNumber: supplierInvoice.invoiceNumber,
        totalAmount: supplierInvoice.totalAmount.toString(),
        status: supplierInvoice.status,
      },
    },
    {
      resourceType: 'credit_note',
      resourceId: creditNote.id,
      afterJson: {
        creditNoteNumber: creditNote.creditNoteNumber,
        amount: creditNote.amount.toString(),
        status: creditNote.status,
      },
    },
    {
      resourceType: 'expense',
      resourceId: expense.id,
      afterJson: {
        title: expense.title,
        amount: expense.amount.toString(),
        status: expense.status,
      },
    },
    {
      resourceType: 'framework_agreement',
      resourceId: frameworkAgreement.id,
      afterJson: {
        agreementNumber: frameworkAgreement.agreementNumber,
        totalCommittedValue:
          frameworkAgreement.totalCommittedValue?.toString() ?? null,
        status: frameworkAgreement.status,
      },
    },
    {
      resourceType: 'vendor_contract',
      resourceId: vendorContract.id,
      afterJson: {
        contractNumber: vendorContract.contractNumber,
        totalValue: vendorContract.totalValue.toString(),
        status: vendorContract.status,
      },
    },
  ];
  await prisma.auditLog.createMany({
    data: bootstrapEntries.map((e) => ({
      actorUserId: actorId,
      actorSource: 'system' as const,
      action: 'bootstrap_seed.create',
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      projectId: project.id,
      beforeJson: {} as Prisma.InputJsonValue,
      afterJson: e.afterJson,
      reason: bootstrapReason,
    })),
  });
  console.log(
    `  ✓ Audit trail: ${bootstrapEntries.length} system-sourced bootstrap entries`,
  );

  console.log('  ✓ E2E demo seeded.');
}
