'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Sparkles } from 'lucide-react';
import { MAX_TITULO, type TitleDto } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
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
  temEntrada,
}: {
  projectId: string;
  initialTitles: TitleDto[];
  temEntrada: boolean;
}) {
  const router = useRouter();
  const [titles, setTitles] = useState(initialTitles);
  const [gerando, setGerando] = useState(false);
  const [continuando, setContinuando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');

  const escolhido = titles.find((t) => t.escolhido);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      setTitles(await post<TitleDto[]>(`/projects/${projectId}/titles/generate`));
      setEditandoId(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar títulos');
    } finally {
      setGerando(false);
    }
  }

  async function escolher(id: string) {
    setErro(null);
    try {
      setTitles(await post<TitleDto[]>(`/projects/${projectId}/titles/${id}/select`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao escolher o título');
    }
  }

  async function salvarEdicao(id: string) {
    setErro(null);
    try {
      const atualizado = await patch<TitleDto>(`/titles/${id}`, { texto: rascunho });
      setTitles((ts) => ts.map((t) => (t.id === id ? atualizado : t)));
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
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Etapa 2 de 9</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">10 alternativas de título</h1>
        <Button variant="ai" onClick={gerar} disabled={gerando || !temEntrada}>
          <Sparkles className="size-4" />
          {gerando ? 'Gerando...' : titles.length ? 'Gerar novas alternativas' : 'Gerar títulos'}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Cada título recebe uma nota de 0 a 10 por clareza e curiosidade. Escolha um ou edite antes de
        continuar.
      </p>

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

      {gerando && titles.length === 0 && (
        <ul className="mt-6 space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </ul>
      )}

      {titles.length > 0 && (
        <ul className={cn('mt-6 space-y-3', gerando && 'opacity-50')}>
          {titles.map((t) => {
            const editando = editandoId === t.id;
            return (
              <li key={t.id}>
                <Card className={cn('flex items-center gap-4 p-4', t.escolhido && 'border-primary')}>
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
                          <span className="text-xs text-muted-foreground">{t.texto.length} caracteres</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {editando ? (
                      <>
                        <Button size="sm" onClick={() => salvarEdicao(t.id)} disabled={!rascunho.trim()}>
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
        continuarDisabled={!escolhido}
        busy={continuando}
        dica={escolhido ? undefined : 'Escolha um título para continuar'}
      />
    </div>
  );
}
