'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Lock } from 'lucide-react';
import { STEPS } from '@yt/shared';
import { cn } from '@/lib/utils';

/** Dock lateral no desktop; barra compacta "Etapa X de 9" no celular. */
export function ProjectNav({ projectId, etapaAtual }: { projectId: string; etapaAtual: string }) {
  const pathname = usePathname();
  const atualIdx = STEPS.findIndex((s) => s.slug === etapaAtual);
  const viewIdx = STEPS.findIndex((s) => pathname.endsWith(`/${s.slug}`));

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r bg-panel p-4 md:block">
        <Link href="/" className="mb-6 block px-2 text-sm text-muted-foreground hover:text-foreground">
          Voltar para seus vídeos
        </Link>
        <nav aria-label="Etapas do vídeo">
          <ol className="space-y-1">
            {STEPS.map((step, i) => {
              const bloqueada = i > atualIdx;
              const concluida = i < atualIdx;
              const ativa = i === viewIdx;
              const content = (
                <>
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                      ativa && 'border-primary bg-primary text-primary-foreground',
                      concluida && 'border-success text-success',
                    )}
                  >
                    {concluida ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="flex-1 text-left">{step.label}</span>
                  {bloqueada && <Lock className="size-3.5" />}
                </>
              );
              const cls = cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm',
                ativa ? 'bg-card text-foreground' : 'text-muted-foreground',
                bloqueada ? 'cursor-not-allowed opacity-60' : 'hover:bg-card hover:text-foreground',
              );
              return (
                <li key={step.slug}>
                  {bloqueada ? (
                    <div className={cls} aria-disabled="true">{content}</div>
                  ) : (
                    <Link href={`/projetos/${projectId}/${step.slug}`} className={cls}>{content}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>

      <div className="flex items-center justify-between border-b bg-panel px-4 py-3 md:hidden">
        <Link href="/" className="text-sm text-muted-foreground">Seus vídeos</Link>
        <p className="text-sm font-medium">
          Etapa {Math.max(viewIdx, 0) + 1} de {STEPS.length}: {STEPS[Math.max(viewIdx, 0)].label}
        </p>
      </div>
    </>
  );
}
