/**
 * SupplierInvoice router schema — VAT consistency invariant.
 *
 * Pure schema test (no DB, no tRPC context). Exercises the .refine() guard
 * on the active create-input schema directly via .safeParse(). The guard
 * enforces |grossAmount + vatAmount − totalAmount| ≤ 0.01 (smallest unit
 * for any 2-decimal currency including SAR halala) so non-UI clients
 * (curl, scripts, future mobile, data importers) can't persist
 * internally-inconsistent invoice rows.
 *
 * The corresponding client-side check lives in supplier-invoice-form.tsx
 * (amountsAreConsistent within hasValidAmounts). Defense-in-depth.
 */
import { describe, it, expect } from 'vitest';
import { CreateSupplierInvoiceInputSchema } from '@/server/routers/procurement/supplier-invoice';

// Minimum valid input shape — every required field per the router's schema.
// projectId/vendorId are uuid()-validated, currency is 3-char, all four amount
// fields are union(number|string).
const baseValidInput = {
  projectId: '00000000-0000-0000-0000-000000000001',
  vendorId: '00000000-0000-0000-0000-000000000002',
  invoiceDate: '2026-04-26',
  currency: 'SAR',
  grossAmount: '1000',
  vatRate: '0.15',
  vatAmount: '150',
  totalAmount: '1150',
};

describe('CreateSupplierInvoiceInputSchema — VAT consistency invariant', () => {
  it('accepts amounts where gross + vat = total exactly', () => {
    const result = CreateSupplierInvoiceInputSchema.safeParse(baseValidInput);
    expect(result.success).toBe(true);
  });

  it('accepts amounts within tolerance (0.01)', () => {
    const result = CreateSupplierInvoiceInputSchema.safeParse({
      ...baseValidInput,
      grossAmount: '1000.001',
      vatAmount: '150.001',
      totalAmount: '1150.005',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when gross + vat does not equal total beyond tolerance', () => {
    const result = CreateSupplierInvoiceInputSchema.safeParse({
      ...baseValidInput,
      grossAmount: '1000',
      vatAmount: '0',
      totalAmount: '2000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes('do not add up'),
        ),
      ).toBe(true);
    }
  });

  it('accepts numeric (non-string) amount inputs that satisfy the invariant', () => {
    const result = CreateSupplierInvoiceInputSchema.safeParse({
      ...baseValidInput,
      grossAmount: 1000,
      vatAmount: 150,
      totalAmount: 1150,
    });
    expect(result.success).toBe(true);
  });
});
