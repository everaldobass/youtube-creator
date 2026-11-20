'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tom = 'success' | 'error' | 'info';

export interface Aviso {
  id: number;
  titulo: string;
  descricao?: string;
  tom?: Tom;
  /** Rótulo de uma ação (ex.: "Desfazer"). */
  acaoRotulo?: string;
  onAcao?: () => void;
  duracao?: number;
}

let avisos: Aviso[] = [];
let proximoId = 1;
const ouvintes = new Set<() => void>();

function notificar() {
  for (const ouvinte of ouvintes) ouvinte();
}

/** Mostra um aviso temporário no canto da tela. Pode ser chamado de qualquer componente cliente. */
export function toast(aviso: Omit<Aviso, 'id'>) {
  const item: Aviso = { id: proximoId++, tom: 'info', duracao: 6000, ...aviso };
  avisos = [...avisos, item];
  notificar();
  if (item.duracao && item.duracao > 0) {
    window.setTimeout(() => removerAviso(item.id), item.duracao);
  }
  return item.id;
}

function removerAviso(id: number) {
  avisos = avisos.filter((a) => a.id !== id);
  notificar();
}

const ESTILO: Record<Tom, { caixa: string; icone: React.ComponentType<{ className?: string }> }> = {
  success: { caixa: 'border-success/40', icone: CheckCircle2 },
  error: { caixa: 'border-danger/40', icone: AlertCircle },
  info: { caixa: 'border-info/40', icone: Info },
};

/** Montado uma vez no layout raiz. */
export function Toaster() {
  const [lista, setLista] = useState<Aviso[]>(avisos);

  useEffect(() => {
    const ouvinte = () => setLista(avisos);
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

  if (lista.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
    >
      {lista.map((a) => {
        const tom = a.tom ?? 'info';
        const estilo = ESTILO[tom];
        const Icone = estilo.icone;
        return (
          <div
            key={a.id}
            className={cn(
              'animate-surgir pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-panel p-3.5 shadow-2xl',
              estilo.caixa,
            )}
          >
            <Icone
              className={cn(
                'mt-0.5 size-4 shrink-0',
                tom === 'success' ? 'text-success' : tom === 'error' ? 'text-danger' : 'text-info',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{a.titulo}</p>
              {a.descricao && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{a.descricao}</p>
              )}
              {a.acaoRotulo && a.onAcao && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 h-7 px-2 text-xs text-foreground"
                  onClick={() => {
                    a.onAcao?.();
                    removerAviso(a.id);
                  }}
                >
                  {a.acaoRotulo}
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              aria-label="Fechar aviso"
              onClick={() => removerAviso(a.id)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
