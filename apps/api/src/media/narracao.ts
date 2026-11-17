/**
 * Prepara o texto do roteiro para o TTS (Fish Audio S2).
 *
 * O modelo lê o texto literalmente, então a naturalidade vem da pontuação e de
 * marcações em colchetes:
 * - `[calm]` no início deixa o tom de conversa, sem pressa;
 * - `[break]` depois de vírgulas e no fim das frases cria pausas curtas, como
 *   o respiro de quem está contando uma história.
 *
 * As marcações ficam só no áudio: as legendas continuam usando o texto limpo
 * do roteiro, sem colchetes.
 *
 * `pronuncia` (opcional) é um dicionário em linhas "termo=como falar", aplicado
 * antes das pausas para acertar nomes próprios, siglas e nomes científicos.
 */
export function textoParaNarracao(texto: string, pronuncia = ''): string {
  const base = aplicarPronuncia(texto.replace(/\s+/g, ' ').trim(), pronuncia);
  if (!base) return base;

  const comPausas = base
    // Vírgula, ponto e vírgula e dois-pontos: respiro curto. Exige espaço
    // depois para não quebrar números decimais (3,5) nem horários.
    .replace(/([,;:])(["'”’)\]]?)(\s+)/g, '$1$2 [break] ')
    // Fim de frase (ponto, exclamação, interrogação, reticências).
    .replace(/([.!?…])(["'”’)\]]?)(\s+)/g, '$1$2 [break] ');

  return `[calm] ${comPausas}`.replace(/\s+/g, ' ').trim();
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Substitui termos pelos sons informados ("IBGE=ibige"), respeitando palavras inteiras. */
export function aplicarPronuncia(texto: string, pronuncia: string): string {
  if (!pronuncia.trim()) return texto;
  let resultado = texto;
  for (const linha of pronuncia.split(/\r?\n/)) {
    const [termoBruto, ...resto] = linha.split('=');
    const termo = termoBruto?.trim();
    const leitura = resto.join('=').trim();
    if (!termo || !leitura) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(termo)}(?![\\p{L}\\p{N}])`, 'giu');
    resultado = resultado.replace(re, leitura);
  }
  return resultado;
}

/** Normalização simples de números e datas para narração (além do `normalize` do TTS). */
export function textoFalado(texto: string): string {
  return texto
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, '$1 de $2 de $3')
    .replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1 horas e $2 minutos')
    .replace(/\b(\d{1,2})h\b/gi, '$1 horas')
    .replace(/(\d),(\d)/g, '$1 vírgula $2');
}
