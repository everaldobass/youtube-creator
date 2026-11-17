import Link from 'next/link';
import { Clapperboard, Plus } from 'lucide-react';
import { createDraftProject } from '@/app/actions';
import { Button } from '@/components/ui/button';

/** Menu fixo no topo, com a marca YouStudio em todas as telas. */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Clapperboard className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            You<span className="text-primary">Studio</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1.5" aria-label="Navegação principal">
          <Link
            href="/"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:block"
          >
            Meus vídeos
          </Link>
          <form action={createDraftProject}>
            <Button type="submit" size="sm">
              <Plus className="size-4" /> Novo vídeo
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
