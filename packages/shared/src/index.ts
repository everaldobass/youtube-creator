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
  'pt-BR': { rotulo: 'Português (Brasil)', curto: 'PT', exemplo: 'Ex.: como funciona o sistema solar' },
  en: { rotulo: 'English', curto: 'EN', exemplo: 'Ex.: how the solar system works' },
};

/** Limites por formato (documento original, seção 1). */
export const LIMITES_FORMATO = {
  longo: { maxMinutos: 20, cena: [10, 25], resolucao: '1920x1080', proporcao: '16:9' },
  shorts: { maxMinutos: 3, cena: [3, 8], resolucao: '1080x1920', proporcao: '9:16' },
} as const;

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
  { slug: 'panoramica-esquerda', label: 'Panorâmica à esquerda', descricao: 'A câmera desliza da direita para a esquerda.' },
  { slug: 'panoramica-direita', label: 'Panorâmica à direita', descricao: 'A câmera desliza da esquerda para a direita.' },
  { slug: 'panoramica-cima', label: 'Panorâmica para cima', descricao: 'A câmera sobe pela imagem.' },
  { slug: 'panoramica-baixo', label: 'Panorâmica para baixo', descricao: 'A câmera desce pela imagem.' },
  { slug: 'rotacao', label: 'Rotação suave', descricao: 'A imagem gira levemente para os lados.' },
  { slug: 'tridimensional', label: 'Deslocamento 3D', descricao: 'Zoom, deslocamento e rotação juntos, com sensação de profundidade.' },
  { slug: 'alternado', label: 'Alternado (recomendado)', descricao: 'Troca o movimento a cada cena para o vídeo não ficar repetitivo.' },
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
  tema: z.string().max(200).default(''),
  publico: z.string().max(200).default(''),
  formato: z.enum(FORMATOS).default('longo'),
  duracaoMinutos: z.number().int().min(1).max(20).default(5),
  idioma: z.enum(IDIOMAS).default('pt-BR'),
  vozNome: z.string().max(60).default('voz-masculina-1'),
  narracaoNatural: z.boolean().default(true),
  efeitoCamera: z.enum(EFEITO_CAMERA_SLUGS).default('alternado'),
  legendasAtivas: z.boolean().default(true),
  legendaTamanho: z.number().int().min(60).max(160).default(100),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .extend({
    tituloEscolhido: z.string().max(100),
    vozInstrucaoTom: z.string().max(300),
    estiloVisual: z.string().max(600),
    descricao: z.string().max(5000),
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
  estiloVisual: string;
  descricao: string;
  efeitoCamera: EfeitoCamera;
  legendasAtivas: boolean;
  legendaTamanho: number;
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
    }),
  )
  .min(1);

/** Saída esperada do modelo ao refazer uma única cena. */
export const singleSceneGenSchema = z.object({
  textoNarrado: z.string().min(1),
  duracaoSegundos: z.coerce.number(),
  descricaoVisual: z.string().min(1),
});

export const updateTitleSchema = z.object({ texto: z.string().trim().min(1).max(100) });
export type UpdateTitleInput = z.infer<typeof updateTitleSchema>;

export const updateSceneSchema = z.object({
  textoNarrado: z.string().max(2000).optional(),
  duracaoSegundos: z.number().int().min(1).max(120).optional(),
  descricaoVisual: z.string().max(1000).optional(),
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
export const MAX_PALAVRAS_THUMB = 4;

export type JobTipo = 'narracao' | 'imagem' | 'thumbnail' | 'render';
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
  scenes: SceneDto[];
  jobs: JobDto[];
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

export interface DescriptionResponse {
  descricao: string;
  capitulos: CapituloDto[];
  temRoteiro: boolean;
}

export interface ExportResponse {
  mp4: { status: JobStatus; atualizadoEm: string; erro: string | null } | null;
  jobs: JobDto[];
  /** Números das cenas que ainda não têm narração ou imagem. */
  faltando: number[];
  totalSegundos: number;
  resolucao: string;
  efeitoCamera: EfeitoCamera;
  musica: { nome: string; artista: string; origem: string; volume: number; ducking: boolean } | null;
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

export const updateTagsSchema = z.object({ tags: z.array(z.string().trim().min(1).max(100)).max(40) });
export type UpdateTagsInput = z.infer<typeof updateTagsSchema>;

export const updateThumbSchema = z.object({ textoNaImagem: z.string().trim().min(1).max(60) });
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
