import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  AUDIO_REFERENCIA,
  AudioAnalise,
  AudioCenaAnalise,
  ChecklistItem,
  LegendaEstilo,
  LegendaPosicao,
  LegendasAnalise,
  RevisaoFinalResponse,
  formatarTempo,
  resolucaoDoFormato,
} from '@yt/shared';
import { extDaChave } from '../media/files';
import { FfmpegService } from '../media/ffmpeg.service';
import { Silencio, blocosDaCena, opcoesDeLegenda, parsearSilencios } from '../media/legendas';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

/** Extrai o JSON que o filtro loudnorm imprime no stderr. */
function lerLoudnorm(saida: string): { lufs: number | null; truePeakDb: number | null } {
  const inicio = saida.indexOf('{');
  const fim = saida.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return { lufs: null, truePeakDb: null };
  try {
    const j = JSON.parse(saida.slice(inicio, fim + 1)) as Record<string, string>;
    const lufs = Number(j.input_i);
    const tp = Number(j.input_tp);
    return {
      lufs: Number.isFinite(lufs) ? Math.round(lufs * 10) / 10 : null,
      truePeakDb: Number.isFinite(tp) ? Math.round(tp * 10) / 10 : null,
    };
  } catch {
    return { lufs: null, truePeakDb: null };
  }
}

/** Média ponderada de loudness (potência) entre cenas, usada como estimativa do conjunto. */
function combinado(cenas: AudioCenaAnalise[]): { lufs: number | null; truePeakDb: number | null } {
  const comLufs = cenas.filter((c) => c.lufs !== null && c.duracaoMs > 0);
  if (!comLufs.length) return { lufs: null, truePeakDb: null };
  const total = comLufs.reduce((a, c) => a + c.duracaoMs, 0);
  const potencia =
    comLufs.reduce((a, c) => a + c.duracaoMs * Math.pow(10, (c.lufs as number) / 10), 0) / total;
  const lufs = Math.round(10 * Math.log10(potencia) * 10) / 10;
  const picos = cenas.map((c) => c.truePeakDb).filter((p): p is number => p !== null);
  return { lufs, truePeakDb: picos.length ? Math.max(...picos) : null };
}

const arred = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ffmpeg: FfmpegService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  private async medirArquivo(entrada: string, duracaoMs: number) {
    const loud = lerLoudnorm(
      await this.ffmpeg.capture(['-i', entrada, '-af', 'loudnorm=print_format=json', '-f', 'null', '-']),
    );
    const silencios: Silencio[] = parsearSilencios(
      await this.ffmpeg.capture([
        '-i', entrada, '-af', 'silencedetect=noise=-35dB:d=0.5', '-f', 'null', '-',
      ]),
      duracaoMs,
    );
    const silencioMaxMs = silencios.reduce((a, s) => Math.max(a, s.fimMs - s.inicioMs), 0);
    return { ...loud, silencioMaxMs: Math.round(silencioMaxMs) };
  }

  /** Analisa narração por cena e a música de fundo (LUFS, true peak, silêncios). */
  async analisarAudio(projectId: string): Promise<AudioAnalise> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const problemas: string[] = [];
    const analises: AudioCenaAnalise[] = [];
    let resultado: AudioAnalise = { cenas: [], geral: null, musica: null, mixagem: null, problemas: [] };

    await this.ffmpeg.comPastaTemporaria(async (dir) => {
      for (const c of cenas) {
        if (!c.audioPath) {
          analises.push({
            numero: c.numero,
            duracaoMs: 0,
            lufs: null,
            truePeakDb: null,
            silencioMaxMs: 0,
            problemas: ['Cena sem narração.'],
          });
          continue;
        }
        const arq = join(dir, `cena-${c.numero}.wav`);
        await fs.writeFile(arq, await this.storage.get(c.audioPath));
        const duracaoMs = c.audioDuracaoMs ?? c.duracaoSegundos * 1000;
        const medido = await this.medirArquivo(arq, duracaoMs);
        const locais: string[] = [];
        if (medido.lufs !== null && Math.abs(medido.lufs - AUDIO_REFERENCIA.lufsAlvo) > AUDIO_REFERENCIA.lufsTolerancia) {
          locais.push(`Loudness ${medido.lufs} LUFS fora da referência de ${AUDIO_REFERENCIA.lufsAlvo} LUFS.`);
        }
        if (medido.truePeakDb !== null && medido.truePeakDb > AUDIO_REFERENCIA.truePeakMax) {
          locais.push(`True peak ${medido.truePeakDb} dBTP acima de ${AUDIO_REFERENCIA.truePeakMax} dBTP.`);
        }
        if (medido.silencioMaxMs > AUDIO_REFERENCIA.silencioMaxMs) {
          locais.push(`Silêncio de ${(medido.silencioMaxMs / 1000).toFixed(1)} s na cena.`);
        }
        if (c.audioDuracaoMs && c.duracaoSegundos > 0) {
          const desvio = Math.abs(c.audioDuracaoMs - c.duracaoSegundos * 1000) / (c.duracaoSegundos * 1000);
          if (desvio > 0.4) {
            locais.push(
              `Áudio tem ${formatarTempo(c.audioDuracaoMs / 1000)} e o roteiro previa ${c.duracaoSegundos} s.`,
            );
          }
        }
        analises.push({
          numero: c.numero,
          duracaoMs,
          lufs: medido.lufs,
          truePeakDb: medido.truePeakDb,
          silencioMaxMs: medido.silencioMaxMs,
          problemas: locais,
        });
      }

      // Música: medida como arquivo isolado (o volume do projeto entra na estimativa da mixagem).
      let musica: AudioAnalise['musica'] = null;
      if (row?.musicaPath) {
        const arq = join(dir, `musica.${extDaChave(row.musicaPath)}`);
        await fs.writeFile(arq, await this.storage.get(row.musicaPath));
        musica = lerLoudnorm(
          await this.ffmpeg.capture(['-i', arq, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'])
            .catch(() => ''),
        );
      }

      const comAudio = analises.filter((a) => a.lufs !== null);
      if (comAudio.length > 1) {
        const lufs = comAudio.map((a) => a.lufs as number);
        const diferenca = Math.max(...lufs) - Math.min(...lufs);
        if (diferenca > AUDIO_REFERENCIA.diferencaMaxLu) {
          problemas.push(
            `Diferença de ${arred(diferenca)} LU entre cenas — normalize a narração antes de exportar.`,
          );
        }
      }

      const geral = combinado(analises);
      let mixagem: AudioAnalise['mixagem'] = null;
      if (geral.lufs !== null && musica?.lufs !== null && musica) {
        const volume = Math.min(100, Math.max(0, row?.musicaVolume ?? 20)) / 100;
        const musicaEfetiva = musica.lufs + 20 * Math.log10(Math.max(0.01, volume));
        const diferencaDb = arred(geral.lufs - musicaEfetiva);
        mixagem = {
          vozesLufs: geral.lufs,
          musicaLufs: arred(musicaEfetiva),
          diferencaDb,
        };
        if (diferencaDb < 6) {
          problemas.push(
            `A música fica apenas ${diferencaDb} dB abaixo da narração. Baixe o volume para a voz ficar na frente.`,
          );
        }
      }
      if (geral.truePeakDb !== null && geral.truePeakDb > AUDIO_REFERENCIA.truePeakMax) {
        problemas.push(`True peak do conjunto em ${geral.truePeakDb} dBTP (referência: até -1 dBTP).`);
      }
      if (geral.lufs !== null && Math.abs(geral.lufs - AUDIO_REFERENCIA.lufsAlvo) > AUDIO_REFERENCIA.lufsTolerancia) {
        problemas.push(
          `Loudness da narração em ${geral.lufs} LUFS (referência: ${AUDIO_REFERENCIA.lufsAlvo} LUFS ±${AUDIO_REFERENCIA.lufsTolerancia}).`,
        );
      }
      for (const c of analises) {
        if (c.lufs === null && c.duracaoMs === 0) problemas.push(`Cena ${c.numero} sem áudio.`);
      }

      resultado = { cenas: analises, geral, musica, mixagem, problemas };
    });

    return resultado;
  }

  /** Confere as legendas com as mesmas regras usadas na queima do MP4 (palavras longas e blocos rápidos). */
  async analisarLegendas(projectId: string): Promise<LegendasAnalise> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const { largura, altura } = resolucaoDoFormato(project.formato);
    const posicao = (row?.legendaPosicao as LegendaPosicao | undefined) ?? 'baixo';
    const estilo = (row?.legendaEstilo as LegendaEstilo | undefined) ?? 'negrito';
    const opcoes = opcoesDeLegenda(
      largura,
      altura,
      row?.legendaTamanho ?? 100,
      posicao,
      row?.legendaFonte ?? 'Noto Sans',
      row?.legendaCor ?? '#C4B5FD',
      estilo,
    );

    const analises = cenas.map((c) => {
      const texto = c.textoNarrado.replace(/\s+/g, ' ').trim();
      const duracaoMs = c.audioDuracaoMs ?? c.duracaoSegundos * 1000;
      const blocos = blocosDaCena({
        texto,
        inicioMs: 0,
        duracaoMs,
        maxCaracteres: opcoes.maxCaracteres,
      });
      const avisos: string[] = [];
      const palavras = texto.split(' ').filter(Boolean);
      const longas = [...new Set(palavras.filter((p) => p.length > opcoes.porLinha))].slice(0, 3);
      if (longas.length) {
        avisos.push(
          `Palavra(s) maior(es) que a linha e sujeita(s) a corte: ${longas.join(', ')}.`,
        );
      }
      if (blocos.length && duracaoMs > 0) {
        const media = duracaoMs / blocos.length;
        if (media < 1200) {
          avisos.push(
            `${blocos.length} legendas em ${(duracaoMs / 1000).toFixed(1)} s (média de ${(media / 1000).toFixed(1)} s por bloco).`,
          );
        }
        if (blocos.length > 8) {
          avisos.push(`Muitos blocos (${blocos.length}); encurte o texto ou aumente a duração da cena.`);
        }
      }
      if (!texto && duracaoMs > 0) avisos.push('Cena sem texto narrado.');
      return { numero: c.numero, blocos: blocos.length, avisos };
    });

    const comAviso = analises.filter((a) => a.avisos.length);
    const avisos: string[] = [];
    if (!row?.legendasAtivas) {
      avisos.push('As legendas estão desligadas nesta montagem; os avisos abaixo não afetam o MP4.');
    }
    if (comAviso.length) {
      avisos.push(
        `${comAviso.length} cena(s) com avisos de legibilidade: ${comAviso.map((a) => a.numero).join(', ')}.`,
      );
    }
    if (posicao !== 'baixo') {
      avisos.push(
        `Legendas posicionadas no ${posicao}: confira se não cobrem personagens ou informações importantes.`,
      );
    }

    return {
      cenas: analises,
      opcoes: {
        maxCaracteres: opcoes.maxCaracteres,
        porLinha: opcoes.porLinha,
        fonte: opcoes.fonte,
        fonteNome: opcoes.fonteNome,
        posicao,
        estilo,
      },
      avisos,
    };
  }

  /**
   * Prévia da mixagem: narração concatenada + música com o volume/ducking do projeto,
   * limitada aos primeiros segundos para responder rápido no navegador.
   */
  async previaMixagem(projectId: string, segundos = 60): Promise<Buffer> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.prisma.scene.findMany({
      where: { projectId, audioPath: { not: null } },
      orderBy: { numero: 'asc' },
    });
    if (!cenas.length) {
      throw new BadRequestException('Gere a narração antes de ouvir a prévia da mixagem.');
    }
    const limite = Math.min(180, Math.max(10, Math.round(segundos)));

    return this.ffmpeg.comPastaTemporaria(async (dir) => {
      const arquivos: string[] = [];
      for (const c of cenas) {
        const arq = join(dir, `cena-${c.numero}.wav`);
        await fs.writeFile(arq, await this.storage.get(c.audioPath as string));
        arquivos.push(arq);
      }

      const args = ['-y'];
      for (const arq of arquivos) args.push('-i', arq);

      let musicaIndice = -1;
      if (row?.musicaPath) {
        const musica = join(dir, `musica.${extDaChave(row.musicaPath)}`);
        await fs.writeFile(musica, await this.storage.get(row.musicaPath));
        args.push('-stream_loop', '-1', '-i', musica);
        musicaIndice = arquivos.length;
      }

      const concat =
        arquivos.map((_, i) => `[${i}:a]`).join('') +
        `concat=n=${arquivos.length}:v=0:a=1[voice]`;
      let filtro =
        concat +
        `;[voice]atrim=0:${limite},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo[voz]`;
      let saida = '[voz]';

      if (musicaIndice >= 0) {
        const volume = (Math.min(100, Math.max(0, row?.musicaVolume ?? 20)) / 100).toFixed(2);
        filtro +=
          `;[${musicaIndice}:a]volume=${volume},atrim=0:${limite},asetpts=N/SR/TB,` +
          `aresample=48000,aformat=channel_layouts=stereo[mus]`;
        if (row?.musicaDucking) {
          filtro +=
            ';[voz]asplit=2[v][side];[mus][side]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=450[duck];' +
            '[v][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]';
        } else {
          filtro +=
            ';[voz][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]';
        }
        saida = '[mix]';
      }

      args.push(
        '-filter_complex',
        filtro,
        '-map',
        saida,
        '-t',
        String(limite),
        '-c:a',
        'libmp3lame',
        '-b:a',
        '160k',
        '-f',
        'mp3',
        'pipe:1',
      );
      return this.ffmpeg.runBuffer(args, 32);
    });
  }

  /** Checklist completo antes de gerar o vídeo final. */
  async revisaoFinal(projectId: string): Promise<RevisaoFinalResponse> {
    const project = await this.projects.get(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const audio = await this.analisarAudio(projectId);
    const legendas = await this.analisarLegendas(projectId);
    const issues = await this.prisma.editorialIssue.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    });
    const pendentesEditorial = issues.find((i) => i.status === 'pendente')?._count._all ?? 0;
    const semFonte = await this.prisma.editorialIssue.count({
      where: { projectId, tipo: 'fonte', status: 'pendente' },
    });
    const revisao = await this.prisma.editorialReview.findFirst({
      where: { projectId },
      orderBy: { criadoEm: 'desc' },
    });

    const itens: ChecklistItem[] = [];
    const add = (id: string, rotulo: string, status: ChecklistItem['status'], detalhe: string) =>
      itens.push({ id, rotulo, status, detalhe });

    // 1. Roteiro
    add(
      'roteiro',
      'O roteiro foi aprovado?',
      cenas.length === 0
        ? 'erro'
        : !revisao
          ? 'pendente'
          : pendentesEditorial === 0
            ? 'ok'
            : 'alerta',
      cenas.length === 0
        ? 'Não há cenas.'
        : !revisao
          ? 'Rode a revisão editorial na etapa 3.'
          : pendentesEditorial === 0
            ? `Revisão de ${new Date(revisao.criadoEm).toLocaleString('pt-BR')}, sem pendências.`
            : `${pendentesEditorial} apontamento(s) aguardando decisão na etapa 3.`,
    );

    // 2. Informações verificadas
    add(
      'verificacao',
      'As informações foram verificadas?',
      !revisao ? 'pendente' : pendentesEditorial === 0 ? 'ok' : 'alerta',
      !revisao
        ? 'Sem revisão editorial registrada.'
        : pendentesEditorial === 0
          ? 'Todos os apontamentos foram aceitos ou rejeitados.'
          : `${pendentesEditorial} apontamento(s) em aberto.`,
    );

    // 3. Afirmações sem fonte
    add(
      'sem-fonte',
      'Existem afirmações sem fontes?',
      semFonte === 0 ? 'ok' : 'alerta',
      semFonte === 0
        ? 'Nenhuma afirmação sem fonte apontada.'
        : `${semFonte} afirmação(ões) sem fonte apontada(s).`,
    );

    // 4. Cenas com imagem
    const semImagem = cenas.filter((c) => !c.imagemPath).map((c) => c.numero);
    add(
      'imagens',
      'Todas as cenas possuem imagens?',
      cenas.length > 0 && !semImagem.length ? 'ok' : cenas.length ? 'erro' : 'pendente',
      semImagem.length ? `Faltam imagens nas cenas: ${semImagem.join(', ')}.` : 'Todas com imagem.',
    );

    // 5. Imagens correspondem à narração
    const comAlerta = cenas.filter((c) => c.alertaImagem.trim());
    const verificou = cenas.some((c) => c.alertaImagem.trim()) || cenas.some((c) => c.imagemPath);
    add(
      'imagens-correspondem',
      'As imagens correspondem à narração?',
      !verificou ? 'pendente' : comAlerta.length ? 'alerta' : 'ok',
      comAlerta.length
        ? `${comAlerta.length} cena(s) com alerta de correspondência (etapa 5).`
        : 'Nenhum alerta visual registrado.',
    );

    // 6. Imagens repetidas (hash do arquivo)
    const hashes = new Map<string, number[]>();
    for (const c of cenas) {
      if (!c.imagemPath) continue;
      const hash = createHash('sha256')
        .update(await this.storage.get(c.imagemPath))
        .digest('hex');
      hashes.set(hash, [...(hashes.get(hash) ?? []), c.numero]);
    }
    const repetidas = [...hashes.values()].filter((l) => l.length > 1);
    add(
      'imagens-repetidas',
      'Existem imagens repetidas?',
      repetidas.length ? 'alerta' : 'ok',
      repetidas.length
        ? `Arquivos idênticos nas cenas ${repetidas.map((l) => l.join('=')).join('; ')}.`
        : 'Nenhuma imagem idêntica.',
    );

    // 7. Narração completa
    const semAudio = cenas
      .filter((c) => !c.audioPath || c.statusNarracao === 'desatualizado' || c.statusNarracao === 'pendente')
      .map((c) => c.numero);
    add(
      'narracao',
      'A narração está completa?',
      cenas.length > 0 && !semAudio.length ? 'ok' : cenas.length ? 'erro' : 'pendente',
      semAudio.length
        ? `Faltam narração atualizada nas cenas: ${semAudio.join(', ')}.`
        : 'Todas as cenas narradas.',
    );

    // 8. Legendas
    const cenasComAvisoLegenda = legendas.cenas.filter((c) => c.avisos.length);
    add(
      'legendas',
      'As legendas estão sincronizadas?',
      !row?.legendasAtivas ? 'ok' : semAudio.length ? 'pendente' : 'ok',
      !row?.legendasAtivas
        ? 'Legendas desligadas nesta montagem.'
        : semAudio.length
          ? 'Gere a narração para sincronizar as legendas.'
          : 'Sincronizadas pelo tempo real de cada áudio.',
    );
    add(
      'legendas-legiveis',
      'As legendas estão legíveis?',
      !row?.legendasAtivas
        ? 'ok'
        : cenasComAvisoLegenda.length
          ? 'alerta'
          : 'ok',
      !row?.legendasAtivas
        ? 'Verificação ignorada porque as legendas estão desligadas.'
        : cenasComAvisoLegenda.length
          ? cenasComAvisoLegenda
              .slice(0, 4)
              .map((c) => `Cena ${c.numero}: ${c.avisos.join(' ')}`)
              .join(' ')
          : `${legendas.cenas.reduce((a, c) => a + c.blocos, 0)} blocos dentro dos limites de ${legendas.opcoes.maxCaracteres} caracteres.`,
    );

    // 9. Música equilibrada
    add(
      'musica',
      'A música está equilibrada?',
      !row?.musicaPath ? 'ok' : audio.mixagem?.diferencaDb == null ? 'alerta' : audio.mixagem.diferencaDb >= 6 ? 'ok' : 'alerta',
      !row?.musicaPath
        ? 'Sem música de fundo.'
        : audio.mixagem?.diferencaDb == null
          ? 'Não foi possível medir a música.'
          : `Música ${audio.mixagem.diferencaDb} dB abaixo da narração.`,
    );

    // 10. Cenas sem áudio
    add(
      'sem-audio',
      'Existem cenas sem áudio?',
      semAudio.length ? 'erro' : 'ok',
      semAudio.length ? `Cenas ${semAudio.join(', ')}.` : 'Nenhuma.',
    );

    // 11. Problemas de duração
    const totalSegundos = cenas.reduce(
      (a, c) => a + (c.audioDuracaoMs ?? c.duracaoSegundos * 1000) / 1000,
      0,
    );
    const alvo = project.duracaoMinutos * 60;
    const desvio = alvo > 0 ? Math.abs(totalSegundos - alvo) / alvo : 0;
    add(
      'duracao',
      'Existem problemas de duração?',
      desvio <= 0.15 ? 'ok' : 'alerta',
      `Duração final estimada ${formatarTempo(totalSegundos)} (alvo ${formatarTempo(alvo)}).`,
    );

    // 12. Resolução e 13. formato
    const { largura, altura } = resolucaoDoFormato(project.formato);
    add(
      'resolucao',
      'A resolução está correta?',
      largura >= 1080 && altura >= 1080 ? 'ok' : 'alerta',
      `Exportação em ${largura}x${altura}.`,
    );
    add(
      'formato',
      'O vídeo está no formato 16:9?',
      project.formato === 'longo' ? 'ok' : 'alerta',
      project.formato === 'longo'
        ? '1920x1080 (16:9).'
        : 'Shorts em 9:16 por definição — publique como Short.',
    );

    // 14. Exportação
    const ultimoExport = await this.prisma.export.findFirst({
      where: { projectId, tipo: 'mp4' },
      orderBy: { createdAt: 'desc' },
    });
    add(
      'exportacao',
      'A exportação foi concluída corretamente?',
      !ultimoExport ? 'pendente' : ultimoExport.status === 'concluido' ? 'ok' : ultimoExport.status === 'erro' ? 'erro' : 'pendente',
      !ultimoExport
        ? 'Nenhuma montagem feita ainda.'
        : ultimoExport.status === 'concluido'
          ? `Última montagem em ${ultimoExport.createdAt.toLocaleString('pt-BR')}.`
          : `Última montagem: ${ultimoExport.status}.`,
    );

    // 15. Qualidade de áudio (loudness, picos, silêncios)
    add(
      'audio-qualidade',
      'O áudio está dentro das referências?',
      audio.problemas.length ? 'alerta' : 'ok',
      audio.problemas.length ? audio.problemas.join(' ') : 'Loudness e picos dentro da referência.',
    );

    const resumo = {
      ok: itens.filter((i) => i.status === 'ok').length,
      alertas: itens.filter((i) => i.status === 'alerta').length,
      erros: itens.filter((i) => i.status === 'erro').length,
      pendentes: itens.filter((i) => i.status === 'pendente').length,
    };
    const bloqueios: string[] = [];
    if (!cenas.length) bloqueios.push('Não há cenas.');
    if (semAudio.length) bloqueios.push(`Narração pendente nas cenas ${semAudio.join(', ')}.`);
    if (semImagem.length) bloqueios.push(`Imagens pendentes nas cenas ${semImagem.join(', ')}.`);

    await this.prisma.project
      .update({ where: { id: projectId }, data: { revisaoFinalEm: new Date() } })
      .catch(() => undefined);

    return { itens, resumo, geradoEm: new Date().toISOString(), bloqueios };
  }
}
