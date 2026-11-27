import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Job } from '@prisma/client';
import {
  ClassificacaoEditorial,
  EditorialIssueDto,
  EditorialResponse,
  editorialGenSchema,
} from '@yt/shared';
import { AiService } from '../ai/ai.service';
import { promptEditorial } from '../ai/prompts';
import { toJobDto } from '../jobs/jobs.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

const MAX_ROTEIRO = 30000;

@Injectable()
export class EditorialService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
  ) {}

  onModuleInit() {
    this.jobs.register('editorial', (job: Job) => this.revisar(job.projectId));
  }

  async response(projectId: string): Promise<EditorialResponse> {
    const project = await this.projects.get(projectId);
    const review = await this.prisma.editorialReview.findFirst({
      where: { projectId },
      orderBy: { criadoEm: 'desc' },
    });
    const issues = review
      ? await this.prisma.editorialIssue.findMany({
          where: { reviewId: review.id },
          orderBy: [{ cenaNumero: 'asc' }, { id: 'asc' }],
        })
      : [];
    const dtos: EditorialIssueDto[] = issues.map((i) => ({
      id: i.id,
      cenaNumero: i.cenaNumero,
      tipo: i.tipo as EditorialIssueDto['tipo'],
      trecho: i.trecho,
      problema: i.problema,
      explicacao: i.explicacao,
      sugestao: i.sugestao,
      fonte: i.fonte,
      confianca: i.confianca as EditorialIssueDto['confianca'],
      status: i.status as EditorialIssueDto['status'],
    }));
    void project;
    return {
      revisao: review
        ? {
            classificacao: review.classificacao as ClassificacaoEditorial,
            resumo: review.resumo,
            criadoEm: review.criadoEm.toISOString(),
          }
        : null,
      issues: dtos,
      pendentes: dtos.filter((i) => i.status === 'pendente').length,
      jobs: await this.jobs.listar(projectId, ['editorial']),
    };
  }

  /** Enfileira a revisão do roteiro atual (não bloqueia a resposta HTTP). */
  async review(projectId: string): Promise<EditorialResponse> {
    await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    if (!cenas.length) {
      throw new BadRequestException('Gere o roteiro antes da revisão editorial.');
    }
    await this.jobs.enqueue(projectId, 'editorial');
    return this.response(projectId);
  }

  /** Executado pela fila. Substitui a revisão anterior pela nova. */
  private async revisar(projectId: string): Promise<void> {
    const project = await this.projects.get(projectId);
    const cenas = await this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { numero: 'asc' },
    });
    if (!cenas.length) throw new Error('O projeto não tem cenas para revisar.');

    let usado = 0;
    const recortadas = cenas.map((c) => {
      const texto = c.textoNarrado.trim().slice(0, Math.max(200, MAX_ROTEIRO - usado));
      usado += texto.length;
      return { numero: c.numero, texto, descricaoVisual: c.descricaoVisual.trim().slice(0, 400) };
    });

    const resultado = await this.ai.generateJson(
      promptEditorial({
        titulo: project.tituloEscolhido || project.tema,
        tema: project.tema,
        idioma: project.idioma,
        cenas: recortadas,
      }),
      editorialGenSchema,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.editorialIssue.deleteMany({ where: { projectId } });
      await tx.editorialReview.deleteMany({ where: { projectId } });
      const review = await tx.editorialReview.create({
        data: {
          projectId,
          classificacao: resultado.classificacao,
          resumo: (resultado.resumo ?? '').slice(0, 2000),
        },
      });
      const problemas = resultado.problemas ?? [];
      if (problemas.length) {
        await tx.editorialIssue.createMany({
          data: problemas.slice(0, 60).map((p) => ({
            reviewId: review.id,
            projectId,
            cenaNumero: p.cenaNumero ?? null,
            tipo: p.tipo,
            trecho: (p.trecho ?? '').slice(0, 800),
            problema: (p.problema ?? '').slice(0, 800),
            explicacao: (p.explicacao ?? '').slice(0, 1500),
            sugestao: (p.sugestao ?? '').slice(0, 1500),
            fonte: (p.fonte ?? '').slice(0, 500),
            confianca: p.confianca,
          })),
        });
      }
      await tx.project.update({
        where: { id: projectId },
        data: { editorialStatus: resultado.classificacao },
      });
    });
  }

  private async issue(issueId: string) {
    const issue = await this.prisma.editorialIssue.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Apontamento não encontrado');
    await this.projects.get(issue.projectId);
    return issue;
  }

  /**
   * Aceita a sugestão. Quando o trecho original ainda existe na cena, ele é
   * substituído pelo texto sugerido e a narração/imagem ficam desatualizadas.
   */
  async accept(issueId: string): Promise<{ editorial: EditorialResponse; aplicado: boolean }> {
    const issue = await this.issue(issueId);
    let aplicado = false;

    if (issue.cenaNumero && issue.trecho.trim() && issue.sugestao.trim()) {
      const cena = await this.prisma.scene.findFirst({
        where: { projectId: issue.projectId, numero: issue.cenaNumero },
      });
      if (cena && cena.textoNarrado.includes(issue.trecho)) {
        const novoTexto = cena.textoNarrado.replace(issue.trecho, issue.sugestao).trim();
        await this.prisma.$transaction([
          this.prisma.scene.update({
            where: { id: cena.id },
            data: {
              textoNarrado: novoTexto,
              statusNarracao: cena.audioPath ? 'desatualizado' : 'pendente',
              statusImagem: cena.imagemPath ? 'desatualizado' : 'pendente',
              alertaImagem: '',
            },
          }),
          this.prisma.editorialIssue.update({
            where: { id: issueId },
            data: { status: 'aceita' },
          }),
        ]);
        aplicado = true;
      }
    }
    if (!aplicado) {
      await this.prisma.editorialIssue.update({
        where: { id: issueId },
        data: { status: 'aceita' },
      });
    }
    await this.recalcularStatus(issue.projectId);
    return { editorial: await this.response(issue.projectId), aplicado };
  }

  async reject(issueId: string): Promise<EditorialResponse> {
    const issue = await this.issue(issueId);
    await this.prisma.editorialIssue.update({ where: { id: issueId }, data: { status: 'rejeitada' } });
    await this.recalcularStatus(issue.projectId);
    return this.response(issue.projectId);
  }

  /** Sem pendências o roteiro volta a ser considerado aprovado editorialmente. */
  private async recalcularStatus(projectId: string): Promise<void> {
    const review = await this.prisma.editorialReview.findFirst({
      where: { projectId },
      orderBy: { criadoEm: 'desc' },
    });
    if (!review) return;
    const pendentes = await this.prisma.editorialIssue.count({
      where: { projectId, status: 'pendente' },
    });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { editorialStatus: pendentes === 0 ? 'aprovado' : review.classificacao },
    });
  }
}
