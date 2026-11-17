import Link from 'next/link';
import { ArrowRight, Copy, Film, Plus, Trash2 } from 'lucide-react';
import { STEPS, IDIOMA_INFO, type ProjectDto } from '@yt/shared';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createDraftProject, deleteProject, duplicateProject } from './actions';

export const dynamic = 'force-dynamic';

async function loadProjects(): Promise<{ projects: ProjectDto[]; error: string | null }> {
  try {
    return { projects: await api.listProjects(), error: null };
  } catch (e) {
    return { projects: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

function progresso(etapa: string) {
  const i = STEPS.findIndex((s) => s.slug === etapa);
  return { atual: i + 1, total: STEPS.length, label: STEPS[i]?.label ?? '' };
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

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-10">
      <section className="rounded-xl border border-border bg-panel px-6 py-8 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[52ch]">
            <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em]">
              Seus vídeos
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Defina o assunto, aprove o roteiro e saia com MP4, thumbnail e textos prontos para
              colar no YouTube Studio.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nove etapas, do tema ao MP4. Vídeos longos de até 30 min e Shorts de até 3 min.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
            </p>
            <NovoVideoButton />
          </div>
        </div>
      </section>

      {error && (
        <Card className="mt-8 border-primary/50">
          <CardContent>
            <p className="font-medium">Não foi possível carregar os projetos.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirme que a API está rodando (pnpm dev) e que NEXT_PUBLIC_API_URL aponta para ela.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/">Tentar de novo</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && projects.length === 0 && (
        <Card className="mx-auto mt-8 max-w-xl text-center">
          <CardContent className="flex flex-col items-center gap-4 py-14">
            <Film className="size-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Crie seu primeiro vídeo</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Informe tema, contexto e duração. O app sugere títulos, escreve o roteiro por cena e
              prepara narração, imagens, tags, thumbnails e descrição.
            </p>
            <NovoVideoButton />
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const prog = progresso(p.etapaAtual);
            return (
              <li key={p.id}>
                <Card className="flex h-full flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{p.formato === 'shorts' ? 'Shorts' : 'Vídeo longo'}</Badge>
                      <Badge variant="outline">{IDIOMA_INFO[p.idioma].curto}</Badge>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <Link href={`/projetos/${p.id}/${p.etapaAtual}`} className="flex-1">
                      <h2 className="text-lg font-semibold leading-snug">
                        {p.tituloEscolhido || p.ideia || p.tema || 'Vídeo sem título'}
                      </h2>
                    </Link>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(prog.atual / prog.total) * 100}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                        Etapa {prog.atual} de {prog.total}: {prog.label}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <div className="flex gap-1">
                        <form action={duplicateProject}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button
                            variant="ghost"
                            size="sm"
                            type="submit"
                            className="text-muted-foreground hover:text-ai"
                          >
                            <Copy className="size-4" /> Duplicar
                          </Button>
                        </form>
                        <form action={deleteProject}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button
                            variant="ghost"
                            size="sm"
                            type="submit"
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Trash2 className="size-4" /> Apagar
                          </Button>
                        </form>
                      </div>
                      <Button size="sm" asChild>
                        <Link href={`/projetos/${p.id}/${p.etapaAtual}`}>
                          Continuar <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
