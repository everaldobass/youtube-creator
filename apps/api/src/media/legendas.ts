/** Faixa de silêncio (pausa) dentro do áudio de uma cena, em milissegundos relativos ao início dela. */
export interface Silencio {
  inicioMs: number;
  fimMs: number;
}

export interface PalavraLegenda {
  texto: string;
  inicioMs: number;
  fimMs: number;
}

/** Trecho de legenda exibido de uma vez (normalmente uma frase inteira). */
export interface BlocoLegenda {
  inicioMs: number;
  fimMs: number;
  palavras: PalavraLegenda[];
}

/** Estilo e limites de texto de acordo com o tamanho do vídeo (horizontal ou Shorts). */
export interface OpcoesLegenda {
  largura: number;
  altura: number;
  fonte: number;
  margemH: number;
  margemV: number;
  porLinha: number;
  maxCaracteres: number;
}

const FIM_DE_FRASE = /[.!?…]["'”’)\]]?$/;
const PAUSA_CURTA = /[,;:—–-]["'”’)\]]?$/;

/** Aproximação de sílabas: grupos de vogais (o TTS fala mais devagar em palavras longas). */
function silabas(palavra: string): number {
  const limpo = palavra.toLowerCase().replace(/[^a-záàâãéèêëíìîïóòôõöúùûüçñ]/g, '');
  const grupos = limpo.match(/[aeiouyáàâãéèêëíìîïóòôõöúùûü]+/g);
  return Math.max(1, grupos?.length ?? 1);
}

/**
 * Peso de tempo de uma palavra: sílabas + a pausa que vem depois dela.
 * A pausa entra no próprio trecho karaokê, então a palavra falada fica acesa
 * enquanto o narrador respira antes da próxima.
 */
function pesoDaPalavra(palavra: string): number {
  const base = silabas(palavra);
  if (FIM_DE_FRASE.test(palavra)) return base + 2.4;
  if (PAUSA_CURTA.test(palavra)) return base + 1.3;
  return base;
}

function palavrasDe(texto: string): string[] {
  return texto.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Separa em frases para nunca quebrar uma legenda no meio de uma oração. */
function emFrases(palavras: string[]): string[][] {
  const frases: string[][] = [];
  let atual: string[] = [];
  for (const palavra of palavras) {
    atual.push(palavra);
    if (FIM_DE_FRASE.test(palavra)) {
      frases.push(atual);
      atual = [];
    }
  }
  if (atual.length) frases.push(atual);
  return frases;
}

/** Quebra uma frase longa em blocos que cabem em duas linhas, preferindo as vírgulas. */
function quebrarFrase(frase: string[], maxCaracteres: number): string[][] {
  const blocos: string[][] = [];
  let resto = frase;
  while (resto.length) {
    if (resto.join(' ').length <= maxCaracteres) {
      blocos.push(resto);
      break;
    }
    let ate = 0;
    let tamanho = 0;
    let ateVirgula = 0;
    for (let i = 0; i < resto.length; i++) {
      const extra = (i ? 1 : 0) + resto[i].length;
      if (tamanho + extra > maxCaracteres) break;
      tamanho += extra;
      ate = i + 1;
      if (PAUSA_CURTA.test(resto[i]) && tamanho >= maxCaracteres * 0.35) ateVirgula = i + 1;
    }
    if (ate === 0) ate = 1;
    const corte = ateVirgula > 0 && ateVirgula < ate ? ateVirgula : ate;
    blocos.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  // Evita um resto minúsculo ("a.") numa última legenda sozinha.
  if (blocos.length > 1 && blocos[blocos.length - 1].join(' ').length < 6) {
    const ultimo = blocos.pop()!;
    blocos[blocos.length - 1] = [...blocos[blocos.length - 1], ...ultimo];
  }
  // Uma palavra sozinha no último bloco fica ruim na tela: puxa a anterior junto.
  if (blocos.length > 1) {
    const ultimo = blocos[blocos.length - 1];
    const anterior = blocos[blocos.length - 2];
    if (ultimo.length === 1 && anterior.length > 2) ultimo.unshift(anterior.pop()!);
  }
  return blocos;
}

/** Lê a saída do `silencedetect` do FFmpeg (stderr) e fecha a última pausa no fim da cena. */
export function parsearSilencios(stderr: string, duracaoMs: number): Silencio[] {
  const silencios: Silencio[] = [];
  let aberto: number | null = null;
  for (const linha of stderr.split('\n')) {
    const inicio = linha.match(/silence_start:\s*(-?[\d.]+)/);
    if (inicio) {
      aberto = Math.max(0, Number(inicio[1]) * 1000);
      continue;
    }
    const fim = linha.match(/silence_end:\s*(-?[\d.]+)/);
    if (fim && aberto !== null) {
      silencios.push({ inicioMs: aberto, fimMs: Math.min(duracaoMs, Number(fim[1]) * 1000) });
      aberto = null;
    }
  }
  if (aberto !== null && aberto < duracaoMs) silencios.push({ inicioMs: aberto, fimMs: duracaoMs });
  return silencios;
}

/**
 * Monta as legendas de uma cena. O tempo de cada palavra é estimado pelas sílabas e
 * ajustado nas pausas reais do áudio (as fronteiras entre frases caem no meio da pausa).
 */
export function blocosDaCena(opcoes: {
  texto: string;
  inicioMs: number;
  duracaoMs: number;
  maxCaracteres: number;
  silencios?: Silencio[];
}): BlocoLegenda[] {
  const palavras = palavrasDe(opcoes.texto);
  if (!palavras.length || opcoes.duracaoMs <= 0) return [];

  const grupos = emFrases(palavras).flatMap((frase) => quebrarFrase(frase, opcoes.maxCaracteres));
  const pesos = grupos.map((grupo) => grupo.reduce((soma, p) => soma + pesoDaPalavra(p), 0));
  const total = pesos.reduce((soma, p) => soma + p, 0);
  if (total <= 0) return [];

  // Fronteiras estimadas (relativas ao início da cena), proporcionais ao peso de cada bloco.
  const limites: number[] = [0];
  let acumulado = 0;
  for (let i = 0; i < grupos.length - 1; i++) {
    acumulado += pesos[i];
    limites.push((acumulado / total) * opcoes.duracaoMs);
  }
  limites.push(opcoes.duracaoMs);

  // Ajusta cada fronteira para o meio da pausa mais próxima do áudio real.
  const candidatos: { i: number; indice: number; meio: number; distancia: number }[] = [];
  for (let i = 1; i < limites.length - 1; i++) {
    (opcoes.silencios ?? []).forEach((silencio, indice) => {
      const meio = (silencio.inicioMs + silencio.fimMs) / 2;
      const distancia = Math.abs(meio - limites[i]);
      if (distancia <= 700) candidatos.push({ i, indice, meio, distancia });
    });
  }
  candidatos.sort((a, b) => a.distancia - b.distancia);
  const silenciosUsados = new Set<number>();
  for (const candidato of candidatos) {
    if (silenciosUsados.has(candidato.indice)) continue;
    if (candidato.meio <= limites[candidato.i - 1] + 200) continue;
    if (candidato.meio >= limites[candidato.i + 1] - 200) continue;
    limites[candidato.i] = candidato.meio;
    silenciosUsados.add(candidato.indice);
  }

  return grupos.map((grupo, i) => {
    const inicio = opcoes.inicioMs + limites[i];
    const fim = opcoes.inicioMs + limites[i + 1];
    const pesoBloco = pesos[i] || 1;
    let cursor = inicio;
    const palavrasDoBloco = grupo.map((palavra) => {
      const duracao = ((fim - inicio) * pesoDaPalavra(palavra)) / pesoBloco;
      const item = { texto: palavra, inicioMs: Math.round(cursor), fimMs: Math.round(cursor + duracao) };
      cursor += duracao;
      return item;
    });
    return { inicioMs: Math.round(inicio), fimMs: Math.round(fim), palavras: palavrasDoBloco };
  });
}

export function opcoesDeLegenda(
  largura: number,
  altura: number,
  tamanho = 100,
): OpcoesLegenda {
  const vertical = altura > largura;
  const escala = Math.min(160, Math.max(60, tamanho)) / 100;
  const fonte = Math.round(largura * (vertical ? 0.043 : 0.032) * escala);
  const margemH = Math.round(largura * 0.05);
  const margemV = Math.round(altura * (vertical ? 0.1 : 0.06));
  const porLinha = Math.max(16, Math.floor((largura - 2 * margemH) / (fonte * 0.55)));
  return { largura, altura, fonte, margemH, margemV, porLinha, maxCaracteres: porLinha * 2 - 6 };
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Tempo no formato do ASS: H:MM:SS.cc */
function tempoAss(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${h}:${doisDigitos(m)}:${doisDigitos(s)}.${doisDigitos(cs)}`;
}

function escaparAss(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');
}

/** Ponto de quebra em duas linhas: equilibra os lados quando possível. */
function indiceDaQuebra(palavras: PalavraLegenda[], porLinha: number): number {
  const tamanhos = palavras.map((p) => p.texto.length);
  const total = tamanhos.reduce((soma, n) => soma + n, 0) + Math.max(0, palavras.length - 1);
  if (total <= porLinha) return -1;
  let prefixo = 0;
  let equilibrada = -1;
  let diferenca = Infinity;
  let gulosa = -1;
  for (let i = 1; i < palavras.length; i++) {
    prefixo += tamanhos[i - 1] + (i > 1 ? 1 : 0);
    if (prefixo > porLinha) break;
    gulosa = i;
    const sufixo = total - prefixo - 1;
    const distancia = Math.abs(prefixo - sufixo);
    if (sufixo <= porLinha && distancia < diferenca) {
      diferenca = distancia;
      equilibrada = i;
    }
  }
  return equilibrada > 0 ? equilibrada : gulosa;
}

const FORMATO_ESTILO =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

function cabecalho(opcoes: OpcoesLegenda, altura: number, estilos: string[]): string[] {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${opcoes.largura}`,
    `PlayResY: ${altura}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    FORMATO_ESTILO,
    ...estilos,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
}

/** Texto de um bloco com a mesma quebra de linha usada no vídeo (sem karaokê). */
function textoComQuebra(bloco: BlocoLegenda, porLinha: number): string {
  const quebra = indiceDaQuebra(bloco.palavras, porLinha);
  return bloco.palavras
    .map((palavra, i) => (i === quebra ? '\\N' : i > 0 ? ' ' : '') + escaparAss(palavra.texto))
    .join('');
}

/** Medidas reais do texto renderizado pelo libass, relativas ao ponto de ancoragem. */
export interface MedidaLegenda {
  largura: number;
  topo: number;
  base: number;
}

/** Altura de cada faixa na imagem de medição (espaço para até duas linhas). */
export function passoDeMedicao(opcoes: OpcoesLegenda): number {
  return Math.round(opcoes.fonte * 3.2);
}

/**
 * ASS auxiliar para medir os textos: cada bloco em uma faixa, branco no preto.
 * O FFmpeg renderiza um quadro e as posições reais são lidas em `parsearMedicoes`.
 */
export function assDeMedicao(
  blocos: BlocoLegenda[],
  opcoes: OpcoesLegenda,
  passo: number,
): { ass: string; altura: number } {
  // Altura par evita problemas no conversor do FFmpeg.
  const bruto = Math.max(passo, blocos.length * passo);
  const altura = bruto + (bruto % 2);
  const linhas = blocos.map((bloco, i) => {
    const ancora = i * passo + Math.round(passo * 0.85);
    return (
      `Dialogue: 0,0:00:00.00,0:10:00.00,Medida,,0,0,0,,` +
      `{\\an2\\pos(${Math.round(opcoes.largura / 2)},${ancora})}${textoComQuebra(bloco, opcoes.porLinha)}`
    );
  });
  const estilo = `Style: Medida,Noto Sans,${opcoes.fonte},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,2,0,0,0,1`;
  return { ass: [...cabecalho(opcoes, altura, [estilo]), ...linhas].join('\n') + '\n', altura };
}

/** Lê a imagem cinza (rawvideo) e devolve a caixa de cada texto por faixa. */
export function parsearMedicoes(
  quadro: Buffer,
  largura: number,
  altura: number,
  passo: number,
  quantidade: number,
  fonte = 0,
): MedidaLegenda[] {
  const medidas: MedidaLegenda[] = [];
  for (let i = 0; i < quantidade; i++) {
    const ancora = i * passo + Math.round(passo * 0.85);
    const inicio = i * passo;
    const fim = Math.min(altura, (i + 1) * passo);
    let minX = largura;
    let maxX = -1;
    let minY = altura;
    let maxY = -1;
    for (let y = inicio; y < fim; y++) {
      const base = y * largura;
      for (let x = 0; x < largura; x++) {
        if (quadro[base + x] > 50) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    // Sem pixels (texto vazio ou fora da faixa): usa uma caixa estimada para não
    // desalinhar as medidas dos próximos blocos.
    if (maxX < 0) {
      const alturaFonte = fonte || Math.round(passo / 3.2);
      medidas.push({ largura: alturaFonte * 6, topo: -alturaFonte, base: Math.round(alturaFonte * 0.25) });
      continue;
    }
    medidas.push({ largura: maxX - minX + 1, topo: minY - ancora, base: maxY - ancora });
  }
  return medidas;
}

/** Caixa arredondada desenhada como vetor (libass), atrás do texto. */
function desenhoDaCaixa(largura: number, altura: number, raio: number): string {
  const w = Math.max(2, Math.round(largura));
  const h = Math.max(2, Math.round(altura));
  const r = Math.max(0, Math.min(Math.round(raio), Math.floor(w / 2), Math.floor(h / 2)));
  const c = Math.round(r * 0.45);
  return (
    `m ${r} 0 l ${w - r} 0 ` +
    `b ${w - c} 0 ${w} ${c} ${w} ${r} ` +
    `l ${w} ${h - r} ` +
    `b ${w} ${h - c} ${w - c} ${h} ${w - r} ${h} ` +
    `l ${r} ${h} ` +
    `b ${c} ${h} 0 ${h - c} 0 ${h - r} ` +
    `l 0 ${r} ` +
    `b 0 ${c} ${c} 0 ${r} 0`
  );
}

/**
 * Gera o arquivo ASS usado no FFmpeg: caixa escura arredondada atrás do texto, fonte
 * em negrito e cada palavra destacada em lilás conforme é falada (karaokê).
 * Sem medições, cai no modo simples (uma caixa por linha) como reserva.
 */
export function assDeLegendas(
  blocos: BlocoLegenda[],
  opcoes: OpcoesLegenda,
  medidas?: MedidaLegenda[],
): string {
  const comCaixa = !!medidas && medidas.length === blocos.length;
  const estiloLegenda = comCaixa
    ? `Style: Legenda,Noto Sans,${opcoes.fonte},&H00FFA6C6,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,2,${opcoes.margemH},${opcoes.margemH},${opcoes.margemV},1`
    : // Reserva: caixa do próprio libass, uma por linha.
      `Style: Legenda,Noto Sans,${opcoes.fonte},&H00FFA6C6,&H00FFFFFF,&H55000000,&H55000000,-1,0,0,0,100,100,0,0,3,${Math.max(6, Math.round(opcoes.fonte * 0.3))},0,2,${opcoes.margemH},${opcoes.margemH},${opcoes.margemV},1`;
  const estilos = [
    estiloLegenda,
    `Style: Caixa,Noto Sans,${opcoes.fonte},&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
  ];

  const padX = Math.max(8, Math.round(opcoes.fonte * 0.45));
  const padY = Math.max(4, Math.round(opcoes.fonte * 0.2));
  const raio = Math.max(4, Math.round(opcoes.fonte * 0.25));
  const ancoraY = opcoes.altura - opcoes.margemV;
  const falas: string[] = [];

  blocos.forEach((bloco, indice) => {
    const quebra = indiceDaQuebra(bloco.palavras, opcoes.porLinha);
    let texto = '';
    bloco.palavras.forEach((palavra, i) => {
      const duracao = Math.max(1, Math.round((palavra.fimMs - palavra.inicioMs) / 10));
      if (i === quebra) {
        texto += '\\N';
      } else if (i > 0) {
        texto += ' ';
      }
      texto += `{\\kf${duracao}}${escaparAss(palavra.texto)}`;
    });

    if (comCaixa) {
      const medida = medidas![indice];
      const largura = medida.largura + 2 * padX;
      const alturaCaixa = medida.base - medida.topo + 2 * padY;
      const x = Math.round((opcoes.largura - largura) / 2);
      const y = Math.round(ancoraY + medida.topo - padY);
      falas.push(
        `Dialogue: 0,${tempoAss(bloco.inicioMs)},${tempoAss(bloco.fimMs)},Caixa,,0,0,0,,` +
          `{\\an7\\pos(${x},${y})\\p1\\1a&H55&}${desenhoDaCaixa(largura, alturaCaixa, raio)}`,
      );
    }

    falas.push(
      `Dialogue: 1,${tempoAss(bloco.inicioMs)},${tempoAss(bloco.fimMs)},Legenda,,0,0,0,,${texto}`,
    );
  });

  return [...cabecalho(opcoes, opcoes.altura, estilos), ...falas].join('\n') + '\n';
}

function tempoSrt(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = String(Math.floor(t / 3600000)).padStart(2, '0');
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(t % 1000).padStart(3, '0')}`;
}

/** Mesmos blocos e tempos do vídeo final, em SRT para quem quiser editar fora do app. */
export function srtDeLegendas(blocos: BlocoLegenda[]): string {
  return blocos
    .map(
      (bloco, i) =>
        `${i + 1}\n${tempoSrt(bloco.inicioMs)} --> ${tempoSrt(bloco.fimMs)}\n` +
        `${bloco.palavras.map((p) => p.texto).join(' ')}\n`,
    )
    .join('\n');
}

function caminhoDoFiltro(caminho: string): string {
  return caminho.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Queima as legendas ASS no vídeo. A caixa escura faz parte do próprio ASS,
 * então a imagem não é desfocada.
 */
export function filtroLegendas(ass: string): string {
  return `${filtroAss(ass)},format=yuv420p`;
}

/** Filtro que só aplica o arquivo ASS (também usado na medição dos textos). */
export function filtroAss(ass: string): string {
  return `ass='${caminhoDoFiltro(ass)}'`;
}
