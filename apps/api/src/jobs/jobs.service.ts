import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobDto, JobStatus, JobTipo } from '@yt/shared';
import { PrismaService } from '../prisma/prisma.service';

type Handler = (job: Job) => Promise<void>;

const MAX_SIMULTANEOS = 2;

export const toJobDto = (j: Job): JobDto => ({
  id: j.id,
  tipo: j.tipo as JobTipo,
  alvoId: j.alvoId,
  status: j.status as JobStatus,
  erro: j.erro,
});

/**
 * Fila de jobs em memória (MVP). O estado de cada job fica no banco, então a tela
 * consegue acompanhar o progresso mesmo depois de fechar e reabrir a aba.
 * Para escalar, troque por BullMQ mantendo esta mesma interface.
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly log = new Logger(JobsService.name);
  private readonly handlers = new Map<string, Handler>();
  private readonly fila: string[] = [];
  private rodando = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Jobs que estavam no ar quando a API foi encerrada não continuam sozinhos.
    await this.prisma.job.updateMany({
      where: { status: { in: ['fila', 'executando'] } },
      data: { status: 'erro', erro: 'Interrompido porque a API foi reiniciada. Tente de novo.' },
    });
    await this.limparOrfaos();
  }

  /** Remove jobs cujo alvo (cena, thumbnail ou exportação) já foi apagado. */
  private async limparOrfaos(): Promise<void> {
    const [cenas, thumbs, exports] = await Promise.all([
      this.prisma.scene.findMany({ select: { id: true } }),
      this.prisma.thumbnail.findMany({ select: { id: true } }),
      this.prisma.export.findMany({ select: { id: true } }),
    ]);
    const grupos: { tipos: JobTipo[]; ids: string[] }[] = [
      { tipos: ['narracao', 'imagem'], ids: cenas.map((s) => s.id) },
      { tipos: ['thumbnail'], ids: thumbs.map((t) => t.id) },
      { tipos: ['render'], ids: exports.map((e) => e.id) },
    ];
    for (const { tipos, ids } of grupos) {
      await this.prisma.job.deleteMany({
        where: {
          tipo: { in: tipos },
          ...(ids.length ? { OR: [{ alvoId: null }, { alvoId: { notIn: ids } }] } : {}),
        },
      });
    }
  }

  register(tipo: JobTipo, handler: Handler) {
    this.handlers.set(tipo, handler);
  }

  async enqueue(projectId: string, tipo: JobTipo, alvoId?: string): Promise<Job> {
    const existente = await this.prisma.job.findFirst({
      where: { projectId, tipo, alvoId: alvoId ?? null, status: { in: ['fila', 'executando'] } },
    });
    if (existente) return existente;

    // Remove registros antigos (concluídos ou com erro) do mesmo alvo.
    await this.prisma.job.deleteMany({
      where: { projectId, tipo, alvoId: alvoId ?? null, status: { in: ['concluido', 'erro'] } },
    });
    const job = await this.prisma.job.create({
      data: { projectId, tipo, alvoId: alvoId ?? null, status: 'fila' },
    });
    this.fila.push(job.id);
    this.bombear();
    return job;
  }

  async retry(jobId: string): Promise<JobDto | null> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return null;
    const novo = await this.enqueue(job.projectId, job.tipo as JobTipo, job.alvoId ?? undefined);
    return toJobDto(novo);
  }

  /** Jobs ainda ativos ou que falharam, para a tela mostrar progresso e erros. */
  async listar(projectId: string, tipos?: JobTipo[]): Promise<JobDto[]> {
    const rows = await this.prisma.job.findMany({
      where: {
        projectId,
        status: { in: ['fila', 'executando', 'erro'] },
        ...(tipos ? { tipo: { in: tipos } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toJobDto);
  }

  private bombear() {
    while (this.rodando < MAX_SIMULTANEOS && this.fila.length > 0) {
      const id = this.fila.shift()!;
      this.rodando++;
      void this.executar(id).finally(() => {
        this.rodando--;
        this.bombear();
      });
    }
  }

  private async executar(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return;
    const handler = this.handlers.get(job.tipo);
    await this.prisma.job.update({
      where: { id },
      data: { status: 'executando', tentativas: { increment: 1 }, erro: null },
    });
    try {
      if (!handler) throw new Error(`Sem executor para o tipo "${job.tipo}"`);
      await handler(job);
      await this.prisma.job.update({ where: { id }, data: { status: 'concluido' } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`Job ${job.tipo} ${job.alvoId ?? ''} falhou: ${msg}`);
      await this.prisma.job
        .update({ where: { id }, data: { status: 'erro', erro: msg.slice(0, 500) } })
        .catch(() => undefined);
    }
  }
}
