'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Copy,
  Download,
  FileDown,
  FolderUp,
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

/** Número da cena a partir do nome: "cena-001.png_057e23b3.jpg" → 1. */
function numeroDaCena(nome: string): number | null {
  const comPrefixo = nome.match(/(?:^|[^\d])cena[\s_-]*0*(\d{1,3})(?=\D|$)/i);
  if (comPrefixo) return Number(comPrefixo[1]);
  // Aceita também "001.png"; evita confundir hash tipo "057e23b3.jpg" com cena.
  const noInicio = nome.match(/^0*(\d{1,3})\.(?:png|jpe?g|webp)$/i);
  return noInicio ? Number(noInicio[1]) : null;
}

/** Tipo da imagem mesmo quando o navegador não informa (pasta do sistema). */
function mimeDaImagem(arquivo: File): (typeof MIMES)[number] | null {
  if (MIMES.includes(arquivo.type as (typeof MIMES)[number])) {
    return arquivo.type as (typeof MIMES)[number];
  }
  const ext = arquivo.name.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return null;
}

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}

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
  const [subindoPasta, setSubindoPasta] = useState(false);
  const [progressoPasta, setProgressoPasta] = useState<{ atual: number; total: number } | null>(
    null,
  );
  const [resultadoPasta, setResultadoPasta] = useState<{
    enviados: number;
    total: number;
    problemas: string[];
  } | null>(null);
  const uploadAlvo = useRef<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  const ativos = jobsAtivos(data.jobs);
  const verificando = data.jobs.some(
    (j) => j.tipo === 'verificacao' && (j.status === 'fila' || j.status === 'executando'),
  );
  const progressoVerificacao = data.verificacaoProgresso ?? 0;
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

  async function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    const sceneId = uploadAlvo.current;
    e.target.value = '';
    if (!arquivo || !sceneId) return;
    const mime = mimeDaImagem(arquivo);
    if (!mime) {
      setErro('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro('A imagem passa de 10 MB.');
      return;
    }
    try {
      const base64 = await lerComoDataUrl(arquivo);
      await executar(() =>
        post<ImagesResponse>(`/scenes/${sceneId}/image/upload`, { base64, mime }),
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    }
  }

  function abrirPasta() {
    setErro(null);
    setResultadoPasta(null);
    inputPasta.current?.click();
  }

  async function aoSelecionarPasta(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (arquivos.length === 0) return;

    setErro(null);
    setResultadoPasta(null);
    setSubindoPasta(true);
    setProgressoPasta({ atual: 0, total: arquivos.length });

    const porNumero = new Map(data.scenes.map((s) => [s.numero, s.id]));
    const usadas = new Set<number>();
    const problemas: string[] = [];
    let enviados = 0;

    try {
      for (let i = 0; i < arquivos.length; i++) {
        const arquivo = arquivos[i];
        setProgressoPasta({ atual: i + 1, total: arquivos.length });

        const mime = mimeDaImagem(arquivo);
        if (!mime) {
          problemas.push(`${arquivo.name}: formato não aceito (use PNG, JPG ou WebP).`);
          continue;
        }
        if (arquivo.size > 10 * 1024 * 1024) {
          problemas.push(`${arquivo.name}: passa de 10 MB.`);
          continue;
        }
        const numero = numeroDaCena(arquivo.name);
        const sceneId = numero === null ? undefined : porNumero.get(numero);
        if (numero === null || !sceneId) {
          problemas.push(`${arquivo.name}: não encontrei a cena pelo número do nome.`);
          continue;
        }
        if (usadas.has(numero)) {
          problemas.push(`${arquivo.name}: a cena ${numero} já recebeu outra imagem nesta pasta.`);
          continue;
        }
        usadas.add(numero);

        try {
          const base64 = await lerComoDataUrl(arquivo);
          await post<ImagesResponse>(`/scenes/${sceneId}/image/upload`, { base64, mime });
          enviados += 1;
        } catch (err) {
          problemas.push(
            `${arquivo.name}: ${err instanceof Error ? err.message : 'erro ao enviar.'}`,
          );
        }
      }

      setData(await apiFetch<ImagesResponse>(`/projects/${projectId}/images`));
      setResultadoPasta({ enviados, total: arquivos.length, problemas });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível subir a pasta.');
    } finally {
      setSubindoPasta(false);
      setProgressoPasta(null);
    }
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
    <div className="mx-auto w-full">
      <StepHeader
        etapa="Etapa 5 de 9"
        title={`Imagens e storyboard (${data.proporcao}, ${vertical ? 'vertical' : 'horizontal'})`}
        description="Copie o prompt de cada cena, gere a imagem no Google Flow/Nano Banana e envie o arquivo no card correspondente. Aceita PNG, JPG ou WebP de até 10 MB. Para enviar todas de uma vez, selecione a pasta com arquivos nomeados como cena-001.png."
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
            {verificando && (
              <div className="mt-2 max-w-xs">
                <p className="flex items-center gap-1 text-xs text-ai-soft" aria-live="polite">
                  <ScanSearch className="size-3 animate-pulse" /> Verificação de imagens em
                  andamento... {progressoVerificacao}%
                </p>
                <div className="mt-1 h-1.5 w-56 overflow-hidden rounded-full bg-panel">
                  <div
                    className="h-full rounded-full bg-ai transition-all"
                    style={{ width: `${progressoVerificacao}%` }}
                  />
                </div>
              </div>
            )}
            {subindoPasta && progressoPasta && (
              <p className="mt-2 flex items-center gap-1 text-xs text-ai-soft">
                <Upload className="size-3 animate-pulse" /> Enviando imagens: {progressoPasta.atual}{' '}
                de {progressoPasta.total} —{' '}
                {Math.round((progressoPasta.atual / progressoPasta.total) * 100)}%
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-info/70 hover:border-info hover:bg-info/10"
              disabled={enviando || subindoPasta || ativos.length > 0}
              onClick={abrirPasta}
              title="Escolha a pasta; o número no nome do arquivo (cena-001...) define a cena."
            >
              <FolderUp className="size-4 text-info" />
              {subindoPasta && progressoPasta
                ? `Enviando ${progressoPasta.atual} de ${progressoPasta.total}...`
                : 'Enviar pasta de imagens'}
            </Button>
            <Button
              variant="outline"
              className="border-ai-soft/70 hover:border-ai-soft hover:bg-ai/10"
              disabled={enviando || subindoPasta || ativos.length > 0 || prontas === 0}
              onClick={() =>
                executar(() => post<ImagesResponse>(`/projects/${projectId}/images/verify`))
              }
            >
              <ScanSearch className="size-4 text-ai-soft" /> Verificar correspondência
            </Button>
            <Button variant="outline" asChild>
              <a href={`${API_URL}/projects/${projectId}/images/prompts.md`}>
                <Download className="size-4" /> Exportar prompts (.md)
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`${API_URL}/projects/${projectId}/images/prompt-criar-img.md`}
                title="Lista simples, em blocos de 10 cenas, com arquivo sugerido e descrição visual."
              >
                <FileDown className="size-4" /> Exportar prompt IMG (.md)
              </a>
            </Button>
          </div>
        </div>
      )}

      {resultadoPasta && (
        <div className="mt-4 rounded-md border border-border-soft bg-panel p-3 text-xs">
          <p className="font-medium">
            {resultadoPasta.enviados} de {resultadoPasta.total} imagem(ns) enviada(s).
          </p>
          {resultadoPasta.problemas.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-warning">
              {resultadoPasta.problemas.slice(0, 10).map((problema, i) => (
                <li key={`${i}-${problema}`}>{problema}</li>
              ))}
              {resultadoPasta.problemas.length > 10 && (
                <li>… e mais {resultadoPasta.problemas.length - 10} arquivo(s).</li>
              )}
            </ul>
          )}
        </div>
      )}

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} />
        </div>
      )}

      <input
        ref={inputPasta}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        {...({
          webkitdirectory: '',
          directory: '',
        } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={aoSelecionarPasta}
      />

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
                  <span className="rounded-md border border-border-soft bg-panel px-2 py-0.5 text-xs font-semibold tabular-nums">
                    Cena {s.numero}
                  </span>
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
                    disabled={enviando || subindoPasta}
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
        continuarDisabled={!tudoPronto || subindoPasta}
        busy={continuando || subindoPasta}
        dica={tudoPronto ? undefined : 'Todas as cenas precisam de imagem'}
      />
    </div>
  );
}
