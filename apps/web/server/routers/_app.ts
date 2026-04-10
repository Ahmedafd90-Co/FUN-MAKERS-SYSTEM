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

export const appRouter = router({
  auth: authRouter,
  projects: projectsRouter,
  entities: entitiesRouter,
  referenceData: referenceDataRouter,
  workflow: workflowRouter,
  documents: documentsRouter,
  posting: postingRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
