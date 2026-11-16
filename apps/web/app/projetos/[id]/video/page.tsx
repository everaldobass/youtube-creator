import { api, apiServer } from '@/lib/api';
import { VideoView } from '@/components/video-view';

export const dynamic = 'force-dynamic';

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, scenes, status, tags, thumbs, music] = await Promise.all([
    api.getProject(id),
    apiServer.listScenes(id),
    apiServer.exportStatus(id),
    apiServer.tags(id),
    apiServer.thumbnails(id),
    apiServer.music(id),
  ]);
  return (
    <VideoView
      project={project}
      scenes={scenes.scenes}
      tags={tags.tags}
      thumbnail={thumbs.thumbnails.find((t) => t.escolhida) ?? null}
      music={music}
      initial={status}
    />
  );
}
