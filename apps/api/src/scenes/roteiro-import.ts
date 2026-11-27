import { contarPalavras, FonteRoteiro } from '@yt/shared';

/**
 * Importação do roteiro em Markdown — o mesmo padrão do arquivo que o
 * YouStudio exporta (`## Cena N`, `**Texto narrado**`, `**Descrição visual**`,
 * `## Referências`). A leitura é tolerante: trechos fora do padrão viram
 * avisos em vez de erro.
 */

/** Ritmo médio de narração: ~150 palavras por minuto. */
const PALAVRAS_POR_SEGUNDO = 2.5;

export interface CenaImportada {
  /** Número que estava escrito no arquivo (as cenas são renumeradas ao salvar). */
  numeroOriginal: number;
  textoNarrado: string;
  descricaoVisual: string;
  duracaoSegundos: number;
}

export interface RoteiroImportado {
  cenas: CenaImportada[];
  fontes: FonteRoteiro[];
  /** Ajustes automáticos e trechos ignorados, para explicar na tela. */
  avisos: string[];
}

const CABECALHO_CENA = /^##\s+cena\s+(\d+)\b/i;
const CABECALHO_REFS = /^##\s+(refer[êe]ncias|references)\b/i;
const MARCA_TEXTO = /^\*\*\s*texto narrado\s*\*\*\s*$/i;
const MARCA_VISUAL = /^\*\*\s*descri[çc][ãa]o visual\s*\*\*\s*$/i;
const META = /^[-*]\s*(dura[çc][ãa]o|narra[çc][ãa]o|imagem)\s*:/i;

function estimarDuracao(texto: string): number {
  const segundos = Math.round(contarPalavras(texto) / PALAVRAS_POR_SEGUNDO);
  return Math.min(120, Math.max(1, segundos));
}

/** Junta as linhas preservando parágrafos (linha em branco separa). */
function paragrafos(linhas: string[]): string {
  return linhas
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tira o fecho da cena (`---`, `***`) e os metadados do topo (duração/status). */
function limparBloco(linhas: string[]): string[] {
  const saida = [...linhas];
  while (saida.length) {
    const ultima = saida[saida.length - 1].trim();
    if (ultima === '' || /^-{3,}$/.test(ultima) || /^\*{3,}$/.test(ultima)) saida.pop();
    else break;
  }
  while (saida.length) {
    const primeira = saida[0].trim();
    if (primeira === '' || META.test(primeira)) saida.shift();
    else break;
  }
  return saida;
}

function lerCena(blocoOriginal: string[], numero: number, avisos: string[]): CenaImportada | null {
  let duracao = 0;
  for (const linha of blocoOriginal) {
    const m = /^[-*]\s*dura[çc][ãa]o\s*:\s*(\d+)/i.exec(linha.trim());
    if (m) duracao = Number(m[1]);
  }

  const bloco = limparBloco(blocoOriginal);
  const iTexto = bloco.findIndex((l) => MARCA_TEXTO.test(l.trim()));
  const iVisual = bloco.findIndex((l) => MARCA_VISUAL.test(l.trim()));

  let texto = '';
  let visual = '';
  if (iTexto >= 0 && iVisual > iTexto) {
    texto = paragrafos(bloco.slice(iTexto + 1, iVisual));
    visual = paragrafos(limparBloco(bloco.slice(iVisual + 1)));
  } else if (iTexto >= 0) {
    texto = paragrafos(bloco.slice(iTexto + 1));
  } else if (iVisual >= 0) {
    visual = paragrafos(bloco.slice(iVisual + 1));
  } else {
    // Sem marcadores: o bloco inteiro é tratado como narração.
    texto = paragrafos(bloco);
    avisos.push(
      `Cena ${numero}: sem os marcadores "**Texto narrado**" e "**Descrição visual**" — o texto do bloco foi importado como narração.`,
    );
  }

  if (!texto.trim()) {
    avisos.push(`Cena ${numero} ignorada: não tem texto narrado.`);
    return null;
  }

  if (!duracao) {
    duracao = estimarDuracao(texto);
    avisos.push(`Cena ${numero}: sem duração informada — estimada em ${duracao} s.`);
  }

  return {
    numeroOriginal: numero,
    textoNarrado: texto,
    descricaoVisual: visual,
    duracaoSegundos: Math.min(120, Math.max(1, Math.round(duracao))),
  };
}

/** `1. **Título** — Autor (2020) — <https://…>` → FonteRoteiro. */
function lerFonte(item: string): FonteRoteiro | null {
  let resto = item.trim();
  let titulo: string;
  const negrito = /^\*\*(.+?)\*\*\s*(.*)$/.exec(resto);
  if (negrito) {
    titulo = negrito[1].trim();
    resto = negrito[2].trim();
  } else {
    // Sem negrito: o primeiro segmento antes do travessão é o título.
    const partes = resto.split(/\s+[—–]\s+/);
    titulo = partes[0].trim();
    resto = partes.slice(1).join(' — ');
  }

  const achadoUrl = /<([^>\s]+)>/.exec(resto) ?? /(https?:\/\/\S+)/.exec(resto);
  const url = achadoUrl ? achadoUrl[1].replace(/[).,;]+$/, '') : '';
  const semUrl = resto.replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ');

  let autor = '';
  let ano = '';
  for (const parte of semUrl.split(/\s+[—–]\s+/)) {
    const limpa = parte.trim().replace(/^[—–]\s*/, '');
    if (!limpa) continue;
    const soAno = /^\(?(\d{4})\)?$/.exec(limpa);
    if (soAno && !ano) {
      ano = soAno[1];
      continue;
    }
    const anoEntreParenteses = /\((\d{4})\)/.exec(limpa);
    if (anoEntreParenteses && !ano) {
      ano = anoEntreParenteses[1];
      const nome = limpa
        .replace(/\(\d{4}\)/, '')
        .replace(/[,;]+$/, '')
        .trim();
      if (nome && !autor) autor = nome;
      continue;
    }
    if (!autor) autor = limpa;
  }

  titulo = titulo.replace(/[.;,]+$/, '').trim();
  if (!titulo) return null;
  return {
    titulo: titulo.slice(0, 300),
    autor: autor.slice(0, 160),
    ano,
    url,
  };
}

function lerReferencias(linhas: string[]): FonteRoteiro[] {
  const fontes: FonteRoteiro[] = [];
  for (const linha of linhas) {
    const l = linha.trim();
    if (!l || l.startsWith('>') || /^#{1,6}\s/.test(l) || /^[-*_]{3,}$/.test(l)) continue;
    const item = /^(\d+)[.)]\s+(.*)$/.exec(l);
    if (!item) continue;
    const fonte = lerFonte(item[2]);
    if (fonte) fontes.push(fonte);
  }
  return fontes.slice(0, 12);
}

/**
 * Lê o Markdown e devolve as cenas na ordem do arquivo (renumeradas depois).
 * Lança erro só quando não há nenhuma cena reconhecível — o resto é aviso.
 */
export function lerRoteiroMarkdown(markdown: string): RoteiroImportado {
  const linhas = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');
  const avisos: string[] = [];

  const inicioRefs = linhas.findIndex((l) => CABECALHO_REFS.test(l.trim()));
  const fimCenas = inicioRefs >= 0 ? inicioRefs : linhas.length;

  const cabecalhos: { indice: number; numero: number }[] = [];
  for (let i = 0; i < fimCenas; i++) {
    const m = CABECALHO_CENA.exec(linhas[i].trim());
    if (m) cabecalhos.push({ indice: i, numero: Number(m[1]) });
  }

  const cenas: CenaImportada[] = [];
  cabecalhos.forEach((c, i) => {
    const fim = i + 1 < cabecalhos.length ? cabecalhos[i + 1].indice : fimCenas;
    const cena = lerCena(linhas.slice(c.indice + 1, fim), c.numero, avisos);
    if (cena) cenas.push(cena);
  });

  const fontes = inicioRefs >= 0 ? lerReferencias(linhas.slice(inicioRefs + 1)) : [];
  return { cenas, fontes, avisos };
}
