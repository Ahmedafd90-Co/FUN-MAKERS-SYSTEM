/**
 * Procurement router barrel — merges all procurement sub-routers.
 *
 * Phase 4, Task 4.7 / Phase 5, Task 5.5-5.6 — Module 3 Procurement Engine.
 */
import { registerProcurementEventTypes } from '@fmksa/core';
import { router, protectedProcedure } from '../../trpc';
import { vendorRouter } from './vendor';

// Register procurement posting event types at module load (matches commercial pattern)
registerProcurementEventTypes();
import { projectVendorRouter } from './project-vendor';
import { categoryRouter } from './category';
import { catalogRouter } from './catalog';
import { vendorContractRouter } from './vendor-contract';
import { frameworkAgreementRouter } from './framework-agreement';
import { rfqRouter } from './rfq';
import { quotationRouter } from './quotation';
import { purchaseOrderRouter } from './purchase-order';
import { supplierInvoiceRouter } from './supplier-invoice';
import { expenseRouter } from './expense';
import { creditNoteRouter } from './credit-note';

/** Procurement permission prefixes relevant for UI action filtering. */
const PROCUREMENT_PERM_PREFIXES = [
  'rfq.', 'quotation.', 'vendor.', 'vendor_contract.',
  'framework_agreement.', 'purchase_order.', 'supplier_invoice.',
  'expense.', 'credit_note.', 'procurement_category.', 'item_catalog.',
  'project_vendor.', 'procurement_dashboard.', 'system.',
];

export const procurementRouter = router({
  vendor: vendorRouter,
  projectVendor: projectVendorRouter,
  category: categoryRouter,
  catalog: catalogRouter,
  vendorContract: vendorContractRouter,
  frameworkAgreement: frameworkAgreementRouter,
  rfq: rfqRouter,
  quotation: quotationRouter,
  purchaseOrder: purchaseOrderRouter,
  supplierInvoice: supplierInvoiceRouter,
  expense: expenseRouter,
  creditNote: creditNoteRouter,

  /**
   * Returns the caller's procurement-related permissions.
   * No DB query — permissions are already loaded in context.
   * Used by UI to show only the actions the user can actually perform.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) =>
      PROCUREMENT_PERM_PREFIXES.some((prefix) => p.startsWith(prefix)),
    );
  }),
});
