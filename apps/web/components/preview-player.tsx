'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { EfeitoCamera, SceneDto } from '@yt/shared';
import { Button } from '@/components/ui/button';
import { API_URL } from '@/lib/client-api';
import { classeDaCena } from '@/lib/camera';
import { palavrasDaPrevia, palavrasFaladas } from '@/lib/legendas';
import { cn } from '@/lib/utils';

/** Prévia leve no navegador: mostra a imagem de cada cena enquanto toca o áudio dela, em sequência. */
export function PreviewPlayer({
  scenes,
  vertical,
  efeitoCamera = 'nenhum',
  legendas = false,
  escala = 100,
}: {
  scenes: SceneDto[];
  vertical: boolean;
  efeitoCamera?: EfeitoCamera;
  legendas?: boolean;
  escala?: number;
}) {
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const cena = scenes[i];
  const ultima = i >= scenes.length - 1;
  const movimento = cena ? classeDaCena(efeitoCamera, cena.numero) : '';
  const segundos = cena ? Math.max(0.3, (cena.audioDuracaoMs ?? cena.duracaoSegundos * 1000) / 1000) : 1;

  const palavras = useMemo(() => palavrasDaPrevia(cena?.textoNarrado ?? ''), [cena?.textoNarrado]);
  const faladas = palavrasFaladas(palavras, tempo / segundos);

  useEffect(() => {
    if (tocando) audio.current?.play().catch(() => setTocando(false));
  }, [i, tocando]);

  useEffect(() => {
    setTempo(0);
  }, [i]);

  if (!cena) return null;

  function alternar() {
    if (tocando) {
      audio.current?.pause();
      setTocando(false);
    } else {
      setTocando(true);
      audio.current?.play().catch(() => setTocando(false));
    }
  }

  return (
    <div className={cn('mx-auto', vertical ? 'max-w-xs' : 'max-w-4xl')}>
      <div className={cn('relative overflow-hidden rounded-xl border bg-black', vertical ? 'aspect-[9/16]' : 'aspect-video')}>
        {cena.temImagem && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${cena.id}-${efeitoCamera}`}
            src={`${API_URL}/scenes/${cena.id}/image?v=${cena.versaoMidia}`}
            alt={`Cena ${cena.numero}`}
            style={{
              animationDuration: `${segundos}s`,
              animationPlayState: tocando ? 'running' : 'paused',
            }}
            className={cn('size-full', movimento ? 'object-cover' : 'object-contain', movimento)}
          />
        )}
        {legendas ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 flex justify-center px-4',
              vertical ? 'bottom-[6%]' : 'bottom-[4.5%]',
            )}
          >
            <p
              className={cn('legenda-caixa legenda-previa text-center leading-snug text-white', vertical && 'max-w-full')}
              style={{ fontSize: `${(vertical ? 15 : 18) * escala / 100}px` }}
            >
              {palavras.map((palavra, indice) => (
                <span
                  key={`${palavra.texto}-${indice}`}
                  className={indice < faladas ? 'text-[#c6a6ff]' : undefined}
                >
                  {palavra.texto}
                  {indice < palavras.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>
        ) : (
          <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-center text-sm leading-snug text-white">
            {cena.textoNarrado}
          </p>
        )}
      </div>
      <audio
        ref={audio}
        src={cena.temAudio ? `${API_URL}/scenes/${cena.id}/audio?v=${cena.versaoMidia}` : undefined}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onEnded={() => (ultima ? setTocando(false) : setI((n) => n + 1))}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Cena {cena.numero} de {scenes.length}
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Cena anterior" disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))}>
            <SkipBack className="size-4" />
          </Button>
          <Button size="sm" onClick={alternar}>
            {tocando ? <Pause className="size-4" /> : <Play className="size-4" />}
            {tocando ? 'Pausar' : 'Reproduzir'}
          </Button>
          <Button size="sm" variant="ghost" aria-label="Próxima cena" disabled={ultima} onClick={() => setI((n) => n + 1)}>
            <SkipForward className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="Voltar ao início" onClick={() => { setI(0); setTocando(false); audio.current?.pause(); }}>
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
