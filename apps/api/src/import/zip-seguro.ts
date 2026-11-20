import * as yauzl from 'yauzl';

/**
 * Leitura segura de ZIP: valida o diretório central antes de qualquer escrita
 * (zip-slip, symlink, bombas) e só depois entrega o conteúdo das entradas.
 * Nunca extrai para o disco; o chamador decide o que fazer com cada buffer.
 */

export const EXTENSOES_PERMITIDAS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'wav',
  'mp3',
  'm4a',
  'ogg',
  'flac',
  'json',
  'txt',
  'srt',
]);

export const OPCOES_ZIP_PADRAO = {
  maxEntradas: 5000,
  /** Uma cena de 120 s em WAV fica abaixo de 50 MB. */
  maxPorArquivo: 128 * 1024 * 1024,
  maxDescompactado: 2 * 1024 * 1024 * 1024,
  maxTaxaCompressao: 250,
};

export interface OpcoesZip {
  maxEntradas: number;
  maxPorArquivo: number;
  maxDescompactado: number;
  maxTaxaCompressao: number;
}

export interface EntradaZip {
  nome: string;
  tamanho: number;
  comprimido: number;
}

/** Erro de pacote inválido, com mensagem já pronta para o usuário. */
export class ZipInvalidoError extends Error {}

const extensao = (nome: string) => {
  const ponto = nome.lastIndexOf('.');
  return ponto >= 0 ? nome.slice(ponto + 1).toLowerCase() : '';
};

/** Rejeita caminhos absolutos, com `..`, barras invertidas ou caracteres de controle. */
export function validarCaminhoZip(nome: string): void {
  if (!nome || nome.includes('\0') || /[\u0000-\u001f]/.test(nome)) {
    throw new ZipInvalidoError('O pacote contém um nome de arquivo inválido.');
  }
  if (nome.includes('\\')) {
    throw new ZipInvalidoError('O pacote contém um caminho com barra invertida.');
  }
  if (nome.startsWith('/') || /^[a-zA-Z]:/.test(nome)) {
    throw new ZipInvalidoError('O pacote contém um caminho absoluto.');
  }
  const partes = nome.split('/');
  if (partes.some((p) => p === '..' || p === '.')) {
    throw new ZipInvalidoError('O pacote contém um caminho que sai da pasta do projeto (../).');
  }
}

function abrirZip(caminho: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(caminho, { lazyEntries: true, autoClose: true }, (erro, zip) => {
      if (erro || !zip) {
        reject(new ZipInvalidoError('O arquivo não é um ZIP válido ou está corrompido.'));
        return;
      }
      resolve(zip);
    });
  });
}

/** Lê a próxima entrada do diretório central; `null` no fim. */
function proximaEntrada(zip: yauzl.ZipFile): Promise<yauzl.Entry | null> {
  return new Promise((resolve, reject) => {
    const limpar = () => {
      zip.removeListener('entry', aoEntrar);
      zip.removeListener('end', aoFim);
      zip.removeListener('error', aoErro);
    };
    const aoEntrar = (entry: yauzl.Entry) => {
      limpar();
      resolve(entry);
    };
    const aoFim = () => {
      limpar();
      resolve(null);
    };
    const aoErro = (erro: Error) => {
      limpar();
      reject(new ZipInvalidoError(`O pacote está corrompido: ${erro.message}`));
    };
    zip.once('entry', aoEntrar);
    zip.once('end', aoFim);
    zip.once('error', aoErro);
    zip.readEntry();
  });
}

const ehDiretorio = (entry: yauzl.Entry) =>
  entry.fileName.endsWith('/') || ((entry.externalFileAttributes >>> 16) & 0x10) !== 0;

const ehSymlink = (entry: yauzl.Entry) => {
  const modo = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (modo & 0o170000) === 0o120000;
};

/**
 * Valida o diretório central inteiro e devolve só os arquivos regulares.
 * Precisa rodar antes de qualquer `storage.put`, para um pacote malicioso
 * não deixar arquivos para trás.
 */
export async function inspecionarZip(
  caminho: string,
  opcoes: OpcoesZip = OPCOES_ZIP_PADRAO,
): Promise<EntradaZip[]> {
  const zip = await abrirZip(caminho);
  const arquivos: EntradaZip[] = [];
  let total = 0;
  try {
    for (;;) {
      const entry = await proximaEntrada(zip);
      if (!entry) break;
      if (ehDiretorio(entry)) continue;
      validarCaminhoZip(entry.fileName);

      if (ehSymlink(entry)) {
        throw new ZipInvalidoError('O pacote contém um link simbólico, que não é permitido.');
      }
      if (entry.isEncrypted?.() || (entry.generalPurposeBitFlag & 0x1) !== 0) {
        throw new ZipInvalidoError('O pacote está protegido por senha, o que não é suportado.');
      }
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
        throw new ZipInvalidoError('O pacote usa um método de compressão não suportado.');
      }

      const ext = extensao(entry.fileName);
      if (!EXTENSOES_PERMITIDAS.has(ext)) {
        throw new ZipInvalidoError(
          `O pacote contém um arquivo não permitido (${entry.fileName}). Extensões aceitas: ${[
            ...EXTENSOES_PERMITIDAS,
          ].join(', ')}.`,
        );
      }
      if (entry.uncompressedSize > opcoes.maxPorArquivo) {
        throw new ZipInvalidoError(`O arquivo ${entry.fileName} é grande demais dentro do pacote.`);
      }
      if (
        entry.uncompressedSize > 1024 * 1024 &&
        entry.compressedSize > 0 &&
        entry.uncompressedSize / entry.compressedSize > opcoes.maxTaxaCompressao
      ) {
        throw new ZipInvalidoError('O pacote parece uma bomba de descompactação e foi recusado.');
      }

      total += entry.uncompressedSize;
      if (total > opcoes.maxDescompactado) {
        throw new ZipInvalidoError('O conteúdo descompactado do pacote é grande demais.');
      }

      arquivos.push({
        nome: entry.fileName,
        tamanho: entry.uncompressedSize,
        comprimido: entry.compressedSize,
      });
      if (arquivos.length > opcoes.maxEntradas) {
        throw new ZipInvalidoError(
          `O pacote tem arquivos demais (limite de ${opcoes.maxEntradas}).`,
        );
      }
    }
  } finally {
    zip.close();
  }
  return arquivos;
}

function lerEntrada(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maximo: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (erro, stream) => {
      if (erro || !stream) {
        reject(new ZipInvalidoError(`Não foi possível ler ${entry.fileName} do pacote.`));
        return;
      }
      const partes: Buffer[] = [];
      let total = 0;
      let falhou = false;
      const falhar = (e: Error) => {
        if (falhou) return;
        falhou = true;
        stream.destroy();
        reject(e);
      };
      stream.on('data', (pedaco: Buffer) => {
        total += pedaco.length;
        if (total > maximo) {
          falhar(new ZipInvalidoError(`O arquivo ${entry.fileName} é grande demais.`));
          return;
        }
        partes.push(pedaco);
      });
      stream.on('error', (e) =>
        falhar(new ZipInvalidoError(`Não foi possível ler ${entry.fileName}: ${e.message}`)),
      );
      stream.on('end', () => {
        if (!falhou) resolve(Buffer.concat(partes));
      });
    });
  });
}

/**
 * Entrega o conteúdo das entradas cujo nome está em `nomes`. As demais são
 * puladas sem carregar o conteúdo na memória.
 */
export async function lerArquivosZip(
  caminho: string,
  nomes: Set<string>,
  opcoes: OpcoesZip = OPCOES_ZIP_PADRAO,
): Promise<Map<string, Buffer>> {
  const lidos = new Map<string, Buffer>();
  const zip = await abrirZip(caminho);
  try {
    for (;;) {
      const entry = await proximaEntrada(zip);
      if (!entry) break;
      if (ehDiretorio(entry)) continue;
      if (!nomes.has(entry.fileName)) continue;
      lidos.set(entry.fileName, await lerEntrada(zip, entry, opcoes.maxPorArquivo));
    }
  } finally {
    zip.close();
  }
  return lidos;
}

/** Percorre todas as entradas; usado na importação para gravar cada arquivo. */
export async function percorrerZip(
  caminho: string,
  aoArquivo: (nome: string, buffer: Buffer) => Promise<void>,
  opcoes: OpcoesZip = OPCOES_ZIP_PADRAO,
): Promise<void> {
  const zip = await abrirZip(caminho);
  try {
    for (;;) {
      const entry = await proximaEntrada(zip);
      if (!entry) break;
      if (ehDiretorio(entry)) continue;
      await aoArquivo(entry.fileName, await lerEntrada(zip, entry, opcoes.maxPorArquivo));
    }
  } finally {
    zip.close();
  }
}
