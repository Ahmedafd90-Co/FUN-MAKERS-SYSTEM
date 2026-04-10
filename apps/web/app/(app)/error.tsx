'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <ErrorState
        title="Something went wrong"
        description={error.message || 'An unexpected error occurred.'}
        onRetry={reset}
      />
    </div>
  );
}
