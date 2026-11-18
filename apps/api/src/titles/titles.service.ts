import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Title } from '@prisma/client';
import { MAX_TITULO, TitleDto, titleGenSchema } from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptTitulos } from '../ai/prompts';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const toDto = (t: Title): TitleDto => ({
  id: t.id,
  texto: t.texto,
  estilo: t.estilo,
  nota: t.nota,
  escolhido: t.escolhido,
});

@Injectable()
export class TitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async list(projectId: string): Promise<TitleDto[]> {
    await this.projects.get(projectId);
    const rows = await this.prisma.title.findMany({
      where: { projectId },
      orderBy: { nota: 'desc' },
    });
    return rows.map(toDto);
  }

  async generate(projectId: string): Promise<TitleDto[]> {
    const project = await this.projects.get(projectId);
    if (!project.tema.trim() && !project.ideia.trim()) {
      throw new BadRequestException('Informe o tema ou a ideia do vídeo na etapa 1.');
    }

    const gerados = await this.ai.generateJson(promptTitulos(project), titleGenSchema);
    const dados = gerados.slice(0, 5).map((t) => ({
      projectId,
      texto: t.texto.trim().slice(0, MAX_TITULO).trim(),
      estilo: t.estilo?.trim() ?? '',
      nota: Math.min(10, Math.max(0, Math.round(t.nota * 10) / 10)),
    }));

    await this.prisma.$transaction([
      this.prisma.title.deleteMany({ where: { projectId } }),
      this.prisma.title.createMany({ data: dados }),
      // Alternativas novas pedem uma escolha nova: o título anterior deixa de valer.
      this.prisma.project.update({ where: { id: projectId }, data: { tituloEscolhido: '' } }),
    ]);
    return this.list(projectId);
  }

  private async getTitle(titleId: string): Promise<Title> {
    const title = await this.prisma.title.findUnique({ where: { id: titleId } });
    if (!title) throw new NotFoundException('Título não encontrado');
    await this.projects.get(title.projectId); // garante que pertence ao usuário
    return title;
  }

  async update(titleId: string, texto: string): Promise<TitleDto> {
    const title = await this.getTitle(titleId);
    const novo = texto.trim();
    const row = await this.prisma.title.update({ where: { id: titleId }, data: { texto: novo } });
    // Se o título escolhido foi editado, o projeto acompanha.
    if (title.escolhido) {
      await this.projects.update(title.projectId, { tituloEscolhido: novo });
    }
    return toDto(row);
  }

  async select(projectId: string, titleId: string): Promise<TitleDto[]> {
    const title = await this.getTitle(titleId);
    if (title.projectId !== projectId) throw new NotFoundException('Título não encontrado');
    await this.prisma.$transaction([
      this.prisma.title.updateMany({ where: { projectId }, data: { escolhido: false } }),
      this.prisma.title.update({ where: { id: titleId }, data: { escolhido: true } }),
    ]);
    await this.projects.update(projectId, { tituloEscolhido: title.texto });
    return this.list(projectId);
  }

  /**
   * Usa o título/ideia digitado na etapa 1 como título do vídeo, sem passar
   * pela geração por IA. Limita a 100 caracteres (mesmo limite do
   * `tituloEscolhido`).
   */
  async usarIdeia(projectId: string): Promise<TitleDto[]> {
    const project = await this.projects.get(projectId);
    const ideia = project.ideia.trim().slice(0, 100).trim();
    if (!ideia) {
      throw new BadRequestException(
        'A etapa 1 não tem um título ou ideia. Volte lá e preencha o campo "Título ou ideia (opcional)".',
      );
    }
    await this.prisma.title.updateMany({ where: { projectId }, data: { escolhido: false } });
    await this.projects.update(projectId, { tituloEscolhido: ideia });
    return this.list(projectId);
  }
}
