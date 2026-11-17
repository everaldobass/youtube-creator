import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-2xl font-semibold">Projeto não encontrado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ele pode ter sido apagado. Volte à lista para abrir outro vídeo.
      </p>
      <Button asChild className="mt-6"><Link href="/">Ver meus vídeos</Link></Button>
    </div>
  );
}
