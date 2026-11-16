import { api } from '@/lib/api';
import { ProjectNav } from '@/components/project-nav';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Projeto inexistente vira 404 em lib/api.ts; API fora do ar continua mostrando erro.
  const project = await api.getProject(id);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ProjectNav projectId={project.id} etapaAtual={project.etapaAtual} />
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
