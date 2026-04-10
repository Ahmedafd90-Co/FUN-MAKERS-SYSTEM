import { PageHeader } from '@/components/layout/page-header';
import { NotificationPreferences } from '@/components/notification-preferences';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { ProfileInfo } from '@/components/profile/profile-info';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile — Pico Play Fun Makers KSA',
};

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 lg:px-8">
      <PageHeader title="Your Profile" />
      <ProfileInfo />
      <ChangePasswordForm />
      <NotificationPreferences />
    </div>
  );
}
