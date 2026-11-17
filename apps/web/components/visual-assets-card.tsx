'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Clock,
  Copy,
  ImageIcon,
  Loader2,
  Map,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ROTULO_VISUAL,
  type CreateVisualAssetInput,
  type TipoVisual,
  type VisualAssetDto,
  type VisualAssetsResponse,
} from '@yt/shared';
import { ErrorBox } from '@/components/error-box';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, apiFetch, del, patch, post } from '@/lib/client-api';
import { jobDoAlvo, jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

const MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const vazio: CreateVisualAssetInput = {
  tipo: 'mapa',
  sceneNumero: null,
  titulo: '',
  periodo: '',
  descricao: '',
};

/** Mapas históricos e linhas do tempo gerados por IA (ou enviados manualmente). */
export function VisualAssetsCard({
  projectId,
  initial,
  cenas,
}: {
  projectId: string;
  initial: VisualAssetsResponse;
  cenas: number[];
}) {
  const [data, setData] = useState(initial);
  const [novo, setNovo] = useState<CreateVisualAssetInput>(vazio);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ titulo: '', periodo: '', descricao: '' });
  const [copiado, setCopiado] = useState<string | null>(null);
  const uploadAlvo = useRef<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const ativos = jobsAtivos(data.jobs);
  const carregar = useCallback(async () => {
    setData(await apiFetch<VisualAssetsResponse>(`/projects/${projectId}/visual`));
  }, [projectId]);
  usePolling(carregar, ativos.length > 0, 2000);

  async function executar(fn: () => Promise<VisualAssetsResponse>) {
    setErro(null);
    try {
      setData(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Algo deu errado');
    }
  }

  async function criar() {
    if (!novo.titulo.trim() && !novo.descricao.trim()) {
      setErro('Descreva o mapa ou a linha do tempo antes de gerar.');
      return;
    }
    setCriando(true);
    setErro(null);
    try {
      setData(await post<VisualAssetsResponse>(`/projects/${projectId}/visual`, novo));
      setNovo(vazio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar o elemento visual');
    } finally {
      setCriando(false);
    }
  }

  function editar(asset: VisualAssetDto) {
    setEditando(asset.id);
    setRascunho({ titulo: asset.titulo, periodo: asset.periodo, descricao: asset.descricao });
  }

  async function salvarEdicao(asset: VisualAssetDto) {
    setErro(null);
    try {
      const r = await patch<VisualAssetsResponse>(`/visual/${asset.id}`, rascunho);
      setData(r);
      setEditando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    }
  }

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('Não foi possível copiar o prompt. Selecione o texto e copie manualmente.');
    }
  }

  function escolherArquivo(assetId: string) {
    uploadAlvo.current = assetId;
    inputArquivo.current?.click();
  }

  function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    const assetId = uploadAlvo.current;
    e.target.value = '';
    if (!arquivo || !assetId) return;
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
        post<VisualAssetsResponse>(`/visual/${assetId}/upload`, {
          base64: String(leitor.result),
          mime: arquivo.type,
        }),
      );
    leitor.readAsDataURL(arquivo);
  }

  return (
    <Card className="mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Map className="size-4 text-ai" /> Mapas e linhas do tempo
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Elementos explicativos para história, geografia e acontecimentos. A IA recebe o período
            informado para não usar mapas atuais em situações históricas diferentes. No MP4, o
            elemento aparece como inserção no canto inferior direito da cena escolhida.
          </p>
        </div>
        {ativos.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Gerando {ativos.length}...
          </span>
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <ErrorBox message={erro} />
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-lg border bg-panel/40 p-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="visual-tipo">Tipo</Label>
          <select
            id="visual-tipo"
            value={novo.tipo}
            onChange={(e) => setNovo((n) => ({ ...n, tipo: e.target.value as TipoVisual }))}
            className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="mapa">{ROTULO_VISUAL.mapa}</option>
            <option value="linha-do-tempo">{ROTULO_VISUAL['linha-do-tempo']}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="visual-cena">Cena (opcional)</Label>
          <select
            id="visual-cena"
            value={novo.sceneNumero ?? ''}
            onChange={(e) =>
              setNovo((n) => ({
                ...n,
                sceneNumero: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Sem cena específica</option>
            {cenas.map((n) => (
              <option key={n} value={n}>
                Cena {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="visual-titulo">Título</Label>
          <Input
            id="visual-titulo"
            value={novo.titulo}
            onChange={(e) => setNovo((n) => ({ ...n, titulo: e.target.value }))}
            placeholder="Ex.: Divisão territorial de 1942"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="visual-periodo">Período</Label>
          <Input
            id="visual-periodo"
            value={novo.periodo}
            onChange={(e) => setNovo((n) => ({ ...n, periodo: e.target.value }))}
            placeholder="Ex.: 1942 ou 1930–1945"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="visual-desc">O que o elemento deve mostrar</Label>
          <Textarea
            id="visual-desc"
            value={novo.descricao}
            onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))}
            placeholder="Ex.: mapa do Brasil com os estados e territórios da época, destacando a divisão regional então vigente."
            className="mt-1 min-h-16"
          />
        </div>
        <div className="sm:col-span-2">
          <Button variant="ai" size="sm" onClick={criar} disabled={criando || ativos.length > 0}>
            {criando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {criando ? 'Criando...' : 'Criar e gerar imagem'}
          </Button>
        </div>
      </div>

      <input
        ref={inputArquivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={aoSelecionarArquivo}
      />

      {data.assets.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhum mapa ou linha do tempo ainda. Descreva o elemento acima para gerar o primeiro.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.assets.map((a) => {
            const job = jobDoAlvo(data.jobs, a.id);
            const gerando = job?.status === 'fila' || job?.status === 'executando';
            return (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {a.tipo === 'mapa' ? (
                      <Map className="size-4 text-ai" />
                    ) : (
                      <Clock className="size-4 text-ai" />
                    )}
                    <span className="text-sm font-semibold">{ROTULO_VISUAL[a.tipo]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {a.sceneNumero && <Badge variant="outline">Cena {a.sceneNumero}</Badge>}
                    {gerando && <Badge variant="ai">Gerando...</Badge>}
                  </div>
                </div>

                <div className="mt-2 overflow-hidden rounded-md border bg-panel">
                  {a.temImagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_URL}/visual/${a.id}/image?v=${encodeURIComponent(a.versao)}`}
                      alt={`${ROTULO_VISUAL[a.tipo]}: ${a.titulo || a.descricao}`}
                      className={cn('w-full object-cover', a.tipo === 'linha-do-tempo' ? 'aspect-video' : 'aspect-[4/3]')}
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-7" />
                    </div>
                  )}
                </div>

                {editando === a.id ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={rascunho.titulo}
                      onChange={(e) => setRascunho((r) => ({ ...r, titulo: e.target.value }))}
                      placeholder="Título"
                    />
                    <Input
                      value={rascunho.periodo}
                      onChange={(e) => setRascunho((r) => ({ ...r, periodo: e.target.value }))}
                      placeholder="Período"
                    />
                    <Textarea
                      value={rascunho.descricao}
                      onChange={(e) => setRascunho((r) => ({ ...r, descricao: e.target.value }))}
                      className="min-h-16"
                      placeholder="O que deve mostrar"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => salvarEdicao(a)}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm">
                    <p className="font-medium">{a.titulo || ROTULO_VISUAL[a.tipo]}</p>
                    {a.periodo && <p className="text-xs text-muted-foreground">{a.periodo}</p>}
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{a.descricao}</p>
                  </div>
                )}

                {job?.status === 'erro' && (
                  <p className="mt-2 text-xs text-warning">{job.erro || 'A geração falhou.'}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => editar(a)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copiar(a.id, a.prompt)}
                    title="Copiar o prompt para gerar a imagem manualmente"
                  >
                    <Copy className="size-4" /> {copiado === a.id ? 'Copiado' : 'Prompt'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={gerando || ativos.length > 0}
                    onClick={() => executar(() => post<VisualAssetsResponse>(`/visual/${a.id}/regenerate`))}
                  >
                    <RefreshCw className="size-4" /> Refazer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => escolherArquivo(a.id)}>
                    <Upload className="size-4" /> Enviar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={gerando}
                    onClick={() => {
                      if (!window.confirm('Remover este elemento visual?')) return;
                      executar(() => del<VisualAssetsResponse>(`/visual/${a.id}`));
                    }}
                    aria-label="Remover elemento visual"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
