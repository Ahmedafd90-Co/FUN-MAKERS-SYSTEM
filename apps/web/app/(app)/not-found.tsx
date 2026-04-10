import { Button } from '@fmksa/ui/components/button';
import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <FileQuestion className="h-10 w-10 text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </div>
  );
}
