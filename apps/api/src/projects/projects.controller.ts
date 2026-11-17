import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdvanceInput,
  CreateProjectInput,
  UpdateProjectInput,
  advanceSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@yt/shared';
import { ProjectsService } from './projects.service';
import { ZodValidationPipe } from './zod-validation.pipe';

@ApiTags('projetos')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput) {
    return this.projects.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.update(id, body);
  }

  @Post(':id/advance')
  advance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(advanceSchema)) body: AdvanceInput,
  ) {
    return this.projects.advance(id, body.etapa);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.projects.duplicate(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.projects.remove(id);
  }
}
