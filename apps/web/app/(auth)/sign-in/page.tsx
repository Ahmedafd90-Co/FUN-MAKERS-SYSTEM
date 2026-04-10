import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/sign-in-form';

export const metadata: Metadata = {
  title: 'Sign In — Pico Play Fun Makers KSA',
};

export default function SignInPage() {
  return <SignInForm />;
}
