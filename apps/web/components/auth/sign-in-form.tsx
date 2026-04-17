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
// Component
// ---------------------------------------------------------------------------
//
// Cinematic dark-anchor treatment:
//   - The parent (auth)/layout paints the <BrandedBackdrop variant="anchor">
//     so this component focuses on composition only.
//   - Hero logo (reversed/white) leads the surface; tagline sits below
//     in display weight. The form card uses a glass treatment
//     (bg-white/[0.04] + backdrop-blur) with white-on-dark inputs.
//   - The sign-in button fill is the operational teal (WCAG-AA safe).
//     A 2px brand-orange border-left stripe is the single restrained
//     orange accent on this page — no orange flood.
//
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
      {/* Hero block — the reversed logo already carries the "We Create Fun"
          tagline as part of the brand lockup artwork, so we do NOT add a
          second standalone tagline here (brand rule: tagline never dominates).
          The platform description sits below as a supporting line. */}
      <div className="flex flex-col items-center gap-5 text-center">
        <BrandLogo variant="reversed" size="hero" priority />
        <p className="text-[13px] leading-5 text-white/50 max-w-[18rem]">
          {activeTheme.copy.platformDescription}
        </p>
      </div>

      {/* Glass form card. `bg-white/[0.04]` is deliberate — high enough to
          define the surface, low enough to keep the backdrop visible. */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
        noValidate
      >
        {serverError && (
          <div
            role="alert"
            className="mb-5 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-100"
          >
            {serverError}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label
              htmlFor="email"
              className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/70"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="h-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--brand-teal)/0.55)] focus-visible:ring-offset-0 focus-visible:border-[hsl(var(--brand-teal))]"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-200/90">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="password"
              className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/70"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-[hsl(var(--brand-teal)/0.55)] focus-visible:ring-offset-0 focus-visible:border-[hsl(var(--brand-teal))]"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-200/90">
                {errors.password.message}
              </p>
            )}
          </div>
        </div>

        {/* Button anchored by a 2px orange stripe on the left edge — the
            single restrained orange accent on this page. */}
        <div className="mt-6 border-l-2 border-[hsl(var(--brand-orange))]">
          <Button
            type="submit"
            className="w-full rounded-[0.5rem] rounded-l-none h-10 text-[13px] font-medium tracking-[0.005em]"
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
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </div>
  );
}
