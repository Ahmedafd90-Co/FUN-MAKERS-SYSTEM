import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password — Pico Play Fun Makers KSA',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
