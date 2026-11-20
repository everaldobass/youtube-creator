'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, ListVideo, Menu, Plus, Settings2, X } from 'lucide-react';
import { createDraftProject } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Meus vídeos', icon: ListVideo },
  { href: '/configuracoes', label: 'Configurações', icon: Settings2 },
] as const;

/** Menu fixo no topo. Abaixo de 640 px os links vivem numa gaveta aberta pelo botão de menu. */
export function SiteHeader() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  // Fecha a gaveta ao trocar de tela e com Esc.
  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('keydown', fechar);
    return () => document.removeEventListener('keydown', fechar);
  }, [aberto]);

  const ativo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border-soft bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md"
          aria-label="YouStudio — início"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Clapperboard className="size-5" aria-hidden />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">
            You<span className="text-brand">Studio</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Navegação principal">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const atual = ativo(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={atual ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  atual
                    ? 'bg-card text-foreground'
                    : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                {atual && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <form action={createDraftProject} className="ml-auto sm:ml-1">
          <Button type="submit" size="sm" className="hidden sm:inline-flex">
            <Plus className="size-4" /> Novo vídeo
          </Button>
          <Button type="submit" size="icon-sm" className="sm:hidden" aria-label="Novo vídeo">
            <Plus className="size-4" />
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="sm:hidden"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
          aria-controls="menu-mobile"
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </div>

      {aberto && (
        <nav
          id="menu-mobile"
          aria-label="Navegação principal"
          className="animate-surgir border-t border-border-soft bg-panel px-4 py-3 sm:hidden"
        >
          <ul className="space-y-1">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const atual = ativo(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={atual ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm',
                      atual
                        ? 'bg-card font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-card hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
