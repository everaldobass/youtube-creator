'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Copy,
  Download,
  ImageIcon,
  ScanSearch,
  Upload,
} from 'lucide-react';
import type { ImagesResponse, VisualAssetsResponse } from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StatusBadge } from '@/components/status-badge';
import { StepHeader } from '@/components/step-header';
import { VisualAssetsCard } from '@/components/visual-assets-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, apiFetch, patch, post } from '@/lib/client-api';
import { jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function ImagensView({
  projectId,
  initial,
  initialVisual,
}: {
  projectId: string;
  initial: ImagesResponse;
  initialVisual: VisualAssetsResponse;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [estilo, setEstilo] = useState(initial.estiloVisual);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const uploadAlvo = useRef<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const ativos = jobsAtivos(data.jobs);
  const carregar = useCallback(async () => {
    setData(await apiFetch<ImagesResponse>(`/projects/${projectId}/images`));
  }, [projectId]);
  usePolling(carregar, ativos.length > 0, 2000);

  const total = data.scenes.length;
  const prontas = data.scenes.filter(
    (s) => s.temImagem && s.statusImagem !== 'desatualizado',
  ).length;
  const pendentes = total - prontas;
  const comAlerta = data.scenes.filter((s) => s.alertaImagem.trim());
  const tudoPronto = total > 0 && pendentes === 0;
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
        post<ImagesResponse>(`/scenes/${sceneId}/image/upload`, {
          base64: String(leitor.result),
          mime: arquivo.type,
        }),
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
    <div className="mx-auto max-w-[1022px]">
      <StepHeader
        etapa="Etapa 5 de 9"
        title={`Imagens e storyboard (${data.proporcao}, ${vertical ? 'vertical' : 'horizontal'})`}
        description="Copie o prompt de cada cena, gere a imagem no Google Flow/Nano Banana e envie o arquivo no card correspondente. Aceita PNG, JPG ou WebP de até 10 MB."
      />

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
          Mudar o guia marca as imagens já enviadas como desatualizadas, para você trocar só o que
          precisar.
        </p>
      </Card>

      <VisualAssetsCard
        projectId={projectId}
        initial={initialVisual}
        cenas={data.scenes.map((s) => s.numero)}
      />

      {total === 0 ? (
        <div className="mt-6">
          <ErrorBox message="Ainda não há cenas. Volte à etapa 3 e gere o roteiro." />
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm">
              <strong>{prontas}</strong> de {total} imagens prontas
            </p>
            <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-ai transition-all"
                style={{ width: `${(prontas / total) * 100}%` }}
              />
            </div>
            {comAlerta.length > 0 && (
              <p className="mt-2 max-w-md text-xs text-warning">
                {comAlerta.length} cena(s) com alerta de correspondência entre narração e imagem.
              </p>
            )}
            {ativos.length > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <ScanSearch className="size-3 animate-pulse" /> Verificação de imagens em andamento...
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={enviando || ativos.length > 0 || prontas === 0}
              onClick={() => executar(() => post<ImagesResponse>(`/projects/${projectId}/images/verify`))}
            >
              <ScanSearch className="size-4" /> Verificar correspondência
            </Button>
            <Button variant="outline" asChild>
              <a href={`${API_URL}/projects/${projectId}/images/prompts.md`}>
                <Download className="size-4" /> Exportar prompts (.md)
              </a>
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} />
        </div>
      )}

      <input
        ref={inputArquivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={aoSelecionarArquivo}
      />

      <ol
        className={cn(
          'mt-6 grid gap-4',
          vertical ? 'sm:grid-cols-3 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {data.scenes.map((s) => (
          <li key={s.id}>
            <Card className="overflow-hidden">
              <div className={cn('relative bg-panel', vertical ? 'aspect-[9/16]' : 'aspect-video')}>
                {s.temImagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_URL}/scenes/${s.id}/image?v=${s.versaoMidia}`}
                    alt={`Cena ${s.numero}: ${s.descricaoVisual}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-8" />
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Cena {s.numero}</span>
                  <StatusBadge status={s.statusImagem} temArquivo={s.temImagem} />
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{s.descricaoVisual}</p>
                {s.sugestaoCamera && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="size-3" /> Câmera sugerida: {s.sugestaoCamera}
                  </p>
                )}
                {s.alertaImagem.trim() && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                    {s.alertaImagem}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copiar(s.id, s.promptImagem)}
                    title="Copiar o prompt para usar no Google Flow"
                  >
                    <Copy className="size-4" /> {copiado === s.id ? 'Copiado' : 'Copiar prompt'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={enviando}
                    onClick={() => escolherArquivo(s.id)}
                  >
                    <Upload className="size-4" /> Enviar imagem
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
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
