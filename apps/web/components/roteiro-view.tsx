'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { LIMITES_FORMATO, type Formato, type RoteiroResumo, type SceneDto, type ScenesResponse } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { del, patch, post } from '@/lib/client-api';
import { cn } from '@/lib/utils';

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RoteiroView({
  projectId,
  titulo,
  formato,
  initial,
}: {
  projectId: string;
  titulo: string;
  formato: Formato;
  initial: ScenesResponse;
}) {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneDto[]>(initial.scenes);
  const [resumo, setResumo] = useState<RoteiroResumo>(initial.resumo);
  const [ocupado, setOcupado] = useState<string | null>(null); // 'gerar' | id da cena | 'estrutura'
  const [erro, setErro] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);

  const [min, max] = LIMITES_FORMATO[formato].cena;

  function aplicar(r: ScenesResponse) {
    setScenes(r.scenes);
    setResumo(r.resumo);
  }

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
    executar('gerar', () => post<ScenesResponse>(`/projects/${projectId}/script/generate`), aplicar);

  function editarLocal(id: string, campos: Partial<SceneDto>) {
    setScenes((ss) => ss.map((s) => (s.id === id ? { ...s, ...campos } : s)));
  }

  /** Salva uma cena ao sair do campo. Só atualiza status e resumo, para não sobrescrever o que a pessoa digita em outro campo. */
  async function salvarCena(id: string, campos: Partial<Pick<SceneDto, 'textoNarrado' | 'duracaoSegundos' | 'descricaoVisual'>>) {
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
    executar('estrutura', () => post<ScenesResponse>(`/projects/${projectId}/scenes/reorder`, { ids }), aplicar);
  }

  const adicionar = (depoisDaCena: number) =>
    executar('estrutura', () => post<ScenesResponse>(`/projects/${projectId}/scenes`, { depoisDaCena }), aplicar);

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

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Etapa 3 de 9</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Roteiro dividido por cenas</h1>
        <Button variant="ai" onClick={gerar} disabled={bloqueado || !titulo}>
          <Sparkles className="size-4" />
          {ocupado === 'gerar' ? 'Gerando roteiro...' : scenes.length ? 'Gerar roteiro de novo' : 'Gerar roteiro'}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {titulo ? <>Vídeo: <span className="text-foreground">{titulo}</span></> : 'Escolha um título na etapa 2 para gerar o roteiro.'}
      </p>
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
              {resumo.dentroDaMargem ? `Dentro da margem de 10% (${desvioTexto})` : `Fora da margem de 10% (${desvioTexto})`}
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
                className={cn('h-full', resumo.cenasForaDoLimite.includes(s.numero) ? 'bg-warning' : 'bg-primary')}
                style={{ flexGrow: s.duracaoSegundos, flexBasis: 0 }}
                title={`Cena ${s.numero}: ${s.duracaoSegundos} s`}
              />
            ))}
          </div>
        </div>
      )}

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

      <ol className={cn('mt-6 space-y-3', ocupado === 'gerar' && scenes.length > 0 && 'opacity-50')}>
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
                    {i === scenes.length - 1 && scenes.length > 1 && <Badge variant="ai">Chamada para ação</Badge>}
                    {(s.statusNarracao === 'desatualizado' || s.statusImagem === 'desatualizado') && (
                      <Badge variant="warning">Narração ou imagem desatualizada</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => mover(i, -1)} disabled={bloqueado || i === 0} aria-label={`Subir a cena ${s.numero}`}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => mover(i, 1)} disabled={bloqueado || i === scenes.length - 1} aria-label={`Descer a cena ${s.numero}`}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => refazer(s)} disabled={bloqueado} aria-label={`Refazer a cena ${s.numero}`}>
                      <RefreshCw className={cn('size-4', refazendo && 'animate-spin')} /> Refazer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => apagar(s)} disabled={bloqueado} aria-label={`Apagar a cena ${s.numero}`}>
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
                      onChange={(e) => editarLocal(s.id, { duracaoSegundos: Number(e.target.value) })}
                      onBlur={(e) => {
                        const n = Math.min(120, Math.max(1, Math.round(Number(e.target.value) || 1)));
                        editarLocal(s.id, { duracaoSegundos: n });
                        salvarCena(s.id, { duracaoSegundos: n });
                      }}
                      className={cn(foraDoLimite && 'border-warning')}
                      disabled={refazendo}
                    />
                    {foraDoLimite && <p className="mt-1 text-xs text-warning">Ideal: {min} a {max} s</p>}
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
                  <Button size="sm" variant="ghost" onClick={() => adicionar(s.numero)} disabled={bloqueado}>
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
          <Button variant="outline" size="sm" onClick={() => adicionar(scenes.length)} disabled={bloqueado}>
            <Plus className="size-4" /> Adicionar cena no final
          </Button>
        </div>
      )}

      <ActionBar
        voltarHref={`/projetos/${projectId}/titulos`}
        onContinuar={continuar}
        continuarDisabled={scenes.length === 0 || bloqueado}
        busy={continuando}
        dica={scenes.length === 0 ? 'Gere o roteiro para continuar' : undefined}
      />
    </div>
  );
}
