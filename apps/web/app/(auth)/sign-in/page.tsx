import { SignInForm } from '@/components/auth/sign-in-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — Fun Makers KSA',
};

export default function SignInPage() {
  return <SignInForm />;
}
