import { z } from 'zod';

/** As 9 etapas do fluxo, na ordem do design aprovado no Stitch. */
export const STEPS = [
  { slug: 'definicoes', label: 'Definições do projeto' },
  { slug: 'titulos', label: 'Títulos e otimização de CTR' },
  { slug: 'roteiro', label: 'Roteiro e retenção' },
  { slug: 'narracao', label: 'Narração e vozes neurais' },
  { slug: 'imagens', label: 'Imagens e storyboard' },
  { slug: 'tags', label: 'Tags e otimização de SEO' },
  { slug: 'thumbnails', label: 'Thumbnails e testes A/B de CTR' },
  { slug: 'descricao', label: 'Descrição, capítulos e SEO' },
  { slug: 'video', label: 'Vídeo final e publicação' },
] as const;

export type StepSlug = (typeof STEPS)[number]['slug'];
export const STEP_SLUGS = STEPS.map((s) => s.slug) as [StepSlug, ...StepSlug[]];

export const FORMATOS = ['longo', 'shorts'] as const;
export type Formato = (typeof FORMATOS)[number];

/** Idioma do conteúdo do vídeo (títulos, roteiro, narração, tags, thumbnails e descrição). */
export const IDIOMAS = ['pt-BR', 'en'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_INFO: Record<Idioma, { rotulo: string; curto: string; exemplo: string }> = {
  'pt-BR': {
    rotulo: 'Português (Brasil)',
    curto: 'PT',
    exemplo: 'Ex.: como funciona o sistema solar',
  },
  en: { rotulo: 'English', curto: 'EN', exemplo: 'Ex.: how the solar system works' },
};

/** Limites por formato (documento original, seção 1). */
export const LIMITES_FORMATO = {
  longo: { maxMinutos: 30, cena: [10, 25], resolucao: '1920x1080', proporcao: '16:9' },
  shorts: { maxMinutos: 3, cena: [3, 8], resolucao: '1080x1920', proporcao: '9:16' },
} as const;

/** Posição vertical da legenda queimada no vídeo. */
export const LEGENDA_POSICOES = ['baixo', 'meio', 'topo'] as const;
export type LegendaPosicao = (typeof LEGENDA_POSICOES)[number];

/** Estilo do texto da legenda queimada (o ASS aceita negrito e itálico separados). */
export const LEGENDA_ESTILOS = ['normal', 'negrito', 'italico'] as const;
export type LegendaEstilo = (typeof LEGENDA_ESTILOS)[number];

export const ROTULO_ESTILO: Record<LegendaEstilo, string> = {
  normal: 'Normal',
  negrito: 'Negrito',
  italico: 'Itálico',
};

/** Velocidade do TTS em % — referência de documentário, ágil o bastante sem atropelar. */
export const NARRACAO_VELOCIDADE_MIN = 85;
export const NARRACAO_VELOCIDADE_MAX = 110;

/**
 * Efeitos de câmera ("Ken Burns") aplicados às imagens na montagem do vídeo.
 * `alternado` varia o movimento de cena em cena.
 */
export const EFEITO_CAMERA_SLUGS = [
  'nenhum',
  'zoom-in',
  'zoom-out',
  'panoramica-esquerda',
  'panoramica-direita',
  'panoramica-cima',
  'panoramica-baixo',
  'rotacao',
  'tridimensional',
  'alternado',
] as const;
export type EfeitoCamera = (typeof EFEITO_CAMERA_SLUGS)[number];

export interface OpcaoEfeitoCamera {
  slug: EfeitoCamera;
  label: string;
  descricao: string;
}

export const EFEITOS_CAMERA: OpcaoEfeitoCamera[] = [
  { slug: 'nenhum', label: 'Imagem parada', descricao: 'Sem movimento, como é hoje.' },
  { slug: 'zoom-in', label: 'Zoom de aproximação', descricao: 'A câmera se aproxima devagar.' },
  { slug: 'zoom-out', label: 'Zoom de afastamento', descricao: 'Começa perto e recua devagar.' },
  {
    slug: 'panoramica-esquerda',
    label: 'Panorâmica à esquerda',
    descricao: 'A câmera desliza da direita para a esquerda.',
  },
  {
    slug: 'panoramica-direita',
    label: 'Panorâmica à direita',
    descricao: 'A câmera desliza da esquerda para a direita.',
  },
  {
    slug: 'panoramica-cima',
    label: 'Panorâmica para cima',
    descricao: 'A câmera sobe pela imagem.',
  },
  {
    slug: 'panoramica-baixo',
    label: 'Panorâmica para baixo',
    descricao: 'A câmera desce pela imagem.',
  },
  { slug: 'rotacao', label: 'Rotação suave', descricao: 'A imagem gira levemente para os lados.' },
  {
    slug: 'tridimensional',
    label: 'Deslocamento 3D',
    descricao: 'Zoom, deslocamento e rotação juntos, com sensação de profundidade.',
  },
  {
    slug: 'alternado',
    label: 'Alternado (recomendado)',
    descricao: 'Troca o movimento a cada cena para o vídeo não ficar repetitivo.',
  },
];

/** Sequência usada pelo modo "alternado", uma opção por cena. */
export const EFEITOS_ALTERNADOS: EfeitoCamera[] = [
  'zoom-in',
  'panoramica-direita',
  'zoom-out',
  'panoramica-esquerda',
  'tridimensional',
  'panoramica-cima',
];

/** Efeito efetivo de uma cena (resolve o modo alternado pela posição da cena). */
export function efeitoDaCena(efeito: EfeitoCamera, numero: number): EfeitoCamera {
  if (efeito !== 'alternado') return efeito;
  const i = Math.max(0, numero - 1) % EFEITOS_ALTERNADOS.length;
  return EFEITOS_ALTERNADOS[i];
}

export const createProjectSchema = z.object({
  ideia: z.string().max(200).default(''),
  tema: z.string().max(1000).default(''),
  publico: z.string().max(200).default(''),
  formato: z.enum(FORMATOS).default('longo'),
  duracaoMinutos: z.number().int().min(1).max(30).default(30),
  idioma: z.enum(IDIOMAS).default('pt-BR'),
  vozNome: z.string().max(60).default('voz-masculina-1'),
  narracaoNatural: z.boolean().default(true),
  narracaoVelocidade: z
    .number()
    .int()
    .min(NARRACAO_VELOCIDADE_MIN)
    .max(NARRACAO_VELOCIDADE_MAX)
    .default(97),
  pronuncia: z.string().max(2000).default(''),
  efeitoCamera: z.enum(EFEITO_CAMERA_SLUGS).default('alternado'),
  usarCameraSugerida: z.boolean().default(false),
  legendasAtivas: z.boolean().default(true),
  legendaTamanho: z.number().int().min(60).max(160).default(100),
  legendaPosicao: z.enum(LEGENDA_POSICOES).default('baixo'),
  legendaEstilo: z.enum(LEGENDA_ESTILOS).default('negrito'),
  legendaFonte: z.string().trim().max(60).default('Noto Sans'),
  legendaCor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal, como #C4B5FD')
    .default('#C4B5FD'),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .extend({
    tituloEscolhido: z.string().max(100),
    vozInstrucaoTom: z.string().max(300),
    estiloVisual: z.string().max(600),
    descricao: z.string().max(5000),
    fontesRoteiro: z.string().max(20000),
    editorialStatus: z.enum(['nao_revisado', 'aprovado', 'ressalvas', 'correcao']),
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface ProjectDto {
  id: string;
  ideia: string;
  tema: string;
  publico: string;
  formato: Formato;
  duracaoMinutos: number;
  idioma: Idioma;
  tituloEscolhido: string;
  vozNome: string;
  vozInstrucaoTom: string;
  narracaoNatural: boolean;
  narracaoVelocidade: number;
  pronuncia: string;
  estiloVisual: string;
  descricao: string;
  efeitoCamera: EfeitoCamera;
  usarCameraSugerida: boolean;
  legendasAtivas: boolean;
  legendaTamanho: number;
  legendaPosicao: LegendaPosicao;
  legendaEstilo: LegendaEstilo;
  legendaFonte: string;
  legendaCor: string;
  editorialStatus: 'nao_revisado' | 'aprovado' | 'ressalvas' | 'correcao';
  /** Roteiro escrito à mão e importado: a revisão editorial por IA é opcional. */
  roteiroManual: boolean;
  fontesRoteiro: string;
  revisaoFinalEm: string | null;
  etapaAtual: StepSlug;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Fase 1: títulos e roteiro
// ---------------------------------------------------------------------------

export const MAX_TITULO = 70;

/** Saída esperada do modelo para os títulos. */
export const titleGenSchema = z
  .array(
    z.object({
      texto: z.string().min(1),
      estilo: z.string().default(''),
      nota: z.coerce.number(),
    }),
  )
  .min(1);

/** Saída esperada do modelo para o roteiro. */
export const sceneGenSchema = z
  .array(
    z.object({
      textoNarrado: z.string().min(1),
      duracaoSegundos: z.coerce.number(),
      descricaoVisual: z.string().min(1),
      movimentoCamera: z.string().optional().default(''),
    }),
  )
  .min(1);

/** Fonte bibliográfica citada pelo roteiro. */
export const fonteSchema = z.object({
  titulo: z.string().min(1),
  autor: z.string().optional().default(''),
  ano: z.union([z.string(), z.number()]).optional().default(''),
  url: z.string().optional().default(''),
});
export type FonteRoteiro = z.infer<typeof fonteSchema>;

/** Saída do gerador de roteiro: cenas + referências consultadas. */
export const roteiroGenSchema = z.object({
  cenas: sceneGenSchema,
  fontes: z.array(fonteSchema).optional().default([]),
});
export type RoteiroGerado = z.infer<typeof roteiroGenSchema>;

/** Saída esperada do modelo ao refazer uma única cena. */
export const singleSceneGenSchema = z.object({
  textoNarrado: z.string().min(1),
  duracaoSegundos: z.coerce.number(),
  descricaoVisual: z.string().min(1),
  movimentoCamera: z.string().optional().default(''),
});

export const updateTitleSchema = z.object({ texto: z.string().trim().min(1).max(100) });
export type UpdateTitleInput = z.infer<typeof updateTitleSchema>;

export const updateSceneSchema = z.object({
  textoNarrado: z.string().max(2000).optional(),
  duracaoSegundos: z.number().int().min(1).max(120).optional(),
  descricaoVisual: z.string().max(1000).optional(),
  sugestaoCamera: z.string().max(40).optional(),
  alertaImagem: z.string().max(1000).optional(),
});
export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;

export const addSceneSchema = z.object({ depoisDaCena: z.number().int().min(0).optional() });
export type AddSceneInput = z.infer<typeof addSceneSchema>;

export const reorderScenesSchema = z.object({ ids: z.array(z.string()).min(1) });
export type ReorderScenesInput = z.infer<typeof reorderScenesSchema>;

export const advanceSchema = z.object({ etapa: z.enum(STEP_SLUGS) });
export type AdvanceInput = z.infer<typeof advanceSchema>;

export type StatusItem = 'pendente' | 'gerado' | 'aprovado' | 'desatualizado';

export interface TitleDto {
  id: string;
  texto: string;
  estilo: string;
  nota: number;
  escolhido: boolean;
}

export interface SceneDto {
  id: string;
  numero: number;
  textoNarrado: string;
  duracaoSegundos: number;
  descricaoVisual: string;
  statusNarracao: StatusItem;
  statusImagem: StatusItem;
  audioDuracaoMs: number | null;
  temAudio: boolean;
  temImagem: boolean;
  versaoMidia: number;
  sugestaoCamera: string;
  alertaImagem: string;
}

export interface RoteiroResumo {
  totalSegundos: number;
  alvoSegundos: number;
  /** Diferença percentual entre o total e o alvo (positivo = acima). */
  desvioPercentual: number;
  /** Margem de 10% do documento original. */
  dentroDaMargem: boolean;
  /** Números das cenas fora do limite de duração do formato. */
  cenasForaDoLimite: number[];
}

export interface ScenesResponse {
  scenes: SceneDto[];
  resumo: RoteiroResumo;
  /** Referências consultadas pelo roteiro (JSON já interpretado). */
  fontes: FonteRoteiro[];
  /** Revisão editorial mais recente, se houver. */
  editorial: {
    classificacao: ClassificacaoEditorial | null;
    pendentes: number;
    revisadoEm: string | null;
  };
  /** Roteiro importado de um .md escrito à mão (dispensa a revisão por IA). */
  roteiroManual: boolean;
  /**
   * Avisos da última geração (ex.: a IA parou antes de 90% da duração alvo).
   * Vazio nas demais operações.
   */
  avisos: string[];
}

/**
 * Importação de roteiro em Markdown: aceita o mesmo padrão do arquivo
 * exportado pelo YouStudio (título em `#`, cenas em `## Cena N`,
 * `**Texto narrado**`, `**Descrição visual**` e `## Referências`).
 */
export const importRoteiroSchema = z.object({
  markdown: z.string().trim().min(10, 'O arquivo está vazio.').max(200_000),
});
export type ImportRoteiroInput = z.infer<typeof importRoteiroSchema>;

export interface ImportRoteiroResponse extends ScenesResponse {
  importado: {
    cenas: number;
    fontes: number;
    /** Ajustes automáticos e trechos ignorados, para mostrar na tela. */
    avisos: string[];
  };
}

/** Calcula o resumo do roteiro; usado na API e na tela para mostrar o mesmo número. */
export function calcularResumoRoteiro(
  scenes: Pick<SceneDto, 'numero' | 'duracaoSegundos'>[],
  formato: Formato,
  duracaoMinutos: number,
): RoteiroResumo {
  const totalSegundos = scenes.reduce((acc, s) => acc + s.duracaoSegundos, 0);
  const alvoSegundos = duracaoMinutos * 60;
  const desvio = alvoSegundos > 0 ? ((totalSegundos - alvoSegundos) / alvoSegundos) * 100 : 0;
  const [min, max] = LIMITES_FORMATO[formato].cena;
  return {
    totalSegundos,
    alvoSegundos,
    desvioPercentual: Math.round(desvio * 10) / 10,
    dentroDaMargem: scenes.length > 0 && Math.abs(desvio) <= 10,
    cenasForaDoLimite: scenes
      .filter((s) => s.duracaoSegundos < min || s.duracaoSegundos > max)
      .map((s) => s.numero),
  };
}

/** Próxima etapa depois da informada (ou a própria, se for a última). */
export function proximaEtapa(etapa: StepSlug): StepSlug {
  const i = STEP_SLUGS.indexOf(etapa);
  return STEP_SLUGS[Math.min(i + 1, STEP_SLUGS.length - 1)];
}

// ---------------------------------------------------------------------------
// Fases 2 a 5: narração, imagens, tags, thumbnails, descrição e exportação
// ---------------------------------------------------------------------------

export const MAX_CARACTERES_TAGS = 500;
/** Faixa recomendada de tags: da mais ampla à mais específica. */
export const MIN_TAGS = 20;
export const MAX_TAGS = 25;
/** Texto curto da thumbnail: até 10 palavras, como no padrão de CTR do YouTube. */
export const MAX_PALAVRAS_THUMB = 10;

export type JobTipo =
  'narracao' | 'imagem' | 'thumbnail' | 'render' | 'editorial' | 'verificacao' | 'visual';
export type JobStatus = 'fila' | 'executando' | 'concluido' | 'erro';

export interface JobDto {
  id: string;
  tipo: JobTipo;
  alvoId: string | null;
  status: JobStatus;
  erro: string | null;
}

export interface NarrationResponse {
  vozNome: string;
  vozInstrucaoTom: string;
  narracaoNatural: boolean;
  narracaoVelocidade: number;
  pronuncia: string;
  scenes: SceneDto[];
  jobs: JobDto[];
}

/** Versão de áudio de uma cena, guardada para comparação antes de aprovar. */
export interface AudioVersaoDto {
  id: string;
  duracaoMs: number;
  atual: boolean;
  criadoEm: string;
}

export interface ImagesResponse {
  estiloVisual: string;
  proporcao: '16:9' | '9:16';
  scenes: (SceneDto & { promptImagem: string })[];
  jobs: JobDto[];
}

export interface TagsResponse {
  tags: string[];
  totalCaracteres: number;
}

export interface ThumbnailDto {
  id: string;
  variacao: number;
  textoNaImagem: string;
  temImagem: boolean;
  /** Muda a cada imagem nova; usado para não reaproveitar cache do navegador. */
  versao: string;
  escolhida: boolean;
  /** Prompt pronto para gerar a imagem manualmente (Flow, Nano Banana etc.). */
  promptImagem: string;
}

export interface ThumbnailsResponse {
  thumbnails: ThumbnailDto[];
  jobs: JobDto[];
}

export interface CapituloDto {
  tempo: string;
  titulo: string;
}

/** Intervalo aproximado entre capítulos da descrição (um a cada 3 minutos). */
export const INTERVALO_CAPITULO_SEGUNDOS = 180;
/** O YouTube só mostra capítulos com pelo menos 3 itens. */
export const MIN_CAPITULOS = 3;
export const MAX_CAPITULOS = 12;

export interface DescriptionResponse {
  descricao: string;
  capitulos: CapituloDto[];
  temRoteiro: boolean;
  /** Duração usada para distribuir os capítulos: áudio real ou estimativa das cenas. */
  duracaoSegundos: number;
  /** Duração alvo definida no projeto. */
  duracaoAlvoSegundos: number;
}

export interface ExportResponse {
  mp4: { status: JobStatus; atualizadoEm: string; erro: string | null } | null;
  jobs: JobDto[];
  /** Números das cenas que ainda não têm narração ou imagem. */
  faltando: number[];
  totalSegundos: number;
  resolucao: string;
  efeitoCamera: EfeitoCamera;
  musica: {
    nome: string;
    artista: string;
    origem: string;
    volume: number;
    ducking: boolean;
  } | null;
  legendasAtivas: boolean;
}

// ---------------------------------------------------------------------------
// Música de fundo (upload próprio ou biblioteca local de músicas livres)
// ---------------------------------------------------------------------------

export const MUSICA_VOLUME_PADRAO = 20;

export const MUSICA_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
] as const;
export type MusicaMime = (typeof MUSICA_MIMES)[number];

export const MUSICA_MIME_PARA_EXT: Record<MusicaMime, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

export const MUSICA_EXT_PARA_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

export interface MusicaEscolhida {
  nome: string;
  artista: string;
  origem: string;
  /** Linha de crédito pronta para colar na descrição do YouTube. */
  credito: string;
  /** Muda a cada arquivo novo; evita cache do navegador. */
  versao: string;
}

export interface MusicaBibliotecaItem {
  arquivo: string;
  nome: string;
  artista: string;
  origem: string;
  credito: string;
}

export interface MusicResponse {
  escolhida: MusicaEscolhida | null;
  volume: number;
  ducking: boolean;
  biblioteca: MusicaBibliotecaItem[];
  /** Caminho da pasta onde o usuário pode colocar músicas livres. */
  pastaBiblioteca: string;
}

export const musicUploadSchema = z.object({
  base64: z.string().min(10),
  mime: z.enum(MUSICA_MIMES),
  nome: z.string().trim().max(120).optional(),
  artista: z.string().trim().max(120).optional(),
});
export type MusicUploadInput = z.infer<typeof musicUploadSchema>;

export const musicLibrarySchema = z.object({ arquivo: z.string().trim().min(1).max(200) });
export type MusicLibraryInput = z.infer<typeof musicLibrarySchema>;

export const musicConfigSchema = z.object({
  volume: z.number().int().min(0).max(100).optional(),
  ducking: z.boolean().optional(),
  credito: z.string().max(500).optional(),
});
export type MusicConfigInput = z.infer<typeof musicConfigSchema>;

// ----- schemas -----

export const tagsGenSchema = z.array(z.string().min(1)).min(1);
export const thumbTextGenSchema = z.object({ textos: z.array(z.string().min(1)).min(1) });
export const descGenSchema = z.object({
  gancho: z.string().min(1),
  resumo: z.string().min(1),
  chamadaInscricao: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1),
  capitulos: z.array(z.object({ tempo: z.string(), titulo: z.string().min(1) })).min(1),
});

export const updateTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(100)).max(MAX_TAGS),
});
export type UpdateTagsInput = z.infer<typeof updateTagsSchema>;

export const updateThumbSchema = z.object({ textoNaImagem: z.string().trim().min(1).max(200) });
export type UpdateThumbInput = z.infer<typeof updateThumbSchema>;

export const updateDescSchema = z.object({ descricao: z.string().max(5000) });
export type UpdateDescInput = z.infer<typeof updateDescSchema>;

export const styleSchema = z.object({ estiloVisual: z.string().trim().min(1).max(600) });
export type StyleInput = z.infer<typeof styleSchema>;

export const uploadImageSchema = z.object({
  base64: z.string().min(10),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
});
export type UploadImageInput = z.infer<typeof uploadImageSchema>;

// ---------------------------------------------------------------------------
// Revisão editorial
// ---------------------------------------------------------------------------

export const TIPOS_PROBLEMA_EDITORIAL = [
  'historico',
  'geografico',
  'cientifico',
  'fonte',
  'contradicao',
  'generalizacao',
  'contexto',
] as const;
export type TipoProblemaEditorial = (typeof TIPOS_PROBLEMA_EDITORIAL)[number];

export const CONFIANCAS_EDITORIAL = ['alta', 'media', 'baixa', 'nao_verificada'] as const;
export type ConfiancaEditorial = (typeof CONFIANCAS_EDITORIAL)[number];

export const CLASSIFICACOES_EDITORIAL = ['aprovado', 'ressalvas', 'correcao'] as const;
export type ClassificacaoEditorial = (typeof CLASSIFICACOES_EDITORIAL)[number];

export const ROTULO_CLASSIFICACAO: Record<ClassificacaoEditorial, string> = {
  aprovado: 'Aprovado',
  ressalvas: 'Aprovado com ressalvas',
  correcao: 'Necessita de correção',
};

export const ROTULO_CONFIANCA: Record<ConfiancaEditorial, string> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
  nao_verificada: 'NÃO VERIFICADA',
};

export const ROTULO_TIPO_PROBLEMA: Record<TipoProblemaEditorial, string> = {
  historico: 'Precisão histórica',
  geografico: 'Precisão geográfica',
  cientifico: 'Precisão científica',
  fonte: 'Afirmação sem fonte',
  contradicao: 'Possível contradição',
  generalizacao: 'Generalização excessiva',
  contexto: 'Falta de contextualização',
};

/** Saída esperada do modelo na revisão editorial. */
export const editorialGenSchema = z.object({
  classificacao: z.enum(CLASSIFICACOES_EDITORIAL),
  resumo: z.string().default(''),
  problemas: z
    .array(
      z.object({
        cenaNumero: z.coerce.number().int().min(1).nullable().optional(),
        tipo: z.enum(TIPOS_PROBLEMA_EDITORIAL),
        trecho: z.string().default(''),
        problema: z.string().min(1),
        explicacao: z.string().default(''),
        sugestao: z.string().default(''),
        fonte: z.string().default(''),
        confianca: z.enum(CONFIANCAS_EDITORIAL).default('media'),
      }),
    )
    .default([]),
});
export type EditorialGen = z.infer<typeof editorialGenSchema>;

export interface EditorialIssueDto {
  id: string;
  cenaNumero: number | null;
  tipo: TipoProblemaEditorial;
  trecho: string;
  problema: string;
  explicacao: string;
  sugestao: string;
  fonte: string;
  confianca: ConfiancaEditorial;
  status: 'pendente' | 'aceita' | 'rejeitada';
}

export interface EditorialResponse {
  revisao: { classificacao: ClassificacaoEditorial; resumo: string; criadoEm: string } | null;
  issues: EditorialIssueDto[];
  pendentes: number;
  jobs: JobDto[];
}

// ---------------------------------------------------------------------------
// Elementos visuais explicativos (mapas históricos e linhas do tempo)
// ---------------------------------------------------------------------------

export const TIPOS_VISUAL = ['mapa', 'linha-do-tempo'] as const;
export type TipoVisual = (typeof TIPOS_VISUAL)[number];

export const ROTULO_VISUAL: Record<TipoVisual, string> = {
  mapa: 'Mapa histórico',
  'linha-do-tempo': 'Linha do tempo',
};

export interface VisualAssetDto {
  id: string;
  sceneNumero: number | null;
  tipo: TipoVisual;
  titulo: string;
  periodo: string;
  descricao: string;
  prompt: string;
  temImagem: boolean;
  /** Muda a cada imagem nova; evita cache no navegador. */
  versao: string;
}

export interface VisualAssetsResponse {
  assets: VisualAssetDto[];
  jobs: JobDto[];
}

export const createVisualAssetSchema = z.object({
  tipo: z.enum(TIPOS_VISUAL).default('mapa'),
  sceneNumero: z.number().int().min(1).nullable().optional(),
  titulo: z.string().trim().max(200).default(''),
  periodo: z.string().trim().max(200).default(''),
  descricao: z.string().trim().max(1500).default(''),
});
export type CreateVisualAssetInput = z.infer<typeof createVisualAssetSchema>;

export const updateVisualAssetSchema = z.object({
  titulo: z.string().trim().max(200).optional(),
  periodo: z.string().trim().max(200).optional(),
  descricao: z.string().trim().max(1500).optional(),
  sceneNumero: z.number().int().min(1).nullable().optional(),
});
export type UpdateVisualAssetInput = z.infer<typeof updateVisualAssetSchema>;

// ---------------------------------------------------------------------------
// Análise de qualidade (áudio e revisão final)
// ---------------------------------------------------------------------------

/** Referências ajustáveis de loudness para conteúdo estéreo no YouTube. */
export const AUDIO_REFERENCIA = {
  lufsAlvo: -16,
  lufsTolerancia: 2,
  truePeakMax: -1,
  /** Silêncio contínuo acima disso vira alerta. */
  silencioMaxMs: 2500,
  /** Diferença de loudness entre cenas que vira alerta. */
  diferencaMaxLu: 4,
} as const;

export interface AudioCenaAnalise {
  numero: number;
  duracaoMs: number;
  lufs: number | null;
  truePeakDb: number | null;
  silencioMaxMs: number;
  problemas: string[];
}

export interface AudioAnalise {
  cenas: AudioCenaAnalise[];
  /** Loudness do conjunto (concatenação da narração). */
  geral: { lufs: number | null; truePeakDb: number | null } | null;
  musica: { lufs: number | null; truePeakDb: number | null } | null;
  /** Estimativa da mixagem final, quando há música. */
  mixagem: {
    vozesLufs: number | null;
    musicaLufs: number | null;
    diferencaDb: number | null;
  } | null;
  problemas: string[];
}

/** Avisos de legibilidade calculados com as mesmas regras usadas na queima das legendas. */
export interface LegendasAnalise {
  cenas: { numero: number; blocos: number; avisos: string[] }[];
  /** Opções efetivas usadas na renderização (para conferência na interface). */
  opcoes: {
    maxCaracteres: number;
    porLinha: number;
    fonte: number;
    fonteNome: string;
    posicao: LegendaPosicao;
    estilo: LegendaEstilo;
  };
  avisos: string[];
}

export type ChecklistStatus = 'ok' | 'alerta' | 'erro' | 'pendente';

export interface ChecklistItem {
  id: string;
  rotulo: string;
  status: ChecklistStatus;
  detalhe: string;
}

export interface RevisaoFinalResponse {
  itens: ChecklistItem[];
  resumo: { ok: number; alertas: number; erros: number; pendentes: number };
  geradoEm: string;
  /** Falhas que impedem a exportação (técnicas), se houver. */
  bloqueios: string[];
}

// ----- configurações de IA -----

export const PROVEDORES_IA = ['gemini', 'openai', 'anthropic', 'groq'] as const;
export type ProvedorIa = (typeof PROVEDORES_IA)[number];

export interface ProvedorIaInfo {
  id: ProvedorIa;
  nome: string;
  /** Variáveis correspondentes no .env (e nas linhas de configuração salvas). */
  varChave: string;
  varModeloTexto: string;
  varModeloImagem?: string;
  /** Posição na fila de fallback: 0 = chamado primeiro. */
  ordem: number;
}

/** Ordem de uso: se o provedor anterior falhar, o próximo assume. */
export const PROVEDORES_IA_INFO: ProvedorIaInfo[] = [
  {
    id: 'gemini',
    nome: 'Google Gemini',
    varChave: 'GEMINI_API_KEY',
    varModeloTexto: 'GEMINI_MODEL_TEXT',
    varModeloImagem: 'GEMINI_MODEL_IMAGE',
    ordem: 0,
  },
  {
    id: 'openai',
    nome: 'OpenAI',
    varChave: 'OPENAI_API_KEY',
    varModeloTexto: 'OPENAI_MODEL_TEXT',
    varModeloImagem: 'OPENAI_MODEL_IMAGE',
    ordem: 1,
  },
  {
    id: 'anthropic',
    nome: 'Anthropic',
    varChave: 'ANTHROPIC_API_KEY',
    varModeloTexto: 'ANTHROPIC_MODEL_TEXT',
    ordem: 2,
  },
  {
    id: 'groq',
    nome: 'Groq',
    varChave: 'GROQ_API_KEY',
    varModeloTexto: 'GROQ_MODEL_TEXT',
    ordem: 3,
  },
];

export interface CampoConfigIa {
  /**
   * Valor efetivo; string vazia = não configurado.
   * Para a chave, o backend envia sempre "" — o navegador só recebe o resumo.
   */
  valor: string;
  /** De onde veio: arquivo .env, valor salvo na tela, ou nenhum. */
  origem: 'env' | 'salvo' | 'nenhuma';
  /** Só para a chave: resumo para exibir sem revelar o valor ("AIza…xyz4"). */
  resumo?: string;
}

export interface ProvedorIaConfigDto {
  id: ProvedorIa;
  nome: string;
  ordem: number;
  /** True quando há chave + modelo de texto: o provedor entra na fila. */
  ativo: boolean;
  campos: {
    chave: CampoConfigIa;
    modeloTexto: CampoConfigIa;
    modeloImagem?: CampoConfigIa;
  };
}

export interface AiSettingsDto {
  provedores: ProvedorIaConfigDto[];
}

/**
 * PUT /settings/ai/:provedor — campos ausentes não são alterados.
 * `limparChave` apaga a chave salva na tela; `restaurarEnv` apaga tudo
 * (chave e modelos) para voltar ao que está no .env.
 */
export const updateProvedorIaSchema = z.object({
  modeloTexto: z.string().trim().max(120).optional(),
  modeloImagem: z.string().trim().max(120).optional(),
  apiKey: z.string().trim().max(400).optional(),
  limparChave: z.boolean().optional(),
  restaurarEnv: z.boolean().optional(),
});
export type UpdateProvedorIaInput = z.infer<typeof updateProvedorIaSchema>;

export const testarProvedorIaSchema = z.object({ provedor: z.enum(PROVEDORES_IA) });
export type TestarProvedorIaInput = z.infer<typeof testarProvedorIaSchema>;

// ---------------------------------------------------------------------------
// Pacote do projeto (.zip) — exportar e importar para continuar editando
// ---------------------------------------------------------------------------

export const PROJETO_PACOTE_APP = 'youstudio';
/** Versão do manifesto. O importador recusa versões maiores que esta. */
export const PROJETO_PACOTE_VERSAO = 1;

/** Definições do projeto que viajam no `projeto.json` (sem ids, dono ou datas). */
export const projetoPacoteDefinicoesSchema = z.object({
  ideia: z.string().max(200).default(''),
  tema: z.string().max(1000).default(''),
  publico: z.string().max(200).default(''),
  formato: z.enum(FORMATOS).default('longo'),
  duracaoMinutos: z.number().int().min(1).max(30).default(5),
  idioma: z.enum(IDIOMAS).default('pt-BR'),
  tituloEscolhido: z.string().max(100).default(''),
  vozNome: z.string().max(60).default('voz-masculina-1'),
  vozInstrucaoTom: z.string().max(300).default('suave, claro, bem explicado'),
  narracaoNatural: z.boolean().default(true),
  narracaoVelocidade: z
    .number()
    .int()
    .min(NARRACAO_VELOCIDADE_MIN)
    .max(NARRACAO_VELOCIDADE_MAX)
    .default(97),
  pronuncia: z.string().max(2000).default(''),
  estiloVisual: z
    .string()
    .max(600)
    .default('3D estilizado, cores quentes, iluminação suave, sem texto na imagem'),
  descricao: z.string().max(5000).default(''),
  efeitoCamera: z.enum(EFEITO_CAMERA_SLUGS).default('alternado'),
  usarCameraSugerida: z.boolean().default(false),
  legendasAtivas: z.boolean().default(true),
  legendaTamanho: z.number().int().min(60).max(160).default(100),
  legendaPosicao: z.enum(LEGENDA_POSICOES).default('baixo'),
  legendaEstilo: z.enum(LEGENDA_ESTILOS).default('negrito'),
  legendaFonte: z.string().max(60).default('Noto Sans'),
  legendaCor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#C4B5FD'),
  editorialStatus: z.enum(['nao_revisado', 'aprovado', 'ressalvas', 'correcao']).default('nao_revisado'),
  roteiroManual: z.boolean().default(false),
  fontesRoteiro: z.string().max(20000).default(''),
  revisaoFinalEm: z.string().nullable().default(null),
});
export type ProjetoPacoteDefinicoes = z.infer<typeof projetoPacoteDefinicoesSchema>;

/** Arquivo citado pelo manifesto: caminho relativo dentro do próprio ZIP. */
const caminhoNoZip = z.string().trim().max(300);

export const cenaPacoteSchema = z.object({
  numero: z.number().int().min(1),
  textoNarrado: z.string().max(200_000).default(''),
  duracaoSegundos: z.number().int().min(0).max(600).default(0),
  descricaoVisual: z.string().max(20_000).default(''),
  promptImagem: z.string().max(20_000).default(''),
  sugestaoCamera: z.string().max(40).default(''),
  alertaImagem: z.string().max(1000).default(''),
  statusNarracao: z.string().max(30).default('pendente'),
  statusImagem: z.string().max(30).default('pendente'),
  audioDuracaoMs: z.number().int().min(0).nullable().default(null),
  versaoMidia: z.number().int().min(0).default(0),
  arquivoImagem: caminhoNoZip.nullable().default(null),
  arquivoAudio: caminhoNoZip.nullable().default(null),
  audios: z
    .array(
      z.object({
        arquivo: caminhoNoZip,
        duracaoMs: z.number().int().min(0).default(0),
        atual: z.boolean().default(false),
        criadoEm: z.string().optional(),
      }),
    )
    .max(20)
    .default([]),
});
export type CenaPacote = z.infer<typeof cenaPacoteSchema>;

export const tituloPacoteSchema = z.object({
  texto: z.string().max(300),
  estilo: z.string().max(120).default(''),
  nota: z.number().default(0),
  escolhido: z.boolean().default(false),
});

export const thumbnailPacoteSchema = z.object({
  variacao: z.number().int().min(1).max(20),
  textoNaImagem: z.string().max(300).default(''),
  escolhida: z.boolean().default(false),
  arquivo: caminhoNoZip.nullable().default(null),
});

export const capituloPacoteSchema = z.object({
  tempo: z.string().max(20),
  titulo: z.string().max(300),
});

export const elementoVisualPacoteSchema = z.object({
  sceneNumero: z.number().int().min(1).nullable().default(null),
  tipo: z.enum(TIPOS_VISUAL).default('mapa'),
  titulo: z.string().max(200).default(''),
  periodo: z.string().max(200).default(''),
  descricao: z.string().max(1500).default(''),
  prompt: z.string().max(5000).default(''),
  arquivo: caminhoNoZip.nullable().default(null),
});

export const revisaoPacoteSchema = z.object({
  classificacao: z.enum(CLASSIFICACOES_EDITORIAL),
  resumo: z.string().max(5000).default(''),
  criadoEm: z.string().optional(),
  issues: z
    .array(
      z.object({
        cenaNumero: z.number().int().min(1).nullable().default(null),
        tipo: z.enum(TIPOS_PROBLEMA_EDITORIAL),
        trecho: z.string().max(5000).default(''),
        problema: z.string().max(5000),
        explicacao: z.string().max(10_000).default(''),
        sugestao: z.string().max(10_000).default(''),
        fonte: z.string().max(2000).default(''),
        confianca: z.enum(CONFIANCAS_EDITORIAL).default('media'),
        status: z.enum(['pendente', 'aceita', 'rejeitada']).default('pendente'),
      }),
    )
    .max(500)
    .default([]),
});

export const musicaPacoteSchema = z.object({
  arquivo: caminhoNoZip.nullable().default(null),
  nome: z.string().max(120).default(''),
  artista: z.string().max(120).default(''),
  origem: z.string().max(200).default(''),
  credito: z.string().max(500).default(''),
  volume: z.number().int().min(0).max(100).default(MUSICA_VOLUME_PADRAO),
  ducking: z.boolean().default(true),
});

/**
 * Manifesto `projeto.json` na raiz do ZIP. É a fonte para reconstruir o
 * projeto; os demais arquivos continuam iguais ao pacote de entrega.
 */
export const projetoPacoteSchema = z.object({
  schemaVersion: z.number().int().min(1),
  app: z.literal(PROJETO_PACOTE_APP),
  exportadoEm: z.string(),
  etapaAtual: z.enum(STEP_SLUGS),
  projeto: projetoPacoteDefinicoesSchema,
  titles: z.array(tituloPacoteSchema).max(100).default([]),
  scenes: z.array(cenaPacoteSchema).max(2000).default([]),
  tags: z.array(z.string().max(100)).max(60).default([]),
  chapters: z.array(capituloPacoteSchema).max(500).default([]),
  thumbnails: z.array(thumbnailPacoteSchema).max(50).default([]),
  visualAssets: z.array(elementoVisualPacoteSchema).max(200).default([]),
  editorial: revisaoPacoteSchema.nullable().default(null),
  musica: musicaPacoteSchema.nullable().default(null),
});
export type ProjetoPacote = z.infer<typeof projetoPacoteSchema>;

export interface ImportPreviewResumo {
  cenas: number;
  audios: number;
  imagens: number;
  versoesAudio: number;
  musicas: number;
  thumbnails: number;
  elementosVisuais: number;
  titulos: number;
  tags: number;
  capitulos: number;
}

export interface ImportItemIgnorado {
  caminho: string;
  motivo: string;
}

export interface ImportPreviewResponse {
  /** Falso para pacotes antigos, sem `projeto.json`. */
  manifesto: boolean;
  arquivo: { nome: string; tamanhoBytes: number };
  titulo: string;
  formato: Formato;
  idioma: Idioma;
  etapaAtual: StepSlug;
  resumo: ImportPreviewResumo;
  avisos: string[];
  ignorados: ImportItemIgnorado[];
}

export interface ImportProjectResponse {
  projeto: ProjectDto;
  avisos: string[];
  ignorados: ImportItemIgnorado[];
}

/** Limite padrão do upload do ZIP; pode ser trocado por IMPORT_MAX_MB. */
export const IMPORT_MAX_MB_PADRAO = 500;

// ----- helpers compartilhados -----

export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

/** Total de caracteres das tags como o YouTube Studio conta (separadas por vírgula). */
export function totalCaracteresTags(tags: string[]): number {
  return tags.join(',').length;
}

/** 00:00 ou 0:00:00 quando passa de 1 hora. */
export function formatarTempo(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function resolucaoDoFormato(formato: Formato): { largura: number; altura: number } {
  return formato === 'shorts' ? { largura: 1080, altura: 1920 } : { largura: 1920, altura: 1080 };
}
