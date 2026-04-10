/**
 * tRPC v11 HTTP handler — mounted at /api/trpc/[trpc].
 *
 * Uses the fetch adapter for Next.js App Router compatibility.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createTRPCContext } from '@/server/context';
import { appRouter } from '@/server/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(),
  });

export { handler as GET, handler as POST };
