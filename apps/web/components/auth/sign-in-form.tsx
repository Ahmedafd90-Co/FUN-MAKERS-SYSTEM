'use client';

import { Button } from '@fmksa/ui/components/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@fmksa/ui/components/card';
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

export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
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
    <Card className="w-full max-w-sm border-border bg-card shadow-lg">
      <CardHeader className="space-y-3 text-center pb-2">
        {/* Brand accent line */}
        <div className="mx-auto h-1 w-12 rounded-full bg-primary" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Fun Makers KSA
          </h1>
          <p className="text-sm text-muted-foreground leading-snug">
            Project Operations &amp; Commercial Workflow Platform
          </p>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 pt-2">
          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              {serverError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@funmakers.sa"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button
            type="submit"
            className="w-full"
            disabled={signInMutation.isPending}
          >
            {signInMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            Forgot your password?
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
