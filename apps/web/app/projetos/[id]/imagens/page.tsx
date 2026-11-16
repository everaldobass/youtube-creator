import { apiServer } from '@/lib/api';
import { ImagensView } from '@/components/imagens-view';

export const dynamic = 'force-dynamic';

export default async function ImagensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImagensView projectId={id} initial={await apiServer.images(id)} />;
}
