import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Job, Scene } from '@prisma/client';
import { createHash } from 'crypto';
import { ImagesResponse, ProjectDto, UploadImageInput } from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptImagem, promptVerificacaoImagem, verificacaoImagemGenSchema } from '../ai/prompts';
import { JobsService } from '../jobs/jobs.service';
import { EXT_PARA_MIME, MIME_PARA_EXT, chaveImagem, extDaChave } from '../media/files';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { toSceneDto } from '../scenes/scenes.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const proporcaoDe = (p: ProjectDto): '16:9' | '9:16' => (p.formato === 'shorts' ? '9:16' : '16:9');

@Injectable()
export class ImagesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  onModuleInit() {
    this.jobs.register('imagem', (job: Job) => this.gerarCena(job.alvoId!));
    this.jobs.register('verificacao', (job: Job) => this.verificarProjeto(job.projectId));
  }

  private promptDa(project: ProjectDto, scene: Scene): string {
    return promptImagem({
      descricaoVisual: scene.descricaoVisual,
      textoNarrado: scene.textoNarrado,
      estiloVisual: project.estiloVisual,
      proporcao: proporcaoDe(project),
    });
  }

  async response(projectId: string): Promise<ImagesResponse> {
    const project = await this.projects.get(projectId);
    const rows = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    return {
      estiloVisual: project.estiloVisual,
      proporcao: proporcaoDe(project),
      scenes: rows.map((s) => ({ ...toSceneDto(s), promptImagem: this.promptDa(project, s) })),
      jobs: [
        ...(await this.jobs.listar(projectId, ['imagem'])),
        ...(await this.jobs.listar(projectId, ['verificacao'])),
      ],
    };
  }

  /** Enfileira a conferência visual de todas as cenas (imagem × narração). */
  async verify(projectId: string): Promise<ImagesResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId } });
    if (!cenas.some((c) => c.imagemPath)) {
      throw new BadRequestException('Envie ou gere ao menos uma imagem antes de verificar.');
    }
    await this.jobs.enqueue(projectId, 'verificacao');
    return this.response(projectId);
  }

  /**
   * Executado pela fila: procura imagens repetidas (mesmo arquivo) e compara
   * cada imagem com a narração da cena usando o modelo com visão.
   */
  private async verificarProjeto(projectId: string): Promise<void> {
    const project = await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    const comImagem = cenas.filter((c) => c.imagemPath);
    if (!comImagem.length) return;

    // 1) Imagens idênticas: sinal claro de cena repetida.
    const porHash = new Map<string, { numero: number; hash: string }[]>();
    const dados = new Map<number, Buffer>();
    for (const c of comImagem) {
      const buf = await this.storage.get(c.imagemPath!);
      dados.set(c.numero, buf);
      const hash = createHash('sha256').update(buf).digest('hex');
      const lista = porHash.get(hash) ?? [];
      lista.push({ numero: c.numero, hash });
      porHash.set(hash, lista);
    }
    const repetidas = new Map<number, number[]>();
    for (const lista of porHash.values()) {
      if (lista.length < 2) continue;
      for (const item of lista) {
        repetidas.set(
          item.numero,
          lista.filter((l) => l.numero !== item.numero).map((l) => l.numero),
        );
      }
    }

    // 2) Conferência visual, em lotes pequenos para não estourar a fila da IA.
    const alertas = new Map<number, string>();
    for (const c of comImagem) {
      const buf = dados.get(c.numero)!;
      const mime = EXT_PARA_MIME[extDaChave(c.imagemPath!)] ?? 'image/png';
      const resultado = await this.ai.generateJsonWithImages(
        promptVerificacaoImagem({
          numero: c.numero,
          textoNarrado: c.textoNarrado,
          descricaoVisual: c.descricaoVisual,
          estiloVisual: project.estiloVisual,
        }),
        verificacaoImagemGenSchema,
        [{ data: buf, mime }],
      );
      const partes: string[] = [];
      if (repetidas.has(c.numero)) {
        partes.push(`Imagem idêntica à(s) cena(s) ${repetidas.get(c.numero)!.join(', ')}.`);
      }
      if (!resultado.corresponde || resultado.tipo !== 'ok') {
        partes.push(
          `[${resultado.tipo}] ${resultado.motivo}${resultado.sugestao ? ` Sugestão: ${resultado.sugestao}` : ''}`,
        );
      }
      if (partes.length) alertas.set(c.numero, partes.join(' ').slice(0, 1000));
    }

    await this.prisma.$transaction([
      this.prisma.scene.updateMany({ where: { projectId }, data: { alertaImagem: '' } }),
      ...[...alertas.entries()].map(([numero, alerta]) =>
        this.prisma.scene.updateMany({ where: { projectId, numero }, data: { alertaImagem: alerta } }),
      ),
    ]);
  }

  /**
   * Arquivo .md com o prompt de todas as imagens, na ordem das cenas, para
   * gerar no Google Flow/Nano Banana e salvar cada arquivo com o número da cena.
   * As imagens já geradas entram no documento como prévia (URL absoluta).
   */
  async promptsMarkdown(projectId: string, baseUrl = ''): Promise<{ nome: string; markdown: string }> {
    const project = await this.projects.get(projectId);
    const rows = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    const titulo = project.tituloEscolhido.trim() || 'vídeo sem título';
    const base =
      titulo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .toLowerCase() || 'video';
    const linhas = [
      `# Prompts das imagens — ${titulo}`,
      '',
      `- **Proporção:** ${proporcaoDe(project)}`,
      `- **Cenas:** ${rows.length}`,
      `- **Estilo visual:** ${project.estiloVisual || 'não definido'}`,
      '',
      '## Como usar no Google Flow / Nano Banana',
      '',
      '1. Gere uma imagem por prompt, na ordem das cenas.',
      '2. **Salve o arquivo com o número da cena**, por exemplo `cena-001.png`, `cena-002.png` (mesmo nome usado no ZIP).',
      '3. Volte ao app na etapa 5 (Imagens e storyboard) e envie cada imagem no card da cena correspondente.',
      '4. Use PNG, JPG ou WebP de até 10 MB. O número no nome não é obrigatório, mas evita trocar as imagens na hora de enviar.',
      '',
      '---',
    ];
    if (rows.length === 0) {
      linhas.push('', '_Ainda não há cenas. Gere o roteiro antes de exportar os prompts._');
    }
    for (const cena of rows) {
      const numero = String(cena.numero).padStart(3, '0');
      const bloco = [`## Cena ${cena.numero}`, '', `**Arquivo sugerido:** \`cena-${numero}.png\``];
      if (cena.descricaoVisual.trim()) bloco.push('', `**Descrição visual:** ${cena.descricaoVisual.trim()}`);
      if (cena.imagemPath) {
        const url = `${baseUrl}/scenes/${cena.id}/image?v=${cena.versaoMidia}`;
        bloco.push('', `**Imagem atual:** ${baseUrl ? `![Cena ${cena.numero}](${url})` : `\`${url}\``}`);
      }
      bloco.push('', '**Prompt:**', '', '```text', this.promptDa(project, cena), '```');
      linhas.push('', ...bloco);
    }
    return { nome: `${base}-prompts-imagens.md`, markdown: linhas.join('\n') + '\n' };
  }

  /**
   * Documento enxuto para gerar as imagens fora do app, no formato:
   * cabeçalho com proporção/estilo e blocos de 10 cenas com "Arquivo sugerido"
   * e "Descrição visual" de cada cena.
   */
  async promptImgMarkdown(projectId: string): Promise<{ nome: string; markdown: string }> {
    const project = await this.projects.get(projectId);
    const rows = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    const linhas = [
      'Observação: Criar as imagens e renomear referente a cena que ela pertence.',
      `Proporção: ${proporcaoDe(project)}`,
      `Estilo visual: ${project.estiloVisual.trim() || 'não definido'}`,
    ];
    if (rows.length === 0) {
      linhas.push('', '_Ainda não há cenas. Gere o roteiro antes de exportar os prompts._');
      return { nome: 'prompt-criar_img.md', markdown: linhas.join('\n') + '\n' };
    }

    const TAMANHO_BLOCO = 10;
    for (let inicio = 0; inicio < rows.length; inicio += TAMANHO_BLOCO) {
      const bloco = rows.slice(inicio, inicio + TAMANHO_BLOCO);
      const primeiro = bloco[0].numero;
      const ultimo = bloco[bloco.length - 1].numero;
      linhas.push('', primeiro === ultimo ? `Cena ${primeiro}` : `Cenas ${primeiro} a ${ultimo}`);
      bloco.forEach((cena, i) => {
        if (i > 0) linhas.push('');
        const numero = String(cena.numero).padStart(3, '0');
        linhas.push(
          `Arquivo sugerido: cena-${numero}.png`,
          `Descrição visual: ${cena.descricaoVisual.trim()}`,
        );
      });
    }
    return { nome: 'prompt-criar_img.md', markdown: linhas.join('\n') + '\n' };
  }

  async updateStyle(projectId: string, estiloVisual: string): Promise<ImagesResponse> {
    const antigo = await this.projects.get(projectId);
    if (antigo.estiloVisual !== estiloVisual) {
      await this.projects.update(projectId, { estiloVisual });
      // Imagens já geradas deixam de seguir o guia de estilo atual.
      await this.prisma.scene.updateMany({
        where: { projectId, statusImagem: { in: ['gerado', 'aprovado'] } },
        data: { statusImagem: 'desatualizado' },
      });
    }
    return this.response(projectId);
  }

  async generateAll(projectId: string, todas = false): Promise<ImagesResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId }, orderBy: { numero: 'asc' } });
    if (cenas.length === 0) throw new BadRequestException('Gere o roteiro antes das imagens.');
    const vazias = cenas.filter((c) => !c.descricaoVisual.trim()).map((c) => c.numero);
    if (vazias.length) throw new BadRequestException(`Há cenas sem descrição visual: ${vazias.join(', ')}.`);
    for (const c of cenas) {
      const precisa = !c.imagemPath || c.statusImagem === 'pendente' || c.statusImagem === 'desatualizado';
      if (todas || precisa) await this.jobs.enqueue(projectId, 'imagem', c.id);
    }
    return this.response(projectId);
  }

  private async getScene(sceneId: string): Promise<Scene> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new NotFoundException('Cena não encontrada');
    await this.projects.get(scene.projectId);
    return scene;
  }

  async generateScene(sceneId: string): Promise<ImagesResponse> {
    const scene = await this.getScene(sceneId);
    await this.jobs.enqueue(scene.projectId, 'imagem', scene.id);
    return this.response(scene.projectId);
  }

  private async salvar(scene: Scene, data: Buffer, mime: string): Promise<void> {
    const ext = MIME_PARA_EXT[mime] ?? 'png';
    const chave = chaveImagem(scene.projectId, scene.id, ext);
    await this.storage.put(chave, data, mime);
    if (scene.imagemPath && scene.imagemPath !== chave) {
      await this.storage.remove(scene.imagemPath).catch(() => undefined);
    }
    await this.prisma.scene.update({
      where: { id: scene.id },
      data: { imagemPath: chave, statusImagem: 'gerado', versaoMidia: { increment: 1 }, alertaImagem: '' },
    });
  }

  /** Executado pela fila. */
  private async gerarCena(sceneId: string): Promise<void> {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) return;
    const project = await this.projects.get(scene.projectId);
    if (!scene.descricaoVisual.trim()) throw new Error(`A cena ${scene.numero} não tem descrição visual.`);
    const img = await this.ai.generateImage(this.promptDa(project, scene), proporcaoDe(project));
    await this.salvar(scene, img.data, img.mime);
  }

  async upload(sceneId: string, input: UploadImageInput): Promise<ImagesResponse> {
    const scene = await this.getScene(sceneId);
    const base64 = input.base64.replace(/^data:[^;]+;base64,/, '');
    const data = Buffer.from(base64, 'base64');
    if (data.length === 0) throw new BadRequestException('Imagem inválida.');
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('A imagem passa de 10 MB.');
    await this.salvar(scene, data, input.mime);
    return this.response(scene.projectId);
  }

  async imagem(sceneId: string): Promise<{ data: Buffer; mime: string }> {
    const scene = await this.getScene(sceneId);
    if (!scene.imagemPath) throw new NotFoundException('Esta cena ainda não tem imagem.');
    return {
      data: await this.storage.get(scene.imagemPath),
      mime: EXT_PARA_MIME[extDaChave(scene.imagemPath)] ?? 'image/png',
    };
  }

  async approve(projectId: string): Promise<ImagesResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({ where: { projectId } });
    const pendentes = cenas
      .filter((c) => !c.imagemPath || c.statusImagem === 'pendente' || c.statusImagem === 'desatualizado')
      .map((c) => c.numero);
    if (cenas.length === 0 || pendentes.length) {
      throw new BadRequestException(
        cenas.length === 0
          ? 'Gere o roteiro antes das imagens.'
          : `Falta imagem atualizada nas cenas: ${pendentes.join(', ')}.`,
      );
    }
    await this.prisma.scene.updateMany({ where: { projectId }, data: { statusImagem: 'aprovado' } });
    return this.response(projectId);
  }
}
