import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/**
 * Root page — redirects authenticated users to /home, everyone else
 * to /sign-in.
 */
export default async function RootPage() {
  const session = await auth();
  if (session) redirect('/home');
  redirect('/sign-in');
}
