'use client';

import { TopNav } from './top-nav';

type AppShellProps = {
  userName: string;
  userEmail: string;
  permissions: string[];
  children: React.ReactNode;
};

/**
 * Authenticated app shell — wraps all (app) pages with the top nav
 * and a main content area.
 */
export function AppShell({
  userName,
  userEmail,
  permissions,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav
        userName={userName}
        userEmail={userEmail}
        permissions={permissions}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
