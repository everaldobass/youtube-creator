'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Download, ImageIcon, Sparkles, Upload } from 'lucide-react';
import {
  MAX_PALAVRAS_THUMB,
  contarPalavras,
  type ThumbnailDto,
  type ThumbnailsResponse,
} from '@yt/shared';
import { ActionBar } from '@/components/action-bar';
import { ErrorBox } from '@/components/error-box';
import { StepHeader } from '@/components/step-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_URL, patch, post } from '@/lib/client-api';
import { cn } from '@/lib/utils';

const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function ThumbnailsView({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ThumbnailsResponse;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [textos, setTextos] = useState<Record<string, string>>(
    Object.fromEntries(initial.thumbnails.map((t) => [t.id, t.textoNaImagem])),
  );
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [continuando, setContinuando] = useState(false);
  const uploadAlvo = useRef<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const escolhida = data.thumbnails.find((t) => t.escolhida);

  async function executar(
    fn: () => Promise<ThumbnailsResponse>,
    aoTerminar?: (r: ThumbnailsResponse) => void,
  ) {
    setErro(null);
    try {
      const r = await fn();
      setData(r);
      aoTerminar?.(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado');
    }
  }

  async function gerarTodas() {
    setGerando(true);
    await executar(
      () => post<ThumbnailsResponse>(`/projects/${projectId}/thumbnails/generate`),
      (r) => setTextos(Object.fromEntries(r.thumbnails.map((t) => [t.id, t.textoNaImagem]))),
    );
    setGerando(false);
  }

  async function salvarTexto(id: string) {
    const texto = (textos[id] ?? '').trim();
    const original = data.thumbnails.find((t) => t.id === id)?.textoNaImagem;
    if (!texto || texto === original) return;
    await executar(() => patch<ThumbnailsResponse>(`/thumbnails/${id}`, { textoNaImagem: texto }));
  }

  /** Salva o texto editado (se mudou) e copia o prompt já atualizado. */
  async function copiarPrompt(t: ThumbnailDto) {
    setErro(null);
    try {
      let atual = t;
      const texto = (textos[t.id] ?? '').trim();
      if (texto && texto !== t.textoNaImagem) {
        const r = await patch<ThumbnailsResponse>(`/thumbnails/${t.id}`, { textoNaImagem: texto });
        setData(r);
        atual = r.thumbnails.find((x) => x.id === t.id) ?? t;
      }
      await navigator.clipboard.writeText(atual.promptImagem);
      setCopiado(t.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível copiar o prompt.');
    }
  }

  function escolherArquivo(id: string) {
    uploadAlvo.current = id;
    inputArquivo.current?.click();
  }

  function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    const id = uploadAlvo.current;
    e.target.value = '';
    if (!arquivo || !id) return;
    if (!MIMES.includes(arquivo.type as (typeof MIMES)[number])) {
      setErro('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro('A imagem passa de 10 MB.');
      return;
    }
    const leitor = new FileReader();
    leitor.onload = async () => {
      setErro(null);
      setEnviando(true);
      try {
        setData(
          await post<ThumbnailsResponse>(`/thumbnails/${id}/image/upload`, {
            base64: String(leitor.result),
            mime: arquivo.type,
          }),
        );
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Falha ao enviar a imagem.');
      } finally {
        setEnviando(false);
      }
    };
    leitor.readAsDataURL(arquivo);
  }

  async function continuar() {
    setContinuando(true);
    try {
      await post(`/projects/${projectId}/advance`, { etapa: 'thumbnails' });
      router.push(`/projetos/${projectId}/descricao`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao continuar');
      setContinuando(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1022px]">
      <StepHeader
        etapa="Etapa 7 de 9"
        title="Thumbnails | Google Flow | CTR"
        description="Duas variações em 1280×720 para comparar. Copie o prompt, gere a imagem no Flow/Nano Banana e envie o arquivo."
        actions={
          <Button variant="ai" onClick={gerarTodas} disabled={gerando}>
            <Sparkles className="size-4" />
            {gerando ? 'Gerando thumbnail...' : 'Gerar thumbnail'}
          </Button>
        }
      />

      <input
        ref={inputArquivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={aoSelecionarArquivo}
      />

      {erro && (
        <div className="mt-6">
          <ErrorBox message={erro} />
        </div>
      )}

      {data.thumbnails.length === 0 && !gerando && (
        <Card className="mt-6 p-8 text-center">
          <p className="font-medium">Nenhuma thumbnail ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            O app sugere 2 textos curtos. Gere as imagens onde preferir (1280×720) e envie aqui.
          </p>
        </Card>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {data.thumbnails.map((t) => {
          const texto = textos[t.id] ?? t.textoNaImagem;
          const palavras = contarPalavras(texto);
          return (
            <li key={t.id}>
              <Card className={cn('overflow-hidden', t.escolhida && 'border-primary')}>
                <div className="relative aspect-video bg-panel">
                  {t.temImagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_URL}/thumbnails/${t.id}/image?v=${encodeURIComponent(t.versao)}`}
                      alt={`Thumbnail ${t.variacao}: ${t.textoNaImagem}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-8" />
                    </div>
                  )}
                  <Badge className="absolute left-2 top-2 bg-background/80">1280×720</Badge>
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <Input
                      value={texto}
                      onChange={(e) => setTextos((x) => ({ ...x, [t.id]: e.target.value }))}
                      onBlur={() => salvarTexto(t.id)}
                      maxLength={200}
                      aria-label={`Texto da thumbnail ${t.variacao}`}
                    />
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        palavras > MAX_PALAVRAS_THUMB ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {palavras} de {MAX_PALAVRAS_THUMB} palavras
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant={t.escolhida ? 'default' : 'outline'}
                      disabled={!t.temImagem}
                      onClick={() =>
                        executar(() => post<ThumbnailsResponse>(`/thumbnails/${t.id}/select`))
                      }
                      aria-pressed={t.escolhida}
                    >
                      {t.escolhida ? (
                        <>
                          <Check className="size-4" /> Escolhida
                        </>
                      ) : (
                        'Escolher'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copiarPrompt(t)}
                      title="Copiar o prompt para usar no Google Flow / Nano Banana"
                    >
                      <Copy className="size-4" /> {copiado === t.id ? 'Copiado' : 'Copiar prompt'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={enviando}
                      onClick={() => escolherArquivo(t.id)}
                    >
                      <Upload className="size-4" /> Enviar imagem
                    </Button>
                    {t.temImagem && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`${API_URL}/thumbnails/${t.id}/image?download=1`}>
                          <Download className="size-4" /> Baixar
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <ActionBar
        voltarHref={`/projetos/${projectId}/tags`}
        onContinuar={continuar}
        continuarDisabled={!escolhida}
        busy={continuando}
        dica={!escolhida ? 'Envie uma imagem e escolha a melhor' : undefined}
      />
    </div>
  );
}
