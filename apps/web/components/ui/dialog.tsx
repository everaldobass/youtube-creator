'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Diálogo modal do app, sem depender de biblioteca externa.
 * Fecha com Esc ou clique no fundo, prende o foco dentro e devolve o foco
 * ao elemento que abriu.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = 'default',
  labelledBy,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: 'default' | 'danger';
  labelledBy?: string;
  /** Diálogos com resumo/preview precisam de mais largura no desktop. */
  wide?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const anterior = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    anterior.current = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focar = () => {
      const alvo = caixa.current?.querySelector<HTMLElement>(
        '[data-autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (alvo ?? caixa.current)?.focus();
    };
    const t = window.setTimeout(focar, 20);

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = Array.from(
        caixa.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflow;
      (anterior.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-sm"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? 'dialog-titulo'}
        tabIndex={-1}
        className={cn(
          'animate-surgir relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-panel p-5 shadow-2xl sm:rounded-xl',
          wide ? 'max-w-md sm:max-w-2xl' : 'max-w-md',
          tone === 'danger' ? 'border-danger/40' : 'border-border-soft',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={labelledBy ?? 'dialog-titulo'} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Fechar diálogo"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {footer && <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
