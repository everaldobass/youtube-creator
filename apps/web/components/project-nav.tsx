'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, Lock } from 'lucide-react';
import { STEPS } from '@yt/shared';
import { cn } from '@/lib/utils';

/**
 * Trilho de etapas: linha do tempo vertical no desktop e lista expansível no
 * celular. A etapa atual é o "playhead" — o único ponto vermelho do trilho.
 */
export function ProjectNav({ projectId, etapaAtual }: { projectId: string; etapaAtual: string }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const atualIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.slug === etapaAtual),
  );
  const viewIdx = Math.max(
    0,
    STEPS.findIndex((s) => pathname.endsWith(`/${s.slug}`)),
  );
  const posicao = viewIdx >= 0 ? viewIdx : atualIdx;

  useEffect(() => setAberto(false), [pathname]);

  return (
    <>
      <aside className="hidden w-[260px] shrink-0 border-r border-border-soft bg-panel/50 md:sticky md:top-16 md:flex md:h-[calc(100vh-4rem)] md:flex-col md:self-start md:overflow-y-auto">
        <div className="border-b border-border-soft px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
            Seus vídeos
          </Link>
        </div>

        <nav aria-label="Etapas do vídeo" className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">
            Produção do vídeo
          </p>
          <ol className="relative space-y-0.5">
            {/* Linha do tempo por trás dos marcadores. */}
            <span
              aria-hidden
              className="absolute bottom-4 left-[21px] top-4 w-px bg-border-soft"
            />
            {STEPS.map((step, i) => {
              const bloqueada = i > atualIdx;
              const concluida = i < posicao;
              const ativa = i === posicao;
              const proxima = i === atualIdx + 1;

              const conteudo = (
                <>
                  <span
                    className={cn(
                      'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors',
                      ativa && 'border-brand bg-brand text-[#1a0505]',
                      concluida &&
                        !ativa &&
                        'border-success/50 bg-panel text-success',
                      !ativa &&
                        !concluida &&
                        'border-border bg-panel text-muted-foreground',
                    )}
                  >
                    {concluida && !ativa ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[13px] leading-snug',
                        ativa ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </span>
                    {ativa && (
                      <span className="mt-0.5 block text-[11px] text-brand-soft">Você está aqui</span>
                    )}
                    {bloqueada && proxima && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                        Conclua a etapa {atualIdx + 1} para liberar
                      </span>
                    )}
                  </span>
                  {bloqueada && <Lock className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />}
                </>
              );

              const cls = cn(
                'flex items-center gap-3 rounded-lg py-2 pl-2 pr-2.5',
                ativa && 'bg-card',
                !ativa && !bloqueada && 'hover:bg-card/60',
                bloqueada && 'cursor-not-allowed',
              );

              return (
                <li key={step.slug}>
                  {bloqueada ? (
                    <div
                      className={cls}
                      aria-disabled="true"
                      title={`Conclua a etapa ${i} para liberar ${step.label}`}
                    >
                      {conteudo}
                      <span className="sr-only">
                        Bloqueada. Conclua a etapa {i} para liberar.
                      </span>
                    </div>
                  ) : (
                    <Link
                      href={`/projetos/${projectId}/${step.slug}`}
                      className={cls}
                      aria-current={ativa ? 'step' : undefined}
                    >
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="border-t border-border-soft px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Progresso da produção</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-brand"
                style={{ width: `${((posicao + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {posicao + 1}/{STEPS.length}
            </span>
          </div>
        </div>
      </aside>

      {/* Celular: barra compacta que abre a lista completa. */}
      <div className="sticky top-16 z-40 border-b border-border-soft bg-panel/95 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls="etapas-mobile"
          className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-brand/40 bg-brand/10 text-[12px] font-semibold tabular-nums text-brand-soft">
            {posicao + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-muted-foreground">
              Etapa {posicao + 1} de {STEPS.length}
            </span>
            <span className="block truncate text-[13px] font-medium">{STEPS[posicao].label}</span>
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
            aria-hidden
          />
        </button>

        {aberto && (
          <nav
            id="etapas-mobile"
            aria-label="Etapas do vídeo"
            className="animate-surgir max-h-[70vh] overflow-y-auto border-t border-border-soft px-3 py-3"
          >
            <ol className="space-y-0.5">
              {STEPS.map((step, i) => {
                const bloqueada = i > atualIdx;
                const concluida = i < posicao;
                const ativa = i === posicao;
                const conteudo = (
                  <>
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                        ativa && 'border-brand bg-brand text-[#1a0505]',
                        concluida && !ativa && 'border-success/50 text-success',
                        !ativa && !concluida && 'border-border text-muted-foreground',
                      )}
                    >
                      {concluida && !ativa ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px]',
                          ativa ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {step.label}
                      </span>
                      {bloqueada && i === atualIdx + 1 && (
                        <span className="block text-[11px] text-muted-foreground/80">
                          Conclua a etapa {atualIdx + 1} para liberar
                        </span>
                      )}
                    </span>
                    {bloqueada && <Lock className="size-3.5 text-muted-foreground/70" aria-hidden />}
                  </>
                );
                return (
                  <li key={step.slug}>
                    {bloqueada ? (
                      <div
                        className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2"
                        aria-disabled="true"
                        title={`Conclua a etapa ${i} para liberar ${step.label}`}
                      >
                        {conteudo}
                      </div>
                    ) : (
                      <Link
                        href={`/projetos/${projectId}/${step.slug}`}
                        aria-current={ativa ? 'step' : undefined}
                        className={cn(
                          'flex min-h-12 items-center gap-3 rounded-lg px-2 py-2',
                          ativa ? 'bg-card' : 'hover:bg-card/70',
                        )}
                      >
                        {conteudo}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>
    </>
  );
}
