import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Job, VisualAsset } from '@prisma/client';
import {
  CreateVisualAssetInput,
  UpdateVisualAssetInput,
  VisualAssetDto,
  VisualAssetsResponse,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptVisualAsset } from '../ai/prompts';
import { JobsService } from '../jobs/jobs.service';
import { chaveVisual, extDaChave, MIME_PARA_EXT } from '../media/files';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Injectable()
export class VisualAssetsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  onModuleInit() {
    this.jobs.register('visual', (job: Job) => this.gerar(job.alvoId!));
  }

  private promptDe(
    asset: { tipo: string; titulo: string; periodo: string; descricao: string },
    project: { estiloVisual: string; formato: string },
  ): string {
    return promptVisualAsset({
      tipo: asset.tipo === 'linha-do-tempo' ? 'linha-do-tempo' : 'mapa',
      titulo: asset.titulo,
      periodo: asset.periodo,
      descricao: asset.descricao,
      estiloVisual: project.estiloVisual,
      proporcao: project.formato === 'shorts' ? '9:16' : '16:9',
    });
  }

  private dto(asset: VisualAsset): VisualAssetDto {
    return {
      id: asset.id,
      sceneNumero: asset.sceneNumero,
      tipo: asset.tipo as VisualAssetDto['tipo'],
      titulo: asset.titulo,
      periodo: asset.periodo,
      descricao: asset.descricao,
      prompt: asset.prompt,
      temImagem: Boolean(asset.imagemPath),
      versao: asset.imagemPath ?? 'sem-imagem',
    };
  }

  async response(projectId: string): Promise<VisualAssetsResponse> {
    await this.projects.get(projectId);
    const assets = await this.prisma.visualAsset.findMany({
      where: { projectId },
      orderBy: { criadoEm: 'asc' },
    });
    return {
      assets: assets.map((a) => this.dto(a)),
      jobs: await this.jobs.listar(projectId, ['visual']),
    };
  }

  private async get(assetId: string): Promise<VisualAsset> {
    const asset = await this.prisma.visualAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Elemento visual não encontrado');
    await this.projects.get(asset.projectId);
    return asset;
  }

  async create(projectId: string, input: CreateVisualAssetInput): Promise<VisualAssetsResponse> {
    const project = await this.projects.get(projectId);
    if (!input.titulo.trim() && !input.descricao.trim()) {
      throw new BadRequestException('Descreva o mapa ou a linha do tempo antes de gerar.');
    }
    if (input.sceneNumero) {
      const existe = await this.prisma.scene.findFirst({
        where: { projectId, numero: input.sceneNumero },
      });
      if (!existe) throw new BadRequestException(`A cena ${input.sceneNumero} não existe.`);
    }
    const base = {
      projectId,
      tipo: input.tipo,
      sceneNumero: input.sceneNumero ?? null,
      titulo: input.titulo,
      periodo: input.periodo,
      descricao: input.descricao,
    };
    const asset = await this.prisma.visualAsset.create({
      data: {
        ...base,
        prompt: this.promptDe(base, project),
      },
    });
    await this.jobs.enqueue(projectId, 'visual', asset.id);
    return this.response(projectId);
  }

  async update(assetId: string, input: UpdateVisualAssetInput): Promise<VisualAssetsResponse> {
    const asset = await this.get(assetId);
    const project = await this.projects.get(asset.projectId);
    const dados = {
      titulo: input.titulo ?? asset.titulo,
      periodo: input.periodo ?? asset.periodo,
      descricao: input.descricao ?? asset.descricao,
      sceneNumero: input.sceneNumero === undefined ? asset.sceneNumero : input.sceneNumero,
    };
    const atualizado = await this.prisma.visualAsset.update({
      where: { id: assetId },
      data: {
        ...dados,
        prompt: this.promptDe({ ...asset, ...dados }, project),
      },
    });
    return this.response(atualizado.projectId);
  }

  async regenerate(assetId: string): Promise<VisualAssetsResponse> {
    const asset = await this.get(assetId);
    await this.jobs.enqueue(asset.projectId, 'visual', asset.id);
    return this.response(asset.projectId);
  }

  async remove(assetId: string): Promise<VisualAssetsResponse> {
    const asset = await this.get(assetId);
    if (asset.imagemPath) await this.storage.remove(asset.imagemPath).catch(() => undefined);
    await this.prisma.$transaction([
      this.prisma.job.deleteMany({ where: { tipo: 'visual', alvoId: assetId } }),
      this.prisma.visualAsset.delete({ where: { id: assetId } }),
    ]);
    return this.response(asset.projectId);
  }

  private async gerar(assetId: string): Promise<void> {
    const asset = await this.prisma.visualAsset.findUnique({ where: { id: assetId } });
    if (!asset) return;
    const project = await this.projects.get(asset.projectId);
    const prompt = this.promptDe(asset, project);
    const img = await this.ai.generateImage(
      prompt,
      project.formato === 'shorts' ? '9:16' : '16:9',
    );
    const ext = MIME_PARA_EXT[img.mime] ?? 'png';
    const chave = chaveVisual(asset.projectId, asset.id, ext);
    await this.storage.put(chave, img.data, img.mime);
    if (asset.imagemPath && asset.imagemPath !== chave) {
      await this.storage.remove(asset.imagemPath).catch(() => undefined);
    }
    await this.prisma.visualAsset.update({
      where: { id: assetId },
      data: { imagemPath: chave, prompt },
    });
  }

  async upload(assetId: string, base64: string, mime: string): Promise<VisualAssetsResponse> {
    const asset = await this.get(assetId);
    const data = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!data.length) throw new BadRequestException('Imagem inválida.');
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('A imagem passa de 10 MB.');
    const ext = MIME_PARA_EXT[mime] ?? 'png';
    const chave = chaveVisual(asset.projectId, asset.id, ext);
    await this.storage.put(chave, data, mime);
    if (asset.imagemPath && asset.imagemPath !== chave) {
      await this.storage.remove(asset.imagemPath).catch(() => undefined);
    }
    await this.prisma.visualAsset.update({ where: { id: assetId }, data: { imagemPath: chave } });
    return this.response(asset.projectId);
  }

  async imagem(assetId: string): Promise<{ data: Buffer; mime: string }> {
    const asset = await this.get(assetId);
    if (!asset.imagemPath) throw new NotFoundException('Este elemento visual ainda não tem imagem.');
    const ext = extDaChave(asset.imagemPath);
    return {
      data: await this.storage.get(asset.imagemPath),
      mime: ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png',
    };
  }
}
