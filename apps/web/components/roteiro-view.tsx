'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  LIMITES_FORMATO,
  ROTULO_CLASSIFICACAO,
  ROTULO_CONFIANCA,
  ROTULO_TIPO_PROBLEMA,
  type EditorialIssueDto,
  type EditorialResponse,
  type Formato,
  type FonteRoteiro,
  type RoteiroResumo,
  type SceneDto,
  type ScenesResponse,
} from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, apiFetch, del, patch, post } from '@/lib/client-api';
import { jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Cor do selo de classificação da revisão editorial. */
function varianteClassificacao(c: 'aprovado' | 'ressalvas' | 'correcao'): 'success' | 'warning' {
  return c === 'aprovado' ? 'success' : 'warning';
}

/**
 * Revisão editorial do roteiro: a IA aponta problemas com trecho, explicação,
 * sugestão e fonte; a pessoa aceita ou rejeita cada apontamento.
 */
function EditorialPanel({
  projectId,
  editorial,
  onChange,
  onCenasAtualizadas,
}: {
  projectId: string;
  editorial: EditorialResponse;
  onChange: (e: EditorialResponse) => void;
  onCenasAtualizadas: () => Promise<void>;
}) {
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [avisoAplicacao, setAvisoAplicacao] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const ativos = jobsAtivos(editorial.jobs);
  const ocupado = ativos.length > 0;

  const carregar = useCallback(async () => {
    onChange(await apiFetch<EditorialResponse>(`/projects/${projectId}/editorial`));
  }, [projectId, onChange]);
  usePolling(carregar, ocupado);

  async function revisar() {
    setErroLocal(null);
    try {
      onChange(await post<EditorialResponse>(`/projects/${projectId}/editorial/review`));
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : 'Não foi possível iniciar a revisão');
    }
  }

  async function decidir(issue: EditorialIssueDto, acao: 'accept' | 'reject') {
    setDecidindo(issue.id);
    setErroLocal(null);
    setAvisoAplicacao(null);
    try {
      if (acao === 'accept') {
        const r = await post<{ editorial: EditorialResponse; aplicado: boolean }>(
          `/editorial/issues/${issue.id}/accept`,
        );
        onChange(r.editorial);
        if (r.aplicado) await onCenasAtualizadas();
        else
          setAvisoAplicacao(
            'Sugestão aceita, mas o trecho original não foi encontrado no texto atual da cena. Ajuste o texto manualmente no card da cena.',
          );
      } else {
        onChange(await post<EditorialResponse>(`/editorial/issues/${issue.id}/reject`));
      }
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : 'Não foi possível registrar a decisão');
    } finally {
      setDecidindo(null);
    }
  }

  const revisao = editorial.revisao;
  const pendentes = editorial.issues.filter((i) => i.status === 'pendente');
  const decididos = editorial.issues.length - pendentes.length;
  const ordenados = [...editorial.issues].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pendente' ? -1 : 1;
    return (a.cenaNumero ?? 0) - (b.cenaNumero ?? 0);
  });

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-ai" /> Revisão editorial
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            A IA confere precisão histórica, geográfica e científica, afirmações sem fonte,
            contradições e generalizações. Cada sugestão é decidida por você. Informações que o
            modelo não conseguiu verificar aparecem como <strong>NÃO VERIFICADA</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {revisao && (
            <Badge variant={varianteClassificacao(revisao.classificacao)}>
              {ROTULO_CLASSIFICACAO[revisao.classificacao]}
            </Badge>
          )}
          <Button size="sm" variant="ai" onClick={revisar} disabled={ocupado}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {ocupado ? 'Revisando...' : revisao ? 'Revisar de novo' : 'Revisar roteiro'}
          </Button>
        </div>
      </div>

      {erroLocal && (
        <div className="mt-3">
          <ErrorBox message={erroLocal} onRetry={revisar} />
        </div>
      )}

      {avisoAplicacao && (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {avisoAplicacao}
        </p>
      )}

      {ocupado && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="size-4 animate-spin" />
          A revisão roda no servidor e pode levar alguns minutos.
        </p>
      )}

      {revisao ? (
        <div className="mt-3 space-y-3">
          {revisao.resumo && <p className="text-sm">{revisao.resumo}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Revisado em {new Date(revisao.criadoEm).toLocaleString('pt-BR')}
            </span>
            <span>
              {decididos} de {editorial.issues.length} apontamentos decididos
            </span>
            {pendentes.length > 0 && (
              <span className="text-warning">{pendentes.length} aguardando decisão</span>
            )}
          </div>

          {editorial.issues.length === 0 ? (
            <p className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
              Nenhum problema relevante encontrado nesta revisão.
            </p>
          ) : (
            <ol className="space-y-2">
              {ordenados.map((i) => {
                const resolvido = i.status !== 'pendente';
                return (
                  <li
                    key={i.id}
                    className={cn(
                      'rounded-lg border p-3',
                      resolvido
                        ? 'border-border/60 opacity-70'
                        : i.confianca === 'nao_verificada'
                          ? 'border-warning/50 bg-warning/5'
                          : 'border-border',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">{ROTULO_TIPO_PROBLEMA[i.tipo]}</Badge>
                      <Badge variant={i.confianca === 'nao_verificada' ? 'warning' : 'default'}>
                        {ROTULO_CONFIANCA[i.confianca]}
                      </Badge>
                      {i.cenaNumero && <span className="text-muted-foreground">Cena {i.cenaNumero}</span>}
                      {resolvido && (
                        <Badge variant={i.status === 'aceita' ? 'success' : 'default'}>
                          {i.status === 'aceita' ? 'Aceita' : 'Rejeitada'}
                        </Badge>
                      )}
                    </div>
                    {i.trecho && (
                      <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">
                        “{i.trecho}”
                      </blockquote>
                    )}
                    <p className="mt-2 text-sm font-medium">{i.problema}</p>
                    {i.explicacao && (
                      <p className="mt-1 text-sm text-muted-foreground">{i.explicacao}</p>
                    )}
                    {i.sugestao && (
                      <p className="mt-2 rounded-md bg-panel p-2 text-sm">
                        <span className="font-medium">Sugestão: </span>
                        {i.sugestao}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {i.fonte ? `Fonte indicada: ${i.fonte}` : 'Nenhuma fonte indicada para este ponto.'}
                    </p>
                    {!resolvido && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => decidir(i, 'accept')}
                          disabled={decidindo === i.id}
                        >
                          <Check className="size-4" /> Aceitar sugestão
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decidir(i, 'reject')}
                          disabled={decidindo === i.id}
                        >
                          <X className="size-4" /> Rejeitar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : (
        !ocupado && (
          <p className="mt-3 text-sm text-muted-foreground">
            Este roteiro ainda não passou pela revisão editorial. Rode a revisão antes de aprovar a
            etapa.
          </p>
        )
      )}

      {pendentes.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-warning">
          <ShieldAlert className="size-4" />
          Decida os apontamentos pendentes para liberar a etapa.
        </p>
      )}
    </Card>
  );
}

/** Referências informadas pelo roteiro gerado. */
function FontesCard({ fontes }: { fontes: FonteRoteiro[] }) {
  return (
    <Card className="mt-4 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BookOpen className="size-4 text-ai" /> Referências do roteiro
      </h2>
      {fontes.length ? (
        <>
          <ul className="mt-2 space-y-1 text-sm">
            {fontes.map((f, i) => (
              <li key={`${f.titulo}-${i}`} className="text-muted-foreground">
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-foreground"
                  >
                    {f.titulo}
                  </a>
                ) : (
                  <span className="text-foreground">{f.titulo}</span>
                )}
                {f.autor ? ` — ${f.autor}` : ''}
                {f.ano ? ` (${f.ano})` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Referências informadas pelo modelo. Confirme cada uma antes de publicar; o YouStudio não
            acessa automaticamente o conteúdo dessas fontes.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Nenhuma referência foi retornada com o roteiro. Você pode complementar o texto e as fontes
          manualmente nesta etapa.
        </p>
      )}
    </Card>
  );
}

export function RoteiroView({
  projectId,
  titulo,
  formato,
  initial,
  initialEditorial,
}: {
  projectId: string;
  titulo: string;
  formato: Formato;
  initial: ScenesResponse;
  initialEditorial: EditorialResponse;
}) {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneDto[]>(initial.scenes);
  const [resumo, setResumo] = useState<RoteiroResumo>(initial.resumo);
  const [fontes, setFontes] = useState<FonteRoteiro[]>(initial.fontes);
  const [editorial, setEditorial] = useState<EditorialResponse>(initialEditorial);
  const [ignorarEditorial, setIgnorarEditorial] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null); // 'gerar' | id da cena | 'estrutura'
  const [erro, setErro] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);

  const [min, max] = LIMITES_FORMATO[formato].cena;

  function aplicar(r: ScenesResponse) {
    setScenes(r.scenes);
    setResumo(r.resumo);
    setFontes(r.fontes);
  }

  const recarregarRoteiro = useCallback(async () => {
    aplicar(await apiFetch<ScenesResponse>(`/projects/${projectId}/scenes`));
  }, [projectId]);

  async function executar<T>(chave: string, fn: () => Promise<T>, ok: (r: T) => void) {
    setOcupado(chave);
    setErro(null);
    try {
      ok(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado');
    } finally {
      setOcupado(null);
    }
  }

  const gerar = () =>
    executar(
      'gerar',
      async () => {
        const r = await post<ScenesResponse>(`/projects/${projectId}/script/generate`);
        setEditorial(await apiFetch<EditorialResponse>(`/projects/${projectId}/editorial`));
        setIgnorarEditorial(false);
        return r;
      },
      aplicar,
    );

  function editarLocal(id: string, campos: Partial<SceneDto>) {
    setScenes((ss) => ss.map((s) => (s.id === id ? { ...s, ...campos } : s)));
  }

  /** Salva uma cena ao sair do campo. Só atualiza status e resumo, para não sobrescrever o que a pessoa digita em outro campo. */
  async function salvarCena(
    id: string,
    campos: Partial<Pick<SceneDto, 'textoNarrado' | 'duracaoSegundos' | 'descricaoVisual'>>,
  ) {
    setErro(null);
    try {
      const r = await patch<{ scene: SceneDto; resumo: RoteiroResumo }>(`/scenes/${id}`, campos);
      editarLocal(id, {
        statusNarracao: r.scene.statusNarracao,
        statusImagem: r.scene.statusImagem,
      });
      setResumo(r.resumo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a cena');
    }
  }

  function mover(index: number, delta: -1 | 1) {
    const ids = scenes.map((s) => s.id);
    const alvo = index + delta;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[index], ids[alvo]] = [ids[alvo], ids[index]];
    executar(
      'estrutura',
      () => post<ScenesResponse>(`/projects/${projectId}/scenes/reorder`, { ids }),
      aplicar,
    );
  }

  const adicionar = (depoisDaCena: number) =>
    executar(
      'estrutura',
      () => post<ScenesResponse>(`/projects/${projectId}/scenes`, { depoisDaCena }),
      aplicar,
    );

  function apagar(s: SceneDto) {
    if (!window.confirm(`Apagar a cena ${s.numero}?`)) return;
    executar('estrutura', () => del<ScenesResponse>(`/scenes/${s.id}`), aplicar);
  }

  const refazer = (s: SceneDto) =>
    executar(s.id, () => post<ScenesResponse>(`/scenes/${s.id}/regenerate`), aplicar);

  async function continuar() {
    setContinuando(true);
    setErro(null);
    try {
      await post(`/projects/${projectId}/advance`, { etapa: 'roteiro' });
      router.push(`/projetos/${projectId}/narracao`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  const bloqueado = ocupado !== null;
  const desvioTexto = `${resumo.desvioPercentual > 0 ? '+' : ''}${resumo.desvioPercentual}%`;
  const semRevisao = !editorial.revisao;
  const pendenciasEditoriais = editorial.pendentes;
  const bloqueioEditorial =
    !ignorarEditorial && (semRevisao || pendenciasEditoriais > 0)
      ? semRevisao
        ? 'Rode a revisão editorial para liberar a etapa'
        : `Decida os ${pendenciasEditoriais} apontamentos editoriais para liberar a etapa`
      : undefined;

  return (
    <div className="mx-auto max-w-[1022px]">
      <StepHeader
        etapa="Etapa 3 de 9"
        title="Roteiro dividido por cenas"
        description={
          titulo ? (
            <>
              Vídeo: <span className="text-foreground">{titulo}</span>
            </>
          ) : (
            'Escolha um título na etapa 2 para gerar o roteiro.'
          )
        }
        actions={
          <>
            {scenes.length > 0 && (
              <Button variant="outline" asChild>
                <a
                  href={`${API_URL}/projects/${projectId}/script.md`}
                  download
                  title="Baixar o roteiro em Markdown"
                >
                  <FileDown className="size-4" />
                  Roteiro .md
                </a>
              </Button>
            )}
            <Button variant="ai" onClick={gerar} disabled={bloqueado || !titulo}>
              <Sparkles className="size-4" />
              {ocupado === 'gerar'
                ? 'Gerando roteiro...'
                : scenes.length
                  ? 'Gerar roteiro de novo'
                  : 'Gerar roteiro'}
            </Button>
          </>
        }
      />
      {scenes.length > 0 && ocupado === 'gerar' && (
        <p className="mt-2 text-sm text-warning">Gerar de novo substitui todas as cenas atuais.</p>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} onRetry={scenes.length === 0 ? gerar : undefined} />
        </div>
      )}

      {scenes.length > 0 && (
        <div className="sticky top-0 z-10 -mx-6 mt-6 border-b bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span>
              <strong>{scenes.length}</strong> cenas
            </span>
            <span>
              Total <strong>{mmss(resumo.totalSegundos)}</strong> de {mmss(resumo.alvoSegundos)}
            </span>
            <span className={resumo.dentroDaMargem ? 'text-success' : 'text-warning'}>
              {resumo.dentroDaMargem
                ? `Dentro da margem de 10% (${desvioTexto})`
                : `Fora da margem de 10% (${desvioTexto})`}
            </span>
            {resumo.cenasForaDoLimite.length > 0 && (
              <span className="text-warning">
                Cenas fora de {min} a {max} s: {resumo.cenasForaDoLimite.join(', ')}
              </span>
            )}
          </div>
          <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {scenes.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'h-full',
                  resumo.cenasForaDoLimite.includes(s.numero) ? 'bg-warning' : 'bg-primary',
                )}
                style={{ flexGrow: s.duracaoSegundos, flexBasis: 0 }}
                title={`Cena ${s.numero}: ${s.duracaoSegundos} s`}
              />
            ))}
          </div>
        </div>
      )}

      {scenes.length > 0 && (
        <EditorialPanel
          projectId={projectId}
          editorial={editorial}
          onChange={setEditorial}
          onCenasAtualizadas={recarregarRoteiro}
        />
      )}

      {scenes.length > 0 && bloqueioEditorial && (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  'Continuar sem concluir a revisão editorial? Os apontamentos continuam registrados para consulta.',
                )
              ) {
                setIgnorarEditorial(true);
              }
            }}
          >
            Continuar sem concluir a revisão
          </Button>
        </div>
      )}

      {scenes.length > 0 && <FontesCard fontes={fontes} />}

      {ocupado === 'gerar' && scenes.length === 0 && (
        <ul className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-44 animate-pulse rounded-xl bg-card" />
          ))}
        </ul>
      )}

      {scenes.length === 0 && ocupado !== 'gerar' && !erro && (
        <Card className="mt-6 p-8 text-center">
          <p className="font-medium">Nenhuma cena ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O roteiro sai dividido em cenas, cada uma com texto narrado, duração e descrição visual.
          </p>
        </Card>
      )}

      <ol
        className={cn('mt-6 space-y-3', ocupado === 'gerar' && scenes.length > 0 && 'opacity-50')}
      >
        {scenes.map((s, i) => {
          const refazendo = ocupado === s.id;
          const foraDoLimite = resumo.cenasForaDoLimite.includes(s.numero);
          return (
            <li key={s.id}>
              <Card className={cn('p-4', refazendo && 'animate-pulse')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Cena {s.numero}</span>
                    {i === 0 && <Badge variant="ai">Gancho</Badge>}
                    {i === scenes.length - 1 && scenes.length > 1 && (
                      <Badge variant="ai">Chamada para ação</Badge>
                    )}
                    {(s.statusNarracao === 'desatualizado' ||
                      s.statusImagem === 'desatualizado') && (
                      <Badge variant="warning">Narração ou imagem desatualizada</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mover(i, -1)}
                      disabled={bloqueado || i === 0}
                      aria-label={`Subir a cena ${s.numero}`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mover(i, 1)}
                      disabled={bloqueado || i === scenes.length - 1}
                      aria-label={`Descer a cena ${s.numero}`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => refazer(s)}
                      disabled={bloqueado}
                      aria-label={`Refazer a cena ${s.numero}`}
                    >
                      <RefreshCw className={cn('size-4', refazendo && 'animate-spin')} /> Refazer
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => apagar(s)}
                      disabled={bloqueado}
                      aria-label={`Apagar a cena ${s.numero}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_7rem]">
                  <div>
                    <Label htmlFor={`texto-${s.id}`}>Texto narrado</Label>
                    <Textarea
                      id={`texto-${s.id}`}
                      value={s.textoNarrado}
                      onChange={(e) => editarLocal(s.id, { textoNarrado: e.target.value })}
                      onBlur={(e) => salvarCena(s.id, { textoNarrado: e.target.value })}
                      disabled={refazendo}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`dur-${s.id}`}>Duração (s)</Label>
                    <Input
                      id={`dur-${s.id}`}
                      type="number"
                      min={1}
                      max={120}
                      value={s.duracaoSegundos}
                      onChange={(e) =>
                        editarLocal(s.id, { duracaoSegundos: Number(e.target.value) })
                      }
                      onBlur={(e) => {
                        const n = Math.min(
                          120,
                          Math.max(1, Math.round(Number(e.target.value) || 1)),
                        );
                        editarLocal(s.id, { duracaoSegundos: n });
                        salvarCena(s.id, { duracaoSegundos: n });
                      }}
                      className={cn(foraDoLimite && 'border-warning')}
                      disabled={refazendo}
                    />
                    {foraDoLimite && (
                      <p className="mt-1 text-xs text-warning">
                        Ideal: {min} a {max} s
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Label htmlFor={`visual-${s.id}`}>Descrição visual</Label>
                  <Textarea
                    id={`visual-${s.id}`}
                    value={s.descricaoVisual}
                    onChange={(e) => editarLocal(s.id, { descricaoVisual: e.target.value })}
                    onBlur={(e) => salvarCena(s.id, { descricaoVisual: e.target.value })}
                    className="min-h-16"
                    disabled={refazendo}
                  />
                </div>

                <div className="mt-3 border-t pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => adicionar(s.numero)}
                    disabled={bloqueado}
                  >
                    <Plus className="size-4" /> Adicionar cena abaixo
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {scenes.length > 0 && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => adicionar(scenes.length)}
            disabled={bloqueado}
          >
            <Plus className="size-4" /> Adicionar cena no final
          </Button>
        </div>
      )}

      <ActionBar
        voltarHref={`/projetos/${projectId}/titulos`}
        onContinuar={continuar}
        continuarDisabled={scenes.length === 0 || bloqueado || Boolean(bloqueioEditorial)}
        busy={continuando}
        dica={
          scenes.length === 0
            ? 'Gere o roteiro para continuar'
            : bloqueioEditorial
        }
      />
    </div>
  );
}
