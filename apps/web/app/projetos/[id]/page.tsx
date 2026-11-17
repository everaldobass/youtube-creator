import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export default async function ProjectIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await api.getProject(id);
  redirect(`/projetos/${id}/${project.etapaAtual}`);
}
