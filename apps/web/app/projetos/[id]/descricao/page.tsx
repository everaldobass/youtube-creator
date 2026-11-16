import { apiServer } from '@/lib/api';
import { DescricaoView } from '@/components/descricao-view';

export const dynamic = 'force-dynamic';

export default async function DescricaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DescricaoView projectId={id} initial={await apiServer.description(id)} />;
}
