/**
 * /home — flagship operational command surface.
 *
 * The page itself is a server component so it can pull the user's display
 * name from the session without an extra client round-trip just to greet
 * the user. All the data and interactivity live in <DashboardCards>.
 *
 * Width sits at max-w-7xl (wider than other inner pages) because the
 * dashboard is the primary canvas — five distinct zones need horizontal
 * breathing room at lg+. Padding stays consistent with other (app) pages.
 */
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { DashboardCards } from '@/components/dashboard/dashboard-cards';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  // The (app) layout already redirects unauthenticated requests, but the
  // typing on `session.user.name` is `string | null | undefined`, so we
  // resolve a stable display name here.
  const userName =
    session.user.name && session.user.name.trim().length > 0
      ? session.user.name
      : (session.user.email ?? 'there');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <DashboardCards userName={userName} />
    </div>
  );
}
