'use client';

/**
 * Client-side tRPC hooks for the Fun Makers KSA platform.
 *
 * Usage in React components:
 *   import { trpc } from '@/lib/trpc-client';
 *   const { data } = trpc.auth.me.useQuery();
 *
 * The TRPCProvider wrapping the app is set up in the layout.
 */
import { createTRPCReact } from '@trpc/react-query';

import type { AppRouter } from '@/server/routers/_app';

/**
 * React hooks for tRPC procedures — use inside React components.
 *
 * The explicit type annotation is required because pnpm's strict module
 * resolution means TypeScript cannot "name" the inferred return type
 * across package boundaries (TS2742).
 */
type TRPCClient = ReturnType<typeof createTRPCReact<AppRouter>>;
export const trpc: TRPCClient = createTRPCReact<AppRouter>();
