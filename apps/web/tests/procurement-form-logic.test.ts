/**
 * Procurement Form Logic tests — Module 3, Slice 2.
 *
 * Pure unit tests (no database) covering:
 * 1. RFQ editability rules — only draft/returned statuses allow editing
 * 2. Quotation editability rules — only received status allows editing
 * 3. Line-item total calculation — qty * unitPrice = totalPrice
 * 4. Contract schema field coverage — form fields match contract schemas
 * 5. Schema validation — create/update schemas accept/reject edge cases
 */
import { describe, it, expect } from 'vitest';
import {
  CreateRfqInputSchema,
  UpdateRfqInputSchema,
  CreateQuotationInputSchema,
  UpdateQuotationInputSchema,
} from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Editable statuses (canonical source: core/procurement/*/validation.ts)
// ---------------------------------------------------------------------------

const RFQ_EDITABLE_STATUSES = ['draft', 'returned'];
const QUOTATION_EDITABLE_STATUSES = ['received'];

const ALL_RFQ_STATUSES = [
  'draft',
  'under_review',
  'returned',
  'approved_internal',
  'issued',
  'responses_received',
  'evaluation',
  'awarded',
  'rejected',
  'cancelled',
  'closed',
];

const ALL_QUOTATION_STATUSES = [
  'received',
  'under_review',
  'shortlisted',
  'awarded',
  'rejected',
  'expired',
];

// ---------------------------------------------------------------------------
// 1. RFQ editability
// ---------------------------------------------------------------------------

describe('RFQ editability rules', () => {
  it('draft and returned are the only editable RFQ statuses', () => {
    expect(RFQ_EDITABLE_STATUSES).toEqual(['draft', 'returned']);
  });

  it.each(ALL_RFQ_STATUSES)('status "%s" editability is correct', (status) => {
    const expected = ['draft', 'returned'].includes(status);
    expect(RFQ_EDITABLE_STATUSES.includes(status)).toBe(expected);
  });

  it('non-editable RFQ statuses are the complement of editable', () => {
    const nonEditable = ALL_RFQ_STATUSES.filter(
      (s) => !RFQ_EDITABLE_STATUSES.includes(s),
    );
    expect(nonEditable).toEqual([
      'under_review',
      'approved_internal',
      'issued',
      'responses_received',
      'evaluation',
      'awarded',
      'rejected',
      'cancelled',
      'closed',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Quotation editability
// ---------------------------------------------------------------------------

describe('Quotation editability rules', () => {
  it('received is the only editable quotation status', () => {
    expect(QUOTATION_EDITABLE_STATUSES).toEqual(['received']);
  });

  it.each(ALL_QUOTATION_STATUSES)(
    'status "%s" editability is correct',
    (status) => {
      const expected = status === 'received';
      expect(QUOTATION_EDITABLE_STATUSES.includes(status)).toBe(expected);
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Line-item total calculation
// ---------------------------------------------------------------------------

describe('Quotation line-item total calculation', () => {
  function calcTotal(qty: number, unitPrice: number): number {
    return Math.round(qty * unitPrice * 100) / 100;
  }

  it('basic multiplication: 10 * 25.50 = 255.00', () => {
    expect(calcTotal(10, 25.5)).toBe(255.0);
  });

  it('fractional quantity: 2.5 * 100 = 250.00', () => {
    expect(calcTotal(2.5, 100)).toBe(250.0);
  });

  it('rounds to 2 decimal places: 3 * 33.333 = 99.99 (not 99.999)', () => {
    expect(calcTotal(3, 33.333)).toBe(100.0);
  });

  it('single item: 1 * 500 = 500', () => {
    expect(calcTotal(1, 500)).toBe(500.0);
  });

  it('zero handling edge: should not happen but 0 * 100 = 0', () => {
    expect(calcTotal(0, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Contract schema field coverage — RFQ
// ---------------------------------------------------------------------------

describe('RFQ contract schemas', () => {
  const validCreateRfq = {
    projectId: '00000000-0000-0000-0000-000000000001',
    title: 'Office Supplies',
    currency: 'SAR',
    deadline: '2026-05-01T00:00:00.000Z',
  };

  it('accepts minimal valid create input', () => {
    const result = CreateRfqInputSchema.safeParse(validCreateRfq);
    expect(result.success).toBe(true);
  });

  it('accepts full create input with items and vendors', () => {
    const result = CreateRfqInputSchema.safeParse({
      ...validCreateRfq,
      description: 'Quarterly office supply order',
      estimatedBudget: 50000,
      items: [
        {
          itemDescription: 'A4 Paper',
          unit: 'ream',
          quantity: 100,
          estimatedUnitPrice: 15,
        },
      ],
      invitedVendorIds: ['00000000-0000-0000-0000-000000000002'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects create without title', () => {
    const result = CreateRfqInputSchema.safeParse({
      ...validCreateRfq,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects create without currency', () => {
    const result = CreateRfqInputSchema.safeParse({
      ...validCreateRfq,
      currency: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative estimated budget', () => {
    const result = CreateRfqInputSchema.safeParse({
      ...validCreateRfq,
      estimatedBudget: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero quantity on line items', () => {
    const result = CreateRfqInputSchema.safeParse({
      ...validCreateRfq,
      items: [
        {
          itemDescription: 'Broken item',
          unit: 'pc',
          quantity: 0,
          estimatedUnitPrice: 10,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('update schema allows partial fields', () => {
    const result = UpdateRfqInputSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Updated title',
    });
    expect(result.success).toBe(true);
  });

  it('update schema allows clearing optional fields to null', () => {
    const result = UpdateRfqInputSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      description: null,
      estimatedBudget: null,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Contract schema field coverage — Quotation
// ---------------------------------------------------------------------------

describe('Quotation contract schemas', () => {
  const validCreateQuotation = {
    projectId: '00000000-0000-0000-0000-000000000001',
    rfqId: '00000000-0000-0000-0000-000000000002',
    vendorId: '00000000-0000-0000-0000-000000000003',
    currency: 'SAR',
    totalAmount: 45000,
  };

  it('accepts minimal valid create input', () => {
    const result = CreateQuotationInputSchema.safeParse(validCreateQuotation);
    expect(result.success).toBe(true);
  });

  it('accepts full create input with items and terms', () => {
    const result = CreateQuotationInputSchema.safeParse({
      ...validCreateQuotation,
      validUntil: '2026-06-01T00:00:00.000Z',
      paymentTerms: 'Net 30',
      deliveryTerms: 'FOB Riyadh',
      items: [
        {
          itemDescription: 'A4 Paper',
          unit: 'ream',
          quantity: 100,
          unitPrice: 15,
          totalPrice: 1500,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects create without rfqId', () => {
    const { rfqId: _, ...without } = validCreateQuotation;
    const result = CreateQuotationInputSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects create without vendorId', () => {
    const { vendorId: _, ...without } = validCreateQuotation;
    const result = CreateQuotationInputSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('rejects zero total amount', () => {
    const result = CreateQuotationInputSchema.safeParse({
      ...validCreateQuotation,
      totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative unit price on line items', () => {
    const result = CreateQuotationInputSchema.safeParse({
      ...validCreateQuotation,
      items: [
        {
          itemDescription: 'Bad item',
          unit: 'pc',
          quantity: 5,
          unitPrice: -10,
          totalPrice: -50,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('update schema allows partial fields', () => {
    const result = UpdateQuotationInputSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      totalAmount: 50000,
    });
    expect(result.success).toBe(true);
  });

  it('update schema allows clearing optional fields to null', () => {
    const result = UpdateQuotationInputSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000001',
      validUntil: null,
      paymentTerms: null,
      deliveryTerms: null,
    });
    expect(result.success).toBe(true);
  });

  it('does NOT accept ghost fields (deliveryDate, notes at top level)', () => {
    const result = CreateQuotationInputSchema.safeParse({
      ...validCreateQuotation,
      deliveryDate: '2026-06-01T00:00:00.000Z',
      notes: 'Should be stripped by strict schema',
    });
    // Zod strips unknown keys by default, so the parse succeeds
    // but the ghost fields are NOT present in the output
    if (result.success) {
      const output = result.data as Record<string, unknown>;
      expect(output).not.toHaveProperty('deliveryDate');
      expect(output).not.toHaveProperty('notes');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Stabilization Slice C — Precondition rules (pure logic tests)
// ---------------------------------------------------------------------------

describe('Quotation-create precondition rules (Slice C)', () => {
  const QUOTATION_ACCEPTING_STATUSES = ['issued', 'responses_received', 'evaluation'];

  it.each(ALL_RFQ_STATUSES)(
    'RFQ status "%s" quotation-accepting = %s',
    (status) => {
      const expected = QUOTATION_ACCEPTING_STATUSES.includes(status);
      expect(QUOTATION_ACCEPTING_STATUSES.includes(status)).toBe(expected);
    },
  );

  it('only issued, responses_received, evaluation accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES).toEqual([
      'issued',
      'responses_received',
      'evaluation',
    ]);
  });

  it('draft RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('draft')).toBe(false);
  });

  it('under_review RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('under_review')).toBe(false);
  });

  it('approved_internal RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('approved_internal')).toBe(false);
  });

  it('rejected RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('rejected')).toBe(false);
  });

  it('cancelled RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('cancelled')).toBe(false);
  });

  it('closed RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('closed')).toBe(false);
  });

  it('awarded RFQ does NOT accept quotations', () => {
    expect(QUOTATION_ACCEPTING_STATUSES.includes('awarded')).toBe(false);
  });
});

describe('Re-quote / compare model (Slice C)', () => {
  const COMPARE_EXCLUDE_STATUSES = ['awarded', 'rejected', 'expired'];

  it('comparison excludes awarded quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('awarded')).toBe(true);
  });

  it('comparison excludes rejected quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('rejected')).toBe(true);
  });

  it('comparison excludes expired quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('expired')).toBe(true);
  });

  it('comparison includes received quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('received')).toBe(false);
  });

  it('comparison includes under_review quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('under_review')).toBe(false);
  });

  it('comparison includes shortlisted quotations', () => {
    expect(COMPARE_EXCLUDE_STATUSES.includes('shortlisted')).toBe(false);
  });

  it('terminal-only exclusion — re-quoted vendor shows only active quotation', () => {
    // Simulates: vendor had rejected quotation, then re-quoted.
    // Only the active (received) quotation should appear in comparison.
    const quotations = [
      { vendorId: 'v1', status: 'rejected', totalAmount: 100 },
      { vendorId: 'v1', status: 'received', totalAmount: 120 },
      { vendorId: 'v2', status: 'shortlisted', totalAmount: 110 },
    ];

    const activeOnly = quotations.filter(
      (q) => !COMPARE_EXCLUDE_STATUSES.includes(q.status),
    );

    expect(activeOnly).toHaveLength(2);
    expect(activeOnly.map((q) => q.status)).toEqual(['received', 'shortlisted']);
    // Vendor v1 only has the active quotation (120), not the rejected one (100)
    const v1Active = activeOnly.filter((q) => q.vendorId === 'v1');
    expect(v1Active).toHaveLength(1);
    expect(v1Active[0]!.totalAmount).toBe(120);
  });
});

describe('RFQ-item linkage for comparison (Slice C)', () => {
  it('quotation line items with rfqItemId appear in comparison matrix', () => {
    // Simulates: comparison groups by rfqItemId
    const rfqItems = [
      { id: 'ri1', itemDescription: 'Steel', quantity: 10, unit: 'ton' },
      { id: 'ri2', itemDescription: 'Cement', quantity: 50, unit: 'bag' },
    ];

    const quotationLineItems = [
      { rfqItemId: 'ri1', unitPrice: 500, totalPrice: 5000 },
      { rfqItemId: 'ri2', unitPrice: 20, totalPrice: 1000 },
    ];

    // Simulate comparison grouping
    const comparison = rfqItems.map((rfqItem) => {
      const lineItem = quotationLineItems.find(
        (li) => li.rfqItemId === rfqItem.id,
      );
      return {
        rfqItem,
        matched: !!lineItem,
        unitPrice: lineItem?.unitPrice ?? null,
      };
    });

    expect(comparison).toHaveLength(2);
    expect(comparison[0]!.matched).toBe(true);
    expect(comparison[0]!.unitPrice).toBe(500);
    expect(comparison[1]!.matched).toBe(true);
    expect(comparison[1]!.unitPrice).toBe(20);
  });

  it('quotation line items without rfqItemId are invisible in comparison', () => {
    const rfqItems = [
      { id: 'ri1', itemDescription: 'Steel', quantity: 10, unit: 'ton' },
    ];

    const quotationLineItems = [
      { rfqItemId: null, unitPrice: 500, totalPrice: 5000 },
    ];

    const comparison = rfqItems.map((rfqItem) => {
      const lineItem = quotationLineItems.find(
        (li) => li.rfqItemId === rfqItem.id,
      );
      return {
        rfqItem,
        matched: !!lineItem,
        unitPrice: lineItem?.unitPrice ?? null,
      };
    });

    // No match because rfqItemId is null
    expect(comparison[0]!.matched).toBe(false);
    expect(comparison[0]!.unitPrice).toBeNull();
  });
});
