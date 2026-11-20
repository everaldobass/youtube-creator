import { cn } from '@/lib/utils';

/**
 * Cabeçalho compacto das etapas: posição na produção, título, descrição e
 * ações. A régua mostra onde o vídeo está sem reservar 150 px de altura.
 */
export function StepHeader({
  etapa,
  title,
  description,
  meta,
  actions,
  footer,
  className,
}: {
  etapa: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const posicao = /Etapa\s+(\d+)\s+de\s+(\d+)/.exec(etapa);
  const atual = posicao ? Number(posicao[1]) : 0;
  const total = posicao ? Number(posicao[2]) : 0;

  return (
    <section
      className={cn(
        'w-full rounded-xl border border-border-soft bg-gradient-to-b from-panel to-panel/60 px-4 py-4 sm:px-6 sm:py-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[62ch]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-baseline gap-1.5 rounded-full border border-border-soft bg-card/70 px-2.5 py-0.5 text-[11px] font-medium">
              <span className="text-foreground">Etapa {atual || '—'}</span>
              {total > 0 && <span className="text-muted-foreground">de {total}</span>}
            </span>
            {total > 0 && (
              <span className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: total }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 rounded-full transition-all',
                      i + 1 === atual
                        ? 'w-5 bg-brand'
                        : i + 1 < atual
                          ? 'w-2.5 bg-brand/40'
                          : 'w-2.5 bg-border',
                    )}
                  />
                ))}
              </span>
            )}
            {meta}
          </div>

          <h1 className="mt-2 text-[1.6rem] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[1.75rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {actions && !footer && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
            {actions}
          </div>
        )}
      </div>

      {footer && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-3">
          <div className="min-w-0">{footer}</div>
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
          )}
        </div>
      )}
    </section>
  );
}
