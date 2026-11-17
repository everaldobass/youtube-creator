import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MAX_CARACTERES_TAGS,
  TagsResponse,
  tagsGenSchema,
  totalCaracteresTags,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptTags } from '../ai/prompts';
import { textoDoRoteiro } from '../media/contexto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async list(projectId: string): Promise<TagsResponse> {
    await this.projects.get(projectId);
    const rows = await this.prisma.tag.findMany({ where: { projectId }, orderBy: { ordem: 'asc' } });
    const tags = rows.map((t) => t.texto);
    return { tags, totalCaracteres: totalCaracteresTags(tags) };
  }

  private async gravar(projectId: string, tags: string[]): Promise<TagsResponse> {
    await this.prisma.$transaction([
      this.prisma.tag.deleteMany({ where: { projectId } }),
      this.prisma.tag.createMany({ data: tags.map((texto, ordem) => ({ projectId, texto, ordem })) }),
    ]);
    return this.list(projectId);
  }

  async generate(projectId: string): Promise<TagsResponse> {
    const project = await this.projects.get(projectId);
    if (!project.tituloEscolhido.trim()) {
      throw new BadRequestException('Escolha um título na etapa 2 antes de gerar as tags.');
    }
    const roteiro = await textoDoRoteiro(this.prisma, projectId);
    if (!roteiro) throw new BadRequestException('Gere o roteiro antes das tags.');

    const bruto = await this.ai.generateJson(
      promptTags({ titulo: project.tituloEscolhido, roteiro, idioma: project.idioma }),
      tagsGenSchema,
    );

    // Limpa, tira repetidas e respeita o limite de 500 caracteres, mantendo a ordem (da mais ampla à mais específica).
    const vistos = new Set<string>();
    const tags: string[] = [];
    for (const t of bruto) {
      const limpa = t.replace(/^#/, '').replace(/,/g, ' ').trim().slice(0, 100);
      const chave = limpa.toLowerCase();
      if (!limpa || vistos.has(chave)) continue;
      if (totalCaracteresTags([...tags, limpa]) > MAX_CARACTERES_TAGS) break;
      vistos.add(chave);
      tags.push(limpa);
    }
    if (tags.length === 0) throw new BadRequestException('O modelo não devolveu tags utilizáveis. Tente de novo.');
    return this.gravar(projectId, tags);
  }

  async save(projectId: string, entrada: string[]): Promise<TagsResponse> {
    await this.projects.get(projectId);
    const tags = entrada.map((t) => t.replace(/,/g, ' ').trim()).filter(Boolean);
    if (totalCaracteresTags(tags) > MAX_CARACTERES_TAGS) {
      throw new BadRequestException(`As tags passam de ${MAX_CARACTERES_TAGS} caracteres. Remova algumas.`);
    }
    return this.gravar(projectId, tags);
  }
}
