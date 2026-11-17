import { cn } from '@/lib/utils';

/**
 * Cabeçalho padrão das etapas do projeto: caixa alinhada ao conteúdo (1022 px),
 * com a posição na linha de produção, título e, opcionalmente, descrição e ações.
 * A régua de etapas é informação, não enfeite: mostra onde o vídeo está.
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

  const cabecalho = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">{etapa}</span>
        {total > 0 && (
          <span className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full',
                  i + 1 === atual ? 'w-5 bg-primary' : 'w-2.5',
                  i + 1 < atual && 'bg-primary/50',
                  i + 1 > atual && 'bg-border',
                )}
              />
            ))}
          </span>
        )}
        {meta}
      </div>
      <h1 className="mt-2 text-[2rem] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h1>
      {description && (
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );

  return (
    <section
      className={cn(
        'flex min-h-[150px] w-full items-center rounded-xl border border-border bg-panel px-6 py-4 sm:px-8',
        className,
      )}
    >
      {footer ? (
        <div className="w-full">
          {cabecalho}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">{footer}</div>
            {actions && (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-6">
          {cabecalho}
          {actions && (
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
