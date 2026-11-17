import { api, apiServer } from '@/lib/api';
import { TitulosView } from '@/components/titulos-view';

export const dynamic = 'force-dynamic';

export default async function TitulosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gerar?: string | string[] }>;
}) {
  const { id } = await params;
  const { gerar } = await searchParams;
  const [project, titles] = await Promise.all([api.getProject(id), apiServer.listTitles(id)]);
  return (
    <TitulosView
      projectId={id}
      initialTitles={titles}
      temEntrada={Boolean(project.tema.trim() || project.ideia.trim())}
      autoGerar={gerar === '1'}
    />
  );
}
