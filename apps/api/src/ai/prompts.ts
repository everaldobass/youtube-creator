import {
  Formato,
  IDIOMA_INFO,
  INTERVALO_CAPITULO_SEGUNDOS,
  Idioma,
  LIMITES_FORMATO,
  MAX_CARACTERES_TAGS,
  MAX_PALAVRAS_THUMB,
  MAX_TAGS,
  MIN_TAGS,
  formatarTempo,
} from '@yt/shared';
import { z } from 'zod';

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
Considere várias opções mentalmente e escolha as 5 melhores — as que mais despertam curiosidade sem entregar o vídeo inteiro.
Cada título deve ter até 70 caracteres, variando o estilo (pergunta, lista, curiosidade, benefício, contraste). Não prometa o que o vídeo não entrega e não repita a mesma ideia em dois títulos.
Dê a cada título uma nota de 0 a 10 que combine clareza e curiosidade.
Responda somente em JSON com exatamente 5 itens: [{"texto": string, "estilo": string, "nota": number de 0 a 10}]`;
}

function regrasFormato(formato: Formato): string {
  return formato === 'shorts'
    ? 'Divida em cenas de 3 a 8 segundos (Shorts, vertical). A primeira cena é um gancho forte nos 3 primeiros segundos.'
    : 'Divida em cenas de 10 a 25 segundos. A primeira cena é um gancho.';
}

/** Ângulos de abertura sorteados a cada geração para o roteiro não repetir a mesma entrada. */
const ABERTURAS = [
  'uma pergunta provocativa que só o vídeo responde',
  'um fato surpreendente ou um número inesperado sobre o tema',
  'uma cena concreta do cotidiano do público',
  'um mito ou uma ideia errada comum, desmontado logo de cara',
  'uma promessa específica e mensurável do que será explicado',
  'uma história curta, contada em primeira pessoa',
  'um contraste entre o que as pessoas imaginam e o que realmente acontece',
  'um detalhe pouco conhecido que muda a forma de enxergar o assunto',
];

function aberturaAleatoria(): string {
  return ABERTURAS[Math.floor(Math.random() * ABERTURAS.length)];
}

export function promptRoteiro(p: {
  titulo: string;
  duracaoMinutos: number;
  formato: Formato;
  tema: string;
  publico: string;
  idioma: Idioma;
  blocoSegundos: number;
}): string {
  return `Escreva o PRIMEIRO BLOCO do roteiro de um DOCUMENTÁRIO para o vídeo "${p.titulo}", em ${nomeDoIdioma(p.idioma)}, em tom de conversa, suave e bem explicado.
O vídeo completo terá ${p.duracaoMinutos} minuto(s) (${p.duracaoMinutos * 60} s). Este primeiro bloco será continuado em blocos seguintes: escreva apenas a abertura, a contextualização e o início do desenvolvimento, somando aproximadamente ${p.blocoSegundos} segundos.
Tema e contexto: ${p.tema || 'o do título'}. Público: ${p.publico || 'geral'}.
${regrasFormato(p.formato)}
A soma das durações deste bloco deve ficar próxima de ${p.blocoSegundos} segundos.

ESTRUTURA DOCUMENTAL DO VÍDEO COMPLETO (neste bloco, faça apenas os itens 1 a 3):
1. Abertura com uma pergunta instigante ou um fato surpreendente e específico.
2. Contextualização do assunto (onde, quando, por que importa).
3. Desenvolvimento organizado por tópicos, cada tópico com explicações detalhadas.
4. Curiosidades relevantes, sempre verificáveis.
5. Informações históricas, geográficas ou científicas que possam ser conferidas.
6. Transições naturais entre os assuntos (nada de "agora vamos falar de...").

FECHAMENTO — NÃO ESCREVA NESTE BLOCO:
- Este NÃO é o fim do vídeo. A conclusão e a chamada para inscrição são escritas separadamente, na última etapa da geração.
- NÃO escreva conclusão, despedida, agradecimento nem chamada para inscrição. Evite expressões como "inscreva-se no canal", "se inscrever", "deixe seu like", "até o próximo vídeo".
- Se as cenas acabarem antes da duração do bloco, pare no meio do desenvolvimento e deixe o assunto em aberto: o próximo bloco continua de onde você parou.

QUALIDADE EDITORIAL:
- Não repita ideias, dados ou frases entre cenas.
- Evite frases genéricas ("é importante ressaltar", "como todos sabem") e introduções longas.
- NÃO invente informações, números, datas, nomes ou citações para aumentar a duração.
- Quando um dado for incerto, escreva de forma compatível com o que é comprovado.
- Linguagem natural, própria para narração: frases curtas, sem emojis e sem marcações.
- Mantenha uma identidade documental própria e sóbria.
- Ajuste a estrutura narrativa ao assunto (história, ciência, geografia, biografia etc.).

REFERÊNCIAS:
- No campo "fontes", liste de 3 a 8 referências reais que sustentem as informações (IBGE, universidades, institutos de pesquisa, museus, arquivos históricos, publicações científicas, órgãos governamentais).
- NUNCA invente títulos, autores ou links. Se não tiver certeza de uma fonte, deixe o campo "fontes" com menos itens ou vazio.
- Não use URLs inventadas.

DESCRIÇÃO VISUAL:
- Diz o que aparece na tela e nomeia as pessoas, povos ou personagens citados e o que estão fazendo (ex.: "africanos fugindo para a mata" em vez de apenas "floresta").
- Sem texto nem letras na imagem.
- "movimentoCamera" deve ser um destes: "zoom-in", "zoom-out", "panoramica-esquerda", "panoramica-direita", "panoramica-cima", "panoramica-baixo", "nenhum". Varie e evite movimentos exagerados.

Abertura desta geração (varie sempre): ${aberturaAleatoria()}.
Regras obrigatórias para a primeira cena:
- Escreva uma abertura única e sob medida para este tema, sem saudações genéricas.
- Nunca comece com "Olá pessoal", "Sejam bem-vindos", "Bem-vindos ao canal", "No vídeo de hoje", "Hoje vamos falar sobre", "Neste vídeo" ou fórmulas parecidas.
- Se este roteiro for gerado de novo, a primeira frase precisa ser diferente da versão anterior.

Responda somente em JSON:
{"cenas": [{"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string, "movimentoCamera": string}], "fontes": [{"titulo": string, "autor": string, "ano": string, "url": string}]}`;
}

/**
 * Continuação do roteiro, usada quando a primeira geração não chega a 90% da
 * duração alvo. Pede só cenas novas, retomando da última, sem repetir o que
 * já foi escrito.
 */
export function promptContinuarRoteiro(p: {
  titulo: string;
  duracaoMinutos: number;
  formato: Formato;
  tema: string;
  publico: string;
  idioma: Idioma;
  totalSegundos: number;
  alvoSegundos: number;
  blocoSegundos: number;
  cenas: { numero: number; textoNarrado: string; duracaoSegundos: number }[];
}): string {
  const [min, max] = LIMITES_FORMATO[p.formato].cena;
  const quantidade = Math.max(3, Math.round(p.blocoSegundos / ((min + max) / 2)));
  const jaEscrito = p.cenas
    .map(
      (c) =>
        `${c.numero}. (${c.duracaoSegundos} s) ${c.textoNarrado.replace(/\s+/g, ' ').slice(0, 110)}`,
    )
    .join('\n');
  const ultima = p.cenas[p.cenas.length - 1];
  return `Continue o roteiro de um DOCUMENTÁRIO para o vídeo "${p.titulo}", em ${nomeDoIdioma(p.idioma)}, em tom de conversa, suave e bem explicado.
O vídeo tem duração alvo de ${p.duracaoMinutos} minuto(s) (${p.alvoSegundos} s). Já foram escritas ${p.cenas.length} cena(s), somando ${formatarTempo(p.totalSegundos)}.
Tema e contexto: ${p.tema || 'o do título'}. Público: ${p.publico || 'geral'}.

O que já foi narrado — NÃO repita nenhuma destas ideias, dados, exemplos ou frases:
${jaEscrito}

Última cena escrita (continue naturalmente a partir dela): "${ultima?.textoNarrado ?? ''}"

Agora acrescente APENAS cenas novas, na sequência, somando aproximadamente ${p.blocoSegundos} segundos:
- Cerca de ${quantidade} cenas, cada uma com ${min} a ${max} segundos.
- Este NÃO é o último bloco: avance no desenvolvimento e NÃO escreva conclusão, despedida nem chamada para inscrição ("inscreva-se", "se inscrever", "deixe seu like", "até o próximo vídeo"). O fechamento é escrito separadamente, ao final.
- Não escreva abertura nem saudação: o gancho já foi feito na primeira cena.
- Mantenha a estrutura documental (contexto, desenvolvimento por tópicos, curiosidades verificáveis, transições naturais).
- NÃO invente informações, números, datas, nomes, citações ou fontes para aumentar a duração.
- Linguagem natural, própria para narração: frases curtas, sem emojis e sem marcações.
- "movimentoCamera" deve ser um destes: "zoom-in", "zoom-out", "panoramica-esquerda", "panoramica-direita", "panoramica-cima", "panoramica-baixo", "nenhum". Varie e evite movimentos exagerados.
- A descrição visual diz o que aparece na tela, nomeia as pessoas, povos ou personagens e a ação deles, sem texto nem letras na imagem.

Responda somente em JSON, com as cenas NOVAS (não repita as anteriores):
{"cenas": [{"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string, "movimentoCamera": string}], "fontes": [{"titulo": string, "autor": string, "ano": string, "url": string}]}`;
}

/**
 * Fechamento do roteiro. É sempre a última chamada da geração: retoma os
 * pontos principais e só aqui a chamada para inscrição é permitida. Assim o
 * encerramento nunca aparece no meio do vídeo.
 */
export function promptFechamentoRoteiro(p: {
  titulo: string;
  formato: Formato;
  tema: string;
  publico: string;
  idioma: Idioma;
  totalSegundos: number;
  alvoSegundos: number;
  blocoSegundos: number;
  cenas: { numero: number; textoNarrado: string; duracaoSegundos: number }[];
}): string {
  const [min, max] = LIMITES_FORMATO[p.formato].cena;
  const finais = p.cenas
    .slice(-8)
    .map(
      (c) =>
        `${c.numero}. (${c.duracaoSegundos} s) ${c.textoNarrado.replace(/\s+/g, ' ').slice(0, 110)}`,
    )
    .join('\n');
  const ultima = p.cenas[p.cenas.length - 1];
  return `Você vai escrever o FECHAMENTO do roteiro de um DOCUMENTÁRIO para o vídeo "${p.titulo}", em ${nomeDoIdioma(p.idioma)}, em tom de conversa, suave e bem explicado.
O vídeo tem duração alvo de ${formatarTempo(p.alvoSegundos)} e já foram escritas ${p.cenas.length} cena(s), somando ${formatarTempo(p.totalSegundos)}.
Tema e contexto: ${p.tema || 'o do título'}. Público: ${p.publico || 'geral'}.

O que já foi narrado no final — NÃO repita ideias, dados, exemplos ou frases:
${finais}

Última cena escrita (continue naturalmente a partir dela): "${ultima?.textoNarrado ?? ''}"

Agora escreva as cenas FINAIS, somando aproximadamente ${p.blocoSegundos} segundos:
- 1 ou 2 cenas, cada uma com ${min} a ${max} segundos.
- Feche o documentário retomando os pontos principais, sem repetir frases inteiras.
- A última cena termina convidando o espectador a se inscrever no canal.
- Não escreva abertura nem saudação: o gancho já foi feito na primeira cena.
- NÃO invente informações, números, datas, nomes, citações ou fontes.
- Linguagem natural, própria para narração: frases curtas, sem emojis e sem marcações.
- "movimentoCamera" deve ser um destes: "zoom-in", "zoom-out", "panoramica-esquerda", "panoramica-direita", "panoramica-cima", "panoramica-baixo", "nenhum". Varie e evite movimentos exagerados.
- A descrição visual diz o que aparece na tela, nomeia as pessoas, povos ou personagens e a ação deles, sem texto nem letras na imagem.

Responda somente em JSON, com as cenas NOVAS (não repita as anteriores):
{"cenas": [{"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string, "movimentoCamera": string}], "fontes": [{"titulo": string, "autor": string, "ano": string, "url": string}]}`;
}

/**
 * Prompt em Markdown para gerar o roteiro em uma IA externa e importar de
 * volta no YouStudio. Traz o briefing do projeto e o esqueleto no mesmo
 * padrão do arquivo exportado (`## Cena N`, `**Texto narrado**`,
 * `**Descrição visual**`).
 */
export function promptRoteiroExterno(p: {
  titulo: string;
  tema: string;
  publico: string;
  formato: Formato;
  duracaoMinutos: number;
  idioma: Idioma;
}): string {
  const [min, max] = LIMITES_FORMATO[p.formato].cena;
  const totalSegundos = p.duracaoMinutos * 60;
  // Duração média arredondada (ex.: 15 min → 50 cenas de 18 s).
  const media = Math.round((min + max) / 2);
  const cenas = Math.max(1, Math.min(400, Math.round(totalSegundos / media)));
  // Ajuste fino para a soma bater perto da duração alvo.
  const porCena = Math.round(totalSegundos / cenas);
  const formato = `${p.formato === 'shorts' ? 'Shorts' : 'Vídeo longo'} (${LIMITES_FORMATO[p.formato].proporcao})`;
  const duracao = formatarTempo(totalSegundos);
  const idioma = IDIOMA_INFO[p.idioma].rotulo;

  const blocosCena: string[] = [];
  for (let i = 1; i <= cenas; i++) {
    const destaque = i === 1 ? ' (gancho)' : i === cenas && cenas > 1 ? ' (chamada para ação)' : '';
    blocosCena.push(
      `## Cena ${i}${destaque}`,
      '',
      `- Duração: ${porCena} s`,
      '- Narração: pendente',
      '- Imagem: pendente',
      '',
      '**Texto narrado**',
      '',
      '**Descrição visual**',
      '',
      '---',
      '',
    );
  }

  return `# Prompt de roteiro — ${p.titulo}

Copie este arquivo inteiro e cole na IA de sua preferência (ChatGPT, Gemini, Claude…).
Depois salve a resposta como um arquivo **.md** e importe em *Roteiro e retenção → Importar .md*.

## Briefing do vídeo

- **Vídeo:** ${p.titulo}
- **Formato:** ${formato}
- **Idioma:** ${idioma} — escreva o roteiro inteiro nesse idioma.
- **Duração alvo:** ${duracao} (${totalSegundos} s), em cerca de ${cenas} cenas de ${min} a ${max} s cada.
- **Público:** ${p.publico || 'público geral'}
- **Tema e contexto:** ${p.tema || 'o do título'}

## Como responder

1. Responda **somente** com o Markdown que começa no separador \`---\` abaixo, mantendo a tabela e todos os cabeçalhos exatamente como estão.
2. Preencha o bloco **Texto narrado** e o bloco **Descrição visual** de todas as cenas, sem deixar nenhum vazio.
3. Numere as cenas em ordem (\`## Cena 1\`, \`## Cena 2\`, …), sem pular números. Acrescente mais cenas se precisar.
4. A soma das durações deve ficar próxima de ${totalSegundos} segundos; ajuste o valor de \`- Duração:\` em cada cena.
5. A primeira cena é o gancho: uma pergunta instigante, um fato surpreendente ou uma cena concreta — sem “Olá pessoal”, “No vídeo de hoje” ou fórmulas parecidas.
6. A última cena convida a se inscrever.
7. Não use JSON, emojis, marcações de negrito dentro da narração, nem listas dentro dos textos. Frases curtas, prontas para serem lidas em voz alta.
8. Não invente dados, números, datas, nomes ou citações. Na seção **Referências**, liste apenas fontes reais e verificáveis; se não houver, apague a seção inteira.
9. A descrição visual diz o que aparece na tela, nomeando as pessoas, povos ou personagens citados e o que estão fazendo. Não peça texto nem letras dentro da imagem.

## Estrutura documental

1. Abertura com pergunta instigante ou fato surpreendente e específico.
2. Contextualização do assunto (onde, quando, por que importa).
3. Desenvolvimento por tópicos, com explicações detalhadas.
4. Curiosidades relevantes e verificáveis.
5. Informações históricas, geográficas ou científicas que possam ser conferidas.
6. Transições naturais entre os assuntos (nada de “agora vamos falar de…”).
7. Conclusão que retoma os pontos principais sem repetir frases inteiras.

Não repita ideias, dados ou frases entre cenas. Evite frases genéricas (“é importante ressaltar”, “como todos sabem”) e introduções longas.

---

| | |
| --- | --- |
| Formato | ${formato} |
| Idioma | ${idioma} |
| Narração | ${duracao} em ${cenas} cenas |
| Duração alvo | ${duracao} |
| Revisão editorial | não revisado |

${blocosCena.join('\n')}\n## Referências

Se (e somente se) você citou fontes reais e verificáveis, liste aqui no formato:
\`1. **Título da fonte** — Autor (ano) — <https://link>\`
Caso contrário, apague esta seção inteira.
`;
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
Não invente dados, datas, nomes ou citações. Evite frases genéricas e repetições da cena anterior.
"movimentoCamera" deve ser um destes: "zoom-in", "zoom-out", "panoramica-esquerda", "panoramica-direita", "panoramica-cima", "panoramica-baixo", "nenhum".
${p.numero === 1 ? 'Esta é a cena de abertura: escreva uma primeira frase original e específica deste tema, sem saudações genéricas como "Olá pessoal" ou "No vídeo de hoje".' : ''}
Responda somente em JSON: {"textoNarrado": string, "duracaoSegundos": number, "descricaoVisual": string, "movimentoCamera": string}`;
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

export function promptTags(p: {
  titulo: string;
  tema: string;
  roteiro: string;
  idioma: Idioma;
}): string {
  return `Gere de ${MIN_TAGS} a ${MAX_TAGS} tags de SEO para o vídeo "${p.titulo}" com base neste roteiro: ${p.roteiro}
Tema e contexto: ${p.tema || 'o do título'}.
Escreva as tags em ${nomeDoIdioma(p.idioma)}.

Monte a lista nesta ordem, da mais ampla para a mais específica:
1. De 6 a 7 tags amplas: assunto principal, nicho e termos gerais que as pessoas digitam para encontrar o tema.
2. De 8 a 10 tags médias: subtemas, pessoas, lugares, empresas e conceitos citados no roteiro.
3. De 6 a 8 tags específicas (long tail): variações de busca e perguntas, como "como ...", "o que é ...", "... vale a pena", "... para iniciantes".

Regras obrigatórias:
- O total, contando as vírgulas entre as tags, NÃO pode passar de ${MAX_CARACTERES_TAGS} caracteres. Para caber de ${MIN_TAGS} a ${MAX_TAGS} tags, use tags curtas (em média até 18 caracteres).
- Inclua o termo principal do título em pelo menos uma tag.
- Varie sinônimos e formas de busca; não repita a mesma palavra ou expressão em várias tags.
- Use tags que descrevem realmente o conteúdo do roteiro; não invente pessoas, lugares ou assuntos que não aparecem nele.
- Não use "#", emojis, aspas, ponto final nem vírgula dentro da tag.
- Evite tags genéricas ou enganosas ("vídeo", "youtube", "canal", "grátis", "top 10") que não identificam este vídeo.

Responda somente em JSON: ["tag 1", "tag 2"]`;
}

export function promptTextosThumb(p: { titulo: string; roteiro: string; idioma: Idioma }): string {
  return `Crie 2 textos curtos e bem diferentes para thumbnails do vídeo de YouTube "${p.titulo}". Cada texto tem no máximo ${MAX_PALAVRAS_THUMB} palavras (cerca de 10), em ${nomeDoIdioma(p.idioma)}, chama a atenção sem prometer o que o vídeo não entrega.
Contexto do vídeo: ${p.roteiro}
Responda somente em JSON: {"textos": ["texto 1", "texto 2"]}`;
}

export function promptThumbnail(p: { titulo: string; n: number; textoCurto: string }): string {
  return `Thumbnail de YouTube em 16:9, 1280x720, para o vídeo "${p.titulo}". Variação ${p.n} de 2, com enquadramento diferente da outra variação.
Um único assunto principal em destaque, fundo simples, alto contraste, cores vibrantes e texto grande e legível com no máximo ${MAX_PALAVRAS_THUMB} palavras: "${p.textoCurto}".
Aparência profissional e chamativa, sem poluição visual, sem logotipos, sem marca d'água e sem molduras.`;
}

export function promptDescricao(p: {
  titulo: string;
  roteiro: string;
  idioma: Idioma;
  cenas: { tempo: string; resumo: string }[];
  ancoras: string[];
}): string {
  const tempos = p.cenas.map((c) => `${c.tempo} - ${c.resumo}`).join('\n');
  return `Escreva a descrição do vídeo "${p.titulo}" em ${nomeDoIdioma(p.idioma)}.
Contexto do vídeo: ${p.roteiro}
Cenas e o tempo em que cada uma começa:
${tempos}

Âncoras dos capítulos (a cada ~${Math.round(INTERVALO_CAPITULO_SEGUNDOS / 60)} minutos, cobrindo o vídeo do começo ao fim):
${p.ancoras.join(', ')}

Regras:
- "gancho": exatamente 2 linhas curtas que despertam curiosidade.
- "resumo": um parágrafo resumindo o conteúdo.
- "capitulos": exatamente ${p.ancoras.length} capítulos, um para CADA âncora acima, na mesma ordem e com o tempo escrito exatamente como aparece. Não pule, não acrescente e não invente tempos. O título deve resumir o trecho que COMEÇA naquele tempo, em até 5 palavras; não repita o título do vídeo.
- "chamadaInscricao": uma frase convidando a se inscrever no canal.
- "hashtags": de 3 a 5, começando com #.
Responda somente em JSON: {"gancho": string, "resumo": string, "chamadaInscricao": string, "hashtags": [string], "capitulos": [{"tempo": string, "titulo": string}]}`;
}

// ---------------------------------------------------------------------------
// Revisão editorial, verificação de imagens e elementos visuais
// ---------------------------------------------------------------------------

export function promptEditorial(p: {
  titulo: string;
  tema: string;
  idioma: Idioma;
  cenas: { numero: number; texto: string; descricaoVisual: string }[];
}): string {
  const roteiro = p.cenas
    .map((c) => `--- Cena ${c.numero} ---\nNarração: ${c.texto}\nVisual: ${c.descricaoVisual}`)
    .join('\n\n');
  return `Você é um editor-chefe e checador de fatos de documentários, rigoroso e honesto. Revise o roteiro abaixo, em ${nomeDoIdioma(p.idioma)}.
Título: ${p.titulo}
Tema: ${p.tema || 'não informado'}

ROTEIRO:
${roteiro}

VERIFIQUE:
1. Precisão histórica: datas, períodos, acontecimentos, personagens, instituições, contexto político/social e ordem cronológica.
2. Precisão geográfica: estados, municípios, localização, divisões territoriais, regiões brasileiras e mudanças territoriais.
3. Precisão científica: nomes científicos, características de animais, habitat, distribuição, alimentação, reprodução e dados biológicos.
4. Qualidade: afirmações sem fonte, contradições, informações desatualizadas, generalizações excessivas e falta de contextualização.

COMO APONTAR:
- "cenaNumero": número da cena onde está o trecho (ou null).
- "trecho": copie o trecho original, curto e exato.
- "problema": o que está errado ou precisa de atenção, em uma frase.
- "explicacao": por que é um problema.
- "sugestao": como corrigir (texto pronto para substituir o trecho, quando possível).
- "fonte": a fonte usada na verificação. Só cite fontes que você realmente conhece (IBGE, universidades, institutos, museus, arquivos, artigos). NUNCA invente título, autor ou link.
- "confianca": "alta", "media", "baixa" ou "nao_verificada". Quando não conseguir verificar, use "nao_verificada" e deixe "fonte" vazio.
- Não apresente informação incerta como fato comprovado.
- Se não houver problemas relevantes, devolva "problemas": [].

CLASSIFICAÇÃO FINAL:
- "aprovado": nenhum problema relevante.
- "ressalvas": há pontos que precisam de atenção, mas nenhum erro grave.
- "correcao": há problemas importantes (erro factual, contradição, informação inventada).

Responda somente em JSON:
{"classificacao": "aprovado" | "ressalvas" | "correcao", "resumo": string, "problemas": [{"cenaNumero": number|null, "tipo": "historico"|"geografico"|"cientifico"|"fonte"|"contradicao"|"generalizacao"|"contexto", "trecho": string, "problema": string, "explicacao": string, "sugestao": string, "fonte": string, "confianca": "alta"|"media"|"baixa"|"nao_verificada"}]}`;
}

export function promptVerificacaoImagem(p: {
  numero: number;
  textoNarrado: string;
  descricaoVisual: string;
  estiloVisual: string;
}): string {
  return `Você está conferindo o storyboard de um documentário. Analise a IMAGEM anexada da cena ${p.numero} e compare com o que é narrado.
Narração: "${p.textoNarrado}"
Descrição visual pedida: "${p.descricaoVisual}"
Estilo do vídeo: ${p.estiloVisual}

Responda com honestidade:
- "corresponde": a imagem representa o que a narração diz? (pessoas/povos citados, ação, época, lugar, espécie).
- "tipo": "ok" quando representa bem; "generica" quando é paisagem/ilustração vazia; "incompativel" quando mostra outra coisa; "periodo_errado" quando a época não confere; "especie_errada" quando o animal/pessoa não é o citado.
- "motivo": explicação curta e objetiva.
- "sugestao": como corrigir o prompt da imagem, se necessário.

Responda somente em JSON: {"corresponde": boolean, "tipo": "ok"|"generica"|"incompativel"|"periodo_errado"|"especie_errada", "motivo": string, "sugestao": string}`;
}

export function promptVisualAsset(p: {
  tipo: 'mapa' | 'linha-do-tempo';
  titulo: string;
  periodo: string;
  descricao: string;
  estiloVisual: string;
  proporcao: string;
}): string {
  const comum = `Elemento visual explicativo em ${p.proporcao} para um documentário.
Assunto: ${p.titulo || 'não informado'}. Período/recorte: ${p.periodo || 'não informado'}.
Detalhes pedidos: ${p.descricao || 'não informado'}.
Estilo do vídeo: ${p.estiloVisual}

REGRAS DE FIDELIDADE (obrigatórias):
- Represente exatamente o período informado. NUNCA use fronteiras, divisões ou nomes atuais para representar outra época.
- Se o período for histórico, mostre as divisões territoriais daquela época (ex.: estados, municípios, distritos existentes então).
- Não invente fronteiras, nomes de países, estados ou cidades que não existiam no período.
- Sem logotipos e sem marca d'água.`;

  if (p.tipo === 'mapa') {
    return `${comum}

Composição de mapa histórico/cartográfico: vista de cima, limites claros, legendas visuais simples, cores discretas e alto contraste com o fundo. Evite excesso de texto.
Se precisar de rótulos, use poucos e corretos; se não tiver certeza dos nomes, prefira um mapa sem texto, com áreas destacadas.`;
  }
  return `${comum}

Composição de linha do tempo horizontal: linha central, marcadores de datas e eventos em ordem cronológica, ícones simples. Pouco texto e datas legíveis.
Se não tiver certeza de uma data, não invente: use marcadores sem data ou menos eventos.`;
}

/** Saída da verificação imagem × narração. */
export const verificacaoImagemGenSchema = z.object({
  corresponde: z.boolean(),
  tipo: z.enum(['ok', 'generica', 'incompativel', 'periodo_errado', 'especie_errada']),
  motivo: z.string().default(''),
  sugestao: z.string().default(''),
});
