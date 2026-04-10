import { NotificationPreferences } from '@/components/notification-preferences';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { ProfileInfo } from '@/components/profile/profile-info';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profile — Pico Play Fun Makers KSA',
};

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Your profile</h1>
      <ProfileInfo />
      <ChangePasswordForm />
      <NotificationPreferences />
    </div>
  );
}
