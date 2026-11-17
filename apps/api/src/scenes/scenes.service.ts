import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Scene } from '@prisma/client';
import {
  FonteRoteiro,
  IDIOMA_INFO,
  LIMITES_FORMATO,
  ProjectDto,
  ROTULO_CLASSIFICACAO,
  RoteiroResumo,
  SceneDto,
  ScenesResponse,
  StatusItem,
  UpdateSceneInput,
  calcularResumoRoteiro,
  formatarTempo,
  roteiroGenSchema,
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
  sugestaoCamera: s.sugestaoCamera,
  alertaImagem: s.alertaImagem,
});

/** Movimentos aceitos como sugestão por cena (o resto vira string vazia). */
const CAMERAS = new Set([
  'zoom-in',
  'zoom-out',
  'panoramica-esquerda',
  'panoramica-direita',
  'panoramica-cima',
  'panoramica-baixo',
  'nenhum',
]);

const cameraValida = (valor: string | undefined) => {
  const v = (valor ?? '').trim();
  return CAMERAS.has(v) ? v : '';
};

/** Rótulo curto do status de um item do roteiro, para leitura fora do app. */
function rotuloStatus(status: StatusItem): string {
  switch (status) {
    case 'aprovado':
      return 'aprovada';
    case 'gerado':
      return 'gerada, aguardando aprovação';
    case 'desatualizado':
      return 'desatualizada';
    default:
      return 'pendente';
  }
}

/** Nome de arquivo sem acentos, espaços ou caracteres reservados. */
function arquivoSeguro(texto: string): string {
  const limpo = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return limpo || 'roteiro';
}

/** Fontes do roteiro ficam em JSON no projeto; leitura tolerante a dados antigos. */
export function fontesDoProjeto(project: ProjectDto): FonteRoteiro[] {
  if (!project.fontesRoteiro.trim()) return [];
  try {
    const dados = JSON.parse(project.fontesRoteiro);
    if (!Array.isArray(dados)) return [];
    return dados
      .filter((f) => f && typeof f.titulo === 'string' && f.titulo.trim())
      .map((f) => ({
        titulo: String(f.titulo),
        autor: String(f.autor ?? ''),
        ano: String(f.ano ?? ''),
        url: String(f.url ?? ''),
      }));
  } catch {
    return [];
  }
}

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
    const [review, pendentes] = await Promise.all([
      this.prisma.editorialReview.findFirst({
        where: { projectId: project.id },
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.editorialIssue.count({ where: { projectId: project.id, status: 'pendente' } }),
    ]);
    return {
      scenes,
      resumo: this.resumo(project, scenes),
      fontes: fontesDoProjeto(project),
      editorial: {
        classificacao: (review?.classificacao as ScenesResponse['editorial']['classificacao']) ?? null,
        pendentes,
        revisadoEm: review?.criadoEm.toISOString() ?? null,
      },
    };
  }

  async list(projectId: string): Promise<ScenesResponse> {
    return this.resposta(await this.projects.get(projectId));
  }

  /**
   * Roteiro em Markdown para revisar fora do app (ou colar num editor).
   * Usa exatamente o texto salvo, sem reescrever nada.
   */
  async roteiroMarkdown(projectId: string): Promise<{ nome: string; markdown: string }> {
    const project = await this.projects.get(projectId);
    const { scenes, resumo, fontes, editorial } = await this.resposta(project);
    const titulo = project.tituloEscolhido || project.tema || project.ideia || 'Roteiro sem título';
    const formato = `${project.formato === 'shorts' ? 'Shorts' : 'Vídeo longo'} (${LIMITES_FORMATO[project.formato].proporcao})`;
    const narracao = scenes.length
      ? `${formatarTempo(resumo.totalSegundos)} em ${scenes.length} cena${scenes.length === 1 ? '' : 's'}`
      : 'sem cenas';
    const revisao = editorial.classificacao
      ? `${ROTULO_CLASSIFICACAO[editorial.classificacao]}${editorial.pendentes ? `, com ${editorial.pendentes} apontamento${editorial.pendentes === 1 ? '' : 's'} pendente${editorial.pendentes === 1 ? '' : 's'}` : ''}`
      : 'não revisado';

    const linhas: string[] = [
      `# ${titulo}`,
      '',
      '| | |',
      '| --- | --- |',
      `| Formato | ${formato} |`,
      `| Idioma | ${IDIOMA_INFO[project.idioma].rotulo} |`,
      `| Narração | ${narracao} |`,
      `| Duração alvo | ${formatarTempo(resumo.alvoSegundos)} |`,
      `| Revisão editorial | ${revisao} |`,
      '',
    ];

    if (!scenes.length) {
      linhas.push('_Nenhuma cena no roteiro. Gere o roteiro na etapa 3 do YouStudio._', '');
    }

    scenes.forEach((s, i) => {
      const destaque = i === 0 ? ' (gancho)' : i === scenes.length - 1 && scenes.length > 1 ? ' (chamada para ação)' : '';
      linhas.push(
        `## Cena ${s.numero}${destaque}`,
        '',
        `- Duração: ${s.duracaoSegundos} s${s.audioDuracaoMs ? ` (áudio de ${(s.audioDuracaoMs / 1000).toFixed(1).replace('.', ',')} s)` : ''}`,
        `- Narração: ${rotuloStatus(s.statusNarracao)}`,
        `- Imagem: ${rotuloStatus(s.statusImagem)}`,
        '',
        '**Texto narrado**',
        '',
        ...s.textoNarrado
          .trim()
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .flatMap((p) => [p, '']),
        '**Descrição visual**',
        '',
        ...s.descricaoVisual
          .trim()
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .flatMap((p) => [p, '']),
        '---',
        '',
      );
    });

    linhas.push('## Referências', '');
    if (fontes.length) {
      fontes.forEach((f, i) => {
        const autor = f.autor ? ` — ${f.autor}` : '';
        const ano = f.ano ? ` (${f.ano})` : '';
        const url = f.url ? ` — <${f.url}>` : '';
        linhas.push(`${i + 1}. **${f.titulo}**${autor}${ano}${url}`, '');
      });
      linhas.push(
        '> Referências informadas pelo modelo de linguagem. Confirme cada uma antes de publicar; o YouStudio não acessa o conteúdo delas.',
        '',
      );
    } else if (scenes.length) {
      linhas.push('_Nenhuma referência registrada com este roteiro._', '');
    }

    linhas.push(`_Exportado do YouStudio em ${new Date().toLocaleDateString('pt-BR')}._`, '');

    return { nome: `${arquivoSeguro(titulo)}.md`, markdown: linhas.join('\n') };
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
      roteiroGenSchema,
    );

    const antigas = await this.prisma.scene.findMany({
      where: { projectId },
      select: { id: true, audioPath: true, imagemPath: true },
    });
    await this.limparArquivos(antigas);
    const idsAntigos = antigas.map((s) => s.id);
    const fontes = (gerado.fontes ?? []).filter((f) => f.titulo.trim()).slice(0, 12);
    await this.prisma.$transaction([
      // Jobs presos às cenas antigas deixariam erros órfãos na tela.
      this.prisma.job.deleteMany({
        where: { projectId, tipo: { in: ['narracao', 'imagem'] }, alvoId: { in: idsAntigos } },
      }),
      this.prisma.scene.deleteMany({ where: { projectId } }),
      this.prisma.scene.createMany({
        data: gerado.cenas.map((c, i) => ({
          projectId,
          numero: i + 1,
          textoNarrado: c.textoNarrado.trim(),
          duracaoSegundos: limitarDuracao(c.duracaoSegundos),
          descricaoVisual: c.descricaoVisual.trim(),
          sugestaoCamera: cameraValida(c.movimentoCamera),
        })),
      }),
      // Um roteiro novo invalida a revisão editorial anterior.
      this.prisma.editorialIssue.deleteMany({ where: { projectId } }),
      this.prisma.editorialReview.deleteMany({ where: { projectId } }),
      this.prisma.visualAsset.updateMany({ where: { projectId }, data: { sceneNumero: null } }),
      this.prisma.project.update({
        where: { id: projectId },
        data: { fontesRoteiro: JSON.stringify(fontes), editorialStatus: 'nao_revisado' },
      }),
    ]);
    return this.resposta(await this.projects.get(projectId));
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
    }    if (input.descricaoVisual !== undefined && input.descricaoVisual !== scene.descricaoVisual) {
      data.descricaoVisual = input.descricaoVisual;
      data.statusImagem = desatualizar(scene.statusImagem);
    }
    if (input.sugestaoCamera !== undefined && input.sugestaoCamera !== scene.sugestaoCamera) {
      data.sugestaoCamera = cameraValida(input.sugestaoCamera);
    }
    if (input.alertaImagem !== undefined && input.alertaImagem !== scene.alertaImagem) {
      data.alertaImagem = input.alertaImagem;
    }
    if (input.duracaoSegundos !== undefined && input.duracaoSegundos !== scene.duracaoSegundos) {
      data.duracaoSegundos = input.duracaoSegundos;
    }

    const atualizada = Object.keys(data).length
      ? await this.prisma.scene.update({ where: { id: sceneId }, data })
      : scene;
    if (input.textoNarrado !== undefined && input.textoNarrado !== scene.textoNarrado) {
      // Texto novo: a revisão editorial e o alerta de imagem se referem ao texto antigo.
      await this.prisma.$transaction([
        this.prisma.project.update({
          where: { id: project.id },
          data: { editorialStatus: 'nao_revisado' },
        }),
        this.prisma.scene.update({ where: { id: sceneId }, data: { alertaImagem: '' } }),
      ]);
    }
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
        sugestaoCamera: cameraValida(nova.movimentoCamera) || scene.sugestaoCamera,
        statusNarracao: desatualizar(scene.statusNarracao),
        statusImagem: desatualizar(scene.statusImagem),
      },
    });
    return this.resposta(project);
  }
}
