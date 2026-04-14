'use client';

/**
 * Notifications page — full-page list of notifications for the current user.
 * Task 1.8.8
 */

import { NotificationList } from '@/components/notifications/notification-list';

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <NotificationList />
    </div>
  );
}
