'use client';

import { BrandLogo, activeTheme } from '@fmksa/brand';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

// ---------------------------------------------------------------------------
// Error messages (polite, non-technical)
// ---------------------------------------------------------------------------

function friendlyError(message: string): string {
  if (message.includes('invalid_credentials')) {
    return 'The email or password you entered is incorrect.';
  }
  if (message.includes('account_locked')) {
    return 'Your account has been temporarily locked. Please try again later.';
  }
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Component — cinematic dark-anchor treatment.
//
// All glass-surface chrome (card bg, input bg/border, label color, muted
// text) comes from brand tokens exposed as Tailwind `glass-*` utilities.
// No page-level hardcoded white/N opacity values — a future tenant theme
// could shift the whole glass palette without editing this file.
// ---------------------------------------------------------------------------
export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signInMutation = trpc.auth.signIn.useMutation({
    onSuccess: () => {
      router.push('/home');
    },
    onError: (error) => {
      setServerError(friendlyError(error.message));
    },
  });

  function onSubmit(data: SignInFormValues) {
    setServerError(null);
    signInMutation.mutate(data);
  }

  return (
    <div className="w-full max-w-sm space-y-10">
      {/* Hero block — the reversed logo already carries "We Create Fun"
          as part of the brand lockup artwork; no second display tagline. */}
      <div className="flex flex-col items-center gap-5 text-center">
        <BrandLogo variant="reversed" size="hero" priority />
        <p className="text-body-sm text-glass-muted max-w-[18rem]">
          {activeTheme.copy.platformDescription}
        </p>
      </div>

      {/* Glass form card — all surface colors come from brand tokens. */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-xl border border-glass-surface-border bg-glass-surface p-6 backdrop-blur-sm shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
        noValidate
      >
        {serverError && (
          <div
            role="alert"
            className="mb-5 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-body-sm text-red-100"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email" variant="onDark">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              variant="onDark"
              className="h-10"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-meta text-red-200/90">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" variant="onDark">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              variant="onDark"
              className="h-10"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-meta text-red-200/90">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        {/* Restrained orange accent: a 2px stripe on the button's left edge.
            The single orange moment on this surface. Not a fill. */}
        <div className="mt-6 border-l-2 border-brand-orange">
          <Button
            type="submit"
            className="w-full rounded-[0.5rem] rounded-l-none h-10"
            disabled={signInMutation.isPending}
          >
            {signInMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/forgot-password"
            className="text-meta text-glass-link hover:text-white/80 transition-colors"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </div>
  );
}
