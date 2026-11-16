import { BadRequestException, Injectable } from '@nestjs/common';
import { CapituloDto, DescriptionResponse, descGenSchema, formatarTempo } from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptDescricao } from '../ai/prompts';
import { linhaDoTempo, textoDoRoteiro } from '../media/contexto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const emSegundos = (tempo: string) =>
  tempo
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);

@Injectable()
export class DescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async response(projectId: string): Promise<DescriptionResponse> {
    const project = await this.projects.get(projectId);
    const capitulos = await this.prisma.chapter.findMany({ where: { projectId } });
    const total = await this.prisma.scene.count({ where: { projectId } });
    return {
      descricao: project.descricao,
      capitulos: capitulos
        .map((c): CapituloDto => ({ tempo: c.tempo, titulo: c.titulo }))
        .sort((a, b) => emSegundos(a.tempo) - emSegundos(b.tempo)),
      temRoteiro: total > 0,
    };
  }

  async generate(projectId: string): Promise<DescriptionResponse> {
    const project = await this.projects.get(projectId);
    if (!project.tituloEscolhido.trim()) {
      throw new BadRequestException('Escolha um título na etapa 2 antes de gerar a descrição.');
    }
    const cenas = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    if (cenas.length === 0) throw new BadRequestException('Gere o roteiro antes da descrição.');

    // Tempos reais de início de cada cena (usa a duração do áudio quando já existe).
    const linha = linhaDoTempo(cenas);
    const inicios = linha.map((c) => ({
      tempo: formatarTempo(c.inicioMs / 1000),
      segundos: Math.round(c.inicioMs / 1000),
      resumo: c.texto.trim().slice(0, 90),
    }));
    const temposValidos = new Set(inicios.map((i) => i.tempo));

    const roteiro = await textoDoRoteiro(this.prisma, projectId, 3000);
    const ingles = project.idioma === 'en';
    const ia = await this.ai.generateJson(
      promptDescricao({
        titulo: project.tituloEscolhido,
        roteiro,
        idioma: project.idioma,
        cenas: inicios.map((i) => ({ tempo: i.tempo, resumo: i.resumo })),
      }),
      descGenSchema,
    );

    // Só aceita capítulos em tempos reais de cena, em ordem e com pelo menos 10 s entre eles.
    const candidatos = ia.capitulos
      .map((c) => ({ tempo: c.tempo.trim(), titulo: c.titulo.trim() }))
      .filter((c) => temposValidos.has(c.tempo))
      .sort((a, b) => emSegundos(a.tempo) - emSegundos(b.tempo));
    const capitulos: CapituloDto[] = [];
    if (candidatos[0]?.tempo !== '00:00') capitulos.push({ tempo: '00:00', titulo: ingles ? 'Introduction' : 'Introdução' });
    for (const c of candidatos) {
      const ultimo = capitulos[capitulos.length - 1];
      if (!ultimo || emSegundos(c.tempo) - emSegundos(ultimo.tempo) >= 10) capitulos.push(c);
    }
    // O YouTube só mostra capítulos com no mínimo 3 itens: se faltar, distribui pelas cenas.
    if (capitulos.length < 3 && inicios.length >= 3) {
      capitulos.length = 0;
      const passos = Math.min(6, inicios.length);
      for (let k = 0; k < passos; k++) {
        const i = inicios[Math.floor((k * inicios.length) / passos)];
        if (!capitulos.some((c) => c.tempo === i.tempo)) {
          capitulos.push({ tempo: i.tempo, titulo: k === 0 ? (ingles ? 'Introduction' : 'Introdução') : ingles ? `Part ${k + 1}` : `Parte ${k + 1}` });
        }
      }
    }

    const hashtags = ia.hashtags
      .map((h) => '#' + h.replace(/^#+/, '').replace(/\s+/g, ''))
      .filter((h) => h.length > 1)
      .slice(0, 5);

    const descricao = [
      ia.gancho.trim(),
      ia.resumo.trim(),
      'Capítulos:\n' + capitulos.map((c) => `${c.tempo} ${c.titulo}`).join('\n'),
      ia.chamadaInscricao.trim(),
      hashtags.join(' '),
    ]
      .filter(Boolean)
      .join('\n\n');

    await this.prisma.$transaction([
      this.prisma.chapter.deleteMany({ where: { projectId } }),
      this.prisma.chapter.createMany({ data: capitulos.map((c) => ({ projectId, ...c })) }),
    ]);
    await this.projects.update(projectId, { descricao });
    return this.response(projectId);
  }

  async save(projectId: string, descricao: string): Promise<DescriptionResponse> {
    await this.projects.update(projectId, { descricao });
    return this.response(projectId);
  }
}
