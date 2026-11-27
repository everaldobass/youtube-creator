'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Copy, Film, Loader2, Plus, Trash2 } from 'lucide-react';
import { STEPS, IDIOMA_INFO, type ProjectDto } from '@yt/shared';
import { duplicateProject, createDraftProject } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';
import { ImportProjectButton } from '@/components/import-project';
import { del } from '@/lib/client-api';

export type ProjectCard = ProjectDto & { atualizadoEm: string };

function progresso(etapa: string) {
  const i = STEPS.findIndex((s) => s.slug === etapa);
  return { atual: i + 1, total: STEPS.length, label: STEPS[i]?.label ?? '' };
}

/**
 * Lista de projetos com confirmação de exclusão e desfazer.
 * A exclusão é adiada por alguns segundos; "Desfazer" cancela o agendamento.
 */
export function ProjectsGrid({ projects }: { projects: ProjectCard[] }) {
  const router = useRouter();
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [duplicando, setDuplicando] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState<ProjectCard | null>(null);

  const visiveis = projects.filter((p) => !ocultos.has(p.id));

  async function duplicar(p: ProjectCard) {
    setDuplicando(p.id);
    try {
      const fd = new FormData();
      fd.set('id', p.id);
      await duplicateProject(fd);
      router.refresh();
      toast({ titulo: 'Projeto duplicado', tom: 'success' });
    } catch (e) {
      toast({
        titulo: 'Não foi possível duplicar',
        descricao: e instanceof Error ? e.message : 'Tente de novo.',
        tom: 'error',
      });
    } finally {
      setDuplicando(null);
    }
  }

  function confirmarExclusao() {
    const p = aApagar;
    if (!p) return;
    setAApagar(null);
    setOcultos((o) => new Set(o).add(p.id));

    const timer = window.setTimeout(async () => {
      try {
        await del(`/projects/${p.id}`);
        router.refresh();
      } catch (e) {
        setOcultos((o) => {
          const copia = new Set(o);
          copia.delete(p.id);
          return copia;
        });
        toast({
          titulo: 'Não foi possível apagar',
          descricao: e instanceof Error ? e.message : 'O projeto continua na lista.',
          tom: 'error',
        });
      }
    }, 7000);

    toast({
      titulo: 'Projeto apagado',
      descricao: 'A exclusão será concluída em alguns segundos.',
      acaoRotulo: 'Desfazer',
      duracao: 6500,
      onAcao: () => {
        window.clearTimeout(timer);
        setOcultos((o) => {
          const copia = new Set(o);
          copia.delete(p.id);
          return copia;
        });
        toast({ titulo: 'Exclusão cancelada', tom: 'success' });
      },
    });
  }

  if (visiveis.length === 0) {
    return (
      <Card className="mx-auto mt-8 max-w-xl text-center">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <span className="flex size-12 items-center justify-center rounded-xl border border-border-soft bg-panel text-muted-foreground">
            <Film className="size-6" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">Nenhum projeto na tela</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Crie um vídeo para começar: informe tema, contexto e duração. O YouStudio sugere títulos,
            escreve o roteiro e prepara narração, imagens, tags, thumbnails e descrição.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <form action={createDraftProject}>
              <Button type="submit">
                <Plus className="size-4" /> Novo vídeo
              </Button>
            </form>
            <ImportProjectButton />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Também é possível retomar um projeto exportado: importe o .zip e continue na mesma etapa.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((p) => {
          const prog = progresso(p.etapaAtual);
          const pct = (prog.atual / prog.total) * 100;
          return (
            <li key={p.id}>
              <Card className="flex h-full flex-col transition-colors hover:border-border">
                <CardContent className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{p.formato === 'shorts' ? 'Shorts' : 'Vídeo longo'}</Badge>
                    <Badge variant="outline">{IDIOMA_INFO[p.idioma].curto}</Badge>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {p.atualizadoEm}
                    </span>
                  </div>

                  <Link
                    href={`/projetos/${p.id}/${p.etapaAtual}`}
                    className="group/link -m-1 rounded-md p-1"
                  >
                    <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] group-hover/link:text-brand-soft">
                      {p.tituloEscolhido || p.ideia || p.tema || 'Vídeo sem título'}
                    </h2>
                  </Link>

                  <div className="mt-auto">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground">
                        Etapa {prog.atual} de {prog.total}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{prog.label}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-3">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => duplicar(p)}
                        disabled={duplicando === p.id}
                      >
                        {duplicando === p.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        <span className="sr-only sm:not-sr-only">Duplicar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="px-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                        onClick={() => setAApagar(p)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only sm:not-sr-only">Apagar</span>
                      </Button>
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

      <Dialog
        open={aApagar !== null}
        onClose={() => setAApagar(null)}
        tone="danger"
        title="Apagar este projeto?"
        description={
          aApagar
            ? `"${aApagar.tituloEscolhido || aApagar.ideia || aApagar.tema || 'Vídeo sem título'}" será removido com roteiro, narrações, imagens e vídeo. Você poderá desfazer por alguns segundos.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAApagar(null)}>
              Cancelar
            </Button>
            <Button variant="destructive-solid" onClick={confirmarExclusao}>
              <Trash2 className="size-4" /> Apagar projeto
            </Button>
          </>
        }
      />
    </>
  );
}
