import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CapituloDto,
  DescriptionResponse,
  INTERVALO_CAPITULO_SEGUNDOS,
  MAX_CAPITULOS,
  MIN_CAPITULOS,
  descGenSchema,
  formatarTempo,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptDescricao } from '../ai/prompts';
import { CenaNaLinha, linhaDoTempo, textoDoRoteiro } from '../media/contexto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const emSegundos = (tempo: string) =>
  tempo
    .split(':')
    .map(Number)
    .reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);

interface AncoraCapitulo {
  tempo: string;
  segundos: number;
  cena: CenaNaLinha;
}

/** Cena que está no ar no instante informado; o capítulo começa no início dela. */
function cenaNoInstante(linha: CenaNaLinha[], ms: number): CenaNaLinha {
  let atual = linha[0];
  for (const cena of linha) {
    if (cena.inicioMs > ms) break;
    atual = cena;
  }
  return atual;
}

/** Título de reserva a partir da própria narração, sem cortar palavra no meio. */
function tituloDaCena(texto: string, indice: number, ingles: boolean): string {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (!limpo) return ingles ? `Part ${indice}` : `Parte ${indice}`;
  const corte = limpo.slice(0, 60);
  const ultimoEspaco = corte.lastIndexOf(' ');
  const frase = (ultimoEspaco > 25 ? corte.slice(0, ultimoEspaco) : corte).replace(
    /[.,;:!?…]+$/,
    '',
  );
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/**
 * Distribui os capítulos a cada ~3 minutos, do início ao fim do vídeo, sempre
 * no começo de uma cena real (o YouTube só aceita tempos que existem no vídeo).
 */
function ancorasCapitulos(linha: CenaNaLinha[]): AncoraCapitulo[] {
  if (linha.length === 0) return [];
  const ultima = linha[linha.length - 1];
  const totalSegundos = Math.max(0, (ultima.inicioMs + ultima.duracaoMs) / 1000);
  if (totalSegundos < 1) return [];

  // Teto: nenhum trecho fica com mais de ~3 minutos sem um capítulo novo.
  const quantidade = Math.min(
    MAX_CAPITULOS,
    Math.max(MIN_CAPITULOS, Math.ceil(totalSegundos / INTERVALO_CAPITULO_SEGUNDOS)),
  );

  const ancoras: AncoraCapitulo[] = [];
  for (let i = 0; i < quantidade; i++) {
    const alvoMs = (i * totalSegundos * 1000) / quantidade;
    const cena = cenaNoInstante(linha, alvoMs);
    const segundos = Math.round(cena.inicioMs / 1000);
    const tempo = formatarTempo(segundos);
    if (!ancoras.some((a) => a.tempo === tempo)) {
      ancoras.push({ tempo, segundos, cena });
    }
  }

  if (ancoras[0] && ancoras[0].tempo !== '00:00') {
    ancoras.unshift({ tempo: '00:00', segundos: 0, cena: linha[0] });
  }
  return ancoras;
}

@Injectable()
export class DescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
  ) {}

  async response(projectId: string): Promise<DescriptionResponse> {
    const project = await this.projects.get(projectId);
    const [capitulos, cenas] = await Promise.all([
      this.prisma.chapter.findMany({ where: { projectId } }),
      this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } }),
    ]);
    const linha = linhaDoTempo(cenas);
    const ultima = linha[linha.length - 1];
    return {
      descricao: project.descricao,
      capitulos: capitulos
        .map((c): CapituloDto => ({ tempo: c.tempo, titulo: c.titulo }))
        .sort((a, b) => emSegundos(a.tempo) - emSegundos(b.tempo)),
      temRoteiro: cenas.length > 0,
      duracaoSegundos: ultima ? Math.round((ultima.inicioMs + ultima.duracaoMs) / 1000) : 0,
      duracaoAlvoSegundos: project.duracaoMinutos * 60,
    };
  }

  async generate(projectId: string): Promise<DescriptionResponse> {
    const project = await this.projects.get(projectId);
    if (!project.tituloEscolhido.trim()) {
      throw new BadRequestException('Escolha um título na etapa 2 antes de gerar a descrição.');
    }
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    if (cenas.length === 0) throw new BadRequestException('Gere o roteiro antes da descrição.');

    // Tempos reais de início de cada cena (usa a duração do áudio quando já existe).
    const linha = linhaDoTempo(cenas);
    const ancoras = ancorasCapitulos(linha);
    const inicios = linha.map((c) => ({
      tempo: formatarTempo(c.inicioMs / 1000),
      segundos: Math.round(c.inicioMs / 1000),
      resumo: c.texto.trim().slice(0, 90),
    }));

    const roteiro = await textoDoRoteiro(this.prisma, projectId, 3000);
    const ingles = project.idioma === 'en';
    const ia = await this.ai.generateJson(
      promptDescricao({
        titulo: project.tituloEscolhido,
        roteiro,
        idioma: project.idioma,
        cenas: inicios.map((i) => ({ tempo: i.tempo, resumo: i.resumo })),
        ancoras: ancoras.map((a) => a.tempo),
      }),
      descGenSchema,
    );

    // Os tempos são sempre os das âncoras calculadas: o vídeo inteiro fica
    // coberto, mesmo que o modelo escolha outra lista. Dele aproveitamos apenas
    // o título de cada âncora; quando falta, usamos o início da narração da cena.
    const titulosPorSegundo = new Map<number, string>();
    for (const c of ia.capitulos) {
      const segundos = Math.round(emSegundos(c.tempo.trim()));
      const titulo = c.titulo.trim();
      if (Number.isFinite(segundos) && titulo) titulosPorSegundo.set(segundos, titulo);
    }
    const capitulos: CapituloDto[] = ancoras.map((a, i) => ({
      tempo: a.tempo,
      titulo: titulosPorSegundo.get(a.segundos) ?? tituloDaCena(a.cena.texto, i + 1, ingles),
    }));

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
