import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Scene } from '@prisma/client';
import { AudioVersaoDto, Idioma, NarrationResponse, calcularResumoRoteiro } from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { JobsService } from '../jobs/jobs.service';
import { chaveAudio } from '../media/files';
import { textoFalado, textoParaNarracao } from '../media/narracao';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { toSceneDto } from '../scenes/scenes.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const MAX_VERSOES = 5;

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
    const rows = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const scenes = rows.map(toSceneDto);
    return {
      vozNome: project.vozNome,
      vozInstrucaoTom: project.vozInstrucaoTom,
      formato: project.formato,
      // A narração mais humana fica sempre ativa neste projeto.
      narracaoNatural: true,
      narracaoVelocidade: project.narracaoVelocidade,
      pronuncia: project.pronuncia,
      scenes,
      resumo: calcularResumoRoteiro(scenes, project.formato, project.duracaoMinutos),
      jobs: await this.jobs.listar(projectId, ['narracao']),
    };
  }

  /** Enfileira as cenas sem narração ou desatualizadas (ou todas, se pedido). */
  async generateAll(projectId: string, todas = false): Promise<NarrationResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    if (cenas.length === 0) throw new BadRequestException('Gere o roteiro antes da narração.');
    const vazias = cenas.filter((c) => !c.textoNarrado.trim()).map((c) => c.numero);
    if (vazias.length) {
      throw new BadRequestException(`Há cenas sem texto narrado: ${vazias.join(', ')}.`);
    }
    for (const c of cenas) {
      const precisa =
        !c.audioPath || c.statusNarracao === 'pendente' || c.statusNarracao === 'desatualizado';
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

  /** Executado pela fila. Guarda a versão anterior para comparação. */
  private async gerarCena(sceneId: string): Promise<void> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) return; // cena apagada enquanto estava na fila
    const project = await this.projects.get(scene.projectId); // valida o dono
    const texto = scene.textoNarrado.trim();
    if (!texto) throw new Error(`A cena ${scene.numero} não tem texto narrado.`);

    const preparado = textoParaNarracao(textoFalado(texto), project.pronuncia);
    const audio = await this.ai.generateSpeech(
      preparado,
      true,
      project.idioma,
      project.narracaoVelocidade,
    );
    const chave = chaveAudio(scene.projectId, scene.id);
    await this.storage.put(chave, audio.wav, 'audio/wav');
    await this.prisma.$transaction([
      this.prisma.sceneAudio.updateMany({ where: { sceneId }, data: { atual: false } }),
      this.prisma.sceneAudio.create({
        data: { sceneId, path: chave, duracaoMs: audio.duracaoMs, atual: true },
      }),
      this.prisma.scene.update({
        where: { id: sceneId },
        data: {
          audioPath: chave,
          audioDuracaoMs: audio.duracaoMs,
          statusNarracao: 'gerado',
          versaoMidia: { increment: 1 },
        },
      }),
    ]);
    await this.limparVersoesAntigas(sceneId);
  }

  /** Mantém as últimas MAX_VERSOES e apaga os arquivos das mais antigas. */
  private async limparVersoesAntigas(sceneId: string): Promise<void> {
    const versoes = await this.prisma.sceneAudio.findMany({
      where: { sceneId },
      orderBy: { criadoEm: 'desc' },
    });
    const descartar = versoes.slice(MAX_VERSOES);
    if (!descartar.length) return;
    for (const v of descartar) await this.storage.remove(v.path).catch(() => undefined);
    await this.prisma.sceneAudio.deleteMany({ where: { id: { in: descartar.map((v) => v.id) } } });
  }

  /** Versões guardadas da cena (a mais recente primeiro). */
  async versoes(sceneId: string): Promise<AudioVersaoDto[]> {
    await this.getScene(sceneId);
    const rows = await this.prisma.sceneAudio.findMany({
      where: { sceneId },
      orderBy: { criadoEm: 'desc' },
    });
    return rows.map((v) => ({
      id: v.id,
      duracaoMs: v.duracaoMs,
      atual: v.atual,
      criadoEm: v.criadoEm.toISOString(),
    }));
  }

  /** Volta uma versão anterior para a cena (sem gerar de novo). */
  async usarVersao(sceneId: string, versaoId: string): Promise<NarrationResponse> {
    const scene = await this.getScene(sceneId);
    const versao = await this.prisma.sceneAudio.findFirst({ where: { id: versaoId, sceneId } });
    if (!versao) throw new NotFoundException('Versão de áudio não encontrada.');
    await this.prisma.$transaction([
      this.prisma.sceneAudio.updateMany({ where: { sceneId }, data: { atual: false } }),
      this.prisma.sceneAudio.update({ where: { id: versaoId }, data: { atual: true } }),
      this.prisma.scene.update({
        where: { id: sceneId },
        data: {
          audioPath: versao.path,
          audioDuracaoMs: versao.duracaoMs,
          statusNarracao: 'gerado',
          versaoMidia: { increment: 1 },
        },
      }),
    ]);
    return this.response(scene.projectId);
  }

  /** Aprovação individual da cena (a etapa aceita aprovar todas de uma vez). */
  async aprovarCena(sceneId: string): Promise<NarrationResponse> {
    const scene = await this.getScene(sceneId);
    if (
      !scene.audioPath ||
      scene.statusNarracao === 'desatualizado' ||
      scene.statusNarracao === 'pendente'
    ) {
      throw new BadRequestException(`A cena ${scene.numero} ainda não tem narração atualizada.`);
    }
    await this.prisma.scene.update({
      where: { id: sceneId },
      data: { statusNarracao: 'aprovado' },
    });
    return this.response(scene.projectId);
  }

  async audio(sceneId: string): Promise<Buffer> {
    const scene = await this.getScene(sceneId);
    if (!scene.audioPath) throw new NotFoundException('Esta cena ainda não tem narração.');
    return this.storage.get(scene.audioPath);
  }

  /** Áudio de uma versão específica, para comparar antes de escolher. */
  async audioDaVersao(sceneId: string, versaoId: string): Promise<Buffer> {
    await this.getScene(sceneId);
    const versao = await this.prisma.sceneAudio.findFirst({ where: { id: versaoId, sceneId } });
    if (!versao) throw new NotFoundException('Versão de áudio não encontrada.');
    return this.storage.get(versao.path);
  }

  /** Amostra curta com a voz do projeto, sem gravar nada. */
  async sample(projectId: string): Promise<Buffer> {
    const project = await this.projects.get(projectId);
    const frase = FRASES_DE_TESTE[project.idioma] ?? FRASES_DE_TESTE['pt-BR'];
    const audio = await this.ai.generateSpeech(
      textoParaNarracao(frase, project.pronuncia),
      true,
      project.idioma,
      project.narracaoVelocidade,
    );
    return audio.wav;
  }

  async approve(projectId: string): Promise<NarrationResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId } });
    const pendentes = cenas
      .filter(
        (c) =>
          !c.audioPath || c.statusNarracao === 'pendente' || c.statusNarracao === 'desatualizado',
      )
      .map((c) => c.numero);
    if (cenas.length === 0 || pendentes.length) {
      throw new BadRequestException(
        cenas.length === 0
          ? 'Gere o roteiro antes da narração.'
          : `Falta narração atualizada nas cenas: ${pendentes.join(', ')}.`,
      );
    }
    await this.prisma.scene.updateMany({
      where: { projectId },
      data: { statusNarracao: 'aprovado' },
    });
    return this.response(projectId);
  }
}
