'use client';

import { useEffect } from 'react';

/** Chama `carregar` a cada `ms` enquanto `ativo` for verdadeiro (ex.: há jobs na fila). */
export function usePolling(carregar: () => Promise<unknown>, ativo: boolean, ms = 1500) {
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      carregar().catch(() => undefined);
    }, ms);
    return () => clearInterval(t);
  }, [carregar, ativo, ms]);
}
