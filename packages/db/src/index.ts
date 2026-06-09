export { prisma } from './client';
// PIC-35 Step 7: authorized-status-write bypass for the workflow engine
// and post-workflow lifecycle transition services. See
// packages/db/src/middleware/no-direct-status-write.ts for the contract.
export { runAsWorkflowEngine } from './middleware/no-direct-status-write';
// PIC-50: canonical list of workflow-managed Prisma models (Pascal case).
// Consumed by the template-registry parity test to assert every model has
// a matching WORKFLOW_TEMPLATE_REGISTRY entry.
export { WORKFLOW_DRIVEN_MODELS } from './middleware/no-direct-status-write';
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
  // Layer 1 — ProjectLedger (PIC-8)
  ProjectParticipantRole,
  PrimeContractStatus,
  IntercompanyPricingType,
  IntercompanyManagingDepartment,
  IntercompanyContractStatus,
  // Layer 2.5 — Drawing Register (PIC-52)
  DrawingDiscipline,
  DrawingRevisionStatus,
} from '@prisma/client';

// Seed data exports — for structural testing (H8)
export { PERMISSIONS } from './seed/permissions';
export { COMMERCIAL_PERMISSIONS } from './seed/commercial-permissions';
export { PROCUREMENT_PERMISSIONS } from './seed/procurement-permissions';
export { PERMISSION_CATALOG, isValidPermission, assertValidPermission } from './seed/permission-catalog';
// PIC-108-E: canonical multi-tenant singleton org id. Single source of truth is
// seed/organizations.ts; re-exported here so service code (audit chokepoint)
// can attribute un-threaded/platform-level writes to the singleton without
// duplicating the literal.
export { SINGLETON_ORG_ID } from './seed/organizations';
