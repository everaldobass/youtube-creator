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
 */
export function textoParaNarracao(texto: string): string {
  const base = texto.replace(/\s+/g, ' ').trim();
  if (!base) return base;

  const comPausas = base
    // Vírgula, ponto e vírgula e dois-pontos: respiro curto. Exige espaço
    // depois para não quebrar números decimais (3,5) nem horários.
    .replace(/([,;:])(["'”’)\]]?)(\s+)/g, '$1$2 [break] ')
    // Fim de frase (ponto, exclamação, interrogação, reticências).
    .replace(/([.!?…])(["'”’)\]]?)(\s+)/g, '$1$2 [break] ');

  return `[calm] ${comPausas}`.replace(/\s+/g, ' ').trim();
}
