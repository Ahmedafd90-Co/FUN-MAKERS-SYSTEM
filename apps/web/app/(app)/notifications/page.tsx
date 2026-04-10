'use client';

/**
 * Notifications page — full-page list of notifications for the current user.
 * Task 1.8.8
 */

import { Toaster } from 'sonner';

import { NotificationList } from '@/components/notifications/notification-list';

export default function NotificationsPage() {
  return (
    <>
      <Toaster position="top-right" />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <NotificationList />
      </div>
    </>
  );
}
