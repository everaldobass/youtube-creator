'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic, Play, RefreshCw, Sparkles } from 'lucide-react';
import type { NarrationResponse, ProjectDto } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { JobError } from '@/components/job-error';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API_URL, apiFetch, fetchBlob, patch, post } from '@/lib/client-api';
import { jobDoAlvo, jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

export function NarracaoView({ projectId, initial }: { projectId: string; initial: NarrationResponse }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [amostra, setAmostra] = useState<'parada' | 'gerando' | 'tocando'>('parada');
  const [natural, setNatural] = useState(initial.narracaoNatural);
  const [salvandoNatural, setSalvandoNatural] = useState(false);
  const [continuando, setContinuando] = useState(false);
  const audioAmostra = useRef<HTMLAudioElement | null>(null);

  const carregar = useCallback(async () => {
    setData(await apiFetch<NarrationResponse>(`/projects/${projectId}/narration`));
  }, [projectId]);

  const ativos = jobsAtivos(data.jobs);
  usePolling(carregar, ativos.length > 0);

  const prontas = data.scenes.filter((s) => s.temAudio && s.statusNarracao !== 'desatualizado').length;
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
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a configuração da narração.');
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

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Etapa 4 de 9</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Narração por voz</h1>

      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-ai/15 text-ai">
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
            {amostra === 'gerando' ? 'Gerando amostra...' : amostra === 'tocando' ? 'Tocando...' : 'Ouvir amostra'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-2 border-t pt-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={natural}
              onChange={(e) => alternarNatural(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
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
              {ativos.length > 0 && <span className="text-muted-foreground"> · {ativos.length} em andamento</span>}
            </p>
            <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full bg-ai transition-all" style={{ width: `${(prontas / total) * 100}%` }} />
            </div>
          </div>
          <div className="flex gap-2">
            {prontas > 0 && (
              <Button
                variant="outline"
                disabled={enviando || ativos.length > 0}
                onClick={() => executar(() => post<NarrationResponse>(`/projects/${projectId}/narration/generate?todas=1`))}
              >
                Refazer todas
              </Button>
            )}
            <Button
              variant="ai"
              disabled={enviando || ativos.length > 0 || pendentes === 0}
              onClick={() => executar(() => post<NarrationResponse>(`/projects/${projectId}/narration/generate`))}
            >
              <Sparkles className="size-4" />
              {pendentes === total ? 'Gerar todas as narrações' : `Gerar as ${pendentes} que faltam`}
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
          return (
            <li key={s.id}>
              <Card className={cn('p-4', gerando && 'animate-pulse')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Cena {s.numero}</span>
                    <StatusBadge status={s.statusNarracao} temArquivo={s.temAudio} />
                    {gerando && <Badge variant="ai">{job?.status === 'fila' ? 'Na fila' : 'Gerando...'}</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={enviando || gerando}
                    onClick={() => executar(() => post<NarrationResponse>(`/scenes/${s.id}/narration`))}
                  >
                    <RefreshCw className="size-4" /> {s.temAudio ? 'Refazer' : 'Gerar'}
                  </Button>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.textoNarrado}</p>
                {s.temAudio && (
                  <audio
                    className="mt-3 w-full"
                    controls
                    preload="none"
                    src={`${API_URL}/scenes/${s.id}/audio?v=${s.versaoMidia}`}
                  />
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
