import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import {
  CreateProjectInput,
  LIMITES_FORMATO,
  ProjectDto,
  STEP_SLUGS,
  StepSlug,
  UpdateProjectInput,
  proximaEtapa,
} from '@yt/shared';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

function toDto(p: Project): ProjectDto {
  return {
    id: p.id,
    ideia: p.ideia,
    tema: p.tema,
    publico: p.publico,
    formato: p.formato as ProjectDto['formato'],
    duracaoMinutos: p.duracaoMinutos,
    idioma: p.idioma as ProjectDto['idioma'],
    tituloEscolhido: p.tituloEscolhido,
    vozNome: p.vozNome,
    vozInstrucaoTom: p.vozInstrucaoTom,
    narracaoNatural: p.narracaoNatural,
    estiloVisual: p.estiloVisual,
    descricao: p.descricao,
    efeitoCamera: p.efeitoCamera as ProjectDto['efeitoCamera'],
    legendasAtivas: p.legendasAtivas,
    legendaTamanho: p.legendaTamanho,
    etapaAtual: p.etapaAtual as StepSlug,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** Shorts têm limite menor que vídeos longos (ver LIMITES_FORMATO). */
  private validarDuracao(formato: ProjectDto['formato'], duracaoMinutos: number): void {
    const max = LIMITES_FORMATO[formato].maxMinutos;
    if (duracaoMinutos > max) {
      throw new BadRequestException(
        `A duração máxima para ${formato === 'shorts' ? 'Shorts' : 'vídeos longos'} é ${max} minutos.`,
      );
    }
  }

  async list(): Promise<ProjectDto[]> {
    const userId = await this.prisma.localUserId();
    const rows = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<ProjectDto> {
    const userId = await this.prisma.localUserId();
    const row = await this.prisma.project.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Projeto não encontrado');
    return toDto(row);
  }

  async create(input: CreateProjectInput): Promise<ProjectDto> {
    this.validarDuracao(input.formato, input.duracaoMinutos);
    const userId = await this.prisma.localUserId();
    const row = await this.prisma.project.create({ data: { ...input, userId } });
    return toDto(row);
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    const project = await this.get(id);
    this.validarDuracao(input.formato ?? project.formato, input.duracaoMinutos ?? project.duracaoMinutos);
    const row = await this.prisma.project.update({ where: { id }, data: input });
    return toDto(row);
  }

  /** Aprova a etapa informada e libera a próxima (nunca volta nem pula etapas). */
  async advance(id: string, etapa: StepSlug): Promise<ProjectDto> {
    const project = await this.get(id);
    const atual = STEP_SLUGS.indexOf(project.etapaAtual);
    if (STEP_SLUGS.indexOf(etapa) > atual) {
      throw new BadRequestException('Conclua as etapas anteriores antes de avançar.');
    }
    const proxima = proximaEtapa(etapa);
    if (STEP_SLUGS.indexOf(proxima) <= atual) return project;
    const row = await this.prisma.project.update({ where: { id }, data: { etapaAtual: proxima } });
    return toDto(row);
  }

  /**
   * Copia definições, títulos, cenas, tags e capítulos. Mídias (áudio, imagens,
   * thumbnails) não são copiadas e precisam ser geradas de novo na cópia.
   */
  async duplicate(id: string): Promise<ProjectDto> {
    const original = await this.get(id);
    const userId = await this.prisma.localUserId();
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = original;

    const [titles, scenes, tags, chapters] = await Promise.all([
      this.prisma.title.findMany({ where: { projectId: id }, orderBy: { nota: 'desc' } }),
      this.prisma.scene.findMany({ where: { projectId: id }, orderBy: { numero: 'asc' } }),
      this.prisma.tag.findMany({ where: { projectId: id }, orderBy: { ordem: 'asc' } }),
      this.prisma.chapter.findMany({ where: { projectId: id } }),
    ]);

    // Sem mídia, a cópia para na etapa em que os textos copiados bastam.
    const limite = scenes.length ? STEP_SLUGS.indexOf('roteiro') : titles.length ? STEP_SLUGS.indexOf('titulos') : 0;
    const etapaAtual = STEP_SLUGS[Math.min(STEP_SLUGS.indexOf(original.etapaAtual), limite)];

    const row = await this.prisma.$transaction(async (tx) => {
      const novo = await tx.project.create({
        data: {
          ...rest,
          userId,
          etapaAtual,
          ideia: rest.ideia ? `${rest.ideia} (cópia)` : '',
        },
      });
      if (titles.length) {
        await tx.title.createMany({
          data: titles.map((t) => ({
            projectId: novo.id,
            texto: t.texto,
            estilo: t.estilo,
            nota: t.nota,
            escolhido: t.escolhido,
          })),
        });
      }
      if (scenes.length) {
        await tx.scene.createMany({
          data: scenes.map((s) => ({
            projectId: novo.id,
            numero: s.numero,
            textoNarrado: s.textoNarrado,
            duracaoSegundos: s.duracaoSegundos,
            descricaoVisual: s.descricaoVisual,
          })),
        });
      }
      if (tags.length) {
        await tx.tag.createMany({
          data: tags.map((t) => ({ projectId: novo.id, texto: t.texto, ordem: t.ordem })),
        });
      }
      if (chapters.length) {
        await tx.chapter.createMany({
          data: chapters.map((c) => ({ projectId: novo.id, tempo: c.tempo, titulo: c.titulo })),
        });
      }
      return novo;
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.project.delete({ where: { id } });
    // O banco já apagou em cascata; remove também os arquivos do projeto.
    await this.storage.removePrefix(`projects/${id}`).catch(() => undefined);
  }
}
