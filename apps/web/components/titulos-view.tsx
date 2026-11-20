'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, Pencil, Sparkles } from 'lucide-react';
import { MAX_TITULO, type TitleDto } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { patch, post } from '@/lib/client-api';
import { cn } from '@/lib/utils';

function corNota(nota: number) {
  if (nota >= 8) return 'border-success text-success';
  if (nota >= 6) return 'border-warning text-warning';
  return 'border-border text-muted-foreground';
}

export function TitulosView({
  projectId,
  initialTitles,
  ideia,
  tituloEscolhido,
  temEntrada,
  autoGerar = false,
}: {
  projectId: string;
  initialTitles: TitleDto[];
  /** "Título ou ideia (opcional)" preenchido na etapa 1. */
  ideia: string;
  /** Título salvo no projeto (pode ter vindo da etapa 1 ou de uma alternativa). */
  tituloEscolhido: string;
  temEntrada: boolean;
  autoGerar?: boolean;
}) {
  const router = useRouter();
  const [titles, setTitles] = useState(initialTitles);
  const [tituloAtual, setTituloAtual] = useState(tituloEscolhido);
  const [gerando, setGerando] = useState(false);
  const [continuando, setContinuando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const autoDisparado = useRef(false);

  // O mesmo limite de `tituloEscolhido` (100) aplicado em usarIdeia no backend.
  const ideiaHerdada = ideia.trim().slice(0, 100).trim();
  const titulosEscolhidos = titles.filter((t) => t.escolhido);
  const usandoIdeia =
    Boolean(ideiaHerdada) && titulosEscolhidos.length === 0 && tituloAtual.trim() === ideiaHerdada;
  const temTitulo = tituloAtual.trim().length > 0;

  /** Mantém o título do projeto em sincronia com a lista devolvida pela API. */
  function aplicar(lista: TitleDto[]) {
    setTitles(lista);
    const escolhidoNaLista = lista.find((t) => t.escolhido);
    if (escolhidoNaLista) setTituloAtual(escolhidoNaLista.texto);
  }

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      aplicar(await post<TitleDto[]>(`/projects/${projectId}/titles/generate`));
      setTituloAtual(''); // gerar novas alternativas pede uma nova escolha
      setEditandoId(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar títulos');
    } finally {
      setGerando(false);
    }
  }

  // O botão "Salvar e gerar títulos" da etapa 1 abre esta tela com ?gerar=1.
  useEffect(() => {
    if (!autoGerar || autoDisparado.current || !temEntrada) return;
    autoDisparado.current = true;
    // Tira o parâmetro da URL para um recarregamento não gerar de novo sem querer.
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      setGerando(true);
      setErro(null);
      try {
        aplicar(await post<TitleDto[]>(`/projects/${projectId}/titles/generate`));
        setTituloAtual('');
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao gerar títulos');
      } finally {
        setGerando(false);
      }
    })();
  }, [autoGerar, temEntrada, projectId, router]);

  async function escolher(id: string) {
    setErro(null);
    try {
      aplicar(await post<TitleDto[]>(`/projects/${projectId}/titles/${id}/select`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao escolher o título');
    }
  }

  async function usarIdeia() {
    setErro(null);
    try {
      aplicar(await post<TitleDto[]>(`/projects/${projectId}/titles/use-ideia`));
      setTituloAtual(ideiaHerdada);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao usar o título da etapa 1');
    }
  }

  async function salvarEdicao(id: string) {
    setErro(null);
    try {
      const atualizado = await patch<TitleDto>(`/titles/${id}`, { texto: rascunho });
      setTitles((ts) => ts.map((t) => (t.id === id ? atualizado : t)));
      if (atualizado.escolhido) setTituloAtual(atualizado.texto);
      setEditandoId(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar o título');
    }
  }

  async function continuar() {
    setContinuando(true);
    setErro(null);
    try {
      await post(`/projects/${projectId}/advance`, { etapa: 'titulos' });
      router.push(`/projetos/${projectId}/roteiro`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  return (
    <div className="mx-auto w-full">
      <StepHeader
        etapa="Etapa 2 de 9"
        title="5 alternativas de título"
        description={
          ideiaHerdada
            ? 'O título da etapa 1 aparece sempre como opção. Escolha ele ou uma das 5 alternativas geradas pela IA.'
            : 'A IA gera as 5 melhores alternativas, cada uma com nota de 0 a 10 por clareza e curiosidade.'
        }
        actions={
          <Button onClick={gerar} disabled={gerando || !temEntrada}>
            <Sparkles className="size-4" />
            {gerando ? 'Gerando...' : titles.length ? 'Gerar outras 5' : 'Gerar 5 alternativas'}
          </Button>
        }
      />

      {!temEntrada && (
        <div className="mt-6">
          <ErrorBox message="Volte à etapa 1 e informe o tema ou a ideia do vídeo para gerar títulos." />
        </div>
      )}
      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} onRetry={titles.length === 0 ? gerar : undefined} />
        </div>
      )}

      {ideiaHerdada && (
        <Card
          className={cn(
            'mt-6 flex flex-wrap items-center gap-4 p-4',
            usandoIdeia && 'border-primary',
          )}
        >
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-border text-muted-foreground">
            <FileText className="size-5" aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Título ou ideia da etapa 1
            </p>
            <p className="mt-0.5 font-medium leading-snug">{ideiaHerdada}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {ideiaHerdada.length} caracteres · herdado de “Definições do projeto”
              {ideia.trim().length > 100 && ' · cortado em 100 caracteres, o limite do título'}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant={usandoIdeia ? 'default' : 'outline'}
              onClick={usarIdeia}
              aria-pressed={usandoIdeia}
            >
              {usandoIdeia ? (
                <>
                  <Check className="size-4" /> Escolhido
                </>
              ) : (
                'Usar este título'
              )}
            </Button>
          </div>
        </Card>
      )}

      {gerando && titles.length === 0 && (
        <ul className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </ul>
      )}

      {titles.length === 0 && !gerando && (
        <p className="mt-4 text-sm text-muted-foreground">
          {temEntrada
            ? ideiaHerdada
              ? 'Nenhuma alternativa gerada ainda. Clique em “Gerar 5 alternativas” para ver sugestões — ou siga com o título da etapa 1.'
              : 'Nenhuma alternativa gerada ainda. Clique em “Gerar 5 alternativas” para ver as sugestões da IA.'
            : 'Preencha o tema ou a ideia na etapa 1 para gerar alternativas.'}
        </p>
      )}

      {titles.length > 0 && (
        <ul className={cn('mt-6 space-y-3', gerando && 'opacity-50')}>
          <li className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span className="h-px w-4 bg-border" aria-hidden />
            5 alternativas da IA
          </li>
          {titles.map((t) => {
            const editando = editandoId === t.id;
            return (
              <li key={t.id}>
                <Card
                  className={cn('flex items-center gap-4 p-4', t.escolhido && 'border-primary')}
                >
                  <div
                    className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                      corNota(t.nota),
                    )}
                    title="Nota de clareza e curiosidade"
                  >
                    {t.nota.toFixed(1)}
                  </div>

                  <div className="min-w-0 flex-1">
                    {editando ? (
                      <div>
                        <Input
                          value={rascunho}
                          onChange={(e) => setRascunho(e.target.value)}
                          maxLength={100}
                          autoFocus
                          aria-label="Editar título"
                        />
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            rascunho.length > MAX_TITULO ? 'text-warning' : 'text-muted-foreground',
                          )}
                        >
                          {rascunho.length} de {MAX_TITULO} caracteres
                          {rascunho.length > MAX_TITULO && ' (o YouTube pode cortar o título)'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium leading-snug">{t.texto}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          {t.estilo && <Badge>{t.estilo}</Badge>}
                          <span className="text-xs text-muted-foreground">
                            {t.texto.length} caracteres
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {editando ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => salvarEdicao(t.id)}
                          disabled={!rascunho.trim()}
                        >
                          Salvar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditandoId(t.id);
                            setRascunho(t.texto);
                          }}
                        >
                          <Pencil className="size-4" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant={t.escolhido ? 'default' : 'outline'}
                          onClick={() => escolher(t.id)}
                          aria-pressed={t.escolhido}
                        >
                          {t.escolhido ? (
                            <>
                              <Check className="size-4" /> Escolhido
                            </>
                          ) : (
                            'Escolher'
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ActionBar
        voltarHref={`/projetos/${projectId}/definicoes`}
        onContinuar={continuar}
        continuarDisabled={!temTitulo}
        busy={continuando}
        dica={temTitulo ? undefined : 'Escolha um título ou use o da etapa 1 para continuar'}
      />
    </div>
  );
}
