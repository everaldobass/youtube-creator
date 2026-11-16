'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Sparkles, X } from 'lucide-react';
import { MAX_CARACTERES_TAGS, totalCaracteresTags, type TagsResponse } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { post, apiFetch } from '@/lib/client-api';
import { cn } from '@/lib/utils';

export function TagsView({ projectId, initial }: { projectId: string; initial: TagsResponse }) {
  const router = useRouter();
  const [tags, setTags] = useState(initial.tags);
  const [nova, setNova] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [continuando, setContinuando] = useState(false);

  const total = totalCaracteresTags(tags);
  const percentual = Math.min(100, (total / MAX_CARACTERES_TAGS) * 100);
  const perto = total > MAX_CARACTERES_TAGS * 0.9;

  async function salvar(proximas: string[]) {
    setErro(null);
    const anteriores = tags;
    setTags(proximas);
    try {
      const r = await apiFetch<TagsResponse>(`/projects/${projectId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tags: proximas }),
      });
      setTags(r.tags);
    } catch (e) {
      setTags(anteriores);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar as tags');
    }
  }

  function adicionar() {
    const t = nova.replace(/,/g, ' ').trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setNova('');
      return;
    }
    if (totalCaracteresTags([...tags, t]) > MAX_CARACTERES_TAGS) {
      setErro(`Essa tag passaria do limite de ${MAX_CARACTERES_TAGS} caracteres.`);
      return;
    }
    setNova('');
    salvar([...tags, t]);
  }

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      setTags((await post<TagsResponse>(`/projects/${projectId}/tags/generate`)).tags);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar tags');
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(tags.join(','));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione as tags e copie manualmente.');
    }
  }

  async function continuar() {
    setContinuando(true);
    try {
      await post(`/projects/${projectId}/advance`, { etapa: 'tags' });
      router.push(`/projetos/${projectId}/thumbnails`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Etapa 6 de 9</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Tags e otimização de SEO</h1>
        <Button variant="ai" onClick={gerar} disabled={gerando}>
          <Sparkles className="size-4" />
          {gerando ? 'Gerando...' : tags.length ? 'Gerar de novo' : 'Gerar tags'}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        De 15 a 25 tags, da mais ampla à mais específica, dentro do limite de {MAX_CARACTERES_TAGS} caracteres do YouTube Studio.
      </p>

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} onRetry={tags.length === 0 ? gerar : undefined} />
        </div>
      )}

      <Card className={cn('mt-6 p-4', gerando && 'animate-pulse')}>
        <div className="flex items-center justify-between gap-4">
          <p className={cn('text-sm font-medium', total > MAX_CARACTERES_TAGS ? 'text-primary' : perto ? 'text-warning' : '')}>
            {total} de {MAX_CARACTERES_TAGS} caracteres · {tags.length} tags
          </p>
          <Button size="sm" variant="outline" onClick={copiar} disabled={tags.length === 0}>
            <Copy className="size-4" /> {copiado ? 'Copiado' : 'Copiar todas'}
          </Button>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel">
          <div className={cn('h-full rounded-full transition-all', perto ? 'bg-warning' : 'bg-success')} style={{ width: `${percentual}%` }} />
        </div>
        {tags.length !== 0 && (tags.length < 15 || tags.length > 25) && (
          <p className="mt-2 text-xs text-warning">O recomendado é de 15 a 25 tags.</p>
        )}

        {tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t}>
                <Badge className="gap-1.5 py-1 text-sm">
                  {t}
                  <button type="button" aria-label={`Remover a tag ${t}`} onClick={() => salvar(tags.filter((x) => x !== t))} className="rounded hover:text-primary">
                    <X className="size-3.5" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma tag ainda. Gere ou adicione manualmente.</p>
        )}

        <div className="mt-4">
          <Label htmlFor="nova-tag">Adicionar tag</Label>
          <div className="flex gap-2">
            <Input
              id="nova-tag"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionar())}
              placeholder="Digite e pressione Enter"
            />
            <Button variant="outline" onClick={adicionar} disabled={!nova.trim()}>Adicionar</Button>
          </div>
        </div>
      </Card>

      <ActionBar
        voltarHref={`/projetos/${projectId}/imagens`}
        onContinuar={continuar}
        continuarDisabled={tags.length === 0}
        busy={continuando}
        dica={tags.length === 0 ? 'Gere as tags para continuar' : undefined}
      />
    </div>
  );
}
