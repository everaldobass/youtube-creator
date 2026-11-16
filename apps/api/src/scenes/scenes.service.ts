import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Scene } from '@prisma/client';
import {
  ProjectDto,
  RoteiroResumo,
  SceneDto,
  ScenesResponse,
  StatusItem,
  UpdateSceneInput,
  calcularResumoRoteiro,
  sceneGenSchema,
  singleSceneGenSchema,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptRefazerCena, promptRoteiro } from '../ai/prompts';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

export const toSceneDto = (s: Scene): SceneDto => ({
  id: s.id,
  numero: s.numero,
  textoNarrado: s.textoNarrado,
  duracaoSegundos: s.duracaoSegundos,
  descricaoVisual: s.descricaoVisual,
  statusNarracao: s.statusNarracao as StatusItem,
  statusImagem: s.statusImagem as StatusItem,
  audioDuracaoMs: s.audioDuracaoMs,
  temAudio: Boolean(s.audioPath),
  temImagem: Boolean(s.imagemPath),
  versaoMidia: s.versaoMidia,
});

/** Narração ou imagem já geradas ficam "desatualizadas" quando o texto muda. */
const desatualizar = (status: string): string =>
  status === 'gerado' || status === 'aprovado' ? 'desatualizado' : status;

const limitarDuracao = (n: number) => Math.min(120, Math.max(1, Math.round(n)));

@Injectable()
export class ScenesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** Apaga do storage o áudio e a imagem de cenas que deixaram de existir. */
  private async limparArquivos(cenas: Pick<Scene, 'audioPath' | 'imagemPath'>[]): Promise<void> {
    for (const c of cenas) {
      for (const chave of [c.audioPath, c.imagemPath]) {
        if (chave) await this.storage.remove(chave).catch(() => undefined);
      }
    }
  }

  private resumo(project: ProjectDto, scenes: SceneDto[]): RoteiroResumo {
    return calcularResumoRoteiro(scenes, project.formato, project.duracaoMinutos);
  }

  private async resposta(project: ProjectDto): Promise<ScenesResponse> {
    const rows = await this.prisma.scene.findMany({
      where: { projectId: project.id },
      orderBy: { numero: 'asc' },
    });
    const scenes = rows.map(toSceneDto);
    return { scenes, resumo: this.resumo(project, scenes) };
  }

  async list(projectId: string): Promise<ScenesResponse> {
    return this.resposta(await this.projects.get(projectId));
  }

  /** Dois passos (negativo e depois positivo) para não violar o índice único (projectId, numero). */
  private async renumerar(projectId: string, idsEmOrdem: string[]): Promise<void> {
    await this.prisma.$transaction([
      ...idsEmOrdem.map((id, i) =>
        this.prisma.scene.update({ where: { id }, data: { numero: -(i + 1) } }),
      ),
      ...idsEmOrdem.map((id, i) =>
        this.prisma.scene.update({ where: { id }, data: { numero: i + 1 } }),
      ),
    ]);
  }

  private async getScene(sceneId: string): Promise<{ scene: Scene; project: ProjectDto }> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException('Cena não encontrada');
    const project = await this.projects.get(scene.projectId); // valida o dono
    return { scene, project };
  }

  async generate(projectId: string): Promise<ScenesResponse> {
    const project = await this.projects.get(projectId);
    if (!project.tituloEscolhido.trim()) {
      throw new BadRequestException('Escolha um título na etapa 2 antes de gerar o roteiro.');
    }

    const gerado = await this.ai.generateJson(
      promptRoteiro({
        titulo: project.tituloEscolhido,
        duracaoMinutos: project.duracaoMinutos,
        formato: project.formato,
        tema: project.tema,
        publico: project.publico,
        idioma: project.idioma,
      }),
      sceneGenSchema,
    );

    const antigas = await this.prisma.scene.findMany({
      where: { projectId },
      select: { id: true, audioPath: true, imagemPath: true },
    });
    await this.limparArquivos(antigas);
    const idsAntigos = antigas.map((s) => s.id);
    await this.prisma.$transaction([
      // Jobs presos às cenas antigas deixariam erros órfãos na tela.
      this.prisma.job.deleteMany({
        where: { projectId, tipo: { in: ['narracao', 'imagem'] }, alvoId: { in: idsAntigos } },
      }),
      this.prisma.scene.deleteMany({ where: { projectId } }),
      this.prisma.scene.createMany({
        data: gerado.map((c, i) => ({
          projectId,
          numero: i + 1,
          textoNarrado: c.textoNarrado.trim(),
          duracaoSegundos: limitarDuracao(c.duracaoSegundos),
          descricaoVisual: c.descricaoVisual.trim(),
        })),
      }),
    ]);
    return this.resposta(project);
  }

  async add(projectId: string, depoisDaCena?: number): Promise<ScenesResponse> {
    const project = await this.projects.get(projectId);
    const existentes = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const posicao = Math.min(Math.max(depoisDaCena ?? existentes.length, 0), existentes.length);

    const nova = await this.prisma.scene.create({
      data: {
        projectId,
        numero: existentes.length + 1,
        duracaoSegundos: project.formato === 'shorts' ? 5 : 15,
      },
    });
    const ids = existentes.map((s) => s.id);
    ids.splice(posicao, 0, nova.id);
    await this.renumerar(projectId, ids);
    return this.resposta(project);
  }

  async reorder(projectId: string, ids: string[]): Promise<ScenesResponse> {
    const project = await this.projects.get(projectId);
    const existentes = await this.prisma.scene.findMany({ where: { projectId }, select: { id: true } });
    const mesmos =
      ids.length === existentes.length &&
      new Set(ids).size === ids.length &&
      existentes.every((s) => ids.includes(s.id));
    if (!mesmos) throw new BadRequestException('A lista de cenas não corresponde ao roteiro atual.');
    await this.renumerar(projectId, ids);
    return this.resposta(project);
  }

  async update(
    sceneId: string,
    input: UpdateSceneInput,
  ): Promise<{ scene: SceneDto; resumo: RoteiroResumo }> {
    const { scene, project } = await this.getScene(sceneId);
    const data: Partial<Scene> = {};

    if (input.textoNarrado !== undefined && input.textoNarrado !== scene.textoNarrado) {
      data.textoNarrado = input.textoNarrado;
      data.statusNarracao = desatualizar(scene.statusNarracao);
    }
    if (input.descricaoVisual !== undefined && input.descricaoVisual !== scene.descricaoVisual) {
      data.descricaoVisual = input.descricaoVisual;
      data.statusImagem = desatualizar(scene.statusImagem);
    }
    if (input.duracaoSegundos !== undefined && input.duracaoSegundos !== scene.duracaoSegundos) {
      data.duracaoSegundos = input.duracaoSegundos;
    }

    const atualizada = Object.keys(data).length
      ? await this.prisma.scene.update({ where: { id: sceneId }, data })
      : scene;
    const todas = await this.prisma.scene.findMany({
      where: { projectId: project.id },
      orderBy: { numero: 'asc' },
    });
    return { scene: toSceneDto(atualizada), resumo: this.resumo(project, todas.map(toSceneDto)) };
  }

  async remove(sceneId: string): Promise<ScenesResponse> {
    const { scene, project } = await this.getScene(sceneId);
    await this.limparArquivos([scene]);
    await this.prisma.$transaction([
      this.prisma.job.deleteMany({ where: { alvoId: sceneId } }),
      this.prisma.scene.delete({ where: { id: sceneId } }),
    ]);
    const restantes = await this.prisma.scene.findMany({
      where: { projectId: scene.projectId },
      orderBy: { numero: 'asc' },
    });
    await this.renumerar(
      scene.projectId,
      restantes.map((s) => s.id),
    );
    return this.resposta(project);
  }

  async regenerate(sceneId: string): Promise<ScenesResponse> {
    const { scene, project } = await this.getScene(sceneId);
    const todas = await this.prisma.scene.findMany({
      where: { projectId: project.id },
      orderBy: { numero: 'asc' },
    });
    const i = todas.findIndex((s) => s.id === sceneId);

    const nova = await this.ai.generateJson(
      promptRefazerCena({
        titulo: project.tituloEscolhido || project.ideia || project.tema,
        formato: project.formato,
        idioma: project.idioma,
        numero: scene.numero,
        total: todas.length,
        anterior: todas[i - 1]?.textoNarrado,
        atual: scene.textoNarrado,
        proxima: todas[i + 1]?.textoNarrado,
      }),
      singleSceneGenSchema,
    );

    await this.prisma.scene.update({
      where: { id: sceneId },
      data: {
        textoNarrado: nova.textoNarrado.trim(),
        duracaoSegundos: limitarDuracao(nova.duracaoSegundos),
        descricaoVisual: nova.descricaoVisual.trim(),
        statusNarracao: desatualizar(scene.statusNarracao),
        statusImagem: desatualizar(scene.statusImagem),
      },
    });
    return this.resposta(project);
  }
}
