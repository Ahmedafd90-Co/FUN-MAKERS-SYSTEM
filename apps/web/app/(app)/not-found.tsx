import { Button } from '@fmksa/ui/components/button';
import { FileQuestion } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 lg:px-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/logo-colour.png"
          alt="Pico Play"
          width={120}
          height={32}
          className="h-8 w-auto dark:hidden"
        />
        <Image
          src="/logo-colour-white.png"
          alt="Pico Play"
          width={120}
          height={32}
          className="hidden h-8 w-auto dark:block"
        />
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/15 bg-primary/5">
          <FileQuestion className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground max-w-md">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved. Check the URL or head back to the dashboard.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/home">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
