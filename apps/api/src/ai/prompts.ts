import { Formato, Idioma } from '@yt/shared';

/** Nome do idioma usado nas instruções de geração de texto. */
export function nomeDoIdioma(idioma: Idioma): string {
  return idioma === 'en' ? 'inglês (English)' : 'português do Brasil';
}

export function promptTitulos(p: {
  tema: string;
  publico: string;
  ideia: string;
  idioma: Idioma;
}): string {
  return `Você é especialista em títulos para YouTube.
Idioma do vídeo: ${nomeDoIdioma(p.idioma)}. Escreva os títulos nesse idioma.
Tema: ${p.tema || 'não informado'}. Público: ${p.publico || 'não informado'}. Ideia do usuário: ${p.ideia || 'não informada'}.
Gere 10 títulos de até 70 caracteres, variando o estilo (pergunta, lista, curiosidade, benefício, contraste). Não prometa o que o vídeo não entrega.
Dê a cada título uma nota de 0 a 10 que combine clareza e curiosidade.
Responda somente em JSON: [{"texto": string, "estilo": string, "nota": number de 0 a 10}]`;
}

function regrasFormato(formato: Formato): string {
  return formato === 'shorts'
    ? 'Divida em cenas de 3 a 8 segundos (Shorts, vertical). A primeira cena é um gancho forte nos 3 primeiros segundos; a última convida a se inscrever.'
    : 'Divida em cenas de 10 a 25 segundos. A primeira cena é um gancho; a última convida a se inscrever.';
}

export function promptRoteiro(p: {
  titulo: string;
  duracaoMinutos: number;
  formato: Formato;
  tema: string;
  publico: string;
  idioma: Idioma;
}): string {
  return `Escreva o roteiro do vídeo "${p.titulo}" com duração total de ${p.duracaoMinutos} minuto(s), em ${nomeDoIdioma(p.idioma)}, em tom de conversa, suave e bem explicado.
Tema: ${p.tema || 'o do título'}. Público: ${p.publico || 'geral'}.
${regrasFormato(p.formato)}
A soma das durações das cenas deve ficar próxima de ${p.duracaoMinutos * 60} segundos.
O texto narrado deve ser falado, com frases curtas e sem emojis.
A descrição visual diz o que aparece na tela e deve nomear as pessoas, povos ou personagens citados na narração e o que eles estão fazendo (ex.: "africanos fugindo para a mata" em vez de apenas "floresta"). Sem texto nem letras na imagem.
Responda somente em JSON: [{"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string}]`;
}

export function promptRefazerCena(p: {
  titulo: string;
  formato: Formato;
  idioma: Idioma;
  numero: number;
  total: number;
  anterior?: string;
  atual: string;
  proxima?: string;
}): string {
  const [min, max] = p.formato === 'shorts' ? [3, 8] : [10, 25];
  return `Você está ajustando o roteiro do vídeo "${p.titulo}" em ${nomeDoIdioma(p.idioma)}, em tom de conversa, suave e bem explicado.
Reescreva APENAS a cena ${p.numero} de ${p.total}, mantendo a sequência natural com as cenas vizinhas.
Cena anterior: ${p.anterior ?? '(não há, esta é a primeira)'}
Cena atual (reescrever, com outra abordagem): ${p.atual || '(vazia)'}
Próxima cena: ${p.proxima ?? '(não há, esta é a última)'}
A cena deve durar de ${min} a ${max} segundos, ter frases curtas e nenhum emoji. A descrição visual deve nomear as pessoas, povos ou personagens da narração e a ação deles, e não pode pedir texto na imagem.
Responda somente em JSON: {"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string}`;
}

// ---------- Fases 2 a 5 ----------
export function promptImagem(p: {
  descricaoVisual: string;
  textoNarrado: string;
  estiloVisual: string;
  proporcao: string;
}): string {
  const descricao = p.descricaoVisual.trim().replace(/[.!?…\s]+$/, '');
  const narracao = p.textoNarrado.trim();
  return `Imagem 3D em ${p.proporcao} que ilustra fielmente a cena narrada abaixo.

Narração da cena: "${narracao}"

Descrição visual da cena: ${descricao}

Regras de fidelidade:
- Retrate as pessoas, povos ou personagens de quem a narração fala e a ação que eles estão fazendo (quem, o que, onde).
- Se a narração cita um povo ou grupo (por exemplo, africanos, quilombolas, indígenas, trabalhadores), mostre esse povo como protagonista da cena, com vestimentas, objetos e ambiente coerentes com a época e o contexto histórico. Nunca troque as pessoas por uma paisagem vazia.
- Represente com respeito e precisão histórica, evitando estereótipos, caricaturas e símbolos ofensivos.
- A cena precisa fazer sentido mesmo sem o texto da narração.

Estilo fixo do vídeo: ${p.estiloVisual}
Sem texto, letras ou logotipos na imagem. Composição limpa, com o assunto principal no centro.`;
}

export function promptTags(p: { titulo: string; roteiro: string; idioma: Idioma }): string {
  return `Gere de 15 a 25 tags para o vídeo "${p.titulo}" com base neste roteiro: ${p.roteiro}.
As tags devem estar em ${nomeDoIdioma(p.idioma)}, ordenadas da mais ampla para a mais específica. O total, contando as vírgulas entre elas, não pode passar de 500 caracteres.
Responda somente em JSON: ["tag 1", "tag 2"]`;
}

export function promptTextosThumb(p: { titulo: string; roteiro: string; idioma: Idioma }): string {
  return `Crie 2 textos curtos e bem diferentes para thumbnails do vídeo de YouTube "${p.titulo}". Cada texto tem no máximo 4 palavras, em ${nomeDoIdioma(p.idioma)}, chama a atenção sem prometer o que o vídeo não entrega.
Contexto do vídeo: ${p.roteiro}
Responda somente em JSON: {"textos": ["texto 1", "texto 2"]}`;
}

export function promptThumbnail(p: { titulo: string; n: number; textoCurto: string }): string {
  return `Thumbnail de YouTube em 16:9, 1280x720, para o vídeo "${p.titulo}". Variação ${p.n} de 2, com enquadramento diferente da outra variação.
Um único assunto principal em destaque, fundo simples, alto contraste, cores vibrantes e texto grande e legível com no máximo 4 palavras: "${p.textoCurto}".
Aparência profissional e chamativa, sem poluição visual, sem logotipos, sem marca d'água e sem molduras.`;
}

export function promptDescricao(p: {
  titulo: string;
  roteiro: string;
  idioma: Idioma;
  cenas: { tempo: string; resumo: string }[];
}): string {
  const tempos = p.cenas.map((c) => `${c.tempo} - ${c.resumo}`).join('\n');
  return `Escreva a descrição do vídeo "${p.titulo}" em ${nomeDoIdioma(p.idioma)}.
Contexto do vídeo: ${p.roteiro}
Cenas e o tempo em que cada uma começa:
${tempos}

Regras:
- "gancho": exatamente 2 linhas curtas que despertam curiosidade.
- "resumo": um parágrafo resumindo o conteúdo.
- "capitulos": de 5 a 12 capítulos. Use SOMENTE tempos da lista de cenas acima, escritos exatamente como aparecem; o primeiro tem de ser 00:00 e dois capítulos seguidos precisam ter pelo menos 10 segundos de diferença. Títulos curtos.
- "chamadaInscricao": uma frase convidando a se inscrever no canal.
- "hashtags": de 3 a 5, começando com #.
Responda somente em JSON: {"gancho": string, "resumo": string, "chamadaInscricao": string, "hashtags": [string], "capitulos": [{"tempo": string, "titulo": string}]}`;
}
