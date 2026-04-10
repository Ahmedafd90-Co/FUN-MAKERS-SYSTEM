/**
 * Client-side tRPC hooks + vanilla client for the Fun Makers KSA platform.
 *
 * Usage in React components:
 *   import { trpc } from '@/lib/trpc-client';
 *   const { data } = trpc.auth.me.useQuery();
 *
 * The TRPCProvider wrapping the app is set up in Task 1.3.5 / layout.
 */
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

/**
 * React hooks for tRPC procedures — use inside React components.
 */
export const trpc = createTRPCReact<AppRouter>();
