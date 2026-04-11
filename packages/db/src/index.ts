export { prisma } from './client';
export { PrismaClient, Prisma } from '@prisma/client';
export type {
  IpaStatus,
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
} from '@prisma/client';

// Seed data exports — for structural testing (H8)
export { PROCUREMENT_PERMISSIONS } from './seed/procurement-permissions';
