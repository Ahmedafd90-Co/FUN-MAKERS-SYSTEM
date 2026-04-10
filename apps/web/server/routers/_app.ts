/**
 * Root tRPC router — merges all sub-routers.
 *
 * New routers are added here as they are implemented in later tasks/phases.
 */
import { router } from '../trpc';

export const appRouter = router({
  // Sub-routers are merged here as they are implemented.
  // Task 1.3.5 will add: auth: authRouter
});

export type AppRouter = typeof appRouter;
