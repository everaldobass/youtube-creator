import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variante = 'error' | 'warning' | 'success' | 'info';

const ESTILO: Record<Variante, { caixa: string; icone: string; titulo: string }> = {
  error: {
    caixa: 'border-danger/40 bg-danger/[0.07]',
    icone: 'text-danger',
    titulo: 'text-danger',
  },
  warning: {
    caixa: 'border-warning/40 bg-warning/[0.07]',
    icone: 'text-warning',
    titulo: 'text-warning-soft',
  },
  success: {
    caixa: 'border-success/40 bg-success/[0.07]',
    icone: 'text-success',
    titulo: 'text-success-soft',
  },
  info: {
    caixa: 'border-info/40 bg-info/[0.07]',
    icone: 'text-info',
    titulo: 'text-info',
  },
};

const ICONE: Record<Variante, React.ComponentType<{ className?: string }>> = {
  error: AlertCircle,
  warning: TriangleAlert,
  success: CheckCircle2,
  info: Info,
};

/**
 * Aviso padronizado. O ícone e o título carregam o significado, para o estado
 * nunca depender só da cor. `aria-live` é ligado quando o aviso é dinâmico.
 */
export function Alert({
  variant = 'info',
  title,
  description,
  children,
  action,
  live = true,
  className,
}: {
  variant?: Variante;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  const estilo = ESTILO[variant];
  const Icone = ICONE[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={live ? (variant === 'error' ? 'assertive' : 'polite') : 'off'}
      className={cn('flex items-start gap-3 rounded-lg border p-3.5', estilo.caixa, className)}
    >
      <Icone className={cn('mt-0.5 size-4 shrink-0', estilo.icone)} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className={cn('font-medium leading-snug', estilo.titulo)}>{title}</p>
        {description && (
          <div className="mt-1 text-[13px] leading-relaxed text-foreground/75">{description}</div>
        )}
        {children && <div className="mt-2 text-[13px] leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
