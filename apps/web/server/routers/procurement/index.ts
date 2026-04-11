/**
 * Procurement router barrel — merges all procurement sub-routers.
 *
 * Phase 4, Task 4.7 / Phase 5, Task 5.5-5.6 — Module 3 Procurement Engine.
 */
import { router } from '../../trpc';
import { vendorRouter } from './vendor';
import { projectVendorRouter } from './project-vendor';
import { categoryRouter } from './category';
import { catalogRouter } from './catalog';
import { vendorContractRouter } from './vendor-contract';
import { frameworkAgreementRouter } from './framework-agreement';
import { rfqRouter } from './rfq';
import { quotationRouter } from './quotation';

export const procurementRouter = router({
  vendor: vendorRouter,
  projectVendor: projectVendorRouter,
  category: categoryRouter,
  catalog: catalogRouter,
  vendorContract: vendorContractRouter,
  frameworkAgreement: frameworkAgreementRouter,
  rfq: rfqRouter,
  quotation: quotationRouter,
});
