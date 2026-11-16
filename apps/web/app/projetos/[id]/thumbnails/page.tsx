import { apiServer } from '@/lib/api';
import { ThumbnailsView } from '@/components/thumbnails-view';

export const dynamic = 'force-dynamic';

export default async function ThumbnailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ThumbnailsView projectId={id} initial={await apiServer.thumbnails(id)} />;
}
