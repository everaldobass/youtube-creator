import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Scene } from '@prisma/client';
import {
  FonteRoteiro,
  IDIOMA_INFO,
  ImportRoteiroResponse,
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
import {
  promptContinuarRoteiro,
  promptFechamentoRoteiro,
  promptRefazerCena,
  promptRoteiro,
  promptRoteiroExterno,
} from '../ai/prompts';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';
import { lerRoteiroMarkdown } from './roteiro-import';

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

/** Duração planejada da cena, respeitando o mínimo do formato (18 s nos vídeos longos). */
const limitarDuracao = (n: number, formato: ProjectDto['formato']) => {
  const minimo = LIMITES_FORMATO[formato].cena[0];
  return Math.min(120, Math.max(minimo, Math.round(n)));
};

/** Fonte como vem da IA; os campos opcionais são normalizados ao exportar. */
interface FonteGerada {
  titulo: string;
  autor?: string;
  ano?: string | number;
  url?: string;
}

interface CenaNormalizada {
  textoNarrado: string;
  duracaoSegundos: number;
  descricaoVisual: string;
  sugestaoCamera: string;
}

/** Normaliza uma cena vinda da IA para o formato salvo no banco. */
const normalizarCena = (
  c: {
    textoNarrado: string;
    duracaoSegundos: number;
    descricaoVisual: string;
    movimentoCamera?: string;
  },
  formato: ProjectDto['formato'],
): CenaNormalizada => ({
  textoNarrado: c.textoNarrado.trim(),
  duracaoSegundos: limitarDuracao(c.duracaoSegundos, formato),
  descricaoVisual: c.descricaoVisual.trim(),
  sugestaoCamera: cameraValida(c.movimentoCamera),
});

/**
 * Despedida ou chamada para inscrição. O modelo às vezes encerra um bloco
 * intermediário com esse tipo de cena, mesmo quando ainda falta roteiro.
 * Como o fechamento oficial é gerado numa chamada separada, essas cenas são
 * descartadas dos blocos de desenvolvimento para não aparecerem no meio do vídeo.
 */
const FECHAMENTO_PRECOCE =
  /\b(inscreva(?:-se)?|se inscrev\w*|inscri[cç][aã]o no canal|deixe (?:o )?seu like|deixa (?:o )?seu like|ativ\w* o sininho|compartilhe (?:este|esse) v[ií]deo|obrigad[oa] por (?:nos )?acompanhar|at[ée] (?:o )?(?:nosso )?pr[oó]ximo v[ií]deo|subscribe|hit the bell|like this video|thanks? for watching|see you (?:in the )?next video)\b/i;

const semFechamentoPrecoce = (c: CenaNormalizada): boolean =>
  !FECHAMENTO_PRECOCE.test(c.textoNarrado);

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

  private async resposta(project: ProjectDto, avisos: string[] = []): Promise<ScenesResponse> {
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
      roteiroManual: project.roteiroManual,
      avisos,
      editorial: {
        classificacao:
          (review?.classificacao as ScenesResponse['editorial']['classificacao']) ?? null,
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
      const destaque =
        i === 0
          ? ' (gancho)'
          : i === scenes.length - 1 && scenes.length > 1
            ? ' (chamada para ação)'
            : '';
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

    linhas.push(
      '> Para editar fora do app: altere os blocos "Texto narrado" e "Descrição visual" e importe o arquivo de volta em **Roteiro e retenção → Importar .md**.',
      '',
    );
    linhas.push(`_Exportado do YouStudio em ${new Date().toLocaleDateString('pt-BR')}._`, '');

    return { nome: `${arquivoSeguro(titulo)}.md`, markdown: linhas.join('\n') };
  }

  /**
   * Prompt em Markdown para o usuário gerar o roteiro numa IA externa e
   * importar de volta. Usa as definições do projeto (título, tema, público,
   * formato, duração, idioma) e já traz o esqueleto das cenas no padrão
   * aceito pela importação.
   */
  async promptExterno(projectId: string): Promise<{ nome: string; markdown: string }> {
    const project = await this.projects.get(projectId);
    const titulo = project.tituloEscolhido || project.ideia || project.tema || 'Roteiro sem título';
    const markdown = promptRoteiroExterno({
      titulo,
      tema: project.tema,
      publico: project.publico,
      formato: project.formato,
      duracaoMinutos: project.duracaoMinutos,
      idioma: project.idioma,
    });
    return { nome: `${arquivoSeguro(titulo)}-prompt-roteiro.md`, markdown };
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

    const alvoSegundos = project.duracaoMinutos * 60;
    // Mínimo aceito: 90% do tempo pedido (15 min → pelo menos 12 min).
    const minimoSegundos = Math.ceil(alvoSegundos * 0.9);
    const blocoSegundos = project.formato === 'shorts' ? 60 : 360;
    // A conclusão + chamada para inscrição é escrita só no fim e ocupa esta
    // reserva; o desenvolvimento para antes dela para não estourar a duração.
    const reservaFechamento = project.formato === 'shorts' ? 8 : 30;
    const alvoDesenvolvimento = Math.max(1, alvoSegundos - reservaFechamento);
    const minimoDesenvolvimento = Math.max(1, minimoSegundos - reservaFechamento);
    // Folga para o modelo entregar menos que o bloco pedido sem parar cedo demais.
    const maxChamadas = Math.min(20, Math.max(6, Math.ceil(alvoSegundos / 120) + 3));
    const avisos: string[] = [];

    // O primeiro pedido já é um bloco, não o roteiro inteiro: assim o modelo
    // não tenta "fechar" o documentário antes de chegar à duração pedida.
    const primeira = await this.ai.generateJson(
      promptRoteiro({
        titulo: project.tituloEscolhido,
        duracaoMinutos: project.duracaoMinutos,
        formato: project.formato,
        tema: project.tema,
        publico: project.publico,
        idioma: project.idioma,
        blocoSegundos: Math.min(blocoSegundos, minimoDesenvolvimento),
      }),
      roteiroGenSchema,
    );

    const cenas: CenaNormalizada[] = primeira.cenas
      .map((c) => normalizarCena(c, project.formato))
      .filter(semFechamentoPrecoce);
    const fontes: FonteGerada[] = [...(primeira.fontes ?? [])];
    const totalSegundos = () => cenas.reduce((n, c) => n + c.duracaoSegundos, 0);

    // Modelos costumam entregar menos que o pedido em vídeos longos. Continua
    // a partir da última cena, em blocos, até chegar ao desenvolvimento mínimo.
    let chamadas = 0;
    let semProgresso = 0;
    let interrompido = false;
    while (totalSegundos() < minimoDesenvolvimento && chamadas < maxChamadas) {
      const total = totalSegundos();
      const faltam = Math.max(1, alvoDesenvolvimento - total);
      const bloco = Math.min(blocoSegundos, faltam);

      let continuacao;
      try {
        continuacao = await this.ai.generateJson(
          promptContinuarRoteiro({
            titulo: project.tituloEscolhido,
            duracaoMinutos: project.duracaoMinutos,
            formato: project.formato,
            tema: project.tema,
            publico: project.publico,
            idioma: project.idioma,
            totalSegundos: total,
            alvoSegundos,
            blocoSegundos: bloco,
            cenas: cenas.map((c, i) => ({ numero: i + 1, ...c })),
          }),
          roteiroGenSchema,
        );
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'erro inesperado';
        avisos.push(
          `A geração foi interrompida: ${motivo} O roteiro salvo tem ${formatarTempo(totalSegundos())} de ${formatarTempo(alvoSegundos)}.`,
        );
        interrompido = true;
        break;
      }

      chamadas += 1;
      const antes = totalSegundos();
      cenas.push(
        ...continuacao.cenas
          .map((c) => normalizarCena(c, project.formato))
          .filter(semFechamentoPrecoce),
      );
      fontes.push(...(continuacao.fontes ?? []));
      if (totalSegundos() <= antes) semProgresso += 1;
      else semProgresso = 0;
      if (semProgresso >= 2) break;
    }

    // Fechamento: a única chamada autorizada a escrever conclusão e chamada
    // para inscrição. Fica sempre nas últimas cenas do roteiro.
    if (!interrompido) {
      try {
        const fechamento = await this.ai.generateJson(
          promptFechamentoRoteiro({
            titulo: project.tituloEscolhido,
            formato: project.formato,
            tema: project.tema,
            publico: project.publico,
            idioma: project.idioma,
            totalSegundos: totalSegundos(),
            alvoSegundos,
            blocoSegundos: reservaFechamento,
            cenas: cenas.map((c, i) => ({ numero: i + 1, ...c })),
          }),
          roteiroGenSchema,
        );
        const limiteCenas = project.formato === 'shorts' ? 1 : 2;
        cenas.push(
          ...fechamento.cenas.map((c) => normalizarCena(c, project.formato)).slice(0, limiteCenas),
        );
        fontes.push(...(fechamento.fontes ?? []));
      } catch (e) {
        const motivo = e instanceof Error ? e.message : 'erro inesperado';
        avisos.push(`Não foi possível gerar o encerramento do roteiro: ${motivo}`);
      }
    }

    if (totalSegundos() < minimoSegundos) {
      avisos.push(
        `A IA gerou ${formatarTempo(totalSegundos())} de ${formatarTempo(alvoSegundos)} — abaixo do mínimo de 90%. Gere novamente ou complete as cenas manualmente.`,
      );
    }

    const antigas = await this.prisma.scene.findMany({
      where: { projectId },
      select: { id: true, audioPath: true, imagemPath: true },
    });
    await this.limparArquivos(antigas);
    const idsAntigos = antigas.map((s) => s.id);
    const fontesUnicas = (() => {
      const porTitulo = new Map<string, FonteGerada>();
      for (const f of fontes) {
        const titulo = f.titulo.trim();
        if (!titulo) continue;
        const chave = titulo.toLowerCase();
        if (!porTitulo.has(chave)) porTitulo.set(chave, { ...f, titulo });
      }
      return [...porTitulo.values()].slice(0, 12);
    })();
    await this.prisma.$transaction([
      // Jobs presos às cenas antigas deixariam erros órfãos na tela.
      this.prisma.job.deleteMany({
        where: { projectId, tipo: { in: ['narracao', 'imagem'] }, alvoId: { in: idsAntigos } },
      }),
      this.prisma.scene.deleteMany({ where: { projectId } }),
      this.prisma.scene.createMany({
        data: cenas.map((c, i) => ({
          projectId,
          numero: i + 1,
          textoNarrado: c.textoNarrado,
          duracaoSegundos: c.duracaoSegundos,
          descricaoVisual: c.descricaoVisual,
          sugestaoCamera: c.sugestaoCamera,
        })),
      }),
      // Um roteiro novo invalida a revisão editorial anterior.
      this.prisma.editorialIssue.deleteMany({ where: { projectId } }),
      this.prisma.editorialReview.deleteMany({ where: { projectId } }),
      // Os capítulos da descrição usam os tempos das cenas antigas.
      this.prisma.chapter.deleteMany({ where: { projectId } }),
      this.prisma.visualAsset.updateMany({ where: { projectId }, data: { sceneNumero: null } }),
      this.prisma.project.update({
        where: { id: projectId },
        data: {
          fontesRoteiro: JSON.stringify(fontesUnicas),
          editorialStatus: 'nao_revisado',
          roteiroManual: false,
          descricao: '',
        },
      }),
    ]);
    return this.resposta(await this.projects.get(projectId), avisos);
  }

  /**
   * Importa um roteiro escrito à mão (.md no mesmo padrão do exportado).
   * Substitui as cenas atuais, apaga mídias/jobs antigos e marca o roteiro
   * como manual — a revisão editorial por IA passa a ser opcional.
   */
  async importar(projectId: string, markdown: string): Promise<ImportRoteiroResponse> {
    const project = await this.projects.get(projectId); // valida o dono
    const { cenas, fontes, avisos } = lerRoteiroMarkdown(markdown);

    if (cenas.length === 0) {
      throw new BadRequestException(
        'Nenhuma cena encontrada no arquivo. Use o mesmo padrão do roteiro exportado: uma seção "## Cena 1" para cada cena, com "**Texto narrado**" e, se quiser, "**Descrição visual**".',
      );
    }

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
        data: cenas.map((c, i) => ({
          projectId,
          numero: i + 1,
          textoNarrado: c.textoNarrado,
          duracaoSegundos: limitarDuracao(c.duracaoSegundos, project.formato),
          descricaoVisual: c.descricaoVisual,
        })),
      }),
      // Um roteiro novo invalida a revisão editorial anterior.
      this.prisma.editorialIssue.deleteMany({ where: { projectId } }),
      this.prisma.editorialReview.deleteMany({ where: { projectId } }),
      // Os capítulos da descrição usam os tempos das cenas antigas.
      this.prisma.chapter.deleteMany({ where: { projectId } }),
      this.prisma.visualAsset.updateMany({ where: { projectId }, data: { sceneNumero: null } }),
      this.prisma.project.update({
        where: { id: projectId },
        data: {
          fontesRoteiro: JSON.stringify(fontes),
          editorialStatus: 'nao_revisado',
          roteiroManual: true,
          descricao: '',
        },
      }),
    ]);

    const resposta = await this.resposta(await this.projects.get(projectId));
    return { ...resposta, importado: { cenas: cenas.length, fontes: fontes.length, avisos } };
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
        duracaoSegundos: project.formato === 'shorts' ? 5 : LIMITES_FORMATO.longo.cena[0],
      },
    });
    const ids = existentes.map((s) => s.id);
    ids.splice(posicao, 0, nova.id);
    await this.renumerar(projectId, ids);
    return this.resposta(project);
  }

  async reorder(projectId: string, ids: string[]): Promise<ScenesResponse> {
    const project = await this.projects.get(projectId);
    const existentes = await this.prisma.scene.findMany({
      where: { projectId },
      select: { id: true },
    });
    const mesmos =
      ids.length === existentes.length &&
      new Set(ids).size === ids.length &&
      existentes.every((s) => ids.includes(s.id));
    if (!mesmos)
      throw new BadRequestException('A lista de cenas não corresponde ao roteiro atual.');
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
    if (input.sugestaoCamera !== undefined && input.sugestaoCamera !== scene.sugestaoCamera) {
      data.sugestaoCamera = cameraValida(input.sugestaoCamera);
    }
    if (input.alertaImagem !== undefined && input.alertaImagem !== scene.alertaImagem) {
      data.alertaImagem = input.alertaImagem;
    }
    if (input.duracaoSegundos !== undefined && input.duracaoSegundos !== scene.duracaoSegundos) {
      data.duracaoSegundos = limitarDuracao(input.duracaoSegundos, project.formato);
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
        duracaoSegundos: limitarDuracao(nova.duracaoSegundos, project.formato),
        descricaoVisual: nova.descricaoVisual.trim(),
        sugestaoCamera: cameraValida(nova.movimentoCamera) || scene.sugestaoCamera,
        statusNarracao: desatualizar(scene.statusNarracao),
        statusImagem: desatualizar(scene.statusImagem),
      },
    });
    return this.resposta(project);
  }
}
