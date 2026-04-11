/**
 * Procurement router barrel — merges all procurement sub-routers.
 *
 * Phase 4, Task 4.7 — Module 3 Procurement Engine.
 */
import { router } from '../../trpc';
import { vendorRouter } from './vendor';
import { projectVendorRouter } from './project-vendor';
import { categoryRouter } from './category';
import { catalogRouter } from './catalog';

export const procurementRouter = router({
  vendor: vendorRouter,
  projectVendor: projectVendorRouter,
  category: categoryRouter,
  catalog: catalogRouter,
});
