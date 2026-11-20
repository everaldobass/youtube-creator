'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, History, Loader2, Mic, Play, RefreshCw, Sparkles, Timer } from 'lucide-react';
import {
  NARRACAO_VELOCIDADE_MAX,
  NARRACAO_VELOCIDADE_MIN,
  formatarTempo,
  type AudioVersaoDto,
  type NarrationResponse,
  type ProjectDto,
  type RoteiroResumo,
  type SceneDto,
} from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { JobError } from '@/components/job-error';
import { StatusBadge } from '@/components/status-badge';
import { StepHeader } from '@/components/step-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, apiFetch, fetchBlob, patch, post } from '@/lib/client-api';
import { jobDoAlvo, jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

export function NarracaoView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: NarrationResponse;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [amostra, setAmostra] = useState<'parada' | 'gerando' | 'tocando'>('parada');
  const [natural, setNatural] = useState(initial.narracaoNatural);
  const [salvandoNatural, setSalvandoNatural] = useState(false);
  const [velocidade, setVelocidade] = useState(initial.narracaoVelocidade);
  const [pronuncia, setPronuncia] = useState(initial.pronuncia);
  const [salvandoConfig, setSalvandoConfig] = useState<'velocidade' | 'pronuncia' | null>(null);
  const [versoes, setVersoes] = useState<Record<string, AudioVersaoDto[]>>({});
  const [carregandoVersoes, setCarregandoVersoes] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const audioAmostra = useRef<HTMLAudioElement | null>(null);
  const ultimaVelocidade = useRef(initial.narracaoVelocidade);

  const carregar = useCallback(async () => {
    setData(await apiFetch<NarrationResponse>(`/projects/${projectId}/narration`));
  }, [projectId]);

  const ativos = jobsAtivos(data.jobs);
  usePolling(carregar, ativos.length > 0);

  useEffect(() => {
    // Uma geração nova invalida a lista de versões carregada.
    setVersoes({});
  }, [data.jobs, data.scenes]);

  const prontas = data.scenes.filter(
    (s) => s.temAudio && s.statusNarracao !== 'desatualizado',
  ).length;
  const total = data.scenes.length;
  const pendentes = total - prontas;
  const tudoPronto = total > 0 && pendentes === 0 && ativos.length === 0;

  async function executar(fn: () => Promise<NarrationResponse>) {
    setErro(null);
    setEnviando(true);
    try {
      setData(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado');
    } finally {
      setEnviando(false);
    }
  }

  async function ouvirAmostra() {
    setErro(null);
    setAmostra('gerando');
    try {
      const blob = await fetchBlob(`/projects/${projectId}/narration/sample`, 'POST');
      const audio = new Audio(URL.createObjectURL(blob));
      audioAmostra.current = audio;
      audio.onended = () => setAmostra('parada');
      setAmostra('tocando');
      await audio.play();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar a amostra');
      setAmostra('parada');
    }
  }

  async function alternarNatural(ativo: boolean) {
    if (salvandoNatural || ativo === natural) return;
    const anterior = natural;
    setNatural(ativo);
    setSalvandoNatural(true);
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { narracaoNatural: ativo });
    } catch (e) {
      setNatural(anterior);
      setErro(
        e instanceof Error ? e.message : 'Não foi possível salvar a configuração da narração.',
      );
    } finally {
      setSalvandoNatural(false);
    }
  }

  async function continuar() {
    setContinuando(true);
    setErro(null);
    try {
      await post(`/projects/${projectId}/narration/approve`);
      await post(`/projects/${projectId}/advance`, { etapa: 'narracao' });
      router.push(`/projetos/${projectId}/imagens`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  async function salvarVelocidade() {
    if (salvandoConfig || ultimaVelocidade.current === velocidade) return;
    const anterior = ultimaVelocidade.current;
    ultimaVelocidade.current = velocidade;
    setSalvandoConfig('velocidade');
    setErro(null);
    try {
      await patch<ProjectDto>(`/projects/${projectId}`, { narracaoVelocidade: velocidade });
    } catch (e) {
      ultimaVelocidade.current = anterior;
      setVelocidade(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a velocidade.');
    } finally {
      setSalvandoConfig(null);
    }
  }

  async function salvarPronuncia() {
    if (salvandoConfig || pronuncia === data.pronuncia) return;
    const anterior = data.pronuncia;
    setSalvandoConfig('pronuncia');
    setErro(null);
    try {
      const projeto = await patch<ProjectDto>(`/projects/${projectId}`, { pronuncia });
      setData((d) => ({ ...d, pronuncia: projeto.pronuncia }));
    } catch (e) {
      setPronuncia(anterior);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a pronúncia.');
    } finally {
      setSalvandoConfig(null);
    }
  }

  async function aprovarCena(id: string) {
    setErro(null);
    try {
      setData(await post<NarrationResponse>(`/scenes/${id}/narration/approve`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível aprovar a cena');
    }
  }

  async function alternarVersoes(s: SceneDto) {
    if (versoes[s.id]) {
      setVersoes((v) => {
        const copia = { ...v };
        delete copia[s.id];
        return copia;
      });
      return;
    }
    setCarregandoVersoes(s.id);
    setErro(null);
    try {
      const lista = await apiFetch<AudioVersaoDto[]>(`/scenes/${s.id}/audio/versions`);
      setVersoes((v) => ({ ...v, [s.id]: lista }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as versões');
    } finally {
      setCarregandoVersoes(null);
    }
  }

  async function usarVersao(sceneId: string, versaoId: string) {
    setErro(null);
    try {
      setData(await post<NarrationResponse>(`/scenes/${sceneId}/audio/versions/${versaoId}/use`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível usar esta versão');
    }
  }

  /** Ajusta a duração planejada da cena ao tempo real do áudio aprovado. */
  async function ajustarDuracao(s: SceneDto) {
    if (!s.audioDuracaoMs) return;
    const segundos = Math.max(1, Math.round(s.audioDuracaoMs / 1000));
    setErro(null);
    try {
      const r = await patch<{ scene: SceneDto; resumo: RoteiroResumo }>(`/scenes/${s.id}`, {
        duracaoSegundos: segundos,
      });
      setData((d) => ({
        ...d,
        scenes: d.scenes.map((x) =>
          x.id === s.id ? { ...x, duracaoSegundos: r.scene.duracaoSegundos } : x,
        ),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ajustar a duração');
    }
  }

  return (
    <div className="mx-auto w-full">
      <StepHeader
        etapa="Etapa 4 de 9"
        title="Narração por voz"
        description="Ouça uma amostra da voz e ajuste o tom antes de gerar a narração das cenas."
      />

      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-ai/15 text-ai-soft">
            <Mic className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Voz fixa do projeto</p>
            <p className="text-sm text-muted-foreground">
              A mesma voz (definida em FISH_VOICE_ID no servidor) é usada em todas as cenas.
            </p>
          </div>
          <Button variant="outline" onClick={ouvirAmostra} disabled={amostra !== 'parada'}>
            <Play className="size-4" />
            {amostra === 'gerando'
              ? 'Gerando amostra...'
              : amostra === 'tocando'
                ? 'Tocando...'
                : 'Ouvir amostra'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-2 border-t pt-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={natural}
              onChange={(e) => alternarNatural(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              Narração mais humana (pausas e respiro)
              <span className="mt-1 block max-w-2xl text-xs text-muted-foreground">
                Insere pausas curtas depois das vírgulas e no fim das frases, com um tom mais calmo.
                Vale para as próximas narrações e para a amostra; refaça as cenas para ouvir.
              </span>
            </span>
          </label>
          {salvandoNatural && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Salvando
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="velocidade" className="flex items-center justify-between text-xs font-medium">
              <span>Velocidade da narração</span>
              <span className="text-muted-foreground">{velocidade}%</span>
            </Label>
            <input
              id="velocidade"
              type="range"
              min={NARRACAO_VELOCIDADE_MIN}
              max={NARRACAO_VELOCIDADE_MAX}
              step={1}
              value={velocidade}
              onChange={(e) => setVelocidade(Number(e.target.value))}
              onPointerUp={salvarVelocidade}
              onKeyUp={salvarVelocidade}
              onBlur={salvarVelocidade}
              className="mt-2 h-2 w-full cursor-pointer accent-brand"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              100% é o ritmo normal. Mudanças valem para a amostra e para as próximas narrações;
              refaça as cenas para ouvir.
            </p>
          </div>
          <div>
            <Label htmlFor="pronuncia">Pronúncia de nomes, siglas e números</Label>
            <Textarea
              id="pronuncia"
              value={pronuncia}
              onChange={(e) => setPronuncia(e.target.value)}
              onBlur={salvarPronuncia}
              placeholder={'Ex.:\nIBGE = I-B-G-E\nAnhumas = A-nhu-mas\n1942 = mil novecentos e quarenta e dois'}
              className="mt-1.5 min-h-20"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Uma regra por linha, no formato <code>como está = como se fala</code>. O ajuste entra
              apenas no texto enviado à voz; o roteiro não muda.
            </p>
          </div>
          {salvandoConfig && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground sm:col-span-2">
              <Loader2 className="size-3 animate-spin" /> Salvando {salvandoConfig}
            </span>
          )}
        </div>
      </Card>

      {total === 0 ? (
        <div className="mt-6">
          <ErrorBox message="Ainda não há cenas. Volte à etapa 3 e gere o roteiro." />
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm">
              <strong>{prontas}</strong> de {total} cenas narradas
              {ativos.length > 0 && (
                <span className="text-muted-foreground"> · {ativos.length} em andamento</span>
              )}
            </p>
            <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-ai transition-all"
                style={{ width: `${(prontas / total) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            {prontas > 0 && (
              <Button
                variant="outline"
                disabled={enviando || ativos.length > 0}
                onClick={() =>
                  executar(() =>
                    post<NarrationResponse>(`/projects/${projectId}/narration/generate?todas=1`),
                  )
                }
              >
                Refazer todas
              </Button>
            )}
            <Button
              variant="ai"
              disabled={enviando || ativos.length > 0 || pendentes === 0}
              onClick={() =>
                executar(() => post<NarrationResponse>(`/projects/${projectId}/narration/generate`))
              }
            >
              <Sparkles className="size-4" />
              {pendentes === total
                ? 'Gerar todas as narrações'
                : `Gerar as ${pendentes} que faltam`}
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} />
        </div>
      )}

      <ol className="mt-6 space-y-3">
        {data.scenes.map((s) => {
          const job = jobDoAlvo(data.jobs, s.id);
          const gerando = job?.status === 'fila' || job?.status === 'executando';
          const audioMs = s.audioDuracaoMs;
          const desvioDuracao =
            audioMs !== null && s.duracaoSegundos > 0
              ? Math.abs(audioMs - s.duracaoSegundos * 1000) / (s.duracaoSegundos * 1000)
              : 0;
          return (
            <li key={s.id}>
              <Card className={cn('p-4', gerando && 'animate-pulse')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-border-soft bg-panel px-2 py-0.5 text-xs font-semibold tabular-nums">
                      Cena {s.numero}
                    </span>
                    <StatusBadge status={s.statusNarracao} temArquivo={s.temAudio} />
                    {gerando && (
                      <Badge variant="ai">
                        {job?.status === 'fila' ? 'Na fila' : 'Gerando...'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {s.temAudio && s.statusNarracao !== 'desatualizado' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={enviando || gerando || s.statusNarracao === 'aprovado'}
                        onClick={() => aprovarCena(s.id)}
                      >
                        <Check className="size-4" />
                        {s.statusNarracao === 'aprovado' ? 'Aprovada' : 'Aprovar cena'}
                      </Button>
                    )}
                    {s.temAudio && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={enviando || carregandoVersoes === s.id}
                        onClick={() => alternarVersoes(s)}
                      >
                        {carregandoVersoes === s.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <History className="size-4" />
                        )}
                        Versões
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={enviando || gerando}
                      onClick={() =>
                        executar(() => post<NarrationResponse>(`/scenes/${s.id}/narration`))
                      }
                    >
                      <RefreshCw className="size-4" /> {s.temAudio ? 'Refazer' : 'Gerar'}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.textoNarrado}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Timer className="size-3" />
                    Planejado: {formatarTempo(s.duracaoSegundos)}
                  </span>
                  {audioMs !== null && (
                    <span className={cn(desvioDuracao > 0.4 && 'text-warning')}>
                      Narrado: {formatarTempo(audioMs / 1000)}
                    </span>
                  )}
                  {audioMs !== null && desvioDuracao > 0.4 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => ajustarDuracao(s)}
                    >
                      Ajustar planejado para {Math.round(audioMs / 1000)} s
                    </Button>
                  )}
                </div>

                {s.temAudio && (
                  <audio
                    className="mt-3 w-full"
                    controls
                    preload="none"
                    src={`${API_URL}/scenes/${s.id}/audio?v=${s.versaoMidia}`}
                  />
                )}

                {versoes[s.id] && (
                  <div className="mt-3 space-y-2 rounded-lg border bg-panel/40 p-3">
                    <p className="text-xs font-medium">
                      Versões guardadas: ouça e escolha qual fica na cena.
                    </p>
                    {versoes[s.id].length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma versão guardada ainda.</p>
                    ) : (
                      versoes[s.id].map((v, i) => (
                        <div key={v.id} className="flex flex-wrap items-center gap-2">
                          <span className="w-24 text-xs text-muted-foreground">
                            {formatarTempo(v.duracaoMs / 1000)} ·{' '}
                            {new Date(v.criadoEm).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {v.atual && <Badge variant="success">Em uso</Badge>}
                          <audio
                            className="h-8 min-w-40 flex-1"
                            controls
                            preload="none"
                            src={`${API_URL}/scenes/${s.id}/audio/versions/${v.id}?v=${i}`}
                          />
                          {!v.atual && (
                            <Button size="sm" variant="outline" onClick={() => usarVersao(s.id, v.id)}>
                              Usar esta
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {job && <JobError job={job} onRetried={carregar} />}
              </Card>
            </li>
          );
        })}
      </ol>

      <ActionBar
        voltarHref={`/projetos/${projectId}/roteiro`}
        onContinuar={continuar}
        continuarDisabled={!tudoPronto}
        busy={continuando}
        dica={tudoPronto ? undefined : 'Gere e ouça todas as narrações'}
      />
    </div>
  );
}
