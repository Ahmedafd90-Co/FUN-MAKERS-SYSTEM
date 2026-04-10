import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Home — Pico Play Fun Makers KSA',
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome to Fun Makers KSA
      </h1>
      <p className="mt-2 text-muted-foreground">
        Phase 1.4 will add project cards, approvals, and activity feeds here.
      </p>
    </div>
  );
}
