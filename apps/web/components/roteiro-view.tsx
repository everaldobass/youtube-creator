'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FileDown,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
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
  type ImportRoteiroResponse,
  type RoteiroResumo,
  type SceneDto,
  type ScenesResponse,
} from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Alert } from '@/components/ui/alert';
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
            <ShieldCheck className="size-4 text-ai-soft" /> Revisão editorial
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
            {ocupado ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
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
        <p
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" />A revisão roda no servidor e pode levar alguns
          minutos.
        </p>
      )}

      {revisao ? (
        <div className="mt-3 space-y-3">
          {revisao.resumo && <p className="text-sm">{revisao.resumo}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Revisado em {new Date(revisao.criadoEm).toLocaleString('pt-BR')}</span>
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
                      {i.cenaNumero && (
                        <span className="text-muted-foreground">Cena {i.cenaNumero}</span>
                      )}
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
                      {i.fonte
                        ? `Fonte indicada: ${i.fonte}`
                        : 'Nenhuma fonte indicada para este ponto.'}
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
        <BookOpen className="size-4 text-ai-soft" /> Referências do roteiro
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
  const [roteiroManual, setRoteiroManual] = useState(initial.roteiroManual);
  const [avisos, setAvisos] = useState<string[]>(initial.avisos ?? []);
  const [ignorarEditorial, setIgnorarEditorial] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null); // 'gerar' | 'importar' | id da cena | 'estrutura'
  const [erro, setErro] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const [importado, setImportado] = useState<ImportRoteiroResponse['importado'] | null>(null);
  const [prompt, setPrompt] = useState<{ nome: string; markdown: string } | null>(null);
  const [copiadoPrompt, setCopiadoPrompt] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [min, max] = LIMITES_FORMATO[formato].cena;

  function aplicar(r: ScenesResponse) {
    setScenes(r.scenes);
    setResumo(r.resumo);
    setFontes(r.fontes);
    setRoteiroManual(r.roteiroManual);
    setAvisos(r.avisos ?? []);
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
        setImportado(null);
        return r;
      },
      aplicar,
    );

  /** Prompt para o usuário gerar o roteiro numa IA externa e importar de volta. */
  async function abrirPrompt() {
    if (prompt) {
      setPrompt(null);
      return;
    }
    setOcupado('prompt');
    setErro(null);
    try {
      setPrompt(
        await apiFetch<{ nome: string; markdown: string }>(`/projects/${projectId}/script/prompt`),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível montar o prompt');
    } finally {
      setOcupado(null);
    }
  }

  async function copiarPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.markdown);
      setCopiadoPrompt(true);
      setTimeout(() => setCopiadoPrompt(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  function baixarPrompt() {
    if (!prompt) return;
    const url = URL.createObjectURL(new Blob([prompt.markdown], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = prompt.nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Lê o .md escolhido, envia para a API e substitui as cenas atuais. */
  async function importar(arquivo: File) {
    if (
      scenes.length > 0 &&
      !window.confirm(
        `Importar "${arquivo.name}" substitui as ${scenes.length} cenas atuais — os áudios e as imagens delas serão descartados. Continuar?`,
      )
    ) {
      return;
    }
    setOcupado('importar');
    setErro(null);
    setImportado(null);
    try {
      const markdown = await arquivo.text();
      const r = await post<ImportRoteiroResponse>(`/projects/${projectId}/script/import`, {
        markdown,
      });
      aplicar(r);
      setIgnorarEditorial(false);
      setImportado(r.importado);
      setEditorial(await apiFetch<EditorialResponse>(`/projects/${projectId}/editorial`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível importar o roteiro');
    } finally {
      setOcupado(null);
    }
  }

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
    !ignorarEditorial && !roteiroManual && (semRevisao || pendenciasEditoriais > 0)
      ? semRevisao
        ? 'Rode a revisão editorial para liberar a etapa'
        : `Decida os ${pendenciasEditoriais} apontamentos editoriais para liberar a etapa`
      : undefined;

  return (
    <div className="mx-auto w-full">
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
            <input
              ref={arquivoRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = ''; // permite escolher o mesmo arquivo de novo
                if (arquivo) void importar(arquivo);
              }}
            />
            <Button
              variant="outline"
              onClick={() => arquivoRef.current?.click()}
              disabled={bloqueado}
              title="Importar um roteiro em Markdown, no mesmo padrão do arquivo exportado"
            >
              {ocupado === 'importar' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {ocupado === 'importar' ? 'Importando...' : 'Importar .md'}
            </Button>
            <Button
              variant="outline"
              onClick={abrirPrompt}
              disabled={bloqueado}
              title="Montar um prompt para gerar o roteiro numa IA externa e importar o resultado"
            >
              {ocupado === 'prompt' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {prompt ? 'Fechar prompt' : 'Prompt IA externa'}
            </Button>
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
        <p className="mt-2 text-sm text-warning">
          Gerar de novo substitui todas as cenas atuais. Em vídeos longos, a IA continua
          automaticamente até chegar a pelo menos 90% do tempo pedido.
        </p>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} onRetry={scenes.length === 0 ? gerar : undefined} />
        </div>
      )}

      {avisos.length > 0 && (
        <div className="mt-4">
          <Alert
            variant="warning"
            title="Roteiro gerado com avisos"
            description={
              <ul className="list-disc space-y-1 pl-4">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            }
          />
        </div>
      )}

      {importado && (
        <div role="status" className="mt-6 rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="size-4" />
            {importado.cenas} {importado.cenas === 1 ? 'cena importada' : 'cenas importadas'}
            {importado.fontes > 0 &&
              ` e ${importado.fontes} ${importado.fontes === 1 ? 'referência' : 'referências'}`}
            .
          </p>
          {importado.avisos.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {importado.avisos.map((aviso, i) => (
                <li key={i}>{aviso}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Roteiro escrito fora do app: a revisão editorial por IA é opcional — você já pode
            aprovar e continuar.
          </p>
        </div>
      )}

      {prompt && (
        <Card className="mt-6 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-medium">
                <FileText className="size-4" aria-hidden /> Prompt para IA externa
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Copie o texto abaixo e cole numa IA de sua preferência (ChatGPT, Gemini, Claude…).
                Depois salve a resposta como um arquivo <code>.md</code> e importe aqui em{' '}
                <strong>Importar .md</strong>.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={copiarPrompt}>
                {copiadoPrompt ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiadoPrompt ? 'Copiado' : 'Copiar'}
              </Button>
              <Button size="sm" variant="outline" onClick={baixarPrompt}>
                <FileDown className="size-4" /> Baixar .md
              </Button>
            </div>
          </div>
          <Textarea
            readOnly
            value={prompt.markdown}
            aria-label="Prompt para gerar o roteiro numa IA externa"
            className="mt-3 min-h-72 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            O prompt já traz as definições do projeto e o esqueleto de todas as cenas — a IA só
            precisa preencher o texto narrado e a descrição visual de cada uma.
          </p>
        </Card>
      )}

      {scenes.length > 0 && (
        <div className="mt-5 rounded-xl border border-border-soft bg-panel/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px]">
            <span>
              <strong className="tabular-nums">{scenes.length}</strong> cenas
            </span>
            <span>
              Total <strong className="tabular-nums">{mmss(resumo.totalSegundos)}</strong> de{' '}
              {mmss(resumo.alvoSegundos)}
            </span>
            {roteiroManual && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ai-soft">
                <FileText className="size-3.5" aria-hidden />
                roteiro manual
              </span>
            )}
            <span className={resumo.dentroDaMargem ? 'text-success-soft' : 'text-warning-soft'}>
              {resumo.dentroDaMargem
                ? `Dentro da margem de 10% (${desvioTexto})`
                : `Fora da margem de 10% (${desvioTexto})`}
            </span>
            {resumo.cenasForaDoLimite.length > 0 && (
              <span className="text-warning-soft">
                Cenas fora de {min} a {max} s: {resumo.cenasForaDoLimite.join(', ')}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {scenes.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'h-full',
                  resumo.cenasForaDoLimite.includes(s.numero) ? 'bg-warning' : 'bg-brand/70',
                )}
                style={{ flexGrow: s.duracaoSegundos, flexBasis: 0 }}
                title={`Cena ${s.numero}: ${s.duracaoSegundos} s`}
              />
            ))}
          </div>
        </div>
      )}

      {scenes.length > 0 && roteiroManual && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Roteiro importado manualmente — a revisão editorial por IA é opcional. Você pode aprovar e
          continuar a qualquer momento; as cenas já estão prontas para narração e imagens.
        </p>
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
            Gere o roteiro com IA ou importe um arquivo .md escrito à mão — no mesmo padrão do
            roteiro exportado, cada cena com “**Texto narrado**” e “**Descrição visual**”.
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
                    <span className="rounded-md border border-border-soft bg-panel px-2 py-0.5 text-xs font-semibold tabular-nums">
                      Cena {s.numero}
                    </span>
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
                      min={min}
                      max={120}
                      value={s.duracaoSegundos}
                      onChange={(e) =>
                        editarLocal(s.id, { duracaoSegundos: Number(e.target.value) })
                      }
                      onBlur={(e) => {
                        const n = Math.min(
                          120,
                          Math.max(min, Math.round(Number(e.target.value) || min)),
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
        dica={scenes.length === 0 ? 'Gere ou importe o roteiro para continuar' : bloqueioEditorial}
      />
    </div>
  );
}
