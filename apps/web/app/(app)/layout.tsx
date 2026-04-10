import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { auth } from '@/lib/auth';

/**
 * Authenticated app layout (Server Component).
 *
 * Reads the session via Auth.js. If there is no session, redirects to
 * /sign-in. Otherwise renders the app shell with user context passed
 * to client components.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect('/sign-in');
  }

  // Auth.js session carries minimal user info — enough for the shell.
  // Full role/permission data is loaded client-side via trpc.auth.me.
  // For the nav we pass permissions via a lightweight server fetch.
  const { authService } = await import('@fmksa/core');
  const user = await authService.getUser(session.user.id!);

  return (
    <AppShell
      userName={user?.name ?? session.user.name ?? 'User'}
      userEmail={user?.email ?? session.user.email ?? ''}
      permissions={user?.permissions ?? []}
    >
      {children}
    </AppShell>
  );
}
