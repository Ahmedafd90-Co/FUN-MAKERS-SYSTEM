export default function ProjectWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      {children}
    </div>
  );
}
