import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProjectsService } from '../projects/projects.service';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller()
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:id/jobs')
  async list(@Param('id') id: string) {
    await this.projects.get(id);
    return this.jobs.listar(id);
  }

  @Post('jobs/:jobId/retry')
  async retry(@Param('jobId') jobId: string) {
    const job = await this.jobs.retry(jobId);
    if (!job) throw new NotFoundException('Job não encontrado');
    return job;
  }
}
