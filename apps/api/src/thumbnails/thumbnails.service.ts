import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Job, Thumbnail } from '@prisma/client';
import {
  MAX_PALAVRAS_THUMB,
  ThumbnailDto,
  ThumbnailsResponse,
  UploadImageInput,
  contarPalavras,
  thumbTextGenSchema,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptTextosThumb, promptThumbnail } from '../ai/prompts';
import { JobsService } from '../jobs/jobs.service';
import { FfmpegService } from '../media/ffmpeg.service';
import { textoDoRoteiro } from '../media/contexto';
import { chaveThumb } from '../media/files';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const limitarPalavras = (t: string) => t.trim().split(/\s+/).slice(0, MAX_PALAVRAS_THUMB).join(' ');

const toDto = (t: Thumbnail, titulo: string): ThumbnailDto => ({
  id: t.id,
  variacao: t.variacao,
  textoNaImagem: t.textoNaImagem,
  temImagem: Boolean(t.imagemPath),
  versao: t.imagemPath ?? '',
  escolhida: t.escolhida,
  promptImagem: promptThumbnail({ titulo, n: t.variacao, textoCurto: t.textoNaImagem }),
});

@Injectable()
export class ThumbnailsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly ffmpeg: FfmpegService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  onModuleInit() {
    this.jobs.register('thumbnail', (job: Job) => this.gerar(job.alvoId!));
  }

  async response(projectId: string): Promise<ThumbnailsResponse> {
    const project = await this.projects.get(projectId);
    const rows = await this.prisma.thumbnail.findMany({ where: { projectId }, orderBy: { variacao: 'asc' } });
    return {
      thumbnails: rows.map((t) => toDto(t, project.tituloEscolhido)),
      jobs: await this.jobs.listar(projectId, ['thumbnail']),
    };
  }

  async generateAll(projectId: string): Promise<ThumbnailsResponse> {
    const project = await this.projects.get(projectId);
    if (!project.tituloEscolhido.trim()) {
      throw new BadRequestException('Escolha um título na etapa 2 antes de gerar as thumbnails.');
    }
    const roteiro = await textoDoRoteiro(this.prisma, projectId, 3000);
    const { textos } = await this.ai.generateJson(
      promptTextosThumb({ titulo: project.tituloEscolhido, roteiro, idioma: project.idioma }),
      thumbTextGenSchema,
    );
    const base = textos.map(limitarPalavras).filter(Boolean);
    if (base.length === 0) throw new BadRequestException('O modelo não devolveu textos utilizáveis. Tente de novo.');
    const duas = Array.from({ length: 2 }, (_, i) => base[i] ?? base[i % base.length]);

    const antigas = await this.prisma.thumbnail.findMany({ where: { projectId } });
    for (const a of antigas) if (a.imagemPath) await this.storage.remove(a.imagemPath).catch(() => undefined);
    await this.prisma.job.deleteMany({ where: { projectId, tipo: 'thumbnail' } });
    await this.prisma.$transaction([
      this.prisma.thumbnail.deleteMany({ where: { projectId } }),
      this.prisma.thumbnail.createMany({
        data: duas.map((textoNaImagem, i) => ({ projectId, variacao: i + 1, textoNaImagem })),
      }),
    ]);
    // As imagens são criadas manualmente (copiar prompt + enviar) ou uma a uma em "Refazer".
    // Assim a etapa funciona mesmo sem cota/billing para os modelos de imagem.
    return this.response(projectId);
  }

  private async getThumb(id: string): Promise<Thumbnail> {
    const thumb = await this.prisma.thumbnail.findUnique({ where: { id } });
    if (!thumb) throw new NotFoundException('Thumbnail não encontrada');
    await this.projects.get(thumb.projectId);
    return thumb;
  }

  async regenerate(id: string): Promise<ThumbnailsResponse> {
    const thumb = await this.getThumb(id);
    await this.jobs.enqueue(thumb.projectId, 'thumbnail', thumb.id);
    return this.response(thumb.projectId);
  }

  async updateText(id: string, texto: string): Promise<ThumbnailsResponse> {
    const thumb = await this.getThumb(id);
    if (contarPalavras(texto) > MAX_PALAVRAS_THUMB) {
      throw new BadRequestException(`O texto da thumbnail tem no máximo ${MAX_PALAVRAS_THUMB} palavras.`);
    }
    await this.prisma.thumbnail.update({ where: { id }, data: { textoNaImagem: texto.trim() } });
    return this.response(thumb.projectId);
  }

  async select(id: string): Promise<ThumbnailsResponse> {
    const thumb = await this.getThumb(id);
    await this.prisma.$transaction([
      this.prisma.thumbnail.updateMany({ where: { projectId: thumb.projectId }, data: { escolhida: false } }),
      this.prisma.thumbnail.update({ where: { id }, data: { escolhida: true } }),
    ]);
    return this.response(thumb.projectId);
  }

  /** Executado pela fila: gera, recorta para 1280x720 e salva. */
  private async gerar(id: string): Promise<void> {
    const thumb = await this.prisma.thumbnail.findUnique({ where: { id } });
    if (!thumb) return;
    const project = await this.projects.get(thumb.projectId);
    const img = await this.ai.generateImage(
      promptThumbnail({ titulo: project.tituloEscolhido, n: thumb.variacao, textoCurto: thumb.textoNaImagem }),
      '16:9',
    );
    const jpg = await this.ffmpeg.redimensionar(img.data, 1280, 720);
    await this.salvarImagem(thumb, jpg);
  }

  /** Imagem enviada manualmente (Flow, Nano Banana etc.): recorta para 1280x720. */
  async upload(id: string, input: UploadImageInput): Promise<ThumbnailsResponse> {
    const thumb = await this.getThumb(id);
    const base64 = input.base64.replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0) throw new BadRequestException('Imagem inválida.');
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('A imagem passa de 10 MB.');
    await this.salvarImagem(thumb, await this.ffmpeg.redimensionar(data, 1280, 720));
    return this.response(thumb.projectId);
  }

  private async salvarImagem(thumb: Thumbnail, jpg: Buffer): Promise<void> {
    const chave = chaveThumb(thumb.projectId, thumb.id);
    await this.storage.put(chave, jpg, 'image/jpeg');
    if (thumb.imagemPath) await this.storage.remove(thumb.imagemPath).catch(() => undefined);
    await this.prisma.thumbnail.update({ where: { id: thumb.id }, data: { imagemPath: chave } });
  }

  async imagem(id: string): Promise<{ data: Buffer; variacao: number }> {
    const thumb = await this.getThumb(id);
    if (!thumb.imagemPath) throw new NotFoundException('Esta thumbnail ainda não tem imagem.');
    return { data: await this.storage.get(thumb.imagemPath), variacao: thumb.variacao };
  }
}
