'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';

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
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Pico Play Fun Makers KSA
        </CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {serverError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {serverError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
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

        <CardFooter className="flex flex-col space-y-4">
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
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Forgot your password?
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
