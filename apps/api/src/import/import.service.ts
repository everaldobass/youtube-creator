import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ImportItemIgnorado,
  ImportPreviewResponse,
  ImportProjectResponse,
  MUSICA_EXT_PARA_MIME,
  MUSICA_VOLUME_PADRAO,
  PROJETO_PACOTE_APP,
  PROJETO_PACOTE_VERSAO,
  ProjetoPacote,
  ProjetoPacoteDefinicoes,
  STEP_SLUGS,
  StepSlug,
  projetoPacoteDefinicoesSchema,
  projetoPacoteSchema,
} from '@yt/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';
import {
  chaveAudio,
  chaveImagem,
  chaveMusica,
  chaveThumb,
  chaveVisual,
  EXT_PARA_MIME,
  extDaChave,
} from '../media/files';
import {
  EntradaZip,
  ZipInvalidoError,
  inspecionarZip,
  lerArquivosZip,
  percorrerZip,
  validarCaminhoZip,
} from './zip-seguro';

const MIMES: Record<string, string> = {
  ...EXT_PARA_MIME,
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  json: 'application/json',
  txt: 'text/plain',
  srt: 'text/plain',
};

const METADADOS = new Set([
  'projeto.json',
  'tempos.json',
  'titulo.txt',
  'tags.txt',
  'descricao.txt',
  'musica.txt',
  'legendas.srt',
]);

const novoId = () => randomUUID().replace(/-/g, '');

const numeroSeguro = (n: unknown, padrao = 0) =>
  typeof n === 'number' && Number.isFinite(n) ? n : padrao;

const dataOuNull = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const extensao = (caminho: string) => {
  const ponto = caminho.lastIndexOf('.');
  return ponto >= 0 ? caminho.slice(ponto + 1).toLowerCase() : 'png';
};

interface VersaoAnalise {
  arquivo: string;
  duracaoMs: number;
  atual: boolean;
  criadoEm?: string;
}

interface CenaAnalise {
  numero: number;
  textoNarrado: string;
  duracaoSegundos: number;
  descricaoVisual: string;
  promptImagem: string;
  sugestaoCamera: string;
  alertaImagem: string;
  audioDuracaoMs: number | null;
  versaoMidia: number;
  arquivoImagem: string | null;
  arquivoAudio: string | null;
  audios: VersaoAnalise[];
}

interface Analise {
  manifesto: boolean;
  projeto: ProjetoPacoteDefinicoes;
  etapaAtual: StepSlug;
  cenas: CenaAnalise[];
  titles: ProjetoPacote['titles'];
  tags: string[];
  chapters: ProjetoPacote['chapters'];
  thumbnails: ProjetoPacote['thumbnails'];
  visualAssets: ProjetoPacote['visualAssets'];
  editorial: ProjetoPacote['editorial'];
  musica: ProjetoPacote['musica'];
  referenciados: Set<string>;
  avisos: string[];
  ignorados: ImportItemIgnorado[];
}

/** Calcula a etapa possível pelo que existe no pacote (sem confiar cegamente no manifesto). */
function etapaPeloConteudo(a: {
  cenas: CenaAnalise[];
  titles: ProjetoPacote['titles'];
  tags: string[];
  chapters: ProjetoPacote['chapters'];
  thumbnails: ProjetoPacote['thumbnails'];
  descricao: string;
}): StepSlug {
  if (!a.cenas.length) return a.titles.length ? 'titulos' : 'definicoes';
  if (a.cenas.some((c) => !c.arquivoAudio)) return 'narracao';
  if (a.cenas.some((c) => !c.arquivoImagem)) return 'imagens';
  if (!a.tags.length) return 'tags';
  if (!a.thumbnails.some((t) => t.arquivo)) return 'thumbnails';
  if (!a.chapters.length && !a.descricao.trim()) return 'descricao';
  return 'video';
}

const indiceEtapa = (etapa: StepSlug) => STEP_SLUGS.indexOf(etapa);

/**
 * Importa o pacote .zip do projeto como um projeto NOVO. O manifesto é
 * validado com o mesmo schema usado no export; arquivos maliciosos são
 * recusados antes de qualquer gravação.
 */
@Injectable()
export class ImportService {
  private readonly log = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async preview(caminho: string, nomeArquivo: string, tamanhoBytes: number): Promise<ImportPreviewResponse> {
    const analise = await this.analisar(caminho);
    return {
      manifesto: analise.manifesto,
      arquivo: { nome: nomeArquivo, tamanhoBytes },
      titulo:
        analise.projeto.tituloEscolhido ||
        analise.projeto.tema ||
        analise.projeto.ideia ||
        'Projeto importado',
      formato: analise.projeto.formato,
      idioma: analise.projeto.idioma,
      etapaAtual: analise.etapaAtual,
      resumo: {
        cenas: analise.cenas.length,
        audios: analise.cenas.filter((c) => c.arquivoAudio).length,
        imagens: analise.cenas.filter((c) => c.arquivoImagem).length,
        versoesAudio: analise.cenas.reduce((n, c) => n + c.audios.length, 0),
        musicas: analise.musica?.arquivo ? 1 : 0,
        thumbnails: analise.thumbnails.filter((t) => t.arquivo).length,
        elementosVisuais: analise.visualAssets.filter((v) => v.arquivo).length,
        titulos: analise.titles.length,
        tags: analise.tags.length,
        capitulos: analise.chapters.length,
      },
      avisos: analise.avisos,
      ignorados: analise.ignorados,
    };
  }

  async importar(
    caminho: string,
    _nomeArquivo: string,
    _tamanhoBytes: number,
  ): Promise<ImportProjectResponse> {
    const analise = await this.analisar(caminho);
    const projectId = novoId();
    const base = Date.now();
    const arquivos = new Map<string, { chave: string; mime: string }>();
    const cenasPlano: {
      id: string;
      dados: CenaAnalise;
      chaveAudio: string | null;
      chaveImagem: string | null;
      versoes: { chave: string; duracaoMs: number; atual: boolean; criadoEm: Date | null }[];
    }[] = [];

    analise.cenas.forEach((cena, i) => {
      const id = novoId();
      let chaveAudioAtual: string | null = null;
      let chaveImagemAtual: string | null = null;
      if (cena.arquivoAudio) {
        chaveAudioAtual = chaveAudio(projectId, id, base + i);
        arquivos.set(cena.arquivoAudio, { chave: chaveAudioAtual, mime: MIMES.wav });
      }
      if (cena.arquivoImagem) {
        chaveImagemAtual = chaveImagem(projectId, id, extensao(cena.arquivoImagem));
        arquivos.set(cena.arquivoImagem, {
          chave: chaveImagemAtual,
          mime: MIMES[extensao(cena.arquivoImagem)] ?? 'application/octet-stream',
        });
      }

      const versoes: { chave: string; duracaoMs: number; atual: boolean; criadoEm: Date | null }[] = [];
      const versionadas = cena.audios.length
        ? cena.audios
        : cena.arquivoAudio
          ? [
              {
                arquivo: cena.arquivoAudio,
                duracaoMs: cena.audioDuracaoMs ?? cena.duracaoSegundos * 1000,
                atual: true,
              },
            ]
          : [];
      versionadas.forEach((v, j) => {
        const chave =
          v.arquivo === cena.arquivoAudio && chaveAudioAtual
            ? chaveAudioAtual
            : chaveAudio(projectId, id, base + 10_000 + i * 100 + j);
        if (!arquivos.has(v.arquivo)) {
          arquivos.set(v.arquivo, { chave, mime: MIMES[extensao(v.arquivo)] ?? 'audio/wav' });
        }
        versoes.push({
          chave,
          duracaoMs: v.duracaoMs,
          atual: v.arquivo === cena.arquivoAudio,
          criadoEm: dataOuNull(v.criadoEm),
        });
      });
      if (versoes.length && !versoes.some((v) => v.atual)) versoes[0].atual = true;

      cenasPlano.push({
        id,
        dados: cena,
        chaveAudio: chaveAudioAtual,
        chaveImagem: chaveImagemAtual,
        versoes,
      });
    });

    const thumbsPlano = analise.thumbnails.map((t) => {
      const id = novoId();
      if (t.arquivo) {
        arquivos.set(t.arquivo, {
          chave: chaveThumb(projectId, id),
          mime: MIMES[extensao(t.arquivo)] ?? 'image/jpeg',
        });
      }
      return { id, dados: t };
    });

    const visuaisPlano = analise.visualAssets.map((v) => {
      const id = novoId();
      if (v.arquivo) {
        arquivos.set(v.arquivo, {
          chave: chaveVisual(projectId, id, extensao(v.arquivo)),
          mime: MIMES[extensao(v.arquivo)] ?? 'image/png',
        });
      }
      return { id, dados: v };
    });

    let chaveMusicaAtual: string | null = null;
    if (analise.musica?.arquivo) {
      chaveMusicaAtual = chaveMusica(projectId, extensao(analise.musica.arquivo));
      arquivos.set(analise.musica.arquivo, {
        chave: chaveMusicaAtual,
        mime: MUSICA_EXT_PARA_MIME[extensao(analise.musica.arquivo)] ?? 'audio/mpeg',
      });
    }

    // Arquivos primeiro, banco depois: se algo falhar, o prefixo do projeto some.
    try {
      await percorrerZip(caminho, async (nome, buffer) => {
        const destino = arquivos.get(nome);
        if (!destino) return;
        await this.storage.put(destino.chave, buffer, destino.mime);
      });
    } catch (e) {
      await this.storage.removePrefix(`projects/${projectId}`).catch(() => undefined);
      this.log.warn(`Importação abortada ao gravar arquivos: ${String(e)}`);
      throw this.comoErroDeImportacao(e);
    }

    try {
      const userId = await this.prisma.localUserId();
      const p = analise.projeto;
      const definicoes = projetoPacoteDefinicoesSchema.parse(p);
      const musica = analise.musica;

      await this.prisma.$transaction(async (tx) => {
        await tx.project.create({
          data: {
            id: projectId,
            userId,
            ideia: definicoes.ideia,
            tema: definicoes.tema,
            publico: definicoes.publico,
            formato: definicoes.formato,
            duracaoMinutos: definicoes.duracaoMinutos,
            idioma: definicoes.idioma,
            tituloEscolhido: definicoes.tituloEscolhido,
            vozNome: definicoes.vozNome,
            vozInstrucaoTom: definicoes.vozInstrucaoTom,
            narracaoNatural: definicoes.narracaoNatural,
            narracaoVelocidade: definicoes.narracaoVelocidade,
            pronuncia: definicoes.pronuncia,
            estiloVisual: definicoes.estiloVisual,
            descricao: definicoes.descricao,
            efeitoCamera: definicoes.efeitoCamera,
            usarCameraSugerida: definicoes.usarCameraSugerida,
            legendasAtivas: definicoes.legendasAtivas,
            legendaTamanho: definicoes.legendaTamanho,
            legendaPosicao: definicoes.legendaPosicao,
            legendaEstilo: definicoes.legendaEstilo,
            legendaFonte: definicoes.legendaFonte,
            legendaCor: definicoes.legendaCor,
            editorialStatus: definicoes.editorialStatus,
            roteiroManual: definicoes.roteiroManual,
            fontesRoteiro: definicoes.fontesRoteiro,
            revisaoFinalEm: dataOuNull(definicoes.revisaoFinalEm),
            etapaAtual: analise.etapaAtual,
            musicaPath: chaveMusicaAtual,
            musicaNome: musica?.nome ?? '',
            musicaArtista: musica?.artista ?? '',
            musicaOrigem: musica?.origem ?? '',
            musicaCredito: musica?.credito ?? '',
            musicaVolume: musica?.volume ?? 20,
            musicaDucking: musica?.ducking ?? true,
          },
        });

        if (analise.titles.length) {
          await tx.title.createMany({
            data: analise.titles.map((t) => ({
              projectId,
              texto: t.texto,
              estilo: t.estilo,
              nota: t.nota,
              escolhido: t.escolhido,
            })),
          });
        }

        if (cenasPlano.length) {
          await tx.scene.createMany({
            data: cenasPlano.map(({ id, dados, chaveAudio, chaveImagem }) => ({
              id,
              projectId,
              numero: dados.numero,
              textoNarrado: dados.textoNarrado,
              duracaoSegundos: dados.duracaoSegundos,
              descricaoVisual: dados.descricaoVisual,
              promptImagem: dados.promptImagem,
              sugestaoCamera: dados.sugestaoCamera,
              alertaImagem: dados.alertaImagem,
              audioPath: chaveAudio,
              imagemPath: chaveImagem,
              audioDuracaoMs: chaveAudio
                ? (dados.audioDuracaoMs ?? dados.duracaoSegundos * 1000)
                : null,
              versaoMidia: dados.versaoMidia || (chaveAudio || chaveImagem ? 1 : 0),
              // Status sempre recalculado pela presença real dos arquivos.
              statusNarracao: chaveAudio ? 'gerado' : 'pendente',
              statusImagem: chaveImagem ? 'gerado' : 'pendente',
            })),
          });
          const versoes = cenasPlano.flatMap(({ id, versoes }) =>
            versoes.map((v) => ({
              sceneId: id,
              path: v.chave,
              duracaoMs: v.duracaoMs,
              atual: v.atual,
              criadoEm: v.criadoEm ?? new Date(),
            })),
          );
          if (versoes.length) await tx.sceneAudio.createMany({ data: versoes });
        }

        if (analise.tags.length) {
          await tx.tag.createMany({
            data: analise.tags.map((texto, ordem) => ({ projectId, texto, ordem })),
          });
        }
        if (analise.chapters.length) {
          await tx.chapter.createMany({
            data: analise.chapters.map((c) => ({ projectId, tempo: c.tempo, titulo: c.titulo })),
          });
        }
        if (thumbsPlano.length) {
          let escolhida = false;
          await tx.thumbnail.createMany({
            data: thumbsPlano.map(({ id, dados }) => ({
              id,
              projectId,
              variacao: dados.variacao,
              textoNaImagem: dados.textoNaImagem,
              escolhida: dados.escolhida && !escolhida ? ((escolhida = true), true) : false,
              imagemPath: dados.arquivo
                ? (arquivos.get(dados.arquivo)?.chave ?? null)
                : null,
            })),
          });
        }
        if (visuaisPlano.length) {
          await tx.visualAsset.createMany({
            data: visuaisPlano.map(({ id, dados }) => ({
              id,
              projectId,
              sceneNumero: dados.sceneNumero,
              tipo: dados.tipo,
              titulo: dados.titulo,
              periodo: dados.periodo,
              descricao: dados.descricao,
              prompt: dados.prompt,
              imagemPath: dados.arquivo
                ? (arquivos.get(dados.arquivo)?.chave ?? null)
                : null,
            })),
          });
        }
        if (analise.editorial) {
          const review = await tx.editorialReview.create({
            data: {
              projectId,
              classificacao: analise.editorial.classificacao,
              resumo: analise.editorial.resumo,
              criadoEm: dataOuNull(analise.editorial.criadoEm) ?? new Date(),
            },
          });
          if (analise.editorial.issues.length) {
            await tx.editorialIssue.createMany({
              data: analise.editorial.issues.map((i) => ({
                reviewId: review.id,
                projectId,
                cenaNumero: i.cenaNumero,
                tipo: i.tipo,
                trecho: i.trecho,
                problema: i.problema,
                explicacao: i.explicacao,
                sugestao: i.sugestao,
                fonte: i.fonte,
                confianca: i.confianca,
                status: i.status,
              })),
            });
          }
        }
      });
    } catch (e) {
      await this.storage.removePrefix(`projects/${projectId}`).catch(() => undefined);
      this.log.warn(`Importação abortada ao gravar no banco: ${String(e)}`);
      throw this.comoErroDeImportacao(e);
    }

    return {
      projeto: await this.projects.get(projectId),
      avisos: analise.avisos,
      ignorados: analise.ignorados,
    };
  }

  private comoErroDeImportacao(e: unknown): BadRequestException {
    if (e instanceof BadRequestException) return e;
    if (e instanceof ZipInvalidoError) return new BadRequestException(e.message);
    const mensagem = e instanceof Error ? e.message : 'Não foi possível importar o pacote.';
    return new BadRequestException(mensagem);
  }

  private async analisar(caminho: string): Promise<Analise> {
    let entradas: EntradaZip[];
    try {
      entradas = await inspecionarZip(caminho);
    } catch (e) {
      throw this.comoErroDeImportacao(e);
    }
    const nomes = new Set(entradas.map((e) => e.nome));
    const metadados = new Set([...nomes].filter((n) => METADADOS.has(n)));
    let lidos: Map<string, Buffer>;
    try {
      // Na pré-visualização só os textos são carregados; mídias ficam no disco do ZIP.
      lidos = await lerArquivosZip(caminho, metadados);
    } catch (e) {
      throw this.comoErroDeImportacao(e);
    }

    const bruto = lidos.get('projeto.json');
    try {
      return bruto
        ? this.analisarManifesto(bruto, entradas)
        : this.analisarLegado(lidos, entradas);
    } catch (e) {
      throw this.comoErroDeImportacao(e);
    }
  }

  private analisarManifesto(bruto: Buffer, entradas: EntradaZip[]): Analise {
    let json: unknown;
    try {
      json = JSON.parse(bruto.toString('utf8'));
    } catch {
      throw new BadRequestException('O arquivo não é um pacote do YouStudio: projeto.json inválido.');
    }
    const cabecalho = json as { app?: unknown; schemaVersion?: unknown };
    if (cabecalho?.app !== PROJETO_PACOTE_APP) {
      throw new BadRequestException('O arquivo não é um pacote do YouStudio.');
    }
    if (
      typeof cabecalho.schemaVersion === 'number' &&
      cabecalho.schemaVersion > PROJETO_PACOTE_VERSAO
    ) {
      throw new BadRequestException(
        `Versão do pacote mais nova que este app (${cabecalho.schemaVersion}). Atualize o YouStudio para importar.`,
      );
    }
    const validado = projetoPacoteSchema.safeParse(json);
    if (!validado.success) {
      const primeiro = validado.error.issues[0];
      const onde = primeiro?.path.join('.') || 'projeto.json';
      throw new BadRequestException(
        `O projeto.json do pacote está inválido (${onde}: ${primeiro?.message ?? 'valor inválido'}).`,
      );
    }
    const pacote = validado.data;
    const nomes = new Set(entradas.map((e) => e.nome));
    const avisos: string[] = [];
    const referenciados = new Set<string>();

    const conferir = (arquivo: string | null, rotulo: string): string | null => {
      if (!arquivo) return null;
      try {
        validarCaminhoZip(arquivo);
      } catch {
        throw new BadRequestException(`O pacote contém um caminho inválido em ${rotulo}.`);
      }
      if (!nomes.has(arquivo)) {
        avisos.push(`${rotulo} não está no pacote e foi ignorado.`);
        return null;
      }
      referenciados.add(arquivo);
      return arquivo;
    };

    const numeros = new Set<number>();
    const cenas: CenaAnalise[] = pacote.scenes.map((c) => {
      if (numeros.has(c.numero)) {
        throw new BadRequestException(`O pacote tem duas cenas com o número ${c.numero}.`);
      }
      numeros.add(c.numero);
      const arquivoImagem = conferir(c.arquivoImagem, `A imagem da cena ${c.numero}`);
      const arquivoAudio = conferir(c.arquivoAudio, `O áudio da cena ${c.numero}`);
      const audios: VersaoAnalise[] = c.audios
        .map((v, i) => ({
          arquivo: conferir(v.arquivo, `A versão ${i + 1} do áudio da cena ${c.numero}`) ?? '',
          duracaoMs: v.duracaoMs,
          atual: v.atual,
          criadoEm: v.criadoEm,
        }))
        .filter((v) => Boolean(v.arquivo));
      return {
        numero: c.numero,
        textoNarrado: c.textoNarrado,
        duracaoSegundos: c.duracaoSegundos,
        descricaoVisual: c.descricaoVisual,
        promptImagem: c.promptImagem,
        sugestaoCamera: c.sugestaoCamera,
        alertaImagem: c.alertaImagem,
        audioDuracaoMs: c.audioDuracaoMs,
        versaoMidia: c.versaoMidia,
        arquivoImagem,
        arquivoAudio,
        audios,
      };
    });

    const thumbnails = pacote.thumbnails.map((t) => ({
      ...t,
      arquivo: conferir(t.arquivo, `O arquivo da thumbnail ${t.variacao}`),
    }));
    const visualAssets = pacote.visualAssets.map((v) => ({
      ...v,
      arquivo: conferir(v.arquivo, `O arquivo do elemento visual "${v.titulo || v.tipo}"`),
    }));
    const musica = pacote.musica
      ? {
          ...pacote.musica,
          arquivo: conferir(pacote.musica.arquivo, 'A música de fundo'),
        }
      : null;

    const calculada = etapaPeloConteudo({
      cenas,
      titles: pacote.titles,
      tags: pacote.tags,
      chapters: pacote.chapters,
      thumbnails,
      descricao: pacote.projeto.descricao,
    });
    // O manifesto pode estar à frente (ex.: vídeo já montado), mas nunca força
    // uma etapa que o conteúdo não sustenta.
    const etapaAtual =
      indiceEtapa(pacote.etapaAtual) < indiceEtapa(calculada) ? pacote.etapaAtual : calculada;

    if (pacote.schemaVersion < PROJETO_PACOTE_VERSAO) {
      avisos.push(
        `Pacote da versão ${pacote.schemaVersion}; importado no formato atual (v${PROJETO_PACOTE_VERSAO}).`,
      );
    }

    const ignorados = this.itensIgnorados(entradas, referenciados, false);
    return {
      manifesto: true,
      projeto: pacote.projeto,
      etapaAtual,
      cenas,
      titles: pacote.titles,
      tags: pacote.tags,
      chapters: pacote.chapters,
      thumbnails,
      visualAssets,
      editorial: pacote.editorial,
      musica,
      referenciados,
      avisos,
      ignorados,
    };
  }

  /** Pacotes antigos: só o que o ZIP de entrega trazia. */
  private analisarLegado(lidos: Map<string, Buffer>, entradas: EntradaZip[]): Analise {
    const nomes = new Set(entradas.map((e) => e.nome));
    const avisos = [
      'Pacote antigo, sem projeto.json: definições, títulos alternativos, prompts e revisão editorial não puderam ser recuperados.',
    ];
    const referenciados = new Set<string>();
    const projeto = projetoPacoteDefinicoesSchema.parse({});
    const titulo = lidos.get('titulo.txt')?.toString('utf8').trim() ?? '';
    if (titulo) projeto.tituloEscolhido = titulo.slice(0, 100);
    projeto.tema = projeto.tituloEscolhido;
    projeto.descricao = (lidos.get('descricao.txt')?.toString('utf8') ?? '').slice(0, 5000);

    const tags = (lidos.get('tags.txt')?.toString('utf8') ?? '')
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 40);

    let tempos: unknown[] = [];
    const brutoTempos = lidos.get('tempos.json');
    if (brutoTempos) {
      try {
        const json = JSON.parse(brutoTempos.toString('utf8'));
        if (Array.isArray(json)) tempos = json;
        else avisos.push('tempos.json não tem o formato esperado.');
      } catch {
        avisos.push('tempos.json não pôde ser lido; as cenas ficaram vazias.');
      }
    } else {
      avisos.push('O pacote não tem tempos.json; as cenas ficaram vazias.');
    }

    const cenas: CenaAnalise[] = [];
    const visualAssets: ProjetoPacote['visualAssets'] = [];
    for (const item of tempos) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;
      if (t.tipo && typeof t.arquivo === 'string') {
        if (!nomes.has(t.arquivo)) continue;
        validarCaminhoZip(t.arquivo);
        referenciados.add(t.arquivo);
        visualAssets.push({
          sceneNumero: typeof t.cena === 'number' ? t.cena : null,
          tipo: t.tipo === 'linha-do-tempo' ? 'linha-do-tempo' : 'mapa',
          titulo: String(t.titulo ?? ''),
          periodo: String(t.periodo ?? ''),
          descricao: '',
          prompt: '',
          arquivo: t.arquivo,
        });
        continue;
      }
      if (typeof t.cena !== 'number') continue;
      const imagem = typeof t.imagem === 'string' && nomes.has(t.imagem) ? t.imagem : null;
      const audio = typeof t.audio === 'string' && nomes.has(t.audio) ? t.audio : null;
      if (imagem) {
        validarCaminhoZip(imagem);
        referenciados.add(imagem);
      }
      if (audio) {
        validarCaminhoZip(audio);
        referenciados.add(audio);
      }
      sameSceneCheck(cenas, t.cena);
      cenas.push({
        numero: t.cena,
        textoNarrado: String(t.textoNarrado ?? ''),
        duracaoSegundos: Math.max(0, Math.round(numeroSeguro(t.duracaoMs) / 1000)),
        descricaoVisual: '',
        promptImagem: '',
        sugestaoCamera: '',
        alertaImagem: '',
        audioDuracaoMs: typeof t.duracaoMs === 'number' ? Math.round(t.duracaoMs) : null,
        versaoMidia: audio || imagem ? 1 : 0,
        arquivoImagem: imagem,
        arquivoAudio: audio,
        audios: audio
          ? [
              {
                arquivo: audio,
                duracaoMs: typeof t.duracaoMs === 'number' ? Math.round(t.duracaoMs) : 0,
                atual: true,
              },
            ]
          : [],
      });
    }
    cenas.sort((a, b) => a.numero - b.numero);
    cenas.forEach((c, i) => {
      if (c.numero !== i + 1) c.numero = i + 1;
    });

    const thumbnails: ProjetoPacote['thumbnails'] = [];
    for (const nome of nomes) {
      const m = /^thumbnails\/thumbnail-(\d+)(-escolhida)?\.(jpg|jpeg|png|webp)$/i.exec(nome);
      if (!m) continue;
      validarCaminhoZip(nome);
      referenciados.add(nome);
      thumbnails.push({
        variacao: Number(m[1]),
        textoNaImagem: '',
        escolhida: Boolean(m[2]),
        arquivo: nome,
      });
    }
    thumbnails.sort((a, b) => a.variacao - b.variacao);

    let musica: ProjetoPacote['musica'] = null;
    const arquivoMusica = [...nomes].find((n) => /^musica\/[^/]+\.(mp3|m4a|wav|ogg|flac)$/i.test(n));
    if (arquivoMusica) {
      validarCaminhoZip(arquivoMusica);
      referenciados.add(arquivoMusica);
      const texto = lidos.get('musica.txt')?.toString('utf8') ?? '';
      const campo = (rotulo: string) =>
        new RegExp(`^${rotulo}:\\s*(.*)$`, 'im').exec(texto)?.[1]?.trim() ?? '';
      musica = {
        arquivo: arquivoMusica,
        nome: campo('Música'),
        artista: campo('Artista'),
        origem: campo('Origem'),
        credito: campo('Créditos'),
        volume: MUSICA_VOLUME_PADRAO,
        ducking: true,
      };
    }

    const total = cenas.reduce((n, c) => n + c.duracaoSegundos, 0);
    projeto.duracaoMinutos = Math.min(30, Math.max(1, Math.ceil(total / 60) || 5));
    if (!cenas.length) avisos.push('Nenhuma cena foi encontrada no pacote.');

    const titles: ProjetoPacote['titles'] = titulo
      ? [{ texto: titulo, estilo: '', nota: 0, escolhido: true }]
      : [];

    const etapaAtual = etapaPeloConteudo({
      cenas,
      titles,
      tags,
      chapters: [],
      thumbnails,
      descricao: projeto.descricao,
    });

    return {
      manifesto: false,
      projeto,
      etapaAtual,
      cenas,
      titles,
      tags,
      chapters: [],
      thumbnails,
      visualAssets,
      editorial: null,
      musica,
      referenciados,
      avisos,
      ignorados: this.itensIgnorados(entradas, referenciados, true),
    };
  }

  /** Arquivos do ZIP que não serão usados, para transparência na prévia. */
  private itensIgnorados(
    entradas: EntradaZip[],
    referenciados: Set<string>,
    legado: boolean,
  ): ImportItemIgnorado[] {
    return entradas
      .filter((e) => {
        if (referenciados.has(e.nome) || METADADOS.has(e.nome)) return false;
        // Em pacote antigo, toda a mídia reconhecida já foi referenciada.
        return legado || /^(imagens|audios|thumbnails|musica|elementos-visuais)\//.test(e.nome);
      })
      .map((e) => ({
        caminho: e.nome,
        motivo: 'Arquivo não referenciado pelo projeto.json',
      }));
  }
}

/** Verifica cenas duplicadas no formato antigo (tempos.json). */
function sameSceneCheck(cenas: CenaAnalise[], numero: number) {
  if (cenas.some((c) => c.numero === numero)) {
    throw new BadRequestException(`O pacote tem duas cenas com o número ${numero}.`);
  }
}

