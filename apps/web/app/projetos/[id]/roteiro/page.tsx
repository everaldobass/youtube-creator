import { api, apiServer } from '@/lib/api';
import { RoteiroView } from '@/components/roteiro-view';

export const dynamic = 'force-dynamic';

export default async function RoteiroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, scenes] = await Promise.all([api.getProject(id), apiServer.listScenes(id)]);
  return (
    <RoteiroView
      projectId={id}
      titulo={project.tituloEscolhido}
      formato={project.formato}
      initial={scenes}
    />
  );
}
