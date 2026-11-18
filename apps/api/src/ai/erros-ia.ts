/**
 * Tradução de erros crus das APIs de IA (em inglês, com URLs e JSON) para
 * frases curtas em PT-BR, entendíveis pelo usuário final. O detalhe técnico
 * completo continua no log do servidor.
 */

/** Dica padrão quando a geração falha por motivo de configuração. */
export const DICA_CONFIGURACOES = 'Confira as chaves e os modelos em Configurações.';

export function amigavel(bruto: string): string {
  const texto = bruto
    .replace(/^A geração falhou \([^)]*\):\s*/i, '')
    .replace(/^A geração falhou:\s*/i, '')
    .replace(/\s*—\s*cota\/limite do plano excedido\.?\s*$/i, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = texto.toLowerCase();

  if (/no credits|quota|exceeded your current|insufficient credit|billing|credit balance/.test(m))
    return 'a cota da conta foi excedida (é preciso adicionar créditos).';
  if (
    /invalid.{0,15}api.?key|api key not valid|incorrect api key|invalid x-api-key|unauthorized|authentication_error|missing api key/.test(
      m,
    )
  )
    return 'a chave de API não é válida.';
  if (
    /model.{0,40}(does not exist|not found|not available)|model_not_found|do not have access|invalid model|unknown model/.test(
      m,
    )
  )
    return 'o modelo informado não existe ou esta conta não tem acesso a ele.';
  if (/rate ?limit|too many requests|\b429\b/.test(m))
    return 'muitas requisições em pouco tempo (limite do plano atingido).';
  if (/permission|forbidden|not allowed|\b403\b/.test(m))
    return 'esta conta não tem permissão para usar o modelo escolhido.';
  if (/safety|blocked|prohibited|blockedreason|recusado/.test(m))
    return 'a requisição foi bloqueada pelas regras de segurança do modelo.';
  if (/timed out|timeout|tempo esgotado/.test(m)) return 'o modelo demorou demais para responder.';
  if (/fetch failed|econnrefused|enotfound|network|socket|dns/.test(m))
    return 'não foi possível conectar à API (verifique a conexão).';
  if (/\b5[0-9]{2}\b|overloaded|unavailable|internal error/.test(m))
    return 'a API do provedor está indisponível no momento.';
  // JSON cru (schema/validation) não diz nada para o usuário final.
  if (/^[{[]/.test(texto)) return 'o provedor devolveu uma resposta em formato inesperado.';

  // Sem padrão reconhecido: devolve um trecho curto, sem URL nem JSON longo.
  const curto = texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
  return curto || 'falha desconhecida.';
}
