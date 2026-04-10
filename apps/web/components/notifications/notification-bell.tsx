'use client';

/**
 * NotificationBell — top-nav bell icon with unread count badge.
 *
 * - Polls unread count every 30 seconds.
 * - Badge shows count (max 99+), hidden when count is 0.
 * - Clicking navigates to /notifications.
 */

import { Bell } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc-client';

export function NotificationBell() {
  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  const displayCount = count > 99 ? '99+' : count > 0 ? String(count) : null;

  return (
    <Link
      href="/notifications"
      className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
      aria-label={
        count > 0 ? `${count} unread notification${count !== 1 ? 's' : ''}` : 'Notifications'
      }
    >
      <Bell className="h-4 w-4" />
      {displayCount !== null && (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          aria-hidden="true"
        >
          {displayCount}
        </span>
      )}
    </Link>
  );
}
