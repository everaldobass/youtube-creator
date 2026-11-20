import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
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
    <div className="sticky bottom-0 z-20 -mx-4 mt-10 border-t border-border-soft bg-background/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
      <div className="flex items-center justify-between gap-4">
        {voltarHref ? (
          <Button asChild variant="ghost">
            <Link href={voltarHref}>
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {dica && (
            <p className="hidden max-w-[42ch] text-right text-xs leading-snug text-muted-foreground sm:block">
              {dica}
            </p>
          )}
          <Button onClick={onContinuar} disabled={continuarDisabled || busy} size="lg">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                {continuarLabel} <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
