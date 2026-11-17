'use client';

import { useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Music,
  Pause,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  MUSICA_MIMES,
  type MusicResponse,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL, apiFetch, del, patch, post } from '@/lib/client-api';

const MAX_BYTES = 30 * 1024 * 1024;
const MIMES = MUSICA_MIMES as readonly string[];

function mimeDoArquivo(arquivo: File): string {
  if (MIMES.includes(arquivo.type)) return arquivo.type;
  const ext = arquivo.name.split('.').pop()?.toLowerCase();
  const porExt: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return ext ? (porExt[ext] ?? '') : '';
}

const Biblioteca = 'https://www.youtube.com/audiolibrary';

export function MusicCard({
  projectId,
  initial,
  onChange,
}: {
  projectId: string;
  initial: MusicResponse;
  onChange?: (musica: MusicResponse) => void;
}) {
  const [data, setData] = useState(initial);
  const [volume, setVolume] = useState(initial.volume);
  const [ducking, setDucking] = useState(initial.ducking);
  const [credito, setCredito] = useState(initial.escolhida?.credito ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [tocando, setTocando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const previa = useRef<HTMLAudioElement>(null);

  function aplicar(r: MusicResponse) {
    setData(r);
    setVolume(r.volume);
    setDucking(r.ducking);
    setCredito(r.escolhida?.credito ?? '');
    onChange?.(r);
  }

  async function executar(fn: () => Promise<MusicResponse>) {
    setErro(null);
    setEnviando(true);
    previa.current?.pause();
    setTocando(null);
    try {
      aplicar(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado com a música.');
    } finally {
      setEnviando(false);
    }
  }

  async function salvarConfig(parcial: { volume?: number; ducking?: boolean; credito?: string }) {
    setErro(null);
    try {
      aplicar(await patch<MusicResponse>(`/projects/${projectId}/music`, parcial));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a configuração.');
    }
  }

  function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    const mime = mimeDoArquivo(arq);
    if (!mime) {
      setErro('Use um arquivo MP3, M4A, WAV, OGG ou FLAC.');
      return;
    }
    if (arq.size > MAX_BYTES) {
      setErro('A música passa de 30 MB.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () =>
      executar(() =>
        post<MusicResponse>(`/projects/${projectId}/music/upload`, {
          base64: String(leitor.result),
          mime,
          nome: arq.name.replace(/\.[^.]+$/, '').slice(0, 120),
        }),
      );
    leitor.readAsDataURL(arq);
  }

  function usarDaBiblioteca(arquivoNome: string) {
    executar(() => post<MusicResponse>(`/projects/${projectId}/music/library`, { arquivo: arquivoNome }));
  }

  function ouvir(arquivoNome: string) {
    if (tocando === arquivoNome) {
      previa.current?.pause();
      setTocando(null);
      return;
    }
    if (!previa.current) return;
    previa.current.src = `${API_URL}/music/library/audio?arquivo=${encodeURIComponent(arquivoNome)}`;
    previa.current
      .play()
      .then(() => setTocando(arquivoNome))
      .catch(() => setErro('Não foi possível tocar esta música.'));
  }

  async function remover() {
    await executar(async () => {
      await del(`/projects/${projectId}/music`);
      return apiFetch<MusicResponse>(`/projects/${projectId}/music`);
    });
  }

  async function copiarCredito() {
    try {
      await navigator.clipboard.writeText(credito);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Music className="size-4 text-ai" /> Música de fundo
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Envie uma música própria ou use uma faixa da sua biblioteca local de músicas livres. Ela toca
            abaixo da narração, com fade no início e no fim.
          </p>
        </div>
        {enviando && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Preparando
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <ErrorBox message={erro} />
        </div>
      )}

      {data.escolhida ? (
        <div className="mt-4 rounded-lg border bg-panel p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{data.escolhida.nome}</p>
              <p className="text-xs text-muted-foreground">
                {[data.escolhida.artista, data.escolhida.origem].filter(Boolean).join(' · ') ||
                  'Arquivo próprio'}
              </p>
            </div>
            <Button size="sm" variant="ghost" disabled={enviando} onClick={remover}>
              <Trash2 className="size-4" /> Remover
            </Button>
          </div>

          <audio
            key={data.escolhida.versao}
            controls
            preload="none"
            className="mt-3 w-full"
            src={`${API_URL}/projects/${projectId}/music/audio?v=${encodeURIComponent(data.escolhida.versao)}`}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="musica-volume" className="flex items-center justify-between text-xs font-medium">
                <span>Volume da música</span>
                <span className="text-muted-foreground">{volume}%</span>
              </label>
              <input
                id="musica-volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                onPointerUp={() => salvarConfig({ volume })}
                onKeyUp={() => salvarConfig({ volume })}
                onBlur={() => salvarConfig({ volume })}
                className="mt-2 h-2 w-full cursor-pointer accent-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entre 15% e 25% a música fica discreta atrás da voz.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={ducking}
                onChange={(e) => {
                  setDucking(e.target.checked);
                  void salvarConfig({ ducking: e.target.checked });
                }}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                Abaixar a música automaticamente enquanto houver narração
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Deixe marcado para a voz ficar sempre clara.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4">
            <label htmlFor="musica-credito" className="text-xs font-medium">
              Créditos para colar na descrição do YouTube
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="musica-credito"
                value={credito}
                placeholder="Ex.: Música: Faixa — Autor (Biblioteca de Áudio do YouTube)"
                onChange={(e) => setCredito(e.target.value)}
                onBlur={() => salvarConfig({ credito })}
                maxLength={500}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-10 shrink-0"
                disabled={!credito.trim()}
                onClick={copiarCredito}
              >
                {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Monte o vídeo de novo para ouvir a música no MP4 final.
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Nenhuma música escolhida. O vídeo será montado só com a narração.
        </p>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Biblioteca local</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Faixas livres que você colocou em <code className="break-all">{data.pastaBiblioteca}</code>.
          </p>

          {data.biblioteca.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <p>A biblioteca está vazia.</p>
              <p className="mt-2">
                Baixe faixas gratuitas na{' '}
                <a
                  href={Biblioteca}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Biblioteca de Áudio do YouTube <ExternalLink className="size-3" />
                </a>{' '}
                e coloque os arquivos na pasta acima. O YouTube não oferece uma API pública para o app
                baixar as músicas sozinho.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.biblioteca.map((m) => {
                const escolhida =
                  data.escolhida?.nome === m.nome && data.escolhida?.artista === m.artista;
                return (
                  <li key={m.arquivo} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{m.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[m.artista, m.origem].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Ouvir ${m.nome}`}
                        onClick={() => ouvir(m.arquivo)}
                      >
                        {tocando === m.arquivo ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={escolhida ? 'outline' : 'default'}
                        disabled={enviando || escolhida}
                        onClick={() => usarDaBiblioteca(m.arquivo)}
                      >
                        {escolhida ? 'Em uso' : 'Usar'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold">Enviar música própria</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            MP3, M4A, WAV, OGG ou FLAC, até 30 MB. Use músicas que você tenha o direito de publicar.
          </p>
          <input
            ref={arquivo}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/*,.mp3,.m4a,.wav,.ogg,.flac"
            className="hidden"
            onChange={enviarArquivo}
          />
          <Button
            variant="outline"
            className="mt-3"
            disabled={enviando}
            onClick={() => arquivo.current?.click()}
          >
            <Upload className="size-4" /> Escolher arquivo de música
          </Button>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Dica: a Biblioteca de Áudio do YouTube é gratuita para criadores, mas algumas faixas pedem
            atribuição. Cole o crédito no campo acima para não esquecer na publicação.
          </p>
        </div>
      </div>

      <audio ref={previa} className="hidden" onEnded={() => setTocando(null)} />
    </Card>
  );
}
