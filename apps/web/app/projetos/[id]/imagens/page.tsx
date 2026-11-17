import { apiServer } from '@/lib/api';
import { ImagensView } from '@/components/imagens-view';

export const dynamic = 'force-dynamic';

export default async function ImagensPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [images, visual] = await Promise.all([apiServer.images(id), apiServer.visual(id)]);
  return <ImagensView projectId={id} initial={images} initialVisual={visual} />;
}
