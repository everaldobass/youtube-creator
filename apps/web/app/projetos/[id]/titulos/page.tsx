import { api, apiServer } from '@/lib/api';
import { TitulosView } from '@/components/titulos-view';

export const dynamic = 'force-dynamic';

export default async function TitulosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, titles] = await Promise.all([api.getProject(id), apiServer.listTitles(id)]);
  return (
    <TitulosView
      projectId={id}
      initialTitles={titles}
      temEntrada={Boolean(project.tema.trim() || project.ideia.trim())}
    />
  );
}
