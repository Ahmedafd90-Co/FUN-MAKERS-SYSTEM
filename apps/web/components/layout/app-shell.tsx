'use client';

import { BrandedBackdrop } from '@fmksa/brand';
import { Toaster } from 'sonner';
import { CommandPalette } from './command-palette';
import { TopNav } from './top-nav';

type AppShellProps = {
  userName: string;
  userEmail: string;
  permissions: string[];
  children: React.ReactNode;
};

/**
 * Authenticated app shell — wraps all (app) pages with the top nav,
 * main content area, and the branded canvas backdrop that applies the
 * subtle Pico Play brand identity behind every operational surface.
 *
 * The backdrop is `position: fixed` at `z-index: -10` so it never
 * competes with content and never intercepts pointer events. The shell's
 * root div is intentionally transparent so the backdrop shows through
 * from behind — the body's `bg-background` from globals.css provides the
 * final paint under the backdrop.
 */
export function AppShell({
  userName,
  userEmail,
  permissions,
  children,
}: AppShellProps) {
  return (
    <>
      <BrandedBackdrop variant="canvas" />
      <div className="flex min-h-screen flex-col">
        <TopNav
          userName={userName}
          userEmail={userEmail}
          permissions={permissions}
        />
        <main className="flex-1">{children}</main>
        <CommandPalette permissions={permissions} />
        <Toaster position="top-right" />
      </div>
    </>
  );
}
