'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, ImageIcon, RefreshCw, Sparkles, Upload } from 'lucide-react';
import type { ImagesResponse } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { JobError } from '@/components/job-error';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, apiFetch, patch, post } from '@/lib/client-api';
import { jobDoAlvo, jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function ImagensView({ projectId, initial }: { projectId: string; initial: ImagesResponse }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [estilo, setEstilo] = useState(initial.estiloVisual);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const uploadAlvo = useRef<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setData(await apiFetch<ImagesResponse>(`/projects/${projectId}/images`));
  }, [projectId]);

  const ativos = jobsAtivos(data.jobs);
  usePolling(carregar, ativos.length > 0);

  const total = data.scenes.length;
  const prontas = data.scenes.filter((s) => s.temImagem && s.statusImagem !== 'desatualizado').length;
  const pendentes = total - prontas;
  const tudoPronto = total > 0 && pendentes === 0 && ativos.length === 0;
  const vertical = data.proporcao === '9:16';

  async function executar(fn: () => Promise<ImagesResponse>) {
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

  function salvarEstilo() {
    const novo = estilo.trim();
    if (!novo || novo === data.estiloVisual) return;
    executar(() => patch<ImagesResponse>(`/projects/${projectId}/style`, { estiloVisual: novo }));
  }

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto do prompt e copie manualmente.');
    }
  }

  function escolherArquivo(sceneId: string) {
    uploadAlvo.current = sceneId;
    inputArquivo.current?.click();
  }

  function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    const sceneId = uploadAlvo.current;
    e.target.value = '';
    if (!arquivo || !sceneId) return;
    if (!MIMES.includes(arquivo.type as (typeof MIMES)[number])) {
      setErro('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro('A imagem passa de 10 MB.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () =>
      executar(() =>
        post<ImagesResponse>(`/scenes/${sceneId}/image/upload`, { base64: String(leitor.result), mime: arquivo.type }),
      );
    leitor.readAsDataURL(arquivo);
  }

  async function continuar() {
    setContinuando(true);
    setErro(null);
    try {
      await post(`/projects/${projectId}/images/approve`);
      await post(`/projects/${projectId}/advance`, { etapa: 'imagens' });
      router.push(`/projetos/${projectId}/tags`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted-foreground">Etapa 5 de 9</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        Imagens e storyboard ({data.proporcao}, {vertical ? 'vertical' : 'horizontal'})
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Copie o prompt de cada cena ou baixe todos em um arquivo <strong>.md</strong>. Ao gerar no
        Google Flow/Nano Banana, salve a imagem com o número da cena (ex.: <code>cena-01.png</code>) e
        envie no card correspondente.
      </p>

      <Card className="mt-6 p-4">
        <Label htmlFor="estilo">Guia de estilo visual (repetido em todas as cenas)</Label>
        <Textarea
          id="estilo"
          value={estilo}
          onChange={(e) => setEstilo(e.target.value)}
          onBlur={salvarEstilo}
          className="min-h-16"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Mudar o guia marca as imagens já geradas como desatualizadas, para você refazer só o que precisar.
        </p>
      </Card>

      {total === 0 ? (
        <div className="mt-6">
          <ErrorBox message="Ainda não há cenas. Volte à etapa 3 e gere o roteiro." />
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm">
              <strong>{prontas}</strong> de {total} imagens prontas
              {ativos.length > 0 && <span className="text-muted-foreground"> · {ativos.length} em andamento</span>}
            </p>
            <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full bg-ai transition-all" style={{ width: `${(prontas / total) * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`${API_URL}/projects/${projectId}/images/prompts.md`}>
                <Download className="size-4" /> Exportar prompts (.md)
              </a>
            </Button>
            <Button
              variant="ai"
              disabled={enviando || ativos.length > 0 || pendentes === 0}
              onClick={() => executar(() => post<ImagesResponse>(`/projects/${projectId}/images/generate`))}
            >
              <Sparkles className="size-4" />
              {pendentes === total ? 'Gerar todas as imagens' : `Gerar as ${pendentes} que faltam`}
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} />
        </div>
      )}

      <input ref={inputArquivo} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={aoSelecionarArquivo} />

      <ol className={cn('mt-6 grid gap-4', vertical ? 'sm:grid-cols-3 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {data.scenes.map((s) => {
          const job = jobDoAlvo(data.jobs, s.id);
          const gerando = job?.status === 'fila' || job?.status === 'executando';
          return (
            <li key={s.id}>
              <Card className="overflow-hidden">
                <div className={cn('relative bg-panel', vertical ? 'aspect-[9/16]' : 'aspect-video')}>
                  {s.temImagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_URL}/scenes/${s.id}/image?v=${s.versaoMidia}`}
                      alt={`Cena ${s.numero}: ${s.descricaoVisual}`}
                      className={cn('size-full object-cover', gerando && 'opacity-40')}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-8" />
                    </div>
                  )}
                  {gerando && (
                    <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-background/50 text-sm font-medium">
                      {job?.status === 'fila' ? 'Na fila...' : 'Gerando...'}
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Cena {s.numero}</span>
                    <StatusBadge status={s.statusImagem} temArquivo={s.temImagem} />
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{s.descricaoVisual}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" disabled={enviando || gerando} onClick={() => executar(() => post<ImagesResponse>(`/scenes/${s.id}/image`))}>
                      <RefreshCw className="size-4" /> {s.temImagem ? 'Refazer' : 'Gerar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copiar(s.id, s.promptImagem)} title="Copiar o prompt para usar no Google Flow">
                      <Copy className="size-4" /> {copiado === s.id ? 'Copiado' : 'Copiar prompt'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={enviando || gerando} onClick={() => escolherArquivo(s.id)}>
                      <Upload className="size-4" /> Enviar imagem
                    </Button>
                  </div>
                  {job && <JobError job={job} onRetried={carregar} />}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <ActionBar
        voltarHref={`/projetos/${projectId}/narracao`}
        onContinuar={continuar}
        continuarDisabled={!tudoPronto}
        busy={continuando}
        dica={tudoPronto ? undefined : 'Todas as cenas precisam de imagem'}
      />
    </div>
  );
}
