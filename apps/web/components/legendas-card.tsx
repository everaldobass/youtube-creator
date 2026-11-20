'use client';

import { useEffect, useRef, useState } from 'react';
import { Captions, Loader2, ScanSearch } from 'lucide-react';
import {
  ROTULO_ESTILO,
  type LegendaEstilo,
  type LegendaPosicao,
  type LegendasAnalise,
  type ProjectDto,
  type SceneDto,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_URL, apiFetch, patch } from '@/lib/client-api';
import { palavrasDaPrevia } from '@/lib/legendas';
import { cn } from '@/lib/utils';

const AMOSTRA = 'Ele não tem pedigree, mas conquistou o país inteiro.';

/**
 * Liga e desliga as legendas queimadas no MP4 e ajusta tamanho, posição, traço,
 * fonte e cor de destaque. A prévia imita o resultado do FFmpeg: caixa escura,
 * texto no estilo escolhido e palavra falada em lilás.
 */
export function LegendasCard({
  projectId,
  valor,
  onChange,
  tamanho,
  onTamanho,
  posicao,
  onPosicao,
  estilo,
  onEstilo,
  fonte,
  onFonte,
  cor,
  onCor,
  cena,
  vertical,
}: {
  projectId: string;
  valor: boolean;
  onChange: (ativo: boolean) => void;
  tamanho: number;
  onTamanho: (tamanho: number) => void;
  posicao: LegendaPosicao;
  onPosicao: (posicao: LegendaPosicao) => void;
  estilo: LegendaEstilo;
  onEstilo: (estilo: LegendaEstilo) => void;
  fonte: string;
  onFonte: (fonte: string) => void;
  cor: string;
  onCor: (cor: string) => void;
  cena: SceneDto | undefined;
  vertical: boolean;
}) {
  const [salvando, setSalvando] = useState(false);
  const [salvandoTamanho, setSalvandoTamanho] = useState(false);
  const [salvandoCampo, setSalvandoCampo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  const [analise, setAnalise] = useState<LegendasAnalise | null>(null);
  const [verificando, setVerificando] = useState(false);
  const ultimoSalvo = useRef(tamanho);
  const ultimaCor = useRef(cor);
  const ultimaFonte = useRef(fonte);
  const ultimoEstilo = useRef(estilo);
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

  async function escolherPosicao(nova: LegendaPosicao) {
    if (nova === posicao || salvandoCampo) return;
    const anterior = posicao;
    onPosicao(nova);
    setSalvandoCampo(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendaPosicao: nova });
    } catch (e) {
      onPosicao(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a posição.');
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function escolherEstilo(novo: LegendaEstilo) {
    if (novo === estilo || salvandoCampo) return;
    const anterior = estilo;
    onEstilo(novo);
    ultimoEstilo.current = novo;
    setSalvandoCampo(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendaEstilo: novo });
    } catch (e) {
      ultimoEstilo.current = anterior;
      onEstilo(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o estilo do texto.');
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function salvarCor() {
    if (salvandoCampo || ultimaCor.current === cor) return;
    const anterior = ultimaCor.current;
    ultimaCor.current = cor;
    setSalvandoCampo(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendaCor: cor });
    } catch (e) {
      ultimaCor.current = anterior;
      onCor(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a cor.');
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function salvarFonte() {
    const nova = fonte.trim() || 'Noto Sans';
    if (salvandoCampo || nova === ultimaFonte.current) {
      onFonte(nova);
      return;
    }
    const anterior = ultimaFonte.current;
    ultimaFonte.current = nova;
    setSalvandoCampo(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { legendaFonte: nova });
    } catch (e) {
      ultimaFonte.current = anterior;
      onFonte(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a fonte.');
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function verificarLegendas() {
    setVerificando(true);
    setErro(null);
    try {
      setAnalise(await apiFetch<LegendasAnalise>(`/projects/${projectId}/quality/captions`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível verificar as legendas');
    } finally {
      setVerificando(false);
    }
  }

  const faladas = Math.min(palavras.length, passo);
  const traco =
    estilo === 'negrito'
      ? { fontWeight: 700, fontStyle: 'normal' as const }
      : estilo === 'italico'
        ? { fontWeight: 400, fontStyle: 'italic' as const }
        : { fontWeight: 400, fontStyle: 'normal' as const };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Captions className="size-4 text-ai-soft" /> Legendas sincronizadas
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O texto da narração é queimado no vídeo dentro de uma caixa escura, no estilo escolhido,
            com cada palavra destacada em lilás no momento em que é falada.
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
              posicao === 'topo'
                ? 'top-[5%]'
                : posicao === 'meio'
                  ? 'top-1/2 -translate-y-1/2'
                  : vertical
                    ? 'bottom-[6%]'
                    : 'bottom-[5%]',
            )}
          >
            <p
              className="legenda-caixa legenda-previa text-center leading-snug text-white"
              style={{
                fontSize: `${(vertical ? 9 : 11) * tamanho / 100}px`,
                fontFamily: fonte,
                ...traco,
              }}
            >
              {palavras.map((palavra, i) => (
                <span
                  key={`${palavra.texto}-${i}`}
                  style={i < faladas ? { color: cor } : undefined}
                >
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
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              Queimar legendas no vídeo final
              <span className="mt-1 block text-xs text-muted-foreground">
                A fonte ({fonte} {estilo === 'normal' ? 'normal' : estilo === 'italico' ? 'itálica' : 'em negrito'}) precisa estar instalada no
                servidor. Se desligar, o MP4 fica sem legendas, mas o pacote ZIP continua com o arquivo{' '}
                <code>legendas.srt</code>.
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
              className="mt-2 h-2 w-full cursor-pointer accent-brand"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              100% é o tamanho recomendado. Aumente para Shorts ou quando o texto for curto; diminua para
              frases longas.
            </p>
          </div>

          <div>
            <span className="text-xs font-medium">Posição na tela</span>
            <div className="mt-1 flex gap-1">
              {(['baixo', 'meio', 'topo'] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={posicao === p ? 'default' : 'outline'}
                  onClick={() => escolherPosicao(p)}
                  disabled={salvandoCampo}
                >
                  {p === 'baixo' ? 'Embaixo' : p === 'meio' ? 'No meio' : 'No topo'}
                </Button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              No topo ou no meio, confira na prévia se a legenda cobre personagens ou informações
              importantes.
            </p>
          </div>

          <div>
            <span className="text-xs font-medium">Traço do texto</span>
            <div className="mt-1 flex gap-1" role="group" aria-label="Estilo do texto da legenda">
              {(['normal', 'negrito', 'italico'] as const).map((e) => (
                <Button
                  key={e}
                  size="sm"
                  variant={estilo === e ? 'default' : 'outline'}
                  onClick={() => escolherEstilo(e)}
                  disabled={salvandoCampo}
                  aria-pressed={estilo === e}
                  className={cn(
                    e === 'negrito' && 'font-bold',
                    e === 'italico' && 'font-bold italic',
                  )}
                >
                  {ROTULO_ESTILO[e]}
                </Button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Vale para a queima no MP4. O arquivo <code>legendas.srt</code> do ZIP continua em texto
              puro, sem formatação.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="legenda-fonte" className="text-xs font-medium">
                Família da fonte
              </Label>
              <Input
                id="legenda-fonte"
                value={fonte}
                onChange={(e) => onFonte(e.target.value)}
                onBlur={salvarFonte}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                A fonte precisa estar instalada no servidor. Padrão: Noto Sans.
              </p>
            </div>
            <div>
              <Label htmlFor="legenda-cor" className="text-xs font-medium">
                Cor do destaque
              </Label>
              <input
                id="legenda-cor"
                type="color"
                value={cor}
                onChange={(e) => onCor(e.target.value)}
                onBlur={salvarCor}
                className="mt-1 h-10 w-14 cursor-pointer rounded-md border bg-background p-1"
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">Verificação de legibilidade</span>
              <Button size="sm" variant="outline" onClick={verificarLegendas} disabled={verificando}>
                {verificando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ScanSearch className="size-4" />
                )}
                {verificando ? 'Verificando...' : 'Verificar legendas'}
              </Button>
            </div>
            {analise ? (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-muted-foreground">
                  {analise.cenas.reduce((a, c) => a + c.blocos, 0)} blocos · até{' '}
                  {analise.opcoes.maxCaracteres} caracteres por bloco · {analise.opcoes.fonteNome}{' '}
                  {analise.opcoes.fonte}px
                </p>
                {analise.avisos.map((a) => (
                  <p key={a} className="text-warning">
                    {a}
                  </p>
                ))}
                {analise.cenas.filter((c) => c.avisos.length).length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-auto">
                    {analise.cenas
                      .filter((c) => c.avisos.length)
                      .map((c) => (
                        <li key={c.numero}>
                          <Badge variant="warning">Cena {c.numero}</Badge>{' '}
                          <span className="text-muted-foreground">{c.avisos.join(' ')}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-success">Nenhuma palavra cortada ou legenda longa detectada.</p>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Confere palavras maiores que a linha e blocos rápidos demais, usando as mesmas regras
                da queima no MP4.
              </p>
            )}
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
