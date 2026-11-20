/**
 * Teste de fumaça da importação de projeto (.zip). Não faz parte do build.
 * Uso (em apps/api): npx ts-node -P tsconfig.json src/import/import.smoke.ts
 *
 * Cobre: ida e volta exportar → importar, zip-slip, zip bomba, ZIP corrompido,
 * projeto.json inválido, pacote antigo sem manifesto e ausência de segredos.
 */
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { deflateRawSync } from 'zlib';
import archiver from 'archiver';
import { createProjectSchema } from '@yt/shared';
import { ExportService } from '../export/export.service';
import { chaveAudio, chaveImagem, chaveMusica, chaveThumb, chaveVisual } from '../media/files';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { LocalStorageDriver } from '../storage/local-storage.driver';
import { ImportService } from './import.service';
import { lerArquivosZip } from './zip-seguro';

let passos = 0;
const falhas: string[] = [];

function conferir(condicao: unknown, mensagem: string) {
  passos += 1;
  if (!condicao) falhas.push(mensagem);
}

async function rejeitar(fn: () => Promise<unknown>, mensagem: string) {
  passos += 1;
  try {
    await fn();
    falhas.push(`${mensagem} (não rejeitou)`);
  } catch {
    // esperado
  }
}

// ----- ZIP mínimo, para testar caminhos que o archiver normaliza -----
const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface EntradaManual {
  nome: string;
  dados: string | Buffer;
  comprimir?: boolean;
}

function zipManual(entradas: EntradaManual[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const dados = Buffer.from(e.dados);
    const comprimido = e.comprimir ? deflateRawSync(dados) : dados;
    const metodo = e.comprimir ? 8 : 0;
    const crc = crc32(dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nome);

    offset += 30 + nome.length + comprimido.length;
  }
  const cd = Buffer.concat(centrais);
  const locaisBuf = Buffer.concat(locais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(locaisBuf.length, 16);
  return Buffer.concat([locaisBuf, cd, eocd]);
}

function bufferDoArchiver(arquivo: archiver.Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    arquivo.on('data', (p: Buffer) => partes.push(p));
    arquivo.on('end', () => resolve(Buffer.concat(partes)));
    arquivo.on('error', reject);
  });
}

async function main() {
  const raiz = await mkdtemp(join(tmpdir(), 'youstudio-import-smoke-'));
  const prisma = new PrismaService();
  await prisma.$connect();
  const storage = new LocalStorageDriver(join(raiz, 'storage'));
  const projetos = new ProjectsService(prisma, storage);
  const importacao = new ImportService(prisma, projetos, storage);
  // Stubs: este teste não monta vídeo nem mede silêncios com FFmpeg.
  const semFfmpeg = {
    comPastaTemporaria: async <T>(fn: (dir: string) => Promise<T>) => {
      const dir = await mkdtemp(join(raiz, 'tmp-'));
      try {
        return await fn(dir);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    },
    capture: async () => '',
  } as never;
  const exportacao = new ExportService(
    prisma,
    { register: () => undefined, listar: async () => [] } as never,
    semFfmpeg,
    projetos,
    storage,
  );

  const criados: string[] = [];
  const arquivosTemporarios: string[] = [];
  try {
    // ---------- prepara um projeto completo ----------
    const projeto = await projetos.create(
      createProjectSchema.parse({
        ideia: 'Animais raros do Brasil',
        tema: 'Um passeio pela fauna brasileira',
        publico: '15 a 60 anos',
        formato: 'longo',
        duracaoMinutos: 5,
        idioma: 'pt-BR',
        estiloVisual: '3D estilizado, cores quentes',
        efeitoCamera: 'alternado',
        legendasAtivas: true,
        legendaTamanho: 110,
        legendaPosicao: 'topo',
        legendaEstilo: 'italico',
        legendaCor: '#FDE68A',
      }),
    );
    criados.push(projeto.id);
    await prisma.project.update({
      where: { id: projeto.id },
      data: {
        tituloEscolhido: 'Animais que parecem de filme',
        descricao: 'Descrição de teste com capítulos.',
        etapaAtual: 'video',
        editorialStatus: 'ressalvas',
        musicaNome: 'Trilha de teste',
        musicaArtista: 'Artista',
        musicaOrigem: 'Biblioteca local',
        musicaCredito: 'Música: Trilha de teste — Artista',
        musicaVolume: 35,
        musicaDucking: false,
      },
    });

    await prisma.title.createMany({
      data: [
        { projectId: projeto.id, texto: 'Título A', estilo: 'curiosidade', nota: 9, escolhido: true },
        { projectId: projeto.id, texto: 'Título B', estilo: 'lista', nota: 7, escolhido: false },
      ],
    });

    const c1 = await prisma.scene.create({
      data: {
        projectId: projeto.id,
        numero: 1,
        textoNarrado: 'Primeira cena do teste.',
        duracaoSegundos: 4,
        descricaoVisual: 'Floresta ao amanhecer.',
        promptImagem: 'prompt da cena 1',
        sugestaoCamera: 'zoom-in',
        alertaImagem: 'conferir espécie',
        audioDuracaoMs: 3800,
        versaoMidia: 3,
        statusNarracao: 'aprovado',
        statusImagem: 'aprovado',
      },
    });
    const c2 = await prisma.scene.create({
      data: {
        projectId: projeto.id,
        numero: 2,
        textoNarrado: 'Segunda cena do teste.',
        duracaoSegundos: 5,
        descricaoVisual: 'Rio no fim da tarde.',
        promptImagem: 'prompt da cena 2',
        audioDuracaoMs: 5000,
        versaoMidia: 1,
        statusNarracao: 'gerado',
        statusImagem: 'gerado',
      },
    });

    const img1 = chaveImagem(projeto.id, c1.id, 'jpg');
    const img2 = chaveImagem(projeto.id, c2.id, 'png');
    const aud1 = chaveAudio(projeto.id, c1.id, 1);
    const aud1Antigo = chaveAudio(projeto.id, c1.id, 2);
    const aud2 = chaveAudio(projeto.id, c2.id, 3);
    await storage.put(img1, Buffer.from('imagem-1'));
    await storage.put(img2, Buffer.from('imagem-2'));
    await storage.put(aud1, Buffer.from('audio-1'));
    await storage.put(aud1Antigo, Buffer.from('audio-1-antigo'));
    await storage.put(aud2, Buffer.from('audio-2'));
    await prisma.scene.update({ where: { id: c1.id }, data: { imagemPath: img1, audioPath: aud1 } });
    await prisma.scene.update({ where: { id: c2.id }, data: { imagemPath: img2, audioPath: aud2 } });
    await prisma.sceneAudio.createMany({
      data: [
        { sceneId: c1.id, path: aud1, duracaoMs: 3800, atual: true },
        { sceneId: c1.id, path: aud1Antigo, duracaoMs: 3600, atual: false },
        { sceneId: c2.id, path: aud2, duracaoMs: 5000, atual: true },
      ],
    });

    const thumbId = 'thumb-smoke';
    const thumbPath = chaveThumb(projeto.id, thumbId);
    await storage.put(thumbPath, Buffer.from('thumb'));
    await prisma.thumbnail.create({
      data: {
        id: thumbId,
        projectId: projeto.id,
        variacao: 1,
        textoNaImagem: 'Texto da thumb',
        imagemPath: thumbPath,
        escolhida: true,
      },
    });

    const visualId = 'visual-smoke';
    const visualPath = chaveVisual(projeto.id, visualId, 'png');
    await storage.put(visualPath, Buffer.from('mapa'));
    await prisma.visualAsset.create({
      data: {
        id: visualId,
        projectId: projeto.id,
        sceneNumero: 2,
        tipo: 'mapa',
        titulo: 'Mapa do Brasil',
        periodo: '1900',
        descricao: 'Mapa histórico',
        prompt: 'prompt do mapa',
        imagemPath: visualPath,
      },
    });

    const musicaPath = chaveMusica(projeto.id, 'mp3');
    await storage.put(musicaPath, Buffer.from('musica'));
    await prisma.project.update({ where: { id: projeto.id }, data: { musicaPath } });

    await prisma.tag.createMany({
      data: [
        { projectId: projeto.id, texto: 'animais', ordem: 0 },
        { projectId: projeto.id, texto: 'brasil', ordem: 1 },
      ],
    });
    await prisma.chapter.createMany({
      data: [
        { projectId: projeto.id, tempo: '00:00', titulo: 'Introdução' },
        { projectId: projeto.id, tempo: '00:10', titulo: 'Floresta' },
      ],
    });
    const review = await prisma.editorialReview.create({
      data: {
        projectId: projeto.id,
        classificacao: 'ressalvas',
        resumo: 'Revisão de teste',
      },
    });
    await prisma.editorialIssue.create({
      data: {
        reviewId: review.id,
        projectId: projeto.id,
        cenaNumero: 1,
        tipo: 'fonte',
        trecho: 'Primeira cena',
        problema: 'Sem fonte',
        explicacao: 'Falta citar a fonte.',
        sugestao: 'Inclua a fonte.',
        fonte: 'IBGE',
        confianca: 'media',
        status: 'aceita',
      },
    });

    // ---------- 1. ida e volta ----------
    const zip = await bufferDoArchiver(await exportacao.montarZip(projeto.id));
    const caminhoZip = join(raiz, 'pacote.zip');
    await fs.writeFile(caminhoZip, zip);
    arquivosTemporarios.push(caminhoZip);

    const lidos = await lerArquivosZip(caminhoZip, new Set(['projeto.json', 'titulo.txt']));
    const manifestoTexto = lidos.get('projeto.json')?.toString('utf8') ?? '';
    const manifesto = JSON.parse(manifestoTexto);
    conferir(manifesto.schemaVersion === 1, 'manifesto: schemaVersion');
    conferir(manifesto.app === 'youstudio', 'manifesto: app');
    conferir(manifesto.scenes.length === 2, 'manifesto: 2 cenas');
    conferir(manifesto.scenes[0].audios.length === 2, 'manifesto: versões de áudio');
    conferir(manifesto.thumbnails[0].escolhida === true, 'manifesto: thumbnail escolhida');
    conferir(Boolean(manifesto.musica?.arquivo), 'manifesto: música');
    conferir(Boolean(manifesto.editorial?.issues?.length), 'manifesto: revisão editorial');
    conferir(!('userId' in manifesto.projeto), 'manifesto: sem userId');
    conferir(!('id' in manifesto.projeto), 'manifesto: sem id');

    // ---------- 6. nenhum segredo no ZIP ----------
    const segredos = ['GEMINI_API_KEY', 'FISH_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'AIza', 'gsk_', 'sk-ant-'];
    const nomes = [...(await lerArquivosZip(caminhoZip, new Set(['projeto.json', 'tempos.json', 'titulo.txt', 'tags.txt', 'descricao.txt', 'musica.txt']))).values()].map((b) => b.toString('utf8')).join('\n');
    conferir(segredos.every((s) => !nomes.includes(s)), 'export: nenhum segredo nos textos');
    conferir(manifestoTexto.length > 100, 'export: manifesto presente');

    const importado = await importacao.importar(caminhoZip, 'pacote.zip', zip.length);
    criados.push(importado.projeto.id);
    conferir(importado.projeto.tituloEscolhido === 'Animais que parecem de filme', 'import: título');
    conferir(importado.projeto.etapaAtual === 'video', 'import: etapa');
    conferir(importado.projeto.legendaTamanho === 110, 'import: legenda');
    const projetoImportado = await prisma.project.findUnique({
      where: { id: importado.projeto.id },
    });
    conferir(projetoImportado?.musicaVolume === 35, 'import: volume da música');

    const cenasNovas = await prisma.scene.findMany({
      where: { projectId: importado.projeto.id },
      orderBy: { numero: 'asc' },
    });
    conferir(cenasNovas.length === 2, 'import: 2 cenas');
    conferir(cenasNovas[0].textoNarrado === 'Primeira cena do teste.', 'import: texto da cena');
    conferir(cenasNovas[0].statusNarracao === 'gerado', 'import: status recalculado');
    conferir(cenasNovas[0].audioPath !== aud1, 'import: chave de áudio nova');
    conferir(Boolean(cenasNovas[0].audioPath && (await storage.exists(cenasNovas[0].audioPath))), 'import: áudio gravado');
    conferir(Boolean(cenasNovas[0].imagemPath && (await storage.exists(cenasNovas[0].imagemPath))), 'import: imagem gravada');
    const versoes = await prisma.sceneAudio.count({ where: { sceneId: cenasNovas[0].id } });
    conferir(versoes === 2, 'import: versões de áudio');

    conferir((await prisma.title.count({ where: { projectId: importado.projeto.id } })) === 2, 'import: títulos');
    conferir((await prisma.tag.count({ where: { projectId: importado.projeto.id } })) === 2, 'import: tags');
    conferir((await prisma.chapter.count({ where: { projectId: importado.projeto.id } })) === 2, 'import: capítulos');
    conferir((await prisma.thumbnail.count({ where: { projectId: importado.projeto.id } })) === 1, 'import: thumbnail');
    conferir((await prisma.visualAsset.count({ where: { projectId: importado.projeto.id } })) === 1, 'import: visual');
    const reviewNova = await prisma.editorialReview.findFirst({
      where: { projectId: importado.projeto.id },
      include: { issues: true },
    });
    conferir(reviewNova?.classificacao === 'ressalvas' && reviewNova.issues.length === 1, 'import: revisão editorial');
    const projetoNovo = await prisma.project.findUnique({ where: { id: importado.projeto.id } });
    conferir(Boolean(projetoNovo?.musicaPath && (await storage.exists(projetoNovo.musicaPath))), 'import: música gravada');

    // ---------- 2. zip-slip ----------
    const antes = await prisma.project.count();
    const slip = zipManual([
      { nome: 'projeto.json', dados: JSON.stringify(manifesto) },
      { nome: '../evil.txt', dados: 'x' },
    ]);
    const caminhoSlip = join(raiz, 'slip.zip');
    await fs.writeFile(caminhoSlip, slip);
    await rejeitar(() => importacao.preview(caminhoSlip, 'slip.zip', slip.length), 'zip-slip recusado');
    conferir((await prisma.project.count()) === antes, 'zip-slip não criou projeto');

    // ---------- 3. zip bomba ----------
    const bomba = zipManual([
      { nome: 'projeto.json', dados: '{}' },
      { nome: 'imagens/cena-001.png', dados: Buffer.alloc(20 * 1024 * 1024), comprimir: true },
    ]);
    const caminhoBomba = join(raiz, 'bomba.zip');
    await fs.writeFile(caminhoBomba, bomba);
    await rejeitar(() => importacao.preview(caminhoBomba, 'bomba.zip', bomba.length), 'zip bomba recusado');
    conferir((await prisma.project.count()) === antes, 'zip bomba não criou projeto');

    // ---------- 4. corrompido e manifesto inválido ----------
    const corrompido = Buffer.from('PK\x03\x04isto não é um zip');
    const caminhoCorrompido = join(raiz, 'corrompido.zip');
    await fs.writeFile(caminhoCorrompido, corrompido);
    await rejeitar(
      () => importacao.preview(caminhoCorrompido, 'corrompido.zip', corrompido.length),
      'zip corrompido recusado',
    );
    const invalido = zipManual([
      {
        nome: 'projeto.json',
        dados: JSON.stringify({
          schemaVersion: 1,
          app: 'youstudio',
          exportadoEm: new Date().toISOString(),
          etapaAtual: 'video',
          projeto: {},
          scenes: [{ numero: 'x' }],
        }),
      },
    ]);
    const caminhoInvalido = join(raiz, 'invalido.zip');
    await fs.writeFile(caminhoInvalido, invalido);
    await rejeitar(
      () => importacao.preview(caminhoInvalido, 'invalido.zip', invalido.length),
      'manifesto inválido recusado',
    );
    conferir((await prisma.project.count()) === antes, 'pacotes inválidos não criaram projeto');

    // ---------- 5. pacote antigo, sem projeto.json ----------
    const antigo = zipManual([
      {
        nome: 'tempos.json',
        dados: JSON.stringify([
          {
            cena: 1,
            inicio: '00:00',
            inicioMs: 0,
            duracaoMs: 3000,
            imagem: 'imagens/cena-001.png',
            audio: 'audios/cena-001.wav',
            textoNarrado: 'Cena antiga',
          },
        ]),
      },
      { nome: 'imagens/cena-001.png', dados: 'img-antiga' },
      { nome: 'audios/cena-001.wav', dados: 'audio-antigo' },
      { nome: 'titulo.txt', dados: 'Título antigo' },
      { nome: 'tags.txt', dados: 'a,b' },
      { nome: 'descricao.txt', dados: 'Descrição antiga' },
      { nome: 'thumbnails/thumbnail-1-escolhida.jpg', dados: 'thumb-antiga' },
    ]);
    const caminhoAntigo = join(raiz, 'antigo.zip');
    await fs.writeFile(caminhoAntigo, antigo);
    const previaAntiga = await importacao.preview(caminhoAntigo, 'antigo.zip', antigo.length);
    conferir(previaAntiga.manifesto === false, 'legado: sem manifesto');
    conferir(previaAntiga.avisos.length > 0, 'legado: avisos');
    conferir(previaAntiga.resumo.cenas === 1, 'legado: cena recuperada');
    conferir(previaAntiga.resumo.thumbnails === 1, 'legado: thumbnail recuperada');
    const importadoAntigo = await importacao.importar(caminhoAntigo, 'antigo.zip', antigo.length);
    criados.push(importadoAntigo.projeto.id);
    conferir(importadoAntigo.projeto.tituloEscolhido === 'Título antigo', 'legado: título');
    conferir((await prisma.scene.count({ where: { projectId: importadoAntigo.projeto.id } })) === 1, 'legado: cena');
    conferir((await prisma.tag.count({ where: { projectId: importadoAntigo.projeto.id } })) === 2, 'legado: tags');
  } finally {
    for (const id of criados) {
      await prisma.project.delete({ where: { id } }).catch(() => undefined);
      await storage.removePrefix(`projects/${id}`).catch(() => undefined);
    }
    for (const arq of arquivosTemporarios) await fs.rm(arq, { force: true }).catch(() => undefined);
    await prisma.$disconnect();
    await fs.rm(raiz, { recursive: true, force: true }).catch(() => undefined);
  }

  const total = passos;
  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s) de ${total} verificações:`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`OK: ${total} verificações da importação passaram.`);
}

main().catch((e) => {
  console.error('FALHOU:', e instanceof Error ? e.stack : e);
  process.exit(1);
});
