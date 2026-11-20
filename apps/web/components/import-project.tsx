'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileArchive,
  FolderUp,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  IDIOMA_INFO,
  STEPS,
  formatarTempo,
  type ImportPreviewResponse,
  type ImportProjectResponse,
} from '@yt/shared';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorBox } from '@/components/error-box';
import { toast } from '@/components/ui/toaster';
import { API_URL } from '@/lib/client-api';
import { cn } from '@/lib/utils';

type Fase = 'ocioso' | 'analisando' | 'revisao' | 'importando';

function mensagemDoCorpo(corpo: unknown, status: number): string {
  if (corpo && typeof corpo === 'object') {
    const msg = (corpo as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg)) return msg.filter((m) => typeof m === 'string').join('; ');
  }
  return `Erro ${status}`;
}

/** Upload multipart com progresso real (fetch não expõe o andamento do envio). */
function enviarZip<T>(
  rota: string,
  arquivo: File,
  aoProgredir: (pct: number) => void,
  guardar: (xhr: XMLHttpRequest) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    guardar(xhr);
    xhr.open('POST', `${API_URL}${rota}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error('Não foi possível falar com a API. Confirme que ela está rodando.'));
    xhr.onabort = () => reject(new Error('Envio cancelado.'));
    xhr.onload = () => {
      let corpo: unknown = null;
      try {
        corpo = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        corpo = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(corpo as T);
      } else {
        reject(new Error(mensagemDoCorpo(corpo, xhr.status)));
      }
    };
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    xhr.send(dados);
  });
}

const tamanhoLegivel = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Importa um pacote .zip exportado pelo YouStudio e cria um projeto novo.
 * Primeiro mostra a prévia (sem gravar nada); a importação só acontece depois
 * da confirmação.
 */
export function ImportProjectButton({
  variant = 'outline',
  className,
}: {
  variant?: 'outline' | 'default' | 'secondary';
  className?: string;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<Fase>('ocioso');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  function limpar() {
    xhr.current?.abort();
    xhr.current = null;
    setFase('ocioso');
    setArquivo(null);
    setPreview(null);
    setErro(null);
    setProgresso(0);
    setArrastando(false);
    if (entrada.current) entrada.current.value = '';
  }

  function fechar() {
    limpar();
    setAberto(false);
  }

  async function analisar(file: File) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErro('Escolha um arquivo .zip exportado pelo YouStudio.');
      setArquivo(null);
      setPreview(null);
      return;
    }
    limpar();
    setArquivo(file);
    setFase('analisando');
    try {
      const resposta = await enviarZip<ImportPreviewResponse>(
        '/projects/import/preview',
        file,
        setProgresso,
        (r) => (xhr.current = r),
      );
      setPreview(resposta);
      setFase('revisao');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o pacote.');
      setFase('ocioso');
    } finally {
      setProgresso(0);
      xhr.current = null;
    }
  }

  async function importar() {
    if (!arquivo) return;
    setErro(null);
    setFase('importando');
    try {
      const resposta = await enviarZip<ImportProjectResponse>(
        '/projects/import',
        arquivo,
        setProgresso,
        (r) => (xhr.current = r),
      );
      toast({
        titulo: 'Projeto importado',
        descricao: resposta.avisos.length
          ? 'Alguns itens vieram com avisos; confira na tela do projeto.'
          : 'Continue de onde o pacote parou.',
        tom: 'success',
      });
      const destino = resposta.projeto;
      fechar();
      router.push(`/projetos/${destino.id}/${destino.etapaAtual}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível importar o pacote.');
      setFase('revisao');
    } finally {
      setProgresso(0);
      xhr.current = null;
    }
  }

  const etapaLabel = preview
    ? (STEPS.find((s) => s.slug === preview.etapaAtual)?.label ?? preview.etapaAtual)
    : '';
  const ocupado = fase === 'analisando' || fase === 'importando';

  const resumo = preview
    ? [
        ['Cenas', preview.resumo.cenas],
        ['Áudios', preview.resumo.audios],
        ['Imagens', preview.resumo.imagens],
        ['Versões de áudio', preview.resumo.versoesAudio],
        ['Thumbnails', preview.resumo.thumbnails],
        ['Elementos visuais', preview.resumo.elementosVisuais],
        ['Títulos', preview.resumo.titulos],
        ['Tags', preview.resumo.tags],
        ['Capítulos', preview.resumo.capitulos],
        ['Música', preview.resumo.musicas],
      ]
    : [];

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => {
          limpar();
          setAberto(true);
        }}
        className={className}
      >
        <Upload className="size-4" /> Importar projeto (.zip)
      </Button>

      <Dialog
        open={aberto}
        onClose={fechar}
        wide
        title="Importar projeto (.zip)"
        description="O pacote é analisado antes de qualquer gravação. A importação sempre cria um projeto novo; o original não é alterado."
        footer={
          fase === 'revisao' ? (
            <>
              <Button variant="ghost" onClick={limpar} disabled={ocupado}>
                Escolher outro arquivo
              </Button>
              <Button onClick={importar} disabled={!preview}>
                <FolderUp className="size-4" /> Importar como novo projeto
              </Button>
            </>
          ) : fase === 'importando' ? (
            <Button disabled>
              <Loader2 className="size-4 animate-spin" /> Importando...
            </Button>
          ) : (
            <Button variant="ghost" onClick={fechar} disabled={fase === 'analisando'}>
              Fechar
            </Button>
          )
        }
      >
        <input
          ref={entrada}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void analisar(file);
          }}
        />

        {!preview && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Escolher o arquivo .zip do projeto"
            onClick={() => !ocupado && entrada.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !ocupado) {
                e.preventDefault();
                entrada.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!ocupado) setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (ocupado) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void analisar(file);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
              arrastando
                ? 'border-brand bg-brand/[0.06]'
                : 'border-border bg-panel/60 hover:border-brand/60 hover:bg-panel',
              ocupado && 'pointer-events-none opacity-70',
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-xl border border-border-soft bg-card text-brand-soft">
              <FileArchive className="size-6" aria-hidden />
            </span>
            <span className="text-sm font-medium">
              {arquivo ? arquivo.name : 'Arraste o .zip aqui ou clique para escolher'}
            </span>
            <span className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
              Pacotes exportados em qualquer versão do YouStudio são aceitos. ZIPs antigos, sem o
              projeto.json, entram em modo de recuperação parcial.
            </span>
          </div>
        )}

        {ocupado && (
          <div className="mt-4" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{fase === 'analisando' ? 'Enviando e conferindo o pacote...' : 'Importando...'}</span>
              <span className="tabular-nums">{progresso}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progresso}%` }}
              />
            </div>
            {arquivo && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {arquivo.name} · {tamanhoLegivel(arquivo.size)}
              </p>
            )}
          </div>
        )}

        {erro && (
          <div className="mt-4">
            <ErrorBox message={erro} />
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border-soft bg-panel/60 p-4">
              <p className="text-[11px] font-medium text-muted-foreground">Prévia do pacote</p>
              <h3 className="mt-1 text-lg font-semibold leading-snug">{preview.titulo}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {preview.formato === 'shorts' ? 'Shorts' : 'Vídeo longo'}
                </Badge>
                <Badge variant="outline">{IDIOMA_INFO[preview.idioma].curto}</Badge>
                <Badge variant={preview.manifesto ? 'success' : 'warning'}>
                  {preview.manifesto ? 'Pacote completo' : 'Pacote antigo'}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Continua em {etapaLabel}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {preview.arquivo.nome} · {tamanhoLegivel(preview.arquivo.tamanhoBytes)}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {resumo.map(([rotulo, valor]) => (
                <div
                  key={String(rotulo)}
                  className="rounded-lg border border-border-soft bg-card/50 px-3 py-2"
                >
                  <dt className="text-[11px] text-muted-foreground">{rotulo}</dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums">{valor}</dd>
                </div>
              ))}
            </dl>

            {preview.avisos.length > 0 && (
              <Alert
                variant="warning"
                title={`${preview.avisos.length} aviso${preview.avisos.length === 1 ? '' : 's'} na prévia`}
                description={
                  <ul className="list-disc space-y-1 pl-4">
                    {preview.avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                }
              />
            )}

            {preview.ignorados.length > 0 && (
              <details className="rounded-lg border border-border-soft bg-panel/40 px-3 py-2 text-[13px]">
                <summary className="cursor-pointer text-muted-foreground">
                  {preview.ignorados.length} arquivo
                  {preview.ignorados.length === 1 ? '' : 's'} não referenciado
                  {preview.ignorados.length === 1 ? '' : 's'} (será ignorado)
                </summary>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground">
                  {preview.ignorados.map((i) => (
                    <li key={i.caminho} className="break-all">
                      {i.caminho}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              O MP4 não vai no pacote e precisa ser montado de novo na etapa 9. A etapa continua
              pelo conteúdo encontrado (textos, áudios e imagens), com o status das cenas recalculado.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}
