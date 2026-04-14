import { redirect } from 'next/navigation';

/**
 * Procurement home — redirects to RFQ register.
 * Same pattern as commercial home.
 */
export default async function ProcurementHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/procurement/rfq`);
}
