'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Copy, Download, FileArchive, Film } from 'lucide-react';
import {
  formatarTempo,
  IDIOMA_INFO,
  type EfeitoCamera,
  type ExportResponse,
  type MusicResponse,
  type ProjectDto,
  type SceneDto,
  type ThumbnailDto,
} from '@yt/shared';
import { EfeitoCameraCard } from '@/components/efeito-camera-card';
import { ErrorBox } from '@/components/error-box';
import { LegendasCard } from '@/components/legendas-card';
import { MusicCard } from '@/components/music-card';
import { PreviewPlayer } from '@/components/preview-player';
import { QualidadeCard } from '@/components/qualidade-card';
import { StepHeader } from '@/components/step-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API_URL, apiFetch, post } from '@/lib/client-api';
import { rotuloEfeito } from '@/lib/camera';
import { jobsAtivos } from '@/lib/jobs';
import { usePolling } from '@/lib/use-polling';

export function VideoView({
  project,
  scenes,
  tags,
  thumbnail,
  music,
  initial,
}: {
  project: ProjectDto;
  scenes: SceneDto[];
  tags: string[];
  thumbnail: ThumbnailDto | null;
  music: MusicResponse;
  initial: ExportResponse;
}) {
  const [status, setStatus] = useState(initial);
  const [efeito, setEfeito] = useState<EfeitoCamera>(initial.efeitoCamera);
  const [legendas, setLegendas] = useState(initial.legendasAtivas);
  const [tamanhoLegenda, setTamanhoLegenda] = useState(project.legendaTamanho);
  const [posicaoLegenda, setPosicaoLegenda] = useState(project.legendaPosicao);
  const [estiloLegenda, setEstiloLegenda] = useState(project.legendaEstilo);
  const [fonteLegenda, setFonteLegenda] = useState(project.legendaFonte);
  const [corLegenda, setCorLegenda] = useState(project.legendaCor);
  const [usarSugerida, setUsarSugerida] = useState(project.usarCameraSugerida);
  const [musica, setMusica] = useState(music);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const vertical = project.formato === 'shorts';

  const carregar = useCallback(async () => {
    setStatus(await apiFetch<ExportResponse>(`/projects/${project.id}/export`));
  }, [project.id]);

  const ativos = jobsAtivos(status.jobs);
  const montando = ativos.length > 0;
  usePolling(carregar, montando, 2000);

  const pronto = status.mp4?.status === 'concluido';
  const falhou =
    !montando && (status.mp4?.status === 'erro' || status.jobs.some((j) => j.status === 'erro'));
  const motivo = status.mp4?.erro ?? status.jobs.find((j) => j.status === 'erro')?.erro ?? null;
  const podeMontar = status.faltando.length === 0 && scenes.length > 0 && !montando;

  async function montar() {
    setEnviando(true);
    setErro(null);
    try {
      setStatus(await post<ExportResponse>(`/projects/${project.id}/render`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar a montagem');
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(chave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  return (
    <div className="mx-auto w-full">
      <StepHeader
        etapa="Etapa 9 de 9"
        title={pronto ? 'Seu vídeo está pronto!' : 'Vídeo final e publicação'}
        footer={
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-card/60 p-1">
            <span className="px-1.5 text-xs text-muted-foreground">YouTube Studio:</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!project.tituloEscolhido}
              onClick={() => copiar('titulo', project.tituloEscolhido)}
            >
              <Copy className="size-4" /> {copiado === 'titulo' ? 'Copiado' : 'Título'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={tags.length === 0}
              onClick={() => copiar('tags', tags.join(','))}
            >
              <Copy className="size-4" /> {copiado === 'tags' ? 'Copiado' : 'Tags'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!project.descricao}
              onClick={() => copiar('desc', project.descricao)}
            >
              <Copy className="size-4" /> {copiado === 'desc' ? 'Copiado' : 'Descrição'}
            </Button>
          </div>
        }
        actions={
          <>
            <Button onClick={montar} disabled={!podeMontar || enviando}>
              <Film className="size-4" />
              {montando
                ? 'Montando o vídeo...'
                : pronto
                  ? 'Montar de novo'
                  : 'Exportar vídeo (MP4)'}
            </Button>
            {pronto && !montando && (
              <Button variant="outline" asChild>
                <a href={`${API_URL}/projects/${project.id}/export/mp4?download=1`}>
                  <Download className="size-4" /> Baixar MP4
                </a>
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={`${API_URL}/projects/${project.id}/export/zip`}>
                <FileArchive className="size-4" /> Baixar projeto (.zip)
              </a>
            </Button>
          </>
        }
      />

      {status.faltando.length > 0 && (
        <div className="mt-4">
          <ErrorBox
            message={`Faltam narração ou imagem atualizadas nas cenas: ${status.faltando.join(', ')}. Volte às etapas 4 e 5.`}
          />
        </div>
      )}
      {erro && (
        <div className="mt-4">
          <ErrorBox message={erro} />
        </div>
      )}
      {falhou && (
        <div className="mt-4">
          <ErrorBox
            message={motivo ?? 'A montagem falhou.'}
            onRetry={podeMontar ? montar : undefined}
          />
        </div>
      )}
      {montando && (
        <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
          A montagem roda no servidor e pode levar alguns minutos. Pode sair desta tela: o processo
          continua.
        </p>
      )}
      {pronto && !montando && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="success">H.264 + AAC, {status.resolucao}</Badge>
          <span className="text-xs text-muted-foreground">
            Se mudar roteiro, narração, imagens, movimento, legendas ou música depois, monte o vídeo
            de novo.
          </span>
        </div>
      )}

      <section className="mt-6">
        {scenes.length > 0 &&
        scenes.every(
          (s) =>
            s.temImagem &&
            s.temAudio &&
            s.statusNarracao !== 'desatualizado' &&
            s.statusImagem !== 'desatualizado',
        ) ? (
          <PreviewPlayer
            scenes={scenes}
            vertical={vertical}
            efeitoCamera={efeito}
            legendas={legendas}
            escala={tamanhoLegenda}
            posicao={posicaoLegenda}
            estilo={estiloLegenda}
            cor={corLegenda}
            fonte={fonteLegenda}
          />
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            A prévia aparece quando todas as cenas tiverem narração e imagem.
          </Card>
        )}
      </section>

      <Card className="mt-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <div className="min-w-0">
            <h2 className="font-semibold leading-snug">
              {project.tituloEscolhido || 'Vídeo sem título'}
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Formato</dt>
                <dd className="text-right">{vertical ? 'Shorts' : 'Vídeo longo'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Idioma</dt>
                <dd className="text-right">{IDIOMA_INFO[project.idioma].rotulo}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Cenas</dt>
                <dd className="text-right">{scenes.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Duração</dt>
                <dd className="text-right">{formatarTempo(status.totalSegundos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Resolução</dt>
                <dd className="text-right">{status.resolucao}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Câmera</dt>
                <dd className="text-right">{rotuloEfeito(efeito)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Legendas</dt>
                <dd className="text-right">
                  {legendas ? `Queimadas (${tamanhoLegenda}%)` : 'Desligadas'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Música</dt>
                <dd className="max-w-[10rem] truncate text-right">
                  {musica.escolhida?.nome || 'Sem música'}
                </dd>
              </div>
            </dl>
          </div>
          {thumbnail?.temImagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}/thumbnails/${thumbnail.id}/image?v=${encodeURIComponent(thumbnail.versao)}`}
              alt="Thumbnail escolhida"
              className="aspect-video w-full rounded-md object-cover sm:justify-self-end"
            />
          )}
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="text-xl font-semibold tracking-tight">Ajustes do vídeo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Movimento de câmera, legendas e música valem para a próxima montagem do MP4.
        </p>
        <div className="mt-4 space-y-4">
          <EfeitoCameraCard
            projectId={project.id}
            valor={efeito}
            onChange={setEfeito}
            cena={scenes.find((s) => s.temImagem) ?? scenes[0]}
            vertical={vertical}
            usarSugerida={usarSugerida}
            onUsarSugerida={setUsarSugerida}
          />
          <LegendasCard
            projectId={project.id}
            valor={legendas}
            onChange={setLegendas}
            tamanho={tamanhoLegenda}
            onTamanho={setTamanhoLegenda}
            posicao={posicaoLegenda}
            onPosicao={setPosicaoLegenda}
            estilo={estiloLegenda}
            onEstilo={setEstiloLegenda}
            fonte={fonteLegenda}
            onFonte={setFonteLegenda}
            cor={corLegenda}
            onCor={setCorLegenda}
            cena={scenes.find((s) => s.temImagem) ?? scenes[0]}
            vertical={vertical}
          />
          <MusicCard projectId={project.id} initial={music} onChange={setMusica} />
        </div>
      </section>

      <QualidadeCard projectId={project.id} />

      <p className="mt-6 text-xs text-muted-foreground">
        O ZIP traz imagens, áudios, versões de áudio, legendas .srt, tempos, thumbnails, elementos
        visuais, música e um <code>projeto.json</code> com definições, roteiro, títulos, tags,
        capítulos e revisão editorial. Importe o arquivo na tela inicial para continuar editando de
        onde parou. Nenhuma chave de API vai no pacote.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Se o YouTube pedir, marque o vídeo como conteúdo alterado ou sintético ao publicar, e revise
        o conteúdo gerado.
      </p>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link href={`/projetos/${project.id}/descricao`}>Voltar</Link>
        </Button>
        <Button asChild>
          <Link href="/">Concluir e ver meus vídeos</Link>
        </Button>
      </div>
    </div>
  );
}
