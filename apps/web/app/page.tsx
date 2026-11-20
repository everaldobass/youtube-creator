import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { ProjectDto } from '@yt/shared';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProjectsGrid, type ProjectCard } from '@/components/projects-grid';
import { ImportProjectButton } from '@/components/import-project';
import { createDraftProject } from './actions';

export const dynamic = 'force-dynamic';

async function loadProjects(): Promise<{ projects: ProjectDto[]; error: string | null }> {
  try {
    return { projects: await api.listProjects(), error: null };
  } catch (e) {
    return { projects: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

function NovoVideoButton({ size = 'lg' as 'lg' | 'default' }) {
  return (
    <form action={createDraftProject}>
      <Button size={size} type="submit">
        <Plus className="size-4" /> Novo vídeo
      </Button>
    </form>
  );
}

export default async function HomePage() {
  const { projects, error } = await loadProjects();
  const cards: ProjectCard[] = projects.map((p) => ({
    ...p,
    atualizadoEm: new Date(p.updatedAt).toLocaleDateString('pt-BR'),
  }));

  return (
    <main
      id="conteudo"
      className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:px-8"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-border-soft pb-6">
        <div className="max-w-[62ch]">
          <h1 className="text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.25rem]">
            Seus vídeos
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Defina o assunto, aprove o roteiro e saia com MP4, thumbnail e textos prontos para colar
            no YouTube Studio.
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Nove etapas, do tema ao MP4. Vídeos longos de até 30 min e Shorts de até 3 min.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
          </p>
          <ImportProjectButton />
          <NovoVideoButton />
        </div>
      </header>

      {error && (
        <Alert
          variant="error"
          className="mt-6"
          title="Não foi possível carregar os projetos"
          description={
            <>
              {error} Confirme que a API está rodando (pnpm dev) e que NEXT_PUBLIC_API_URL aponta
              para ela.
            </>
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/">Tentar de novo</Link>
            </Button>
          }
        />
      )}

      {!error && projects.length === 0 && <ProjectsGrid projects={[]} />}

      {!error && projects.length > 0 && <ProjectsGrid projects={cards} />}
    </main>
  );
}
