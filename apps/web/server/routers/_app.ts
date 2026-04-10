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

export const appRouter = router({
  auth: authRouter,
  projects: projectsRouter,
  entities: entitiesRouter,
  referenceData: referenceDataRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;
