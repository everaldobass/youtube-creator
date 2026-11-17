import { apiServer } from '@/lib/api';
import { NarracaoView } from '@/components/narracao-view';

export const dynamic = 'force-dynamic';

export default async function NarracaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NarracaoView projectId={id} initial={await apiServer.narration(id)} />;
}
