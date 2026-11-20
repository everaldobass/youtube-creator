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
    <div className="mx-auto flex w-full max-w-[1320px] flex-col md:flex-row">
      <ProjectNav projectId={project.id} etapaAtual={project.etapaAtual} />
      <main
        id="conteudo"
        className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8"
      >
        {children}
      </main>
    </div>
  );
}
