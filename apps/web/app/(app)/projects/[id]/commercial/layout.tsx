import { CommercialSidebar } from '@/components/commercial/commercial-sidebar';

export default async function CommercialLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex gap-6">
      <CommercialSidebar projectId={id} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
