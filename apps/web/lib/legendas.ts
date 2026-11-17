const FIM_DE_FRASE = /[.!?…]["'”’)\]]?$/;
const PAUSA_CURTA = /[,;:—–-]["'”’)\]]?$/;

function silabas(palavra: string): number {
  const limpo = palavra.toLowerCase().replace(/[^a-záàâãéèêëíìîïóòôõöúùûüçñ]/g, '');
  const grupos = limpo.match(/[aeiouyáàâãéèêëíìîïóòôõöúùûü]+/g);
  return Math.max(1, grupos?.length ?? 1);
}

function peso(palavra: string): number {
  const base = silabas(palavra);
  if (FIM_DE_FRASE.test(palavra)) return base + 2.4;
  if (PAUSA_CURTA.test(palavra)) return base + 1.3;
  return base;
}

export interface PalavraDaPrevia {
  texto: string;
  peso: number;
}

export function palavrasDaPrevia(texto: string): PalavraDaPrevia[] {
  return texto
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => ({ texto: t, peso: peso(t) }));
}

/** Quantas palavras já foram faladas para um progresso de 0 a 1 (mesma conta do MP4). */
export function palavrasFaladas(palavras: PalavraDaPrevia[], progresso: number): number {
  const total = palavras.reduce((soma, p) => soma + p.peso, 0);
  if (total <= 0) return 0;
  const alvo = Math.min(1, Math.max(0, progresso)) * total;
  let acumulado = 0;
  for (let i = 0; i < palavras.length; i++) {
    acumulado += palavras[i].peso;
    if (acumulado > alvo) return i;
  }
  return palavras.length;
}
