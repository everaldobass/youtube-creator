import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { basename, extname, join, resolve, sep } from 'path';
import {
  MUSICA_EXT_PARA_MIME,
  MUSICA_MIME_PARA_EXT,
  MUSICA_VOLUME_PADRAO,
  MusicConfigInput,
  MusicLibraryInput,
  MusicResponse,
  MusicUploadInput,
  MusicaBibliotecaItem,
} from '@yt/shared';
import { chaveMusica, extDaChave } from '../media/files';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const MAX_MUSICA_BYTES = 30 * 1024 * 1024;
const EXTENSOES = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac']);

/** Item opcional do musicas.json, para créditos e nomes bonitos. */
interface IndiceItem {
  arquivo: string;
  nome?: string;
  artista?: string;
  licenca?: string;
  credito?: string;
}

const semExtensao = (arquivo: string) => arquivo.slice(0, arquivo.length - extname(arquivo).length);

const nomeBonito = (arquivo: string) => {
  const nome = semExtensao(arquivo).replace(/[-_]+/g, ' ').trim();
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : arquivo;
};

@Injectable()
export class MusicService implements OnModuleInit {
  private readonly log = new Logger(MusicService.name);
  private readonly pasta: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly config: ConfigService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {
    const base = this.config.get<string>('MUSIC_LIBRARY_DIR');
    const storageDir = this.config.get<string>('STORAGE_LOCAL_DIR') ?? '../../storage';
    this.pasta = resolve(base || join(storageDir, 'musicas'));
  }

  /** Cria a pasta da biblioteca e explica como colocá-las músicas livres nela. */
  async onModuleInit() {
    try {
      await fs.mkdir(this.pasta, { recursive: true });
      const leiaMe = join(this.pasta, 'LEIA-ME.md');
      await fs.access(leiaMe).catch(() =>
        fs.writeFile(
          leiaMe,
          [
            '# Biblioteca local de músicas livres',
            '',
            'Coloque aqui arquivos .mp3, .m4a, .wav, .ogg ou .flac com licença livre',
            '(por exemplo, músicas baixadas da Biblioteca de Áudio do YouTube).',
            'Elas aparecem na etapa 9, em "Música de fundo".',
            '',
            'Opcional: crie um arquivo `musicas.json` para definir nome, artista e crédito:',
            '',
            '```json',
            '[',
            '  {',
            '    "arquivo": "minha-musica.mp3",',
            '    "nome": "Minha música",',
            '    "artista": "Autor",',
            '    "licenca": "Biblioteca de Áudio do YouTube",',
            '    "credito": "Música: Minha música — Autor (Biblioteca de Áudio do YouTube)"',
            '  }',
            ']',
            '```',
            '',
          ].join('\n'),
          'utf8',
        ),
      );
    } catch (e) {
      this.log.warn(`Não foi possível criar a pasta de músicas (${this.pasta}): ${String(e)}`);
    }
  }

  private async projeto(projectId: string) {
    await this.projects.get(projectId); // valida o dono
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!row) throw new NotFoundException('Projeto não encontrado');
    return row;
  }

  private async lerIndice(): Promise<IndiceItem[]> {
    try {
      const bruto = await fs.readFile(join(this.pasta, 'musicas.json'), 'utf8');
      const json: unknown = JSON.parse(bruto);
      if (!Array.isArray(json)) return [];
      return json.filter(
        (i): i is IndiceItem =>
          typeof i === 'object' && i !== null && typeof (i as IndiceItem).arquivo === 'string',
      );
    } catch {
      return [];
    }
  }

  async biblioteca(): Promise<MusicaBibliotecaItem[]> {
    let arquivos: string[];
    try {
      arquivos = await fs.readdir(this.pasta);
    } catch {
      return [];
    }
    const indice = await this.lerIndice();
    return arquivos
      .filter((a) => !a.startsWith('.') && EXTENSOES.has(extname(a).slice(1).toLowerCase()))
      .map((arquivo) => {
        const meta = indice.find((i) => i.arquivo === arquivo);
        return {
          arquivo,
          nome: meta?.nome?.trim() || nomeBonito(arquivo),
          artista: meta?.artista?.trim() || '',
          origem: meta?.licenca?.trim() || 'Biblioteca local',
          credito:
            meta?.credito?.trim() ||
            [meta?.nome?.trim() || nomeBonito(arquivo), meta?.artista?.trim(), meta?.licenca?.trim()]
              .filter(Boolean)
              .join(' — '),
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async response(projectId: string): Promise<MusicResponse> {
    const p = await this.projeto(projectId);
    return {
      escolhida: p.musicaPath
        ? {
            nome: p.musicaNome,
            artista: p.musicaArtista,
            origem: p.musicaOrigem,
            credito: p.musicaCredito,
            versao: p.musicaPath.split('/').pop() ?? '',
          }
        : null,
      volume: p.musicaVolume ?? MUSICA_VOLUME_PADRAO,
      ducking: p.musicaDucking,
      biblioteca: await this.biblioteca(),
      pastaBiblioteca: this.pasta,
    };
  }

  private async salvar(
    projectId: string,
    antigo: string | null,
    dados: Buffer,
    ext: string,
    meta: { nome: string; artista: string; origem: string; credito: string },
  ): Promise<void> {
    const chave = chaveMusica(projectId, ext);
    await this.storage.put(chave, dados, MUSICA_EXT_PARA_MIME[ext] ?? 'audio/mpeg');
    if (antigo && antigo !== chave) await this.storage.remove(antigo).catch(() => undefined);
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        musicaPath: chave,
        musicaNome: meta.nome.slice(0, 120),
        musicaArtista: meta.artista.slice(0, 120),
        musicaOrigem: meta.origem.slice(0, 120),
        musicaCredito: meta.credito.slice(0, 500),
      },
    });
  }

  async upload(projectId: string, input: MusicUploadInput): Promise<MusicResponse> {
    const p = await this.projeto(projectId);
    const base64 = input.base64.replace(/^data:[^;]+;base64,/, '');
    const dados = Buffer.from(base64, 'base64');
    if (dados.length === 0) throw new BadRequestException('Arquivo de música inválido.');
    if (dados.length > MAX_MUSICA_BYTES) throw new BadRequestException('A música passa de 30 MB.');
    const ext = MUSICA_MIME_PARA_EXT[input.mime];
    if (!ext) throw new BadRequestException('Formato de áudio não suportado.');
    await this.salvar(projectId, p.musicaPath, dados, ext, {
      nome: input.nome?.trim() || 'Música própria',
      artista: input.artista?.trim() || '',
      origem: 'Upload próprio',
      credito: '',
    });
    return this.response(projectId);
  }

  private caminhoDaBiblioteca(arquivo: string): string {
    const nome = basename(arquivo);
    if (nome !== arquivo || !EXTENSOES.has(extname(nome).slice(1).toLowerCase())) {
      throw new BadRequestException('Arquivo de música inválido.');
    }
    const caminho = resolve(join(this.pasta, nome));
    if (!caminho.startsWith(this.pasta + sep)) {
      throw new BadRequestException('Arquivo de música inválido.');
    }
    return caminho;
  }

  async escolherDaBiblioteca(projectId: string, input: MusicLibraryInput): Promise<MusicResponse> {
    const p = await this.projeto(projectId);
    const caminho = this.caminhoDaBiblioteca(input.arquivo);
    let dados: Buffer;
    try {
      dados = await fs.readFile(caminho);
    } catch {
      throw new NotFoundException('Essa música não está mais na biblioteca.');
    }
    const ext = extname(input.arquivo).slice(1).toLowerCase();
    const indice = await this.lerIndice();
    const meta = indice.find((i) => i.arquivo === input.arquivo);
    await this.salvar(projectId, p.musicaPath, dados, ext, {
      nome: meta?.nome?.trim() || nomeBonito(input.arquivo),
      artista: meta?.artista?.trim() || '',
      origem: meta?.licenca?.trim() || 'Biblioteca local',
      credito:
        meta?.credito?.trim() ||
        [meta?.nome?.trim() || nomeBonito(input.arquivo), meta?.artista?.trim(), meta?.licenca?.trim()]
          .filter(Boolean)
          .join(' — '),
    });
    return this.response(projectId);
  }

  async configurar(projectId: string, input: MusicConfigInput): Promise<MusicResponse> {
    await this.projeto(projectId);
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.volume !== undefined ? { musicaVolume: input.volume } : {}),
        ...(input.ducking !== undefined ? { musicaDucking: input.ducking } : {}),
        ...(input.credito !== undefined ? { musicaCredito: input.credito } : {}),
      },
    });
    return this.response(projectId);
  }

  async remover(projectId: string): Promise<void> {
    const p = await this.projeto(projectId);
    if (p.musicaPath) await this.storage.remove(p.musicaPath).catch(() => undefined);
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        musicaPath: null,
        musicaNome: '',
        musicaArtista: '',
        musicaOrigem: '',
        musicaCredito: '',
      },
    });
  }

  async audio(projectId: string): Promise<{ data: Buffer; mime: string; nome: string }> {
    const p = await this.projeto(projectId);
    if (!p.musicaPath) throw new NotFoundException('Nenhuma música escolhida.');
    return {
      data: await this.storage.get(p.musicaPath),
      mime: MUSICA_EXT_PARA_MIME[extDaChave(p.musicaPath)] ?? 'audio/mpeg',
      nome: p.musicaNome || 'musica',
    };
  }

  async audioDaBiblioteca(arquivo: string): Promise<{ data: Buffer; mime: string }> {
    const caminho = this.caminhoDaBiblioteca(arquivo);
    let data: Buffer;
    try {
      data = await fs.readFile(caminho);
    } catch {
      throw new NotFoundException('Essa música não está mais na biblioteca.');
    }
    return {
      data,
      mime: MUSICA_EXT_PARA_MIME[extname(arquivo).slice(1).toLowerCase()] ?? 'audio/mpeg',
    };
  }
}
