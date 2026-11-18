import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateTitleInput, updateTitleSchema } from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { TitlesService } from './titles.service';

@ApiTags('títulos')
@Controller()
export class TitlesController {
  constructor(private readonly titles: TitlesService) {}

  @Get('projects/:id/titles')
  list(@Param('id') id: string) {
    return this.titles.list(id);
  }

  @Post('projects/:id/titles/generate')
  generate(@Param('id') id: string) {
    return this.titles.generate(id);
  }

  @Patch('titles/:titleId')
  update(
    @Param('titleId') titleId: string,
    @Body(new ZodValidationPipe(updateTitleSchema)) body: UpdateTitleInput,
  ) {
    return this.titles.update(titleId, body.texto);
  }

  /** Usa o título/ideia da etapa 1, sem gerar alternativas por IA. */
  @Post('projects/:id/titles/use-ideia')
  usarIdeia(@Param('id') id: string) {
    return this.titles.usarIdeia(id);
  }

  @Post('projects/:id/titles/:titleId/select')
  select(@Param('id') id: string, @Param('titleId') titleId: string) {
    return this.titles.select(id, titleId);
  }
}
