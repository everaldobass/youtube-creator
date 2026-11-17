'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Play,
  Waves,
  XCircle,
} from 'lucide-react';
import {
  AUDIO_REFERENCIA,
  formatarTempo,
  type AudioAnalise,
  type ChecklistItem,
  type RevisaoFinalResponse,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch, fetchBlob } from '@/lib/client-api';
import { cn } from '@/lib/utils';

const ROTULO_STATUS: Record<ChecklistItem['status'], string> = {
  ok: 'OK',
  alerta: 'Alerta',
  erro: 'Erro',
  pendente: 'Pendente',
};

function variante(status: ChecklistItem['status']): 'success' | 'warning' | 'default' {
  return status === 'ok' ? 'success' : status === 'pendente' ? 'default' : 'warning';
}

function Icone({ status }: { status: ChecklistItem['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="size-4 text-success" />;
  if (status === 'pendente') return <ClipboardCheck className="size-4 text-muted-foreground" />;
  return <AlertTriangle className="size-4 text-warning" />;
}

const db = (n: number | null) => (n === null ? '—' : `${n} dB`);

/**
 * Revisão final automática e análise de áudio. As duas leem os arquivos reais do
 * projeto no servidor (FFmpeg); por isso rodam sob demanda, com indicador de progresso.
 */
export function QualidadeCard({ projectId }: { projectId: string }) {
  const [revisao, setRevisao] = useState<RevisaoFinalResponse | null>(null);
  const [audio, setAudio] = useState<AudioAnalise | null>(null);
  const [carregando, setCarregando] = useState<'revisao' | 'audio' | null>(null);
  const [baixandoPrevia, setBaixandoPrevia] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function rodarRevisao() {
    setCarregando('revisao');
    setErro(null);
    try {
      setRevisao(await apiFetch<RevisaoFinalResponse>(`/projects/${projectId}/quality/review`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível rodar a revisão final');
    } finally {
      setCarregando(null);
    }
  }

  async function analisarAudio() {
    setCarregando('audio');
    setErro(null);
    try {
      setAudio(await apiFetch<AudioAnalise>(`/projects/${projectId}/quality/audio`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível analisar o áudio');
    } finally {
      setCarregando(null);
    }
  }

  async function ouvirPrevia() {
    setBaixandoPrevia(true);
    setErro(null);
    try {
      const blob = await fetchBlob(`/projects/${projectId}/quality/audio/preview?segundos=60`);
      if (previa) URL.revokeObjectURL(previa);
      setPrevia(URL.createObjectURL(blob));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar a prévia da mixagem');
    } finally {
      setBaixandoPrevia(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Revisão final e áudio</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Verificações feitas sobre os arquivos do projeto antes de publicar. Alertas não bloqueiam a
        exportação; erros de narração ou imagem pendente bloqueiam.
      </p>

      {erro && (
        <div className="mt-4">
          <ErrorBox message={erro} />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <ClipboardCheck className="size-4 text-ai" /> Lista de verificação
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Roteiro, fontes, imagens, narração, legendas, música, duração, formato e exportação.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={rodarRevisao} disabled={carregando !== null}>
              {carregando === 'revisao' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ClipboardCheck className="size-4" />
              )}
              {carregando === 'revisao' ? 'Verificando...' : revisao ? 'Verificar de novo' : 'Rodar revisão'}
            </Button>
          </div>

          {revisao && (
            <div className="mt-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="success">{revisao.resumo.ok} OK</Badge>
                <Badge variant="warning">{revisao.resumo.alertas} alertas</Badge>
                <Badge variant="warning">{revisao.resumo.erros} erros</Badge>
                <Badge>{revisao.resumo.pendentes} pendentes</Badge>
              </div>
              {revisao.bloqueios.length > 0 && (
                <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                  <p className="font-medium">Impede a exportação:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {revisao.bloqueios.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="mt-3 space-y-1.5">
                {revisao.itens.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 shrink-0">
                        <Icone status={i.status} />
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{i.rotulo}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{i.detalhe}</span>
                      </span>
                    </span>
                    <Badge variant={variante(i.status)}>{ROTULO_STATUS[i.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <Waves className="size-4 text-ai" /> Análise de áudio
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Referências: {AUDIO_REFERENCIA.lufsAlvo} LUFS ±{AUDIO_REFERENCIA.lufsTolerancia},
                true peak até {AUDIO_REFERENCIA.truePeakMax} dBTP, silêncio até{' '}
                {AUDIO_REFERENCIA.silencioMaxMs / 1000} s e música pelo menos 6 dB abaixo da voz.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={analisarAudio} disabled={carregando !== null}>
              {carregando === 'audio' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Waves className="size-4" />
              )}
              {carregando === 'audio' ? 'Medindo...' : audio ? 'Medir de novo' : 'Analisar áudio'}
            </Button>
          </div>

          {audio && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>
                  Narração: <strong>{audio.geral ? `${audio.geral.lufs ?? '—'} LUFS` : 'sem dados'}</strong>
                </span>
                <span>
                  True peak: <strong>{db(audio.geral?.truePeakDb ?? null)}</strong>
                </span>
                {audio.musica && <span>Música: {audio.musica.lufs ?? '—'} LUFS</span>}
                {audio.mixagem?.diferencaDb != null && (
                  <span>Música {audio.mixagem.diferencaDb} dB abaixo da voz</span>
                )}
              </div>

              {audio.problemas.length > 0 ? (
                <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                  {audio.problemas.map((p) => (
                    <li key={p} className="flex items-start gap-1">
                      <XCircle className="mt-0.5 size-3 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-success/40 bg-success/10 p-2 text-xs text-success">
                  Narração dentro das referências de loudness, pico e silêncio.
                </p>
              )}

              <div className="max-h-56 overflow-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th className="p-2 font-medium">Cena</th>
                      <th className="p-2 font-medium">Duração</th>
                      <th className="p-2 font-medium">LUFS</th>
                      <th className="p-2 font-medium">Pico</th>
                      <th className="p-2 font-medium">Silêncio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audio.cenas.map((c) => (
                      <tr
                        key={c.numero}
                        className={cn(
                          'border-t',
                          c.problemas.length > 0 && 'bg-warning/5 text-warning',
                        )}
                      >
                        <td className="p-2">{c.numero}</td>
                        <td className="p-2">{formatarTempo(c.duracaoMs / 1000)}</td>
                        <td className="p-2">{c.lufs ?? '—'}</td>
                        <td className="p-2">{db(c.truePeakDb)}</td>
                        <td className="p-2">{(c.silencioMaxMs / 1000).toFixed(1)} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={ouvirPrevia} disabled={baixandoPrevia}>
                  {baixandoPrevia ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {baixandoPrevia ? 'Gerando prévia...' : 'Ouvir prévia da mixagem (60 s)'}
                </Button>
                {previa && <audio className="h-9 min-w-56 flex-1" controls src={previa} />}
              </div>
              <p className="text-xs text-muted-foreground">
                A prévia junta a narração das cenas e a música com o volume e o ducking do projeto.
                Duração limitada a 60 segundos para responder rápido.
              </p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
