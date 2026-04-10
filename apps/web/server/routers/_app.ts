/**
 * Root tRPC router — merges all sub-routers.
 *
 * New routers are added here as they are implemented in later tasks/phases.
 */
import { router } from '../trpc';
import { authRouter } from './auth';

export const appRouter = router({
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
