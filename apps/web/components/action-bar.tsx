import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Rodapé fixo de cada etapa: Voltar (secundário) e Aprovar e continuar (primário). */
export function ActionBar({
  voltarHref,
  onContinuar,
  continuarDisabled,
  continuarLabel = 'Aprovar e continuar',
  busy,
  dica,
}: {
  voltarHref?: string;
  onContinuar: () => void;
  continuarDisabled?: boolean;
  continuarLabel?: string;
  busy?: boolean;
  dica?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-10 border-t bg-background/95 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
      <div className="mx-auto flex max-w-[1022px] items-center justify-between gap-4">
        {voltarHref ? (
          <Button asChild variant="outline">
            <Link href={voltarHref}>Voltar</Link>
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-4">
          {dica && <p className="hidden text-sm text-muted-foreground sm:block">{dica}</p>}
          <Button onClick={onContinuar} disabled={continuarDisabled || busy} size="lg">
            {busy ? 'Salvando...' : continuarLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
