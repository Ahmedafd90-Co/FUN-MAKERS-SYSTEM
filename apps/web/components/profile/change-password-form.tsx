'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle2 } from 'lucide-react';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z
      .string()
      .min(12, 'New password must be at least 12 characters.'),
    confirmPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChangePasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setServerError(null);
      setSuccess(true);
      reset();
      // Clear success after a few seconds
      setTimeout(() => setSuccess(false), 5000);
    },
    onError: (error) => {
      setSuccess(false);
      setServerError(error.message);
    },
  });

  function onSubmit(data: ChangePasswordFormValues) {
    setServerError(null);
    setSuccess(false);
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Update your password. Must be at least 12 characters.
        </CardDescription>
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

          {success && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Password changed successfully.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
            />
            {errors.newPassword && (
              <p className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Updating...
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
