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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
