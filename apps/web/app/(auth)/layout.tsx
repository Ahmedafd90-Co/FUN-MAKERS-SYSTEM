/**
 * Auth layout — no app chrome, centered card container.
 *
 * Used by /sign-in, /forgot-password, and future auth-related pages.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-8">
      {children}
    </div>
  );
}
