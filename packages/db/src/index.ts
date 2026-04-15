export { prisma } from './client';
export { PrismaClient, Prisma } from '@prisma/client';
export type {
  IpaStatus,
  IpaOrigin,
  IpcStatus,
  VariationStatus,
  CostProposalStatus,
  TaxInvoiceStatus,
  CorrespondenceStatus,
  VendorStatus,
  VendorContractStatus,
  FrameworkAgreementStatus,
  RfqStatus,
  QuotationStatus,
  BudgetAdjustmentType,
  EiStatus,
  PurchaseOrderStatus,
  SupplierInvoiceStatus,
  ExpenseStatus,
  CreditNoteStatus,
  PostingOrigin,
  ImportType,
  ImportBatchStatus,
  ImportRowStatus,
} from '@prisma/client';

// Seed data exports — for structural testing (H8)
export { PERMISSIONS } from './seed/permissions';
export { COMMERCIAL_PERMISSIONS } from './seed/commercial-permissions';
export { PROCUREMENT_PERMISSIONS } from './seed/procurement-permissions';
export { PERMISSION_CATALOG, isValidPermission, assertValidPermission } from './seed/permission-catalog';
