import { apiServer } from '@/lib/api';
import { TagsView } from '@/components/tags-view';

export const dynamic = 'force-dynamic';

export default async function TagsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TagsView projectId={id} initial={await apiServer.tags(id)} />;
}
