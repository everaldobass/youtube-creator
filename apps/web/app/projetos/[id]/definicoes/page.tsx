import { api } from '@/lib/api';
import { DefinicoesForm } from '@/components/definicoes-form';

export const dynamic = 'force-dynamic';

export default async function DefinicoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await api.getProject(id);
  return <DefinicoesForm project={project} />;
}
