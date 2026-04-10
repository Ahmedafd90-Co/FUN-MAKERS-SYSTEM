'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';

import { trpc } from '@/lib/trpc-client';

export function ProfileInfo() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* User details */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Name</p>
            <p className="text-sm">{user.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Email</p>
            <p className="text-sm">{user.email}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <p className="text-sm capitalize">{user.status}</p>
          </div>
        </div>

        {/* Roles */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Roles
          </p>
          {user.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          )}
        </div>

        {/* MFA placeholder */}
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-muted-foreground">
            Multi-factor authentication
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            MFA setup coming in a future update.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
