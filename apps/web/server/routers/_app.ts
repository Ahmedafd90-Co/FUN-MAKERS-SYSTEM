/**
 * Root tRPC router — merges all sub-routers.
 *
 * New routers are added here as they are implemented in later tasks/phases.
 */
import { router } from '../trpc';
import { authRouter } from './auth';
import { projectsRouter } from './projects';
import { entitiesRouter } from './entities';
import { referenceDataRouter } from './reference-data';
import { workflowRouter } from './workflow';
import { documentsRouter } from './documents';
import { postingRouter } from './posting';
import { notificationsRouter } from './notifications';
import { dashboardRouter } from './dashboard';
import { auditRouter } from './audit';
import { healthRouter } from './health';
import { commercialRouter } from './commercial';
import { procurementRouter } from './procurement';
import { adminRouter } from './admin';
import { budgetRouter } from './budget';
import { reconciliationRouter } from './reconciliation';

export const appRouter = router({
  auth: authRouter,
  projects: projectsRouter,
  entities: entitiesRouter,
  referenceData: referenceDataRouter,
  workflow: workflowRouter,
  documents: documentsRouter,
  posting: postingRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  audit: auditRouter,
  health: healthRouter,
  commercial: commercialRouter,
  procurement: procurementRouter,
  adminUsers: adminRouter,
  budget: budgetRouter,
  reconciliation: reconciliationRouter,
});

export type AppRouter = typeof appRouter;
