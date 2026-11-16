'use client';

import { useEffect, useRef, useState } from 'react';
import { Captions, Loader2 } from 'lucide-react';
import type { ProjectDto, SceneDto } from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Card } from '@/components/ui/card';
import { API_URL, patch } from '@/lib/client-api';
import { palavrasDaPrevia } from '@/lib/legendas';
import { cn } from '@/lib/utils';

const AMOSTRA = 'Ele não tem pedigree, mas conquistou o país inteiro.';

/**
 * Liga e desliga as legendas queimadas no MP4 e ajusta o tamanho da fonte.
 * A prévia imita o resultado do FFmpeg: caixa escura, negrito e palavra falada em lilás.
 */
export function LegendasCard({
  projectId,
  valor,
  onChange,
  tamanho,
  onTamanho,
  cena,
  vertical,
}: {
  projectId: string;
  valor: boolean;
  onChange: (ativo: boolean) => void;
  tamanho: number;
  onTamanho: (tamanho: number) => void;
  cena: SceneDto | undefined;
  vertical: boolean;
}) {
  const [salvando, setSalvando] = useState(false);
  const [salvandoTamanho, setSalvandoTamanho] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  const ultimoSalvo = useRef(tamanho);
  const palavras = palavrasDaPrevia(AMOSTRA);

  useEffect(() => {
    if (!valor) {
      setPasso(0);
      return;
    }
    const id = setInterval(() => {
      setPasso((n) => (n > palavras.length ? 0 : n + 1));
    }, 190);
    return () => clearInterval(id);
  }, [valor, palavras.length]);

  async function alternar(ativo: boolean) {
    if (salvando || ativo === valor) return;
    onChange(ativo);
    setSalvando(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendasAtivas: ativo });
    } catch (e) {
      onChange(!ativo);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a escolha das legendas.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarTamanho() {
    // Vários eventos disparam juntos (pointer up, blur); salva só quando mudou.
    if (salvandoTamanho || ultimoSalvo.current === tamanho) return;
    const anterior = ultimoSalvo.current;
    ultimoSalvo.current = tamanho;
    setSalvandoTamanho(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendaTamanho: tamanho });
    } catch (e) {
      ultimoSalvo.current = anterior;
      onTamanho(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o tamanho da fonte.');
    } finally {
      setSalvandoTamanho(false);
    }
  }

  const faladas = Math.min(palavras.length, passo);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Captions className="size-4 text-ai" /> Legendas sincronizadas
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O texto da narração é queimado no vídeo em negrito, dentro de uma caixa escura, com cada
            palavra destacada em lilás no momento em que é falada.
          </p>
        </div>
        {(salvando || salvandoTamanho) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Salvando
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <ErrorBox message={erro} />
        </div>
      )}

      <div className={cn('mt-4 grid gap-4', vertical ? 'sm:grid-cols-[13rem_1fr]' : 'sm:grid-cols-[18rem_1fr]')}>
        <div
          className={cn(
            'relative overflow-hidden rounded-lg border bg-black',
            vertical ? 'aspect-[9/16]' : 'aspect-video',
          )}
        >
          {cena?.temImagem ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}/scenes/${cena.id}/image?v=${cena.versaoMidia}`}
              alt={`Prévia da legenda na cena ${cena.numero}`}
              className="size-full object-cover"
            />
          ) : (
            <div className="size-full bg-gradient-to-b from-slate-700 to-slate-900" />
          )}
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 flex justify-center px-2',
              vertical ? 'bottom-[6%]' : 'bottom-[5%]',
            )}
          >
            <p
              className="legenda-caixa legenda-previa text-center leading-snug text-white"
              style={{ fontSize: `${(vertical ? 9 : 11) * tamanho / 100}px` }}
            >
              {palavras.map((palavra, i) => (
                <span key={`${palavra.texto}-${i}`} className={i < faladas ? 'text-[#c6a6ff]' : undefined}>
                  {palavra.texto}
                  {i < palavras.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
            prévia
          </span>
        </div>

        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={valor}
              onChange={(e) => alternar(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Queimar legendas no vídeo final
              <span className="mt-1 block text-xs text-muted-foreground">
                A fonte é a Noto Sans Bold, disponível no servidor. Se desligar, o MP4 fica sem legendas,
                mas o pacote ZIP continua com o arquivo <code>legendas.srt</code>.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="legenda-tamanho" className="flex items-center justify-between text-xs font-medium">
              <span>Tamanho da fonte</span>
              <span className="text-muted-foreground">{tamanho}%</span>
            </label>
            <input
              id="legenda-tamanho"
              type="range"
              min={60}
              max={160}
              step={5}
              value={tamanho}
              onChange={(e) => onTamanho(Number(e.target.value))}
              onPointerUp={salvarTamanho}
              onKeyUp={salvarTamanho}
              onBlur={salvarTamanho}
              className="mt-2 h-2 w-full cursor-pointer accent-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              100% é o tamanho recomendado. Aumente para Shorts ou quando o texto for curto; diminua para
              frases longas.
            </p>
          </div>

          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            O tempo de cada palavra é estimado pelo texto e ajustado pelas pausas reais da narração. Depois
            de mudar o tamanho ou ligar/desligar, monte o vídeo de novo para ver o resultado no MP4.
          </p>
        </div>
      </div>
    </Card>
  );
}
