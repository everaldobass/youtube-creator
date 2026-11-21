import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Job } from '@prisma/client';
import archiver from 'archiver';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  EfeitoCamera,
  ExportResponse,
  JobStatus,
  LegendaEstilo,
  PROJETO_PACOTE_APP,
  PROJETO_PACOTE_VERSAO,
  ProjetoPacote,
  efeitoDaCena,
  formatarTempo,
  projetoPacoteSchema,
  resolucaoDoFormato,
} from '@yt/shared';
import { JobsService } from '../jobs/jobs.service';
import { FPS_VIDEO, filtroCamera } from '../media/camera';
import { CenaNaLinha, linhaDoTempo } from '../media/contexto';
import { FfmpegService } from '../media/ffmpeg.service';
import { chaveVideo, extDaChave } from '../media/files';
import {
  BlocoLegenda,
  MedidaLegenda,
  OpcoesLegenda,
  Silencio,
  assDeLegendas,
  assDeMedicao,
  blocosDaCena,
  filtroAss,
  filtroLegendas,
  opcoesDeLegenda,
  parsearMedicoes,
  parsearSilencios,
  passoDeMedicao,
  srtDeLegendas,
} from '../media/legendas';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const pad = (n: number) => String(n).padStart(3, '0');

/** Mídia ausente ou marcada como desatualizada depois de editar o roteiro. */
const faltaMidia = (c: {
  audioPath: string | null;
  imagemPath: string | null;
  statusNarracao: string;
  statusImagem: string;
}) =>
  !c.audioPath ||
  !c.imagemPath ||
  c.statusNarracao === 'desatualizado' ||
  c.statusImagem === 'desatualizado';

@Injectable()
export class ExportService implements OnModuleInit {
  /** Progresso (0-100) das montagens em andamento, por exportação. */
  private readonly progresso = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  onModuleInit() {
    this.jobs.register('render', (job: Job) => this.renderizar(job.alvoId!));
  }

  private async cenasOrdenadas(projectId: string) {
    return this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
  }

  async status(projectId: string): Promise<ExportResponse> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.cenasOrdenadas(projectId);
    const ultimo = await this.prisma.export.findFirst({
      where: { projectId, tipo: 'mp4' },
      orderBy: { createdAt: 'desc' },
    });
    const jobs = (await this.jobs.listar(projectId, ['render'])).filter(
      (j) => !ultimo || j.alvoId === ultimo.id,
    );
    const erro = jobs.find((j) => j.alvoId === ultimo?.id && j.status === 'erro')?.erro ?? null;
    const linha = linhaDoTempo(cenas);
    const total = linha.reduce((a, c) => a + c.duracaoMs, 0) / 1000;
    const { largura, altura } = resolucaoDoFormato(project.formato);
    return {
      mp4: ultimo
        ? { status: ultimo.status as JobStatus, atualizadoEm: ultimo.createdAt.toISOString(), erro }
        : null,
      progresso:
        ultimo && (ultimo.status === 'fila' || ultimo.status === 'executando')
          ? (this.progresso.get(ultimo.id) ?? 0)
          : ultimo?.status === 'concluido'
            ? 100
            : null,
      jobs,
      faltando: cenas.filter(faltaMidia).map((c) => c.numero),
      totalSegundos: Math.round(total),
      resolucao: `${largura}x${altura}`,
      efeitoCamera: (row?.efeitoCamera as EfeitoCamera) ?? 'alternado',
      musica: row?.musicaPath
        ? {
            nome: row.musicaNome,
            artista: row.musicaArtista,
            origem: row.musicaOrigem,
            volume: row.musicaVolume,
            ducking: row.musicaDucking,
          }
        : null,
      legendasAtivas: row?.legendasAtivas ?? true,
    };
  }

  async render(projectId: string): Promise<ExportResponse> {
    await this.projects.get(projectId);
    const cenas = await this.cenasOrdenadas(projectId);
    if (cenas.length === 0)
      throw new BadRequestException('Gere o roteiro antes de montar o vídeo.');
    const faltando = cenas.filter(faltaMidia).map((c) => c.numero);
    if (faltando.length) {
      throw new BadRequestException(
        `Faltam narração ou imagem atualizadas nas cenas: ${faltando.join(', ')}.`,
      );
    }
    // Evita duas montagens simultâneas e limpa o histórico de tentativas anteriores.
    const ativo = await this.prisma.job.findFirst({
      where: { projectId, tipo: 'render', status: { in: ['fila', 'executando'] } },
    });
    if (ativo) return this.status(projectId);
    await this.prisma.job.deleteMany({
      where: { projectId, tipo: 'render', status: { in: ['concluido', 'erro'] } },
    });
    const exp = await this.prisma.export.create({
      data: { projectId, tipo: 'mp4', status: 'fila' },
    });
    await this.jobs.enqueue(projectId, 'render', exp.id);
    return this.status(projectId);
  }

  /** Executado pela fila: um clipe por cena (imagem pelo tempo do áudio) e depois a união de todos. */
  private async renderizar(exportId: string): Promise<void> {
    const exp = await this.prisma.export.findUnique({ where: { id: exportId } });
    if (!exp) return;
    await this.prisma.export.update({ where: { id: exportId }, data: { status: 'executando' } });
    this.progresso.set(exportId, 0);
    try {
      const project = await this.projects.get(exp.projectId);
      const row = await this.prisma.project.findUnique({ where: { id: exp.projectId } });
      const cenas = await this.cenasOrdenadas(exp.projectId);
      const falta = cenas.filter(faltaMidia).map((c) => c.numero);
      if (cenas.length === 0 || falta.length) {
        throw new Error(
          `Faltam narração ou imagem atualizadas nas cenas: ${falta.join(', ') || 'todas'}.`,
        );
      }
      const { largura, altura } = resolucaoDoFormato(project.formato);
      const efeito = (row?.efeitoCamera as EfeitoCamera) ?? 'alternado';
      const usarSugerida = row?.usarCameraSugerida ?? true;
      const legendasAtivas = row?.legendasAtivas ?? true;
      const opcoesLegenda = opcoesDeLegenda(
        largura,
        altura,
        row?.legendaTamanho ?? 100,
        (row?.legendaPosicao as 'baixo' | 'meio' | 'topo') ?? 'baixo',
        row?.legendaFonte ?? 'Noto Sans',
        row?.legendaCor ?? '#C4B5FD',
        (row?.legendaEstilo as LegendaEstilo | undefined) ?? 'negrito',
      );
      const silenciosPorCena = new Map<number, Silencio[]>();
      const visuais = new Map(
        (
          await this.prisma.visualAsset.findMany({
            where: {
              projectId: exp.projectId,
              sceneNumero: { not: null },
              imagemPath: { not: null },
            },
          })
        )
          .filter((v) => v.sceneNumero !== null && v.imagemPath)
          .map((v) => [v.sceneNumero as number, v.imagemPath as string]),
      );
      const filtroParado =
        `scale=${largura}:${altura}:force_original_aspect_ratio=decrease,` +
        `pad=${largura}:${altura}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;

      const mp4 = await this.ffmpeg.comPastaTemporaria(async (dir) => {
        const lista: string[] = [];
        for (const [indice, c] of cenas.entries()) {
          let img = join(dir, `img-${pad(c.numero)}.${extDaChave(c.imagemPath!)}`);
          const aud = join(dir, `aud-${pad(c.numero)}.wav`);
          const seg = join(dir, `seg-${pad(c.numero)}.mp4`);
          await fs.writeFile(img, await this.storage.get(c.imagemPath!));
          const visual = visuais.get(c.numero);
          if (visual) {
            const asset = join(dir, `visual-${pad(c.numero)}.${extDaChave(visual)}`);
            await fs.writeFile(asset, await this.storage.get(visual));
            img = await this.comporComVisual(img, asset, largura, altura, dir, c.numero);
          }
          await fs.writeFile(aud, await this.storage.get(c.audioPath!));
          const segundos = (c.audioDuracaoMs ?? c.duracaoSegundos * 1000) / 1000;
          const dur = segundos.toFixed(3);
          if (legendasAtivas) {
            // Pausas reais da narração: usadas para encaixar as trocas de legenda.
            const saida = await this.ffmpeg.capture([
              '-i',
              aud,
              '-af',
              'silencedetect=noise=-35dB:d=0.16',
              '-f',
              'null',
              '-',
            ]);
            silenciosPorCena.set(c.numero, parsearSilencios(saida, segundos * 1000));
          }
          // Movimento de câmera (Ken Burns); a sugestão da IA pode substituir o modo global.
          const escolhido =
            usarSugerida && c.sugestaoCamera
              ? (c.sugestaoCamera as EfeitoCamera)
              : efeitoDaCena(efeito, c.numero);
          const movimento = filtroCamera(escolhido, largura, altura, segundos);
          await this.ffmpeg.run([
            '-y',
            '-loop',
            '1',
            '-framerate',
            String(FPS_VIDEO),
            '-i',
            img,
            '-i',
            aud,
            '-vf',
            movimento ? `${movimento},format=yuv420p` : filtroParado,
            '-t',
            dur,
            '-c:v',
            'libx264',
            ...(movimento ? [] : ['-tune', 'stillimage']),
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-r',
            String(FPS_VIDEO),
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-ar',
            '48000',
            '-ac',
            '2',
            '-movflags',
            '+faststart',
            seg,
          ]);
          lista.push(`file '${seg}'`);
          // 80% do contador vem dos clipes; o restante é concatenação, música e legendas.
          this.progresso.set(exportId, Math.round(((indice + 1) / cenas.length) * 80));
        }
        this.progresso.set(exportId, 82);
        const listaPath = join(dir, 'lista.txt');
        const semMusica = join(dir, 'final.mp4');
        await fs.writeFile(listaPath, lista.join('\n'));
        await this.ffmpeg.run([
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listaPath,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          semMusica,
        ]);
        this.progresso.set(exportId, 86);

        const total = cenas.reduce(
          (acc, c) => acc + (c.audioDuracaoMs ?? c.duracaoSegundos * 1000) / 1000,
          0,
        );
        let base = semMusica;

        if (row?.musicaPath) {
          // Música de fundo: repete se for curta, abaixa sob a narração e faz fade no início/fim.
          const musica = join(dir, `musica.${extDaChave(row.musicaPath)}`);
          await fs.writeFile(musica, await this.storage.get(row.musicaPath));
          const comMusica = join(dir, 'final-com-musica.mp4');
          await this.ffmpeg.run(
            this.argumentosDeMusica(base, musica, comMusica, {
              total,
              volume: row.musicaVolume,
              ducking: row.musicaDucking,
            }),
          );
          base = comMusica;
        }
        this.progresso.set(exportId, 90);

        if (!legendasAtivas) return fs.readFile(base);

        // Legenda queimada: caixa escura atrás do texto, no traço do projeto e com destaque por palavra.
        const blocos = this.blocosDoProjeto(linhaDoTempo(cenas), silenciosPorCena, opcoesLegenda);
        // Mede o texto real para desenhar UMA caixa arredondada por legenda.
        const medidas = await this.medirLegendas(blocos, opcoesLegenda, dir);
        const assPath = join(dir, 'legendas.ass');
        await fs.writeFile(assPath, assDeLegendas(blocos, opcoesLegenda, medidas));
        const comLegendas = join(dir, 'final-legendas.mp4');
        await this.ffmpeg.run([
          '-y',
          '-i',
          base,
          '-vf',
          filtroLegendas(assPath),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '21',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          comLegendas,
        ]);
        this.progresso.set(exportId, 97);
        return fs.readFile(comLegendas);
      });

      const chave = chaveVideo(exp.projectId);
      await this.storage.put(chave, mp4, 'video/mp4');
      await this.prisma.export.update({
        where: { id: exportId },
        data: { status: 'concluido', path: chave },
      });
      this.progresso.set(exportId, 100);
    } catch (e) {
      await this.prisma.export
        .update({ where: { id: exportId }, data: { status: 'erro' } })
        .catch(() => undefined);
      throw e;
    } finally {
      this.progresso.delete(exportId);
    }
  }

  /**
   * Sobrepõe o elemento visual (mapa/linha do tempo) no canto inferior direito
   * da imagem da cena, com margem. A composição vira a imagem-base da cena.
   */
  private async comporComVisual(
    imagem: string,
    visual: string,
    largura: number,
    altura: number,
    dir: string,
    numero: number,
  ): Promise<string> {
    const saida = join(dir, `comp-${pad(numero)}.png`);
    const escala = Math.max(2, Math.round((largura * 0.62) / 2) * 2);
    const margem = Math.round(largura * 0.02);
    await this.ffmpeg.run([
      '-y',
      '-i',
      imagem,
      '-i',
      visual,
      '-filter_complex',
      `[0:v]scale=${largura}:${altura}:force_original_aspect_ratio=increase,` +
        `crop=${largura}:${altura}[bg];` +
        `[1:v]scale=${escala}:-2[ov];` +
        `[bg][ov]overlay=W-w-${margem}:H-h-${margem}:format=auto`,
      '-frames:v',
      '1',
      saida,
    ]);
    return saida;
  }

  /** Envelope do FFmpeg para misturar a música de fundo com a narração já montada. */ private argumentosDeMusica(
    video: string,
    musica: string,
    saida: string,
    opcoes: { total: number; volume: number; ducking: boolean },
  ): string[] {
    const total = Math.max(1, opcoes.total);
    const volume = (Math.min(100, Math.max(0, opcoes.volume)) / 100).toFixed(2);
    const fadeIn = Math.min(1.5, total / 8).toFixed(2);
    const fadeOut = Math.min(3, Math.max(1, total / 6));
    const inicioFadeOut = Math.max(0, total - fadeOut).toFixed(2);
    const narracao = '[0:a]aresample=48000,aformat=channel_layouts=stereo';
    const musicaFiltro = `[1:a]volume=${volume},aresample=48000,aformat=channel_layouts=stereo[mus]`;
    const mistura =
      'amix=inputs=2:duration=first:dropout_transition=0:normalize=0,' +
      `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${inicioFadeOut}:d=${fadeOut.toFixed(2)}[aout]`;
    const grafo = opcoes.ducking
      ? `${narracao},asplit=2[voice][side];${musicaFiltro};` +
        `[mus][side]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=450[duck];` +
        `[voice][duck]${mistura}`
      : `${narracao}[voice];${musicaFiltro};[voice][mus]${mistura}`;
    return [
      '-y',
      '-i',
      video,
      '-stream_loop',
      '-1',
      '-i',
      musica,
      '-filter_complex',
      grafo,
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      saida,
    ];
  }

  /**
   * Mede no próprio libass a largura e a altura do texto de cada bloco.
   * Renderiza os textos em branco no preto e lê o quadro cru, para desenhar
   * uma única caixa arredondada por legenda (em vez de uma por linha).
   */
  private async medirLegendas(
    blocos: BlocoLegenda[],
    opcoes: OpcoesLegenda,
    dir: string,
  ): Promise<MedidaLegenda[]> {
    if (!blocos.length) return [];
    const passo = passoDeMedicao(opcoes);
    const medidas: MedidaLegenda[] = [];
    const lote = 40;
    for (let i = 0; i < blocos.length; i += lote) {
      const parte = blocos.slice(i, i + lote);
      const { ass, altura } = assDeMedicao(parte, opcoes, passo);
      const caminho = join(dir, `medicao-${pad(i)}.ass`);
      await fs.writeFile(caminho, ass);
      const quadro = await this.ffmpeg.runBuffer([
        '-f',
        'lavfi',
        '-i',
        `color=c=black:s=${opcoes.largura}x${altura}:r=1:d=1`,
        '-vf',
        filtroAss(caminho),
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        '-',
      ]);
      medidas.push(
        ...parsearMedicoes(quadro, opcoes.largura, altura, passo, parte.length, opcoes.fonte),
      );
    }
    return medidas;
  }

  /** Blocos de legenda do vídeo inteiro (tempos absolutos), cena por cena. */
  private blocosDoProjeto(
    linha: CenaNaLinha[],
    silencios: Map<number, Silencio[]>,
    opcoes: OpcoesLegenda,
  ): BlocoLegenda[] {
    return linha.flatMap((cena) =>
      blocosDaCena({
        texto: cena.texto,
        inicioMs: cena.inicioMs,
        duracaoMs: cena.duracaoMs,
        maxCaracteres: opcoes.maxCaracteres,
        silencios: silencios.get(cena.numero),
      }),
    );
  }

  /** Pausas reais de cada cena, usadas para encaixar as trocas de legenda na fala. */
  private async silenciosDoProjeto(
    cenas: {
      numero: number;
      audioPath: string | null;
      audioDuracaoMs: number | null;
      duracaoSegundos: number;
    }[],
  ): Promise<Map<number, Silencio[]>> {
    return this.ffmpeg.comPastaTemporaria(async (dir) => {
      const mapa = new Map<number, Silencio[]>();
      for (const cena of cenas) {
        if (!cena.audioPath) continue;
        const wav = join(dir, `cena-${pad(cena.numero)}.wav`);
        await fs.writeFile(wav, await this.storage.get(cena.audioPath));
        const duracaoMs = cena.audioDuracaoMs ?? cena.duracaoSegundos * 1000;
        const saida = await this.ffmpeg.capture([
          '-i',
          wav,
          '-af',
          'silencedetect=noise=-35dB:d=0.16',
          '-f',
          'null',
          '-',
        ]);
        mapa.set(cena.numero, parsearSilencios(saida, duracaoMs));
      }
      return mapa;
    });
  }

  async mp4(projectId: string): Promise<{ data: Buffer; nome: string }> {
    const project = await this.projects.get(projectId);
    const exp = await this.prisma.export.findFirst({
      where: { projectId, tipo: 'mp4', status: 'concluido' },
      orderBy: { createdAt: 'desc' },
    });
    if (!exp?.path) throw new NotFoundException('O vídeo ainda não foi montado.');
    const nome =
      (project.tituloEscolhido || 'video').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60) || 'video';
    return { data: await this.storage.get(exp.path), nome: `${nome}.mp4` };
  }

  /** Pacote para editar em outro programa: imagens, áudios, legendas, tempos, thumbnails e textos. */
  async montarZip(projectId: string): Promise<archiver.Archiver> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.cenasOrdenadas(projectId);
    if (cenas.length === 0) throw new BadRequestException('Não há cenas para exportar.');
    const linha = linhaDoTempo(cenas);
    const efeito = (row?.efeitoCamera as EfeitoCamera) ?? 'alternado';
    const usarSugerida = row?.usarCameraSugerida ?? true;
    const { largura, altura } = resolucaoDoFormato(project.formato);
    const opcoesLegenda = opcoesDeLegenda(
      largura,
      altura,
      row?.legendaTamanho ?? 100,
      (row?.legendaPosicao as 'baixo' | 'meio' | 'topo') ?? 'baixo',
      row?.legendaFonte ?? 'Noto Sans',
      row?.legendaCor ?? '#C4B5FD',
      (row?.legendaEstilo as LegendaEstilo | undefined) ?? 'negrito',
    );
    const zip = archiver('zip', { zlib: { level: 6 } });

    // Versões de áudio de todas as cenas, para o manifesto e para a pasta de versões.
    const versoes = await this.prisma.sceneAudio.findMany({
      where: { sceneId: { in: cenas.map((c) => c.id) } },
      orderBy: { criadoEm: 'asc' },
    });
    const versoesPorCena = new Map<number, typeof versoes>();
    for (const c of cenas) {
      versoesPorCena.set(
        c.numero,
        versoes.filter((v) => v.sceneId === c.id),
      );
    }

    const tempos = [];
    const cenasManifesto: ProjetoPacote['scenes'] = [];
    for (const c of cenas) {
      const item = linha[c.numero - 1];
      const imagem = c.imagemPath
        ? `imagens/cena-${pad(c.numero)}.${extDaChave(c.imagemPath)}`
        : null;
      const audio = c.audioPath ? `audios/cena-${pad(c.numero)}.wav` : null;
      if (imagem) zip.append(await this.storage.get(c.imagemPath!), { name: imagem });
      if (audio) zip.append(await this.storage.get(c.audioPath!), { name: audio });

      // A versão atual já vai em `audios/cena-NNN.wav`; as anteriores em `audios/versoes/`.
      const audiosManifesto: ProjetoPacote['scenes'][number]['audios'] = [];
      const anteriores = versoesPorCena.get(c.numero) ?? [];
      const versaoAtual = anteriores.find((v) => v.path === c.audioPath);
      if (audio) {
        audiosManifesto.push({
          arquivo: audio,
          duracaoMs: c.audioDuracaoMs ?? c.duracaoSegundos * 1000,
          atual: true,
          criadoEm: versaoAtual?.criadoEm.toISOString(),
        });
      }
      for (const [i, v] of anteriores.entries()) {
        if (v.path === c.audioPath) continue;
        const nome = `audios/versoes/cena-${pad(c.numero)}-${i + 1}.${extDaChave(v.path)}`;
        zip.append(await this.storage.get(v.path), { name: nome });
        audiosManifesto.push({
          arquivo: nome,
          duracaoMs: v.duracaoMs,
          atual: false,
          criadoEm: v.criadoEm.toISOString(),
        });
      }
      if (audio && audiosManifesto.length > 1) {
        // Garante que só a versão igual ao áudio atual fique marcada como atual.
        for (const a of audiosManifesto) a.atual = a.arquivo === audio;
      }

      tempos.push({
        cena: c.numero,
        inicio: formatarTempo(item.inicioMs / 1000),
        inicioMs: item.inicioMs,
        duracaoMs: item.duracaoMs,
        imagem,
        audio,
        textoNarrado: c.textoNarrado,
        efeitoCamera:
          usarSugerida && c.sugestaoCamera
            ? (c.sugestaoCamera as EfeitoCamera)
            : efeitoDaCena(efeito, c.numero),
      });
      cenasManifesto.push({
        numero: c.numero,
        textoNarrado: c.textoNarrado,
        duracaoSegundos: c.duracaoSegundos,
        descricaoVisual: c.descricaoVisual,
        promptImagem: c.promptImagem,
        sugestaoCamera: c.sugestaoCamera,
        alertaImagem: c.alertaImagem,
        statusNarracao: c.statusNarracao,
        statusImagem: c.statusImagem,
        audioDuracaoMs: c.audioDuracaoMs,
        versaoMidia: c.versaoMidia,
        arquivoImagem: imagem,
        arquivoAudio: audio,
        audios: audiosManifesto,
      });
    }
    // Elementos visuais explicativos, na ordem de criação, com o vínculo à cena.
    const visuais = await this.prisma.visualAsset.findMany({
      where: { projectId },
      orderBy: { criadoEm: 'asc' },
    });
    const visuaisManifesto: ProjetoPacote['visualAssets'] = [];
    for (const [i, v] of visuais.entries()) {
      const nome = v.imagemPath
        ? `elementos-visuais/${v.tipo}-${i + 1}.${extDaChave(v.imagemPath)}`
        : null;
      if (nome && v.imagemPath) {
        zip.append(await this.storage.get(v.imagemPath), { name: nome });
        tempos.push({
          cena: v.sceneNumero,
          tipo: v.tipo,
          titulo: v.titulo,
          periodo: v.periodo,
          arquivo: nome,
        } as never);
      }
      visuaisManifesto.push({
        sceneNumero: v.sceneNumero,
        tipo: v.tipo as ProjetoPacote['visualAssets'][number]['tipo'],
        titulo: v.titulo,
        periodo: v.periodo,
        descricao: v.descricao,
        prompt: v.prompt,
        arquivo: nome,
      });
    }
    zip.append(
      srtDeLegendas(
        this.blocosDoProjeto(linha, await this.silenciosDoProjeto(cenas), opcoesLegenda),
      ),
      {
        name: 'legendas.srt',
      },
    );
    zip.append(JSON.stringify(tempos, null, 2), { name: 'tempos.json' });

    const arquivoMusica = row?.musicaPath ? `musica/musica.${extDaChave(row.musicaPath)}` : null;
    if (row?.musicaPath && arquivoMusica) {
      zip.append(await this.storage.get(row.musicaPath), { name: arquivoMusica });
      zip.append(
        [
          `Música: ${row.musicaNome}`,
          row.musicaArtista ? `Artista: ${row.musicaArtista}` : '',
          row.musicaOrigem ? `Origem: ${row.musicaOrigem}` : '',
          row.musicaCredito ? `Créditos: ${row.musicaCredito}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        { name: 'musica.txt' },
      );
    }

    const tags = await this.prisma.tag.findMany({
      where: { projectId },
      orderBy: { ordem: 'asc' },
    });
    zip.append(project.tituloEscolhido, { name: 'titulo.txt' });
    zip.append(tags.map((t) => t.texto).join(','), { name: 'tags.txt' });
    zip.append(project.descricao, { name: 'descricao.txt' });

    const thumbs = await this.prisma.thumbnail.findMany({
      where: { projectId },
      orderBy: { variacao: 'asc' },
    });
    const thumbsManifesto: ProjetoPacote['thumbnails'] = [];
    for (const t of thumbs) {
      const nome = t.imagemPath
        ? `thumbnails/thumbnail-${t.variacao}${t.escolhida ? '-escolhida' : ''}.jpg`
        : null;
      if (t.imagemPath && nome) {
        zip.append(await this.storage.get(t.imagemPath), { name: nome });
      }
      thumbsManifesto.push({
        variacao: t.variacao,
        textoNaImagem: t.textoNaImagem,
        escolhida: t.escolhida,
        arquivo: nome,
      });
    }

    const [titulos, capitulos, revisao] = await Promise.all([
      this.prisma.title.findMany({ where: { projectId }, orderBy: { nota: 'desc' } }),
      this.prisma.chapter.findMany({ where: { projectId } }),
      this.prisma.editorialReview.findFirst({
        where: { projectId },
        orderBy: { criadoEm: 'desc' },
        include: { issues: { orderBy: [{ cenaNumero: 'asc' }, { id: 'asc' }] } },
      }),
    ]);

    // O manifesto é gerado com o mesmo schema que o importador valida.
    const manifesto: ProjetoPacote = {
      schemaVersion: PROJETO_PACOTE_VERSAO,
      app: PROJETO_PACOTE_APP,
      exportadoEm: new Date().toISOString(),
      etapaAtual: project.etapaAtual,
      projeto: {
        ideia: project.ideia,
        tema: project.tema,
        publico: project.publico,
        formato: project.formato,
        duracaoMinutos: project.duracaoMinutos,
        idioma: project.idioma,
        tituloEscolhido: project.tituloEscolhido,
        vozNome: project.vozNome,
        vozInstrucaoTom: project.vozInstrucaoTom,
        narracaoNatural: project.narracaoNatural,
        narracaoVelocidade: project.narracaoVelocidade,
        pronuncia: project.pronuncia,
        estiloVisual: project.estiloVisual,
        descricao: project.descricao,
        efeitoCamera: project.efeitoCamera,
        usarCameraSugerida: project.usarCameraSugerida,
        legendasAtivas: project.legendasAtivas,
        legendaTamanho: project.legendaTamanho,
        legendaPosicao: project.legendaPosicao,
        legendaEstilo: project.legendaEstilo,
        legendaFonte: project.legendaFonte,
        legendaCor: project.legendaCor,
        editorialStatus: project.editorialStatus,
        roteiroManual: project.roteiroManual,
        fontesRoteiro: project.fontesRoteiro,
        revisaoFinalEm: project.revisaoFinalEm,
      },
      titles: titulos.map((t) => ({
        texto: t.texto,
        estilo: t.estilo,
        nota: t.nota,
        escolhido: t.escolhido,
      })),
      scenes: cenasManifesto,
      tags: tags.map((t) => t.texto),
      chapters: capitulos.map((c) => ({ tempo: c.tempo, titulo: c.titulo })),
      thumbnails: thumbsManifesto,
      visualAssets: visuaisManifesto,
      editorial: revisao
        ? {
            classificacao: revisao.classificacao as NonNullable<
              ProjetoPacote['editorial']
            >['classificacao'],
            resumo: revisao.resumo,
            criadoEm: revisao.criadoEm.toISOString(),
            issues: revisao.issues.map((i) => ({
              cenaNumero: i.cenaNumero,
              tipo: i.tipo as NonNullable<ProjetoPacote['editorial']>['issues'][number]['tipo'],
              trecho: i.trecho,
              problema: i.problema,
              explicacao: i.explicacao,
              sugestao: i.sugestao,
              fonte: i.fonte,
              confianca: i.confianca as NonNullable<
                ProjetoPacote['editorial']
              >['issues'][number]['confianca'],
              status: i.status as NonNullable<
                ProjetoPacote['editorial']
              >['issues'][number]['status'],
            })),
          }
        : null,
      musica:
        row?.musicaPath && arquivoMusica
          ? {
              arquivo: arquivoMusica,
              nome: row.musicaNome,
              artista: row.musicaArtista,
              origem: row.musicaOrigem,
              credito: row.musicaCredito,
              volume: row.musicaVolume,
              ducking: row.musicaDucking,
            }
          : null,
    };
    zip.append(JSON.stringify(projetoPacoteSchema.parse(manifesto), null, 2), {
      name: 'projeto.json',
    });

    void zip.finalize();
    return zip;
  }
}
