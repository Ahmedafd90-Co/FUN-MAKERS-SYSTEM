import { redirect } from 'next/navigation';

export default async function CommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/commercial/dashboard`);
}
