'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Sparkles } from 'lucide-react';
import type { DescriptionResponse } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, post } from '@/lib/client-api';
import { cn } from '@/lib/utils';

export function DescricaoView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: DescriptionResponse;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [texto, setTexto] = useState(initial.descricao);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [continuando, setContinuando] = useState(false);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const r = await post<DescriptionResponse>(`/projects/${projectId}/description/generate`);
      setData(r);
      setTexto(r.descricao);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar a descrição');
    } finally {
      setGerando(false);
    }
  }

  async function salvar() {
    if (texto === data.descricao) return;
    setErro(null);
    try {
      setData(
        await apiFetch<DescriptionResponse>(`/projects/${projectId}/description`, {
          method: 'PUT',
          body: JSON.stringify({ descricao: texto }),
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a descrição');
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  async function continuar() {
    setContinuando(true);
    try {
      await salvar();
      await post(`/projects/${projectId}/advance`, { etapa: 'descricao' });
      router.push(`/projetos/${projectId}/video`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  const duasPrimeiras = texto
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-[1022px]">
      <StepHeader
        etapa="Etapa 8 de 9"
        title="Descrição, capítulos e SEO"
        description="Gancho nas 2 primeiras linhas, resumo, capítulos com os tempos reais das cenas, chamada para se inscrever e hashtags."
        actions={
          <Button variant="ai" onClick={gerar} disabled={gerando || !data.temRoteiro}>
            <Sparkles className="size-4" />
            {gerando ? 'Gerando...' : texto ? 'Gerar de novo' : 'Gerar descrição'}
          </Button>
        }
      />

      {!data.temRoteiro && (
        <div className="mt-6">
          <ErrorBox message="Ainda não há roteiro. Volte à etapa 3 para gerar as cenas." />
        </div>
      )}
      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} onRetry={!texto ? gerar : undefined} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_16rem]">
        <Card className={cn('p-4', gerando && 'animate-pulse')}>
          <div className="flex items-center justify-between">
            <Label htmlFor="descricao" className="mb-0">
              Descrição do vídeo
            </Label>
            <Button size="sm" variant="outline" onClick={copiar} disabled={!texto}>
              <Copy className="size-4" /> {copiado ? 'Copiado' : 'Copiar descrição'}
            </Button>
          </div>
          <Textarea
            id="descricao"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={salvar}
            className="mt-2 min-h-96 font-mono text-[13px]"
            placeholder="Gere a descrição ou escreva aqui."
          />
          {duasPrimeiras.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Aparecem antes do “mostrar mais”:{' '}
              <span className="text-foreground">{duasPrimeiras.join(' / ')}</span>
            </p>
          )}
        </Card>

        <Card className="h-fit p-4">
          <h2 className="text-sm font-semibold">Capítulos</h2>
          {data.capitulos.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {data.capitulos.map((c) => (
                <li key={c.tempo} className="flex gap-3">
                  <span className="font-mono text-ai">{c.tempo}</span>
                  <span>{c.titulo}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Os capítulos aparecem depois de gerar a descrição.
            </p>
          )}
        </Card>
      </div>

      <ActionBar
        voltarHref={`/projetos/${projectId}/thumbnails`}
        onContinuar={continuar}
        continuarDisabled={!texto.trim()}
        busy={continuando}
        dica={!texto.trim() ? 'Gere a descrição para continuar' : undefined}
      />
    </div>
  );
}
