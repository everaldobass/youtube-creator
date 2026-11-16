import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Job, Scene } from '@prisma/client';
import { Idioma, NarrationResponse } from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { JobsService } from '../jobs/jobs.service';
import { chaveAudio } from '../media/files';
import { textoParaNarracao } from '../media/narracao';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { toSceneDto } from '../scenes/scenes.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const FRASES_DE_TESTE: Record<Idioma, string> = {
  'pt-BR':
    'Olá! Esta é uma amostra da voz que vai narrar o seu vídeo, do começo ao fim, com o mesmo tom em todas as cenas.',
  en: 'Hello! This is a sample of the voice that will narrate your video from start to finish, with the same tone in every scene.',
};

@Injectable()
export class NarrationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  onModuleInit() {
    this.jobs.register('narracao', (job: Job) => this.gerarCena(job.alvoId!));
  }

  async response(projectId: string): Promise<NarrationResponse> {
    const project = await this.projects.get(projectId);
    const rows = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    return {
      vozNome: project.vozNome,
      vozInstrucaoTom: project.vozInstrucaoTom,
      narracaoNatural: project.narracaoNatural,
      scenes: rows.map(toSceneDto),
      jobs: await this.jobs.listar(projectId, ['narracao']),
    };
  }

  /** Enfileira as cenas sem narração ou desatualizadas (ou todas, se pedido). */
  async generateAll(projectId: string, todas = false): Promise<NarrationResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    if (cenas.length === 0) throw new BadRequestException('Gere o roteiro antes da narração.');
    const vazias = cenas.filter((c) => !c.textoNarrado.trim()).map((c) => c.numero);
    if (vazias.length) {
      throw new BadRequestException(`Há cenas sem texto narrado: ${vazias.join(', ')}.`);
    }
    for (const c of cenas) {
      const precisa = !c.audioPath || c.statusNarracao === 'pendente' || c.statusNarracao === 'desatualizado';
      if (todas || precisa) await this.jobs.enqueue(projectId, 'narracao', c.id);
    }
    return this.response(projectId);
  }

  async generateScene(sceneId: string): Promise<NarrationResponse> {
    const scene = await this.getScene(sceneId);
    await this.jobs.enqueue(scene.projectId, 'narracao', scene.id);
    return this.response(scene.projectId);
  }

  private async getScene(sceneId: string): Promise<Scene> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException('Cena não encontrada');
    await this.projects.get(scene.projectId);
    return scene;
  }

  /** Executado pela fila. */
  private async gerarCena(sceneId: string): Promise<void> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) return; // cena apagada enquanto estava na fila
    const project = await this.projects.get(scene.projectId); // valida o dono
    const texto = scene.textoNarrado.trim();
    if (!texto) throw new Error(`A cena ${scene.numero} não tem texto narrado.`);

    const audio = await this.ai.generateSpeech(
      project.narracaoNatural ? textoParaNarracao(texto) : texto,
      project.narracaoNatural,
      project.idioma,
    );
    const chave = chaveAudio(scene.projectId, scene.id);
    await this.storage.put(chave, audio.wav, 'audio/wav');
    await this.prisma.scene.update({
      where: { id: sceneId },
      data: {
        audioPath: chave,
        audioDuracaoMs: audio.duracaoMs,
        statusNarracao: 'gerado',
        versaoMidia: { increment: 1 },
      },
    });
  }

  async audio(sceneId: string): Promise<Buffer> {
    const scene = await this.getScene(sceneId);
    if (!scene.audioPath) throw new NotFoundException('Esta cena ainda não tem narração.');
    return this.storage.get(scene.audioPath);
  }

  /** Amostra curta com a voz do projeto, sem gravar nada. */
  async sample(projectId: string): Promise<Buffer> {
    const project = await this.projects.get(projectId);
    const frase = FRASES_DE_TESTE[project.idioma] ?? FRASES_DE_TESTE['pt-BR'];
    const audio = await this.ai.generateSpeech(
      project.narracaoNatural ? textoParaNarracao(frase) : frase,
      project.narracaoNatural,
      project.idioma,
    );
    return audio.wav;
  }

  async approve(projectId: string): Promise<NarrationResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId } });
    const pendentes = cenas
      .filter((c) => !c.audioPath || c.statusNarracao === 'pendente' || c.statusNarracao === 'desatualizado')
      .map((c) => c.numero);
    if (cenas.length === 0 || pendentes.length) {
      throw new BadRequestException(
        cenas.length === 0
          ? 'Gere o roteiro antes da narração.'
          : `Falta narração atualizada nas cenas: ${pendentes.join(', ')}.`,
      );
    }
    await this.prisma.scene.updateMany({ where: { projectId }, data: { statusNarracao: 'aprovado' } });
    return this.response(projectId);
  }
}
